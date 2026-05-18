import { NextResponse } from 'next/server';
import { jsonUserFacingError } from '@/lib/apiUserFacingErrors';
import { createSupabaseServer } from '@/lib/supabaseServer';
import { getChannelConnectionStates } from '@/lib/channelConnectionState';
import { buildStatsConnectionSignature } from '@/lib/stats/connectionSignature';
import { applyLinkedInFallbackToStatsRecords, readLastGoodLinkedInGeneratorBlock } from '@/lib/linkedinStatsFallback';
import { buildChannelBlocks, type InrstatsChannelBlocksByChannel } from '@/lib/inrstats/channelBlocks';
import {
  EMPTY_CUBE_RECORD,
  fetchCubeOverviews,
  computeHistoryFromOverviews,
  computeOpportunitiesFromOverviews,
  toInrstatsSnapshot,
  type CubeKey,
  type Overview,
} from '@/lib/metrics/computeMetrics';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

type BulkResponse = {
  period: number;
  overviews: Partial<Record<CubeKey, Overview>>;
  opportunities: ReturnType<typeof toInrstatsSnapshot>;
  profile: {
    lead_conversion_rate: number;
    avg_basket: number;
  };
  estimatedByCube: Record<CubeKey, number>;
  capturedLeadsByCube: {
    week: Record<CubeKey, number>;
    month: Record<CubeKey, number>;
  };
  blocks: InrstatsChannelBlocksByChannel;
  meta: {
    source: 'api/stats/dashboard-bulk';
    generatedAt: string;
    snapshotDate: string | null;
    live: boolean;
  };
};

export async function GET(req: Request) {
  try {
    if (!SUPABASE_URL) {
      return NextResponse.json({ error: 'Configuration serveur incomplète.' }, { status: 500 });
    }

    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
    }

    const { searchParams, origin } = new URL(req.url);
    const period = Math.max(1, Number(searchParams.get('days') || 30));
    const fresh = searchParams.get('fresh') === '1';
    const snapshotDate = (searchParams.get('snapshotDate') || '').trim() || null;
    const cookie = req.headers.get('cookie') || '';

    const overviews = await fetchCubeOverviews({
      origin,
      days: period,
      getHeaders: () => (cookie ? { cookie } : undefined),
      bypassCache: fresh,
      supabase,
      userId: user.id,
      snapshotDate,
    });

    const opportunities = toInrstatsSnapshot(computeOpportunitiesFromOverviews(overviews, period));

    const [capturedWeekOverviews, capturedMonthOverviews] = await Promise.all([
      period === 7
        ? Promise.resolve(overviews)
        : fetchCubeOverviews({
            origin,
            days: 7,
            getHeaders: () => (cookie ? { cookie } : undefined),
            bypassCache: fresh,
            supabase,
            userId: user.id,
            snapshotDate,
          }),
      period === 30
        ? Promise.resolve(overviews)
        : fetchCubeOverviews({
            origin,
            days: 30,
            getHeaders: () => (cookie ? { cookie } : undefined),
            bypassCache: fresh,
            supabase,
            userId: user.id,
            snapshotDate,
          }),
    ]);

    const capturedLeadsByCube = {
      week: { ...EMPTY_CUBE_RECORD, ...(computeHistoryFromOverviews(capturedWeekOverviews, 7).perTool || {}) },
      month: { ...EMPTY_CUBE_RECORD, ...(computeHistoryFromOverviews(capturedMonthOverviews, 30).perTool || {}) },
    };

    const { data: profileRow } = await supabase
      .from('profiles')
      .select('lead_conversion_rate, avg_basket')
      .eq('user_id', user.id)
      .maybeSingle();

    const [channelStates, connectionSignature] = await Promise.all([
      getChannelConnectionStates(supabase, user.id),
      buildStatsConnectionSignature(supabase, user.id),
    ]);

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

    const linkedInFallback = await readLastGoodLinkedInGeneratorBlock({
      supabase,
      userId: user.id,
      connectionSignature,
    });
    const linkedInPreserved = applyLinkedInFallbackToStatsRecords({
      overviews,
      opportunities,
      capturedLeadsByCube,
      estimatedByCube,
      statsConnected: Boolean(channelStates.linkedin.connected && !channelStates.linkedin.requiresUpdate),
      fallback: linkedInFallback,
      leadConversionRate,
      avgBasket,
    });

    const blocks = buildChannelBlocks({
      periodDays: period,
      overviews,
      opportunitiesByCube: opportunities.byCube,
      capturedLeadsByCube,
      estimatedByCube,
      channelStates,
      preservedChannels: linkedInPreserved ? { linkedin: true } : undefined,
    });

    const payload: BulkResponse = {
      period,
      overviews,
      opportunities,
      profile: {
        lead_conversion_rate: Number.isFinite(leadConversionRate) ? leadConversionRate : 0,
        avg_basket: Number.isFinite(avgBasket) ? avgBasket : 0,
      },
      estimatedByCube,
      capturedLeadsByCube,
      blocks,
      meta: {
        source: 'api/stats/dashboard-bulk',
        generatedAt: new Date().toISOString(),
        snapshotDate: Object.values(overviews).find((overview) => overview?.meta)?.meta?.snapshotDate ?? snapshotDate ?? null,
        live: Boolean(Object.values(overviews).find((overview) => overview?.meta)?.meta?.live ?? fresh),
      },
    };

    return NextResponse.json(payload, {
      headers: fresh
        ? {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
          }
        : undefined,
    });
  } catch (e) {
    return jsonUserFacingError(e, { status: 500 });
  }
}
