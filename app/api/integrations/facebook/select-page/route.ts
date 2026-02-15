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

    // Read existing meta so we don't lose meta.user_access_token, page_url, etc.
    const { data: existing, error: readErr } = await supabase
      .from("stats_integrations")
      .select("meta")
      .eq("user_id", userId)
      .eq("provider", "facebook")
      .eq("source", "facebook")
      .eq("product", "facebook")
      .maybeSingle();

    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

    const prevMeta = ((existing as any)?.meta ?? {}) as any;
    const pageUrl = `https://www.facebook.com/${pageId}`;
    const nextMeta = { ...prevMeta, selected: true, page_url: pageUrl };

    // Update integration with the selected page + PAGE token (required for posting).
    const { error: upErr } = await supabase
      .from("stats_integrations")
      .update({
        resource_id: pageId,
        resource_label: pageName,
        access_token_enc: pageAccessToken,
        status: "connected",
        meta: nextMeta,
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
        facebook: {
          ...(current?.facebook ?? {}),
          accountConnected: true,
          pageConnected: true,
          pageId,
          pageName,
          url: pageUrl,
        },
      };
      await supabase.from("pro_tools_configs").upsert({ user_id: userId, settings: merged }, { onConflict: "user_id" });
    } catch {
      // non-fatal
    }

    return NextResponse.json({ ok: true, pageUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur" }, { status: 500 });
  }
}
