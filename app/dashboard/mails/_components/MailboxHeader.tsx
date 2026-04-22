import React from "react";
import Image from "next/image";
import SettingsDrawer from "../../SettingsDrawer";
import HelpButton from "../../_components/HelpButton";
import HelpModal from "../../_components/HelpModal";
import MailsSettingsContent from "../../settings/_components/MailsSettingsContent";
import ResponsiveActionButton from "../../_components/ResponsiveActionButton";
import styles from "../mails.module.css";

type Props = {
  helpOpen: boolean;
  settingsOpen: boolean;
  onOpenHelp: () => void;
  onCloseHelp: () => void;
  onOpenFolders: () => void;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
};

export default function MailboxHeader({
  helpOpen,
  settingsOpen,
  onOpenHelp,
  onCloseHelp,
  onOpenFolders,
  onOpenSettings,
  onCloseSettings,
}: Props) {
  return (
    <>
      <div className={styles.header}>
        <div className={styles.brand}>
          <Image
            src="/inrsend-logo.png"
            alt="iNr’Send"
            width={154}
            height={64}
            priority
            className={styles.brandIcon}
          />

          <div className={styles.brandText}>
            <div className={styles.brandRow}>
              <span className={styles.tagline}>
                Toutes vos communications, depuis une seule et même machine.
              </span>
            </div>
          </div>
        </div>

        <div className={styles.actions}>
          <HelpButton onClick={onOpenHelp} title="Aide iNr’Send" />

          <button
            className={`${styles.btnGhost} ${styles.iconOnlyBtn} ${styles.hamburgerBtn}`}
            onClick={onOpenFolders}
            type="button"
            aria-label="Dossiers"
            title="Dossiers"
          >
            <span aria-hidden>☰</span>
            <span className={styles.srOnly}>Dossiers</span>
          </button>

          <ResponsiveActionButton
            desktopLabel="Réglages"
            mobileIcon="⚙️"
            onClick={onOpenSettings}
          />

          <SettingsDrawer
            title="Réglages iNr’Send"
            isOpen={settingsOpen}
            onClose={onCloseSettings}
          >
            <MailsSettingsContent />
          </SettingsDrawer>

          <ResponsiveActionButton
            desktopLabel="Fermer"
            mobileIcon="✕"
            href="/dashboard"
            title="Fermer iNr’Send"
          />
        </div>
      </div>

      <HelpModal open={helpOpen} title="iNr’Send" onClose={onCloseHelp}>
        <p style={{ marginTop: 0 }}>
          iNr’Send est le centre d’envoi de votre communication.
        </p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>Centralisez vos échanges et vos messages.</li>
          <li>Gagnez du temps pour communiquer sur vos canaux.</li>
          <li>Utilisez les réglages pour connecter/configurer les envois.</li>
        </ul>
      </HelpModal>
    </>
  );
}
