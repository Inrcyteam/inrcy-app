import { NextResponse } from "next/server";
import { withApi } from "@/lib/observability/withApi";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { requireUser } from "@/lib/requireUser";
import { getDefaultSnapshotDate } from "@/lib/stats/snapshotWindow";
import { buildMetricsSummary } from "@/lib/metrics/summary";
import {
  fetchCubeOverviews,
  computeOpportunitiesFromOverviews,
  toInrstatsSnapshot,
  type CubeKey,
  type Overview,
} from "@/lib/metrics/computeMetrics";

const DAILY_REFRESH_LEASE_SECONDS = 15 * 60;

type ProfileMetrics = {
  lead_conversion_rate: number;
  avg_basket: number;
};

type BulkResponse = {
  period: number;
  overviews: Partial<Record<CubeKey, Overview>>;
  opportunities: ReturnType<typeof toInrstatsSnapshot>;
  profile: ProfileMetrics;
  estimatedByCube: Record<CubeKey, number>;
  meta: {
    source: "api/stats/daily-refresh";
    generatedAt: string;
    snapshotDate: string | null;
    live: boolean;
  };
};

async function fetchProfileMetrics(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
): Promise<ProfileMetrics> {
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("lead_conversion_rate, avg_basket")
    .eq("user_id", userId)
    .maybeSingle();

  const leadConversionRate = Number(profileRow?.lead_conversion_rate ?? 0);
  const avgBasket = Number(profileRow?.avg_basket ?? 0);

  return {
    lead_conversion_rate: Number.isFinite(leadConversionRate) ? leadConversionRate : 0,
    avg_basket: Number.isFinite(avgBasket) ? avgBasket : 0,
  };
}

function buildBulkPayloadFromOverviews(args: {
  period: number;
  overviews: Partial<Record<CubeKey, Overview>>;
  profile: ProfileMetrics;
  snapshotDate: string;
}): BulkResponse {
  const { period, overviews, profile, snapshotDate } = args;
  const opportunities = toInrstatsSnapshot(computeOpportunitiesFromOverviews(overviews, period));
  const leadConversionRate = Number(profile?.lead_conversion_rate ?? 0);
  const avgBasket = Number(profile?.avg_basket ?? 0);
  const estimatedByCube: Record<CubeKey, number> = {
    site_inrcy: Math.round((opportunities.byCube.site_inrcy || 0) * (leadConversionRate / 100) * avgBasket),
    site_web: Math.round((opportunities.byCube.site_web || 0) * (leadConversionRate / 100) * avgBasket),
    gmb: Math.round((opportunities.byCube.gmb || 0) * (leadConversionRate / 100) * avgBasket),
    facebook: Math.round((opportunities.byCube.facebook || 0) * (leadConversionRate / 100) * avgBasket),
    instagram: Math.round((opportunities.byCube.instagram || 0) * (leadConversionRate / 100) * avgBasket),
    linkedin: Math.round((opportunities.byCube.linkedin || 0) * (leadConversionRate / 100) * avgBasket),
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

function devLogDailyRefresh(payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.log("[daily-refresh][dev]", payload);
}

const nowMs = () => (typeof performance !== "undefined" && typeof performance.now === "function"
  ? performance.now()
  : Date.now());

async function handler(req: Request) {
  const totalStarted = nowMs();

  try {
    const { supabase, user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;

    const snapshotDate = getDefaultSnapshotDate();
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

      devLogDailyRefresh({
        userId: user.id,
        action: "run",
        ran: false,
        inProgress,
        snapshotDate,
        timings: {
          total: Math.round(nowMs() - totalStarted),
        },
      });

      return NextResponse.json({
        ok: true,
        ran: false,
        inProgress,
        snapshotDate,
        syncAt: Date.now(),
      });
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
      const headers = () => (cookie ? { cookie } : undefined);
      const profileStarted = nowMs();
      const profilePromise = fetchProfileMetrics(supabase, user.id);
      const monthStarted = nowMs();
      const monthPromise = fetchCubeOverviews({
        origin,
        days: 30,
        getHeaders: headers,
        bypassCache: false,
        supabase,
        userId: user.id,
        snapshotDate,
      });
      const weekStarted = nowMs();
      const weekPromise = fetchCubeOverviews({
        origin,
        days: 7,
        getHeaders: headers,
        bypassCache: false,
        supabase,
        userId: user.id,
        snapshotDate,
      });

      const [profile, monthOverviews, weekOverviews] = await Promise.all([
        profilePromise,
        monthPromise,
        weekPromise,
      ]);

      const generatorStarted = nowMs();
      const generator = await buildMetricsSummary({
        supabase,
        userId: user.id,
        origin,
        getHeaders: headers,
        monthDays: 30,
        weekDays: 7,
        todayDays: 2,
        debug,
        fresh: false,
        snapshotDate,
        profileOverride: profile,
        monthOverviewsOverride: monthOverviews,
        weekOverviewsOverride: weekOverviews,
      });

      const generatorDuration = Math.round(nowMs() - generatorStarted);
      const profileDuration = Math.round(nowMs() - profileStarted);
      const monthDuration = Math.round(nowMs() - monthStarted);
      const weekDuration = Math.round(nowMs() - weekStarted);

      const inrstatsEntries = [
        ["7", buildBulkPayloadFromOverviews({ period: 7, overviews: weekOverviews, profile, snapshotDate })],
        ["30", buildBulkPayloadFromOverviews({ period: 30, overviews: monthOverviews, profile, snapshotDate })],
      ] as const;

      const { error: completeError } = await supabase.rpc("complete_daily_stats_refresh", {
        p_snapshot_date: snapshotDate,
      });

      if (completeError) {
        return jsonUserFacingError(`daily_refresh_complete_failed:${completeError.message}`, { status: 500 });
      }

      await bumpStatsVersion(supabase, user.id);

      devLogDailyRefresh({
        userId: user.id,
        action: "run",
        ran: true,
        snapshotDate,
        timings: {
          profile: profileDuration,
          weekOverviews: weekDuration,
          monthOverviews: monthDuration,
          generator: generatorDuration,
          total: Math.round(nowMs() - totalStarted),
        },
      });

      return NextResponse.json({
        ok: true,
        ran: true,
        inProgress: false,
        snapshotDate,
        syncAt,
        generator,
        inrstats: Object.fromEntries(inrstatsEntries),
      }, {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      });
    } catch (error) {
      await supabase.rpc("release_daily_stats_refresh_claim", {
        p_snapshot_date: snapshotDate,
      }).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    devLogDailyRefresh({
      action: "run",
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      timings: {
        total: Math.round(nowMs() - totalStarted),
      },
    });
    return jsonUserFacingError(error, { status: 500 });
  }
}

export const POST = withApi(handler, { route: "/api/stats/daily-refresh" });
