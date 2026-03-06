import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { asRecord } from "@/lib/tsSafe";

export async function POST() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error: updErr } = await supabase
    .from("integrations")
    .update({
      status: "account_connected",
      resource_id: null,
      resource_label: null,
      resource_url: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("provider", "facebook")
    .eq("source", "facebook")
    .eq("product", "facebook");

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  try {
    const { data: scRow } = await supabase.from("pro_tools_configs").select("settings").eq("user_id", user.id).maybeSingle();
    const current = asRecord(asRecord(scRow)["settings"]);
    const currentFb = asRecord(current["facebook"]);
    await supabase.from("pro_tools_configs").upsert(
      {
        user_id: user.id,
        settings: {
          ...current,
          facebook: {
            ...currentFb,
            pageConnected: false,
            pageId: null,
            pageName: null,
            url: null,
          },
        },
      },
      { onConflict: "user_id" }
    );
  } catch {}

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
