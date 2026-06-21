"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import styles from "../../dashboard/dashboard.module.css";
import b from "../booster/booster.module.css";
import BaseModal from "../_components/WorkflowBaseModal";
import ValoriserModal from "./components/valoriser/ValoriserModal";
import RecolterModal from "./components/recolter/RecolterModal";
import OffrirModal from "./components/offrir/OffrirModal";
import ResponsiveActionButton from "../_components/ResponsiveActionButton";
import HelpButton from "../_components/HelpButton";
import HelpModal from "../_components/HelpModal";
import { getGoalCopy } from "@/lib/weeklyGoals";
import { PROFILE_VERSION_EVENT, type ProfileVersionChangeDetail } from "@/lib/profileVersioning";
import { confirmInrcy } from "@/lib/inrcyDialog";
import { useUnsavedExitGuard } from "../_hooks/useUnsavedExitGuard";
import PublishAiConfigurationDrawer from "../booster/publier/components/PublishAiConfigurationDrawer";

type ActiveModal = null | "valorize" | "reviews" | "promo";

type WeeklySummary = {
  turbo?: { multiplier: number; connectedCount: number; totalChannels: number };
  missions?: {
    weeklyPropulserUse?: { done: boolean; gained: number; projected: number };
  };
};

const PROPULSER_GOAL = 1;

