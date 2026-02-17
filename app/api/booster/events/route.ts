import { NextResponse } from "next/server";
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
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const { error } = await supabase.from("app_events").insert({
      user_id: userId,
      module: "booster",
      type,
      payload,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}