"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import styles from "./ResponsiveBottomNav.module.css";
import { useDashboardCompletionChecks } from "../_hooks/useDashboardCompletionChecks";
import { useDashboardI18n } from "../_hooks/useDashboardI18n";
import { useDashboardLanguage } from "../_hooks/useDashboardLanguage";
import { useDashboardNotifications } from "../_hooks/useDashboardNotifications";
import { createClient } from "@/lib/supabaseClient";
import { setActiveBrowserUserId } from "@/lib/browserAccountCache";
import { useDashboardUnsavedNavigation } from "./DashboardUnsavedNavigationProvider";
import NotificationMenu from "./NotificationMenu";
import EstablishmentMenu from "./EstablishmentMenu";
import {
  DEFAULT_MOBILE_SHORTCUTS,
  MOBILE_SHORTCUTS_EVENT,
  MOBILE_SHORTCUT_OPTIONS,
  getMobileShortcutLabel,
  getMobileShortcutOption,
  loadMobileShortcutsPreference,
  normalizeMobileShortcuts,
  type MobileShortcutId,
} from "@/lib/mobileShortcuts";
import { APP_LANGUAGE_OPTIONS, getAppLanguageOption, type AppLanguageCode } from "@/lib/appLanguage";


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
  | "rgpd"
  | "notifications";

const MOBILE_QUERY = "(max-width: 1100px)";

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
  if (lang === "en") return { home: "Home", publish: "Publish", shortcuts: "Shortcuts", general: "General", language: "Language", gps: "Usage GPS" };
  if (lang === "es") return { home: "Inicio", publish: "Publicar", shortcuts: "Accesos directos", general: "General", language: "Idioma", gps: "GPS de uso" };
  if (lang === "it") return { home: "Home", publish: "Pubblica", shortcuts: "Scorciatoie", general: "Generale", language: "Lingua", gps: "GPS utilizzo" };
  if (lang === "de") return { home: "Start", publish: "Veröff.", shortcuts: "Schnellzugriffe", general: "Allgemein", language: "Sprache", gps: "Nutzungs-GPS" };
  if (lang === "nl") return { home: "Home", publish: "Publiceren", shortcuts: "Snelkoppelingen", general: "Algemeen", language: "Taal", gps: "Gebruiks-GPS" };
  if (lang === "pt") return { home: "Início", publish: "Publicar", shortcuts: "Atalhos", general: "Geral", language: "Idioma", gps: "GPS de utilização" };
  return { home: "Accueil", publish: "Publier", shortcuts: "Raccourcis", general: "Général", language: "Langue", gps: "GPS d’utilisation" };
}

