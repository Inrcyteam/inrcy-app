"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import styles from "./ResponsiveBottomNav.module.css";
import { useDashboardCompletionChecks } from "../_hooks/useDashboardCompletionChecks";
import { useDashboardI18n } from "../_hooks/useDashboardI18n";
import { createClient } from "@/lib/supabaseClient";
import { setActiveBrowserUserId } from "@/lib/browserAccountCache";

type DashboardPanelName =
  | "contact"
  | "compte"
  | "profil"
  | "activite"
  | "preferences"
  | "ia"
  | "abonnement"
  | "inertie"
  | "boutique"
  | "parrainage"
  | "legal"
  | "rgpd";

const MOBILE_QUERY = "(max-width: 560px)";

function HomeIcon() {
  return (
    <svg className={styles.homeIcon} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.5 10.7 12 3.8l8.5 6.9" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 9.8v9.1h13V9.8M9.3 18.9v-5.6h5.4v5.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg className={styles.menuIcon} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}


function compactLabels(locale: string) {
  const lang = locale.toLowerCase().split("-")[0];
  if (lang === "en") return { home: "Home", publish: "Publish" };
  if (lang === "es") return { home: "Inicio", publish: "Publicar" };
  if (lang === "it") return { home: "Home", publish: "Pubblica" };
  if (lang === "de") return { home: "Start", publish: "Veröff." };
  if (lang === "pt") return { home: "Início", publish: "Publicar" };
  return { home: "Accueil", publish: "Publier" };
}

function ResponsiveBottomNavMobile() {
  const router = useRouter();
  const pathname = usePathname();
  const t = useDashboardI18n();
  const labels = useMemo(() => compactLabels(t.locale), [t.locale]);
  const { profileIncomplete, activityIncomplete } = useDashboardCompletionChecks();

  const [menuOpen, setMenuOpen] = useState(false);
  const [isLandscapeViewport, setIsLandscapeViewport] = useState(false);
  const [cameraCaptureOpen, setCameraCaptureOpen] = useState(false);
  const [explicitImmersiveModeOpen, setExplicitImmersiveModeOpen] = useState(false);
  const [pendingInrAgentCount, setPendingInrAgentCount] = useState(0);

  useEffect(() => {
    const syncViewport = () => {
      setIsLandscapeViewport(window.innerWidth > window.innerHeight);
    };

    syncViewport();
    window.addEventListener("resize", syncViewport);
    window.addEventListener("orientationchange", syncViewport);
    return () => {
      window.removeEventListener("resize", syncViewport);
      window.removeEventListener("orientationchange", syncViewport);
    };
  }, []);

  useEffect(() => {
    const readCameraState = () => {
      setCameraCaptureOpen(
        document.documentElement.dataset.inrcyCameraCaptureActive === "true",
      );
    };
    const readExplicitImmersiveState = () => {
      setExplicitImmersiveModeOpen(
        document.documentElement.dataset.inrcyImmersiveMode === "true",
      );
    };

    const onCameraStateChange = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean }>).detail;
      if (typeof detail?.active === "boolean") {
        setCameraCaptureOpen(detail.active);
        return;
      }
      readCameraState();
    };
    const onExplicitImmersiveStateChange = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean }>).detail;
      if (typeof detail?.active === "boolean") {
        setExplicitImmersiveModeOpen(detail.active);
        return;
      }
      readExplicitImmersiveState();
    };

    readCameraState();
    readExplicitImmersiveState();
    window.addEventListener("inrcy-camera-capture-active", onCameraStateChange);
    window.addEventListener(
      "inrcy-immersive-mode-change",
      onExplicitImmersiveStateChange,
    );

    return () => {
      window.removeEventListener("inrcy-camera-capture-active", onCameraStateChange);
      window.removeEventListener(
        "inrcy-immersive-mode-change",
        onExplicitImmersiveStateChange,
      );
    };
  }, []);

  const refreshPendingInrAgentCount = useCallback(async () => {
    try {
      const response = await fetch("/api/agent/actions/pending-count", {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) return;
      const payload = await response.json().catch(() => null) as { count?: unknown } | null;
      const nextCount = Number(payload?.count ?? 0);
      setPendingInrAgentCount(Number.isFinite(nextCount) && nextCount > 0 ? Math.round(nextCount) : 0);
    } catch {
      // Le badge ne doit jamais bloquer la navigation mobile.
    }
  }, []);

  useEffect(() => {
    void refreshPendingInrAgentCount();

    const refresh = () => void refreshPendingInrAgentCount();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const interval = window.setInterval(refresh, 60_000);

    window.addEventListener("focus", refresh);
    window.addEventListener("inrcy:agent-actions-changed", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("inrcy:agent-actions-changed", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshPendingInrAgentCount]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const landscapeDocumentRoute =
    pathname.startsWith("/dashboard/factures") ||
    pathname.startsWith("/dashboard/devis");
  const hidden =
    cameraCaptureOpen ||
    explicitImmersiveModeOpen ||
    (landscapeDocumentRoute && isLandscapeViewport);

  useEffect(() => {
    if (hidden) setMenuOpen(false);
  }, [hidden]);

  const navigate = useCallback((href: string) => {
    setMenuOpen(false);
    router.push(href);
  }, [router]);

  const openDashboardPanel = useCallback((panel: DashboardPanelName) => {
    try {
      sessionStorage.setItem("inrcy_panel_explicit_open", "1");
      sessionStorage.setItem("inrcy_last_panel", panel);
    } catch {}
    setMenuOpen(false);
    router.push(`/dashboard?panel=${encodeURIComponent(panel)}`, { scroll: false });
  }, [router]);

  const handleLogout = useCallback(async () => {
    const supabase = createClient();
    setActiveBrowserUserId(null);
    const { error } = await (supabase.auth.signOut as any)({ scope: "local" })
      .catch(() => ({ error: null as { message?: string } | null }));
    if (error) {
      console.error("Erreur déconnexion:", error.message);
      return;
    }
    window.location.replace("/login");
  }, []);

  const pendingLabel = pendingInrAgentCount > 99 ? "99+" : String(pendingInrAgentCount);
  const homeActive = pathname === "/dashboard";
  const inrSendActive = pathname.startsWith("/dashboard/mails");
  const agentActive = pathname.startsWith("/dashboard/agent");
  const hasMenuWarning = profileIncomplete || activityIncomplete;

  return (
    <>
      {menuOpen && !hidden ? (
        <>
          <button
            type="button"
            className={styles.menuBackdrop}
            aria-label={t.drawer.close}
            onClick={() => setMenuOpen(false)}
          />
          <div
            className={styles.menuPanel}
            role="menu"
            aria-label={t.topbar.menu}
          >
            <div className={styles.menuGrid}>
              <button className={styles.menuItem} type="button" role="menuitem" onClick={() => openDashboardPanel("contact")}>
                <span className={styles.menuItemText}>{t.topbar.contact}</span>
              </button>
              <button className={styles.menuItem} type="button" role="menuitem" onClick={() => openDashboardPanel("compte")}>
                <span className={styles.menuItemText}>{t.userMenu.account}</span>
              </button>
              <button className={styles.menuItem} type="button" role="menuitem" onClick={() => openDashboardPanel("profil")}>
                <span className={styles.menuItemText}>{t.userMenu.profile}</span>
                {profileIncomplete ? <span className={styles.menuItemWarning} aria-hidden="true">⚠️</span> : null}
              </button>
              <button className={styles.menuItem} type="button" role="menuitem" onClick={() => openDashboardPanel("activite")}>
                <span className={styles.menuItemText}>{t.userMenu.activity}</span>
                {activityIncomplete ? <span className={styles.menuItemWarning} aria-hidden="true">⚠️</span> : null}
              </button>
              <button className={styles.menuItem} type="button" role="menuitem" onClick={() => openDashboardPanel("preferences")}>
                <span className={styles.menuItemText}>{t.userMenu.preferences}</span>
              </button>
              <button className={styles.menuItem} type="button" role="menuitem" onClick={() => openDashboardPanel("ia")}>
                <span className={styles.menuItemText}>{t.userMenu.ai}</span>
              </button>
              <button className={styles.menuItem} type="button" role="menuitem" onClick={() => navigate("/dashboard/mediatheque")}>
                <span className={styles.menuItemText}>{t.userMenu.media}</span>
              </button>
              <button className={styles.menuItem} type="button" role="menuitem" onClick={() => openDashboardPanel("abonnement")}>
                <span className={styles.menuItemText}>{t.userMenu.subscription}</span>
              </button>
              <button className={styles.menuItem} type="button" role="menuitem" onClick={() => openDashboardPanel("inertie")}>
                <span className={styles.menuItemText}>{t.userMenu.inertia}</span>
              </button>
              <button className={styles.menuItem} type="button" role="menuitem" onClick={() => openDashboardPanel("boutique")}>
                <span className={styles.menuItemText}>{t.userMenu.shop}</span>
              </button>
              <button className={styles.menuItem} type="button" role="menuitem" onClick={() => openDashboardPanel("parrainage")}>
                <span className={styles.menuItemText}>{t.userMenu.referral}</span>
              </button>
              <button className={styles.menuItem} type="button" role="menuitem" onClick={() => openDashboardPanel("legal")}>
                <span className={styles.menuItemText}>{t.userMenu.legal}</span>
              </button>
              <button className={styles.menuItem} type="button" role="menuitem" onClick={() => openDashboardPanel("rgpd")}>
                <span className={styles.menuItemText}>{t.userMenu.rgpd}</span>
              </button>
            </div>
            <div className={styles.menuDivider} />
            <button className={styles.menuDanger} type="button" role="menuitem" onClick={() => void handleLogout()}>
              {t.userMenu.logout}
            </button>
          </div>
        </>
      ) : null}

      <nav
        className={`${styles.root} ${hidden ? styles.rootHidden : ""}`}
        aria-label="Navigation mobile iNrCy"
      >
        <div className={styles.bar}>
          <button
            type="button"
            className={`${styles.item} ${homeActive ? styles.itemActive : ""}`}
            aria-label={labels.home}
            aria-current={homeActive ? "page" : undefined}
            onClick={() => navigate("/dashboard")}
          >
            <span className={styles.iconSlot}><HomeIcon /></span>
          </button>

          <button
            type="button"
            className={`${styles.item} ${inrSendActive ? styles.itemActive : ""}`}
            aria-label="iNrSend"
            aria-current={inrSendActive ? "page" : undefined}
            onClick={() => navigate("/dashboard/mails")}
          >
            <span className={styles.iconSlot}>
              <img className={`${styles.assetIcon} ${styles.inrSendIcon}`} src="/inrsend-logo-seul.png" alt="" aria-hidden="true" />
            </span>
          </button>

          <button
            type="button"
            className={styles.publishItem}
            aria-label={labels.publish}
            onClick={() => navigate("/dashboard?action=publish")}
          >
            <span className={styles.publishButton}>{labels.publish}</span>
          </button>

          <button
            type="button"
            className={`${styles.item} ${agentActive ? styles.itemActive : ""}`}
            aria-label="iNrAgent"
            aria-current={agentActive ? "page" : undefined}
            onClick={() => navigate("/dashboard/agent")}
          >
            <span className={styles.iconSlot}>
              <img className={`${styles.assetIcon} ${styles.agentIcon}`} src="/icons/inr-agent-header.png" alt="" aria-hidden="true" />
              {pendingInrAgentCount > 0 ? <span className={styles.badge} aria-hidden="true">{pendingLabel}</span> : null}
            </span>
          </button>

          <button
            type="button"
            className={`${styles.item} ${menuOpen ? styles.itemActive : ""}`}
            aria-label={t.topbar.openMenu}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <span className={styles.iconSlot}>
              <MenuIcon />
              {hasMenuWarning ? <span className={styles.warning} aria-hidden="true">⚠️</span> : null}
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}

export default function ResponsiveBottomNav() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);

  if (!isMobile) return null;
  return <ResponsiveBottomNavMobile />;
}
