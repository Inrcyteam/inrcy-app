import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { clearAllToolCaches } from "@/lib/statsCache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export async function POST() {
  const supabase = await createSupabaseServer();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  const user = authData?.user;
  if (authErr || !user) return NextResponse.json({ error: "Accès non autorisé." }, { status: 401 });

  const { data: row } = await supabaseAdmin
    .from("integrations")
    .select("meta")
    .eq("user_id", user.id)
    .eq("provider", "instagram")
    .eq("source", "instagram")
    .eq("product", "instagram")
    .maybeSingle();

  const currentMeta = asRecord(asRecord(row)["meta"]);

  await supabase
    .from("integrations")
    .update({
      status: "account_connected",
      resource_id: null,
      resource_label: null,
      meta: {
        ...currentMeta,
        picked: "none",
        page_id: null,
        page_name: null,
        page_source: null,
        business_name: null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("provider", "instagram")
    .eq("source", "instagram")
    .eq("product", "instagram");

  try {
    const { data } = await supabaseAdmin.from("pro_tools_configs").select("settings").eq("user_id", user.id).maybeSingle();
    const current = asRecord(asRecord(data)["settings"]);
    await supabaseAdmin.from("pro_tools_configs").upsert({
      user_id: user.id,
      settings: {
        ...current,
        instagram: {
          ...asRecord(current.instagram),
          accountConnected: true,
          connected: false,
          username: null,
          url: null,
          pageId: null,
          igId: null,
        },
      },
    }, { onConflict: "user_id" });
  } catch {}

  await clearAllToolCaches(supabase, user.id);
  return NextResponse.json({ ok: true });
}
