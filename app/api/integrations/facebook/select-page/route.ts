import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { encryptToken } from "@/lib/oauthCrypto";
import { invalidateUserIntegrationCaches, mergeProToolSettings } from "@/lib/integrationSync";
import { asRecord, asString } from "@/lib/tsSafe";

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServer();
    const { data: auth, error } = await supabase.auth.getUser();
    if (error || !auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = auth.user.id;
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Bad payload" }, { status: 400 });
    const bodyRec = asRecord(body);

    const pageId = String(asString(bodyRec["pageId"]) || "").trim();
    const pageName = String(asString(bodyRec["pageName"]) || "").trim() || null;
    const pageAccessToken = String(asString(bodyRec["pageAccessToken"]) || "").trim();

    if (!pageId || !pageAccessToken) {
      return NextResponse.json({ error: "Missing pageId/pageAccessToken" }, { status: 400 });
    }

    const { data: existing, error: readErr } = await supabase
      .from("integrations")
      .select("meta")
      .eq("user_id", userId)
      .eq("provider", "facebook")
      .eq("source", "facebook")
      .eq("product", "facebook")
      .maybeSingle();

    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

    const prevMeta = asRecord(asRecord(existing)["meta"]);
    const pageUrl = `https://www.facebook.com/${pageId}`;
    const nextMeta = { ...prevMeta, selected: true, page_url: pageUrl };

    const { error: upErr } = await supabase
      .from("integrations")
      .update({
        resource_id: pageId,
        resource_label: pageName,
        resource_url: pageUrl,
        access_token_enc: encryptToken(pageAccessToken),
        status: "connected",
        meta: nextMeta,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("provider", "facebook")
      .eq("source", "facebook")
      .eq("product", "facebook");

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    try {
      await mergeProToolSettings(supabase, userId, "facebook", {
        accountConnected: true,
        pageConnected: true,
        pageId,
        pageName,
        url: pageUrl,
      });
    } catch {}

    await invalidateUserIntegrationCaches(supabase, userId);
    return NextResponse.json({ ok: true, pageUrl });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)) || "Erreur" }, { status: 500 });
  }
}
