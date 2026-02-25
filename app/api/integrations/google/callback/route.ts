import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { encryptToken } from "@/lib/oauthCrypto";
import { enforceRateLimit, getClientIp } from "@/lib/rateLimit";
import { safeInternalPath, verifyOAuthState } from "@/lib/security";
import { asRecord, asString } from "@/lib/tsSafe";

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
  const origin = new URL(req.url).origin;

  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");

    if (!code) {
      return NextResponse.json({ error: "Missing ?code" }, { status: 400 });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const redirectFromEnv = process.env.GOOGLE_REDIRECT_URI;

    // ✅ Robust redirect_uri (must match the one used in /start)
    const redirectUri = redirectFromEnv || `${origin}/api/integrations/google/callback`;

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET" },
        { status: 500 }
      );
    }

    // ✅ CSRF protection: verify state against HttpOnly cookie
    const st = verifyOAuthState(req, "google", searchParams.get("state"));
    const returnTo = safeInternalPath(st.returnTo || "/dashboard?panel=mails&toast=connected", "/dashboard?panel=mails&toast=connected");

    if (!st.ok) {
      const res = NextResponse.redirect(new URL(`/dashboard?panel=mails&toast=oauth_state`, origin));
      // Clear cookie anyway
      res.cookies.set(st.cookieName, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
      return res;
    }

    const { supabase, user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;
    const userId = user.id;

    // Clear state cookie once used
    // (do it early; if the rest fails, user can restart the flow)
    // We'll attach it to the final response.

    // Rate limit OAuth callbacks
    const rlUser = await enforceRateLimit({
      name: "oauth_google_cb",
      identifier: userId,
      limit: 10,
      window: "10 m",
    });
    if (rlUser) return rlUser;

    const ip = getClientIp(req);
    const rlIp = await enforceRateLimit({
      name: "oauth_google_cb_ip",
      identifier: ip,
      limit: 20,
      window: "10 m",
    });
    if (rlIp) return rlIp;

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
      // Avoid leaking provider response details in prod
      const detail = process.env.NODE_ENV === "production" ? undefined : tokenData;
      return NextResponse.json(
        { error: "Token exchange failed", detail },
        { status: 500 }
      );
    }

    // 2) Get user email
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const userInfo = (await userRes.json()) as GoogleUserInfo;

    if (!userRes.ok || !userInfo?.email) {
      const detail = process.env.NODE_ENV === "production" ? undefined : userInfo;
      return NextResponse.json(
        { error: "Userinfo fetch failed", detail },
        { status: 500 }
      );
    }

    // 3) Read existing row (to preserve refresh_token if not returned)
    const { data: existing, error: existingErr } = await supabase
      .from("integrations")
      .select("id, refresh_token_enc")
      .eq("user_id", userId)
      .eq("provider", "gmail")
      .eq("category", "mail")
      .eq("account_email", userInfo.email)
      .maybeSingle();

    if (existingErr) {
      const detail = process.env.NODE_ENV === "production" ? undefined : existingErr;
      return NextResponse.json({ error: "DB read existing failed", detail }, { status: 500 });
    }

    const refreshTokenEncToStore = tokenData.refresh_token
      ? encryptToken(tokenData.refresh_token)
      : asString(asRecord(existing)["refresh_token_enc"]) ?? null;

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
      access_token: null,
      refresh_token: null,
      access_token_enc: tokenData.access_token ? encryptToken(tokenData.access_token) : null,
      refresh_token_enc: refreshTokenEncToStore,
      expires_at: expiresAt,
      settings: {
        display_name: userInfo.name ?? null,
        scopes_raw: tokenData.scope ?? null,
      },
      updated_at: new Date().toISOString(),
    };

    // 4) Update or insert
    if ((existing as unknown)?.id) {
      const { error: upErr } = await supabase
        .from("integrations")
        .update(payload)
        .eq("id", (existing as Record<string, unknown>)?.id as string);

      if (upErr) {
        const detail = process.env.NODE_ENV === "production" ? undefined : upErr;
        return NextResponse.json({ error: "DB update failed", detail }, { status: 500 });
      }
    } else {
      const { error: insErr } = await supabase.from("integrations").insert(payload);
      if (insErr) {
        const detail = process.env.NODE_ENV === "production" ? undefined : insErr;
        return NextResponse.json({ error: "DB insert failed", detail }, { status: 500 });
      }
    }

    const res = NextResponse.redirect(new URL(returnTo, origin));
    res.cookies.set(st.cookieName, "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return res;
  } catch (e: unknown) {
    // No stack traces to clients in production.
    const message = (e instanceof Error ? e.message : String(e)) || "Server error";
    const body = process.env.NODE_ENV === "production" ? { error: "Server error" } : { error: "Unhandled exception", message };
    return NextResponse.json(body, { status: 500 });
  }
}