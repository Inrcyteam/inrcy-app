import { NextResponse } from "next/server";

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
      "Mail.Read",
      "Mail.ReadWrite",
      "Mail.Send",
      "User.Read",
    ].join(" ")
  );

  // petit state anti-CSRF (non persistant) : suffisant ici car on stocke côté serveur par session supabase.
  const state = Math.random().toString(36).slice(2);
  url.searchParams.set("state", state);

  return NextResponse.redirect(url);
}
