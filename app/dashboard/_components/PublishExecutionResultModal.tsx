"use client";

import { useEffect, useRef, useState } from "react";

import {
  ensureFrenchPublicationErrorMessage,
  getFrenchPublicationErrorMessage,
} from "@/lib/publicationErrorFrench";
import { isBoosterPublicationPendingStatus } from "@/lib/boosterPublicationStatus";
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
    status?: "published" | "published_with_warning" | "queued" | "processing" | "failed" | string;
    technicalStatus?: string | null;
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

type PublishExecutionEntry = NonNullable<PublishExecutionSummary["entries"]>[number];

function isPendingPublicationEntry(entry: PublishExecutionEntry) {
  const status = String(entry.status || "").trim().toLowerCase();
  const technicalStatus = String(entry.technicalStatus || "")
    .trim()
    .toLowerCase();
  const warningKind = String(entry.warning_kind || "").trim().toLowerCase();

  return (
    isBoosterPublicationPendingStatus(status) ||
    isBoosterPublicationPendingStatus(technicalStatus) ||
    warningKind === "pending"
  );
}

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
  const hasPendingAsyncJob = liveEntries.some(isPendingPublicationEntry);

  useEffect(() => {
    if (!publicationId || !hasPendingAsyncJob) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    let resumeRequested = false;
    const startedAt = Date.now();

    const clearTimer = () => {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
    };

    const schedule = (delayMs: number) => {
      clearTimer();
      if (cancelled || document.hidden) return;
      timer = setTimeout(() => {
        timer = null;
        void run();
      }, delayMs);
    };

    const run = async () => {
      if (cancelled || document.hidden) return;
      if (inFlight) {
        resumeRequested = true;
        return;
      }

      inFlight = true;
      let shouldContinue = true;
      try {
        const response = await fetch(
          `/api/booster/publications/${encodeURIComponent(publicationId)}/status`,
          { method: "GET", cache: "no-store" },
        );
        const payload = await response.json().catch(() => ({}));
        if (response.ok && payload?.summary) {
          setLiveSummary((current) => ({
            ...(current || {}),
            ...payload.summary,
            publicationId,
            publication_id: publicationId,
            channelLinks: current?.channelLinks || {},
            retryableFailureCount: current?.retryableFailureCount || 0,
          }));
          shouldContinue = payload?.done !== true;
        }
      } catch {
        shouldContinue = true;
      } finally {
        inFlight = false;
      }

      if (cancelled || document.hidden) return;
      if (resumeRequested) {
        resumeRequested = false;
        schedule(0);
        return;
      }
      if (shouldContinue && Date.now() - startedAt < 8 * 60_000) {
        schedule(Date.now() - startedAt < 60_000 ? 3_000 : 10_000);
      }
    };

    const handleVisibilityChange = () => {
      if (cancelled) return;
      if (document.hidden) {
        clearTimer();
        return;
      }
      if (inFlight) {
        resumeRequested = true;
        return;
      }
      schedule(0);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (!document.hidden) schedule(2_000);
    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [publicationId, hasPendingAsyncJob]);
  const pendingTiktokEntry = liveEntries.find(
    (entry) => entry.channel === "tiktok" && entry.status === "processing",
  );
  const hasPendingTiktok = Boolean(pendingTiktokEntry);

  useEffect(() => {
    if (!publicationId || !hasPendingTiktok) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let resumeRequested = false;
    const startedAt = Date.now();

    const clearTimer = () => {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
    };

    const schedule = (delayMs: number) => {
      clearTimer();
      if (cancelled || document.hidden) return;
      timer = setTimeout(() => {
        timer = null;
        void run();
      }, delayMs);
    };

    const run = async () => {
      if (cancelled || document.hidden) return;
      if (tiktokPollInFlightRef.current) {
        schedule(1_000);
        return;
      }

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

      if (cancelled || document.hidden) return;
      if (resumeRequested) {
        resumeRequested = false;
        schedule(0);
        return;
      }
      if (shouldContinue && Date.now() - startedAt < 5 * 60_000) {
        schedule(Date.now() - startedAt >= 2 * 60_000 ? 30_000 : 15_000);
      }
    };

    const handleVisibilityChange = () => {
      if (cancelled) return;
      if (document.hidden) {
        clearTimer();
        return;
      }
      if (tiktokPollInFlightRef.current) {
        resumeRequested = true;
        return;
      }
      schedule(0);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (!document.hidden) schedule(8_000);
    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
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
  const pendingCount = Math.max(
    Number(effectiveSummary?.pendingCount || 0),
    entries.filter(isPendingPublicationEntry).length,
  );
  const skippedCount = Math.max(
    Number(effectiveSummary?.skippedCount || 0),
    entries.filter((entry) => entry.status === "skipped").length,
  );
  const retryableFailureCount = Math.max(
    0,
    Number(effectiveSummary?.retryableFailureCount || 0),
  );
  const publishedEntryCount = entries.filter(
    (entry) =>
      entry.status !== "skipped" &&
      !isPendingPublicationEntry(entry) &&
      entry.ok !== false &&
      String(entry.status || "").toLowerCase() !== "failed",
  ).length;
  const failedEntryCount = entries.filter(
    (entry) =>
      entry.status !== "skipped" &&
      !isPendingPublicationEntry(entry) &&
      (entry.ok === false || String(entry.status || "").toLowerCase() === "failed"),
  ).length;
  const publishedCount = entries.length
    ? publishedEntryCount
    : Math.max(0, successCount - pendingCount);
  const failedOrSkippedCount = Math.max(failureCount, failedEntryCount) + skippedCount;
  const totalCount = Math.max(
    entries.length,
    publishedCount + pendingCount + failedOrSkippedCount,
    1,
  );
  const hasPublishedChannels = publishedCount > 0;
  const orderedEntries = [...entries].sort((left, right) => {
    const rank = (entry: PublishExecutionEntry) => {
      if (entry.status === "skipped") return 3;
      if (isPendingPublicationEntry(entry)) return 1;
      if (entry.ok === false || String(entry.status || "").toLowerCase() === "failed") return 2;
      return 0;
    };
    return rank(left) - rank(right);
  });

  const overallTitle = allFailed
    ? "Publication échouée"
    : hasPublishedChannels
      ? "Publication bien lancée"
      : pendingCount
        ? "Publication en cours"
        : failureCount
          ? "Publication envoyée partiellement"
          : "Publication envoyée avec succès";
  const overallSubtitle = allFailed
    ? "Aucun canal n’a pu publier. Les erreurs sont détaillées ci-dessous."
    : hasPublishedChannels && pendingCount
      ? `${publishedCount} canal${publishedCount > 1 ? "aux sont déjà publiés" : " est déjà publié"} sur ${totalCount}. iNrCy poursuit automatiquement le traitement des ${pendingCount} autre${pendingCount > 1 ? "s" : ""}.`
      : hasPublishedChannels && failedOrSkippedCount
        ? `${publishedCount} canal${publishedCount > 1 ? "aux ont" : " a"} publié sur ${totalCount}. Les canaux à corriger sont détaillés ci-dessous.`
        : hasPublishedChannels
          ? `${publishedCount}/${totalCount} canal${totalCount > 1 ? "aux publiés" : " publié"} avec succès.`
          : `${pendingCount || totalCount} canal${(pendingCount || totalCount) > 1 ? "aux sont" : " est"} encore en traitement. iNrCy actualise ce bilan automatiquement.`;

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
          width: "min(760px, 100%)",
          maxHeight:
            "calc(100dvh - var(--inrcy-mobile-bottom-nav-total-height, calc(50px + env(safe-area-inset-bottom, 0px))) - 32px)",
          overflowY: "auto",
          textAlign: "left",
          position: "relative",
          boxShadow: "0 30px 80px rgba(0,0,0,0.40)",
          border: `1px solid ${
            hasPublishedChannels
              ? "rgba(34,197,94,0.34)"
              : allFailed
              ? "rgba(248,113,113,0.34)"
              : pendingCount || warningCount || skippedCount
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            paddingRight: 54,
            marginBottom: 14,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 48,
              height: 48,
              flex: "0 0 48px",
              borderRadius: 16,
              display: "grid",
              placeItems: "center",
              fontSize: 27,
              fontWeight: 900,
              color: "#fff",
              background: hasPublishedChannels
                ? "linear-gradient(135deg, #16a34a, #34d399)"
                : allFailed
                  ? "linear-gradient(135deg, #dc2626, #fb7185)"
                  : "linear-gradient(135deg, #d97706, #fbbf24)",
              boxShadow: hasPublishedChannels
                ? "0 10px 28px rgba(34,197,94,0.30)"
                : allFailed
                  ? "0 10px 28px rgba(248,113,113,0.24)"
                  : "0 10px 28px rgba(251,191,36,0.22)",
            }}
          >
            {hasPublishedChannels ? "✓" : allFailed ? "×" : "⏳"}
          </span>
          <div style={{ minWidth: 0 }}>
            <div className={styles.blockTitle} style={{ marginBottom: 4 }}>
              {overallTitle}
            </div>
            <div
              className={styles.subtitle}
              style={{ maxWidth: 610, margin: 0, lineHeight: 1.42 }}
            >
              {overallSubtitle}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {publishedCount > 0 ? (
            <StatusMessage variant="success" style={{ marginTop: 0, fontSize: 14 }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%" }}>
                <strong>✓ Réussites</strong>
                <strong>{publishedCount}/{totalCount} publiés</strong>
              </span>
            </StatusMessage>
          ) : null}
          {pendingCount > 0 ? (
            <StatusMessage variant="warning" style={{ marginTop: 0, fontSize: 14 }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%" }}>
                <strong>⏳ En traitement</strong>
                <strong>{pendingCount}/{totalCount} en cours</strong>
              </span>
            </StatusMessage>
          ) : null}
          {failedOrSkippedCount > 0 ? (
            <StatusMessage variant="error" style={{ marginTop: 0, fontSize: 14 }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%" }}>
                <strong>× Échecs ou canaux à corriger</strong>
                <strong>{failedOrSkippedCount}/{totalCount}</strong>
              </span>
              <span style={{ display: "none" }}>
                Publication envoyée partiellement · Publication publiée avec avertissement
              </span>
            </StatusMessage>
          ) : null}
        </div>
        {entries.length ? (
          <div style={{ marginTop: 14, display: "grid", gap: 8, textAlign: "left" }}>
            {orderedEntries.map((entry) => {
              const entryIsPending = isPendingPublicationEntry(entry);
              const channelHref = String(effectiveSummary?.channelLinks?.[entry.channel] || "").trim();
              const visibleError = !entryIsPending && entry.error
                ? getFrenchPublicationErrorMessage(
                    entry.channel,
                    entry.error,
                    `${entry.label} n'a pas pu publier. Merci de réessayer.`,
                  )
                : "";
              const visibleWarning = entry.warning_message
                ? ensureFrenchPublicationErrorMessage(
                    entry.warning_message,
                    entryIsPending
                      ? `${entry.label} est encore en attente de finalisation.`
                      : `${entry.label} a publié avec un avertissement.`,
                  )
                : "";
              const visibleBlockers = (entry.blockers || []).map((blocker) =>
                ensureFrenchPublicationErrorMessage(
                  blocker,
                  `${entry.label} n'est pas prêt pour la publication.`,
                ),
              );
              const entryTone = entry.status === "skipped"
                ? {
                    border: "rgba(251,191,36,0.28)",
                    background: "linear-gradient(90deg, rgba(251,191,36,0.09), rgba(255,255,255,0.025))",
                    iconBackground: "rgba(251,191,36,0.18)",
                    iconColor: "#fde68a",
                  }
                : entryIsPending
                  ? {
                      border: "rgba(251,191,36,0.28)",
                      background: "linear-gradient(90deg, rgba(251,191,36,0.09), rgba(255,255,255,0.025))",
                      iconBackground: "rgba(251,191,36,0.18)",
                      iconColor: "#fde68a",
                    }
                  : entry.ok
                    ? {
                        border: "rgba(52,211,153,0.30)",
                        background: "linear-gradient(90deg, rgba(34,197,94,0.12), rgba(255,255,255,0.025))",
                        iconBackground: "linear-gradient(135deg, #16a34a, #34d399)",
                        iconColor: "#fff",
                      }
                    : {
                        border: "rgba(248,113,113,0.30)",
                        background: "linear-gradient(90deg, rgba(248,113,113,0.10), rgba(255,255,255,0.025))",
                        iconBackground: "rgba(248,113,113,0.18)",
                        iconColor: "#fecaca",
                      };
              return (
                <div
                  key={entry.channel}
                  style={{
                    borderRadius: 14,
                    padding: "10px 12px",
                    border: `1px solid ${entryTone.border}`,
                    background: entryTone.background,
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
                    <strong style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <span
                        aria-hidden
                        style={{
                          width: 30,
                          height: 30,
                          flex: "0 0 30px",
                          borderRadius: 999,
                          display: "grid",
                          placeItems: "center",
                          fontSize: 17,
                          fontWeight: 900,
                          color: entryTone.iconColor,
                          background: entryTone.iconBackground,
                          boxShadow: entry.ok && !entryIsPending
                            ? "0 5px 16px rgba(34,197,94,0.22)"
                            : undefined,
                        }}
                      >
                        {entry.status === "skipped"
                          ? "⏭"
                          : entryIsPending
                            ? "⏳"
                            : entry.ok
                              ? entry.status === "published_with_warning"
                                ? "!"
                                : "✓"
                              : "×"}
                      </span>
                      <span>{entry.label}</span>
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
                          : entryIsPending
                            ? "En attente"
                            : entry.ok
                              ? entry.status === "published_with_warning"
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
