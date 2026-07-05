import { NextResponse } from "next/server";

import { bubbleAccessDisabledResponse, isAppBubbleEnabledForUser } from "@/lib/appBubbleAccessServer";
import { getPinterestClientId, getPinterestOAuthScope, getPinterestRedirectUri } from "@/lib/pinterestOAuth";
import { makeOAuthState, safeInternalPath } from "@/lib/security";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { resolveActiveInrcyAccountId } from "@/lib/multicompte/server";

export async function GET(request: Request) {
  const supabase = await createSupabaseServer();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  const user = authData?.user;
  if (authErr || !user) return NextResponse.json({ ok: false, error: "Non authentifié." }, { status: 401 });
  const activeUserId = await resolveActiveInrcyAccountId(supabase, user.id);

  if (!(await isAppBubbleEnabledForUser(supabase, activeUserId, "pinterest"))) {
    return bubbleAccessDisabledResponse("Pinterest");
  }

  const clientId = getPinterestClientId();
  const redirectUri = getPinterestRedirectUri(request.url);

  if (!clientId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Configuration Pinterest incomplète côté serveur.",
        hint: `Ajoute PINTEREST_CLIENT_ID/PINTEREST_CLIENT_SECRET puis configure cette URI de redirection dans Pinterest : ${redirectUri}`,
      },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const returnTo = safeInternalPath(
    searchParams.get("returnTo") || "/dashboard?panel=pinterest",
    "/dashboard?panel=pinterest",
  );
  const { stateB64, cookieValue, cookieName } = makeOAuthState("pinterest", returnTo, { accountId: activeUserId });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: getPinterestOAuthScope(),
    state: stateB64,
  });

  const res = NextResponse.redirect(`https://www.pinterest.com/oauth/?${params.toString()}`);
  res.cookies.set(cookieName, cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
  return res;
}
