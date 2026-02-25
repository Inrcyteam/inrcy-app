import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { encryptToken } from "@/lib/oauthCrypto";
import { enforceRateLimit, getClientIp } from "@/lib/rateLimit";
import { safeInternalPath, verifyOAuthState } from "@/lib/security";
import { asRecord, asString } from "@/lib/tsSafe";

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
  try {
    await supabase.from("stats_cache").delete().eq("user_id", userId);
  } catch {}
  try {
    await supabase.from("cache_statistiques").delete().eq("id_de_l_utilisateur", userId);
  } catch {}
  try {
    await supabase.from("cache_statistiques").delete().eq("user_id", userId);
  } catch {}
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
      return NextResponse.redirect(new URL("/dashboard?panel=facebook&toast=oauth_state", siteUrl));
    }

    // ✅ CSRF protection: verify state against HttpOnly cookie
    const st = verifyOAuthState(req, "facebook", stateRaw);
    const returnTo = safeInternalPath(st.returnTo || "/dashboard?panel=facebook", "/dashboard?panel=facebook");

    const clearStateCookie = (res: NextResponse) => {
      res.cookies.set(st.cookieName, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
      return res;
    };

    if (!st.ok) {
      return clearStateCookie(NextResponse.redirect(new URL("/dashboard?panel=facebook&toast=oauth_state", siteUrl)));
    }

    // If Facebook returned an error, redirect back with a readable reason.
    if (!code) {
      const finalUrl = new URL(returnTo, siteUrl);
      finalUrl.searchParams.set("linked", "facebook");
      finalUrl.searchParams.set("ok", "0");
      if (fbErrorCode) finalUrl.searchParams.set("reason", String(fbErrorCode));
      if (fbErrorMsg) finalUrl.searchParams.set("message", String(fbErrorMsg).slice(0, 200));
      return clearStateCookie(NextResponse.redirect(finalUrl));
    }

    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    const redirectFromEnv = process.env.FACEBOOK_REDIRECT_URI;

    // redirect_uri MUST match the one used in the initial OAuth start step.
    const redirectUri = redirectFromEnv || `${siteUrl}/api/integrations/facebook/callback`;

    if (!appId || !appSecret) {
      return NextResponse.json({ error: "Missing FACEBOOK_APP_ID/FACEBOOK_APP_SECRET" }, { status: 500 });
    }

    const supabase = await createSupabaseServer();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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
      return NextResponse.json({ error: "No access_token from Facebook", tokenData }, { status: 500 });
    }

    // 2) Upgrade to long-lived user token
    let longUserToken = userAccessToken;
    try {
      const longTokenUrl = `https://graph.facebook.com/v20.0/oauth/access_token?${new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: userAccessToken,
      }).toString()}`;
      const longToken = await fetchJson<TokenResponse>(longTokenUrl);
      if (longToken.access_token) longUserToken = longToken.access_token;
    } catch {
      // If it fails, keep short-lived; still works in dev.
    }

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
    const { data: existing, error: existingErr } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "facebook")
      .eq("source", "facebook")
      .eq("product", "facebook")
      .maybeSingle();

    if (existingErr) {
      return NextResponse.json({ error: "DB read existing failed", existingErr }, { status: 500 });
    }

    const payload: Record<string, unknown> = {
      user_id: userId,
      provider: "facebook",
      category: "social",
      source: "facebook",
      product: "facebook",
      status: "account_connected",
      email_address: me.email ?? null,
      display_name: me.name ?? null,
      provider_account_id: me.id ?? null,
      scopes: "public_profile,email,pages_show_list,pages_manage_posts,pages_read_engagement,read_insights",
      access_token_enc: encryptToken(tokenToStore),
      refresh_token_enc: null,
      expires_at: null,
      resource_id: null,
      resource_label: null,
      meta: {
        picked: "none",
        pages_found: pages.length,
        user_access_token: null,
        user_access_token_enc: encryptToken(longUserToken),
        page_url: null,
      },
    };

    if ((existing as unknown)?.id) {
      const { error: upErr } = await supabase
        .from("integrations")
        .update(payload)
        .eq("id", (existing as Record<string, unknown>)?.id as string);
      if (upErr) return NextResponse.json({ error: "DB update failed", upErr }, { status: 500 });
    } else {
      const { error: insErr } = await supabase.from("integrations").insert(payload);
      if (insErr) return NextResponse.json({ error: "DB insert failed", insErr }, { status: 500 });
    }

    // Also keep a boolean in pro_tools_configs.settings so the dashboard can show it instantly.
    try {
      const { data: scRow } = await supabase.from("pro_tools_configs").select("settings").eq("user_id", userId).maybeSingle();
      const current = (scRow as unknown)?.settings ?? {};
      const merged = {
        ...current,
        facebook: {
          ...(current?.facebook ?? {}),
          accountConnected: true,
          userEmail: me.email ?? null,
          pageConnected: false,
          pageId: null,
          pageName: null,
          url: null,
        },
      };
      await supabase.from("pro_tools_configs").upsert({ user_id: userId, settings: merged }, { onConflict: "user_id" });
    } catch {
      // non-fatal
    }

    // Invalidate stats cache so iNrStats + Generator reflect the new connection immediately.
    await invalidateUserStatsCache(supabase, userId);

    const finalUrl = new URL(returnTo, siteUrl);
    finalUrl.searchParams.set("linked", "facebook");
    finalUrl.searchParams.set("ok", "1");
    if (!pages.length) finalUrl.searchParams.set("warning", "no_pages_or_no_permission");
    return clearStateCookie(NextResponse.redirect(finalUrl));
  } catch (e: unknown) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)) || "Unknown error" }, { status: 500 });
  }
}