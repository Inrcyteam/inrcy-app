import { NextResponse } from "next/server";

import { recordInrSearchEvent, resolvePublishedInrSearchOwner } from "@/lib/inrSearchAnalytics";
import { enforceRateLimit, getClientIp } from "@/lib/rateLimit";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const MAX_BODY_BYTES = 8_192;

function clean(value: unknown, max = 240) {
  return String(value ?? "").trim().slice(0, max);
}

function sameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) {
    return NextResponse.json({ ok: false, error: "Origine refusée." }, { status: 403 });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "Requête trop volumineuse." }, { status: 413 });
  }

  const rawBody = await request.text().catch(() => "");
  if (!rawBody || rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "Requête invalide." }, { status: rawBody.length > MAX_BODY_BYTES ? 413 : 400 });
  }

  let body: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(rawBody);
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide." }, { status: 400 });
  }

  const slug = clean(body.slug, 160);
  const owner = await resolvePublishedInrSearchOwner(slug);
  if (!owner) return NextResponse.json({ ok: false, error: "Page introuvable." }, { status: 404 });

  const ip = getClientIp(request);
  const rateLimited = await enforceRateLimit({
    name: "inr_search_public_tracking",
    identifier: `${ip}:${owner.slug}`,
    limit: 180,
    window: "5 m",
  });
  if (rateLimited) return rateLimited;

  await recordInrSearchEvent(supabaseAdmin, {
    userId: owner.userId,
    slug: owner.slug,
    eventType: body.eventType,
    actionKey: body.actionKey,
    targetUrl: body.targetUrl,
    source: body.source,
    referrer: body.referrer,
    visitorId: body.visitorId,
    pathname: body.pathname,
  });

  return new NextResponse(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
