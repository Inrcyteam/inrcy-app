import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

// Déconnecte uniquement la PAGE (laisse le compte Facebook OAuth connecté)
export async function POST() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: integ, error: integErr } = await supabase
    .from("integrations")
    .select("id, meta")
    .eq("user_id", user.id)
    .eq("provider", "facebook")
    .maybeSingle();

  if (integErr) return NextResponse.json({ error: "DB error" }, { status: 500 });
  if (!integ) return NextResponse.json({ ok: true });

  const meta = { ...asRecord(integ)["meta"] };
  delete asRecord(meta)["page_url"];
  delete asRecord(meta)["page_id"];
  delete asRecord(meta)["page_access_token"];

  await supabase
    .from("integrations")
    .update({
      status: "account_connected",
      resource_id: null,
      resource_label: null,
      resource_url: null,
      // on laisse access_token_enc (token user) intact
      meta,
      updated_at: new Date().toISOString(),
    })
    .eq("id", (integ as Record<string, unknown>)?.id as string);

  // Sync pro tools config
  try {
    const { data: cfg } = await supabase
      .from("configurations_pro_tools")
      .select("id, facebook")
      .eq("user_id", user.id)
      .maybeSingle();

    const current = (cfg as unknown)?.facebook || {};
    const merged = {
      ...current,
      accountConnected: true,
      pageConnected: false,
      pageId: null,
      pageName: null,
      url: null,
    };

    await supabase
      .from("configurations_pro_tools")
      .update({ facebook: merged, updated_at: new Date().toISOString() })
      .eq("id", (cfg as Record<string, unknown>)?.id as string);
  } catch {
    // ignore
  }

  // Invalidate cache
  try {
    await supabase.from("cache_statistiques").delete().eq("user_id", user.id);
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true });
}