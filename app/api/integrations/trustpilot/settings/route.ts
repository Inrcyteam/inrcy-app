import { NextResponse } from "next/server";

import { bubbleAccessDisabledResponse, isAppBubbleEnabledForUser } from "@/lib/appBubbleAccessServer";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { clearAllToolCaches } from "@/lib/statsCache";
import { asRecord, asString } from "@/lib/tsSafe";
import { fetchTrustpilotBusinessUnitPublic } from "@/lib/trustpilotOAuth";

function normalizeSettingsRoot(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function clean(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max).trim();
}

function configured(settings: Record<string, unknown>) {
  return Boolean(
    clean(settings.businessUnitId || settings.business_unit_id) ||
      clean(settings.profileUrl || settings.url) ||
      clean(settings.reviewInviteUrl || settings.inviteUrl),
  );
}

export async function GET() {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;
  if (!(await isAppBubbleEnabledForUser(supabase, user.id, "trustpilot"))) {
    return bubbleAccessDisabledResponse("Trustpilot");
  }

  const { data, error } = await supabase
    .from("pro_tools_configs")
    .select("settings")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "Réglages Trustpilot indisponibles." }, { status: 400 });

  const root = asRecord(asRecord(data).settings);
  const trustpilot = asRecord(root.trustpilot);
  return NextResponse.json({ ok: true, trustpilot });
}

export async function POST(request: Request) {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;
  if (!(await isAppBubbleEnabledForUser(supabase, user.id, "trustpilot"))) {
    return bubbleAccessDisabledResponse("Trustpilot");
  }

  try {
    const payload = asRecord(await request.json().catch(() => ({})));
    const { data, error: readError } = await supabase
      .from("pro_tools_configs")
      .select("settings")
      .eq("user_id", user.id)
      .maybeSingle();
    if (readError) throw readError;

    const root = normalizeSettingsRoot(asRecord(data).settings);
    const current = normalizeSettingsRoot(root.trustpilot);
    const businessUnitId = clean(payload.businessUnitId || payload.business_unit_id, 120);
    const publicUnit = businessUnitId ? await fetchTrustpilotBusinessUnitPublic(businessUnitId).catch(() => null) : null;

    const nextTrustpilot: Record<string, unknown> = {
      ...current,
      connected: false,
      businessName: clean(payload.businessName || payload.name, 160) || publicUnit?.displayName || asString(current.businessName) || "",
      businessUnitId: businessUnitId || asString(current.businessUnitId) || "",
      domain: clean(payload.domain, 160) || publicUnit?.domain || asString(current.domain) || "",
      profileUrl: clean(payload.profileUrl || payload.url, 500) || publicUnit?.profileUrl || asString(current.profileUrl) || "",
      reviewInviteUrl: clean(payload.reviewInviteUrl || payload.inviteUrl, 500) || publicUnit?.evaluateUrl || asString(current.reviewInviteUrl) || "",
      businessUserId: clean(payload.businessUserId || payload.authorBusinessUserId, 160) || asString(current.businessUserId) || asString(current.authorBusinessUserId) || "",
      autoReplyDrafts: payload.autoReplyDrafts !== false,
      askReviewAfterInvoice: payload.askReviewAfterInvoice !== false,
      trustScore: publicUnit?.trustScore ?? payload.trustScore ?? current.trustScore ?? null,
      numberOfReviews: publicUnit?.numberOfReviews ?? payload.numberOfReviews ?? current.numberOfReviews ?? null,
      stars: publicUnit?.stars ?? payload.stars ?? current.stars ?? null,
    };
    nextTrustpilot.connected = Boolean(current.accountConnected || current.connected || configured(nextTrustpilot));

    await supabaseAdmin
      .from("pro_tools_configs")
      .upsert({ user_id: user.id, settings: { ...root, trustpilot: nextTrustpilot } }, { onConflict: "user_id" });

    await clearAllToolCaches(supabase, user.id);
    return NextResponse.json({ ok: true, trustpilot: nextTrustpilot });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Enregistrement Trustpilot impossible.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
