import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function POST() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Keep the row but reset resource selection (account remains connected)
  await supabase
    .from("integrations")
    .update({ status: "account_connected", resource_id: null, resource_label: null, meta: { picked: "none" } })
    .eq("user_id", user.id)
    .eq("provider", "instagram")
    .eq("source", "instagram")
    .eq("product", "instagram");

  try {
    const { data: scRow } = await supabase.from("pro_tools_configs").select("settings").eq("user_id", user.id).maybeSingle();
    const current = (scRow as unknown)?.settings ?? {};
    const merged = {
      ...current,
      instagram: {
        ...(current?.instagram ?? {}),
        accountConnected: true,
        connected: false,
        username: null,
        url: null,
        pageId: null,
        igId: null,
      },
    };
    await supabase.from("pro_tools_configs").upsert({ user_id: user.id, settings: merged }, { onConflict: "user_id" });
  } catch {}

  return NextResponse.json({ ok: true });
}
