import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { invalidateUserIntegrationCaches, mergeProToolSettings } from "@/lib/integrationSync";

export async function POST() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error: updateErr } = await supabase
    .from("integrations")
    .update({
      status: "disconnected",
      access_token_enc: null,
      refresh_token_enc: null,
      expires_at: null,
      resource_id: null,
      resource_label: null,
      resource_url: null,
      meta: { picked: "none", page_url: null, user_access_token: null, user_access_token_enc: null },
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("provider", "facebook")
    .eq("source", "facebook")
    .eq("product", "facebook");

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  try {
    await mergeProToolSettings(supabase, user.id, "facebook", {
      accountConnected: false,
      pageConnected: false,
      userEmail: null,
      pageId: null,
      pageName: null,
      url: null,
    });
  } catch {}

  await invalidateUserIntegrationCaches(supabase, user.id);
  return NextResponse.json({ ok: true });
}
