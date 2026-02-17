import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
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
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");

    if (!code) {
      return NextResponse.json({ error: "Missing ?code" }, { status: 400 });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const origin = new URL(req.url).origin;
const redirectUri = `${origin}/api/integrations/google/callback`;


    if (!clientId || !clientSecret) {
  return NextResponse.json(
    { error: "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET" },
    { status: 500 }
  );
}

    const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;
  const userId = user.id;
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
        { error: "Token exchange failed", tokenData },
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
        { error: "Userinfo fetch failed", userInfo },
        { status: 500 }
      );
    }

    // 3) Read existing row (to preserve refresh_token if not returned)
    const { data: existing, error: existingErr } = await supabase
      .from("integrations")
      .select("id, refresh_token")
      .eq("user_id", userId)
      .eq("provider", "gmail")
      .eq("category", "mail")
      .eq("account_email", userInfo.email)
      .maybeSingle();

    if (existingErr) {
      return NextResponse.json(
        { error: "DB read existing failed", existingErr },
        { status: 500 }
      );
    }

    const refreshTokenToStore =
      tokenData.refresh_token ?? (existing as any)?.refresh_token ?? null;

    const expiresAt =
      tokenData.expires_in != null
        ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString()
        : null;

    const payload = {
      user_id: userId,
      provider: "gmail",
      category: "mail",
      product: "gmail",
      account_email: userInfo.email,
      provider_account_id: userInfo.id ?? null,
      status: "connected",
      access_token: tokenData.access_token ?? null,
      refresh_token: refreshTokenToStore,
      expires_at: expiresAt,
      settings: {
        display_name: userInfo.name ?? null,
        scopes_raw: tokenData.scope ?? null,
      },
      updated_at: new Date().toISOString(),
    };

    // 4) Update or insert
    if ((existing as any)?.id) {
      const { error: upErr } = await supabase
        .from("integrations")
        .update(payload)
        .eq("id", (existing as any).id);

      if (upErr) {
        return NextResponse.json({ error: "DB update failed", upErr }, { status: 500 });
      }
    } else {
      const { error: insErr } = await supabase.from("integrations").insert(payload);
      if (insErr) {
        return NextResponse.json({ error: "DB insert failed", insErr }, { status: 500 });
      }
    }


    return NextResponse.redirect(
      new URL("/dashboard?panel=mails&toast=connected", req.url)
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: "Unhandled exception", message: e?.message, stack: e?.stack },
      { status: 500 }
    );
  }
}
