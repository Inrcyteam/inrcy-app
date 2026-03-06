import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { clearAllToolCaches } from "@/lib/statsCache";

export async function POST() {
  const supabase = await createSupabaseServer();
  const { data: authData, error } = await supabase.auth.getUser();
  const user = authData?.user;
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  await clearAllToolCaches(supabase, user.id);
  return NextResponse.json({ ok: true });
}
