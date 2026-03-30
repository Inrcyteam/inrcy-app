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

  await supabaseAdmin.from("integrations").delete().eq("user_id", user.id).eq("provider", "linkedin");
  try {
    const { data } = await supabaseAdmin.from("pro_tools_configs").select("settings").eq("user_id", user.id).maybeSingle();
    const current = asRecord(asRecord(data)["settings"]);
    await supabaseAdmin.from("pro_tools_configs").upsert({
      user_id: user.id,
      settings: {
        ...current,
        linkedin: {
          ...asRecord(current.linkedin),
          accountConnected: false,
          connected: false,
          displayName: null,
          url: null,
        },
      },
    }, { onConflict: "user_id" });
  } catch {}
  await clearAllToolCaches(supabase, user.id);
  return NextResponse.json({ ok: true });
}