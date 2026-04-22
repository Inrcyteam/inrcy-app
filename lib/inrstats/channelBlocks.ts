import { DASHBOARD_CHANNEL_KEYS, type DashboardChannelKey } from '@/lib/dashboardChannels';
import type { ChannelStates } from '@/lib/channelConnectionState';
import type { CubeKey, Overview } from '@/lib/metrics/computeMetrics';

export type InrstatsOverviewMetaLike = {
  generatedAt?: string;
  snapshotDate?: string | null;
  live?: boolean;
  [key: string]: unknown;
};

export type InrstatsOverviewLike = {
  meta?: InrstatsOverviewMetaLike;
  sources?: Record<string, { metrics?: unknown | null }>;
  [key: string]: unknown;
} | null;

export type InrstatsChannelConnectionSummary = {
  connected: boolean;
  accountConnected: boolean;
  configured: boolean;
  statsConnected: boolean;
  expired: boolean;
  resourceId: string | null;
  resourceLabel: string | null;
  resourceUrl: string | null;
};

export type InrstatsChannelBlock = {
  channel: DashboardChannelKey;
  periodDays: number | null;
  connection: InrstatsChannelConnectionSummary;
  overview: InrstatsOverviewLike;
  opportunities: number;
  estimatedValue: number;
  syncAt: number | null;
  snapshotDate: string | null;
  live: boolean;
  error: string | null;
};

export type InrstatsChannelBlocksByChannel = Record<DashboardChannelKey, InrstatsChannelBlock>;

export function createEmptyChannelConnection(): InrstatsChannelConnectionSummary {
  return {
    connected: false,
    accountConnected: false,
    configured: false,
    statsConnected: false,
    expired: false,
    resourceId: null,
    resourceLabel: null,
    resourceUrl: null,
  };
}

export function createEmptyChannelBlock(channel: DashboardChannelKey): InrstatsChannelBlock {
  return {
    channel,
    periodDays: null,
    connection: createEmptyChannelConnection(),
    overview: null,
    opportunities: 0,
    estimatedValue: 0,
    syncAt: null,
    snapshotDate: null,
    live: false,
    error: null,
  };
}

export function createEmptyChannelBlocks(): InrstatsChannelBlocksByChannel {
  return DASHBOARD_CHANNEL_KEYS.reduce((acc, channel) => {
    acc[channel] = createEmptyChannelBlock(channel);
    return acc;
  }, {} as InrstatsChannelBlocksByChannel);
}

function toSyncAt(overview: Overview | null | undefined): number | null {
  const iso = overview?.meta?.generatedAt;
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function readMetricError(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const maybeError = (value as { error?: unknown }).error;
  return typeof maybeError === 'string' && maybeError.trim() ? maybeError.trim() : null;
}

function getOverviewError(channel: DashboardChannelKey, overview: Overview | null | undefined): string | null {
  const sources = overview?.sources;
  if (!sources || typeof sources !== 'object') return null;

  const sourceKeysByChannel: Record<DashboardChannelKey, string[]> = {
    site_inrcy: ['site_inrcy_ga4', 'site_inrcy_gsc'],
    site_web: ['site_web_ga4', 'site_web_gsc'],
    gmb: ['gmb'],
    facebook: ['facebook'],
    instagram: ['instagram'],
    linkedin: ['linkedin'],
  };

  for (const sourceKey of sourceKeysByChannel[channel]) {
    const sourceNode = sources[sourceKey];
    const error = readMetricError(sourceNode?.metrics);
    if (error) return error;
  }

  return null;
}

function mapChannelConnection(channel: DashboardChannelKey, states: ChannelStates): InrstatsChannelConnectionSummary {
  switch (channel) {
    case 'site_inrcy': {
      const state = states.site_inrcy;
      return {
        connected: state.connected,
        accountConnected: state.connected,
        configured: state.connected,
        statsConnected: state.statsConnected,
        expired: false,
        resourceId: state.url,
        resourceLabel: state.url,
        resourceUrl: state.url,
      };
    }
    case 'site_web': {
      const state = states.site_web;
      return {
        connected: state.connected,
        accountConnected: state.connected,
        configured: state.connected,
        statsConnected: state.statsConnected,
        expired: false,
        resourceId: state.url,
        resourceLabel: state.url,
        resourceUrl: state.url,
      };
    }
    case 'gmb': {
      const state = states.gmb;
      return {
        connected: state.connected,
        accountConnected: state.accountConnected,
        configured: state.configured,
        statsConnected: state.connected,
        expired: state.expired,
        resourceId: state.resource_id,
        resourceLabel: state.resource_label,
        resourceUrl: null,
      };
    }
    case 'facebook': {
      const state = states.facebook;
      return {
        connected: state.connected,
        accountConnected: state.accountConnected,
        configured: state.pageConnected,
        statsConnected: state.connected,
        expired: state.expired,
        resourceId: state.resource_id,
        resourceLabel: state.resource_label,
        resourceUrl: state.page_url,
      };
    }
    case 'instagram': {
      const state = states.instagram;
      return {
        connected: state.connected,
        accountConnected: state.accountConnected,
        configured: state.connected,
        statsConnected: state.connected,
        expired: state.expired,
        resourceId: state.resource_id,
        resourceLabel: state.username,
        resourceUrl: state.profile_url,
      };
    }
    case 'linkedin': {
      const state = states.linkedin;
      return {
        connected: state.connected,
        accountConnected: state.accountConnected,
        configured: state.connected,
        statsConnected: state.connected,
        expired: state.expired,
        resourceId: state.resource_id,
        resourceLabel: state.display_name,
        resourceUrl: state.profile_url,
      };
    }
  }
}

export function buildChannelBlocks(params: {
  periodDays: number;
  overviews: Partial<Record<CubeKey, Overview>>;
  opportunitiesByCube: Record<CubeKey, number>;
  estimatedByCube: Record<CubeKey, number>;
  channelStates: ChannelStates;
}): InrstatsChannelBlocksByChannel {
  const { periodDays, overviews, opportunitiesByCube, estimatedByCube, channelStates } = params;
  const blocks = createEmptyChannelBlocks();

  for (const channel of DASHBOARD_CHANNEL_KEYS) {
    const overview = overviews[channel] ?? null;
    blocks[channel] = {
      channel,
      periodDays,
      connection: mapChannelConnection(channel, channelStates),
      overview,
      opportunities: Math.max(0, Math.round(opportunitiesByCube[channel] || 0)),
      estimatedValue: Math.max(0, Math.round(estimatedByCube[channel] || 0)),
      syncAt: toSyncAt(overview),
      snapshotDate: overview?.meta?.snapshotDate ?? null,
      live: Boolean(overview?.meta?.live),
      error: getOverviewError(channel, overview),
    };
  }

  return blocks;
}
