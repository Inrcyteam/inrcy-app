
import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function POST() {
  const supabase = await createSupabaseServer();
  const { data: { user }, error } = await supabase.auth.getUser();

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
    await supabase.from("cache_statistiques").delete().eq("user_id", user.id);
  } catch {}

  return NextResponse.json({ ok: true });
}
