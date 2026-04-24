"use client";

import { useEffect, useRef, useState } from "react";
import styles from "../dashboard.module.css";

type OpenPanelName =
  | "contact"
  | "profil"
  | "compte"
  | "activite"
  | "abonnement"
  | "mails"
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

export default function UserMenu(props: {
  userEmail: string | null;
  userFirstLetter: string;
  profileIncomplete: boolean;
  activityIncomplete: boolean;
  userMenuOpen: boolean;
  setUserMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  openPanel: (name: OpenPanelName) => void;
  goToGps: () => void;
  handleLogout: () => void | Promise<void>;
}) {
  const {
    userEmail,
    userFirstLetter,
    profileIncomplete,
    activityIncomplete,
    userMenuOpen,
    setUserMenuOpen,
    openPanel,
    goToGps,
    handleLogout,
  } = props;

  const [profileTooltipOpen, setProfileTooltipOpen] = useState(false);
  const [activityTooltipOpen, setActivityTooltipOpen] = useState(false);
  const profileTooltipWrapRef = useRef<HTMLDivElement | null>(null);
  const activityTooltipWrapRef = useRef<HTMLDivElement | null>(null);

  const closeAndOpen = (panel: OpenPanelName) => {
    setUserMenuOpen(false);
    setProfileTooltipOpen(false);
    setActivityTooltipOpen(false);
    openPanel(panel);
  };

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (profileTooltipWrapRef.current && !profileTooltipWrapRef.current.contains(target)) {
        setProfileTooltipOpen(false);
      }
      if (activityTooltipWrapRef.current && !activityTooltipWrapRef.current.contains(target)) {
        setActivityTooltipOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  return (
    <div className={styles.userMenuWrap}>
      <button
        className={styles.userBubbleBtn}
        type="button"
        aria-haspopup="menu"
        aria-expanded={userMenuOpen}
        onClick={() => setUserMenuOpen((v) => !v)}
        title={userEmail ?? "Utilisateur"}
      >
        <span className={styles.userBubble} aria-hidden>
          {userFirstLetter}
        </span>
      </button>

      {profileIncomplete && (
        <div
          ref={profileTooltipWrapRef}
          className={styles.profileIndicatorWrap}
          style={{ marginLeft: 6 }}
          data-open={profileTooltipOpen ? "true" : "false"}
        >
          <button
            type="button"
            className={styles.profileWarnBtn}
            aria-label="Profil incomplet"
            onClick={() => {
              setProfileTooltipOpen((value) => !value);
              setActivityTooltipOpen(false);
            }}
          >
            <span className={styles.profileWarnDot} aria-hidden />
          </button>

          <div
            className={styles.profileTooltip}
            role="tooltip"
            onClick={() => closeAndOpen("profil")}
          >
            <div>
              ⚠️ <strong>Profil incomplet</strong>
              <br />
              Cliquez pour compléter votre profil et activer pleinement iNrCy.
            </div>
          </div>
        </div>
      )}

      {activityIncomplete && (
        <div
          ref={activityTooltipWrapRef}
          className={styles.profileIndicatorWrap}
          style={{ marginLeft: 6 }}
          data-open={activityTooltipOpen ? "true" : "false"}
        >
          <button
            type="button"
            className={styles.profileWarnBtn}
            aria-label="Activité incomplète"
            onClick={() => {
              setActivityTooltipOpen((value) => !value);
              setProfileTooltipOpen(false);
            }}
          >
            <span className={styles.profileWarnDot} aria-hidden />
          </button>

          <div
            className={styles.profileTooltip}
            role="tooltip"
            onClick={() => closeAndOpen("activite")}
          >
            <div>
              ⚠️ <strong>Activité incomplète</strong>
              <br />
              Cliquez pour compléter votre profil et activer pleinement iNrCy.
            </div>
          </div>
        </div>
      )}

      {userMenuOpen && (
        <div className={styles.userMenuPanel} role="menu" aria-label="Menu utilisateur">
          <button type="button" className={styles.userMenuItem} role="menuitem" onClick={() => closeAndOpen("compte")}>Mon compte</button>
          <button type="button" className={styles.userMenuItem} role="menuitem" onClick={() => closeAndOpen("profil")}>Mon profil</button>
          <button type="button" className={styles.userMenuItem} role="menuitem" onClick={() => closeAndOpen("activite")}>Mon activité</button>
          <button type="button" className={styles.userMenuItem} role="menuitem" onClick={() => closeAndOpen("notifications")}>Notifications</button>
          <button type="button" className={styles.userMenuItem} role="menuitem" onClick={() => closeAndOpen("abonnement")}>Mon abonnement</button>
          <button type="button" className={styles.userMenuItem} role="menuitem" onClick={() => closeAndOpen("inertie")}>Mon inertie</button>
          <button type="button" className={styles.userMenuItem} role="menuitem" onClick={() => closeAndOpen("boutique")}>Boutique</button>
          <button type="button" className={styles.userMenuItem} role="menuitem" onClick={() => closeAndOpen("parrainage")}>Parrainer avec iNrCy</button>
          <button type="button" className={styles.userMenuItem} role="menuitem" onClick={() => { setUserMenuOpen(false); goToGps(); }}>GPS d’utilisation</button>
          <button type="button" className={styles.userMenuItem} role="menuitem" onClick={() => closeAndOpen("legal")}>Informations légales</button>
          <button type="button" className={styles.userMenuItem} role="menuitem" onClick={() => closeAndOpen("rgpd")}>Mes données (RGPD)</button>

          <div className={styles.userMenuDivider} />

          <button
            className={`${styles.userMenuItem} ${styles.userMenuDanger}`}
            type="button"
            role="menuitem"
            onClick={() => {
              setUserMenuOpen(false);
              void handleLogout();
            }}
          >
            Déconnexion
          </button>
        </div>
      )}
    </div>
  );
}
