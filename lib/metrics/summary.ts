import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  EMPTY_CUBE_RECORD,
  computeHistoryFromOverviews,
  computeOpportunitiesFromOverviews,
  fetchCubeOverviews,
  invalidateOverviewCache,
  toInrstatsSnapshot,
  type CubeKey,
} from '@/lib/metrics/computeMetrics';

type AnyRec = Record<string, unknown>;

type ProfileMetrics = {
  lead_conversion_rate: number;
  avg_basket: number;
};

export type MetricsSummary = {
  leads: {
    month: number;
    week: number;
    today: number;
    byTool: Record<CubeKey, number>;
  };
  estimatedValue: number;
  details: {
    opportunities: ReturnType<typeof toInrstatsSnapshot>;
    profile: ProfileMetrics;
  };
  meta: {
    source: 'api/metrics/summary';
    generatedAt: string;
  };
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function pickFirst<T>(...vals: Array<T | null | undefined>): T | null {
  for (const v of vals) if (v !== null && v !== undefined) return v;
  return null;
}

function toNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function safeJsonValue<T>(v: unknown, fallback: T): T {
  return v !== null && v !== undefined ? (v as T) : fallback;
}

async function buildSummaryConnectionsKey(supabase: SupabaseClient, userId: string): Promise<string> {
  const keyParts: string[] = [];

  try {
    const { data: integrations = [] } = await supabase
      .from('integrations')
      .select('provider,source,product,status,resource_id,updated_at,created_at')
      .eq('user_id', userId);
    const rows = Array.isArray(integrations) ? integrations : [];
    for (const row of rows) {
      const rec = asRecord(row);
      const provider = String(rec['provider'] ?? '');
      const source = String(rec['source'] ?? '');
      const product = String(rec['product'] ?? '');
      const status = String(rec['status'] ?? '');
      const resource = String(rec['resource_id'] ?? '');
      const updated = String(rec['updated_at'] ?? rec['created_at'] ?? '');
      if (!provider || !source || !product) continue;
      keyParts.push(`${provider}:${source}:${product}:${status}:${resource}:${updated}`);
    }
  } catch {}

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('inrcy_site_ownership')
      .eq('user_id', userId)
      .maybeSingle();
    keyParts.push(`ownership:${String(asRecord(profile)['inrcy_site_ownership'] ?? 'none')}`);
  } catch {}

  try {
    const { data: siteCfg } = await supabase
      .from('inrcy_site_configs')
      .select('settings')
      .eq('user_id', userId)
      .maybeSingle();
    const settings = asRecord(asRecord(siteCfg)['settings']);
    keyParts.push(`inrcyTrackingEnabled:${Boolean(settings['inrcy_tracking_enabled'] ?? true) ? '1' : '0'}`);
  } catch {}

  return keyParts.join('|') || 'none';
}

async function getProfile(
  supabase: SupabaseClient,
  userId: string,
  debug?: AnyRec
): Promise<ProfileMetrics> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`Supabase profiles error: ${error.message}`);

  const row = (data as unknown) || null;
  if (debug) {
    debug.profiles_found = row ? 1 : 0;
    debug.profile_fields = row ? Object.keys(asRecord(row)) : [];
  }

  const r = asRecord(row);
  return {
    lead_conversion_rate: toNumber(
      pickFirst(r['lead_conversion_rate'], r['tx_conversion'], r['conversion_rate'], r['leadConversionRate']),
      0
    ),
    avg_basket: toNumber(
      pickFirst(r['avg_basket'], r['panier_moyen'], r['average_basket'], r['avgBasket']),
      0
    ),
  };
}

