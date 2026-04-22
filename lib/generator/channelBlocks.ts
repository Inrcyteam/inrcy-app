import { DASHBOARD_CHANNEL_KEYS, type DashboardChannelKey } from '@/lib/dashboardChannels';
import type { CubeKey, InrstatsOpportunitiesSnapshot } from '@/lib/metrics/computeMetrics';

export type GeneratorChannelLeads = {
  today: number;
  week: number;
  month: number;
};

export type GeneratorChannelOpportunities = {
  month: number;
};

export type GeneratorChannelBlock = {
  channel: DashboardChannelKey;
  leads: GeneratorChannelLeads;
  opportunities: GeneratorChannelOpportunities;
  estimatedValue: number;
  syncAt: number | null;
  snapshotDate: string | null;
  live: boolean;
  error: string | null;
};

export type GeneratorChannelBlocksByChannel = Record<DashboardChannelKey, GeneratorChannelBlock>;

export function createEmptyGeneratorChannelBlock(channel: DashboardChannelKey): GeneratorChannelBlock {
  return {
    channel,
    leads: {
      today: 0,
      week: 0,
      month: 0,
    },
    opportunities: {
      month: 0,
    },
    estimatedValue: 0,
    syncAt: null,
    snapshotDate: null,
    live: false,
    error: null,
  };
}

export function createEmptyGeneratorChannelBlocks(): GeneratorChannelBlocksByChannel {
  return DASHBOARD_CHANNEL_KEYS.reduce((acc, channel) => {
    acc[channel] = createEmptyGeneratorChannelBlock(channel);
    return acc;
  }, {} as GeneratorChannelBlocksByChannel);
}

function createEmptyCubeNumberRecord(): Record<CubeKey, number> {
  return DASHBOARD_CHANNEL_KEYS.reduce((acc, channel) => {
    acc[channel as CubeKey] = 0;
    return acc;
  }, {} as Record<CubeKey, number>);
}

export function summarizeGeneratorChannelBlocks(params: {
  blocks?: Partial<Record<DashboardChannelKey, GeneratorChannelBlock | null | undefined>> | null;
  monthDays?: number;
  weekDays?: number;
  todayDays?: number;
}) {
  const { blocks, monthDays = 30, weekDays = 7, todayDays = 2 } = params;

  const byTool = createEmptyCubeNumberRecord();
  const opportunitiesByCube = createEmptyCubeNumberRecord();

  let monthLeads = 0;
  let weekLeads = 0;
  let todayLeads = 0;
  let estimatedValue = 0;
  let opportunitiesTotal = 0;

  for (const channel of DASHBOARD_CHANNEL_KEYS) {
    const block = blocks?.[channel] ?? null;
    const month = Math.max(0, Math.round(Number(block?.leads?.month ?? 0)));
    const week = Math.max(0, Math.round(Number(block?.leads?.week ?? 0)));
    const today = Math.max(0, Math.round(Number(block?.leads?.today ?? 0)));
    const opportunitiesMonth = Math.max(0, Math.round(Number(block?.opportunities?.month ?? 0)));
    const estimated = Math.max(0, Math.round(Number(block?.estimatedValue ?? 0)));

    byTool[channel as CubeKey] = month;
    opportunitiesByCube[channel as CubeKey] = opportunitiesMonth;

    monthLeads += month;
    weekLeads += week;
    todayLeads += today;
    estimatedValue += estimated;
    opportunitiesTotal += opportunitiesMonth;
  }

  const safeBaseDays = Math.max(1, Math.round(Number(monthDays) || 30));
  const safeWeekDays = Math.max(1, Math.round(Number(weekDays) || 7));
  const safeTodayDays = Math.max(1, Math.round(Number(todayDays) || 2));
  const confidence: InrstatsOpportunitiesSnapshot['confidence'] = opportunitiesTotal >= 30 ? 'high' : opportunitiesTotal >= 10 ? 'medium' : 'low';

  return {
    leads: {
      month: monthLeads,
      week: weekLeads,
      today: todayLeads,
      byTool,
    },
    opportunities: {
      baseDays: safeBaseDays,
      today: Math.max(0, Math.round((opportunitiesTotal / safeBaseDays) * safeTodayDays)),
      week: Math.max(0, Math.round((opportunitiesTotal / safeBaseDays) * safeWeekDays)),
      month: opportunitiesTotal,
      total: opportunitiesTotal,
      byCube: opportunitiesByCube,
      confidence,
    },
    estimatedValue,
  };
}

export function buildGeneratorChannelBlocks(params: {
  monthLeadsByCube: Record<CubeKey, number>;
  weekLeadsByCube: Record<CubeKey, number>;
  opportunitiesByCube: Record<CubeKey, number>;
  leadConversionRate: number;
  avgBasket: number;
  generatedAt?: string | null;
  snapshotDate?: string | null;
  live?: boolean;
}): GeneratorChannelBlocksByChannel {
  const {
    monthLeadsByCube,
    weekLeadsByCube,
    opportunitiesByCube,
    leadConversionRate,
    avgBasket,
    generatedAt,
    snapshotDate,
    live = false,
  } = params;

  const syncAt = typeof generatedAt === 'string' ? Date.parse(generatedAt) : Number.NaN;
  const normalizedSyncAt = Number.isFinite(syncAt) ? syncAt : null;
  const safeLeadRate = Number.isFinite(Number(leadConversionRate)) ? Number(leadConversionRate) : 0;
  const safeAvgBasket = Number.isFinite(Number(avgBasket)) ? Number(avgBasket) : 0;

  return DASHBOARD_CHANNEL_KEYS.reduce((acc, channel) => {
    const opportunitiesMonth = Math.max(0, Math.round(Number(opportunitiesByCube[channel] ?? 0)));
    acc[channel] = {
      channel,
      leads: {
        today: 0,
        week: Math.max(0, Math.round(Number(weekLeadsByCube[channel] ?? 0))),
        month: Math.max(0, Math.round(Number(monthLeadsByCube[channel] ?? 0))),
      },
      opportunities: {
        month: opportunitiesMonth,
      },
      estimatedValue: Math.max(0, Math.round(opportunitiesMonth * (safeLeadRate / 100) * safeAvgBasket)),
      syncAt: normalizedSyncAt,
      snapshotDate: snapshotDate ?? null,
      live: Boolean(live),
      error: null,
    };
    return acc;
  }, createEmptyGeneratorChannelBlocks());
}
