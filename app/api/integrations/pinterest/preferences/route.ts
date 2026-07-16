import { NextResponse } from "next/server";

import { bubbleAccessDisabledResponse, isAppBubbleEnabledForUser } from "@/lib/appBubbleAccessServer";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { fetchPinterestBoards, getPinterestAccessToken } from "@/lib/pinterestOAuth";
import { getPinterestDefaultBoardId, getPinterestPublicProfileUrl, setPinterestDefaultBoardId, setPinterestPublicProfileUrl } from "@/lib/pinterestPreferences";
import { resolveActiveInrcyAccountId } from "@/lib/multicompte/server";
import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";

async function resolveContext(request: Request, requireAccessToken = true) {
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

  if (!requireAccessToken) return { activeUserId, accessToken: "" };

  const accessToken = await getPinterestAccessToken(activeUserId, request.url);
  if (!accessToken) {
    return { error: NextResponse.json({ ok: false, error: "Pinterest à reconnecter." }, { status: 401 }) };
  }

  return { activeUserId, accessToken };
}

export async function GET(request: Request) {
  try {
    const resolved = await resolveContext(request, false);
    if ("error" in resolved) return resolved.error;
    const [defaultBoardId, publicProfileUrl] = await Promise.all([
      getPinterestDefaultBoardId(resolved.activeUserId),
      getPinterestPublicProfileUrl(resolved.activeUserId),
    ]);
    return NextResponse.json({ ok: true, defaultBoardId, publicProfileUrl });
  } catch {
    return NextResponse.json({ ok: false, error: "Préférences Pinterest indisponibles." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const input = body && typeof body === "object" && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
    const hasPublicProfileUrl = Object.prototype.hasOwnProperty.call(input, "publicProfileUrl");
    const hasDefaultBoardId = Object.prototype.hasOwnProperty.call(input, "defaultBoardId");
    if (!hasPublicProfileUrl && !hasDefaultBoardId) {
      return NextResponse.json({ ok: false, error: "Aucune préférence Pinterest à enregistrer." }, { status: 400 });
    }

    const resolved = await resolveContext(request, hasDefaultBoardId);
    if ("error" in resolved) return resolved.error;

    let publicProfileUrl = await getPinterestPublicProfileUrl(resolved.activeUserId).catch(() => "");
    let defaultBoardId = await getPinterestDefaultBoardId(resolved.activeUserId).catch(() => "");

    if (hasPublicProfileUrl) {
      publicProfileUrl = await setPinterestPublicProfileUrl(resolved.activeUserId, input.publicProfileUrl);
    }

    if (hasDefaultBoardId) {
      const boardId = String(input.defaultBoardId || "").trim();
      if (!boardId) {
        return NextResponse.json({ ok: false, error: "Choisissez un tableau Pinterest." }, { status: 400 });
      }

      const boards = await fetchPinterestBoards(resolved.accessToken);
      if (!boards.some((board) => board.id === boardId)) {
        return NextResponse.json({ ok: false, error: "Ce tableau Pinterest n'est plus disponible." }, { status: 400 });
      }

      await setPinterestDefaultBoardId(resolved.activeUserId, boardId);
      defaultBoardId = boardId;
    }

    return NextResponse.json({ ok: true, defaultBoardId, publicProfileUrl });
  } catch (error) {
    const message = getSimpleFrenchErrorMessage(error, "Enregistrement des préférences Pinterest impossible.");
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
