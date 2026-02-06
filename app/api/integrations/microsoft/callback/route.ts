import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

type TokenResponse = {
  token_type?: string;
  scope?: string;
  expires_in?: number;
  ext_expires_in?: number;
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

type GraphMe = {
  id?: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
};

function computeExpiresAt(expires_in?: number | null) {
  if (!expires_in) return null;
  return new Date(Date.now() + Number(expires_in) * 1000).toISOString();
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const oauthError = searchParams.get("error");

    if (oauthError) {
      const desc = searchParams.get("error_description") || oauthError;
      return NextResponse.redirect(new URL(`/dashboard?panel=mails&toast=${encodeURIComponent(desc)}`, req.url));
    }

    if (!code) {
      return NextResponse.json({ error: "Missing ?code" }, { status: 400 });
    }

    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    const redirectUri = process.env.MICROSOFT_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      return NextResponse.json(
        { error: "Missing MICROSOFT_CLIENT_ID/SECRET/REDIRECT_URI" },
        { status: 500 }
      );
    }

    const supabase = await createSupabaseServer();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Exchange code -> tokens
    const tokenRes = await fetch(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      }
    );

    const tokenData = (await tokenRes.json().catch(() => ({}))) as TokenResponse;
    if (!tokenRes.ok || !tokenData.access_token) {
      return NextResponse.json(
        { error: "Token exchange failed", tokenData },
        { status: 500 }
      );
    }

    // Fetch /me
    const meRes = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const me = (await meRes.json().catch(() => ({}))) as GraphMe;
    if (!meRes.ok) {
      return NextResponse.json({ error: "Graph /me failed", me }, { status: 500 });
    }

    const email = (me.mail || me.userPrincipalName || "").toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "Unable to resolve email for Microsoft account", me }, { status: 500 });
    }

    const userId = authData.user.id;

    // Preserve refresh token if not returned (rare but possible)
    const { data: existing, error: existingErr } = await supabase
      .from("mail_accounts")
      .select("refresh_token_enc")
      .eq("user_id", userId)
      .eq("provider", "microsoft")
      .eq("email_address", email)
      .maybeSingle();

    if (existingErr) {
      return NextResponse.json({ error: "DB read existing failed", existingErr }, { status: 500 });
    }

    const refreshTokenToStore = tokenData.refresh_token ?? existing?.refresh_token_enc ?? null;

    const payload = {
      user_id: userId,
      provider: "microsoft",
      email_address: email,
      display_name: me.displayName ?? null,
      provider_account_id: me.id ?? null,
      status: "connected",
      scopes: tokenData.scope ?? null,
      access_token_enc: tokenData.access_token,
      refresh_token_enc: refreshTokenToStore,
      expires_at: computeExpiresAt(tokenData.expires_in ?? null),
    };

    const { error: upErr } = await supabase
      .from("mail_accounts")
      .upsert(payload, {
        onConflict: "user_id,provider,email_address",
        ignoreDuplicates: false,
      });

    if (upErr) {
      return NextResponse.json({ error: "DB upsert failed", upErr }, { status: 500 });
    }

    return NextResponse.redirect(new URL("/dashboard?panel=mails&toast=connected", req.url));
  } catch (e: any) {
    return NextResponse.json(
      { error: "Unhandled exception", message: e?.message, stack: e?.stack },
      { status: 500 }
    );
  }
}
