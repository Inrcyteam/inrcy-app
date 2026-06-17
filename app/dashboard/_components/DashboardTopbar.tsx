"use client";

import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import { useRouter } from "next/navigation";

import styles from "../dashboard.module.css";
import NotificationMenu from "./NotificationMenu";
import UserMenu from "./UserMenu";
import type { NotificationItem } from "../dashboard.types";

type DashboardPanelName =
  | "contact"
  | "profil"
  | "inrbadge"
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
  | "tiktok"
  | "youtube_shorts"
  | "inr_agent"
  | "legal"
  | "rgpd"
  | "inertie"
  | "boutique"
  | "notifications"
  | "parrainage"
  | "documents";


const INR_AGENT_ROUTE = "/dashboard/agent";
const INR_AGENT_PRELOAD_ASSETS = [
  "/agent/inr-agent-robot-cutout.webp",
  "/icons/inr-agent-header.png",
  "/icons/inrcy.png",
  "/icons/site-web.jpg",
  "/icons/google.jpg",
  "/icons/facebook.png",
  "/icons/instagram.jpg",
  "/icons/linkedin.png",
  "/icons/tiktok.png",
  "/icons/youtube-shorts.png",
  "/icons/mails-inrcy-dashboard-v2.png",
];

const preloadedInrAgentAssets = new Set<string>();

function preloadInrAgentImages() {
  if (typeof window === "undefined") return;

  for (const src of INR_AGENT_PRELOAD_ASSETS) {
    if (preloadedInrAgentAssets.has(src)) continue;

    const image = new window.Image();
    image.decoding = "async";
    image.loading = "eager";
    image.src = src;
    preloadedInrAgentAssets.add(src);
  }
}

type DashboardTopbarProps = {
  desktopNotificationMenuRef: RefObject<HTMLDivElement | null>;
  mobileNotificationMenuRef: RefObject<HTMLDivElement | null>;
  userMenuRef: RefObject<HTMLDivElement | null>;
  menuRef: RefObject<HTMLDivElement | null>;
  notificationMenuOpen: boolean;
  setNotificationMenuOpen: Dispatch<SetStateAction<boolean>>;
  unreadNotificationsCount: number;
  refreshNotifications: () => void | Promise<void>;
  notificationsLoading: boolean;
  notifications: NotificationItem[];
  notificationsError: string | null;
  markAllNotificationsRead: () => void | Promise<void>;
  markNotificationRead: (id: string) => void | Promise<void>;
  deleteNotification: (id: string) => void | Promise<void>;
  onNavigateCta: (ctaUrl: string) => void;
  openPanel: (panel: DashboardPanelName) => void;
  inrAgentEnabled: boolean;
  isAdmin?: boolean;
  userEmail: string | null;
  userFirstLetter: string;
  profileIncomplete: boolean;
  activityIncomplete: boolean;
  userMenuOpen: boolean;
  setUserMenuOpen: Dispatch<SetStateAction<boolean>>;
  goToGps: () => void;
  handleLogout: () => void | Promise<void>;
  menuOpen: boolean;
  setMenuOpen: Dispatch<SetStateAction<boolean>>;
};