export default function PropulserPage() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [aiConfigurationOpen, setAiConfigurationOpen] = useState(false);
  const [isMobileHeader, setIsMobileHeader] = useState(false);
  const [active, setActive] = useState<ActiveModal>(null);
  const workflowDraftActionRef = useRef<(() => Promise<void>) | null>(null);
  const [workflowDraftSaving, setWorkflowDraftSaving] = useState(false);
  const [workflowDraftMessage, setWorkflowDraftMessage] = useState("");
  const [metrics, setMetrics] = useState<any>(null);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const [metricsLoadedOnce, setMetricsLoadedOnce] = useState(false);

  const searchParams = useSearchParams();

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobileHeader(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  const closeActiveModal = useCallback(() => {
    setActive(null);
  }, []);

  const activeHasUnsavedWork = active === "valorize" || active === "reviews" || active === "promo";

  const requestCloseActiveModal = useCallback(async () => {
    if (activeHasUnsavedWork) {
      const ok = await confirmInrcy({
        eyebrow: active === "valorize" ? "Valorisation en cours" : "Modèle en cours",
        title: active === "valorize" ? "Quitter la valorisation ?" : "Quitter ce modèle ?",
        message: "Vous avez un modèle en cours de préparation. Si vous quittez maintenant, vos modifications seront perdues.",
        cancelLabel: "Continuer l’édition",
        confirmLabel: "Quitter",
        variant: "danger",
      });
      if (!ok) return;
    }
    closeActiveModal();
  }, [active, activeHasUnsavedWork, closeActiveModal]);

  useUnsavedExitGuard({
    active: Boolean(active),
    shouldBlock: Boolean(activeHasUnsavedWork),
    onConfirmExit: closeActiveModal,
    eyebrow: active === "valorize" ? "Valorisation en cours" : "Modèle en cours",
    title: active === "valorize" ? "Quitter la valorisation ?" : "Quitter ce modèle ?",
    message: "Vous avez un modèle en cours de préparation. Si vous quittez maintenant, vos modifications seront perdues.",
    cancelLabel: "Continuer l’édition",
    confirmLabel: "Quitter",
    variant: "danger",
  });

  useEffect(() => {
    const a = (searchParams?.get("action") || "").toLowerCase();
    const normalized =
      a === "valoriser" || a === "valorize" ? "valorize" :
      a === "recolter" ? "reviews" :
      a === "offrir" ? "promo" :
      a;
    if (normalized === "valorize" || normalized === "reviews" || normalized === "promo") {
      setActive(normalized as ActiveModal);
    }
  }, [searchParams]);

  const refreshMetrics = useCallback(async () => {
    try {
      const [metricsRes, summaryRes] = await Promise.all([
        fetch("/api/propulser/metrics?days=30", { cache: "no-store" as any }),
        fetch("/api/loyalty/weekly-summary", { cache: "no-store" as any }),
      ]);
      if (metricsRes.ok) setMetrics(await metricsRes.json());
      if (summaryRes.ok) setWeeklySummary(await summaryRes.json());
    } catch {
      // ignore
    } finally {
      setMetricsLoadedOnce(true);
    }
  }, []);

  useEffect(() => { void refreshMetrics(); }, [refreshMetrics]);

  useEffect(() => {
    const handleProfileVersionChange = (event: Event) => {
      const detail = (event as CustomEvent<ProfileVersionChangeDetail>).detail;
      if (!(detail?.field === "publications_version" || detail?.field === "loyalty_version")) return;
      void refreshMetrics();
    };
    window.addEventListener(PROFILE_VERSION_EVENT, handleProfileVersionChange as EventListener);
    return () => window.removeEventListener(PROFILE_VERSION_EVENT, handleProfileVersionChange as EventListener);
  }, [refreshMetrics]);

  const metricsLoading = !metricsLoadedOnce;

  const data = useMemo(() => {
    const valorize = metrics?.valorize ?? {};
    const review = metrics?.review_mail ?? {};
    const promo = metrics?.promo_mail ?? {};
    const n = (v: any) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    const turbo = weeklySummary?.turbo?.multiplier ?? 1;
    const featureMissionDone = Boolean(weeklySummary?.missions?.weeklyPropulserUse?.done);
    const missionProjected = Number(weeklySummary?.missions?.weeklyPropulserUse?.projected ?? Math.round(10 * turbo));
    const featureGained = Number(weeklySummary?.missions?.weeklyPropulserUse?.gained ?? 0);
    const valorizeWeek = n(valorize.week);
    const reviewWeek = n(review.week);
    const promoWeek = n(promo.week);
    const totalWeek = valorizeWeek + reviewWeek + promoWeek;

    const formatLastSend = (value: any) => {
      if (!value) return "—";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "—";
      return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
    };

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

    const missionStatus = buildStatus(totalWeek, PROPULSER_GOAL);
    const campaignRows = (item: any) => [
      { name: "Envoyées cette semaine", value: n(item.week) },
      { name: "Envoyées ce mois-ci", value: n(item.month) },
      { name: "Destinataires touchés", value: n(item.sent) },
      { name: "Dernier envoi", value: formatLastSend(item.last_sent_at) },
    ];
    const valorizeRows = (item: any) => [
      { name: "Envoyées cette semaine", value: n(item.week) },
      { name: "Envoyées ce mois-ci", value: n(item.month) },
      { name: "Destinataires touchés", value: n(item.sent) },
      { name: "Dernier envoi", value: formatLastSend(item.last_sent_at) },
    ];

    const actions = [
      {
        key: "valorize" as const,
        title: "Valoriser",
        desc: "Mettez en avant vos avis, réalisations, coulisses, savoir-faire ou preuves de confiance.",
        accent: "cyan" as const,
        cta: "Lancer",
        status: { ...missionStatus, helper: buildMissionHelper(valorizeWeek, featureMissionDone, missionStatus.helper) },
        reward: buildMissionReward(valorizeWeek, featureMissionDone, missionProjected, featureGained),
      },
      {
        key: "reviews" as const,
        title: "Récolter",
        desc: "Demandez des avis ou des retours clients via un email prêt à envoyer.",
        accent: "purple" as const,
        cta: "Lancer",
        status: { ...missionStatus, helper: buildMissionHelper(reviewWeek, featureMissionDone, missionStatus.helper) },
        reward: buildMissionReward(reviewWeek, featureMissionDone, missionProjected, featureGained),
      },
      {
        key: "promo" as const,
        title: "Offrir",
        desc: "Mettez en avant une offre commerciale auprès des bons contacts.",
        accent: "pink" as const,
        cta: "Lancer",
        status: { ...missionStatus, helper: buildMissionHelper(promoWeek, featureMissionDone, missionStatus.helper) },
        reward: buildMissionReward(promoWeek, featureMissionDone, missionProjected, featureGained),
      },
    ];

    return {
      turbo,
      missions: {
        totalAvailable: missionProjected,
        totalEarned: featureGained,
        completedCount: Number(featureMissionDone),
        featureDone: featureMissionDone,
        projectedFeature: missionProjected,
        totalWeek,
      },
      actions,
      metrics: [
        { title: "Valorisations", variant: "campaign", month: n(valorize.month), week: valorizeWeek, goal: PROPULSER_GOAL, status: buildStatus(valorizeWeek, PROPULSER_GOAL), channels: valorizeRows(valorize) },
        { title: "Récoltes", variant: "campaign", month: n(review.month), week: reviewWeek, goal: PROPULSER_GOAL, status: buildStatus(reviewWeek, PROPULSER_GOAL), channels: campaignRows(review) },
        { title: "Offres", variant: "campaign", month: n(promo.month), week: promoWeek, goal: PROPULSER_GOAL, status: buildStatus(promoWeek, PROPULSER_GOAL), channels: campaignRows(promo) },
      ],
      tips: [
        { title: "Pour mieux Valoriser", lines: [{ left: "Avis client", right: "Confiance" }, { left: "Avant / après", right: "Preuve" }, { left: "Photo réelle", right: "Crédible" }] },
        { title: "Pour mieux Récolter", lines: [{ left: "Envoyer à J+1", right: "Meilleur taux" }, { left: "10 contacts ciblés", right: "Plus d’avis" }, { left: "1 relance simple", right: "x1.4" }] },
        { title: "Pour mieux Offrir", lines: [{ left: "Offre courte 7 jours", right: "Décision rapide" }, { left: "1 CTA clair", right: "Plus de clics" }, { left: "Segmenter la liste", right: "Plus pertinent" }] },
      ],
    };
  }, [metrics, weeklySummary]);

  const saveWorkflowDraftFromHeader = useCallback(async () => {
    if (!workflowDraftActionRef.current || workflowDraftSaving) return;
    setWorkflowDraftSaving(true);
    setWorkflowDraftMessage("");
    try {
      await workflowDraftActionRef.current();
    } finally {
      setWorkflowDraftSaving(false);
    }
  }, [workflowDraftSaving]);

  useEffect(() => {
    if (!active) setWorkflowDraftMessage("");
  }, [active]);

  return (
    <main className={`${styles.page} ${b.page}`}>

      <PublishAiConfigurationDrawer
        open={aiConfigurationOpen}
        isMobile={isMobileHeader}
        drawerHeight="100dvh"
        onClose={() => setAiConfigurationOpen(false)}
      />

      <div style={{ filter: active ? "blur(10px)" : "none", opacity: active ? 0.55 : 1, transition: "filter 180ms ease, opacity 180ms ease", pointerEvents: active ? "none" : "auto" }} aria-hidden={active ? true : undefined}>
        <div className={b.container}>
          <header className={b.headerRow}>
            <div className={b.titleLine}><span aria-hidden className={b.titleIcon}>🚀</span><div className={styles.title}>Propulser</div></div>
            <div className={b.tagline}>Lancez une action business. <strong>Valoriser, Récolter ou Offrir.</strong></div>
            <div className={b.closeWrap}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <HelpButton onClick={() => setHelpOpen(true)} title="Aide Propulser" />
                <ResponsiveActionButton desktopLabel="Fidéliser" mobileIcon="F" href="/dashboard/fideliser" ariaLabel="Aller vers Fidéliser" title="Fidéliser" className={b.headerBtnFideliser} />
                <Link href="/dashboard/mails?folder=propulsions" aria-label="Aller vers iNr'Send / Propulsions" title="Ouvrir iNr'Send" className={`${b.inrSendHeaderShortcut} ${b.headerBtnInrSend}`}>
                  <span className={b.inrSendHeaderText}>iNr'Send</span>
                  <img className={b.inrSendHeaderLogo} src="/inrsend-logo-seul.png" alt="" aria-hidden />
                </Link>
                <ResponsiveActionButton desktopLabel="Fermer" mobileIcon="✕" href="/dashboard" />
              </div>
            </div>
          </header>

          <HelpModal open={helpOpen} title="Propulser" onClose={() => setHelpOpen(false)}>
            <p style={{ marginTop: 0 }}>Propulser regroupe les actions qui donnent un vrai coup d’accélérateur commercial.</p>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li><strong>Valoriser</strong> : mettre en avant le savoir-faire et la preuve sociale.</li>
              <li><strong>Récolter</strong> : obtenir des avis, retours ou demandes.</li>
              <li><strong>Offrir</strong> : pousser une offre ou une opportunité commerciale.</li>
            </ul>
          </HelpModal>

          <section className={[styles.blockCard, b.missionBanner, data.missions.featureDone ? b.missionBannerDone : b.missionBannerTodo].join(" ")}>
            <div className={b.missionBannerLeft}>
              <div className={b.heroEyebrow}>Mission Propulser</div>
              <div className={b.missionBannerTitle}>1 action / semaine</div>
            </div>
            <div className={b.missionBannerCenter}>
              <span className={b.missionBannerProgress}>{metricsLoading ? <TinyLoader /> : `${data.missions.completedCount}/1`}</span>
              <span className={b.missionBannerState}>{metricsLoading ? "Chargement" : data.missions.featureDone ? "Validée" : "À lancer"}</span>
            </div>
            <div className={b.missionBannerRight}>
              <span className={b.missionBannerUi}>Jusqu’à {metricsLoading ? <TinyLoader /> : `+${data.missions.totalAvailable}`} UI</span>
              <span className={b.missionBannerEarned}>{metricsLoading ? <TinyLoader /> : `+${data.missions.totalEarned}`} UI gagnés</span>
            </div>
          </section>

          <div className={b.desktopOnly}>
            <section className={b.triRow} aria-hidden>
              <div className={[b.triItem, b.triCyan].join(" ")}><div className={b.triLabel}>VALORISER</div></div>
              <div className={[b.triItem, b.triPurple].join(" ")}><div className={b.triLabel}>RÉCOLTER</div></div>
              <div className={[b.triItem, b.triPink].join(" ")}><div className={b.triLabel}>OFFRIR</div></div>
            </section>

            <section className={b.rocketGrid}>
              {data.actions.map((a, idx) => {
                const m = data.metrics[idx];
                const tip = data.tips[idx];
                return (
                  <article key={a.key} className={b.rocketColumn}>
                    <ActionCard styles={styles} accent={a.accent} title={a.title} desc={a.desc} cta={a.cta} onClick={() => setActive(a.key)} />
                    <MetricCard styles={styles} title={m.title} month={m.month} channels={m.channels} loading={metricsLoading} />
                    <TipPanel styles={styles} title={tip.title} lines={tip.lines} />
                  </article>
                );
              })}
            </section>
          </div>

          <section className={b.mobileOnly}>
            {data.actions.map((a, idx) => {
              const m = data.metrics[idx];
              const tip = data.tips[idx];
              return (
                <div key={a.key} className={b.mobileGroup}>
                  <ActionCard styles={styles} accent={a.accent} title={a.title} desc={a.desc} cta={a.cta} onClick={() => setActive(a.key)} />
                  <details className={[b.accordion, b.mobileAccordion].join(" ")}>
                    <summary className={b.accordionSummary}>
                      <span>📊 {m.title}</span>
                      <span className={b.chev}>▾</span>
                    </summary>
                    <div className={b.accordionBody}>
                      <MetricCard styles={styles} title={m.title} month={m.month} channels={m.channels} loading={metricsLoading} />
                    </div>
                  </details>
                  <details className={[b.accordion, b.mobileAccordion].join(" ")}>
                    <summary className={b.accordionSummary}>
                      <span>💡 {tip.title}</span>
                      <span className={b.chev}>▾</span>
                    </summary>
                    <div className={b.accordionBody}>
                      <TipPanel styles={styles} title={tip.title} lines={tip.lines} />
                    </div>
                  </details>
                </div>
              );
            })}
          </section>
        </div>
      </div>


      {active && (
        <BaseModal
          title={active === "valorize" ? "Valoriser" : active === "reviews" ? "Récolter" : "Offrir"}
          moduleLabel="Module Propulser"
          onClose={requestCloseActiveModal}
          headerHidden={false}
          headerStatus={workflowDraftMessage ? <span style={{ fontSize: 12, fontWeight: 800 }}>{workflowDraftMessage}</span> : null}
          headerStatusMobileHidden
          headerActions={
            <>
              <button type="button" className={`${styles.secondaryBtn} ${styles.aiHeaderBtn}`} onClick={() => setAiConfigurationOpen(true)} aria-label="Configuration IA" title="Configuration IA">IA</button>
              <button type="button" className={styles.secondaryBtn} onClick={() => void saveWorkflowDraftFromHeader()} disabled={workflowDraftSaving} title="Enregistrer le brouillon" aria-label="Enregistrer le brouillon" style={{ width: 38, minWidth: 38, minHeight: 36, padding: 0, display: "inline-grid", placeItems: "center", fontSize: 18, borderRadius: 999, opacity: workflowDraftSaving ? 0.64 : 1, cursor: workflowDraftSaving ? "wait" : "pointer" }}>
                {workflowDraftSaving ? "…" : "💾"}
              </button>
            </>
          }
        >
          {active === "valorize" && <ValoriserModal styles={styles} onClose={requestCloseActiveModal} onDone={closeActiveModal} saveDraftActionRef={workflowDraftActionRef} onDraftStatusChange={setWorkflowDraftMessage} />}
          {active === "reviews" && <RecolterModal styles={styles} onClose={requestCloseActiveModal} onDone={closeActiveModal} saveDraftActionRef={workflowDraftActionRef} onDraftStatusChange={setWorkflowDraftMessage} />}
          {active === "promo" && <OffrirModal styles={styles} onClose={requestCloseActiveModal} onDone={closeActiveModal} saveDraftActionRef={workflowDraftActionRef} onDraftStatusChange={setWorkflowDraftMessage} />}
        </BaseModal>
      )}
    </main>
  );
}


