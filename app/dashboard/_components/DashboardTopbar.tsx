"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";

import styles from "../dashboard.module.css";
import NotificationMenu from "./NotificationMenu";
import UserMenu from "./UserMenu";
import type { NotificationItem } from "../dashboard.types";

type DashboardPanelName =
  | "contact"
  | "profil"
  | "compte"
  | "activite"
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
  | "parrainage";

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
  return (
    <header className={styles.topbar}>
      <div className={styles.brand}>
        <img className={styles.logoImg} src="/logo-inrcy.png" alt="iNrCy" />
        <div className={styles.brandText}>
          <div className={styles.brandTag}>Générateur de business</div>
        </div>
      </div>

      <div className={styles.topbarActions}>
        <div className={styles.notificationWrap} ref={desktopNotificationMenuRef}>
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
          />
        </div>

        <button type="button" className={styles.ghostBtn} onClick={() => openPanel("contact")}>
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
            goToGps={goToGps}
            handleLogout={handleLogout}
          />
        </div>
      </div>

      <div className={styles.mobileBellWrap}>
        <div className={styles.notificationWrap} ref={mobileNotificationMenuRef}>
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
          <div className={styles.mobileMenuPanel} role="menu" aria-label="Menu">
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
              Mon compte
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
                openPanel("notifications");
              }}
            >
              Notifications
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
                goToGps();
              }}
            >
              GPS d’utilisation
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
    </header>
  );
}
