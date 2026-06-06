import { NextResponse } from "next/server";

import { getYoutubeShortsOAuthScope, getYoutubeShortsRedirectUri } from "@/lib/youtubeShortsOAuth";
import { makeOAuthState, safeInternalPath } from "@/lib/security";

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = getYoutubeShortsRedirectUri(request.url);

  if (!clientId) {
    return NextResponse.json({
      ok: false,
      error: "Configuration Google incomplète côté serveur.",
      hint: `Ajoute GOOGLE_CLIENT_ID et configure cette URI de redirection dans Google Cloud : ${redirectUri}`,
    }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const returnTo = safeInternalPath(searchParams.get("returnTo") || "/dashboard?panel=youtube_shorts", "/dashboard?panel=youtube_shorts");
  const { stateB64, nonce, cookieName } = makeOAuthState("youtube_shorts", returnTo);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: getYoutubeShortsOAuthScope(),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: stateB64,
  });

  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  res.cookies.set(cookieName, nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
  return res;
}
