import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

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

const ALLOWED_SOURCES = ["site_inrcy", "site_web"] as const;
const ALLOWED_PRODUCTS = ["ga4", "gsc"] as const;

export async function GET(req: Request) {
  try {
    const urlObj = new URL(req.url);
    const code = urlObj.searchParams.get("code");
    const stateRaw = urlObj.searchParams.get("state");

    if (!code) return NextResponse.json({ error: "Missing ?code" }, { status: 400 });
    if (!stateRaw) return NextResponse.json({ error: "Missing ?state" }, { status: 400 });

    let state: any = null;
    try {
      state = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf-8"));
    } catch {
      return NextResponse.json({ error: "Invalid state" }, { status: 400 });
    }

    const source = state?.source;
    const product = state?.product;
    const returnTo = state?.returnTo || "/dashboard";

    if (!ALLOWED_SOURCES.includes(source)) {
      return NextResponse.json({ error: "Invalid state.source" }, { status: 400 });
    }
    if (!ALLOWED_PRODUCTS.includes(product)) {
      return NextResponse.json({ error: "Invalid state.product" }, { status: 400 });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const redirectFromEnv = process.env.GOOGLE_STATS_REDIRECT_URI;
    const origin = new URL(req.url).origin;
    const redirectUri = redirectFromEnv || `${origin}/api/integrations/google-stats/callback`;

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: "Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET" }, { status: 500 });
    }

    const supabase = await createSupabaseServer();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const userId = authData.user.id;

    // Exchange code -> tokens
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
      return NextResponse.json({ error: "Token exchange failed", tokenData }, { status: 500 });
    }

    // Userinfo
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = (await userRes.json()) as GoogleUserInfo;

    if (!userRes.ok || !userInfo?.email) {
      return NextResponse.json({ error: "Userinfo fetch failed", userInfo }, { status: 500 });
    }

    // Preserve refresh_token if Google doesn't return it
    const { data: existing, error: existingErr } = await supabase
      .from("stats_integrations")
      .select("id,refresh_token_enc")
      .eq("user_id", userId)
      .eq("provider", "google")
      .eq("source", source)
      .eq("product", product)
      .maybeSingle();

    if (existingErr) {
      return NextResponse.json({ error: "DB read existing failed", existingErr }, { status: 500 });
    }

    const refreshTokenToStore = tokenData.refresh_token ?? (existing as any)?.refresh_token_enc ?? null;

    const expiresAt =
      tokenData.expires_in != null
        ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString()
        : null;

    const payload: any = {
      user_id: userId,
      provider: "google",
      source,
      product,
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

    if ((existing as any)?.id) {
      const { error: upErr } = await supabase
        .from("stats_integrations")
        .update(payload)
        .eq("id", (existing as any).id);

      if (upErr) {
        return NextResponse.json({ error: "DB update failed", upErr }, { status: 500 });
      }
    } else {
      const { error: insErr } = await supabase.from("stats_integrations").insert(payload);
      if (insErr) {
        return NextResponse.json({ error: "DB insert failed", insErr }, { status: 500 });
      }
    }

    return NextResponse.redirect(new URL(`${returnTo}&linked=${product}&ok=1`, origin));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
