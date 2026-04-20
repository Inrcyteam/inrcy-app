import { NextResponse } from "next/server";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { requireUser } from "@/lib/requireUser";
import { getDefaultSnapshotDate } from "@/lib/stats/snapshotWindow";
import { buildMetricsSummary } from "@/lib/metrics/summary";
import {
  fetchCubeOverviews,
  computeOpportunitiesFromOverviews,
  invalidateOverviewCache,
  toInrstatsSnapshot,
  type CubeKey,
  type Overview,
} from "@/lib/metrics/computeMetrics";

const DAILY_REFRESH_LEASE_SECONDS = 15 * 60;
type BulkResponse = {
  period: number;
  overviews: Partial<Record<CubeKey, Overview>>;
  opportunities: ReturnType<typeof toInrstatsSnapshot>;
  profile: {
    lead_conversion_rate: number;
    avg_basket: number;
  };
  estimatedByCube: Record<CubeKey, number>;
  meta: {
    source: "api/stats/daily-refresh";
    generatedAt: string;
    snapshotDate: string | null;
    live: boolean;
  };
};

type ProfileMetrics = {
  lead_conversion_rate: number;
  avg_basket: number;
};

function normalizeProfileMetrics(profileRow: { lead_conversion_rate?: unknown; avg_basket?: unknown } | null | undefined): ProfileMetrics {
  const leadConversionRate = Number(profileRow?.lead_conversion_rate ?? 0);
  const avgBasket = Number(profileRow?.avg_basket ?? 0);

  return {
    lead_conversion_rate: Number.isFinite(leadConversionRate) ? leadConversionRate : 0,
    avg_basket: Number.isFinite(avgBasket) ? avgBasket : 0,
  };
}

function buildBulkPayload(args: {
  period: number;
  overviews: Partial<Record<CubeKey, Overview>>;
  profile: ProfileMetrics;
  snapshotDate: string;
}): BulkResponse {
  const { period, overviews, profile, snapshotDate } = args;

  const opportunities = toInrstatsSnapshot(computeOpportunitiesFromOverviews(overviews, period));

  const estimatedByCube: Record<CubeKey, number> = {
    site_inrcy: Math.round((opportunities.byCube.site_inrcy || 0) * (profile.lead_conversion_rate / 100) * profile.avg_basket),
    site_web: Math.round((opportunities.byCube.site_web || 0) * (profile.lead_conversion_rate / 100) * profile.avg_basket),
    gmb: Math.round((opportunities.byCube.gmb || 0) * (profile.lead_conversion_rate / 100) * profile.avg_basket),
    facebook: Math.round((opportunities.byCube.facebook || 0) * (profile.lead_conversion_rate / 100) * profile.avg_basket),
    instagram: Math.round((opportunities.byCube.instagram || 0) * (profile.lead_conversion_rate / 100) * profile.avg_basket),
    linkedin: Math.round((opportunities.byCube.linkedin || 0) * (profile.lead_conversion_rate / 100) * profile.avg_basket),
  };

  return {
    period,
    overviews,
    opportunities,
    profile,
    estimatedByCube,
    meta: {
      source: "api/stats/daily-refresh",
      generatedAt: new Date().toISOString(),
      snapshotDate: Object.values(overviews).find((overview) => overview?.meta)?.meta?.snapshotDate ?? snapshotDate ?? null,
      live: Boolean(Object.values(overviews).find((overview) => overview?.meta)?.meta?.live ?? false),
    },
  };
}

