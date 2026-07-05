import { NextResponse } from "next/server";

import { bubbleAccessDisabledResponse, isAppBubbleEnabledForUser } from "@/lib/appBubbleAccessServer";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getChannelConnectionStates } from "@/lib/channelConnectionState";
import { asRecord, asString } from "@/lib/tsSafe";
import { getTrustpilotIntegration } from "@/lib/trustpilotOAuth";
import { resolveActiveInrcyAccountId } from "@/lib/multicompte/server";

export async function GET() {
  try {
    const supabase = await createSupabaseServer();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    const user = authData?.user;
    if (authErr || !user) return NextResponse.json({ ok: false, error: "Non authentifié." }, { status: 401 });
    const activeUserId = await resolveActiveInrcyAccountId(supabase, user.id);

    if (!(await isAppBubbleEnabledForUser(supabase as any, activeUserId, "trustpilot"))) {
      return bubbleAccessDisabledResponse("Trustpilot");
    }

    const [states, integrationRaw, configRes] = await Promise.all([
      getChannelConnectionStates(supabase as any, activeUserId),
      getTrustpilotIntegration(activeUserId).catch(() => ({})),
      (supabase.from("pro_tools_configs").select("settings").eq("user_id", activeUserId).maybeSingle() as any).catch(() => ({ data: null })),
    ]);
    const integration = asRecord(integrationRaw);
    const meta = asRecord(integration.meta);
    const trustpilotSettings = asRecord(asRecord(asRecord(configRes.data).settings).trustpilot);

    return NextResponse.json({
      ok: true,
      connected: states.trustpilot.connected && !states.trustpilot.requiresUpdate,
      accountConnected: states.trustpilot.accountConnected,
      status: states.trustpilot.connection_status,
      businessUnitId: states.trustpilot.business_unit_id,
      businessName: states.trustpilot.business_name,
      profileUrl: states.trustpilot.profile_url,
      reviewInviteUrl: states.trustpilot.review_invite_url,
      businessUserId: asString(meta.business_user_id) || asString(meta.author_business_user_id) || asString(trustpilotSettings.businessUserId) || asString(trustpilotSettings.authorBusinessUserId) || null,
      trustScore: meta.trust_score ?? null,
      numberOfReviews: meta.number_of_reviews ?? null,
      stars: meta.stars ?? null,
      expiresAt: asString(integration.expires_at) || null,
      mode: asString(asRecord(integration).status) === "connected" ? "oauth" : "manual",
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Statut Trustpilot indisponible." }, { status: 400 });
  }
}
