"use client";

import { useEffect, useRef, useState } from "react";

import {
  ensureFrenchPublicationErrorMessage,
  getFrenchPublicationErrorMessage,
} from "@/lib/publicationErrorFrench";

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

type EntryVisualState =
  | "published"
  | "warning"
  | "finalizing"
  | "failed"
  | "skipped";

function getEntryVisualState(
  entry: NonNullable<PublishExecutionSummary["entries"]>[number],
): EntryVisualState {
  const status = String(entry.status || entry.technicalStatus || "").toLowerCase();
  if (status === "queued" || status === "processing") return "finalizing";
  if (status === "skipped") return "skipped";
  if (status === "published_with_warning") return "warning";
  if (status === "failed" || entry.ok === false) return "failed";
  return "published";
}

function entryVisualMeta(state: EntryVisualState) {
  if (state === "finalizing") {
    return { icon: "⏳", label: "Finalisation", color: "#fbbf24", background: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.24)" };
  }
  if (state === "failed") {
    return { icon: "❌", label: "Échec", color: "#fca5a5", background: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.24)" };
  }
  if (state === "warning") {
    return { icon: "⚠️", label: "Publié avec avertissement", color: "#fde68a", background: "rgba(251,191,36,0.07)", border: "rgba(251,191,36,0.22)" };
  }
  if (state === "skipped") {
    return { icon: "⏭️", label: "Ignoré", color: "#fde68a", background: "rgba(251,191,36,0.06)", border: "rgba(251,191,36,0.18)" };
  }
  return { icon: "✅", label: "Publié", color: "#86efac", background: "rgba(34,197,94,0.07)", border: "rgba(34,197,94,0.20)" };
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
  const hasPendingAsyncJob = liveEntries.some((entry) => {
    const technicalStatus = String(entry.technicalStatus || "").toLowerCase();
    const status = String(entry.status || "").toLowerCase();
    return (
      status === "queued" ||
      status === "processing" ||
      technicalStatus === "queued" ||
      technicalStatus === "processing"
    );
  });

  useEffect(() => {
    if (!publicationId || !hasPendingAsyncJob) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();

    const schedule = (delayMs: number) => {
      timer = setTimeout(async () => {
        if (cancelled) return;
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
        }

        if (!cancelled && shouldContinue && Date.now() - startedAt < 8 * 60_000) {
          schedule(Date.now() - startedAt < 60_000 ? 3_000 : 10_000);
        }
      }, delayMs);
    };

    schedule(2_000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
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
  const entries = Array.isArray(effectiveSummary?.entries)
    ? effectiveSummary.entries
    : [];
  const visualStates = entries.map(getEntryVisualState);
  const hasDetailedEntries = visualStates.length > 0;
  const successCount = hasDetailedEntries
    ? visualStates.filter(
        (state) => state === "published" || state === "warning",
      ).length
    : Number(effectiveSummary?.successCount || 0);
  const failureCount = hasDetailedEntries
    ? visualStates.filter((state) => state === "failed").length
    : Number(effectiveSummary?.failureCount || 0);
  const warningCount = hasDetailedEntries
    ? visualStates.filter((state) => state === "warning").length
    : Number(effectiveSummary?.warningCount || 0);
  const pendingCount = hasDetailedEntries
    ? visualStates.filter((state) => state === "finalizing").length
    : Number(effectiveSummary?.pendingCount || 0);
  const skippedCount = hasDetailedEntries
    ? visualStates.filter((state) => state === "skipped").length
    : Number(effectiveSummary?.skippedCount || 0);
  const allFailed = hasDetailedEntries
    ? failureCount > 0 && successCount === 0 && pendingCount === 0
    : Boolean(effectiveSummary?.allFailed);
  const retryableFailureCount = Math.max(
    Number(effectiveSummary?.retryableFailureCount || 0),
    entries.filter(
      (entry) => getEntryVisualState(entry) === "failed" && entry.retryable,
    ).length,
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
        <div style={{ fontSize: 30, marginBottom: 6 }}>
          {allFailed ? "❌" : failureCount ? "⚠️" : pendingCount ? "⏳" : "🎉"}
        </div>
        <div
          className={styles.blockTitle}
          style={{ marginBottom: 6, fontSize: 19 }}
        >
          Bilan de publication
        </div>
        <div
          className={styles.subtitle}
          style={{ maxWidth: 480, margin: "0 auto 12px auto", fontSize: 14 }}
        >
          {[
            successCount > 0
              ? `${successCount} publié${successCount > 1 ? "s" : ""}`
              : null,
            pendingCount > 0
              ? `${pendingCount} finalisation${pendingCount > 1 ? "s" : ""}`
              : null,
            failureCount > 0
              ? `${failureCount} échec${failureCount > 1 ? "s" : ""}`
              : null,
            warningCount > 0
              ? `${warningCount} avertissement${warningCount > 1 ? "s" : ""}`
              : null,
            skippedCount > 0
              ? `${skippedCount} ignoré${skippedCount > 1 ? "s" : ""}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ") || "Résultats en cours de synchronisation"}
        </div>
        {entries.length ? (
          <div style={{ marginTop: 14, display: "grid", gap: 8, textAlign: "left" }}>
            {entries.map((entry) => {
              const visualState = getEntryVisualState(entry);
              const visualMeta = entryVisualMeta(visualState);
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
                    border: `1px solid ${visualMeta.border}`,
                    background: visualMeta.background,
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
                      {visualMeta.icon} {entry.label}
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
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color: visualMeta.color,
                        }}
                      >
                        {visualMeta.label}
                      </span>
                    </span>
                  </div>
                  {visibleError && visualState === "failed" ? (
                    <div style={{ marginTop: 6, fontSize: 13, color: "#ffb4b4" }}>
                      {visibleError}
                    </div>
                  ) : null}
                  {visualState === "skipped" && visibleBlockers.length ? (
                    <div style={{ marginTop: 6, fontSize: 13, color: "#fde68a" }}>
                      {visibleBlockers.join(" · ")}
                    </div>
                  ) : null}
                  {visibleWarning && visualState === "warning" ? (
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
