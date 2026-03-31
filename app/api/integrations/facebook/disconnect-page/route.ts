import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { clearAllToolCaches } from "@/lib/statsCache";
import { asRecord, asString } from "@/lib/tsSafe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";

export async function POST() {
  try {
    const supabase = await createSupabaseServer();
    const { data: authData, error } = await supabase.auth.getUser();
    const user = authData?.user;
    if (error || !user) return NextResponse.json({ error: "Accès non autorisé." }, { status: 401 });

    const { data: existing, error: readErr } = await supabaseAdmin
      .from("integrations")
      .select("meta")
      .eq("user_id", user.id)
      .eq("provider", "facebook")
      .eq("source", "facebook")
      .eq("product", "facebook")
      .maybeSingle();

    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

    const existingRec = asRecord(existing);
    const prevMeta = asRecord(existingRec["meta"]);
    const userTokenEnc = asString(prevMeta["user_access_token_enc"]) || null;
    const nextMeta = {
      ...prevMeta,
      selected: false,
      picked: "none",
      page_url: null,
      page_access_token_enc: null,
    };

    const { error: updErr } = await supabaseAdmin
      .from("integrations")
      .update({
        status: "account_connected",
        resource_id: null,
        resource_label: null,
        access_token_enc: userTokenEnc,
        meta: nextMeta,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("provider", "facebook")
      .eq("source", "facebook")
      .eq("product", "facebook");

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    try {
      const { data: scRow } = await supabaseAdmin.from("pro_tools_configs").select("settings").eq("user_id", user.id).maybeSingle();
      const current = asRecord(asRecord(scRow)["settings"]);
      const currentFb = asRecord(current["facebook"]);
      const merged = {
        ...current,
        facebook: {
          ...currentFb,
          pageConnected: false,
          pageId: null,
          pageName: null,
          url: null,
        },
      };
      await supabaseAdmin.from("pro_tools_configs").upsert({ user_id: user.id, settings: merged }, { onConflict: "user_id" });
    } catch {
      // non-fatal
    }

    await clearAllToolCaches(supabase, user.id);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return jsonUserFacingError(e, { status: 500 });
  }
}
