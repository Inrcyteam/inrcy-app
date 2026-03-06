import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { clearAllToolCaches } from "@/lib/statsCache";

export async function POST() {
  const supabase = await createSupabaseServer();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  const user = authData?.user;
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await supabase
    .from("integrations")
    .update({ status: "account_connected", resource_id: null, resource_label: null, meta: { picked: "none" } })
    .eq("user_id", user.id)
    .eq("provider", "instagram")
    .eq("source", "instagram")
    .eq("product", "instagram");

  await clearAllToolCaches(supabase, user.id);
  return NextResponse.json({ ok: true });
}
