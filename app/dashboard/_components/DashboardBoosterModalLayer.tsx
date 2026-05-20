"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "../dashboard.module.css";
import b from "../booster/booster.module.css";
import BaseModal from "./WorkflowBaseModal";
import PublishModal from "../booster/publier/PublishModal";
import StatusMessage from "./StatusMessage";
import { WEEKLY_GOALS, clampProgress, getGoalCopy } from "@/lib/weeklyGoals";
import { getSimpleFrenchApiError, getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import { confirmInrcy } from "@/lib/inrcyDialog";
import { PROFILE_VERSION_EVENT, type ProfileVersionChangeDetail } from "@/lib/profileVersioning";
import { useUnsavedExitGuard } from "../_hooks/useUnsavedExitGuard";

type DashboardBoosterModalMode = "publish" | "stats" | null;

type WeeklySummary = {
  turbo?: { multiplier: number; connectedCount: number; totalChannels: number };
  missions?: {
    createActu?: { done: boolean; gained: number; projected: number };
  };
};

export default function DashboardBoosterModalLayer({
  mode,
  onClose,
}: {
  mode: DashboardBoosterModalMode;
  onClose: () => void;
}) {
  const router = useRouter();
  const [publishSuccessOpen, setPublishSuccessOpen] = useState(false);
  const [publishSummary, setPublishSummary] = useState<any>(null);
  const [publishEditorOverlayOpen, setPublishEditorOverlayOpen] = useState(false);
  const [publishHasUnsavedChanges, setPublishHasUnsavedChanges] = useState(false);
  const [metrics, setMetrics] = useState<any>(null);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);

  const refreshMetrics = useCallback(async () => {
    try {
      const [metricsRes, summaryRes] = await Promise.all([
        fetch("/api/booster/metrics?days=30", { cache: "no-store" as any }),
        fetch("/api/loyalty/weekly-summary", { cache: "no-store" as any }),
      ]);
      if (metricsRes.ok) setMetrics(await metricsRes.json());
      if (summaryRes.ok) setWeeklySummary(await summaryRes.json());
    } catch {
      // Silencieux : la modale doit rester utilisable même si une stat échoue.
    }
  }, []);

  useEffect(() => {
    if (!mode) return;
    void refreshMetrics();
  }, [mode, refreshMetrics]);

  useEffect(() => {
    const handleProfileVersionChange = (event: Event) => {
      const detail = (event as CustomEvent<ProfileVersionChangeDetail>).detail;
      if (!(detail?.field === "publications_version" || detail?.field === "loyalty_version")) return;
      void refreshMetrics();
    };

    window.addEventListener(PROFILE_VERSION_EVENT, handleProfileVersionChange as EventListener);
    return () => window.removeEventListener(PROFILE_VERSION_EVENT, handleProfileVersionChange as EventListener);
  }, [refreshMetrics]);

  const closePublishModal = useCallback(() => {
    setPublishEditorOverlayOpen(false);
    setPublishHasUnsavedChanges(false);
    onClose();
  }, [onClose]);

  const requestClosePublishModal = useCallback(async () => {
    if (publishHasUnsavedChanges) {
      const ok = await confirmInrcy({
        eyebrow: "Publication en cours",
        title: "Quitter la publication ?",
        message: "Du contenu a déjà été saisi, généré ou retouché. Si vous quittez maintenant, il sera perdu.",
        cancelLabel: "Continuer l’édition",
        confirmLabel: "Quitter",
        variant: "danger",
      });
      if (!ok) return;
    }
    closePublishModal();
  }, [closePublishModal, publishHasUnsavedChanges]);

  useUnsavedExitGuard({
    active: mode === "publish",
    shouldBlock: mode === "publish" && publishHasUnsavedChanges,
    onConfirmExit: closePublishModal,
    eyebrow: "Publication en cours",
    title: "Quitter la publication ?",
    message: "Du contenu a déjà été saisi, généré ou retouché. Si vous quittez maintenant, il sera perdu.",
    cancelLabel: "Continuer l’édition",
    confirmLabel: "Quitter",
    variant: "danger",
  });

  const trackEvent = useCallback(
    async (type: "publish", payload: Record<string, any>) => {
      const isoWeekId = () => {
        const d = new Date();
        const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        const dayNum = date.getUTCDay() || 7;
        date.setUTCDate(date.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
        return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
      };

      const award = async (actionKey: string, amount: number, sourceId: string, label?: string) => {
        try {
          await fetch("/api/loyalty/award", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              actionKey,
              amount,
              sourceId,
              label: label ?? null,
              meta: { origin: "booster", type },
            }),
          });
        } catch {
          // ignore
        }
      };

      try {
        const res = await fetch("/api/booster/publish-now", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(await getSimpleFrenchApiError(res, "La publication a échoué."));

        const summary = json?.summary || null;
        const failed = Object.entries((json?.results || {}) as Record<string, any>).filter(([, value]) => value && value.ok === false);
        if (summary?.allFailed || (!summary && failed.length)) {
          const detail = failed.map(([channel, value]) => `${channel}: ${String((value as any)?.error || "erreur")}`).join(" | ");
          throw new Error(getSimpleFrenchErrorMessage(detail, "La publication a échoué."));
        }

        await award("create_actu", 10, `week-${isoWeekId()}`, "Actu créée");
        return json;
      } finally {
        await refreshMetrics();
      }
    },
    [refreshMetrics],
  );

  const data = useMemo(() => {
    const publish = metrics?.publish ?? {};
    const n = (v: any) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    const publishWeek = n(publish.week);
    const turbo = weeklySummary?.turbo?.multiplier ?? 1;
    const rewardProjected = Number(weeklySummary?.missions?.createActu?.projected ?? Math.round(10 * turbo));
    const rewardGained = Number(weeklySummary?.missions?.createActu?.gained ?? 0);
    const publishChannels = publish.channels ?? {};
    const pc = (k: string) => n(publishChannels?.[k]);
    const statusCopy = getGoalCopy(publishWeek, WEEKLY_GOALS.booster.publish);
    const createActuDone = Boolean(weeklySummary?.missions?.createActu?.done);

    return {
      title: "Publications",
      month: n(publish.month),
      week: publishWeek,
      goal: WEEKLY_GOALS.booster.publish,
      status: {
        label: statusCopy.short,
        color: statusCopy.tone,
        helper: createActuDone && publishWeek <= 0 ? "Mission UI déjà sécurisée cette semaine." : statusCopy.hint,
      },
      reward: {
        projected: rewardProjected,
        gained: rewardGained,
        done: createActuDone,
      },
      channels: [
        { name: "Site iNrCy", value: pc("inrcy_site") },
        { name: "Site web", value: pc("site_web") },
        { name: "Google Business", value: pc("gmb") },
        { name: "Facebook", value: pc("facebook") },
        { name: "Instagram", value: pc("instagram") },
        { name: "LinkedIn", value: pc("linkedin") },
      ],
      tips: [
        { left: "1 publication / semaine", right: "minimum" },
        { left: "Canaux prioritaires", right: "site + réseaux" },
        { left: "Objectif", right: "visibilité" },
      ],
    };
  }, [metrics, weeklySummary]);

  return (
    <>
      {mode === "stats" ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Statistiques Booster"
          className={styles.fullscreenModalOverlay}
          onMouseDown={onClose}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 90,
            display: "grid",
            placeItems: "center",
            padding: 16,
            background: "rgba(3, 8, 20, 0.58)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
          }}
        >
          <div
            className={[styles.blockCard, b.statsModalPanel].join(" ")}
            onMouseDown={(event) => event.stopPropagation()}
            style={{
              width: "min(650px, 100%)",
              maxHeight: "calc(100dvh - 32px)",
              overflow: "auto",
              padding: 14,
              borderRadius: 24,
              boxShadow: "0 28px 90px rgba(0,0,0,0.48)",
              background: "radial-gradient(circle at 18% 10%, rgba(56,189,248,0.18), transparent 34%), radial-gradient(circle at 86% 0%, rgba(168,85,247,0.18), transparent 32%), linear-gradient(180deg, rgba(14,18,32,0.99), rgba(9,12,24,0.99))",
            }}
          >
            <div
              className={styles.blockHeaderRow}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                gap: 10,
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <span className={styles.ghostBtn} style={{ pointerEvents: "none", borderRadius: 999, padding: "7px 12px" }}>Booster</span>
              <div style={{ textAlign: "center" }}>
                <span className={styles.ghostBtn} style={{ pointerEvents: "none", borderRadius: 999, padding: "7px 12px" }}>Statistiques Booster</span>
              </div>
              <button type="button" className={styles.ghostBtn} onClick={onClose} style={{ borderRadius: 999, padding: "7px 12px" }}>
                Fermer
              </button>
            </div>

            <DashboardBoosterMetricCard data={data} />
            <details className={b.accordion} style={{ marginTop: 12 }}>
              <summary className={b.accordionSummary}><span>💡 Pour mieux Publier</span><span className={b.chev}>▾</span></summary>
              <div className={b.accordionBody}>
                <div className={[styles.blockCard, b.tipCard].join(" ")}>
                  <div className={b.tipListCompact}>
                    {data.tips.map((line, index) => (
                      <div key={index} className={b.tipLineCompact}><span>{line.left}</span><span className={b.tipBadge}>{line.right}</span></div>
                    ))}
                  </div>
                </div>
              </div>
            </details>
          </div>
        </div>
      ) : null}

      {mode === "publish" ? (
        <BaseModal title="Publier" moduleLabel="Module Booster" onClose={requestClosePublishModal} headerHidden={publishEditorOverlayOpen}>
          <PublishModal
            styles={styles}
            onClose={closePublishModal}
            trackEvent={trackEvent}
            onOverlayOpenChange={setPublishEditorOverlayOpen}
            onUnsavedChange={setPublishHasUnsavedChanges}
            onPublishSuccess={(result) => {
              setPublishSummary(result?.summary || null);
              setPublishSuccessOpen(true);
            }}
          />
        </BaseModal>
      ) : null}

      {publishSuccessOpen ? (
        <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background: "rgba(3, 8, 20, 0.52)", zIndex: 110, padding: 16 }}>
          <div className={styles.blockCard} style={{ width: "min(560px, 100%)", textAlign: "center", position: "relative", boxShadow: "0 30px 80px rgba(0,0,0,0.40)", border: `1px solid ${publishSummary?.failureCount ? "rgba(251,191,36,0.28)" : "rgba(34,197,94,0.28)"}`, background: "linear-gradient(180deg, rgba(12,18,32,0.98), rgba(10,14,24,0.98))" }}>
            <button type="button" onClick={() => setPublishSuccessOpen(false)} aria-label="Fermer" className={styles.secondaryBtn} style={{ position: "absolute", top: 14, right: 14, minWidth: 42, padding: "0 12px" }}>✕</button>
            <div style={{ fontSize: 42, marginBottom: 8 }}>{publishSummary?.failureCount ? "✅" : "🎉"}</div>
            <div className={styles.blockTitle} style={{ marginBottom: 8 }}>{publishSummary?.failureCount ? "Publication envoyée partiellement" : "Publication envoyée avec succès"}</div>
            <div className={styles.subtitle} style={{ maxWidth: 460, margin: "0 auto 14px auto" }}>
              {publishSummary?.failureCount ? `Votre publication a été envoyée sur ${publishSummary?.successCount || 0} canal(aux). ${publishSummary?.failureCount || 0} canal(aux) n'ont pas pu publier.` : "Votre actualité a bien été prise en compte. Elle est maintenant en cours de diffusion sur vos canaux sélectionnés."}
            </div>
            <StatusMessage variant={publishSummary?.failureCount ? "error" : "success"} style={{ marginTop: 0, fontSize: 14 }}>
              {publishSummary?.failureCount ? "Succès partiel : vérifiez le détail ci-dessous." : "C’est parfait, votre publication est lancée."}
            </StatusMessage>
            {Array.isArray(publishSummary?.entries) ? (
              <div style={{ marginTop: 14, display: "grid", gap: 8, textAlign: "left" }}>
                {publishSummary.entries.map((entry: any) => (
                  <div key={entry.channel} style={{ borderRadius: 14, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}><strong>{entry.ok ? "✅" : "❌"} {entry.label}</strong><span style={{ fontSize: 12, opacity: 0.75 }}>{entry.ok ? "Publié" : "Échec"}</span></div>
                    {entry.error ? <div style={{ marginTop: 6, fontSize: 13, color: "#ffb4b4" }}>{entry.error}</div> : null}
                    {entry.warning_message ? <div style={{ marginTop: 6, fontSize: 13, color: "#fde68a" }}>{entry.warning_message}</div> : null}
                  </div>
                ))}
              </div>
            ) : null}
            <div style={{ marginTop: 16, display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => {
                  setPublishSuccessOpen(false);
                  closePublishModal();
                  router.push("/dashboard/mails?folder=publications");
                }}
              >
                Voir dans iNr'Send
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function DashboardBoosterMetricCard({ data }: { data: any }) {
  const progress = clampProgress(data.week, data.goal);
  const toneClass = data.status.color === "green" ? b.toneGreen : data.status.color === "orange" ? b.toneOrange : b.toneRed;
  const reward = data.reward ?? { projected: 0, gained: 0, done: false };
  const rewardMain = reward.done ? `${reward.gained} UI débloqués cette semaine` : `Jusqu’à +${reward.projected} UI à débloquer`;
  const rewardSub = reward.done ? "Mission Booster validée" : `${reward.gained} UI gagnés`;
  return (
    <div className={[styles.blockCard, b.metricCard, b.boosterStatsCard].join(" ")}>
      <div className={b.cardTopRow}>
        <div>
          <div className={styles.blockTitle}>{data.title}</div>
          <div className={b.progressLabel}>Progression hebdo</div>
        </div>
        <div className={b.statsRewardInline} aria-label="Unités d’inr’çy à débloquer">
          <span className={b.statsRewardPrimary}>{rewardMain}</span>
          <span className={b.statsRewardSecondary}>{rewardSub}</span>
        </div>
        <div className={b.pill}>Ce mois : {data.month}</div>
      </div>
      <div className={b.metricLine}>
        <div className={[b.metricBubble, toneClass].join(" ")}>{data.week}/{data.goal}</div>
        <div className={[b.progressState, toneClass].join(" ")}>{data.status.label}</div>
      </div>
      <div className={b.progressBar}><div className={[b.progressFill, toneClass].join(" ")} style={{ width: `${progress * 100}%` }} /></div>
      <div className={b.progressHint}>{data.status.helper}</div>
      <div className={b.channelGridCompact}>
        {data.channels.map((channel: any) => (
          <div key={channel.name} className={b.channelItemCompact}><span>{channel.name}</span><span className={b.channelCount}>{channel.value}</span></div>
        ))}
      </div>
    </div>
  );
}
