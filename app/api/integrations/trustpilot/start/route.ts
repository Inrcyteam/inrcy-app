import { NextResponse } from "next/server";

import { bubbleAccessDisabledResponse, isAppBubbleEnabledForUser } from "@/lib/appBubbleAccessServer";
import { makeOAuthState, safeInternalPath } from "@/lib/security";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getTrustpilotClientId, getTrustpilotRedirectUri } from "@/lib/trustpilotOAuth";

export async function GET(request: Request) {
  const supabase = await createSupabaseServer();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  const user = authData?.user;
  if (authErr || !user) return NextResponse.json({ ok: false, error: "Non authentifié." }, { status: 401 });

  if (!(await isAppBubbleEnabledForUser(supabase, user.id, "trustpilot"))) {
    return bubbleAccessDisabledResponse("Trustpilot");
  }

  const clientId = getTrustpilotClientId();
  const redirectUri = getTrustpilotRedirectUri(request.url);

  if (!clientId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Configuration Trustpilot incomplète côté serveur.",
        hint: `Ajoute TRUSTPILOT_API_KEY/TRUSTPILOT_API_SECRET puis configure cette URI de redirection dans Trustpilot : ${redirectUri}`,
      },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const returnTo = safeInternalPath(
    searchParams.get("returnTo") || "/dashboard?panel=trustpilot",
    "/dashboard?panel=trustpilot",
  );
  const { stateB64, nonce, cookieName } = makeOAuthState("trustpilot", returnTo);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state: stateB64,
  });

  const res = NextResponse.redirect(`https://authenticate.trustpilot.com?${params.toString()}`);
  res.cookies.set(cookieName, nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
  return res;
}
