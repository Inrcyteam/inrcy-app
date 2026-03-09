import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { clearAllToolCaches } from "@/lib/statsCache";
import { encryptToken } from "@/lib/oauthCrypto";
import { enforceRateLimit, getClientIp } from "@/lib/rateLimit";
import { safeInternalPath, verifyOAuthState } from "@/lib/security";
import { asRecord, asString } from "@/lib/tsSafe";
import { oauthCallbackEvent, oauthCallbackException } from "@/lib/observability/oauth";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServer>>;

async function invalidateUserStatsCache(supabase: SupabaseServerClient, userId: string) {
  await clearAllToolCaches(supabase, userId);
}

async function postForm(url: string, form: Record<string, string>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
    cache: "no-store",
  });
  const data: unknown = await res.json().catch(() => ({}));
  const rec = asRecord(data);
  if (!res.ok) {
    throw new Error(asString(rec["error_description"]) || asString(rec["error"]) || `HTTP ${res.status}`);
  }
  return rec;
}

async function fetchJson(url: string, accessToken: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const data: unknown = await res.json().catch(() => ({}));
  const rec = asRecord(data);
  if (!res.ok) {
    throw new Error(asString(rec["message"]) || asString(rec["error"]) || `HTTP ${res.status}`);
  }
  return rec;
}

