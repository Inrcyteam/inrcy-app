import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { invalidateUserIntegrationCaches, mergeProToolSettings } from "@/lib/integrationSync";

export async function POST() {
  const supabase = await createSupabaseServer();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = authData.user.id;
  const { error } = await supabase
    .from("integrations")
    .update({
      resource_id: null,
      resource_label: null,
      page_url: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", "google")
    .eq("source", "gmb")
    .eq("product", "gmb");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    await mergeProToolSettings(supabase, userId, "gmb", {
      connected: false,
      url: "",
      resource_id: "",
      locationName: "",
      locationTitle: "",
    });
  } catch {}

  await invalidateUserIntegrationCaches(supabase, userId);
  return NextResponse.json({ ok: true });
}
