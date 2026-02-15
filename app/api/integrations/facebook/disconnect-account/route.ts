import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

// Déconnecte le COMPTE Facebook (supprime l'intégration et remet tout à zéro)
export async function POST() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await supabase
    .from("stats_integrations")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", "facebook");

  // Sync pro tools config
  try {
    const { data: cfg } = await supabase
      .from("configurations_pro_tools")
      .select("id, facebook")
      .eq("user_id", user.id)
      .maybeSingle();

    if (cfg?.id) {
      await supabase
        .from("configurations_pro_tools")
        .update({
          facebook: {
            accountConnected: false,
            pageConnected: false,
            userEmail: null,
            pageId: null,
            pageName: null,
            url: null,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", cfg.id);
    }
  } catch {
    // ignore
  }

  // Invalidate cache
  try {
    await supabase.from("cache_statistiques").delete().eq("user_id", user.id);
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true });
}
