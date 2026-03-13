import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { clearAllToolCaches } from "@/lib/statsCache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function stripGoogleProduct(settingsNode: unknown, product: string) {
  const next = { ...asRecord(settingsNode) };
  if (product === "ga4") delete next.ga4;
  if (product === "gsc") delete next.gsc;
  return next;
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServer();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const userId = authData.user.id;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const source = typeof body.source === "string" ? body.source : "";
  const product = typeof body.product === "string" ? body.product : "";
  if (!source || !product) return NextResponse.json({ error: "Missing source/product" }, { status: 400 });

  await supabase
    .from("integrations")
    .update({ status: "disconnected", access_token_enc: null, refresh_token_enc: null, expires_at: null })
    .eq("user_id", userId)
    .eq("provider", "google")
    .eq("source", source)
    .eq("product", product);

  try {
    await supabase
      .from("integrations_statistiques")
      .update({ statut: "déconnecté" })
      .eq("id_utilisateur", userId)
      .eq("fournisseur", "Google")
      .eq("source", source)
      .eq("produit", product);
  } catch {}

  try {
    if (source === "site_web") {
      const { data } = await supabaseAdmin.from("pro_tools_configs").select("settings").eq("user_id", userId).maybeSingle();
      const current = asRecord(asRecord(data)["settings"]);
      const siteWeb = asRecord(current.site_web);
      const nextSiteWeb = stripGoogleProduct(siteWeb, product);
      await supabaseAdmin.from("pro_tools_configs").upsert({ user_id: userId, settings: { ...current, site_web: nextSiteWeb } }, { onConflict: "user_id" });
    }
    if (source === "site_inrcy") {
      const { data } = await supabase.from("inrcy_site_configs").select("settings").eq("user_id", userId).maybeSingle();
      const current = stripGoogleProduct(asRecord(asRecord(data)["settings"]), product);
      await supabase.from("inrcy_site_configs").upsert({ user_id: userId, settings: current }, { onConflict: "user_id" });
    }
  } catch {}

  await clearAllToolCaches(supabase, userId);
  return NextResponse.json({ ok: true });
}