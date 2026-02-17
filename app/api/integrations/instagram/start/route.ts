import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const appId = process.env.FACEBOOK_APP_ID;
  const redirectFromEnv = process.env.INSTAGRAM_REDIRECT_URI;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const redirectUri = redirectFromEnv || `${siteUrl}/api/integrations/instagram/callback`;

  if (!appId) return NextResponse.json({ error: "Missing FACEBOOK_APP_ID" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const returnTo = searchParams.get("returnTo") || "/dashboard?panel=instagram";

  const state = Buffer.from(JSON.stringify({ returnTo })).toString("base64url");

  // Instagram Graph API uses Meta OAuth (Facebook dialog) + specific scopes.
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
    scope: [
      "public_profile",
      "email",
      "pages_show_list",
      "pages_read_engagement",
      "instagram_basic",
      "instagram_content_publish",
      "business_management",
    ].join(","),
  });

  const url = `https://www.facebook.com/v20.0/dialog/oauth?${params.toString()}`;
  return NextResponse.redirect(url);
}
