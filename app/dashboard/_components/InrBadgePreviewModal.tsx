"use client";

import WorkflowBaseModal from "./WorkflowBaseModal";
import InrBadgeQrCode from "./InrBadgeQrCode";
import type { InrBadgeProfileSummary } from "@/lib/inrBadge";
import styles from "../dashboard.module.css";

const INRBADGE_HEADER_LINE = "iNr'Badge";
const INRBADGE_ICON_SRC = "/icons/inrbadge-dashboard.png";

type Props = {
  profile: InrBadgeProfileSummary;
  publicUrl: string;
  onClose: () => void;
  onConfigure: () => void;
};

function getDisplayName(profile: InrBadgeProfileSummary) {
  return [profile.firstName, profile.lastName].map((part) => part.trim()).filter(Boolean).join(" ") || "Votre profil";
}

export default function InrBadgePreviewModal({ profile, publicUrl, onClose, onConfigure }: Props) {
  const displayName = getDisplayName(profile);
  const company = profile.companyLegalName.trim() || "Votre entreprise";

  return (
    <WorkflowBaseModal
      title={INRBADGE_HEADER_LINE}
      moduleLabel="Canal iNrCy"
      onClose={onClose}
      compact
      maxWidth={560}
      headerActions={
        <button
          type="button"
          className={[styles.ghostBtn, styles.modalCloseButton].join(" ")}
          onClick={onConfigure}
          aria-label="Configurer iNr'Badge"
          title="Configurer iNr'Badge"
          style={{ borderRadius: 999, padding: "7px 12px", lineHeight: 1 }}
        >
          ⚙️
        </button>
      }
    >
      <div className={styles.inrBadgeModalCard}>
        <div className={styles.inrBadgeModalLogo} aria-hidden="true">
          <img src={INRBADGE_ICON_SRC} alt="" />
        </div>

        <div className={styles.inrBadgeModalIntro}>
          <strong>{company}</strong>
          <span>{displayName}</span>
        </div>

        <div className={styles.inrBadgeQrRealWrap}>
          {publicUrl ? (
            <InrBadgeQrCode value={publicUrl} label={`QR Code iNr'Badge ${company}`} />
          ) : (
            <div className={styles.inrBadgeQrUnavailable} role="img" aria-label="QR Code indisponible">
              QR indisponible
            </div>
          )}
        </div>

        <div className={styles.inrBadgeModalText}>
          <strong>{INRBADGE_HEADER_LINE}</strong>
          {publicUrl ? (
            <span className={styles.inrBadgeModalUrl}>{publicUrl}</span>
          ) : (
            <span>Complétez Mon profil pour générer votre QR Code iNr'Badge.</span>
          )}
          <span>Ce QR Code est permanent : les informations du badge pourront évoluer sans changer le QR.</span>
        </div>
      </div>
    </WorkflowBaseModal>
  );
}
