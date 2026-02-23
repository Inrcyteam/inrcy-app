import { NextResponse } from "next/server";
import { makeOAuthState, safeInternalPath } from "@/lib/security";

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectFromEnv = process.env.GOOGLE_REDIRECT_URI;

  // ✅ Robust redirect_uri (works on local, preview, prod) even if env is missing.
  const origin = new URL(request.url).origin;
  const redirectUri = redirectFromEnv || `${origin}/api/integrations/google/callback`;

  if (!clientId) {
    // Avoid redirecting to Google with client_id=undefined (hard to debug)
    return NextResponse.json(
      {
        error: "Missing GOOGLE_CLIENT_ID env var",
        hint:
          "Set GOOGLE_CLIENT_ID (and GOOGLE_CLIENT_SECRET) in your deployment environment. " +
          "Also add the redirect URI in Google Cloud Console: " +
          redirectUri,
      },
      { status: 500 }
    );
  }

  // ✅ CSRF-safe OAuth state + safe post-auth redirect
  const { searchParams } = new URL(request.url);
  const returnTo = safeInternalPath(searchParams.get("returnTo") || "/dashboard?panel=mails", "/dashboard?panel=mails");
  const { stateB64, nonce, cookieName } = makeOAuthState("google", returnTo);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" "),
    access_type: "offline",
    prompt: "consent",
    state: stateB64,
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  const res = NextResponse.redirect(url);
  res.cookies.set(cookieName, nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10, // 10 minutes
  });
  return res;
}
