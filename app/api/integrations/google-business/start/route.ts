import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectFromEnv = process.env.GOOGLE_GMB_REDIRECT_URI;

  // Canonical base URL to avoid redirect_uri mismatches between localhost / preview / prod.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const redirectUri = redirectFromEnv || `${siteUrl}/api/integrations/google-business/callback`;

  if (!clientId) {
    return NextResponse.json({ error: "Missing GOOGLE_CLIENT_ID" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const returnTo = searchParams.get("returnTo") || "/dashboard?panel=gmb";

  const state = Buffer.from(JSON.stringify({ returnTo })).toString("base64url");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    scope: [
      "https://www.googleapis.com/auth/business.manage",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" "),
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return NextResponse.redirect(url);
}
