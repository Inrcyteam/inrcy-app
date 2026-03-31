import { NextResponse } from "next/server";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { requireUser } from "@/lib/requireUser";

type BoosterEventType = "publish" | "review_mail" | "promo_mail";

export async function POST(req: Request) {
  try {
    const { supabase, user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;
    const userId = user.id;
const body = await req.json().catch(() => ({}));
    const type = body?.type as BoosterEventType;
    const payload = (body?.payload ?? {}) as Record<string, unknown>;

    if (!type || !["publish", "review_mail", "promo_mail"].includes(type)) {
      return NextResponse.json({ error: "Type d'action invalide." }, { status: 400 });
    }

    const { error } = await supabase.from("app_events").insert({
      user_id: userId,
      module: "booster",
      type,
      payload,
    });

    if (error) {
      return jsonUserFacingError(error, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
}