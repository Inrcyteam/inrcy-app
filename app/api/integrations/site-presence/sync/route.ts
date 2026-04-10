import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';
import { syncSitePresenceIntegrations } from '@/lib/sitePresenceSync';

export async function POST() {
  try {
    const { user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;
    const rows = await syncSitePresenceIntegrations(user.id);
    return NextResponse.json({ ok: true, rows });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Impossible de synchroniser les sites.' }, { status: 500 });
  }
}
