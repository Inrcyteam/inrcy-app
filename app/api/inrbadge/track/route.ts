import { NextResponse } from "next/server";
import { extractInrBadgeUserIdFromSlug } from "@/lib/inrBadge";
import { recordInrBadgeEvent } from "@/lib/inrBadgeAnalytics";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function clean(value: unknown, max = 240) {
  return String(value ?? "").trim().slice(0, max);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const slug = clean(body?.slug, 190);
  const userId = extractInrBadgeUserIdFromSlug(slug);
  if (!userId) return NextResponse.json({ ok: false, error: "Badge introuvable" }, { status: 404 });

  await recordInrBadgeEvent(supabaseAdmin, {
    userId,
    slug,
    eventType: body?.eventType,
    actionKey: body?.actionKey,
    targetUrl: body?.targetUrl,
    source: body?.source,
    referrer: body?.referrer,
    visitorId: body?.visitorId,
    metadata: {
      pathname: clean(body?.pathname, 240),
    },
  });

  return NextResponse.json({ ok: true });
}