export async function GET(req: Request) {
  try {
    const urlObj = new URL(req.url);
    const code = urlObj.searchParams.get("code");
    const stateRaw = urlObj.searchParams.get("state");
    const err = urlObj.searchParams.get("error");
    const errDesc = urlObj.searchParams.get("error_description");

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
    const st = verifyOAuthState(req, "linkedin", stateRaw);
    const returnTo = safeInternalPath(st.returnTo || "/dashboard?panel=linkedin", "/dashboard?panel=linkedin");
    oauthCallbackEvent(req, { provider: "linkedin", outcome: "started", return_to: returnTo });
    const clearStateCookie = (res: NextResponse) => {
      res.cookies.set(st.cookieName, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
      return res;
    };

    const fail = (error: string, message?: string) => {
      oauthCallbackEvent(req, { provider: "linkedin", outcome: "failed", error, message, return_to: returnTo, capture_in_sentry: true });
      const finalUrl = new URL(returnTo, siteUrl);
      finalUrl.searchParams.set("linked", "linkedin");
      finalUrl.searchParams.set("ok", "0");
      finalUrl.searchParams.set("error", error);
      if (message) finalUrl.searchParams.set("message", message.slice(0, 200));
      return clearStateCookie(NextResponse.redirect(finalUrl));
    };

    if (!st.ok) {
      oauthCallbackEvent(req, { provider: "linkedin", outcome: "state_invalid", error: st.reason, return_to: returnTo, capture_in_sentry: true });
      return clearStateCookie(NextResponse.redirect(new URL("/dashboard?panel=linkedin&toast=oauth_state", siteUrl)));
    }

    if (err || !code) {
      oauthCallbackEvent(req, { provider: "linkedin", outcome: err === "access_denied" ? "cancelled" : "failed", error: err || "missing_code", message: errDesc || undefined, return_to: returnTo, capture_in_sentry: err !== "access_denied" });
      const finalUrl = new URL(returnTo, siteUrl);
      finalUrl.searchParams.set("linked", "linkedin");
      finalUrl.searchParams.set("ok", "0");
      if (err) finalUrl.searchParams.set("reason", String(err));
      if (errDesc) finalUrl.searchParams.set("message", String(errDesc).slice(0, 200));
      return clearStateCookie(NextResponse.redirect(finalUrl));
    }

    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    const redirectFromEnv = process.env.LINKEDIN_REDIRECT_URI;
    const redirectUri = redirectFromEnv || `${siteUrl}/api/integrations/linkedin/callback`;

    if (!clientId || !clientSecret) {
      oauthCallbackEvent(req, { provider: "linkedin", outcome: "config_error", error: "oauth_config_missing", return_to: returnTo, capture_in_sentry: true });
      return NextResponse.redirect(new URL("/dashboard?panel=linkedin&linked=linkedin&ok=0&error=oauth_config_missing", siteUrl));
    }

    const supabase = await createSupabaseServer();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) { oauthCallbackEvent(req, { provider: "linkedin", outcome: "not_authenticated", error: "not_authenticated", return_to: returnTo }); const finalUrl = new URL(returnTo, siteUrl); finalUrl.searchParams.set("linked", "linkedin"); finalUrl.searchParams.set("ok", "0"); finalUrl.searchParams.set("error", "not_authenticated"); return clearStateCookie(NextResponse.redirect(finalUrl)); }
    const userId = authData.user.id;

    const rlUser = await enforceRateLimit({
      name: "oauth_linkedin_cb",
      identifier: userId,
      limit: 10,
      window: "10 m",
    });
    if (rlUser) return rlUser;

    const ip = getClientIp(req);
    const rlIp = await enforceRateLimit({
      name: "oauth_linkedin_cb_ip",
      identifier: ip,
      limit: 20,
      window: "10 m",
    });
    if (rlIp) return rlIp;

    const token = await postForm("https://www.linkedin.com/oauth/v2/accessToken", {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const accessToken = String(token?.access_token || "");
    if (!accessToken) return fail("missing_access_token", "No access_token from LinkedIn");

    const expiresIn = Number(token?.expires_in);
    const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

    // OpenID Connect userinfo (works when openid scope granted)
    let userinfo: Record<string, unknown> = {};
    try {
      userinfo = await fetchJson("https://api.linkedin.com/v2/userinfo", accessToken);
    } catch {
      userinfo = {};
    }

    const sub = String(userinfo?.sub || "");
    const name = String(userinfo?.name || userinfo?.localizedFirstName || "");
    const email = String(userinfo?.email || "");
    // OpenID Connect can optionally provide a public profile URL via the standard "profile" claim.
    const profileUrl = asRecord(userinfo)["profile"] || asRecord(userinfo)["profile_url"] || null;

    const authorUrn = sub ? `urn:li:person:${sub}` : "";

    // Upsert integration
    // Upsert (robuste même si l’utilisateur reconnecte plusieurs fois)
// Nécessite un UNIQUE INDEX sur (user_id, provider, source, product) côté Supabase.
const payload: Record<string, unknown> = {
  user_id: userId,
  provider: "linkedin",
  category: "social",
  source: "linkedin",
  product: "linkedin",
  status: "connected",
  email_address: email || null,
  display_name: name || null,
  provider_account_id: sub || null,
  scopes: process.env.LINKEDIN_SCOPE_OVERRIDES || "openid profile email w_member_social",
  access_token_enc: encryptToken(accessToken),
  refresh_token_enc: null,
  expires_at: expiresAt,
  resource_id: authorUrn || null,
  resource_label: name || null,
  meta: { profile_url: profileUrl, org_urn: null },
};

await supabase
  .from("integrations")
  .upsert(payload, { onConflict: "user_id,provider,source,product" });

    // Invalidate stats cache so iNrStats + Generator reflect the new connection immediately.
    await invalidateUserStatsCache(supabase, userId);

// Mirror in pro_tools_configs
    try {
      const { data: scRow } = await supabase.from("pro_tools_configs").select("settings").eq("user_id", userId).maybeSingle();
      const current = asRecord(asRecord(scRow)["settings"]);
      const merged = {
        ...current,
        linkedin: {
          ...asRecord(current["linkedin"]),
          accountConnected: true,
          connected: true,
          displayName: name || null,
          url: profileUrl,
        },
      };
      await supabase.from("pro_tools_configs").upsert({ user_id: userId, settings: merged }, { onConflict: "user_id" });
    } catch {}

    const finalUrl = new URL(returnTo, siteUrl);
    finalUrl.searchParams.set("linked", "linkedin");
    finalUrl.searchParams.set("ok", "1");
    oauthCallbackEvent(req, { provider: "linkedin", outcome: "success", user_id: userId, return_to: returnTo });
    return clearStateCookie(NextResponse.redirect(finalUrl));
  } catch (e: unknown) {
    oauthCallbackException(req, "linkedin", e, { error: "oauth_callback_failed", return_to: "/dashboard?panel=linkedin" });
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
    const finalUrl = new URL("/dashboard?panel=linkedin", siteUrl);
    finalUrl.searchParams.set("linked", "linkedin");
    finalUrl.searchParams.set("ok", "0");
    finalUrl.searchParams.set("error", "oauth_callback_failed");
    const msg = ((e instanceof Error ? e.message : String(e)) || "Unknown error").slice(0, 200);
    if (msg) finalUrl.searchParams.set("message", msg);
    return NextResponse.redirect(finalUrl);
  }
}
