import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

// POST /api/integrations/google-stats/deactivate
// Mode rented (Site iNrCy) : "Déconnecter le suivi"
// - Marque l'intégration comme déconnectée pour l'utilisateur (ga4 + gsc)
// - Coupe le suivi iNrCy (sans débrancher GA4/GSC).

type SiteSettings = {
  ga4?: { property_id?: string; measurement_id?: string; verified_at?: string };
  gsc?: { property?: string; verified_at?: string };
  [k: string]: unknown;
};

function safeJsonParse<T>(s: unknown, fallback: T): T {
  if (!s) return fallback;
  try {
    if (typeof s === "string") return JSON.parse(s) as T;
    return s as T;
  } catch {
    return fallback;
  }
}

async function purgeStatsCache(supabase: unknown, userId: string) {
  try {
    await supabase.from("stats_cache").delete().eq("user_id", userId);
  } catch {}
  try {
    await supabase.from("cache_statistiques").delete().eq("id_utilisateur", userId);
  } catch {}
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServer();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const userId = authData.user.id;

    const body = (await req.json().catch(() => ({}))) as unknown;
    const source = String(body?.source || "site_inrcy");
    if (source !== "site_inrcy") return NextResponse.json({ error: "Invalid source" }, { status: 400 });

    const { data: prof } = await supabase
      .from("profiles")
      .select("inrcy_site_ownership")
      .eq("user_id", userId)
      .maybeSingle();

    const ownership = String((prof as unknown)?.inrcy_site_ownership || "none");
    if (ownership !== "rented") {
      return NextResponse.json({ error: "Désactivation réservée au mode rented." }, { status: 403 });
    }

    // 1) Nouveau système
    await supabase
      .from("integrations")
      .update({ status: "disconnected", access_token_enc: null, refresh_token_enc: null, expires_at: null })
      .eq("user_id", userId)
      .eq("provider", "google")
      .eq("source", "site_inrcy")
      .in("product", ["ga4", "gsc"]);

    // 2) Legacy
    try {
      await supabase
        .from("integrations_statistiques")
        .update({ statut: "déconnecté" })
        .eq("id_utilisateur", userId)
        .eq("fournisseur", "Google")
        .eq("source", "site_inrcy")
        .in("produit", ["ga4", "gsc"]);
    } catch {}

    // 3) Couper uniquement la couche iNrCy
    const { data: cfg } = await supabase
      .from("inrcy_site_configs")
      .select("settings")
      .eq("user_id", userId)
      .maybeSingle();

    const current = safeJsonParse<SiteSettings>((cfg as unknown)?.settings, {});
    const next: SiteSettings = { ...(current ?? {}) };
    asRecord(next)["inrcy_tracking_enabled"] = false;

    await supabase.from("inrcy_site_configs").upsert({ user_id: userId, settings: next }, { onConflict: "user_id" });

    await purgeStatsCache(supabase, userId);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}