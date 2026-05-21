import { NextResponse } from "next/server";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { requireUser } from "@/lib/requireUser";

type BoosterEventType = "publish" | "publish_draft" | "review_mail" | "promo_mail";

export async function GET(req: Request) {
  try {
    const { supabase, user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;

    const url = new URL(req.url);
    const draftId = String(url.searchParams.get("draftId") || "").trim();
    if (!draftId) {
      return NextResponse.json({ error: "Brouillon introuvable." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("app_events")
      .select("id,module,type,payload,created_at")
      .eq("user_id", user.id)
      .eq("id", draftId)
      .eq("module", "booster")
      .eq("type", "publish_draft")
      .maybeSingle();

    if (error) return jsonUserFacingError(error, { status: 500 });
    if (!data) return NextResponse.json({ error: "Brouillon introuvable." }, { status: 404 });

    return NextResponse.json({ ok: true, event: data, payload: (data as any).payload || {} });
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;
    const userId = user.id;
    const body = await req.json().catch(() => ({}));
    const type = body?.type as BoosterEventType;
    const payload = (body?.payload ?? {}) as Record<string, unknown>;
    const draftId = String(body?.draftId || "").trim();

    if (!type || !["publish", "publish_draft", "review_mail", "promo_mail"].includes(type)) {
      return NextResponse.json({ error: "Type d'action invalide." }, { status: 400 });
    }

    if (type === "publish_draft" && draftId) {
      const { data, error } = await supabase
        .from("app_events")
        .update({ payload })
        .eq("id", draftId)
        .eq("user_id", userId)
        .eq("module", "booster")
        .eq("type", "publish_draft")
        .select("id")
        .maybeSingle();

      if (error) return jsonUserFacingError(error, { status: 500 });
      if (!data) return NextResponse.json({ error: "Brouillon introuvable." }, { status: 404 });
      return NextResponse.json({ ok: true, id: data.id });
    }

    const { data, error } = await supabase
      .from("app_events")
      .insert({
        user_id: userId,
        module: "booster",
        type,
        payload,
      })
      .select("id")
      .single();

    if (error) {
      return jsonUserFacingError(error, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data?.id || null });
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
}
