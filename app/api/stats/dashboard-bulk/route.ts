import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabaseServer';
import {
  fetchCubeOverviews,
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
  meta: {
    source: 'api/stats/dashboard-bulk';
    generatedAt: string;
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
    const cookie = req.headers.get('cookie') || '';

    const overviews = await fetchCubeOverviews({
      origin,
      days: period,
      getHeaders: () => (cookie ? { cookie } : undefined),
      bypassCache: fresh,
    });

    const opportunities = toInrstatsSnapshot(computeOpportunitiesFromOverviews(overviews, period));

    const payload: BulkResponse = {
      period,
      overviews,
      opportunities,
      meta: {
        source: 'api/stats/dashboard-bulk',
        generatedAt: new Date().toISOString(),
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
    return NextResponse.json(
      { error: (e instanceof Error ? e.message : String(e)) || 'Le service est momentanément indisponible.' },
      { status: 500 }
    );
  }
}
