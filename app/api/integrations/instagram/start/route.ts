import { NextResponse } from "next/server";
import { makeOAuthState, safeInternalPath } from "@/lib/security";

export async function GET(request: Request) {
  const appId = process.env.FACEBOOK_APP_ID;
  const redirectFromEnv = process.env.INSTAGRAM_REDIRECT_URI;
  const configId = process.env.FACEBOOK_LOGIN_FOR_BUSINESS_CONFIG_ID || process.env.INSTAGRAM_LOGIN_FOR_BUSINESS_CONFIG_ID;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const redirectUri = redirectFromEnv || `${siteUrl}/api/integrations/instagram/callback`;

  if (!appId) return NextResponse.json({ error: "Configuration Facebook incomplète côté serveur." }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const requestedReturnTo = safeInternalPath(searchParams.get("returnTo") || "/dashboard?panel=instagram", "/dashboard?panel=instagram");
  const mode = searchParams.get("mode") === "business" ? "business" : "standard";
  const returnUrl = new URL(requestedReturnTo, siteUrl);
  returnUrl.searchParams.set("ig_mode", mode);
  const returnTo = `${returnUrl.pathname}${returnUrl.search}`;

  const { stateB64, nonce, cookieName } = makeOAuthState("instagram", returnTo);

  // Instagram Graph API uses Meta OAuth (Facebook dialog) + specific scopes.
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    state: stateB64,
    scope: [
      "public_profile",
      "email",
      "pages_show_list",
      "pages_read_engagement",
      "instagram_basic",
      "instagram_manage_insights",
      "instagram_content_publish",
      "instagram_manage_contents",
      "business_management",
    ].join(","),
  });

  if (mode === "business" && configId) params.set("config_id", configId);

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