function ResponsiveBottomNavMobile() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { requestNavigation } = useDashboardUnsavedNavigation();
  const t = useDashboardI18n();
  const { language, setLanguage } = useDashboardLanguage();
  const labels = useMemo(() => compactLabels(t.locale), [t.locale]);
  const { profileIncomplete, activityIncomplete } = useDashboardCompletionChecks();
  const notificationsApi = useDashboardNotifications();

  const [menuOpen, setMenuOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const [isLandscapeViewport, setIsLandscapeViewport] = useState(false);
  const [cameraCaptureOpen, setCameraCaptureOpen] = useState(false);
  const [explicitImmersiveModeOpen, setExplicitImmersiveModeOpen] = useState(false);
  const [pendingInrAgentCount, setPendingInrAgentCount] = useState(0);
  const [shortcuts, setShortcuts] = useState<MobileShortcutId[]>([...DEFAULT_MOBILE_SHORTCUTS]);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const syncViewport = () => setIsLandscapeViewport(window.innerWidth > window.innerHeight);
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
      setCameraCaptureOpen(document.documentElement.dataset.inrcyCameraCaptureActive === "true");
    };
    const readExplicitImmersiveState = () => {
      setExplicitImmersiveModeOpen(document.documentElement.dataset.inrcyImmersiveMode === "true");
    };
    const onCameraStateChange = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean }>).detail;
      if (typeof detail?.active === "boolean") setCameraCaptureOpen(detail.active);
      else readCameraState();
    };
    const onExplicitImmersiveStateChange = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean }>).detail;
      if (typeof detail?.active === "boolean") setExplicitImmersiveModeOpen(detail.active);
      else readExplicitImmersiveState();
    };

    readCameraState();
    readExplicitImmersiveState();
    window.addEventListener("inrcy-camera-capture-active", onCameraStateChange);
    window.addEventListener("inrcy-immersive-mode-change", onExplicitImmersiveStateChange);
    return () => {
      window.removeEventListener("inrcy-camera-capture-active", onCameraStateChange);
      window.removeEventListener("inrcy-immersive-mode-change", onExplicitImmersiveStateChange);
    };
  }, []);

  const refreshPendingInrAgentCount = useCallback(async () => {
    try {
      const response = await fetch("/api/agent/actions/pending-count", { credentials: "include", cache: "no-store" });
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
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
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

  const refreshShortcuts = useCallback(async () => {
    try {
      setShortcuts(await loadMobileShortcutsPreference());
    } catch {
      setShortcuts([...DEFAULT_MOBILE_SHORTCUTS]);
    }
  }, []);

  useEffect(() => {
    void refreshShortcuts();
    const onUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ shortcuts?: unknown }>).detail;
      if (detail?.shortcuts) setShortcuts(normalizeMobileShortcuts(detail.shortcuts));
      else void refreshShortcuts();
    };
    window.addEventListener(MOBILE_SHORTCUTS_EVENT, onUpdated);
    return () => window.removeEventListener(MOBILE_SHORTCUTS_EVENT, onUpdated);
  }, [refreshShortcuts]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/me/role", { credentials: "include", cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => { if (!cancelled) setIsAdmin(Boolean(payload?.isAdmin)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setLanguageOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
    setLanguageOpen(false);
    setNotificationMenuOpen(false);
  }, [pathname]);

  const landscapeDocumentRoute = pathname.startsWith("/dashboard/factures") || pathname.startsWith("/dashboard/devis");
  const hidden = cameraCaptureOpen || explicitImmersiveModeOpen || (landscapeDocumentRoute && isLandscapeViewport);

  // Les modales rendues dans document.body ne reçoivent pas les variables du
  // shell. On expose donc la hauteur du dock au niveau racine, avec 0 lorsque
  // le dock est volontairement masqué (capture caméra / mode immersif).
  useEffect(() => {
    const root = document.documentElement;
    const property = "--inrcy-mobile-bottom-nav-total-height";
    const previousValue = root.style.getPropertyValue(property);
    root.style.setProperty(
      property,
      hidden ? "0px" : "calc(50px + env(safe-area-inset-bottom, 0px))",
    );

    return () => {
      if (previousValue) root.style.setProperty(property, previousValue);
      else root.style.removeProperty(property);
    };
  }, [hidden]);

  useEffect(() => {
    if (!hidden) return;
    setMenuOpen(false);
    setLanguageOpen(false);
    setNotificationMenuOpen(false);
  }, [hidden]);

  const navigate = useCallback((href: string) => {
    void requestNavigation(() => {
      setMenuOpen(false);
      setLanguageOpen(false);
      setNotificationMenuOpen(false);
      if (/^https?:\/\//i.test(href)) window.location.assign(href);
      else router.push(href);
    });
  }, [requestNavigation, router]);

  const openDashboardPanel = useCallback((panel: DashboardPanelName) => {
    void requestNavigation(() => {
      try {
        sessionStorage.setItem("inrcy_panel_explicit_open", "1");
        sessionStorage.setItem("inrcy_last_panel", panel);
      } catch {}
      setMenuOpen(false);
      setLanguageOpen(false);
      setNotificationMenuOpen(false);
      router.push(`/dashboard?panel=${encodeURIComponent(panel)}`, { scroll: false });
    });
  }, [requestNavigation, router]);

  const handleLogout = useCallback(async () => {
    await requestNavigation(async () => {
      const supabase = createClient();
      setActiveBrowserUserId(null);
      const { error } = await (supabase.auth.signOut as any)({ scope: "local" })
        .catch(() => ({ error: null as { message?: string } | null }));
      if (error) {
        console.error("Erreur déconnexion:", error.message);
        return;
      }
      window.location.replace("/login");
    });
  }, [requestNavigation]);

  const currentLanguage = getAppLanguageOption(language);
  const pendingLabel = pendingInrAgentCount > 99 ? "99+" : String(pendingInrAgentCount);
  const homeActive = pathname === "/dashboard" && !searchParams.get("action") && !searchParams.get("panel");
  const publishActive = pathname === "/dashboard" && searchParams.get("action") === "publish";
  const hasMenuWarning = profileIncomplete || activityIncomplete;

  return (
    <>
      <div className={styles.shortcutPreloader} aria-hidden="true">
        {MOBILE_SHORTCUT_OPTIONS.map((option) => option.iconSrc).filter((src): src is string => Boolean(src)).map((src) => (
          <img key={src} src={src} alt="" loading="eager" decoding="async" />
        ))}
      </div>

      {menuOpen && !hidden ? (
        <>
          <button
            type="button"
            className={styles.menuBackdrop}
            aria-label={t.drawer.close}
            onClick={() => { setMenuOpen(false); setLanguageOpen(false); }}
          />
          <div className={styles.menuPanel} role="menu" aria-label={t.topbar.menu}>
            <section className={styles.menuSection} aria-label={labels.shortcuts}>
              <div className={styles.menuSectionTitle}>{labels.shortcuts}</div>
              <div className={styles.shortcutGrid}>
                {shortcuts.map((id) => {
                  const option = getMobileShortcutOption(id);
                  const label = getMobileShortcutLabel(id, t.locale);
                  return (
                    <button
                      key={id}
                      className={styles.shortcutItem}
                      type="button"
                      role="menuitem"
                      onClick={() => navigate(option.href)}
                    >
                      <span className={styles.shortcutIconSlot} aria-hidden="true">
                        {option.iconSrc ? <img src={option.iconSrc} alt="" className={styles.shortcutIconImage} loading="eager" decoding="async" /> : <span className={styles.shortcutIconText}>{option.iconText}</span>}
                        {id === "agent" && pendingInrAgentCount > 0 ? <span className={styles.shortcutBadge}>{pendingLabel}</span> : null}
                      </span>
                      <span className={styles.shortcutLabel}>{label}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <div className={styles.menuDivider} />

            <section className={styles.menuSection} aria-label={labels.general}>
              <div className={styles.menuSectionTitle}>{labels.general}</div>
              <div className={styles.menuGrid}>
                <button className={styles.menuItem} type="button" role="menuitem" onClick={() => openDashboardPanel("contact")}><span className={styles.menuItemText}>{t.topbar.contact}</span></button>
                <button className={styles.menuItem} type="button" role="menuitem" onClick={() => openDashboardPanel("compte")}><span className={styles.menuItemText}>{t.userMenu.account}</span></button>
                <button className={styles.menuItem} type="button" role="menuitem" onClick={() => openDashboardPanel("profil")}><span className={styles.menuItemText}>{t.userMenu.profile}</span>{profileIncomplete ? <span className={styles.menuItemWarning} aria-hidden="true">⚠️</span> : null}</button>
                <button className={styles.menuItem} type="button" role="menuitem" onClick={() => openDashboardPanel("activite")}><span className={styles.menuItemText}>{t.userMenu.activity}</span>{activityIncomplete ? <span className={styles.menuItemWarning} aria-hidden="true">⚠️</span> : null}</button>
                <button className={styles.menuItem} type="button" role="menuitem" onClick={() => openDashboardPanel("preferences")}><span className={styles.menuItemText}>{t.userMenu.preferences}</span></button>
                <button className={styles.menuItem} type="button" role="menuitem" onClick={() => openDashboardPanel("ia")}><span className={styles.menuItemText}>{t.userMenu.ai}</span></button>
                <button className={styles.menuItem} type="button" role="menuitem" onClick={() => navigate("/dashboard/mediatheque")}><span className={styles.menuItemText}>{t.userMenu.media}</span></button>
                <button className={styles.menuItem} type="button" role="menuitem" onClick={() => openDashboardPanel("abonnement")}><span className={styles.menuItemText}>{t.userMenu.subscription}</span></button>
                <button className={styles.menuItem} type="button" role="menuitem" onClick={() => openDashboardPanel("inertie")}><span className={styles.menuItemText}>{t.userMenu.inertia}</span></button>
                <button className={styles.menuItem} type="button" role="menuitem" onClick={() => openDashboardPanel("boutique")}><span className={styles.menuItemText}>{t.userMenu.shop}</span></button>
                <button className={styles.menuItem} type="button" role="menuitem" onClick={() => openDashboardPanel("parrainage")}><span className={styles.menuItemText}>{t.userMenu.referral}</span></button>
                <button className={styles.menuItem} type="button" role="menuitem" onClick={() => navigate("/dashboard/gps")}><span className={styles.menuItemText}>{labels.gps}</span></button>
                <button className={styles.menuItem} type="button" role="menuitem" aria-expanded={languageOpen} onClick={() => setLanguageOpen((open) => !open)}>
                  <span className={styles.menuItemText}>{labels.language}</span>
                  <img className={styles.menuLanguageFlag} src={currentLanguage.flagSrc} alt={currentLanguage.flag} />
                </button>
                {isAdmin ? <button className={styles.menuItem} type="button" role="menuitem" onClick={() => navigate("/dashboard/admin")}><span className={styles.menuItemText}>{t.topbar.admin}</span></button> : null}
                <button className={styles.menuItem} type="button" role="menuitem" onClick={() => openDashboardPanel("legal")}><span className={styles.menuItemText}>{t.userMenu.legal}</span></button>
                <button className={styles.menuItem} type="button" role="menuitem" onClick={() => openDashboardPanel("rgpd")}><span className={styles.menuItemText}>{t.userMenu.rgpd}</span></button>
              </div>

              {languageOpen ? (
                <div className={styles.languageGrid} role="group" aria-label={t.language.panelAria}>
                  {APP_LANGUAGE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`${styles.languageChoice} ${option.value === language ? styles.languageChoiceActive : ""}`}
                      aria-pressed={option.value === language}
                      onClick={() => { void setLanguage(option.value as AppLanguageCode); setLanguageOpen(false); }}
                    >
                      <img src={option.flagSrc} alt={option.flag} />
                      <span>{option.shortLabel}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </section>

            <div className={styles.menuDivider} />
            <button className={styles.menuDanger} type="button" role="menuitem" onClick={() => void handleLogout()}>{t.userMenu.logout}</button>
          </div>
        </>
      ) : null}

      <nav className={`${styles.root} ${hidden ? styles.rootHidden : ""}`} aria-label="Navigation mobile iNrCy">
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

          <EstablishmentMenu
            mobile
            locale={t.locale}
            buttonClassName={styles.item}
            panelClassName={styles.dockEstablishmentPanel}
            onContact={() => openDashboardPanel("contact")}
            onOpen={() => { setMenuOpen(false); setLanguageOpen(false); setNotificationMenuOpen(false); }}
            beforeAccountSwitch={(proceed) => requestNavigation(proceed)}
          />

          <button
            type="button"
            className={`${styles.publishItem} ${publishActive ? styles.publishItemActive : ""}`}
            aria-label={labels.publish}
            aria-current={publishActive ? "page" : undefined}
            aria-disabled={publishActive ? "true" : undefined}
            disabled={publishActive}
            onClick={() => {
              navigate("/dashboard?action=publish");
            }}
          >
            <span className={styles.publishButton}>{labels.publish}</span>
          </button>

          <div className={styles.notificationDockWrap}>
            <NotificationMenu
              notificationMenuOpen={notificationMenuOpen}
              setNotificationMenuOpen={setNotificationMenuOpen}
              unreadNotificationsCount={notificationsApi.unreadNotificationsCount}
              badgeCount={notificationsApi.notificationsCount}
              refreshNotifications={notificationsApi.refreshNotifications}
              notificationsLoading={notificationsApi.notificationsLoading}
              notifications={notificationsApi.notifications}
              notificationsError={notificationsApi.notificationsError}
              openPanel={() => openDashboardPanel("notifications")}
              markAllNotificationsRead={notificationsApi.markAllNotificationsRead}
              markNotificationRead={notificationsApi.markNotificationRead}
              deleteNotification={notificationsApi.deleteNotification}
              onNavigate={navigate}
              mobile
              buttonClassName={styles.item}
              panelClassName={styles.dockNotificationPanel}
              countClassName={styles.badge}
              onOpen={() => { setMenuOpen(false); setLanguageOpen(false); }}
            />
          </div>

          <button
            type="button"
            className={`${styles.item} ${menuOpen ? styles.itemActive : ""}`}
            aria-label={t.topbar.openMenu}
            aria-expanded={menuOpen}
            onClick={() => {
              setNotificationMenuOpen(false);
              setMenuOpen((value) => !value);
              setLanguageOpen(false);
            }}
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
