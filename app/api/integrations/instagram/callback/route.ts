import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { encryptToken } from "@/lib/oauthCrypto";
import { enforceRateLimit, getClientIp } from "@/lib/rateLimit";

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: { message?: string };
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data as T;
}

export async function GET(req: Request) {
  try {
    const urlObj = new URL(req.url);
    const code = urlObj.searchParams.get("code");
    const stateRaw = urlObj.searchParams.get("state");

    const fbErrorMsg = urlObj.searchParams.get("error_message") || urlObj.searchParams.get("error_description");
    const fbErrorCode = urlObj.searchParams.get("error_code") || urlObj.searchParams.get("error");

    if (!stateRaw) return NextResponse.json({ error: "Missing ?state" }, { status: 400 });

    let state: any;
    try {
      state = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf-8"));
    } catch {
      return NextResponse.json({ error: "Invalid state" }, { status: 400 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
    const returnTo = state?.returnTo || "/dashboard?panel=instagram";

    if (!code) {
      const finalUrl = new URL(returnTo, siteUrl);
      finalUrl.searchParams.set("linked", "instagram");
      finalUrl.searchParams.set("ok", "0");
      if (fbErrorCode) finalUrl.searchParams.set("reason", String(fbErrorCode));
      if (fbErrorMsg) finalUrl.searchParams.set("message", String(fbErrorMsg).slice(0, 200));
      return NextResponse.redirect(finalUrl);
    }

    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    const redirectFromEnv = process.env.INSTAGRAM_REDIRECT_URI;
    const redirectUri = redirectFromEnv || `${siteUrl}/api/integrations/instagram/callback`;

    if (!appId || !appSecret) {
      return NextResponse.json({ error: "Missing FACEBOOK_APP_ID/FACEBOOK_APP_SECRET" }, { status: 500 });
    }

    const supabase = await createSupabaseServer();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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
    if (!userAccessToken) return NextResponse.json({ error: "No access_token from Meta", tokenData }, { status: 500 });

    // Long-lived token (best-effort)
    let longUserToken = userAccessToken;
    try {
      const longTokenUrl = `https://graph.facebook.com/v20.0/oauth/access_token?${new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: userAccessToken,
      }).toString()}`;
      const longTok = await fetchJson<TokenResponse>(longTokenUrl);
      if (longTok.access_token) longUserToken = longTok.access_token;
    } catch {}

    // Store as "account_connected" (selection later)
    // Upsert (robuste même si l’utilisateur reconnecte plusieurs fois)
// Nécessite un UNIQUE INDEX sur (user_id, provider, source, product) côté Supabase.
const payload: any = {
  user_id: userId,
  provider: "instagram",
  category: "social",
  source: "instagram",
  product: "instagram",
  status: "account_connected",
  access_token_enc: encryptToken(longUserToken),
  refresh_token_enc: null,
  expires_at: null,
  resource_id: null,
  resource_label: null,
  meta: { picked: "none" },
};

const { error: upsertErr } = await supabase
  .from("integrations")
  .upsert(payload, { onConflict: "user_id,provider,source,product" });

if (upsertErr) return NextResponse.json({ error: "DB upsert failed", upsertErr }, { status: 500 });

// Mirror in pro_tools_configs
    try {
      const { data: scRow } = await supabase.from("pro_tools_configs").select("settings").eq("user_id", userId).maybeSingle();
      const current = (scRow as any)?.settings ?? {};
      const merged = {
        ...current,
        instagram: {
          ...(current?.instagram ?? {}),
          accountConnected: true,
          connected: false,
          username: null,
          url: null,
          pageId: null,
          igId: null,
        },
      };
      await supabase.from("pro_tools_configs").upsert({ user_id: userId, settings: merged }, { onConflict: "user_id" });
    } catch {}

    const finalUrl = new URL(returnTo, siteUrl);
    finalUrl.searchParams.set("linked", "instagram");
    finalUrl.searchParams.set("ok", "1");
    return NextResponse.redirect(finalUrl);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
