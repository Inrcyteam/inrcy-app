"use client";

import StatusMessage from "./StatusMessage";

type DashboardStyles = Readonly<Record<string, string>>;

type PublishExecutionSummary = {
  allFailed?: boolean;
  failureCount?: number;
  successCount?: number;
  entries?: Array<{
    channel: string;
    label: string;
    ok?: boolean;
    error?: string | null;
    warning?: string | null;
    warning_message?: string | null;
  }>;
  channelLinks?: Record<string, string>;
};

export default function PublishExecutionResultModal({
  styles,
  summary,
  onClose,
  onOpenInrSend,
}: {
  styles: DashboardStyles;
  summary: PublishExecutionSummary | null | undefined;
  onClose: () => void;
  onOpenInrSend: () => void;
}) {
  const failureCount = Number(summary?.failureCount || 0);
  const successCount = Number(summary?.successCount || 0);
  const allFailed = Boolean(summary?.allFailed);
  const entries = Array.isArray(summary?.entries) ? summary.entries : [];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "rgba(3, 8, 20, 0.52)",
        zIndex: 110,
        padding: 16,
      }}
    >
      <div
        className={styles.blockCard}
        style={{
          width: "min(560px, 100%)",
          textAlign: "center",
          position: "relative",
          boxShadow: "0 30px 80px rgba(0,0,0,0.40)",
          border: `1px solid ${
            allFailed
              ? "rgba(248,113,113,0.34)"
              : failureCount
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
          {allFailed ? "❌" : failureCount ? "✅" : "🎉"}
        </div>
        <div className={styles.blockTitle} style={{ marginBottom: 8 }}>
          {allFailed
            ? "Publication échouée"
            : failureCount
              ? "Publication envoyée partiellement"
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
              : "Votre actualité a bien été prise en compte. Elle est maintenant en cours de diffusion sur vos canaux sélectionnés."}
        </div>
        <StatusMessage
          variant={failureCount ? "error" : "success"}
          style={{ marginTop: 0, fontSize: 14 }}
        >
          {allFailed
            ? "Échec : vérifiez le détail ci-dessous."
            : failureCount
              ? "Succès partiel : vérifiez le détail ci-dessous."
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
                      {entry.ok ? "✅" : "❌"} {entry.label}
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
                        {entry.ok ? "Publié" : "Échec"}
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
          <button type="button" className={styles.primaryBtn} onClick={onOpenInrSend}>
            Voir dans iNr'Send
          </button>
        </div>
      </div>
    </div>
  );
}
