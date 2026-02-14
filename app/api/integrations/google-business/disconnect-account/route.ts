import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

// Disconnect the Google account (OAuth): removes tokens and any selected location.
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

  // Invalidate cached stats so UI reflects disconnection immediately.
  try {
    await supabase.from("stats_cache").delete().eq("user_id", authData.user.id).eq("source", "overview");
  } catch {}
  // Legacy cache table (older system)
  try {
    await supabase.from("cache_statistiques").delete().eq("id_de_l_utilisateur", authData.user.id);
  } catch {}
  try {
    await supabase.from("cache_statistiques").delete().eq("user_id", authData.user.id);
  } catch {}

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
      gmb: {
        ...(((current ?? {}) as any)?.gmb ?? {}),
        connected: false,
        url: "",
        resource_id: "",
        accountEmail: "",
      },
    };

    await supabase.from("pro_tools_configs").upsert({ user_id: authData.user.id, settings: next }, { onConflict: "user_id" });
  } catch {
    // non-blocking
  }

  return NextResponse.json({ ok: true });
}
