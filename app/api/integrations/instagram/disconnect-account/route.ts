import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { asRecord } from "@/lib/tsSafe";

export async function POST() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await supabase.from("integrations").delete().eq("user_id", user.id).eq("provider", "instagram");

  // Keep pro_tools_configs in sync (best-effort)
  try {
    const { data: scRow } = await supabase.from("pro_tools_configs").select("settings").eq("user_id", user.id).maybeSingle();
    const current = asRecord(asRecord(scRow)["settings"]);
    const merged = {
      ...current,
      instagram: {
        accountConnected: false,
        connected: false,
        username: null,
        url: null,
        pageId: null,
        igId: null,
      },
    };
    await supabase.from("pro_tools_configs").upsert({ user_id: user.id, settings: merged }, { onConflict: "user_id" });
  } catch {}

  return NextResponse.json({ ok: true });
}
