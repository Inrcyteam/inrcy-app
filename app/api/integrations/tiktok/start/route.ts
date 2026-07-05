import { NextResponse } from "next/server";
import { getCurrentInrcyAccountScope } from "@/lib/multicompte/server";

import { safeInternalPath, makeOAuthState } from "@/lib/security";
import { getTiktokOAuthScope, getTiktokRedirectUri } from "@/lib/tiktokOAuth";

export async function GET(request: Request) {
  const currentAccount = await getCurrentInrcyAccountScope();
  if (!currentAccount) {
    return NextResponse.json({ error: "Votre session a expiré. Merci de vous reconnecter." }, { status: 401 });
  }
  const accountId = currentAccount.scope.activeUserId;
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  if (!clientKey) {
    return NextResponse.json({ ok: false, error: "Configuration TikTok incomplète côté serveur." }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const returnTo = safeInternalPath(searchParams.get("returnTo") || "/dashboard?panel=tiktok", "/dashboard?panel=tiktok");
  const redirectUri = getTiktokRedirectUri(request.url);
  const { stateB64, cookieValue, cookieName } = makeOAuthState("tiktok", returnTo, { accountId });

  const params = new URLSearchParams({
    client_key: clientKey,
    response_type: "code",
    scope: getTiktokOAuthScope(),
    redirect_uri: redirectUri,
    state: stateB64,
  });

  const res = NextResponse.redirect(`https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`);
  res.cookies.set(cookieName, cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
  return res;
}
