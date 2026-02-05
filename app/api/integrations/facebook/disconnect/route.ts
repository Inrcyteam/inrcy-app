import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function POST() {
  const supabase = await createSupabaseServer();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { error } = await supabase
    .from("stats_integrations")
    .delete()
    .eq("user_id", authData.user.id)
    .eq("provider", "facebook")
    .eq("source", "facebook")
    .eq("product", "facebook");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Keep dashboard UX consistent: also flip the module flag in pro_tools_configs.settings.
  try {
    const { data: cfg } = await supabase
      .from("pro_tools_configs")
      .select("settings")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    const current = (cfg as any)?.settings ?? {};
    const next = {
      ...(current ?? {}),
      facebook: {
        ...(((current ?? {}) as any)?.facebook ?? {}),
        connected: false,
      },
    };

    await supabase.from("pro_tools_configs").upsert({ user_id: authData.user.id, settings: next }, { onConflict: "user_id" });
  } catch {
    // non-blocking
  }

  return NextResponse.json({ ok: true });
}
