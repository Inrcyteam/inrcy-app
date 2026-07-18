import React, { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import SettingsDrawer from "../../SettingsDrawer";
import HelpButton from "../../_components/HelpButton";
import HelpModal from "../../_components/HelpModal";
import MailsSettingsContent from "../../settings/_components/MailsSettingsContent";
import { useUnsavedExitGuard } from "../../_hooks/useUnsavedExitGuard";
import ResponsiveActionButton from "../../_components/ResponsiveActionButton";
import { getInrSendRetentionLabel } from "@/lib/inrsendRetention";
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
  const [settingsHasUnsavedChanges, setSettingsHasUnsavedChanges] = useState(false);
  useEffect(() => {
    if (!settingsOpen) setSettingsHasUnsavedChanges(false);
  }, [settingsOpen]);

  const { confirmExit: confirmSettingsExit } = useUnsavedExitGuard({
    active: settingsOpen,
    shouldBlock: settingsHasUnsavedChanges,
    onConfirmExit: onCloseSettings,
    eyebrow: "Réglages Mails",
    title: "Quitter sans enregistrer ?",
    message: "Ces réglages contiennent des modifications non enregistrées. Si vous fermez maintenant, elles seront perdues.",
    confirmLabel: "Fermer sans enregistrer",
    cancelLabel: "Continuer l’édition",
    variant: "warning",
  });
  const requestCloseSettings = useCallback(() => {
    void confirmSettingsExit();
  }, [confirmSettingsExit]);

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
            title="Réglages Mails"
            isOpen={settingsOpen}
            onClose={requestCloseSettings}
            closeOnBackdrop={false}
            closeOnEscape={false}
          >
            <MailsSettingsContent onUnsavedChange={setSettingsHasUnsavedChanges} />
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

        <div style={{ marginTop: 16 }}>
          <strong>Durées d’affichage dans iNr’Send</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            <li>Publications : {getInrSendRetentionLabel("publications")}</li>
            <li>Propulsions : {getInrSendRetentionLabel("propulsions")}</li>
            <li>Fidélisations : {getInrSendRetentionLabel("fidelisations")}</li>
            <li>Mails : {getInrSendRetentionLabel("mails")}</li>
            <li>Devis : {getInrSendRetentionLabel("devis")}</li>
            <li>Factures : {getInrSendRetentionLabel("factures")}</li>
          </ul>
          <p style={{ margin: "10px 0 0", opacity: 0.86 }}>
            Ces durées concernent uniquement l’historique iNr’Send. Le professionnel reste responsable de la conservation légale de ses documents comptables.
          </p>
        </div>

        <div style={{ marginTop: 14 }}>
          <strong>Factures envoyées</strong>
          <p style={{ margin: "8px 0 0", opacity: 0.86 }}>
            Une facture envoyée est considérée comme officielle dans l’application. Elle n’est pas supprimable manuellement depuis iNr’Send. Toute demande exceptionnelle de suppression doit être faite par écrit, par mail, au support iNrCy.
          </p>
        </div>
      </HelpModal>
    </>
  );
}
