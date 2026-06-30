import { NextResponse } from "next/server";

import { bubbleAccessDisabledResponse, isAppBubbleEnabledForUser } from "@/lib/appBubbleAccessServer";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { asRecord, asString } from "@/lib/tsSafe";
import { getChannelConnectionStates } from "@/lib/channelConnectionState";
import { getPinterestIntegration, getPinterestAccessToken, fetchPinterestBoards } from "@/lib/pinterestOAuth";

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServer();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    const user = authData?.user;
    if (authErr || !user) return NextResponse.json({ ok: false, error: "Non authentifié." }, { status: 401 });

    if (!(await isAppBubbleEnabledForUser(supabase, user.id, "pinterest"))) {
      return bubbleAccessDisabledResponse("Pinterest");
    }

    const states = await getChannelConnectionStates(supabase, user.id);
    const integration = asRecord(await getPinterestIntegration(user.id).catch(() => ({})));
    const meta = asRecord(integration.meta);
    let boards = Array.isArray(meta.boards) ? meta.boards : [];

    const accessToken = states.pinterest.connected ? await getPinterestAccessToken(user.id, request.url).catch(() => "") : "";
    if (accessToken) {
      boards = await fetchPinterestBoards(accessToken).catch(() => boards);
    }

    return NextResponse.json({
      ok: true,
      connected: states.pinterest.connected && !states.pinterest.requiresUpdate,
      status: states.pinterest.connection_status,
      username: states.pinterest.username,
      profileUrl: states.pinterest.profile_url,
      defaultBoardId: states.pinterest.default_board_id,
      defaultBoardName: states.pinterest.default_board_name,
      boards,
      scopes: asString(integration.scopes) || "",
      expiresAt: asString(integration.expires_at) || null,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Statut Pinterest indisponible." }, { status: 400 });
  }
}