export default function DashboardTopbar({
  desktopNotificationMenuRef,
  mobileNotificationMenuRef,
  userMenuRef,
  menuRef,
  notificationMenuOpen,
  setNotificationMenuOpen,
  unreadNotificationsCount,
  refreshNotifications,
  notificationsLoading,
  notifications,
  notificationsError,
  markAllNotificationsRead,
  markNotificationRead,
  deleteNotification,
  onNavigateCta,
  openPanel,
  inrAgentEnabled,
  isAdmin = false,
  userEmail,
  userFirstLetter,
  profileIncomplete,
  activityIncomplete,
  userMenuOpen,
  setUserMenuOpen,
  goToGps,
  handleLogout,
  menuOpen,
  setMenuOpen,
}: DashboardTopbarProps) {
  const router = useRouter();
  const agentTitle = inrAgentEnabled ? "Ouvrir iNr'Agent" : "iNr'Agent est désactivé dans les accès du compte";

  useEffect(() => {
    if (!inrAgentEnabled) return;

    router.prefetch(INR_AGENT_ROUTE);
    preloadInrAgentImages();
  }, [inrAgentEnabled, router]);

  const warmInrAgent = () => {
    if (!inrAgentEnabled) return;

    router.prefetch(INR_AGENT_ROUTE);
    preloadInrAgentImages();
  };

  return (
    <header className={styles.topbar}>
      <div className={styles.brand}>
        <img
          className={styles.logoImg}
          src="/logo-inrcy.png"
          alt="iNrCy"
          width={112}
          height={42}
          loading="eager"
          decoding="sync"
          fetchPriority="high"
        />
        <div className={styles.brandText}>
          <div className={styles.brandTag}>Générateur de business</div>
        </div>
      </div>

      <div className={styles.topbarActions}>
        {isAdmin && (
          <button
            type="button"
            className={`${styles.ghostBtn} ${styles.adminTopbarBtn}`}
            onClick={() => onNavigateCta("/dashboard/admin")}
            aria-label="Ouvrir l’administration iNrCy"
            title="Administration iNrCy"
          >
            <span className={styles.adminTopbarIcon} aria-hidden="true">⚙️</span>
            Admin
          </button>
        )}

        <div
          className={styles.notificationWrap}
          ref={desktopNotificationMenuRef}
        >
          <NotificationMenu
            notificationMenuOpen={notificationMenuOpen}
            setNotificationMenuOpen={setNotificationMenuOpen}
            unreadNotificationsCount={unreadNotificationsCount}
            refreshNotifications={refreshNotifications}
            notificationsLoading={notificationsLoading}
            notifications={notifications}
            notificationsError={notificationsError}
            openPanel={() => openPanel("notifications")}
            markAllNotificationsRead={markAllNotificationsRead}
            markNotificationRead={markNotificationRead}
            deleteNotification={deleteNotification}
            onNavigate={onNavigateCta}
            label="Notifications"
          />
        </div>

        <button
          type="button"
          className={`${styles.ghostBtn} ${styles.agentTopbarBtn} ${!inrAgentEnabled ? styles.agentTopbarBtnDisabled : ""}`}
          onPointerEnter={warmInrAgent}
          onFocus={warmInrAgent}
          onClick={() => {
            if (!inrAgentEnabled) return;
            warmInrAgent();
            onNavigateCta(INR_AGENT_ROUTE);
          }}
          aria-label={agentTitle}
          title={agentTitle}
          disabled={!inrAgentEnabled}
          aria-disabled={!inrAgentEnabled}
        >
          <span className={styles.agentTopbarIconSlot} aria-hidden>
            <img
              className={styles.agentTopbarIcon}
              src="/icons/inr-agent-header.png"
              alt=""
              width={29}
              height={29}
              loading="eager"
              decoding="sync"
              fetchPriority="high"
              aria-hidden
            />
          </span>
          iNr'Agent
        </button>

        <button
          type="button"
          className={`${styles.ghostBtn} ${styles.gpsTopbarBtn}`}
          onClick={goToGps}
        >
          <span className={styles.gpsTopbarIcon} aria-hidden="true">🧭</span>
          GPS d’utilisation
        </button>

        <button
          type="button"
          className={styles.ghostBtn}
          onClick={() => openPanel("contact")}
        >
          Nous contacter
        </button>

        <div ref={userMenuRef}>
          <UserMenu
            userEmail={userEmail}
            userFirstLetter={userFirstLetter}
            profileIncomplete={profileIncomplete}
            activityIncomplete={activityIncomplete}
            userMenuOpen={userMenuOpen}
            setUserMenuOpen={setUserMenuOpen}
            openPanel={openPanel}
            handleLogout={handleLogout}
          />
        </div>
      </div>

      <div className={styles.mobileTopbarActions}>
        {isAdmin && (
          <button
            type="button"
            className={`${styles.mobileHeaderIconBtn} ${styles.mobileHeaderAdminBtn}`}
            aria-label="Ouvrir l’administration iNrCy"
            title="Administration iNrCy"
            onClick={() => onNavigateCta("/dashboard/admin")}
          >
            <span aria-hidden="true">⚙️</span>
          </button>
        )}

        <div className={styles.mobileBellWrap}>
          <div
            className={styles.notificationWrap}
            ref={mobileNotificationMenuRef}
          >
            <NotificationMenu
              notificationMenuOpen={notificationMenuOpen}
              setNotificationMenuOpen={setNotificationMenuOpen}
              unreadNotificationsCount={unreadNotificationsCount}
              refreshNotifications={refreshNotifications}
              notificationsLoading={notificationsLoading}
              notifications={notifications}
              notificationsError={notificationsError}
              openPanel={() => openPanel("notifications")}
              markAllNotificationsRead={markAllNotificationsRead}
              markNotificationRead={markNotificationRead}
              deleteNotification={deleteNotification}
              onNavigate={onNavigateCta}
              mobile
            />
          </div>
        </div>

        <button
          type="button"
          className={`${styles.mobileHeaderIconBtn} ${styles.mobileHeaderAgentBtn} ${!inrAgentEnabled ? styles.mobileHeaderAgentBtnDisabled : ""}`}
          aria-label={agentTitle}
          title={agentTitle}
          disabled={!inrAgentEnabled}
          aria-disabled={!inrAgentEnabled}
          onPointerEnter={warmInrAgent}
          onFocus={warmInrAgent}
          onClick={() => {
            if (!inrAgentEnabled) return;
            warmInrAgent();
            onNavigateCta(INR_AGENT_ROUTE);
          }}
        >
          <span className={styles.mobileHeaderAgentIconSlot} aria-hidden>
            <img
              className={styles.mobileHeaderAgentIcon}
              src="/icons/inr-agent-header.png"
              alt=""
              width={29}
              height={29}
              loading="eager"
              decoding="sync"
              fetchPriority="high"
              aria-hidden
            />
          </span>
        </button>

        <button
          type="button"
          className={`${styles.mobileHeaderIconBtn} ${styles.mobileHeaderGpsBtn}`}
          aria-label="Ouvrir le GPS d’utilisation"
          onClick={goToGps}
        >
          <span className={styles.mobileHeaderGpsIcon} aria-hidden>🧭</span>
        </button>

        <div className={styles.mobileMenuWrap} ref={menuRef}>
          <button
            type="button"
            className={styles.hamburgerBtn}
            aria-label="Ouvrir le menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className={styles.hamburgerIcon} aria-hidden />

            {(profileIncomplete || activityIncomplete) && (
              <span className={styles.hamburgerWarnDot} aria-hidden />
            )}
          </button>

          {menuOpen && (
            <div
              className={styles.mobileMenuPanel}
              role="menu"
              aria-label="Menu"
            >
              {profileIncomplete && (
                <button
                  className={styles.mobileMenuItem}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    openPanel("profil");
                  }}
                >
                  ⚠️ Profil incomplet — compléter
                </button>
              )}

              {activityIncomplete && (
                <button
                  className={styles.mobileMenuItem}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    openPanel("activite");
                  }}
                >
                  ⚠️ Activité incomplète — compléter
                </button>
              )}

              <button
                className={styles.mobileMenuItem}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  openPanel("contact");
                }}
              >
                Nous contacter
              </button>

              <button
                className={styles.mobileMenuItem}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  openPanel("compte");
                }}
              >
                Compte iNrCytizen
              </button>

              <button
                className={styles.mobileMenuItem}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  openPanel("profil");
                }}
              >
                Mon profil
              </button>

              <button
                className={styles.mobileMenuItem}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  openPanel("activite");
                }}
              >
                Mon activité
              </button>

              <button
                className={styles.mobileMenuItem}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  openPanel("ia");
                }}
              >
                Configuration IA
              </button>

              <button
                className={styles.mobileMenuItem}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  openPanel("abonnement");
                }}
              >
                Mon abonnement
              </button>

              <button
                className={styles.mobileMenuItem}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  openPanel("inertie");
                }}
              >
                Mon inertie
              </button>

              <button
                className={styles.mobileMenuItem}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  openPanel("boutique");
                }}
              >
                Boutique
              </button>

              <button
                className={styles.mobileMenuItem}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  openPanel("parrainage");
                }}
              >
                Parrainer avec iNrCy
              </button>

              <button
                className={styles.mobileMenuItem}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  openPanel("legal");
                }}
              >
                Informations légales
              </button>

              <button
                className={styles.mobileMenuItem}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  openPanel("rgpd");
                }}
              >
                Mes données (RGPD)
              </button>
              <div className={styles.mobileMenuDivider} />

              <button
                className={`${styles.mobileMenuItem} ${styles.mobileMenuDanger}`}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void handleLogout();
                }}
              >
                Déconnexion
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
