import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

// POST /api/integrations/google-stats/deactivate
// Mode rented (Site iNrCy) : "Déconnecter le suivi"
// - Marque l'intégration comme déconnectée pour l'utilisateur
// - Coupe le suivi iNrCy (sans débrancher GA4/GSC).
//   Les bindings restent en DB pour pouvoir réactiver instantanément.

type SiteSettings = {
  ga4?: { property_id?: string; measurement_id?: string; verified_at?: string };
  gsc?: { property?: string; verified_at?: string };
  [k: string]: any;
};

function safeJsonParse<T>(s: any, fallback: T): T {
  if (!s) return fallback;
  try {
    if (typeof s === "string") return JSON.parse(s) as T;
    return s as T;
  } catch {
    return fallback;
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServer();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as any;
    const source = String(body?.source || "site_inrcy");
    if (source !== "site_inrcy") return NextResponse.json({ error: "Invalid source" }, { status: 400 });

    const { data: prof } = await supabase
      .from("profiles")
      .select("inrcy_site_ownership")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    const ownership = String((prof as any)?.inrcy_site_ownership || "none");
    if (ownership !== "rented") {
      return NextResponse.json({ error: "Désactivation réservée au mode rented." }, { status: 403 });
    }

    // 1) Marquer stats_integrations comme déconnecté (ga4 + gsc) pour l'utilisateur
    await supabase
      .from("stats_integrations")
      .update({ status: "disconnected", access_token_enc: null, refresh_token_enc: null, expires_at: null })
      .eq("user_id", authData.user.id)
      .eq("provider", "google")
      .eq("source", "site_inrcy")
      .in("product", ["ga4", "gsc"]);

    // 2) Couper uniquement la couche iNrCy (on garde les bindings GA4/GSC)
    const { data: cfg } = await supabase
      .from("inrcy_site_configs")
      .select("settings")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    const current = safeJsonParse<SiteSettings>((cfg as any)?.settings, {});
    const next: SiteSettings = { ...(current ?? {}) };
    // On ne supprime pas next.ga4 / next.gsc.
    // On indique simplement que le suivi iNrCy est désactivé.
    (next as any).inrcy_tracking_enabled = false;

    await supabase
      .from("inrcy_site_configs")
      .upsert({ user_id: authData.user.id, settings: next }, { onConflict: "user_id" });

    // 3) Invalider le cache stats (anti-quota) pour que l'UI reflète immédiatement l'OFF.
    // Best-effort: si la table n'existe pas ou si RLS bloque, on ignore.
    try {
      await supabase.from("stats_cache").delete().eq("user_id", authData.user.id).eq("source", "overview");
    } catch {}

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
