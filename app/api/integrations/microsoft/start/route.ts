import { NextResponse } from "next/server";
import { makeOAuthState, safeInternalPath } from "@/lib/security";

/**
 * Démarre l'OAuth Microsoft (Outlook/Hotmail/Office365) via Microsoft Identity Platform v2.
 * On utilise /common pour supporter comptes perso + org.
 */
export async function GET(req: Request) {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "Missing MICROSOFT_CLIENT_ID or MICROSOFT_REDIRECT_URI" },
      { status: 500 }
    );
  }

  const url = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_mode", "query");

  // Scopes délégués (Graph)
  url.searchParams.set(
    "scope",
    [
      "openid",
      "profile",
      "email",
      "offline_access",
      "Mail.Send",
      "User.Read",
    ].join(" ")
  );

  const { searchParams } = new URL(req.url);
  const returnTo = safeInternalPath(searchParams.get("returnTo") || "/dashboard?panel=mails", "/dashboard?panel=mails");
  const { stateB64, nonce, cookieName } = makeOAuthState("microsoft", returnTo);
  url.searchParams.set("state", stateB64);

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
