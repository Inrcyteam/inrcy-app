"use client";

import { useEffect, useRef, useState } from "react";

import {
  ensureFrenchPublicationErrorMessage,
  getFrenchPublicationErrorMessage,
} from "@/lib/publicationErrorFrench";
import StatusMessage from "./StatusMessage";

type DashboardStyles = Readonly<Record<string, string>>;

type PublishExecutionSummary = {
  publicationId?: string | null;
  publication_id?: string | null;
  allFailed?: boolean;
  failureCount?: number;
  successCount?: number;
  warningCount?: number;
  mediaWarningCount?: number;
  pendingCount?: number;
  skippedCount?: number;
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
    blockers?: string[];
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
  const [liveSummary, setLiveSummary] = useState<PublishExecutionSummary | null>(summary || null);
  const tiktokPollInFlightRef = useRef(false);

  useEffect(() => {
    setLiveSummary(summary || null);
  }, [summary]);

  const publicationId = String(
    liveSummary?.publicationId || liveSummary?.publication_id || "",
  ).trim();
  const liveEntries = Array.isArray(liveSummary?.entries)
    ? liveSummary.entries
    : [];
  const pendingTiktokEntry = liveEntries.find(
    (entry) => entry.channel === "tiktok" && entry.status === "processing",
  );
  const hasPendingTiktok = Boolean(pendingTiktokEntry);

  useEffect(() => {
    if (!publicationId || !hasPendingTiktok) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();

    const schedule = (delayMs: number) => {
      timer = setTimeout(async () => {
        if (cancelled || tiktokPollInFlightRef.current) return;
        tiktokPollInFlightRef.current = true;
        let shouldContinue = true;
        try {
          const res = await fetch(
            `/api/inrsend/publications/${encodeURIComponent(publicationId)}/tiktok/status`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              cache: "no-store",
            },
          );
          const json = await res.json().catch(() => ({}));
          const status = String(json?.status?.status || "").toUpperCase();
          const complete = ["PUBLISH_COMPLETE", "DONE", "SUCCESS"].includes(status);
          const failed = ["FAILED", "PUBLISH_FAILED", "ERROR"].includes(status);
          const message = String(
            json?.message ||
              (failed
                ? "TikTok n'a pas pu finaliser la publication."
                : "TikTok traite encore la publication."),
          ).trim();
          shouldContinue = !complete && !failed;

          setLiveSummary((current) => {
            if (!current || !Array.isArray(current.entries)) return current;
            const previousEntry = current.entries.find(
              (entry) => entry.channel === "tiktok",
            );
            if (!previousEntry) return current;

            const nextEntries = current.entries.map((entry) => {
              if (entry.channel !== "tiktok") return entry;
              if (complete) {
                return {
                  ...entry,
                  ok: true,
                  status: "published",
                  error: null,
                  warning: null,
                  warning_kind: null,
                  warning_message: null,
                };
              }
              if (failed) {
                return {
                  ...entry,
                  ok: false,
                  status: "failed",
                  error: message,
                  warning: null,
                  warning_kind: null,
                  warning_message: null,
                };
              }
              return {
                ...entry,
                ok: true,
                status: "processing",
                warning: "pending",
                warning_kind: "pending",
                warning_message: message,
              };
            });

            let successCount = Number(current.successCount || 0);
            let failureCount = Number(current.failureCount || 0);
            let pendingCount = Number(current.pendingCount || 0);
            if (previousEntry.status === "processing" && complete) {
              pendingCount = Math.max(0, pendingCount - 1);
            } else if (previousEntry.status === "processing" && failed) {
              pendingCount = Math.max(0, pendingCount - 1);
              successCount = Math.max(0, successCount - 1);
              failureCount += 1;
            }

            return {
              ...current,
              entries: nextEntries,
              successCount,
              failureCount,
              pendingCount,
              allFailed: failureCount > 0 && successCount === 0,
            };
          });
        } catch {
          shouldContinue = true;
        } finally {
          tiktokPollInFlightRef.current = false;
        }

        if (!cancelled && shouldContinue && Date.now() - startedAt < 5 * 60_000) {
          schedule(Date.now() - startedAt >= 2 * 60_000 ? 30_000 : 15_000);
        }
      }, delayMs);
    };

    schedule(8_000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [publicationId, hasPendingTiktok]);

  const effectiveSummary = liveSummary || summary;
  const failureCount = Number(effectiveSummary?.failureCount || 0);
  const successCount = Number(effectiveSummary?.successCount || 0);
  const allFailed = Boolean(effectiveSummary?.allFailed);
  const entries = Array.isArray(effectiveSummary?.entries) ? effectiveSummary.entries : [];
  const warningCount = Math.max(
    Number(effectiveSummary?.warningCount || 0),
    entries.filter((entry) => entry.status === "published_with_warning").length,
  );
  const mediaWarningCount = Math.max(
    Number(effectiveSummary?.mediaWarningCount || 0),
    entries.filter((entry) => entry.warning_kind === "media_degraded").length,
  );
  const pendingCount = Math.max(
    Number(effectiveSummary?.pendingCount || 0),
    entries.filter((entry) => entry.status === "processing").length,
  );
  const skippedCount = Math.max(
    Number(effectiveSummary?.skippedCount || 0),
    entries.filter((entry) => entry.status === "skipped").length,
  );
  const pendingEntries = entries.filter(
    (entry) => entry.status === "processing",
  );
  const pendingLabels = Array.from(
    new Set(pendingEntries.map((entry) => entry.label).filter(Boolean)),
  );
  const retryableFailureCount = Math.max(
    0,
    Number(effectiveSummary?.retryableFailureCount || 0),
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
              : failureCount || pendingCount || warningCount || skippedCount
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
          {allFailed
            ? "❌"
            : failureCount
              ? "⚠️"
              : pendingCount
                ? "⏳"
                : warningCount || skippedCount
                  ? "⚠️"
                  : "🎉"}
        </div>
        <div className={styles.blockTitle} style={{ marginBottom: 8 }}>
          {allFailed
            ? "Publication échouée"
            : failureCount
              ? "Publication envoyée partiellement"
              : pendingCount
                ? "Envoi accepté, traitement en cours"
              : warningCount
                ? `Publication publiée avec avertissement${warningCount > 1 ? "s" : ""}`
              : skippedCount
                ? "Publication envoyée sur les canaux prêts"
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
              : pendingCount
                ? `${pendingLabels.length ? pendingLabels.join(", ") : `${pendingCount} canal(aux)`} ${pendingCount > 1 ? "sont encore en traitement" : "est encore en traitement"}. Le statut final peut être vérifié dans iNrSend.`
              : warningCount
                ? `${successCount} canal(aux) ont publié. ${mediaWarningCount || warningCount} publication(s) comportent un avertissement${mediaWarningCount ? " lié au média" : ""}.`
              : skippedCount
                ? `${successCount} canal(aux) ont publié. ${skippedCount} canal(aux) ont été ignorés avant l’envoi car ils n’étaient pas prêts.`
                : "Votre actualité a bien été prise en compte. Elle est maintenant en cours de diffusion sur vos canaux sélectionnés."}
        </div>
        <StatusMessage
          variant={failureCount ? "error" : pendingCount || warningCount || skippedCount ? "warning" : "success"}
          style={{ marginTop: 0, fontSize: 14 }}
        >
          {allFailed
            ? "Échec : vérifiez le détail ci-dessous."
            : failureCount
              ? "Succès partiel : vérifiez le détail ci-dessous."
              : pendingCount
                ? "Envoi accepté : suivez les canaux en traitement dans iNrSend."
              : warningCount
                ? "La publication est bien en ligne. Vérifiez les canaux signalés ci-dessous."
              : skippedCount
                ? "Les canaux prêts ont été publiés ; corrigez les canaux ignorés avant de les relancer."
                : "C’est parfait, votre publication est lancée."}
        </StatusMessage>
        {entries.length ? (
          <div style={{ marginTop: 14, display: "grid", gap: 8, textAlign: "left" }}>
            {entries.map((entry) => {
              const channelHref = String(effectiveSummary?.channelLinks?.[entry.channel] || "").trim();
              const visibleError = entry.error
                ? getFrenchPublicationErrorMessage(
                    entry.channel,
                    entry.error,
                    `${entry.label} n'a pas pu publier. Merci de réessayer.`,
                  )
                : "";
              const visibleWarning = entry.warning_message
                ? ensureFrenchPublicationErrorMessage(
                    entry.warning_message,
                    `${entry.label} a publié avec un avertissement.`,
                  )
                : "";
              const visibleBlockers = (entry.blockers || []).map((blocker) =>
                ensureFrenchPublicationErrorMessage(
                  blocker,
                  `${entry.label} n'est pas prêt pour la publication.`,
                ),
              );
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
                      {entry.status === "skipped"
                        ? "⏭️"
                        : entry.ok
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
                        {entry.status === "skipped"
                          ? "Ignoré avant envoi"
                          : entry.ok
                          ? entry.status === "processing"
                            ? "En traitement"
                            : entry.status === "published_with_warning"
                              ? "Publié avec avertissement"
                              : "Publié"
                          : "Échec"}
                      </span>
                    </span>
                  </div>
                  {visibleError ? (
                    <div style={{ marginTop: 6, fontSize: 13, color: entry.status === "skipped" ? "#fde68a" : "#ffb4b4" }}>
                      {visibleError}
                    </div>
                  ) : null}
                  {entry.status === "skipped" && visibleBlockers.length ? (
                    <div style={{ marginTop: 6, fontSize: 13, color: "#fde68a" }}>
                      {visibleBlockers.join(" · ")}
                    </div>
                  ) : null}
                  {visibleWarning ? (
                    <div style={{ marginTop: 6, fontSize: 13, color: "#fde68a" }}>
                      {visibleWarning}
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
