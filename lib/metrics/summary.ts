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

  const [profile, monthOverviews, weekOverviews] = await Promise.all([
    safe('profile', () => getProfile(supabase, userId, debug), {
      lead_conversion_rate: 0,
      avg_basket: 0,
    }),
    safe('overviews_30d', () => fetchCubeOverviews({ origin, days: monthDays, getHeaders, bypassCache: fresh }), {}),
    safe('overviews_7d', () => fetchCubeOverviews({ origin, days: weekDays, getHeaders, bypassCache: fresh }), {}),
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

  const estimatedValue = Math.round(leads.month * (profile.lead_conversion_rate / 100) * profile.avg_basket);

  return {
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
}
