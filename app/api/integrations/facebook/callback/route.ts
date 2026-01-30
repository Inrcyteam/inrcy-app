import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

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

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json()) as any;
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export async function GET(req: Request) {
  try {
    const urlObj = new URL(req.url);
    const code = urlObj.searchParams.get("code");
    const stateRaw = urlObj.searchParams.get("state");

    if (!code) return NextResponse.json({ error: "Missing ?code" }, { status: 400 });
    if (!stateRaw) return NextResponse.json({ error: "Missing ?state" }, { status: 400 });

    let state: any;
    try {
      state = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf-8"));
    } catch {
      return NextResponse.json({ error: "Invalid state" }, { status: 400 });
    }

    const returnTo = state?.returnTo || "/dashboard?panel=facebook";

    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    const redirectFromEnv = process.env.FACEBOOK_REDIRECT_URI;
    const origin = new URL(req.url).origin;
    const redirectUri = redirectFromEnv || `${origin}/api/integrations/facebook/callback`;

    if (!appId || !appSecret) {
      return NextResponse.json({ error: "Missing FACEBOOK_APP_ID/FACEBOOK_APP_SECRET" }, { status: 500 });
    }

    const supabase = await createSupabaseServer();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const userId = authData.user.id;

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

    // 4) Fetch managed pages and pick the first one
    // NOTE: This requires pages_show_list.
    const pagesUrl = `https://graph.facebook.com/v20.0/me/accounts?${new URLSearchParams({
      fields: "id,name,access_token",
      access_token: longUserToken,
    }).toString()}`;
    const pagesResp = await fetchJson<{ data?: FbPage[] }>(pagesUrl);
    const pages = pagesResp.data || [];
    if (pages.length === 0) {
      return NextResponse.redirect(new URL(`${returnTo}&ok=0&reason=no_pages`, origin));
    }

    const page = pages[0];
    const pageId = page.id;
    const pageName = page.name || null;
    const pageToken = page.access_token || null;

    // 5) Upsert into stats_integrations
    const { data: existing, error: existingErr } = await supabase
      .from("stats_integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "facebook")
      .eq("source", "facebook")
      .eq("product", "facebook")
      .maybeSingle();

    if (existingErr) {
      return NextResponse.json({ error: "DB read existing failed", existingErr }, { status: 500 });
    }

    const payload: any = {
      user_id: userId,
      provider: "facebook",
      source: "facebook",
      product: "facebook",
      status: "connected",
      email_address: me.email ?? null,
      display_name: me.name ?? null,
      provider_account_id: me.id ?? null,
      scopes: "pages_show_list,pages_read_engagement,read_insights",
      access_token_enc: pageToken,
      refresh_token_enc: null,
      expires_at: null,
      resource_id: pageId,
      resource_label: pageName,
      meta: {
        picked: "first_page",
        pages_found: pages.length,
      },
    };

    if ((existing as any)?.id) {
      const { error: upErr } = await supabase
        .from("stats_integrations")
        .update(payload)
        .eq("id", (existing as any).id);
      if (upErr) return NextResponse.json({ error: "DB update failed", upErr }, { status: 500 });
    } else {
      const { error: insErr } = await supabase.from("stats_integrations").insert(payload);
      if (insErr) return NextResponse.json({ error: "DB insert failed", insErr }, { status: 500 });
    }

    return NextResponse.redirect(new URL(`${returnTo}&linked=facebook&ok=1`, origin));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
