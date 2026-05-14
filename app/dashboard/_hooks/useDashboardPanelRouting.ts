"use client";

import { useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export type DashboardPanelName =
  | "contact"
  | "profil"
  | "compte"
  | "activite"
  | "ia"
  | "abonnement"
  | "mails"
  | "agenda"
  | "site_inrcy"
  | "site_web"
  | "instagram"
  | "linkedin"
  | "gmb"
  | "facebook"
  | "legal"
  | "rgpd"
  | "inertie"
  | "boutique"
  | "notifications"
  | "parrainage"
  | "documents";

const PANEL_RETURN_QUERY_KEYS = ["linked", "ok", "error", "message", "warning", "toast", "activated", "skipped"];

function rememberDashboardScroll() {
  try {
    sessionStorage.setItem("inrcy_dashboard_scrollY", String(window.scrollY ?? 0));
  } catch {}
}

export function useDashboardPanelRouting() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const panel = searchParams.get("panel");

  const openPanel = useCallback(
    (name: DashboardPanelName) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("panel", name);
      // ✅ Marqueur: panneau ouvert volontairement par l'utilisateur.
      // Sert à éviter l'ouverture automatique en boucle lors d'un refresh/connexion.
      try {
        sessionStorage.setItem("inrcy_panel_explicit_open", "1");
        sessionStorage.setItem("inrcy_last_panel", name);
      } catch {}
      // ✅ En mobile, on garde la position de scroll (pas de jump en haut)
      rememberDashboardScroll();
      router.push(`/dashboard?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const closePanel = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("panel");
    PANEL_RETURN_QUERY_KEYS.forEach((key) => {
      params.delete(key);
    });
    const qs = params.toString();
    // ✅ Quand on ferme, on remet le marqueur à zéro.
    // (Sinon un refresh pourrait relancer un panneau si une logique externe remet ?panel=...)
    try {
      sessionStorage.removeItem("inrcy_panel_explicit_open");
      sessionStorage.removeItem("inrcy_last_panel");
    } catch {}
    // ✅ En mobile, on garde la position de scroll (pas de jump en haut)
    rememberDashboardScroll();
    router.replace(qs ? `/dashboard?${qs}` : "/dashboard", { scroll: false });
  }, [router, searchParams]);

  // ✅ Sécurité UX: si l'URL arrive avec ?panel=profil (ou compte) sans action explicite
  // (cas observé: refresh/connexion + ancienne URL), on ferme automatiquement.
  // ⚠️ On ne touche PAS aux panels utilisés comme retours OAuth/Stripe (abonnement, mails, etc.).
  useEffect(() => {
    if (panel !== "profil" && panel !== "compte") return;
    try {
      const explicit = sessionStorage.getItem("inrcy_panel_explicit_open");
      if (explicit) return;
    } catch {
      // si sessionStorage indisponible, on ne force rien
      return;
    }
    closePanel();
  }, [panel, closePanel]);

  // Preserve dashboard scroll position when leaving the dashboard (vers un module)
  const goToModule = useCallback(
    (path: string) => {
      rememberDashboardScroll();
      // IMPORTANT: en allant dans un module, on VEUT arriver en haut de page.
      // On ne désactive donc PAS le scroll automatique de Next ici.
      router.push(path);
    },
    [router]
  );

  useEffect(() => {
    try {
      const y = sessionStorage.getItem("inrcy_dashboard_scrollY");
      if (!y) return;
      const top = Math.max(0, parseInt(y, 10) || 0);
      // Let the page paint, then restore
      requestAnimationFrame(() => window.scrollTo(0, top));
      setTimeout(() => window.scrollTo(0, top), 60);
      sessionStorage.removeItem("inrcy_dashboard_scrollY");
    } catch {}
  }, [panel]);

  return { panel, openPanel, closePanel, goToModule };
}
