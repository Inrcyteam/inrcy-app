import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { clearAllToolCaches } from "@/lib/statsCache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function asString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return null;
}

type SiteSettings = { ga4?: { property_id?: string; measurement_id?: string; verified_at?: string }; gsc?: { property?: string; verified_at?: string }; [k: string]: unknown };
function safeJsonParse<T>(s: unknown, fallback: T): T { try { return typeof s === 'string' ? JSON.parse(s) as T : ((s as T) || fallback); } catch { return fallback; } }

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServer();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    const userId = authData.user.id;

    const body = asRecord((await req.json().catch(() => ({}))) as unknown);
    const source = asString(body["source"]) ?? "site_inrcy";
    if (source !== "site_inrcy") return NextResponse.json({ error: "Source invalide." }, { status: 400 });

    await supabaseAdmin.from("integrations").update({ status: "disconnected", access_token_enc: null, refresh_token_enc: null, expires_at: null }).eq("user_id", userId).eq("provider", "google").eq("source", "site_inrcy").in("product", ["ga4", "gsc"]);
    try {
      await supabase.from("integrations_statistiques").update({ statut: "déconnecté" }).eq("id_utilisateur", userId).eq("fournisseur", "Google").eq("source", "site_inrcy").in("produit", ["ga4", "gsc"]);
    } catch {}

    const { data: cfg } = await supabase.from("inrcy_site_configs").select("settings").eq("user_id", userId).maybeSingle();
    const current = safeJsonParse<SiteSettings>(asRecord(cfg)["settings"], {});
    const next: SiteSettings = { ...(current ?? {}), inrcy_tracking_enabled: false };
    await supabase.from("inrcy_site_configs").upsert({ user_id: userId, settings: next }, { onConflict: "user_id" });

    await clearAllToolCaches(supabase, userId);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)) || "Une erreur est survenue. Merci de réessayer." }, { status: 500 });
  }
}