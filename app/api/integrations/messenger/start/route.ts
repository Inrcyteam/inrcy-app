import { NextResponse } from "next/server";
import { messengerScopes } from "@/lib/messengerGraph";

/**
 * Starts the Meta OAuth flow for Messenger (Page Inbox).
 *
 * IMPORTANT:
 * - Your Meta app must have the Messenger product enabled.
 * - The redirect URI must be whitelisted in Meta (Valid OAuth Redirect URIs).
 */
export async function GET(request: Request) {
  const appId = process.env.FACEBOOK_APP_ID;
  const redirectFromEnv = process.env.MESSENGER_REDIRECT_URI;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const redirectUri = redirectFromEnv || `${siteUrl}/api/integrations/messenger/callback`;

  if (!appId) {
    return NextResponse.json({ error: "Missing FACEBOOK_APP_ID" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const returnTo = searchParams.get("returnTo") || "/dashboard?panel=mails";

  const state = Buffer.from(
    JSON.stringify({ returnTo, ts: Date.now() })
  ).toString("base64url");

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
    scope: messengerScopes(),
  });

  const url = `https://www.facebook.com/v20.0/dialog/oauth?${params.toString()}`;
  return NextResponse.redirect(url);
}