function ActionCard({ styles, accent, title, desc, cta, onClick }: any) {
  return (
    <article className={[styles.moduleCard, styles[`accent_${accent}`], b.actionCard, b.actionCardSimple].join(" ")}>
      <div className={styles.moduleGlow} />
      <div className={b.actionMiniTitle}>{title}</div>
      <div className={[styles.moduleDesc, b.actionDesc].join(" ")}>{desc}</div>
      <div className={b.actionBtnWrap}>
        <button type="button" className={[styles.primaryBtn, b.actionBtn].join(" ")} onClick={onClick}>{cta}</button>
      </div>
    </article>
  );
}

function TinyLoader() {
  return <span aria-label="Chargement" title="Chargement">…</span>;
}

function MetricCard({ styles, title, month, channels, loading }: any) {
  return (
    <div className={[styles.blockCard, b.metricCard, b.metricCardSimple].join(" ")}>
      <div className={b.cardTopRow}>
        <div>
          <div className={styles.blockTitle}>{title}</div>
          <div className={b.progressLabel}>Statistiques</div>
        </div>
        <div className={b.pill}>Ce mois : {loading ? <TinyLoader /> : month}</div>
      </div>
      <div className={[b.channelGridCompact, b.channelGridCampaign, b.statsListSimple].join(" ")}>
        {channels.map((c: any) => (
          <div key={c.name} className={b.channelItemCompact}>
            <span>{c.name}</span>
            <span className={b.channelCount}>{loading ? <TinyLoader /> : c.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TipPanel({ styles, title, lines }: any) {
  return (
    <div className={[styles.blockCard, b.tipPanel].join(" ")}>
      <div className={b.tipPanelTitle}>💡 {title}</div>
      <div className={b.tipListCompact}>
        {lines.map((l: any, idx: number) => (
          <div key={idx} className={b.tipLineCompact}>
            <span>{l.left}</span>
            <span className={b.tipBadge}>{l.right}</span>
          </div>
        ))}
      </div>
    </div>
  );
}


const aiHeaderButtonStyle: CSSProperties = {
  width: 38,
  minWidth: 38,
  minHeight: 36,
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 2,
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 900,
  lineHeight: 1,
};
