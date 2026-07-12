import type { ReactNode } from "react";
import { CHANNEL_LABELS, type ChannelKey } from "../publishModal.shared";

type PublishModalStyles = Readonly<Record<string, string>>;

type PublishWarningModalsProps = {
  styles: PublishModalStyles;
  emptyContentChannel: ChannelKey | null;
  gmbNoImageWarningOpen: boolean;
  onCloseEmptyContentWarnings: () => void;
  onValidateEmptyContentWarning: () => void;
  onChooseGmbImage: () => void;
  onContinueWithoutGmbImage: () => void;
};

function WarningShell({
  styles,
  children,
}: {
  styles: PublishModalStyles;
  children: ReactNode;
}) {
  return (
    <div
      className={styles.fullscreenModalOverlay}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10010,
        background: "rgba(4, 8, 18, 0.72)",
        backdropFilter: "blur(8px)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        overflowY: "auto",
        overscrollBehavior: "contain",
      }}
    >
      <div
        className={styles.blockCard}
        style={{
          width: "min(520px, 100%)",
          display: "grid",
          gap: 14,
          background: "#111827",
          backgroundImage: "none",
          border: "1px solid rgba(148, 163, 184, 0.28)",
          boxShadow: "0 30px 90px rgba(0,0,0,0.62)",
          backdropFilter: "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function PublishWarningModals({
  styles,
  emptyContentChannel,
  gmbNoImageWarningOpen,
  onCloseEmptyContentWarnings,
  onValidateEmptyContentWarning,
  onChooseGmbImage,
  onContinueWithoutGmbImage,
}: PublishWarningModalsProps) {
  if (emptyContentChannel) {
    return (
      <WarningShell styles={styles}>
        <div style={{ fontSize: 22 }}>⚠️</div>
        <div style={{ display: "grid", gap: 8 }}>
          <div className={styles.blockTitle} style={{ marginBottom: 0 }}>
            Avertissement
          </div>
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: "rgba(255,255,255,0.82)",
            }}
          >
            Le contenu est vide pour{" "}
            <strong>
              {CHANNEL_LABELS[emptyContentChannel]}
            </strong>
            . Voulez-vous continuer ?
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={onCloseEmptyContentWarnings}
          >
            Annuler
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={onValidateEmptyContentWarning}
          >
            Valider
          </button>
        </div>
      </WarningShell>
    );
  }

  if (!gmbNoImageWarningOpen) return null;

  return (
    <WarningShell styles={styles}>
      <div style={{ fontSize: 22 }}>📷</div>
      <div style={{ display: "grid", gap: 8 }}>
        <div className={styles.blockTitle} style={{ marginBottom: 0 }}>
          Aucune photo Google Business
        </div>
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: "rgba(255,255,255,0.82)",
          }}
        >
          Aucune photo n’est sélectionnée pour{" "}
          <strong>Google Business</strong>. Le post sera publié en texte
          seul. Souhaitez-vous continuer ?
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={onChooseGmbImage}
        >
          Retour / choisir une photo
        </button>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={onContinueWithoutGmbImage}
        >
          Continuer sans photo
        </button>
      </div>
    </WarningShell>
  );
}
