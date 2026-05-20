"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "../../dashboard/dashboard.module.css";
import b from "./booster.module.css";
import BaseModal from "../_components/WorkflowBaseModal";
import PublishModal from "./publier/PublishModal";
import ResponsiveActionButton from "../_components/ResponsiveActionButton";
import HelpButton from "../_components/HelpButton";
import HelpModal from "../_components/HelpModal";
import StatusMessage from "../_components/StatusMessage";
import {
  getSimpleFrenchApiError,
  getSimpleFrenchErrorMessage,
} from "@/lib/userFacingErrors";
import { WEEKLY_GOALS, clampProgress, getGoalCopy } from "@/lib/weeklyGoals";
import {
  PROFILE_VERSION_EVENT,
  type ProfileVersionChangeDetail,
} from "@/lib/profileVersioning";
import { confirmInrcy } from "@/lib/inrcyDialog";
import { useUnsavedExitGuard } from "../_hooks/useUnsavedExitGuard";

type ActiveModal = null | "publish";

type WeeklySummary = {
  turbo?: { multiplier: number; connectedCount: number; totalChannels: number };
  missions?: {
    createActu?: { done: boolean; gained: number; projected: number };
    weeklyFeatureUse?: { done: boolean; gained: number; projected: number };
  };
};

export default function BoosterPage() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [active, setActive] = useState<ActiveModal>(null);
  const [publishSuccessOpen, setPublishSuccessOpen] = useState(false);
  const [publishSummary, setPublishSummary] = useState<any>(null);
  const [publishEditorOverlayOpen, setPublishEditorOverlayOpen] = useState(false);
  const [publishHasUnsavedChanges, setPublishHasUnsavedChanges] = useState(false);
  const [metrics, setMetrics] = useState<any>(null);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();

  const closeActiveModal = useCallback(() => {
    setPublishEditorOverlayOpen(false);
    setPublishHasUnsavedChanges(false);
    setActive(null);
  }, []);

  const activeHasUnsavedWork = active === "publish" ? publishHasUnsavedChanges : false;

  const requestCloseActiveModal = useCallback(async () => {
    if (activeHasUnsavedWork) {
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
    closeActiveModal();
  }, [activeHasUnsavedWork, closeActiveModal]);

  useUnsavedExitGuard({
    active: Boolean(active),
    shouldBlock: Boolean(activeHasUnsavedWork),
    onConfirmExit: closeActiveModal,
    eyebrow: "Publication en cours",
    title: "Quitter la publication ?",
    message: "Du contenu a déjà été saisi, généré ou retouché. Si vous quittez maintenant, il sera perdu.",
    cancelLabel: "Continuer l’édition",
    confirmLabel: "Quitter",
    variant: "danger",
  });

  useEffect(() => {
    const stats = (searchParams?.get("stats") || "").toLowerCase();
    if (stats === "1" || stats === "true") setStatsOpen(true);

    const a = (searchParams?.get("action") || "").toLowerCase();
    const normalized = a === "publier" ? "publish" : a;
    if (normalized === "reviews" || normalized === "recolter" || normalized === "promo" || normalized === "offrir") {
      const nextAction = normalized === "reviews" || normalized === "recolter" ? "reviews" : "promo";
      router.replace(`/dashboard/propulser?action=${nextAction}`);
      return;
    }
    if (normalized === "publish") setActive("publish");
  }, [router, searchParams]);

  const refreshMetrics = useCallback(async () => {
    try {
      const [metricsRes, summaryRes] = await Promise.all([
        fetch("/api/booster/metrics?days=30", { cache: "no-store" as any }),
        fetch("/api/loyalty/weekly-summary", { cache: "no-store" as any }),
      ]);
      if (metricsRes.ok) setMetrics(await metricsRes.json());
      if (summaryRes.ok) setWeeklySummary(await summaryRes.json());
    } catch {
      // ignore
    }
  }, []);

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

  useEffect(() => {
    void refreshMetrics();
  }, [refreshMetrics]);

  useEffect(() => {
    const handleProfileVersionChange = (event: Event) => {
      const detail = (event as CustomEvent<ProfileVersionChangeDetail>).detail;
      if (!(detail?.field === "publications_version" || detail?.field === "loyalty_version")) return;
      void refreshMetrics();
    };

    window.addEventListener(PROFILE_VERSION_EVENT, handleProfileVersionChange as EventListener);
    return () => window.removeEventListener(PROFILE_VERSION_EVENT, handleProfileVersionChange as EventListener);
  }, [refreshMetrics]);

  const data = useMemo(() => {
    const publish = metrics?.publish ?? {};
    const n = (v: any) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    const turbo = weeklySummary?.turbo?.multiplier ?? 1;
    const createActuDone = Boolean(weeklySummary?.missions?.createActu?.done);
    const actuProjected = Number(weeklySummary?.missions?.createActu?.projected ?? Math.round(10 * turbo));
    const actuGained = Number(weeklySummary?.missions?.createActu?.gained ?? 0);
    const publishWeek = n(publish.week);

    const buildStatus = (done: number, goal: number) => {
      const copy = getGoalCopy(done, goal);
      return { label: copy.short, color: copy.tone, helper: copy.hint, ctaHint: copy.action };
    };

    const buildMissionReward = (doneThisCard: number, missionDone: boolean, projected: number, gained: number) => {
      if (missionDone) {
        if (doneThisCard > 0) return `${gained} UI gagnés`;
        return "Mission UI déjà sécurisée";
      }
      return `+${projected} UI × multiplicateur`;
    };

    const buildMissionHelper = (doneThisCard: number, missionDone: boolean, fallback: string) => {
      if (missionDone && doneThisCard <= 0) return "Cette action reste utile, mais ne rapporte plus d’UI cette semaine.";
      return fallback;
    };

    const publishChannels = publish.channels ?? {};
    const pc = (k: string) => n(publishChannels?.[k]);
    const publishStatus = buildStatus(publishWeek, WEEKLY_GOALS.booster.publish);

    return {
      turbo,
      missions: {
        totalAvailable: actuProjected,
        totalEarned: actuGained,
        completedCount: Number(createActuDone),
        createActuDone,
        projectedActu: actuProjected,
        totalWeek: publishWeek,
      },
      action: {
        key: "publish" as const,
        title: "Publier",
        desc: "Diffusez un contenu libre sur vos canaux : site, Google Business, Facebook, Instagram, LinkedIn.",
        accent: "cyan" as const,
        cta: "Publier maintenant",
        status: { ...publishStatus, helper: buildMissionHelper(publishWeek, createActuDone, publishStatus.helper) },
        reward: buildMissionReward(publishWeek, createActuDone, actuProjected, actuGained),
      },
      metric: {
        title: "Publications",
        month: n(publish.month),
        week: publishWeek,
        goal: WEEKLY_GOALS.booster.publish,
        status: publishStatus,
        reward: {
          projected: actuProjected,
          gained: actuGained,
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
      },
      tip: {
        title: "Pour mieux Publier",
        lines: [
          { left: "1 post / semaine", right: "Rythme minimum" },
          { left: "Avant / après chantier", right: "Confiance" },
          { left: "Photo + 3 lignes", right: "Rapide à lancer" },
        ],
      },
    };
  }, [metrics, weeklySummary]);

  return (
    <main className={`${styles.page} ${b.page}`}>
      <div
        style={{
          filter: active ? "blur(10px)" : "none",
          opacity: active ? 0.55 : 1,
          transition: "filter 180ms ease, opacity 180ms ease",
          pointerEvents: active ? "none" : "auto",
        }}
        aria-hidden={active ? true : undefined}
      >
        <div className={b.container}>
          <header className={b.headerRow}>
            <div className={b.titleLine}>
              <span aria-hidden className={b.titleIcon}>🚀</span>
              <div className={styles.title}>Booster</div>
            </div>
            <div className={b.tagline}>Publiez maintenant sur vos canaux. <strong>Visibilité simple et rapide.</strong></div>
            <div className={b.closeWrap}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button type="button" onClick={() => setStatsOpen(true)} className={b.statsBtn} aria-label="Voir les statistiques Booster" title="Statistiques Booster">📊</button>
                <HelpButton onClick={() => setHelpOpen(true)} title="Aide Booster" />
                <ResponsiveActionButton desktopLabel="Propulser" mobileIcon="P" href="/dashboard/propulser" ariaLabel="Aller vers Propulser" title="Propulser" className={b.headerBtnFideliser} />
                <ResponsiveActionButton desktopLabel="iNr'Send" mobileIcon="✉️" href="/dashboard/mails" ariaLabel="Aller vers iNr'Send" title="Ouvrir iNr'Send" className={b.headerBtnInrSend} />
                <ResponsiveActionButton desktopLabel="Fermer" mobileIcon="✕" href="/dashboard" />
              </div>
            </div>
          </header>

          <HelpModal open={helpOpen} title="Booster" onClose={() => setHelpOpen(false)}>
            <p style={{ marginTop: 0 }}>Booster sert à publier sur tous les canaux connectés du professionnel.</p>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>Créez une publication libre ou générée par l’IA.</li>
              <li>Adaptez le texte et les images par canal.</li>
              <li>Retrouvez l’historique dans iNr'Send / Publications.</li>
            </ul>
          </HelpModal>

          
          {statsOpen ? (
            <BaseModal
              onClose={() => setStatsOpen(false)}
              title="Statistiques Booster"
              moduleLabel="Booster"
              compact
              maxWidth={680}
            >
              <div className={b.statsModalBody}>
                <MetricCard
                  styles={styles}
                  title={data.metric.title}
                  month={data.metric.month}
                  week={data.metric.week}
                  goal={data.metric.goal}
                  channels={data.metric.channels}
                  status={data.metric.status}
                  reward={data.metric.reward}
                />
                <TipAccordion styles={styles} title={data.tip.title} lines={data.tip.lines} />
              </div>
            </BaseModal>
          ) : null}

          <section className={[styles.blockCard, b.missionBanner].join(" ")}>
            <div className={b.missionBannerLeft}>
              <div className={b.heroEyebrow}>Mission Booster</div>
              <div className={b.missionBannerTitle}>1 publication / semaine</div>
            </div>
            <div className={b.missionBannerCenter}>
              <span className={b.missionBannerProgress}>{data.missions.completedCount}/1</span>
              <span className={b.missionBannerText}>{data.missions.totalWeek} publication(s) cette semaine</span>
            </div>
            <div className={b.missionBannerRight}>
              <span className={b.missionBannerUi}>Jusqu’à +{data.missions.totalAvailable} UI</span>
              <span className={b.missionBannerEarned}>+{data.missions.totalEarned} UI gagnés</span>
            </div>
          </section>

          <div className={b.desktopOnly}>
            <section className={b.triRow} aria-hidden>
              <div className={[b.triItem, b.triCyan].join(" ")}><div className={b.triLabel}>PUBLIER</div></div>
            </section>

            <section className={b.grid3} style={{ gridTemplateColumns: "minmax(0, 1fr)", maxWidth: 760, margin: "0 auto" }}>
              <ActionCard styles={styles} accent={data.action.accent} title={data.action.title} desc={data.action.desc} cta={data.action.cta} status={data.action.status} reward={data.action.reward} onClick={() => setActive("publish")} />
            </section>

            <section className={b.grid3} style={{ gridTemplateColumns: "minmax(0, 1fr)", maxWidth: 760, margin: "8px auto 0" }}>
              <div className={b.stackCard}>
                <MetricCard styles={styles} title={data.metric.title} month={data.metric.month} week={data.metric.week} goal={data.metric.goal} channels={data.metric.channels} status={data.metric.status} reward={data.metric.reward} />
                <TipAccordion styles={styles} title={data.tip.title} lines={data.tip.lines} />
              </div>
            </section>
          </div>

          <section className={b.mobileOnly}>
            <div className={b.mobileGroup}>
              <ActionCard styles={styles} accent={data.action.accent} title={data.action.title} desc={data.action.desc} cta={data.action.cta} status={data.action.status} reward={data.action.reward} onClick={() => setActive("publish")} />
              <details className={b.accordion}>
                <summary className={b.accordionSummary}><span>📊 Progression</span><span className={b.chev}>▾</span></summary>
                <div className={b.accordionBody}>
                  <MetricCard styles={styles} title={data.metric.title} month={data.metric.month} week={data.metric.week} goal={data.metric.goal} channels={data.metric.channels} status={data.metric.status} reward={data.metric.reward} />
                </div>
              </details>
              <TipAccordion styles={styles} title={data.tip.title} lines={data.tip.lines} />
            </div>
          </section>
        </div>
      </div>

      {publishSuccessOpen && (
        <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background: "rgba(3, 8, 20, 0.52)", zIndex: 70, padding: 16 }}>
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
              <button type="button" className={styles.primaryBtn} onClick={() => { setPublishSuccessOpen(false); setActive(null); router.push("/dashboard/mails?folder=publications"); }}>Voir dans iNr'Send</button>
            </div>
          </div>
        </div>
      )}

      {active && (
        <BaseModal title="Publier" moduleLabel="Module Booster" onClose={requestCloseActiveModal} headerHidden={publishEditorOverlayOpen}>
          <PublishModal styles={styles} onClose={closeActiveModal} trackEvent={trackEvent} onOverlayOpenChange={setPublishEditorOverlayOpen} onUnsavedChange={setPublishHasUnsavedChanges} onPublishSuccess={(result) => { setPublishSummary(result?.summary || null); setPublishSuccessOpen(true); }} />
        </BaseModal>
      )}
    </main>
  );
}


