import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const redirectFromEnv = process.env.LINKEDIN_REDIRECT_URI;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const redirectUri = redirectFromEnv || `${siteUrl}/api/integrations/linkedin/callback`;

  if (!clientId) return NextResponse.json({ error: "Missing LINKEDIN_CLIENT_ID" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const returnTo = searchParams.get("returnTo") || "/dashboard?panel=linkedin";
  const state = Buffer.from(JSON.stringify({ returnTo })).toString("base64url");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    // Only request scopes that are provisioned on the app.
    // Organization/page scopes require additional LinkedIn approval.
    scope: ["openid", "profile", "email", "w_member_social"].join(" "),
  });

  return NextResponse.redirect(`https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`);
}
