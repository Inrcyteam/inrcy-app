import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServer();
    const { data: auth, error } = await supabase.auth.getUser();
    if (error || !auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = auth.user.id;
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Bad payload" }, { status: 400 });

    const pageId = String(body.pageId || "").trim();
    const pageName = String(body.pageName || "").trim() || null;
    const pageAccessToken = String(body.pageAccessToken || "").trim();

    if (!pageId || !pageAccessToken) {
      return NextResponse.json({ error: "Missing pageId/pageAccessToken" }, { status: 400 });
    }

    // Update integration with the selected page + PAGE token (required for posting).
    const { error: upErr } = await supabase
      .from("stats_integrations")
      .update({
        resource_id: pageId,
        resource_label: pageName,
        access_token_enc: pageAccessToken,
        status: "connected",
        meta: { selected: true },
      })
      .eq("user_id", userId)
      .eq("provider", "facebook")
      .eq("source", "facebook")
      .eq("product", "facebook");

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    // Also mirror to pro_tools_configs so UI updates instantly
    try {
      const { data: scRow } = await supabase.from("pro_tools_configs").select("settings").eq("user_id", userId).maybeSingle();
      const current = (scRow as any)?.settings ?? {};
      const merged = {
        ...current,
        facebook: { ...(current?.facebook ?? {}), connected: true, pageId, pageName },
      };
      await supabase.from("pro_tools_configs").upsert({ user_id: userId, settings: merged }, { onConflict: "user_id" });
    } catch {
      // non-fatal
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur" }, { status: 500 });
  }
}
