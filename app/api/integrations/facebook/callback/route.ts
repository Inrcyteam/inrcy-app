import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { clearAllToolCaches } from "@/lib/statsCache";
import { encryptToken } from "@/lib/oauthCrypto";
import { enforceRateLimit, getClientIp } from "@/lib/rateLimit";
import { safeInternalPath, verifyOAuthState } from "@/lib/security";
import { asRecord, asString } from "@/lib/tsSafe";
import { oauthCallbackEvent, oauthCallbackException } from "@/lib/observability/oauth";
import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type TokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: { message?: string; type?: string; code?: number; fbtrace_id?: string };
};

type FbMe = {
  id?: string;
  name?: string;
  email?: string;
};

type FbPage = {
  id: string;
  name?: string;
  access_token?: string;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServer>>;

async function invalidateUserStatsCache(supabase: SupabaseServerClient, userId: string) {
  await clearAllToolCaches(supabase, userId);
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json()) as unknown;
  if (!res.ok) {
    const rec = asRecord(data);
    const err = asRecord(rec["error"]);
    const msg = asString(err["message"]) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export async function GET(req: Request) {
  try {
    const urlObj = new URL(req.url);
    const code = urlObj.searchParams.get("code");
    const stateRaw = urlObj.searchParams.get("state");

    // Canonical base URL: never guess from req.url (can be vercel preview, localhost, etc.)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;

    // If Facebook returns an OAuth error, surface it back to the dashboard instead of "Missing ?code".
    const fbErrorMsg = urlObj.searchParams.get("error_message") || urlObj.searchParams.get("error_description");
    const fbErrorCode = urlObj.searchParams.get("error_code") || urlObj.searchParams.get("error");

    if (!stateRaw) {
      oauthCallbackEvent(req, { provider: "facebook", outcome: "state_invalid", error: "missing_state", return_to: "/dashboard?panel=facebook", capture_in_sentry: true });
      return NextResponse.redirect(new URL("/dashboard?panel=facebook&toast=oauth_state", siteUrl));
    }

    // ✅ CSRF protection: verify state against HttpOnly cookie
    const st = verifyOAuthState(req, "facebook", stateRaw);
    const rawReturnTo = safeInternalPath(st.returnTo || "/dashboard?panel=facebook", "/dashboard?panel=facebook");
    const returnToUrl = new URL(rawReturnTo, siteUrl);
    const loginMode = returnToUrl.searchParams.get("fb_mode") === "business" ? "business" : "standard";
    returnToUrl.searchParams.delete("fb_mode");
    const returnTo = `${returnToUrl.pathname}${returnToUrl.search}`;
    oauthCallbackEvent(req, { provider: "facebook", outcome: "started", return_to: returnTo });

    const clearStateCookie = (res: NextResponse) => {
      res.cookies.set(st.cookieName, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
      return res;
    };

    const fail = (error: string, message?: string) => {
      oauthCallbackEvent(req, { provider: "facebook", outcome: "failed", error, message, return_to: returnTo, capture_in_sentry: true });
      const finalUrl = new URL(returnTo, siteUrl);
      finalUrl.searchParams.set("linked", "facebook");
      finalUrl.searchParams.set("ok", "0");
      finalUrl.searchParams.set("error", error);
      if (message) finalUrl.searchParams.set("message", getSimpleFrenchErrorMessage(message, "La connexion n'a pas pu être finalisée.").slice(0, 200));
      return clearStateCookie(NextResponse.redirect(finalUrl));
    };

    if (!st.ok) {
      oauthCallbackEvent(req, { provider: "facebook", outcome: "state_invalid", error: st.reason, return_to: returnTo, capture_in_sentry: true });
      return clearStateCookie(NextResponse.redirect(new URL("/dashboard?panel=facebook&toast=oauth_state", siteUrl)));
    }

    // If Facebook returned an error, redirect back with a readable reason.
    if (!code) {
      oauthCallbackEvent(req, { provider: "facebook", outcome: fbErrorCode === "access_denied" ? "cancelled" : "failed", error: fbErrorCode || "missing_code", message: fbErrorMsg || undefined, return_to: returnTo, capture_in_sentry: !!fbErrorCode && fbErrorCode !== "access_denied" });
      const finalUrl = new URL(returnTo, siteUrl);
      finalUrl.searchParams.set("linked", "facebook");
      finalUrl.searchParams.set("ok", "0");
      if (fbErrorCode) finalUrl.searchParams.set("reason", String(fbErrorCode));
      if (fbErrorMsg) finalUrl.searchParams.set("message", getSimpleFrenchErrorMessage(fbErrorMsg, "La connexion n'a pas pu être finalisée.").slice(0, 200));
      return clearStateCookie(NextResponse.redirect(finalUrl));
    }

    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    const redirectFromEnv = process.env.FACEBOOK_REDIRECT_URI;

    // redirect_uri MUST match the one used in the initial OAuth start step.
    const redirectUri = redirectFromEnv || `${siteUrl}/api/integrations/facebook/callback`;

    if (!appId || !appSecret) {
      oauthCallbackEvent(req, { provider: "facebook", outcome: "config_error", error: "oauth_config_missing", return_to: returnTo, capture_in_sentry: true });
      return NextResponse.redirect(new URL("/dashboard?panel=facebook&linked=facebook&ok=0&error=oauth_config_missing", siteUrl));
    }

    const supabase = await createSupabaseServer();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      oauthCallbackEvent(req, { provider: "facebook", outcome: "not_authenticated", error: "not_authenticated", return_to: returnTo });
      const finalUrl = new URL(returnTo, siteUrl);
      finalUrl.searchParams.set("linked", "facebook");
      finalUrl.searchParams.set("ok", "0");
      finalUrl.searchParams.set("error", "not_authenticated");
      return clearStateCookie(NextResponse.redirect(finalUrl));
    }
    const userId = authData.user.id;

    const rlUser = await enforceRateLimit({
      name: "oauth_facebook_cb",
      identifier: userId,
      limit: 10,
      window: "10 m",
    });
    if (rlUser) return rlUser;

    const ip = getClientIp(req);
    const rlIp = await enforceRateLimit({
      name: "oauth_facebook_cb_ip",
      identifier: ip,
      limit: 20,
      window: "10 m",
    });
    if (rlIp) return rlIp;

    // 1) Exchange code -> short-lived user access token
    const tokenUrl = `https://graph.facebook.com/v20.0/oauth/access_token?${new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      client_secret: appSecret,
      code,
    }).toString()}`;

    const tokenData = await fetchJson<TokenResponse>(tokenUrl);
    const userAccessToken = tokenData.access_token;
    if (!userAccessToken) {
      return fail("missing_access_token", "La connexion Facebook a échoué. Merci de réessayer.");
    }

    const shortExpiresIn = typeof tokenData.expires_in === "number" ? tokenData.expires_in : null;

    // 2) Upgrade to long-lived user token
    let longUserToken = userAccessToken;
    let longExpiresIn: number | null = null;
    try {
      const longTokenUrl = `https://graph.facebook.com/v20.0/oauth/access_token?${new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: userAccessToken,
      }).toString()}`;
      const longToken = await fetchJson<TokenResponse>(longTokenUrl);
      if (longToken.access_token) longUserToken = longToken.access_token;
      if (typeof longToken.expires_in === "number") longExpiresIn = longToken.expires_in;
    } catch {
      // If it fails, keep short-lived; still works in dev.
    }

    const expiresIn = longExpiresIn ?? shortExpiresIn;
    const expiresAt = typeof expiresIn === "number" ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

    // 3) Basic user profile (email may be empty depending on account)
    let me: FbMe = {};
    try {
      const meUrl = `https://graph.facebook.com/v20.0/me?${new URLSearchParams({
        fields: "id,name,email",
        access_token: longUserToken,
      }).toString()}`;
      me = await fetchJson<FbMe>(meUrl);
    } catch {
      // non-fatal
      me = {};
    }

    // 4) Fetch managed pages (best-effort) JUST to know if pages can be listed.
    // IMPORTANT: On ne sélectionne PAS automatiquement une page ici.
    // Le callback OAuth ne connecte que le COMPTE Facebook.
    let pages: FbPage[] = [];
    try {
      const pagesUrl = `https://graph.facebook.com/v20.0/me/accounts?${new URLSearchParams({
        fields: "id,name,access_token",
        access_token: longUserToken,
      }).toString()}`;
      const pagesResp = await fetchJson<{ data?: FbPage[] }>(pagesUrl);
      pages = pagesResp.data || [];
    } catch {
      pages = [];
    }

    const _pageId = null;
    const _pageName = null;
    const _pageUrl = null;
    const tokenToStore = longUserToken; // token utilisateur uniquement (sélection page plus tard)

    // 5) Upsert into integrations
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("integrations")
      .select("id,meta,resource_id,resource_label,access_token_enc,status")
      .eq("user_id", userId)
      .eq("provider", "facebook")
      .eq("source", "facebook")
      .eq("product", "facebook")
      .maybeSingle();

    if (existingErr) {
      return fail("db_read_failed", "Le service est momentanément indisponible. Merci de réessayer.");
    }

    const existingRec = asRecord(existing);
    const prevMeta = asRecord(existingRec["meta"]);
    const encryptedUserToken = encryptToken(longUserToken);
    const selectedPageId = asString(existingRec["resource_id"]) || null;
    const selectedPageName = asString(existingRec["resource_label"]) || null;
    const hasSelectedPage = !!selectedPageId;
    const nextMeta: Record<string, unknown> = {
      ...prevMeta,
      picked: hasSelectedPage ? prevMeta["picked"] || "page" : "none",
      pages_found: Math.max(Number(prevMeta["pages_found"] || 0), pages.length),
      user_access_token: null,
      user_access_token_enc: encryptedUserToken,
      standard_user_access_token_enc: loginMode === "standard" ? encryptedUserToken : prevMeta["standard_user_access_token_enc"] || null,
      business_user_access_token_enc: loginMode === "business" ? encryptedUserToken : prevMeta["business_user_access_token_enc"] || null,
      page_url: prevMeta["page_url"] || null,
      last_login_mode: loginMode,
    };

    const payload: Record<string, unknown> = {
      user_id: userId,
      provider: "facebook",
      category: "social",
      source: "facebook",
      product: "facebook",
      status: hasSelectedPage ? (asString(existingRec["status"]) || "connected") : "account_connected",
      email_address: me.email ?? null,
      display_name: me.name ?? null,
      provider_account_id: me.id ?? null,
      scopes: "public_profile,email,pages_show_list,pages_manage_posts,pages_read_engagement,read_insights,business_management",
      access_token_enc: hasSelectedPage ? existingRec["access_token_enc"] || encryptToken(tokenToStore) : encryptToken(tokenToStore),
      refresh_token_enc: null,
      expires_at: hasSelectedPage ? null : expiresAt,
      resource_id: hasSelectedPage ? selectedPageId : null,
      resource_label: hasSelectedPage ? selectedPageName : null,
      meta: nextMeta,
    };

    const existingId = asString(existingRec["id"]);
    if (existingId) {
      const { error: upErr } = await supabaseAdmin
        .from("integrations")
        .update(payload)
        .eq("id", existingId);
      if (upErr) return fail("db_update_failed", "La mise à jour a échoué.");
    } else {
      const { error: insErr } = await supabaseAdmin.from("integrations").insert(payload);
      if (insErr) return fail("db_insert_failed", "Le service est momentanément indisponible. Merci de réessayer.");
    }

    // Also keep a boolean in pro_tools_configs.settings so the dashboard can show it instantly.
    try {
      const { data: scRow } = await supabaseAdmin.from("pro_tools_configs").select("settings").eq("user_id", userId).maybeSingle();
      const current = asRecord(asRecord(scRow)["settings"]);
      const currentFacebook = asRecord(current["facebook"]);
      const merged: Record<string, unknown> = {
        ...current,
        facebook: {
          ...currentFacebook,
          accountConnected: true,
          userEmail: me.email ?? null,
          pageConnected: false,
          pageId: null,
          pageName: null,
          url: null,
        },
      };
      await supabaseAdmin.from("pro_tools_configs").upsert({ user_id: userId, settings: merged }, { onConflict: "user_id" });
    } catch {
      // non-fatal
    }

    // Invalidate stats cache so iNrStats + Generator reflect the new connection immediately.
    await invalidateUserStatsCache(supabase, userId);

    const finalUrl = new URL(returnTo, siteUrl);
    finalUrl.searchParams.set("linked", "facebook");
    finalUrl.searchParams.set("ok", "1");
    if (!pages.length) finalUrl.searchParams.set("warning", "no_pages_or_no_permission");
    oauthCallbackEvent(req, { provider: "facebook", outcome: "success", user_id: userId, return_to: returnTo });
    return clearStateCookie(NextResponse.redirect(finalUrl));
  } catch (e: unknown) {
    oauthCallbackException(req, "facebook", e, { error: "oauth_callback_failed", return_to: "/dashboard?panel=facebook" });
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
    const finalUrl = new URL("/dashboard?panel=facebook", siteUrl);
    finalUrl.searchParams.set("linked", "facebook");
    finalUrl.searchParams.set("ok", "0");
    finalUrl.searchParams.set("error", "oauth_callback_failed");
    const msg = getSimpleFrenchErrorMessage(e, "La connexion n'a pas pu être finalisée.").slice(0, 200);
    if (msg) finalUrl.searchParams.set("message", msg);
    return NextResponse.redirect(finalUrl);
  }
}