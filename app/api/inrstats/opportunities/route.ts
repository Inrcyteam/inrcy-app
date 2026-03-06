import { NextResponse } from 'next/server';
import { computeOpportunitiesFromOverviews, fetchCubeOverviews, invalidateOverviewCache, toInrstatsSnapshot } from '@/lib/metrics/computeMetrics';

function safeErrorMessage(e: unknown, fallback = 'Unknown error') {
  if (e instanceof Error && typeof e.message === 'string' && e.message.trim()) return e.message;
  const s = String(e ?? '').trim();
  return s || fallback;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const qMode = (url.searchParams.get('mode') || '').toLowerCase();
    const qToday = Number(url.searchParams.get('todayDays') || '0') || 0;
    const qWeek = Number(url.searchParams.get('weekDays') || '0') || 0;
    const qMonth = Number(url.searchParams.get('monthDays') || url.searchParams.get('days') || '0') || 0;

    const todayDays = qToday > 0 ? qToday : qMode === 'generator' ? 2 : 3;
    const weekDays = qWeek > 0 ? qWeek : 7;
    const monthDays = qMonth > 0 ? qMonth : qMode === 'generator' ? 28 : 30;
    const cookie = request.headers.get('cookie') || '';
    const fresh = url.searchParams.get('fresh') === '1';

    if (fresh) invalidateOverviewCache();

    const monthOverviews = await fetchCubeOverviews({
      origin: url.origin,
      days: monthDays,
      getHeaders: () => (cookie ? { cookie } : undefined),
      bypassCache: fresh,
    });

    const monthOpps = computeOpportunitiesFromOverviews(monthOverviews, monthDays);
    const result = toInrstatsSnapshot(monthOpps);

    // Respect explicit windows while keeping the same unique formula source.
    const perDay = monthOpps.total / Math.max(1, monthDays);
    result.today = Math.max(0, Math.round(perDay * todayDays));
    result.week = Math.max(0, Math.round(perDay * weekDays));
    result.month = monthOpps.total;
    result.total = monthOpps.total;

    return NextResponse.json(result);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: 'inrstats_opportunities_failed', message: safeErrorMessage(e) },
      { status: 500 }
    );
  }
}
