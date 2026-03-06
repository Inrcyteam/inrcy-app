import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { asRecord } from "@/lib/tsSafe";

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

  await supabase.from("integrations").delete().eq("user_id", user.id).eq("provider", "facebook");

  try {
    const { data: cfg } = await supabase.from("pro_tools_configs").select("settings").eq("user_id", user.id).maybeSingle();
    const current = asRecord(asRecord(cfg)["settings"]);
    await supabase.from("pro_tools_configs").upsert(
      {
        user_id: user.id,
        settings: {
          ...current,
          facebook: {
            accountConnected: false,
            pageConnected: false,
            userEmail: null,
            pageId: null,
            pageName: null,
            url: null,
          },
        },
      },
      { onConflict: "user_id" }
    );
  } catch {
    // ignore
  }

  try {
    await supabase.from("stats_cache").delete().eq("user_id", user.id).eq("source", "overview");
  } catch {}
  try {
    await supabase.from("cache_statistiques").delete().eq("id_utilisateur", user.id);
  } catch {}
  try {
    await supabase.from("cache_statistiques").delete().eq("user_id", user.id);
  } catch {}

  return NextResponse.json({ ok: true });
}
