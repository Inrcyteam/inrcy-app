import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { clearAllToolCaches } from "@/lib/statsCache";

export async function POST() {
  const supabase = await createSupabaseServer();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const userId = authData.user.id;
  const { error } = await supabase
    .from("integrations")
    .delete()
    .eq("user_id", userId)
    .eq("provider", "google")
    .eq("source", "gmb")
    .eq("product", "gmb");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await clearAllToolCaches(supabase, userId);
  return NextResponse.json({ ok: true });
}