export async function buildMetricsSummary(args: {
  supabase: SupabaseClient;
  userId: string;
  origin: string;
  getHeaders?: () => HeadersInit | undefined;
  monthDays?: number;
  weekDays?: number;
  todayDays?: number;
  debug?: AnyRec;
  fresh?: boolean;
}): Promise<MetricsSummary> {
  const {
    supabase,
    userId,
    origin,
    getHeaders,
    monthDays = 30,
    weekDays = 7,
    todayDays = 2,
    debug,
    fresh = false,
  } = args;

  const safe = async <T,>(key: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (e: unknown) {
      if (debug) {
        const errors = (debug.errors = asRecord(debug.errors));
        errors[String(key)] = e instanceof Error ? e.message : String(e);
      }
      return fallback;
    }
  };

  if (debug) {
    debug.windows = { monthDays, weekDays, todayDays, fresh };
  }

  if (fresh) {
    invalidateOverviewCache();
  }

  const cacheRangeKey = `month=${monthDays}|week=${weekDays}|today=${todayDays}|conn=${await buildSummaryConnectionsKey(supabase, userId)}`;

  if (!fresh) {
    try {
      const nowIso = new Date().toISOString();
      const { data: cacheHit } = await supabase
        .from('stats_cache')
        .select('payload, expires_at')
        .eq('user_id', userId)
        .eq('source', 'metrics_summary')
        .eq('range_key', cacheRangeKey)
        .gt('expires_at', nowIso)
        .order('expires_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const payload = safeJsonValue<MetricsSummary | null>(asRecord(cacheHit)['payload'], null);
      if (payload) return payload;
    } catch {}
  }

  const [profile, monthOverviews, weekOverviews] = await Promise.all([
    safe('profile', () => getProfile(supabase, userId, debug), {
      lead_conversion_rate: 0,
      avg_basket: 0,
    }),
    safe('overviews_30d', () => fetchCubeOverviews({ origin, days: monthDays, getHeaders, bypassCache: fresh, supabase, userId }), {}),
    safe('overviews_7d', () => fetchCubeOverviews({ origin, days: weekDays, getHeaders, bypassCache: fresh, supabase, userId }), {}),
  ]);

  const [oppResolved, history30Resolved, history7Resolved] = await Promise.all([
    safe(
      'opportunities',
      async () => {
        const snapshot = toInrstatsSnapshot(computeOpportunitiesFromOverviews(monthOverviews, monthDays));
        return {
          ...snapshot,
          today: Math.max(0, Math.round((snapshot.total / Math.max(1, monthDays)) * todayDays)),
          week: Math.max(0, Math.round((snapshot.total / Math.max(1, monthDays)) * weekDays)),
          month: snapshot.total,
        };
      },
      {
        baseDays: monthDays,
        today: 0,
        week: 0,
        month: 0,
        total: 0,
        confidence: 'low' as const,
        byCube: { ...EMPTY_CUBE_RECORD },
      }
    ),
    safe(
      'history_30d',
      async () => computeHistoryFromOverviews(monthOverviews, monthDays),
      {
        days: monthDays,
        total: 0,
        perTool: { ...EMPTY_CUBE_RECORD },
        model: 'captured_v2.0',
      }
    ),
    safe(
      'history_7d',
      async () => computeHistoryFromOverviews(weekOverviews, weekDays),
      {
        days: weekDays,
        total: 0,
        perTool: { ...EMPTY_CUBE_RECORD },
        model: 'captured_v2.0',
      }
    ),
  ]);

  const leads = {
    month: Number(history30Resolved.total) || 0,
    week: Number(history7Resolved.total) || 0,
    today: 0,
    byTool: history30Resolved.perTool || { ...EMPTY_CUBE_RECORD },
  };

  const estimatedValue = Math.round(oppResolved.total * (profile.lead_conversion_rate / 100) * profile.avg_basket);

  const payload: MetricsSummary = {
    leads,
    estimatedValue,
    details: {
      opportunities: oppResolved,
      profile,
    },
    meta: {
      source: 'api/metrics/summary',
      generatedAt: new Date().toISOString(),
    },
  };

  try {
    // Keep the shared generator/iNrStats snapshot warm for a short period.
    // Live channel connect/disconnect flows already bypass this cache with fresh=1,
    // so a slightly longer TTL cuts recomputation without making the UI stale.
    const expiresAt = new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString();
    await supabase.from('stats_cache').insert({
      user_id: userId,
      source: 'metrics_summary',
      range_key: cacheRangeKey,
      payload,
      expires_at: expiresAt,
    });
  } catch {}

  return payload;
}
