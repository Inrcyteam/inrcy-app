import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { invalidateUserIntegrationCaches, mergeProToolSettings } from "@/lib/integrationSync";
import { asRecord, asString } from "@/lib/tsSafe";

export async function POST() {
  const supabase = await createSupabaseServer();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: existing } = await supabase
    .from("integrations")
    .select("meta")
    .eq("user_id", user.id)
    .eq("provider", "facebook")
    .eq("source", "facebook")
    .eq("product", "facebook")
    .maybeSingle();

  const prevMeta = asRecord(asRecord(existing)["meta"]);
  const userAccessTokenEnc = asString(prevMeta["user_access_token_enc"]) || null;

  const { error: updErr } = await supabase
    .from("integrations")
    .update({
      status: "account_connected",
      resource_id: null,
      resource_label: null,
      resource_url: null,
      access_token_enc: userAccessTokenEnc,
      meta: { ...prevMeta, selected: false, page_url: null },
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
    await mergeProToolSettings(supabase, user.id, "facebook", {
      accountConnected: true,
      pageConnected: false,
      pageId: null,
      pageName: null,
      url: null,
    });
  } catch {}

  await invalidateUserIntegrationCaches(supabase, user.id);
  return NextResponse.json({ ok: true });
}
