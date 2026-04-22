import { NextResponse } from "next/server";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { DASHBOARD_CHANNEL_KEYS, isDashboardChannelKey, type DashboardChannelKey } from "@/lib/dashboardChannels";
import { requireUser } from "@/lib/requireUser";
import { getDefaultSnapshotDate } from "@/lib/stats/snapshotWindow";
import { getChannelConnectionStates } from "@/lib/channelConnectionState";
import { buildChannelBlocks, type InrstatsChannelBlock } from "@/lib/inrstats/channelBlocks";
import {
  EMPTY_CUBE_RECORD,
  INCLUDE_BY_CUBE,
  computeOpportunitiesFromOverviews,
  toInrstatsSnapshot,
  type CubeKey,
  type Overview,
} from "@/lib/metrics/computeMetrics";
import { buildStatsOverview } from "@/lib/stats/buildOverview";

type ProfileMetrics = {
  lead_conversion_rate: number;
  avg_basket: number;
};

type ChannelRefreshPeriodPayload = {
  block: InrstatsChannelBlock;
  overview: Overview | null;
  syncedAt: number;
  snapshotDate: string | null;
};

type ChannelRefreshResponse = {
  channel: DashboardChannelKey;
  syncAt: number;
  periods: Record<"7" | "30", ChannelRefreshPeriodPayload>;
  meta: {
    source: "api/stats/channel-refresh";
    generatedAt: string;
    snapshotDate: string | null;
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

async function buildChannelPeriodPayload(args: {
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"];
  userId: string;
  channel: DashboardChannelKey;
  period: 7 | 30;
  snapshotDate: string;
  channelStates: Awaited<ReturnType<typeof getChannelConnectionStates>>;
  profile: ProfileMetrics;
}): Promise<ChannelRefreshPeriodPayload> {
  const { supabase, userId, channel, period, snapshotDate, channelStates, profile } = args;
  const overview = await buildStatsOverview({
    supabase,
    userId,
    days: period,
    includeRaw: INCLUDE_BY_CUBE[channel],
    fresh: true,
    snapshotDate,
  }) as Overview;

  const overviews: Partial<Record<CubeKey, Overview>> = { [channel]: overview };
  const opportunities = toInrstatsSnapshot(computeOpportunitiesFromOverviews(overviews, period));
  const estimatedByCube: Record<CubeKey, number> = {
    ...EMPTY_CUBE_RECORD,
    [channel]: Math.round((opportunities.byCube[channel] || 0) * (profile.lead_conversion_rate / 100) * profile.avg_basket),
  };

  const block = buildChannelBlocks({
    periodDays: period,
    overviews,
    opportunitiesByCube: opportunities.byCube,
    estimatedByCube,
    channelStates,
  })[channel];

  return {
    block,
    overview,
    syncedAt: block.syncAt ?? Date.now(),
    snapshotDate: block.snapshotDate ?? overview?.meta?.snapshotDate ?? snapshotDate ?? null,
  };
}

export async function POST(req: Request) {
  try {
    const { supabase, user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;

    const body = await req.json().catch(() => ({} as { channel?: unknown }));
    const channel = body?.channel;

    if (!isDashboardChannelKey(channel)) {
      return NextResponse.json({
        error: `Canal invalide. Valeurs acceptées : ${DASHBOARD_CHANNEL_KEYS.join(", ")}.`,
      }, { status: 400 });
    }

    const snapshotDate = getDefaultSnapshotDate();
    const [profile, channelStates] = await Promise.all([
      fetchProfileMetrics(supabase, user.id),
      getChannelConnectionStates(supabase, user.id),
    ]);

    const [period7, period30] = await Promise.all([
      buildChannelPeriodPayload({ supabase, userId: user.id, channel, period: 7, snapshotDate, channelStates, profile }),
      buildChannelPeriodPayload({ supabase, userId: user.id, channel, period: 30, snapshotDate, channelStates, profile }),
    ]);

    const syncAt = Date.now();
    const payload: ChannelRefreshResponse = {
      channel,
      syncAt,
      periods: {
        "7": { ...period7, syncedAt: syncAt },
        "30": { ...period30, syncedAt: syncAt },
      },
      meta: {
        source: "api/stats/channel-refresh",
        generatedAt: new Date(syncAt).toISOString(),
        snapshotDate,
      },
    };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    return jsonUserFacingError(error, { status: 500 });
  }
}
