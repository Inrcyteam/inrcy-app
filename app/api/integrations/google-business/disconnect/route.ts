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
    .eq("provider", "google")
    .eq("source", "gmb")
    .eq("product", "gmb");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Keep dashboard UX consistent: also flip the module flag in site_configs.settings.
  try {
    const { data: cfg } = await supabase
      .from("site_configs")
      .select("settings")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    const current = (cfg as any)?.settings ?? {};
    const next = {
      ...(current ?? {}),
      gmb: {
        ...(((current ?? {}) as any)?.gmb ?? {}),
        connected: false,
      },
    };

    await supabase.from("site_configs").update({ settings: next }).eq("user_id", authData.user.id);
  } catch {
    // non-blocking
  }

  return NextResponse.json({ ok: true });
}
