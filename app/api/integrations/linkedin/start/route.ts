import { NextResponse } from "next/server";
import { makeOAuthState, safeInternalPath } from "@/lib/security";

export async function GET(request: Request) {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const redirectFromEnv = process.env.LINKEDIN_REDIRECT_URI;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const redirectUri = redirectFromEnv || `${siteUrl}/api/integrations/linkedin/callback`;

  if (!clientId) return NextResponse.json({ error: "Missing LINKEDIN_CLIENT_ID" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const returnTo = safeInternalPath(searchParams.get("returnTo") || "/dashboard?panel=linkedin", "/dashboard?panel=linkedin");
  const { stateB64, nonce, cookieName } = makeOAuthState("linkedin", returnTo);

  const defaultScopes = [
    "openid",
    "profile",
    "email",
    "w_member_social",
  ];

  const scope = (process.env.LINKEDIN_SCOPE_OVERRIDES || defaultScopes.join(" ")).trim();

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state: stateB64,
    scope,
  });

  const res = NextResponse.redirect(`https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`);
  res.cookies.set(cookieName, nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
  return res;
}