async function buildRefreshPayload(args: {
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"];
  userId: string;
  origin: string;
  cookie: string;
  snapshotDate: string;
  debug: Record<string, unknown>;
}) {
  const { supabase, userId, origin, cookie, snapshotDate, debug } = args;
  const getHeaders = () => (cookie ? { cookie } : undefined);

  invalidateOverviewCache();

  const [{ data: profileRow }, overviews7, overviews30] = await Promise.all([
    supabase
      .from("profiles")
      .select("lead_conversion_rate, avg_basket")
      .eq("user_id", userId)
      .maybeSingle(),
    fetchCubeOverviews({
      origin,
      days: 7,
      getHeaders,
      bypassCache: true,
      supabase,
      userId,
      snapshotDate,
    }),
    fetchCubeOverviews({
      origin,
      days: 30,
      getHeaders,
      bypassCache: true,
      supabase,
      userId,
      snapshotDate,
    }),
  ]);

  const profile = normalizeProfileMetrics(profileRow ?? null);

  const generator = await buildMetricsSummary({
    supabase,
    userId,
    origin,
    getHeaders,
    monthDays: 30,
    weekDays: 7,
    todayDays: 2,
    debug,
    fresh: true,
    snapshotDate,
    precomputedProfile: profile,
    precomputedMonthOverviews: overviews30,
    precomputedWeekOverviews: overviews7,
  });

  return {
    generator,
    inrstats: {
      "7": buildBulkPayload({ period: 7, overviews: overviews7, profile, snapshotDate }),
      "30": buildBulkPayload({ period: 30, overviews: overviews30, profile, snapshotDate }),
    },
  };
}

async function bumpStatsVersion(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
) {
  try {
    await supabase.rpc("bump_profile_version", {
      p_user_id: userId,
      p_column: "stats_version",
    });
  } catch {
    // Best effort only: stats are already refreshed even if realtime broadcast fails.
  }
}

function isLeaseActive(startedAt: string | null | undefined) {
  if (!startedAt) return false;
  const startedMs = Date.parse(startedAt);
  if (!Number.isFinite(startedMs)) return false;
  return Date.now() - startedMs < DAILY_REFRESH_LEASE_SECONDS * 1000;
}

export async function POST(req: Request) {
  try {
    const { supabase, user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;

    const requestBody = await req.json().catch(() => null) as { force?: boolean } | null;
    const force = requestBody?.force === true;
    const snapshotDate = getDefaultSnapshotDate();

    if (!force) {
      const { data: claimed, error: claimError } = await supabase.rpc("claim_daily_stats_refresh", {
        p_snapshot_date: snapshotDate,
        p_lease_seconds: DAILY_REFRESH_LEASE_SECONDS,
      });

      if (claimError) {
        return jsonUserFacingError(`daily_refresh_claim_failed:${claimError.message}`, { status: 500 });
      }

      if (!claimed) {
        const { data: state } = await supabase
          .from("user_daily_stats_refresh")
          .select("last_started_snapshot_date, last_started_at, last_completed_snapshot_date")
          .eq("user_id", user.id)
          .maybeSingle();

        const inProgress =
          state?.last_completed_snapshot_date !== snapshotDate &&
          state?.last_started_snapshot_date === snapshotDate &&
          isLeaseActive(state?.last_started_at);

        return NextResponse.json({
          ok: true,
          ran: false,
          inProgress,
          snapshotDate,
          syncAt: Date.now(),
        });
      }
    }

    const { origin } = new URL(req.url);
    const cookie = req.headers.get("cookie") || "";
    const syncAt = Date.now();
    const debug = {
      ok: false,
      errors: {},
      env: {
        has_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      },
    };

    try {
      const { generator, inrstats } = await buildRefreshPayload({
        supabase,
        userId: user.id,
        origin,
        cookie,
        snapshotDate,
        debug,
      });

      const { error: completeError } = await supabase.rpc("complete_daily_stats_refresh", {
        p_snapshot_date: snapshotDate,
      });

      if (completeError) {
        return jsonUserFacingError(`daily_refresh_complete_failed:${completeError.message}`, { status: 500 });
      }

      await bumpStatsVersion(supabase, user.id);

      return NextResponse.json({
        ok: true,
        ran: true,
        inProgress: false,
        snapshotDate,
        syncAt,
        generator,
        inrstats,
      }, {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      });
    } catch (error) {
      if (!force) {
        await supabase.rpc("release_daily_stats_refresh_claim", {
          p_snapshot_date: snapshotDate,
        }).catch(() => undefined);
      }
      throw error;
    }
  } catch (error) {
    return jsonUserFacingError(error, { status: 500 });
  }
}
