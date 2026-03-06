import { NextResponse } from 'next/server';
import { computeOpportunitiesFromOverviews, fetchCubeOverviews } from '@/lib/metrics/computeMetrics';

export async function GET(request: Request) {
  try {
    const { searchParams, origin } = new URL(request.url);
    const days = Math.max(7, Math.min(90, Number(searchParams.get('days') || '30')));
    const cookie = request.headers.get('cookie') || '';

    const overviews = await fetchCubeOverviews({
      origin,
      days,
      getHeaders: () => (cookie ? { cookie } : undefined),
    });

    return NextResponse.json(computeOpportunitiesFromOverviews(overviews, days));
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) || 'Unknown error' },
      { status: 500 }
    );
  }
}
