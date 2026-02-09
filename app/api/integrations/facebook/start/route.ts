import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const appId = process.env.FACEBOOK_APP_ID;
  const redirectFromEnv = process.env.FACEBOOK_REDIRECT_URI;

  // Canonical base URL (prevents redirect_uri mismatches between localhost / preview / prod).
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const redirectUri = redirectFromEnv || `${siteUrl}/api/integrations/facebook/callback`;

  if (!appId) {
    return NextResponse.json({ error: "Missing FACEBOOK_APP_ID" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const returnTo = searchParams.get("returnTo") || "/dashboard?panel=facebook";

  const state = Buffer.from(JSON.stringify({ returnTo })).toString("base64url");

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
    // NOTE: Facebook expects comma-separated scopes.
    // Keep this minimal so the OAuth flow always succeeds.
    // Page permissions (pages_show_list, ...) require advanced access / review for a SaaS.
    scope: [
      "public_profile",
      "email",
          ].join(","),
  });

  const url = `https://www.facebook.com/v20.0/dialog/oauth?${params.toString()}`;
  return NextResponse.redirect(url);
}
