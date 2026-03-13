"use client";

import styles from "./UserMenu.module.css";

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

  const closeAndOpen = (panel: OpenPanelName) => {
    setUserMenuOpen(false);
    openPanel(panel);
  };

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
        <div className={styles.profileIndicatorWrap} style={{ marginLeft: 6 }}>
          <button
            type="button"
            className={styles.profileWarnBtn}
            aria-label="Profil incomplet"
            onClick={() => openPanel("profil")}
          >
            <span className={styles.profileWarnDot} aria-hidden />
          </button>

          <div className={styles.profileTooltip} role="tooltip">
            <div>
              ⚠️ <strong>Profil incomplet</strong>
              <br />
              Complétez votre profil pour activer pleinement iNrCy.
            </div>

            <button
              type="button"
              className={styles.profileTooltipBtn}
              onClick={() => openPanel("profil")}
            >
              Compléter mon profil
            </button>
          </div>
        </div>
      )}

      {activityIncomplete && (
        <div className={styles.profileIndicatorWrap} style={{ marginLeft: 6 }}>
          <button
            type="button"
            className={styles.profileWarnBtn}
            aria-label="Activité incomplète"
            onClick={() => openPanel("activite")}
          >
            <span className={styles.profileWarnDot} aria-hidden />
          </button>

          <div className={styles.profileTooltip} role="tooltip">
            <div>
              ⚠️ <strong>Activité incomplète</strong>
              <br />
              Complétez « Mon activité » pour générer des contenus pertinents.
            </div>

            <button
              type="button"
              className={styles.profileTooltipBtn}
              onClick={() => openPanel("activite")}
            >
              Compléter mon activité
            </button>
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
