import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { clearAllToolCaches } from "@/lib/statsCache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export async function POST() {
  const supabase = await createSupabaseServer();
  const { data: authData, error } = await supabase.auth.getUser();
  const user = authData?.user;
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error: updErr } = await supabaseAdmin
    .from("integrations")
    .update({
      status: "account_connected",
      resource_id: null,
      resource_label: null,
            updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("provider", "facebook")
    .eq("source", "facebook")
    .eq("product", "facebook");

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  try {
    const { data } = await supabaseAdmin.from("pro_tools_configs").select("settings").eq("user_id", user.id).maybeSingle();
    const current = asRecord(asRecord(data)["settings"]);
    await supabaseAdmin.from("pro_tools_configs").upsert({
      user_id: user.id,
      settings: {
        ...current,
        facebook: {
          ...asRecord(current.facebook),
          pageConnected: false,
          pageId: null,
          pageName: null,
          url: null,
        },
      },
    }, { onConflict: "user_id" });
  } catch {}

  await clearAllToolCaches(supabase, user.id);
  return NextResponse.json({ ok: true });
}