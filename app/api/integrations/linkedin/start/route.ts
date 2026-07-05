import { NextResponse } from "next/server";
import { makeOAuthState, safeInternalPath } from "@/lib/security";
import { getLinkedInOAuthScope } from "@/lib/linkedinScopes";
import { getCurrentInrcyAccountScope } from "@/lib/multicompte/server";

export async function GET(request: Request) {
  const currentAccount = await getCurrentInrcyAccountScope();
  if (!currentAccount) {
    return NextResponse.json({ error: "Votre session a expiré. Merci de vous reconnecter." }, { status: 401 });
  }
  const accountId = currentAccount.scope.activeUserId;
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const redirectFromEnv = process.env.LINKEDIN_REDIRECT_URI;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const redirectUri = redirectFromEnv || `${siteUrl}/api/integrations/linkedin/callback`;

  if (!clientId) return NextResponse.json({ error: "Configuration LinkedIn incomplète côté serveur." }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const returnTo = safeInternalPath(searchParams.get("returnTo") || "/dashboard?panel=linkedin", "/dashboard?panel=linkedin");
  const { stateB64, cookieValue, cookieName } = makeOAuthState("linkedin", returnTo, { accountId });

  const scope = getLinkedInOAuthScope();

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state: stateB64,
    scope,
  });

  const res = NextResponse.redirect(`https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`);
  res.cookies.set(cookieName, cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
  return res;
}
