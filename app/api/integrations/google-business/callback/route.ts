import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { clearAllToolCaches } from "@/lib/statsCache";
import { encryptToken as _encryptToken } from "@/lib/oauthCrypto";
import { gmbListAccounts } from "@/lib/googleBusiness";
import { enforceRateLimit, getClientIp } from "@/lib/rateLimit";
import { safeInternalPath, verifyOAuthState } from "@/lib/security";
import { asRecord, asString } from "@/lib/tsSafe";
import { oauthCallbackEvent, oauthCallbackException } from "@/lib/observability/oauth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number | string;
  scope?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  id?: string;
  email?: string;
  name?: string;
  picture?: string;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServer>>;

async function invalidateUserStatsCache(supabase: SupabaseServerClient, userId: string) {
  await clearAllToolCaches(supabase, userId);
}

export async function GET(req: Request) {
  try {
    const urlObj = new URL(req.url);
    const code = urlObj.searchParams.get("code");
    const stateRaw = urlObj.searchParams.get("state");
    const oauthError = urlObj.searchParams.get("error");
    const oauthErrorDescription = urlObj.searchParams.get("error_description");

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
    if (!stateRaw) {
      oauthCallbackEvent(req, { provider: "google_business", outcome: "state_invalid", error: "missing_state", return_to: "/dashboard?panel=gmb", capture_in_sentry: true });
      return NextResponse.redirect(new URL("/dashboard?panel=gmb&toast=oauth_state", siteUrl));
    }

    // IMPORTANT:
    // - In dev you often hit this route via Cloudflare tunnel (https://xxxx.trycloudflare.com)
    // - But your app UI might be on http://localhost:3000 (no TLS)
    // So we MUST NOT guess the final redirect origin from req.url.
    // We use NEXT_PUBLIC_SITE_URL as the canonical base URL to redirect back to.

    const st = verifyOAuthState(req, "google_business", stateRaw);
    const returnToPath = safeInternalPath(st.returnTo || "/dashboard?panel=gmb", "/dashboard?panel=gmb");
    oauthCallbackEvent(req, { provider: "google_business", outcome: "started", return_to: returnToPath });
    const clearStateCookie = (res: NextResponse) => {
      res.cookies.set(st.cookieName, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
      return res;
    };

    const fail = (error: string, message?: string) => {
      oauthCallbackEvent(req, { provider: "google_business", outcome: "failed", error, message, return_to: returnToPath, capture_in_sentry: true });
      const finalUrl = new URL(returnToPath, siteUrl);
      finalUrl.searchParams.set("linked", "gmb");
      finalUrl.searchParams.set("ok", "0");
      finalUrl.searchParams.set("error", error);
      if (message) finalUrl.searchParams.set("message", message.slice(0, 200));
      return clearStateCookie(NextResponse.redirect(finalUrl));
    };

    if (!st.ok) {
      oauthCallbackEvent(req, { provider: "google_business", outcome: "state_invalid", error: st.reason, return_to: returnToPath, capture_in_sentry: true });
      return clearStateCookie(NextResponse.redirect(new URL("/dashboard?panel=gmb&toast=oauth_state", siteUrl)));
    }

    if (oauthError || !code) {
      oauthCallbackEvent(req, { provider: "google_business", outcome: oauthError === "access_denied" ? "cancelled" : "failed", error: oauthError || "missing_code", message: oauthErrorDescription || undefined, return_to: returnToPath, capture_in_sentry: oauthError !== "access_denied" });
      const finalUrl = new URL(returnToPath, siteUrl);
      finalUrl.searchParams.set("linked", "gmb");
      finalUrl.searchParams.set("ok", "0");
      finalUrl.searchParams.set("error", oauthError || "missing_code");
      if (oauthErrorDescription) finalUrl.searchParams.set("message", oauthErrorDescription.slice(0, 200));
      return clearStateCookie(NextResponse.redirect(finalUrl));
    }

    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const redirectFromEnv = process.env.GOOGLE_GMB_REDIRECT_URI;

    // For the token exchange, redirect_uri MUST match exactly what you configured in Google Cloud.
    // Prefer env so you can switch between dev tunnel and production.
    // IMPORTANT: the redirect_uri used here MUST match exactly what was used in the initial OAuth step.
    // Prefer env; otherwise use the canonical siteUrl (not req.url origin).
    const redirectUri = redirectFromEnv || `${siteUrl}/api/integrations/google-business/callback`;

    if (!clientId || !clientSecret) {
      oauthCallbackEvent(req, { provider: "google_business", outcome: "config_error", error: "oauth_config_missing", return_to: returnToPath, capture_in_sentry: true });
      return NextResponse.redirect(new URL("/dashboard?panel=gmb&linked=gmb&ok=0&error=oauth_config_missing", siteUrl));
    }

    const supabase = await createSupabaseServer();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      oauthCallbackEvent(req, { provider: "google_business", outcome: "not_authenticated", error: "not_authenticated", return_to: returnToPath });
      const finalUrl = new URL(returnToPath, siteUrl);
      finalUrl.searchParams.set("linked", "gmb");
      finalUrl.searchParams.set("ok", "0");
      finalUrl.searchParams.set("error", "not_authenticated");
      return clearStateCookie(NextResponse.redirect(finalUrl));
    }
    const userId = authData.user.id;

    const rlUser = await enforceRateLimit({
      name: "oauth_google_business_cb",
      identifier: userId,
      limit: 10,
      window: "10 m",
    });
    if (rlUser) return rlUser;

    const ip = getClientIp(req);
    const rlIp = await enforceRateLimit({
      name: "oauth_google_business_cb_ip",
      identifier: ip,
      limit: 20,
      window: "10 m",
    });
    if (rlIp) return rlIp;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = (await tokenRes.json()) as TokenResponse;
    if (!tokenRes.ok) {
      return fail("token_exchange_failed", "Token exchange failed");
    }

    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = (await userRes.json()) as GoogleUserInfo;
    if (!userRes.ok || !userInfo?.email) {
      return fail("userinfo_failed", "Userinfo fetch failed");
    }

    // Preserve refresh_token if Google doesn't return it
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("integrations")
      .select("id,refresh_token_enc")
      .eq("user_id", userId)
      .eq("provider", "google")
      .eq("source", "gmb")
      .eq("product", "gmb")
      .maybeSingle();

    if (existingErr) {
      return fail("db_read_failed", "DB read existing failed");
    }

    const existingRec = asRecord(existing);
    const existingRefresh = asString(existingRec["refresh_token_enc"]);
    const existingId = asString(existingRec["id"]);

    const refreshTokenToStore = tokenData.refresh_token ?? existingRefresh ?? null;

    const expiresAt =
      tokenData.expires_in != null
        ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString()
        : null;

    const payload: Record<string, unknown> = {
      user_id: userId,
      provider: "google",
      category: "local",
      source: "gmb",
      product: "gmb",
      status: "connected",
      email_address: userInfo.email,
      display_name: userInfo.name ?? null,
      provider_account_id: userInfo.id ?? null,
      scopes: tokenData.scope ?? null,
      access_token_enc: tokenData.access_token ?? null,
      refresh_token_enc: refreshTokenToStore,
      expires_at: expiresAt,
      meta: { picture: userInfo.picture ?? null },
    };

    if (existingId) {
      const { error: upErr } = await supabaseAdmin
        .from("integrations")
        .update(payload)
        .eq("id", existingId);
      if (upErr) return fail("db_update_failed", "DB update failed");
    } else {
      const { error: insErr } = await supabaseAdmin.from("integrations").insert(payload);
      if (insErr) return fail("db_insert_failed", "DB insert failed");
    }

    // Also keep a boolean in pro_tools_configs.settings so the dashboard can show it instantly.
    try {
      const { data: scRow } = await supabaseAdmin.from("pro_tools_configs").select("settings").eq("user_id", userId).maybeSingle();
      const current = asRecord(asRecord(scRow)["settings"]);
      const currentGmb = asRecord(current["gmb"]);
      const merged = {
        ...current,
        gmb: {
          ...currentGmb,
          connected: true,
          accountEmail: userInfo.email,
          accountDisplayName: userInfo.name ?? null,
        },
      };
      await supabaseAdmin.from("pro_tools_configs").upsert({ user_id: userId, settings: merged }, { onConflict: "user_id" });
    } catch {
      // non-fatal
    }


    // IMPORTANT:
    // We DO NOT auto-select a location here.
    // GMB stats are tied to a specific establishment (location). Until the user explicitly
    // chooses a location in the UI, we must not fetch or display metrics.
    // We can however store a default *account* hint to help list locations faster.
    try {
      // tokenData.access_token is the raw access token returned by Google.
      // payload.access_token_enc is stored for DB usage but is typed as unknown (Record<string, unknown>).
      // For calling Google APIs we must use a real string access token.
      const accessToken = typeof tokenData.access_token === "string" ? tokenData.access_token.trim() : "";
      if (accessToken) {
        const accounts = await gmbListAccounts(accessToken);
        const firstAcc = accounts?.[0]?.name; // e.g. "accounts/123"
        if (firstAcc) {
          const metaToMerge = asRecord(payload["meta"]);
          await supabaseAdmin
            .from("integrations")
            .update({ meta: { ...metaToMerge, account: firstAcc }, resource_id: null, resource_label: null })
            .eq("user_id", userId)
            .eq("provider", "google")
            .eq("source", "gmb")
            .eq("product", "gmb");
        }
      }
    } catch {
      // ignore discovery errors
    }

    // Invalidate stats cache so iNrStats + Generator reflect the new connection immediately.
    await invalidateUserStatsCache(supabase, userId);

    // Build final redirect URL safely and append params without breaking existing querystring
    const finalUrl = new URL(returnToPath, siteUrl);
    finalUrl.searchParams.set("linked", "gmb");
    finalUrl.searchParams.set("ok", "1");

    oauthCallbackEvent(req, { provider: "google_business", outcome: "success", user_id: userId, return_to: returnToPath });
    return clearStateCookie(NextResponse.redirect(finalUrl));
  } catch (e: unknown) {
    oauthCallbackException(req, "google_business", e, { error: "oauth_callback_failed", return_to: "/dashboard?panel=gmb" });
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
    const finalUrl = new URL("/dashboard?panel=gmb", siteUrl);
    finalUrl.searchParams.set("linked", "gmb");
    finalUrl.searchParams.set("ok", "0");
    finalUrl.searchParams.set("error", "oauth_callback_failed");
    const msg = ((e instanceof Error ? e.message : String(e)) || "Unknown error").slice(0, 200);
    if (msg) finalUrl.searchParams.set("message", msg);
    return NextResponse.redirect(finalUrl);
  }
}