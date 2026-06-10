"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import styles from "../../dashboard/dashboard.module.css";
import b from "./fideliser.module.css";
import BaseModal from "./components/BaseModal";
import InformerModal from "./components/informer/InformerModal";
import SuivreModal from "./components/suivre/SuivreModal";
import EnqueterModal from "./components/enqueter/EnqueterModal";
import ResponsiveActionButton from "../_components/ResponsiveActionButton";
import HelpButton from "../_components/HelpButton";
import HelpModal from "../_components/HelpModal";
import { WEEKLY_GOALS, getGoalCopy } from "@/lib/weeklyGoals";
import { PROFILE_VERSION_EVENT, type ProfileVersionChangeDetail } from "@/lib/profileVersioning";
import { confirmInrcy } from "@/lib/inrcyDialog";
import { useUnsavedExitGuard } from "../_hooks/useUnsavedExitGuard";
import PublishAiConfigurationDrawer from "../booster/publier/components/PublishAiConfigurationDrawer";

type ActiveModal = null | "inform" | "thanks" | "satisfaction";

type WeeklySummary = {
  turbo?: { multiplier: number; connectedCount: number; totalChannels: number };
  missions?: {
    weeklyFideliserUse?: { done: boolean; gained: number; projected: number };
  };
};

export default function FideliserPage() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [aiConfigurationOpen, setAiConfigurationOpen] = useState(false);
  const [isMobileHeader, setIsMobileHeader] = useState(false);
  const [active, setActive] = useState<ActiveModal>(null);
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

  const closeActiveModal = useCallback(() => setActive(null), []);

  const requestCloseActiveModal = useCallback(async () => {
    if (active) {
      const ok = await confirmInrcy({
        eyebrow: "Modèle en cours",
        title: "Quitter ce modèle ?",
        message: "Vous avez un modèle en cours de préparation. Si vous quittez maintenant, vos modifications seront perdues.",
        cancelLabel: "Continuer l’édition",
        confirmLabel: "Quitter",
        variant: "danger",
      });
      if (!ok) return;
    }
    closeActiveModal();
  }, [active, closeActiveModal]);

  useUnsavedExitGuard({
    active: Boolean(active),
    shouldBlock: Boolean(active),
    onConfirmExit: closeActiveModal,
    eyebrow: "Modèle en cours",
    title: "Quitter ce modèle ?",
    message: "Vous avez un modèle en cours de préparation. Si vous quittez maintenant, vos modifications seront perdues.",
    cancelLabel: "Continuer l’édition",
    confirmLabel: "Quitter",
    variant: "danger",
  });

  useEffect(() => {
    const a = (searchParams?.get("action") || "").toLowerCase();
    const normalized = a === "informer" ? "inform" : a === "suivre" ? "thanks" : a === "enqueter" ? "satisfaction" : a;
    if (normalized === "inform" || normalized === "thanks" || normalized === "satisfaction") {
      setActive(normalized as ActiveModal);
    }
  }, [searchParams]);

  const refreshMetrics = useCallback(async () => {
    try {
      const [metricsRes, summaryRes] = await Promise.all([
        fetch("/api/fideliser/metrics?days=30", { cache: "no-store" as any }),
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

  useEffect(() => {
    void refreshMetrics();
  }, [refreshMetrics]);

  useEffect(() => {
    const handleProfileVersionChange = (event: Event) => {
      const detail = (event as CustomEvent<ProfileVersionChangeDetail>).detail;
      if (!(detail?.field === "loyalty_version")) return;
      void refreshMetrics();
    };

    window.addEventListener(PROFILE_VERSION_EVENT, handleProfileVersionChange as EventListener);
    return () => {
      window.removeEventListener(PROFILE_VERSION_EVENT, handleProfileVersionChange as EventListener);
    };
  }, [refreshMetrics]);

  const metricsLoading = !metricsLoadedOnce;

  const data = useMemo(() => {
    const newsletter = metrics?.newsletter_mail ?? {};
    const thanks = metrics?.thanks_mail ?? {};
    const satisfaction = metrics?.satisfaction_mail ?? {};
    const n = (v: any) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    const turbo = weeklySummary?.turbo?.multiplier ?? 1;
    const featureMissionDone = Boolean(weeklySummary?.missions?.weeklyFideliserUse?.done);
    const missionProjected = Number(weeklySummary?.missions?.weeklyFideliserUse?.projected ?? Math.round(10 * turbo));
    const featureGained = Number(weeklySummary?.missions?.weeklyFideliserUse?.gained ?? 0);
    const totalEarned = featureGained;

    const buildStatus = (done: number, goal: number) => {
      const copy = getGoalCopy(done, goal);
      return { label: copy.short, color: copy.tone, helper: copy.hint };
    };

    const buildMissionReward = (doneThisCard: number, missionDone: boolean, projected: number, gained: number) => {
      if (missionDone) {
        if (doneThisCard > 0) return `${gained} UI gagnés`;
        return `Mission UI déjà sécurisée`;
      }
      return `+${projected} UI × multiplicateur`;
    };

    const buildMissionHelper = (doneThisCard: number, missionDone: boolean, fallback: string) => {
      if (missionDone && doneThisCard <= 0) return "Cette action reste utile, mais ne rapporte plus d’UI cette semaine.";
      return fallback;
    };

    const informWeek = n(newsletter.week);
    const thanksWeek = n(thanks.week);
    const satisfactionWeek = n(satisfaction.week);
    const totalWeek = informWeek + thanksWeek + satisfactionWeek;
    const missionStatus = buildStatus(totalWeek, 1);

    const formatLastSend = (value: any) => {
      if (!value) return "—";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "—";
      return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
    };

    return {
      turbo,
      missions: {
        totalAvailable: missionProjected,
        totalEarned,
        completedCount: Number(featureMissionDone),
        featureDone: featureMissionDone,
        projectedFeature: missionProjected,
        totalWeek,
      },
      actions: [
        {
          key: "inform" as const,
          title: "Informer",
          desc: "Newsletter, actualités, nouveautés. Sélectionnez vos contacts CRM puis envoyez.",
          accent: "cyan" as const,
          cta: "Envoyer",
          status: { ...missionStatus, helper: buildMissionHelper(informWeek, featureMissionDone, missionStatus.helper) },
          reward: buildMissionReward(informWeek, featureMissionDone, missionProjected, featureGained),
        },
        {
          key: "thanks" as const,
          title: "Suivre",
          desc: "Un mail simple après intervention. Sélectionnez des contacts CRM. Lancez.",
          accent: "purple" as const,
          cta: "Envoyer",
          status: { ...missionStatus, helper: buildMissionHelper(thanksWeek, featureMissionDone, missionStatus.helper) },
          reward: buildMissionReward(thanksWeek, featureMissionDone, missionProjected, featureGained),
        },
        {
          key: "satisfaction" as const,
          title: "Enquêter",
          desc: "Enquête de satisfaction ou demande d’avis. Envoyez aux bons clients.",
          accent: "pink" as const,
          cta: "Envoyer",
          status: { ...missionStatus, helper: buildMissionHelper(satisfactionWeek, featureMissionDone, missionStatus.helper) },
          reward: buildMissionReward(satisfactionWeek, featureMissionDone, missionProjected, featureGained),
        },
      ],
      metrics: [
        {
          title: "Informations",
          variant: "campaign",
          month: n(newsletter.month),
          week: informWeek,
          goal: WEEKLY_GOALS.fideliser.inform,
          status: buildStatus(informWeek, WEEKLY_GOALS.fideliser.inform),
          channels: [
            { name: "Envoyées cette semaine", value: informWeek },
            { name: "Envoyées ce mois-ci", value: n(newsletter.month) },
            { name: "Destinataires touchés", value: n(newsletter.sent) },
            { name: "Dernier envoi", value: formatLastSend(newsletter.last_sent_at) },
          ],
        },
        {
          title: "Suivis",
          variant: "campaign",
          month: n(thanks.month),
          week: thanksWeek,
          goal: WEEKLY_GOALS.fideliser.thanks,
          status: buildStatus(thanksWeek, WEEKLY_GOALS.fideliser.thanks),
          channels: [
            { name: "Envoyées cette semaine", value: thanksWeek },
            { name: "Envoyées ce mois-ci", value: n(thanks.month) },
            { name: "Destinataires touchés", value: n(thanks.sent) },
            { name: "Dernier envoi", value: formatLastSend(thanks.last_sent_at) },
          ],
        },
        {
          title: "Enquêtes",
          variant: "campaign",
          month: n(satisfaction.month),
          week: satisfactionWeek,
          goal: WEEKLY_GOALS.fideliser.satisfaction,
          status: buildStatus(satisfactionWeek, WEEKLY_GOALS.fideliser.satisfaction),
          channels: [
            { name: "Envoyées cette semaine", value: satisfactionWeek },
            { name: "Envoyées ce mois-ci", value: n(satisfaction.month) },
            { name: "Destinataires touchés", value: n(satisfaction.sent) },
            { name: "Dernier envoi", value: formatLastSend(satisfaction.last_sent_at) },
          ],
        },
      ],
      tips: [
        {
          title: "Pour mieux Informer",
          lines: [
            { left: "1 newsletter / mois", right: "Top rappel" },
            { left: "Sujet clair", right: "Plus d’ouvertures" },
            { left: "1 CTA max", right: "Plus de clics" },
          ],
        },
        {
          title: "Pour mieux Suivre",
          lines: [
            { left: "Envoyer à J+1", right: "Meilleur timing" },
            { left: "Message court", right: "Lecture rapide" },
            { left: "Prochain pas clair", right: "Récurrence" },
          ],
        },
        {
          title: "Pour mieux Enquêter",
          lines: [
            { left: "3 questions max", right: "Plus de réponses" },
            { left: "Demande d’avis ciblée", right: "Plus d’avis" },
            { left: "1 relance", right: "x1.4" },
          ],
        },
      ],
    };
  }, [metrics, weeklySummary]);

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
            <div className={b.titleLine}><span aria-hidden className={b.titleIcon}>💌</span><div className={styles.title}>Fidéliser</div></div>
            <div className={b.tagline}>Faites revenir vos clients. <strong>3 actions</strong>, maintenant.</div>
            <div className={b.closeWrap}><div style={{ display: "flex", alignItems: "center", gap: 10 }}><HelpButton onClick={() => setHelpOpen(true)} title="Aide Fidéliser" /><button type="button" className={`${styles.secondaryBtn} ${styles.aiHeaderBtn}`} onClick={() => setAiConfigurationOpen(true)} aria-label="Configuration IA" title="Configuration IA">IA</button><ResponsiveActionButton desktopLabel="Propulser" mobileIcon="P" href="/dashboard/propulser" ariaLabel="Aller vers Propulser" title="Propulser" className={b.headerBtnBooster} /><ResponsiveActionButton desktopLabel="iNr'Send" mobileIcon="✉️" href="/dashboard/mails?folder=fidelisations" ariaLabel="Aller vers iNr'Send / Fidélisations" title="Ouvrir iNr'Send" className={b.headerBtnInrSend} /><ResponsiveActionButton desktopLabel="Fermer" mobileIcon="✕" href="/dashboard" /></div></div>
          </header>

          <HelpModal open={helpOpen} title="Fidéliser" onClose={() => setHelpOpen(false)}>
            <p style={{ marginTop: 0 }}>Fidéliser vous aide à faire revenir vos clients avec un rythme simple.</p>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>Restez visible après l’intervention.</li>
              <li>Transformez la relation client en récurrence.</li>
              <li>Débloquez vos UI avec le multiplicateur Turbo UI.</li>
            </ul>
            <div style={{ marginTop: 14, borderRadius: 14, padding: "12px 14px", border: "1px solid rgba(76,195,255,0.24)", background: "rgba(76,195,255,0.08)", lineHeight: 1.55 }}>
              <strong>Toutes vos communications sont accessibles dans iNr'Send.</strong><br />
              Les actions lancées depuis Fidéliser y restent consultables, et les publications réalisées depuis Booster sont aussi retrouvables dans iNr'Send / Publications pour être modifiées ou supprimées.
            </div>
          </HelpModal>

          <section className={[styles.blockCard, b.missionBanner, data.missions.featureDone ? b.missionBannerDone : b.missionBannerTodo].join(" ")}>
            <div className={b.missionBannerLeft}>
              <div className={b.heroEyebrow}>Mission Fidéliser</div>
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
              <div className={[b.triItem, b.triCyan].join(" ")}><div className={b.triLabel}>INFORMER</div></div>
              <div className={[b.triItem, b.triPurple].join(" ")}><div className={b.triLabel}>SUIVRE</div></div>
              <div className={[b.triItem, b.triPink].join(" ")}><div className={b.triLabel}>ENQUÊTER</div></div>
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
        <BaseModal title={active === "inform" ? "Informer" : active === "thanks" ? "Suivre" : "Enquêter"} moduleLabel="Module Fidéliser" onClose={requestCloseActiveModal} headerActions={<button type="button" className={`${styles.secondaryBtn} ${styles.aiHeaderBtn}`} onClick={() => setAiConfigurationOpen(true)} aria-label="Configuration IA" title="Configuration IA">IA</button>}>
          {active === "inform" && <InformerModal styles={styles} onClose={requestCloseActiveModal} onDone={closeActiveModal} />}
          {active === "thanks" && <SuivreModal styles={styles} onClose={requestCloseActiveModal} onDone={closeActiveModal} />}
          {active === "satisfaction" && <EnqueterModal styles={styles} onClose={requestCloseActiveModal} onDone={closeActiveModal} />}
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
