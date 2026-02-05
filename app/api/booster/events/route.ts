import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

type BoosterEventType = "publish" | "review_mail" | "promo_mail";

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServer();

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const type = body?.type as BoosterEventType;
    const payload = (body?.payload ?? {}) as Record<string, unknown>;

    if (!type || !["publish", "review_mail", "promo_mail"].includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const { error } = await supabase.from("booster_events").insert({
      user_id: userData.user.id,
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
