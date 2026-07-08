import { NextResponse } from "next/server";

import { bubbleAccessDisabledResponse, isAppBubbleEnabledForUser } from "@/lib/appBubbleAccessServer";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { createPinterestBoard, fetchPinterestBoards, getPinterestAccessToken } from "@/lib/pinterestOAuth";
import { resolveActiveInrcyAccountId } from "@/lib/multicompte/server";

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServer();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    const user = authData?.user;
    if (authErr || !user) return NextResponse.json({ ok: false, error: "Non authentifié." }, { status: 401 });
    const activeUserId = await resolveActiveInrcyAccountId(supabase, user.id);

    if (!(await isAppBubbleEnabledForUser(supabase, activeUserId, "pinterest"))) {
      return bubbleAccessDisabledResponse("Pinterest");
    }

    const accessToken = await getPinterestAccessToken(activeUserId, request.url);
    if (!accessToken) {
      return NextResponse.json({ ok: false, error: "Pinterest à connecter." }, { status: 401 });
    }

    const boards = await fetchPinterestBoards(accessToken);
    return NextResponse.json({ ok: true, boards });
  } catch {
    return NextResponse.json({ ok: false, error: "Impossible de récupérer les tableaux Pinterest." }, { status: 400 });
  }
}


function cleanBoardName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServer();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    const user = authData?.user;
    if (authErr || !user) return NextResponse.json({ ok: false, error: "Non authentifié." }, { status: 401 });
    const activeUserId = await resolveActiveInrcyAccountId(supabase, user.id);

    if (!(await isAppBubbleEnabledForUser(supabase, activeUserId, "pinterest"))) {
      return bubbleAccessDisabledResponse("Pinterest");
    }

    const accessToken = await getPinterestAccessToken(activeUserId, request.url);
    if (!accessToken) {
      return NextResponse.json({ ok: false, error: "Pinterest à reconnecter." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const name = cleanBoardName((body as { name?: unknown })?.name);
    if (!name) return NextResponse.json({ ok: false, error: "Le nom du tableau est obligatoire." }, { status: 400 });
    if (name.length > 180) return NextResponse.json({ ok: false, error: "Le nom du tableau est trop long." }, { status: 400 });

    const board = await createPinterestBoard(accessToken, name);
    return NextResponse.json({ ok: true, board });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Création du tableau Pinterest impossible.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
