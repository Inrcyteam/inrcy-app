import { NextResponse } from "next/server";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { requireUser } from "@/lib/requireUser";
import { getDefaultSnapshotDate } from "@/lib/stats/snapshotWindow";
import { buildMetricsSummary } from "@/lib/metrics/summary";
import { getChannelConnectionStates, type ChannelStates } from "@/lib/channelConnectionState";
import {
  fetchCubeOverviews,
  computeOpportunitiesFromOverviews,
  toInrstatsSnapshot,
  type CubeKey,
  type Overview,
} from "@/lib/metrics/computeMetrics";

const DAILY_REFRESH_LEASE_SECONDS = 15 * 60;

const DAILY_REFRESH_REASONS = new Set(["first_open", "channel_change", "account_change", "manual"] as const);
type DailyRefreshReason = "first_open" | "channel_change" | "account_change" | "manual";

function normalizeDailyRefreshReason(value: unknown): DailyRefreshReason {
  return typeof value === "string" && DAILY_REFRESH_REASONS.has(value as DailyRefreshReason)
    ? (value as DailyRefreshReason)
    : "first_open";
}

type ProfileMetrics = {
  lead_conversion_rate: number;
  avg_basket: number;
};

type DailyRefreshTimingKey = "profile" | "channelStates" | "monthOverviews" | "weekOverviews" | "generator" | "total";
type DailyRefreshTimings = Partial<Record<DailyRefreshTimingKey, number>>;

const DEV_DAILY_REFRESH_TIMINGS = process.env.NODE_ENV !== "production";

function createDevTimingCollector() {
  const timings: DailyRefreshTimings = {};

  return {
    timings,
    async measure<T>(label: Exclude<DailyRefreshTimingKey, "total">, run: () => Promise<T>): Promise<T> {
      const startedAt = Date.now();
      try {
        return await run();
      } finally {
        if (DEV_DAILY_REFRESH_TIMINGS) {
          timings[label] = Date.now() - startedAt;
        }
      }
    },
    finalize(startedAt: number) {
      if (DEV_DAILY_REFRESH_TIMINGS) {
        timings.total = Date.now() - startedAt;
      }
      return DEV_DAILY_REFRESH_TIMINGS ? timings : undefined;
    },
    flush(context: { userId: string; reason: DailyRefreshReason; force: boolean; ran: boolean; snapshotDate: string }) {
      if (!DEV_DAILY_REFRESH_TIMINGS) return;
      console.info("[daily-refresh][dev]", {
        userId: context.userId,
        reason: context.reason,
        force: context.force,
        ran: context.ran,
        snapshotDate: context.snapshotDate,
        timings,
      });
    },
  };
}

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

async function fetchChannelStates(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
): Promise<ChannelStates | undefined> {
  try {
    return await getChannelConnectionStates(supabase, userId);
  } catch {
    return undefined;
  }
}

export async function POST(req: Request) {
  try {
    const requestBody = await req.json().catch(() => null);
    const reason = normalizeDailyRefreshReason(requestBody && typeof requestBody === "object" ? (requestBody as { reason?: unknown }).reason : undefined);
    const force = Boolean(requestBody && typeof requestBody === "object" ? (requestBody as { force?: unknown }).force : false);

    const { supabase, user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;

    const snapshotDate = getDefaultSnapshotDate();
    const routeStartedAt = Date.now();
    const timer = createDevTimingCollector();
    let claimed = false;

    if (!force) {
      const claimResult = await supabase.rpc("claim_daily_stats_refresh", {
        p_snapshot_date: snapshotDate,
        p_lease_seconds: DAILY_REFRESH_LEASE_SECONDS,
      });

      if (claimResult.error) {
        return jsonUserFacingError(`daily_refresh_claim_failed:${claimResult.error.message}`, { status: 500 });
      }

      claimed = Boolean(claimResult.data);

      if (!claimed) {
        const [{ data: state }, channelStates] = await Promise.all([
          supabase
            .from("user_daily_stats_refresh")
            .select("last_started_snapshot_date, last_started_at, last_completed_snapshot_date")
            .eq("user_id", user.id)
            .maybeSingle(),
          timer.measure("channelStates", () => fetchChannelStates(supabase, user.id)),
        ]);

        const inProgress =
          state?.last_completed_snapshot_date !== snapshotDate &&
          state?.last_started_snapshot_date === snapshotDate &&
          isLeaseActive(state?.last_started_at);

        const timings = timer.finalize(routeStartedAt);
        timer.flush({ userId: user.id, reason, force, ran: false, snapshotDate });

        return NextResponse.json({
          ok: true,
          ran: false,
          inProgress,
          snapshotDate,
          syncAt: Date.now(),
          requestedReason: reason,
          forced: force,
          channelStates,
          timings,
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
      const headers = () => (cookie ? { cookie } : undefined);
      const [profile, monthOverviews, weekOverviews, channelStates] = await Promise.all([
        timer.measure("profile", () => fetchProfileMetrics(supabase, user.id)),
        timer.measure("monthOverviews", () => fetchCubeOverviews({
          origin,
          days: 30,
          getHeaders: headers,
          bypassCache: true,
          supabase,
          userId: user.id,
          snapshotDate,
        })),
        timer.measure("weekOverviews", () => fetchCubeOverviews({
          origin,
          days: 7,
          getHeaders: headers,
          bypassCache: true,
          supabase,
          userId: user.id,
          snapshotDate,
        })),
        timer.measure("channelStates", () => fetchChannelStates(supabase, user.id)),
      ]);

      const generator = await timer.measure("generator", () => buildMetricsSummary({
        supabase,
        userId: user.id,
        origin,
        getHeaders: headers,
        monthDays: 30,
        weekDays: 7,
        todayDays: 2,
        debug,
        fresh: true,
        snapshotDate,
        profileOverride: profile,
        monthOverviewsOverride: monthOverviews,
        weekOverviewsOverride: weekOverviews,
      }));

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

      const timings = timer.finalize(routeStartedAt);
      timer.flush({ userId: user.id, reason, force, ran: true, snapshotDate });

      return NextResponse.json({
        ok: true,
        ran: true,
        inProgress: false,
        snapshotDate,
        syncAt,
        requestedReason: reason,
        forced: force,
        generator,
        inrstats: Object.fromEntries(inrstatsEntries),
        channelStates,
        timings,
      }, {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      });
    } catch (error) {
      if (!force && claimed) {
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
