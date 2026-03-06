import { NextResponse } from 'next/server';
import { computeHistoryFromOverviews, fetchCubeOverviews } from '@/lib/metrics/computeMetrics';

export async function GET(request: Request) {
  try {
    const { searchParams, origin } = new URL(request.url);
    const raw = Number(searchParams.get('days') || '30');
    const days = raw === 7 || raw === 30 || raw === 60 || raw === 90 ? raw : 30;
    const cookie = request.headers.get('cookie') || '';

    const overviews = await fetchCubeOverviews({
      origin,
      days,
      getHeaders: () => (cookie ? { cookie } : undefined),
    });

    return NextResponse.json(computeHistoryFromOverviews(overviews, days));
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) || 'Unknown error' },
      { status: 500 }
    );
  }
}
