import { NextResponse } from "next/server";

import { bubbleAccessDisabledResponse, isAppBubbleEnabledForUser } from "@/lib/appBubbleAccessServer";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { clearAllToolCaches } from "@/lib/statsCache";
import { asRecord } from "@/lib/tsSafe";
import { TRUSTPILOT_PRODUCT, TRUSTPILOT_PROVIDER, TRUSTPILOT_SOURCE } from "@/lib/trustpilotOAuth";

function normalizeSettingsRoot(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function POST() {
  try {
    const supabase = await createSupabaseServer();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    const user = authData?.user;
    if (authErr || !user) return NextResponse.json({ ok: false, error: "Non authentifié." }, { status: 401 });

    if (!(await isAppBubbleEnabledForUser(supabase, user.id, "trustpilot"))) {
      return bubbleAccessDisabledResponse("Trustpilot");
    }

    await supabaseAdmin
      .from("integrations")
      .update({
        status: "disconnected",
        access_token_enc: null,
        refresh_token_enc: null,
        expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("provider", TRUSTPILOT_PROVIDER)
      .eq("source", TRUSTPILOT_SOURCE)
      .eq("product", TRUSTPILOT_PRODUCT);

    const { data: cfg } = await supabaseAdmin
      .from("pro_tools_configs")
      .select("settings")
      .eq("user_id", user.id)
      .maybeSingle();
    const root = normalizeSettingsRoot(asRecord(cfg).settings);
    const currentTrustpilot = normalizeSettingsRoot(root.trustpilot);
    const nextTrustpilot = {
      ...currentTrustpilot,
      connected: Boolean(currentTrustpilot.businessUnitId || currentTrustpilot.profileUrl || currentTrustpilot.reviewInviteUrl),
      accountConnected: false,
      mode: "manual",
      expiresAt: null,
    };

    await supabaseAdmin
      .from("pro_tools_configs")
      .upsert({ user_id: user.id, settings: { ...root, trustpilot: nextTrustpilot } }, { onConflict: "user_id" });

    await clearAllToolCaches(supabase, user.id);
    return NextResponse.json({ ok: true, trustpilot: nextTrustpilot });
  } catch {
    return NextResponse.json({ ok: false, error: "Déconnexion Trustpilot impossible." }, { status: 400 });
  }
}
