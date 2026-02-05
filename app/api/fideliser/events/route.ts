import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

type FideliserEventType = "newsletter_mail" | "thanks_mail" | "satisfaction_mail";

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServer();

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const type = body?.type as FideliserEventType;
    const payload = (body?.payload ?? {}) as Record<string, unknown>;

    if (!type || !["newsletter_mail", "thanks_mail", "satisfaction_mail"].includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const { error } = await supabase.from("fideliser_events").insert({
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
