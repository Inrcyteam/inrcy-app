import { NextResponse } from "next/server";
import { makeOAuthState, safeInternalPath } from "@/lib/security";

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
  const returnTo = safeInternalPath(searchParams.get("returnTo") || "/dashboard?panel=facebook", "/dashboard?panel=facebook");
  const { stateB64, nonce, cookieName } = makeOAuthState("facebook", returnTo);

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    state: stateB64,
    // NOTE: Facebook expects comma-separated scopes.
    // Keep this minimal so the OAuth flow always succeeds.
    // Page permissions (pages_show_list, ...) require advanced access / review for a SaaS.
    scope: [
      "public_profile",
      "email",
      "pages_show_list",
      "pages_manage_posts",
      "pages_read_engagement",
      "read_insights",
    ].join(","),
  });

  const url = `https://www.facebook.com/v20.0/dialog/oauth?${params.toString()}`;
  const res = NextResponse.redirect(url);
  res.cookies.set(cookieName, nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
  return res;
}
