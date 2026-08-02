"use client";

import StatusMessage from "./StatusMessage";

type DashboardStyles = Readonly<Record<string, string>>;

type PublishExecutionSummary = {
  allFailed?: boolean;
  failureCount?: number;
  successCount?: number;
  warningCount?: number;
  mediaWarningCount?: number;
  pendingCount?: number;
  entries?: Array<{
    channel: string;
    label: string;
    ok?: boolean;
    status?: "published" | "published_with_warning" | "processing" | "failed" | string;
    code?: string | null;
    retryable?: boolean;
    error?: string | null;
    warning?: string | null;
    warning_kind?: "media_degraded" | "degraded" | "pending" | string | null;
    warning_message?: string | null;
  }>;
  channelLinks?: Record<string, string>;
  retryableFailureCount?: number;
};

export default function PublishExecutionResultModal({
  styles,
  summary,
  onClose,
  onOpenInrSend,
  onRetryFailed,
  retrying = false,
}: {
  styles: DashboardStyles;
  summary: PublishExecutionSummary | null | undefined;
  onClose: () => void;
  onOpenInrSend: () => void;
  onRetryFailed?: () => void | Promise<void>;
  retrying?: boolean;
}) {
  const failureCount = Number(summary?.failureCount || 0);
  const successCount = Number(summary?.successCount || 0);
  const allFailed = Boolean(summary?.allFailed);
  const entries = Array.isArray(summary?.entries) ? summary.entries : [];
  const warningCount = Math.max(
    Number(summary?.warningCount || 0),
    entries.filter((entry) => entry.status === "published_with_warning").length,
  );
  const mediaWarningCount = Math.max(
    Number(summary?.mediaWarningCount || 0),
    entries.filter((entry) => entry.warning_kind === "media_degraded").length,
  );
  const pendingCount = Math.max(
    Number(summary?.pendingCount || 0),
    entries.filter((entry) => entry.status === "processing").length,
  );
  const retryableFailureCount = Math.max(
    0,
    Number(summary?.retryableFailureCount || 0),
  );

  return (
    <div
      className={styles.fullscreenModalOverlay}
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "rgba(3, 8, 20, 0.52)",
        zIndex: 110,
        padding: 16,
        overflowY: "auto",
        overscrollBehavior: "contain",
      }}
    >
      <div
        className={styles.blockCard}
        style={{
          width: "min(560px, 100%)",
          maxHeight:
            "calc(100dvh - var(--inrcy-mobile-bottom-nav-total-height, calc(50px + env(safe-area-inset-bottom, 0px))) - 32px)",
          overflowY: "auto",
          textAlign: "center",
          position: "relative",
          boxShadow: "0 30px 80px rgba(0,0,0,0.40)",
          border: `1px solid ${
            allFailed
              ? "rgba(248,113,113,0.34)"
              : failureCount || warningCount
                ? "rgba(251,191,36,0.28)"
                : "rgba(34,197,94,0.28)"
          }`,
          background:
            "linear-gradient(180deg, rgba(12,18,32,0.98), rgba(10,14,24,0.98))",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className={styles.secondaryBtn}
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            minWidth: 42,
            padding: "0 12px",
          }}
        >
          ✕
        </button>
        <div style={{ fontSize: 42, marginBottom: 8 }}>
          {allFailed ? "❌" : failureCount || warningCount ? "⚠️" : pendingCount ? "⏳" : "🎉"}
        </div>
        <div className={styles.blockTitle} style={{ marginBottom: 8 }}>
          {allFailed
            ? "Publication échouée"
            : failureCount
              ? "Publication envoyée partiellement"
              : warningCount
                ? `Publication publiée avec avertissement${warningCount > 1 ? "s" : ""}`
              : pendingCount
                ? "Envoi accepté, traitement en cours"
                : "Publication envoyée avec succès"}
        </div>
        <div
          className={styles.subtitle}
          style={{ maxWidth: 460, margin: "0 auto 14px auto" }}
        >
          {allFailed
            ? "Aucun canal n’a pu publier. Vérifiez le détail ci-dessous."
            : failureCount
              ? `Votre publication a été envoyée sur ${successCount} canal(aux). ${failureCount} canal(aux) n'ont pas pu publier.`
              : warningCount
                ? `${successCount} canal(aux) ont publié. ${mediaWarningCount || warningCount} publication(s) comportent un avertissement${mediaWarningCount ? " lié au média" : ""}.`
              : pendingCount
                ? "TikTok a accepté l’envoi. Le traitement final continue côté TikTok et le statut peut être vérifié dans iNrSend."
                : "Votre actualité a bien été prise en compte. Elle est maintenant en cours de diffusion sur vos canaux sélectionnés."}
        </div>
        <StatusMessage
          variant={failureCount ? "error" : warningCount || pendingCount ? "warning" : "success"}
          style={{ marginTop: 0, fontSize: 14 }}
        >
          {allFailed
            ? "Échec : vérifiez le détail ci-dessous."
            : failureCount
              ? "Succès partiel : vérifiez le détail ci-dessous."
              : warningCount
                ? "La publication est bien en ligne. Vérifiez les canaux signalés ci-dessous."
              : pendingCount
                ? "Envoi accepté : vérifiez le statut TikTok dans iNrSend."
                : "C’est parfait, votre publication est lancée."}
        </StatusMessage>
        {entries.length ? (
          <div style={{ marginTop: 14, display: "grid", gap: 8, textAlign: "left" }}>
            {entries.map((entry) => {
              const channelHref = String(summary?.channelLinks?.[entry.channel] || "").trim();
              return (
                <div
                  key={entry.channel}
                  style={{
                    borderRadius: 14,
                    padding: "10px 12px",
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <strong>
                      {entry.ok
                        ? entry.status === "published_with_warning"
                          ? "⚠️"
                          : entry.status === "processing"
                            ? "⏳"
                            : "✅"
                        : "❌"} {entry.label}
                    </strong>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      {channelHref ? (
                        <a
                          href={channelHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.secondaryBtn}
                          style={{
                            minHeight: 28,
                            minWidth: 0,
                            padding: "4px 10px",
                            borderRadius: 999,
                            fontSize: 12,
                            textDecoration: "none",
                          }}
                        >
                          Voir
                        </a>
                      ) : null}
                      <span style={{ fontSize: 12, opacity: 0.75 }}>
                        {entry.ok
                          ? entry.status === "processing"
                            ? "En traitement"
                            : entry.status === "published_with_warning"
                              ? "Publié avec avertissement"
                              : "Publié"
                          : "Échec"}
                      </span>
                    </span>
                  </div>
                  {entry.error ? (
                    <div style={{ marginTop: 6, fontSize: 13, color: "#ffb4b4" }}>
                      {entry.error}
                    </div>
                  ) : null}
                  {entry.warning_message ? (
                    <div style={{ marginTop: 6, fontSize: 13, color: "#fde68a" }}>
                      {entry.warning_message}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
        <div
          style={{
            marginTop: 16,
            display: "flex",
            justifyContent: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          {onRetryFailed && retryableFailureCount > 0 ? (
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => void onRetryFailed()}
              disabled={retrying}
            >
              {retrying
                ? "Relance en cours…"
                : `Retenter ${retryableFailureCount} canal${retryableFailureCount > 1 ? "aux" : ""} en échec`}
            </button>
          ) : null}
          <button type="button" className={styles.secondaryBtn} onClick={onOpenInrSend}>
            Voir dans iNr'Send
          </button>
        </div>
      </div>
    </div>
  );
}
