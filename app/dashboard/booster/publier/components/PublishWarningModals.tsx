import type { ReactNode } from "react";
import { CHANNEL_LABELS, type ChannelKey } from "../publishModal.shared";

type PublishModalStyles = Readonly<Record<string, string>>;

type PublishWarningModalsProps = {
  styles: PublishModalStyles;
  emptyContentChannel: ChannelKey | null;
  onCloseEmptyContentWarnings: () => void;
  onValidateEmptyContentWarning: () => void;
  oversizedMedia: {
    name: string;
    mediaType: "image" | "video";
    sizeBytes: number;
    maxBytes: number;
    sourceMaxBytes: number;
    operation:
      | "none"
      | "compression"
      | "conversion"
      | "conversion_and_compression";
  } | null;
  onCloseOversizedMedia: () => void;
  onOptimizeOversizedMedia: () => void;
};

function formatBytes(value: number) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1_000))} Ko`;
  const mb = bytes / 1_000_000;
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} Mo`;
}

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
  onCloseEmptyContentWarnings,
  onValidateEmptyContentWarning,
  oversizedMedia,
  onCloseOversizedMedia,
  onOptimizeOversizedMedia,
}: PublishWarningModalsProps) {
  if (oversizedMedia) {
    const mediaLabel = oversizedMedia.mediaType === "video" ? "vidéo" : "image";
    const sourceTooLarge =
      oversizedMedia.sizeBytes > oversizedMedia.sourceMaxBytes;
    const needsConversion =
      oversizedMedia.operation === "conversion" ||
      oversizedMedia.operation === "conversion_and_compression";
    const needsCompression =
      oversizedMedia.operation === "compression" ||
      oversizedMedia.operation === "conversion_and_compression";
    return (
      <WarningShell styles={styles}>
        <div
          aria-hidden="true"
          style={{
            width: 46,
            height: 46,
            display: "grid",
            placeItems: "center",
            borderRadius: 16,
            border: "1px solid rgba(251,191,36,.28)",
            background: "rgba(120,53,15,.18)",
            fontSize: 22,
          }}
        >
          ⚠️
        </div>
        <div style={{ display: "grid", gap: 9 }}>
          <div className={styles.blockTitle} style={{ marginBottom: 0 }}>
            {sourceTooLarge
              ? "Fichier source trop volumineux"
              : needsConversion && needsCompression
                ? "Format et poids à optimiser"
                : needsConversion
                  ? "Format à optimiser"
                  : "Fichier trop volumineux"}
          </div>
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.55,
              color: "rgba(255,255,255,0.82)",
            }}
          >
            <strong style={{ overflowWrap: "anywhere" }}>{oversizedMedia.name}</strong>
            {needsCompression ? (
              <>
                {" "}fait <strong>{formatBytes(oversizedMedia.sizeBytes)}</strong>. Une {mediaLabel} dans Booster doit faire au maximum <strong>{formatBytes(oversizedMedia.maxBytes)}</strong>.
              </>
            ) : (
              <> doit être converti dans un format compatible avec Booster.</>
            )}
          </div>
          <div
            style={{
              fontSize: 12,
              lineHeight: 1.45,
              color: "rgba(255,255,255,0.62)",
            }}
          >
            {sourceTooLarge
              ? `iNrCy accepte un fichier source de ${formatBytes(oversizedMedia.sourceMaxBytes)} maximum. Ce fichier ne peut pas être importé ni optimisé : choisissez une source plus légère.`
              : "iNrCy va adapter automatiquement le format et/ou le poids, puis remettre le média exactement là où vous étiez en train de l’ajouter."}
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
            onClick={onCloseOversizedMedia}
          >
            Fermer
          </button>
          {!sourceTooLarge ? (
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={onOptimizeOversizedMedia}
            >
              Optimiser le média
            </button>
          ) : null}
        </div>
      </WarningShell>
    );
  }

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

  return null;
}
