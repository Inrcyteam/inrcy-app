import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { clearAllToolCaches } from "@/lib/statsCache";
import { asRecord } from "@/lib/tsSafe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveActiveInrcyAccountId } from "@/lib/multicompte/server";

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Accès non autorisé." }, { status: 401 });
  }
  const activeUserId = await resolveActiveInrcyAccountId(supabase, user.id);

  const body = await req.json().catch(() => ({}));
  const enabled = body?.enabled === true;

  const { data: scRow, error: readErr } = await supabaseAdmin
    .from("pro_tools_configs")
    .select("settings")
    .eq("user_id", activeUserId)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json({ error: "Impossible de lire la configuration LinkedIn." }, { status: 500 });
  }

  const current = asRecord(asRecord(scRow)["settings"]);
  const currentLinkedin = asRecord(current["linkedin"]);
  const merged = {
    ...current,
    linkedin: {
      ...currentLinkedin,
      shareToPersonalProfile: enabled,
    },
  };

  const { error: saveErr } = await supabaseAdmin
    .from("pro_tools_configs")
    .upsert({ user_id: activeUserId, settings: merged }, { onConflict: "user_id" });

  if (saveErr) {
    return NextResponse.json({ error: "Impossible d'enregistrer l'option LinkedIn." }, { status: 500 });
  }

  await clearAllToolCaches(supabase, activeUserId);

  return NextResponse.json({ ok: true, enabled });
}
