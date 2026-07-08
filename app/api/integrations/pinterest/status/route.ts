import { NextResponse } from "next/server";

import {
  bubbleAccessDisabledResponse,
  isAppBubbleEnabledForUser,
} from "@/lib/appBubbleAccessServer";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { asRecord, asString } from "@/lib/tsSafe";
import { getChannelConnectionStates } from "@/lib/channelConnectionState";
import {
  fetchPinterestBoards,
  fetchPinterestUserAccount,
  getPinterestAccessToken,
  getPinterestApiEnvironment,
  getPinterestIntegration,
} from "@/lib/pinterestOAuth";
import {
  ensurePinterestDefaultBoardId,
  getPinterestDefaultBoardId,
} from "@/lib/pinterestPreferences";
import { resolveActiveInrcyAccountId } from "@/lib/multicompte/server";

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServer();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    const user = authData?.user;
    if (authErr || !user)
      return NextResponse.json(
        { ok: false, error: "Non authentifié." },
        { status: 401 },
      );
    const activeUserId = await resolveActiveInrcyAccountId(supabase, user.id);

    if (
      !(await isAppBubbleEnabledForUser(supabase, activeUserId, "pinterest"))
    ) {
      return bubbleAccessDisabledResponse("Pinterest");
    }

    const states = await getChannelConnectionStates(supabase, activeUserId);
    const integration = asRecord(
      await getPinterestIntegration(activeUserId).catch(() => ({})),
    );
    let boards: unknown[] = [];
    let boardsLoaded = false;
    let account: Awaited<ReturnType<typeof fetchPinterestUserAccount>> | null =
      null;

    const accessToken = states.pinterest.connected
      ? await getPinterestAccessToken(activeUserId, request.url).catch(() => "")
      : "";
    if (accessToken) {
      const [accountResult, boardsResult] = await Promise.all([
        fetchPinterestUserAccount(accessToken).catch(() => null),
        fetchPinterestBoards(accessToken).catch(() => null),
      ]);
      account = accountResult;
      if (Array.isArray(boardsResult)) {
        boards = boardsResult;
        boardsLoaded = true;
      }
    }

    const connected = Boolean(
      states.pinterest.connected &&
      !states.pinterest.requiresUpdate &&
      accessToken,
    );
    const defaultBoardId = connected
      ? boardsLoaded
        ? await ensurePinterestDefaultBoardId(
            activeUserId,
            boards as Array<{ id: string }>,
          ).catch(() => "")
        : await getPinterestDefaultBoardId(activeUserId).catch(() => "")
      : "";
    return NextResponse.json({
      ok: true,
      connected,
      status: connected ? "connected" : states.pinterest.connection_status,
      accountName: account?.displayName || account?.username || null,
      username: account?.username || null,
      profileUrl: account?.profileUrl || null,
      boards,
      defaultBoardId,
      apiEnvironment: getPinterestApiEnvironment(),
      scopes: asString(integration.scopes) || "",
      expiresAt: asString(integration.expires_at) || null,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Statut Pinterest indisponible." },
      { status: 400 },
    );
  }
}