function ActionCard({ styles, accent, title, desc, cta, status, reward, onClick }: any) {
  const toneClass = status.color === "green" ? b.toneGreen : status.color === "orange" ? b.toneOrange : b.toneRed;
  return (
    <article className={[styles.moduleCard, styles[`accent_${accent}`], b.actionCard].join(" ")}>
      <div className={styles.moduleGlow} />
      <div className={b.actionTop}>
        <div className={b.actionMiniTitle}>{title}</div>
        <div className={[b.status, toneClass].join(" ")}><span className={[b.dot, b[`dot${status.color.charAt(0).toUpperCase()}${status.color.slice(1)}`]].join(" ")} aria-hidden /><span>{status.label}</span></div>
      </div>
      <div className={b.actionCenter}>
        <div className={[styles.moduleDesc, b.actionDesc].join(" ")}>{desc}</div>
        <div className={b.actionReward}>{reward}</div>
        <div className={b.actionHelper}>{status.helper}</div>
      </div>
      <div className={b.actionBtnWrap}><button type="button" className={[styles.primaryBtn, b.actionBtn].join(" ")} onClick={onClick}>{cta}</button></div>
    </article>
  );
}

function MetricCard({ styles, title, month, week, goal, channels, status, variant, reward }: any) {
  const isCampaign = variant === "campaign";
  const paddedChannels = isCampaign ? channels : [...channels, ...Array.from({ length: Math.max(0, 6 - channels.length) }, (_, idx) => ({ name: `__empty_${idx}`, value: "", empty: true }))];
  const progress = clampProgress(week, goal);
  const toneClass = status.color === "green" ? b.toneGreen : status.color === "orange" ? b.toneOrange : b.toneRed;
  const rewardData = reward ?? { projected: 0, gained: 0, done: false };
  const rewardMain = rewardData.done ? `${rewardData.gained} UI débloqués cette semaine` : `Jusqu’à +${rewardData.projected} UI à débloquer`;
  const rewardSub = rewardData.done ? "Mission Booster validée" : `${rewardData.gained} UI gagnés`;
  return (
    <div className={[styles.blockCard, b.metricCard].join(" ")}>
      <div className={b.cardTopRow}>
        <div className={styles.blockTitle}>{title}</div>
        <div className={b.pill}>Ce mois : {month}</div>
      </div>
      {!isCampaign ? (
        <div className={b.statsRewardInline} aria-label="Unités d’inr’çy à débloquer">
          <span className={b.statsRewardPrimary}>{rewardMain}</span>
          <span className={b.statsRewardSecondary}>{rewardSub}</span>
        </div>
      ) : null}
      <div className={b.progressLabel}>Progression hebdo</div>
      <div className={b.metricLine}><div className={[b.metricBubble, toneClass].join(" ")}>{week}/{goal}</div><div className={[b.progressState, toneClass].join(" ")}>{status.label}</div></div>
      <div className={b.progressBar}><div className={[b.progressFill, toneClass].join(" ")} style={{ width: `${progress * 100}%` }} /></div>
      <div className={b.progressHint}>{status.helper}</div>
      <div className={[b.channelGridCompact, isCampaign ? b.channelGridCampaign : ""].join(" ")}>{paddedChannels.map((c: any) => <div key={c.name} className={[b.channelItemCompact, c.empty ? b.channelItemPlaceholder : ""].join(" ")} aria-hidden={c.empty ? true : undefined}><span>{c.name}</span><span className={b.channelCount}>{c.value}</span></div>)}</div>
    </div>
  );
}

function TipAccordion({ styles, title, lines }: any) {
  return (
    <details className={b.accordion}>
      <summary className={b.accordionSummary}><span>💡 {title}</span><span className={b.chev}>▾</span></summary>
      <div className={b.accordionBody}><div className={[styles.blockCard, b.tipCard].join(" ")}><div className={b.tipListCompact}>{lines.map((l: any, idx: number) => <div key={idx} className={b.tipLineCompact}><span>{l.left}</span><span className={b.tipBadge}>{l.right}</span></div>)}</div></div></div>
    </details>
  );
}
