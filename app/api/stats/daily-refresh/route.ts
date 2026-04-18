import { NextResponse } from "next/server";
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
const DAILY_PERIODS = [7, 30] as const;

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

async function buildBulkPayload(args: {
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"];
  userId: string;
  origin: string;
  cookie: string;
  period: number;
  snapshotDate: string;
}): Promise<BulkResponse> {
  const { supabase, userId, origin, cookie, period, snapshotDate } = args;

  const overviews = await fetchCubeOverviews({
    origin,
    days: period,
    getHeaders: () => (cookie ? { cookie } : undefined),
    bypassCache: true,
    supabase,
    userId,
    snapshotDate,
  });

  const opportunities = toInrstatsSnapshot(computeOpportunitiesFromOverviews(overviews, period));

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("lead_conversion_rate, avg_basket")
    .eq("user_id", userId)
    .maybeSingle();

  const leadConversionRate = Number(profileRow?.lead_conversion_rate ?? 0);
  const avgBasket = Number(profileRow?.avg_basket ?? 0);
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
    profile: {
      lead_conversion_rate: Number.isFinite(leadConversionRate) ? leadConversionRate : 0,
      avg_basket: Number.isFinite(avgBasket) ? avgBasket : 0,
    },
    estimatedByCube,
    meta: {
      source: "api/stats/daily-refresh",
      generatedAt: new Date().toISOString(),
      snapshotDate: Object.values(overviews).find((overview) => overview?.meta)?.meta?.snapshotDate ?? snapshotDate ?? null,
      live: Boolean(Object.values(overviews).find((overview) => overview?.meta)?.meta?.live ?? false),
    },
  };
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
      const generator = await buildMetricsSummary({
        supabase,
        userId: user.id,
        origin,
        getHeaders: () => (cookie ? { cookie } : undefined),
        monthDays: 30,
        weekDays: 7,
        todayDays: 2,
        debug,
        fresh: true,
        snapshotDate,
      });

      const inrstatsEntries = await Promise.all(
        DAILY_PERIODS.map(async (period) => [String(period), await buildBulkPayload({
          supabase,
          userId: user.id,
          origin,
          cookie,
          period,
          snapshotDate,
        })] as const)
      );

      const { error: completeError } = await supabase.rpc("complete_daily_stats_refresh", {
        p_snapshot_date: snapshotDate,
      });

      if (completeError) {
        return jsonUserFacingError(`daily_refresh_complete_failed:${completeError.message}`, { status: 500 });
      }

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
    return jsonUserFacingError(error, { status: 500 });
  }
}
