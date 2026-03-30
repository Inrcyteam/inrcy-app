import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { clearAllToolCaches } from "@/lib/statsCache";
import { encryptToken } from "@/lib/oauthCrypto";
import { enforceRateLimit, getClientIp } from "@/lib/rateLimit";
import { safeInternalPath, verifyOAuthState } from "@/lib/security";
import { asRecord, asString } from "@/lib/tsSafe";
import { oauthCallbackEvent, oauthCallbackException } from "@/lib/observability/oauth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: { message?: string };
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
    throw new Error(asString(err["message"]) || `HTTP ${res.status}`);
  }
  return data as T;
}

export async function GET(req: Request) {
  try {
    const urlObj = new URL(req.url);
    const code = urlObj.searchParams.get("code");
    const stateRaw = urlObj.searchParams.get("state");

    const fbErrorMsg = urlObj.searchParams.get("error_message") || urlObj.searchParams.get("error_description");
    const fbErrorCode = urlObj.searchParams.get("error_code") || urlObj.searchParams.get("error");

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
    const st = verifyOAuthState(req, "instagram", stateRaw);
    const returnTo = safeInternalPath(st.returnTo || "/dashboard?panel=instagram", "/dashboard?panel=instagram");
    oauthCallbackEvent(req, { provider: "instagram", outcome: "started", return_to: returnTo });
    const clearStateCookie = (res: NextResponse) => {
      res.cookies.set(st.cookieName, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
      return res;
    };

    const fail = (error: string, message?: string) => {
      oauthCallbackEvent(req, { provider: "instagram", outcome: "failed", error, message, return_to: returnTo, capture_in_sentry: true });
      const finalUrl = new URL(returnTo, siteUrl);
      finalUrl.searchParams.set("linked", "instagram");
      finalUrl.searchParams.set("ok", "0");
      finalUrl.searchParams.set("error", error);
      if (message) finalUrl.searchParams.set("message", message.slice(0, 200));
      return clearStateCookie(NextResponse.redirect(finalUrl));
    };

    if (!st.ok) {
      oauthCallbackEvent(req, { provider: "instagram", outcome: "state_invalid", error: st.reason, return_to: returnTo, capture_in_sentry: true });
      return clearStateCookie(NextResponse.redirect(new URL("/dashboard?panel=instagram&toast=oauth_state", siteUrl)));
    }

    if (!code) {
      oauthCallbackEvent(req, { provider: "instagram", outcome: fbErrorCode === "access_denied" || fbErrorCode === "user_denied" ? "cancelled" : "failed", error: fbErrorCode || "missing_code", message: fbErrorMsg || undefined, return_to: returnTo, capture_in_sentry: !!fbErrorCode && fbErrorCode !== "access_denied" && fbErrorCode !== "user_denied" });
      const finalUrl = new URL(returnTo, siteUrl);
      finalUrl.searchParams.set("linked", "instagram");
      finalUrl.searchParams.set("ok", "0");
      if (fbErrorCode) finalUrl.searchParams.set("reason", String(fbErrorCode));
      if (fbErrorMsg) finalUrl.searchParams.set("message", String(fbErrorMsg).slice(0, 200));
      return clearStateCookie(NextResponse.redirect(finalUrl));
    }

    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    const redirectFromEnv = process.env.INSTAGRAM_REDIRECT_URI;
    const redirectUri = redirectFromEnv || `${siteUrl}/api/integrations/instagram/callback`;

    if (!appId || !appSecret) {
      oauthCallbackEvent(req, { provider: "instagram", outcome: "config_error", error: "oauth_config_missing", return_to: returnTo, capture_in_sentry: true });
      return NextResponse.redirect(new URL("/dashboard?panel=instagram&linked=instagram&ok=0&error=oauth_config_missing", siteUrl));
    }

    const supabase = await createSupabaseServer();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) { oauthCallbackEvent(req, { provider: "instagram", outcome: "not_authenticated", error: "not_authenticated", return_to: returnTo }); const finalUrl = new URL(returnTo, siteUrl); finalUrl.searchParams.set("linked", "instagram"); finalUrl.searchParams.set("ok", "0"); finalUrl.searchParams.set("error", "not_authenticated"); return clearStateCookie(NextResponse.redirect(finalUrl)); }
    const userId = authData.user.id;

    const rlUser = await enforceRateLimit({
      name: "oauth_instagram_cb",
      identifier: userId,
      limit: 10,
      window: "10 m",
    });
    if (rlUser) return rlUser;

    const ip = getClientIp(req);
    const rlIp = await enforceRateLimit({
      name: "oauth_instagram_cb_ip",
      identifier: ip,
      limit: 20,
      window: "10 m",
    });
    if (rlIp) return rlIp;

    // Exchange code -> user token
    const tokenUrl = `https://graph.facebook.com/v20.0/oauth/access_token?${new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      client_secret: appSecret,
      code,
    }).toString()}`;

    const tokenData = await fetchJson<TokenResponse>(tokenUrl);
    const userAccessToken = tokenData.access_token;
    if (!userAccessToken) return fail("missing_access_token", "La connexion Instagram a échoué. Merci de réessayer.");

    const shortExpiresIn = typeof tokenData.expires_in === "number" ? tokenData.expires_in : null;

    // Long-lived token (best-effort)
    let longUserToken = userAccessToken;
    let longExpiresIn: number | null = null;
    try {
      const longTokenUrl = `https://graph.facebook.com/v20.0/oauth/access_token?${new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: userAccessToken,
      }).toString()}`;
      const longTok = await fetchJson<TokenResponse>(longTokenUrl);
      if (longTok.access_token) longUserToken = longTok.access_token;
      if (typeof longTok.expires_in === "number") longExpiresIn = longTok.expires_in;
    } catch {}

    const expiresIn = longExpiresIn ?? shortExpiresIn;
    const expiresAt = typeof expiresIn === "number" ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

    // Store as "account_connected" (selection later)
    // Upsert (robuste même si l’utilisateur reconnecte plusieurs fois)
// Nécessite un UNIQUE INDEX sur (user_id, provider, source, product) côté Supabase.
const payload: Record<string, unknown> = {
  user_id: userId,
  provider: "instagram",
  category: "social",
  source: "instagram",
  product: "instagram",
  status: "account_connected",
  access_token_enc: encryptToken(longUserToken),
  refresh_token_enc: null,
  expires_at: expiresAt,
  resource_id: null,
  resource_label: null,
  meta: { picked: "none" },
};

const { error: upsertErr } = await supabaseAdmin
  .from("integrations")
  .upsert(payload, { onConflict: "user_id,provider,source,product" });

if (upsertErr) return fail("db_upsert_failed", "Le service est momentanément indisponible. Merci de réessayer.");

    // Invalidate stats cache so iNrStats + Generator reflect the new connection immediately.
    await invalidateUserStatsCache(supabase, userId);

// Mirror in pro_tools_configs
    try {
      const { data: scRow } = await supabaseAdmin.from("pro_tools_configs").select("settings").eq("user_id", userId).maybeSingle();
      const current = asRecord(asRecord(scRow)["settings"]);
      const merged = {
        ...current,
        instagram: {
          ...asRecord(current["instagram"]),
          accountConnected: true,
          connected: false,
          username: null,
          url: null,
          pageId: null,
          igId: null,
        },
      };
      await supabaseAdmin.from("pro_tools_configs").upsert({ user_id: userId, settings: merged }, { onConflict: "user_id" });
    } catch {}

    const finalUrl = new URL(returnTo, siteUrl);
    finalUrl.searchParams.set("linked", "instagram");
    finalUrl.searchParams.set("ok", "1");
    oauthCallbackEvent(req, { provider: "instagram", outcome: "success", user_id: userId, return_to: returnTo });
    return clearStateCookie(NextResponse.redirect(finalUrl));
  } catch (e: unknown) {
    oauthCallbackException(req, "instagram", e, { error: "oauth_callback_failed", return_to: "/dashboard?panel=instagram" });
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
    const finalUrl = new URL("/dashboard?panel=instagram", siteUrl);
    finalUrl.searchParams.set("linked", "instagram");
    finalUrl.searchParams.set("ok", "0");
    finalUrl.searchParams.set("error", "oauth_callback_failed");
    const msg = ((e instanceof Error ? e.message : String(e)) || "Une erreur est survenue. Merci de réessayer.").slice(0, 200);
    if (msg) finalUrl.searchParams.set("message", msg);
    return NextResponse.redirect(finalUrl);
  }
}