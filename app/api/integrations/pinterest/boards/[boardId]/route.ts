import { NextResponse } from "next/server";

import {
  bubbleAccessDisabledResponse,
  isAppBubbleEnabledForUser,
} from "@/lib/appBubbleAccessServer";
import { createSupabaseServer } from "@/lib/supabaseServer";
import {
  deletePinterestBoard,
  fetchPinterestBoards,
  getPinterestAccessToken,
  updatePinterestBoard,
} from "@/lib/pinterestOAuth";
import { ensurePinterestDefaultBoardId } from "@/lib/pinterestPreferences";
import { resolveActiveInrcyAccountId } from "@/lib/multicompte/server";
import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";

async function resolvePinterestContext(request: Request) {
  const supabase = await createSupabaseServer();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  const user = authData?.user;
  if (authErr || !user)
    return {
      error: NextResponse.json(
        { ok: false, error: "Non authentifié." },
        { status: 401 },
      ),
    };

  const activeUserId = await resolveActiveInrcyAccountId(supabase, user.id);
  if (!(await isAppBubbleEnabledForUser(supabase, activeUserId, "pinterest"))) {
    return { error: bubbleAccessDisabledResponse("Pinterest") };
  }

  const accessToken = await getPinterestAccessToken(activeUserId, request.url);
  if (!accessToken) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Pinterest à reconnecter." },
        { status: 401 },
      ),
    };
  }

  return { accessToken, activeUserId };
}

function cleanBoardName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ boardId: string }> },
) {
  try {
    const resolved = await resolvePinterestContext(request);
    if ("error" in resolved) return resolved.error;

    const { boardId } = await context.params;
    const cleanBoardId = String(boardId || "").trim();
    if (!cleanBoardId)
      return NextResponse.json(
        { ok: false, error: "Tableau Pinterest invalide." },
        { status: 400 },
      );

    const body = await request.json().catch(() => ({}));
    const name = cleanBoardName((body as { name?: unknown })?.name);
    if (!name)
      return NextResponse.json(
        { ok: false, error: "Le nom du tableau est obligatoire." },
        { status: 400 },
      );
    if (name.length > 180)
      return NextResponse.json(
        { ok: false, error: "Le nom du tableau est trop long." },
        { status: 400 },
      );

    const board = await updatePinterestBoard(
      resolved.accessToken,
      cleanBoardId,
      name,
    );
    return NextResponse.json({ ok: true, board });
  } catch (error) {
    const message = getSimpleFrenchErrorMessage(error, "Modification du tableau Pinterest impossible.");
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ boardId: string }> },
) {
  try {
    const resolved = await resolvePinterestContext(request);
    if ("error" in resolved) return resolved.error;

    const { boardId } = await context.params;
    const cleanBoardId = String(boardId || "").trim();
    if (!cleanBoardId)
      return NextResponse.json(
        { ok: false, error: "Tableau Pinterest invalide." },
        { status: 400 },
      );

    await deletePinterestBoard(resolved.accessToken, cleanBoardId);
    const boards = await fetchPinterestBoards(resolved.accessToken).catch(
      () => null,
    );
    const defaultBoardId = Array.isArray(boards)
      ? await ensurePinterestDefaultBoardId(
          resolved.activeUserId,
          boards,
        ).catch(() => "")
      : "";
    return NextResponse.json({ ok: true, defaultBoardId });
  } catch (error) {
    const message = getSimpleFrenchErrorMessage(error, "Suppression du tableau Pinterest impossible.");
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
