import { NextResponse } from "next/server";

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
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return NextResponse.redirect(url);
}
