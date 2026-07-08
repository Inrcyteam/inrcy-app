import { NextResponse } from "next/server";

import { bubbleAccessDisabledResponse, isAppBubbleEnabledForUser } from "@/lib/appBubbleAccessServer";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { fetchPinterestBoards, getPinterestAccessToken } from "@/lib/pinterestOAuth";
import { getPinterestDefaultBoardId, setPinterestDefaultBoardId } from "@/lib/pinterestPreferences";
import { resolveActiveInrcyAccountId } from "@/lib/multicompte/server";

async function resolveContext(request: Request) {
  const supabase = await createSupabaseServer();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  const user = authData?.user;
  if (authErr || !user) {
    return { error: NextResponse.json({ ok: false, error: "Non authentifié." }, { status: 401 }) };
  }

  const activeUserId = await resolveActiveInrcyAccountId(supabase, user.id);
  if (!(await isAppBubbleEnabledForUser(supabase, activeUserId, "pinterest"))) {
    return { error: bubbleAccessDisabledResponse("Pinterest") };
  }

  const accessToken = await getPinterestAccessToken(activeUserId, request.url);
  if (!accessToken) {
    return { error: NextResponse.json({ ok: false, error: "Pinterest à reconnecter." }, { status: 401 }) };
  }

  return { activeUserId, accessToken };
}

export async function GET(request: Request) {
  try {
    const resolved = await resolveContext(request);
    if ("error" in resolved) return resolved.error;
    const defaultBoardId = await getPinterestDefaultBoardId(resolved.activeUserId);
    return NextResponse.json({ ok: true, defaultBoardId });
  } catch {
    return NextResponse.json({ ok: false, error: "Préférences Pinterest indisponibles." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const resolved = await resolveContext(request);
    if ("error" in resolved) return resolved.error;

    const body = await request.json().catch(() => ({}));
    const boardId = String((body as { defaultBoardId?: unknown })?.defaultBoardId || "").trim();
    if (!boardId) {
      return NextResponse.json({ ok: false, error: "Choisissez un tableau Pinterest." }, { status: 400 });
    }

    const boards = await fetchPinterestBoards(resolved.accessToken);
    if (!boards.some((board) => board.id === boardId)) {
      return NextResponse.json({ ok: false, error: "Ce tableau Pinterest n'est plus disponible." }, { status: 400 });
    }

    await setPinterestDefaultBoardId(resolved.activeUserId, boardId);
    return NextResponse.json({ ok: true, defaultBoardId: boardId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Enregistrement du tableau par défaut impossible.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
