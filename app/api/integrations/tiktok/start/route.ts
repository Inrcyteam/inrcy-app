import { NextResponse } from "next/server";

import { safeInternalPath, makeOAuthState } from "@/lib/security";
import { getTiktokOAuthScope, getTiktokRedirectUri } from "@/lib/tiktokOAuth";

export async function GET(request: Request) {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  if (!clientKey) {
    return NextResponse.json({ ok: false, error: "Configuration TikTok incomplète côté serveur." }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const returnTo = safeInternalPath(searchParams.get("returnTo") || "/dashboard?panel=tiktok", "/dashboard?panel=tiktok");
  const redirectUri = getTiktokRedirectUri(request.url);
  const { stateB64, nonce, cookieName } = makeOAuthState("tiktok", returnTo);

  const params = new URLSearchParams({
    client_key: clientKey,
    response_type: "code",
    scope: getTiktokOAuthScope(),
    redirect_uri: redirectUri,
    state: stateB64,
  });

  const res = NextResponse.redirect(`https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`);
  res.cookies.set(cookieName, nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
  return res;
}
