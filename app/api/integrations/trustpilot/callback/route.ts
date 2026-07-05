import { NextResponse } from "next/server";

import { isAppBubbleEnabledForUser } from "@/lib/appBubbleAccessServer";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { encryptToken } from "@/lib/oauthCrypto";
import { clearAllToolCaches } from "@/lib/statsCache";
import { withCurrentConnectionVersion } from "@/lib/connectionVersions";
import { safeInternalPath, verifyOAuthState } from "@/lib/security";
import { asRecord, asString } from "@/lib/tsSafe";
import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import { resolveOAuthBoundInrcyAccountId } from "@/lib/multicompte/server";
import {
  buildTrustpilotTokenDates,
  exchangeTrustpilotAuthorizationCode,
  fetchTrustpilotBusinessUnitPublic,
  TRUSTPILOT_PRODUCT,
  TRUSTPILOT_PROVIDER,
  TRUSTPILOT_SOURCE,
} from "@/lib/trustpilotOAuth";

function normalizeSettingsRoot(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function GET(request: Request) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  let returnTo = "/dashboard?panel=trustpilot";

  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const stateRaw = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");
    const oauthErrorDescription = url.searchParams.get("error_description");

    const st = verifyOAuthState(request, "trustpilot", stateRaw);
    returnTo = safeInternalPath(st.returnTo || "/dashboard?panel=trustpilot", "/dashboard?panel=trustpilot");

    const clearStateCookie = (res: NextResponse) => {
      res.cookies.set(st.cookieName, "", {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
      return res;
    };

    const fail = (error: string, message?: string) => {
      const finalUrl = new URL(returnTo, siteUrl);
      finalUrl.searchParams.set("linked", "trustpilot");
      finalUrl.searchParams.set("ok", "0");
      finalUrl.searchParams.set("error", error);
      if (message) {
        finalUrl.searchParams.set(
          "message",
          getSimpleFrenchErrorMessage(message, "La connexion Trustpilot n'a pas pu être finalisée.").slice(0, 200),
        );
      }
      return clearStateCookie(NextResponse.redirect(finalUrl));
    };

    if (!st.ok) {
      return clearStateCookie(
        NextResponse.redirect(new URL("/dashboard?panel=trustpilot&linked=trustpilot&ok=0&error=oauth_state", siteUrl)),
      );
    }

    if (oauthError || !code) {
      return fail(oauthError || "missing_code", oauthErrorDescription || "La connexion Trustpilot a été annulée ou incomplète.");
    }

    const supabase = await createSupabaseServer();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    const user = authData?.user;
    if (authErr || !user) return fail("not_authenticated", "Tu dois être connecté à iNrCy pour connecter Trustpilot.");
    const activeUserId = await resolveOAuthBoundInrcyAccountId(supabase, user.id, st.state.accountId);

    if (!(await isAppBubbleEnabledForUser(supabase, activeUserId, "trustpilot"))) {
      return fail("bubble_access_disabled", "Trustpilot est désactivé dans Bubble Access.");
    }

    const token = await exchangeTrustpilotAuthorizationCode(code, request.url);
    const accessToken = asString(token.access_token) || "";
    if (!accessToken) return fail("missing_access_token", "Trustpilot n'a pas renvoyé de jeton d'accès.");

    const { data: cfg } = await supabaseAdmin
      .from("pro_tools_configs")
      .select("settings")
      .eq("user_id", activeUserId)
      .maybeSingle();
    const root = normalizeSettingsRoot(asRecord(cfg).settings);
    const currentTrustpilot = normalizeSettingsRoot(root.trustpilot);
    const businessUnitId = asString(currentTrustpilot.businessUnitId) || asString(currentTrustpilot.business_unit_id) || "";
    const publicUnit = businessUnitId ? await fetchTrustpilotBusinessUnitPublic(businessUnitId).catch(() => null) : null;
    const dates = buildTrustpilotTokenDates(token);

    const meta = withCurrentConnectionVersion("channel:trustpilot", {
      business_unit_id: businessUnitId || publicUnit?.id || null,
      business_name: publicUnit?.displayName || asString(currentTrustpilot.businessName) || null,
      domain: publicUnit?.domain || asString(currentTrustpilot.domain) || null,
      profile_url: publicUnit?.profileUrl || asString(currentTrustpilot.profileUrl) || null,
      review_invite_url: publicUnit?.evaluateUrl || asString(currentTrustpilot.reviewInviteUrl) || null,
      trust_score: publicUnit?.trustScore ?? null,
      number_of_reviews: publicUnit?.numberOfReviews ?? null,
      stars: publicUnit?.stars ?? null,
    });

    await supabaseAdmin.from("integrations").upsert(
      {
        user_id: activeUserId,
        provider: TRUSTPILOT_PROVIDER,
        category: "reputation",
        source: TRUSTPILOT_SOURCE,
        product: TRUSTPILOT_PRODUCT,
        status: "connected",
        display_name: publicUnit?.displayName || asString(currentTrustpilot.businessName) || "Compte Trustpilot",
        provider_account_id: businessUnitId || publicUnit?.id || null,
        access_token_enc: encryptToken(accessToken),
        refresh_token_enc: token.refresh_token ? encryptToken(token.refresh_token) : null,
        expires_at: dates.expiresAt,
        resource_id: businessUnitId || publicUnit?.id || null,
        resource_label: publicUnit?.displayName || asString(currentTrustpilot.businessName) || null,
        meta,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider,source,product" },
    );

    const nextTrustpilot = {
      ...currentTrustpilot,
      connected: true,
      accountConnected: true,
      mode: "oauth",
      businessName: publicUnit?.displayName || asString(currentTrustpilot.businessName) || "",
      businessUnitId: businessUnitId || publicUnit?.id || asString(currentTrustpilot.businessUnitId) || "",
      domain: publicUnit?.domain || asString(currentTrustpilot.domain) || "",
      profileUrl: publicUnit?.profileUrl || asString(currentTrustpilot.profileUrl) || "",
      reviewInviteUrl: publicUnit?.evaluateUrl || asString(currentTrustpilot.reviewInviteUrl) || "",
      trustScore: publicUnit?.trustScore ?? currentTrustpilot.trustScore ?? null,
      numberOfReviews: publicUnit?.numberOfReviews ?? currentTrustpilot.numberOfReviews ?? null,
      stars: publicUnit?.stars ?? currentTrustpilot.stars ?? null,
      expiresAt: dates.expiresAt,
    };

    await supabaseAdmin
      .from("pro_tools_configs")
      .upsert({ user_id: activeUserId, settings: { ...root, trustpilot: nextTrustpilot } }, { onConflict: "user_id" });

    await clearAllToolCaches(supabase, activeUserId);

    const finalUrl = new URL(returnTo, siteUrl);
    finalUrl.searchParams.set("linked", "trustpilot");
    finalUrl.searchParams.set("ok", "1");
    return clearStateCookie(NextResponse.redirect(finalUrl));
  } catch (error) {
    const finalUrl = new URL(returnTo, siteUrl);
    finalUrl.searchParams.set("linked", "trustpilot");
    finalUrl.searchParams.set("ok", "0");
    finalUrl.searchParams.set("error", "oauth_callback_failed");
    const message = getSimpleFrenchErrorMessage(error, "La connexion Trustpilot n'a pas pu être finalisée.").slice(0, 200);
    if (message) finalUrl.searchParams.set("message", message);
    return NextResponse.redirect(finalUrl);
  }
}
