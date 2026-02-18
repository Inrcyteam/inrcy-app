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

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const oauthError = url.searchParams.get("error");

    // Google peut renvoyer ?error=access_denied si l’utilisateur annule
    if (oauthError) {
      return NextResponse.redirect(new URL(`/dashboard?panel=agenda&toast=denied`, url.origin));
    }

    if (!code) {
      return NextResponse.json({ error: "Missing ?code" }, { status: 400 });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    // ✅ IMPORTANT: on calcule le redirectUri (prod/preview/local)
    const origin = url.origin;
    const redirectUri = `${origin}/api/integrations/google-calendar/callback`;

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        {
          error: "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET env vars",
          hint: "Set them in Vercel (Production) and redeploy.",
        },
        { status: 500 }
      );
    }

    const supabase = await createSupabaseServer();
    const { data: authData, error: authErr } = await supabase.auth.getUser();

    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1) Exchange code -> tokens
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

    if (!tokenRes.ok || !tokenData.access_token) {
      return NextResponse.json(
        {
          error: "Token exchange failed",
          details: tokenData?.error_description || tokenData?.error || "unknown",
          tokenData,
        },
        { status: 500 }
      );
    }

    // 2) Get user email
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const userInfo = (await userRes.json()) as GoogleUserInfo;

    if (!userRes.ok || !userInfo?.email) {
      return NextResponse.json(
        {
          error: "Userinfo fetch failed",
          userInfo,
        },
        { status: 500 }
      );
    }

    const userId = authData.user.id;

    // 3) Preserve refresh_token if Google doesn't return it this time
    const { data: existing, error: existingErr } = await supabase
      .from("calendar_accounts")
      .select("refresh_token_enc")
      .eq("user_id", userId)
      .eq("provider", "google")
      .eq("email_address", userInfo.email)
      .maybeSingle();

    if (existingErr) {
      return NextResponse.json({ error: "DB read existing failed", existingErr }, { status: 500 });
    }

    const refreshTokenToStore = tokenData.refresh_token ?? existing?.refresh_token_enc ?? null;

    const expiresAt =
      tokenData.expires_in != null
        ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString()
        : null;

    // 4) Upsert
    const payload = {
      user_id: userId,
      provider: "google",
      category: "calendar",
      source: "gcal",
      product: "gcal",
      email_address: userInfo.email,
      display_name: userInfo.name ?? null,
      provider_account_id: userInfo.id ?? null,
      status: "connected",
      scopes: tokenData.scope ?? null,
      access_token_enc: tokenData.access_token,
      refresh_token_enc: refreshTokenToStore,
      expires_at: expiresAt,
    };

    const { error: upErr } = await supabase
      .from("calendar_accounts")
      .upsert(payload, { onConflict: "user_id,provider,email_address" });

    if (upErr) {
      return NextResponse.json({ error: "DB upsert failed", upErr }, { status: 500 });
    }

    return NextResponse.redirect(new URL("/dashboard?panel=agenda&toast=connected", origin));
  } catch (e: any) {
    return NextResponse.json(
      { error: "Unhandled exception", message: e?.message, stack: e?.stack },
      { status: 500 }
    );
  }
}
