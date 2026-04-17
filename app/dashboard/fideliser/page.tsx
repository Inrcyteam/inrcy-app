"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "../../dashboard/dashboard.module.css";
import b from "./fideliser.module.css";
import BaseModal from "./components/BaseModal";
import InformModal from "./components/InformModal";
import ThanksModal from "./components/ThanksModal";
import SatisfactionModal from "./components/SatisfactionModal";
import ResponsiveActionButton from "../_components/ResponsiveActionButton";
import HelpButton from "../_components/HelpButton";
import HelpModal from "../_components/HelpModal";
import { WEEKLY_GOALS, clampProgress, getGoalCopy } from "@/lib/weeklyGoals";
import { PROFILE_VERSION_EVENT, type ProfileVersionChangeDetail } from "@/lib/profileVersioning";

type ActiveModal = null | "inform" | "thanks" | "satisfaction";

type WeeklySummary = {
  turbo?: { multiplier: number; connectedCount: number; totalChannels: number };
  missions?: {
    createActu?: { done: boolean; gained: number; projected: number };
    weeklyFeatureUse?: { done: boolean; gained: number; projected: number };
  };
};

export default function FideliserPage() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [active, setActive] = useState<ActiveModal>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const searchParams = useSearchParams();

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

  const data = useMemo(() => {
    const newsletter = metrics?.newsletter_mail ?? {};
    const thanks = metrics?.thanks_mail ?? {};
    const satisfaction = metrics?.satisfaction_mail ?? {};
    const n = (v: any) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    const turbo = weeklySummary?.turbo?.multiplier ?? 1;
    const featureMissionDone = Boolean(weeklySummary?.missions?.weeklyFeatureUse?.done);
    const createActuDone = Boolean(weeklySummary?.missions?.createActu?.done);
    const missionProjected = Number(weeklySummary?.missions?.weeklyFeatureUse?.projected ?? Math.round(10 * turbo));
    const actuProjected = Number(weeklySummary?.missions?.createActu?.projected ?? Math.round(10 * turbo));
    const featureGained = Number(weeklySummary?.missions?.weeklyFeatureUse?.gained ?? 0);
    const actuGained = Number(weeklySummary?.missions?.createActu?.gained ?? 0);
    const totalEarned = actuGained + featureGained;

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

    return {
      turbo,
      missions: {
        totalAvailable: actuProjected + missionProjected,
        totalEarned,
        completedCount: Number(createActuDone) + Number(featureMissionDone),
        featureDone: featureMissionDone,
        createActuDone,
        projectedFeature: missionProjected,
        projectedActu: actuProjected,
      },
      actions: [
        {
          key: "inform" as const,
          title: "Informer",
          desc: "Newsletter, actualités, nouveautés. Sélectionnez vos contacts CRM puis envoyez.",
          accent: "cyan" as const,
          cta: "Envoyer",
          status: (() => { const s = buildStatus(informWeek, WEEKLY_GOALS.fideliser.inform); return { ...s, helper: buildMissionHelper(informWeek, featureMissionDone, s.helper) }; })(),
          reward: buildMissionReward(informWeek, featureMissionDone, missionProjected, featureGained),
        },
        {
          key: "thanks" as const,
          title: "Suivre",
          desc: "Un mail simple après intervention. Sélectionnez des contacts CRM. Lancez.",
          accent: "purple" as const,
          cta: "Envoyer",
          status: (() => { const s = buildStatus(thanksWeek, WEEKLY_GOALS.fideliser.thanks); return { ...s, helper: buildMissionHelper(thanksWeek, featureMissionDone, s.helper) }; })(),
          reward: buildMissionReward(thanksWeek, featureMissionDone, missionProjected, featureGained),
        },
        {
          key: "satisfaction" as const,
          title: "Enquêter",
          desc: "Enquête de satisfaction ou demande d’avis. Envoyez aux bons clients.",
          accent: "pink" as const,
          cta: "Envoyer",
          status: (() => { const s = buildStatus(satisfactionWeek, WEEKLY_GOALS.fideliser.satisfaction); return { ...s, helper: buildMissionHelper(satisfactionWeek, featureMissionDone, s.helper) }; })(),
          reward: buildMissionReward(satisfactionWeek, featureMissionDone, missionProjected, featureGained),
        },
      ],
      metrics: [
        {
          title: "Newsletters",
          month: n(newsletter.month),
          week: informWeek,
          goal: WEEKLY_GOALS.fideliser.inform,
          status: buildStatus(informWeek, WEEKLY_GOALS.fideliser.inform),
          channels: [
            { name: "Envoyés", value: n(newsletter.sent) },
            { name: "Ouverts", value: n(newsletter.opened) },
            { name: "Cliqués", value: n(newsletter.clicked) },
            { name: "Désinscriptions", value: n(newsletter.unsub) },
          ],
        },
        {
          title: "Suivre",
          month: n(thanks.month),
          week: thanksWeek,
          goal: WEEKLY_GOALS.fideliser.thanks,
          status: buildStatus(thanksWeek, WEEKLY_GOALS.fideliser.thanks),
          channels: [
            { name: "Envoyés", value: n(thanks.sent) },
            { name: "Ouverts", value: n(thanks.opened) },
            { name: "Cliqués", value: n(thanks.clicked) },
            { name: "Réponses", value: n(thanks.replies) },
          ],
        },
        {
          title: "Enquêter",
          month: n(satisfaction.month),
          week: satisfactionWeek,
          goal: WEEKLY_GOALS.fideliser.satisfaction,
          status: buildStatus(satisfactionWeek, WEEKLY_GOALS.fideliser.satisfaction),
          channels: [
            { name: "Envoyés", value: n(satisfaction.sent) },
            { name: "Ouverts", value: n(satisfaction.opened) },
            { name: "Réponses reçues", value: n(satisfaction.reviews) },
            { name: "Scores", value: n(satisfaction.scores) },
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
      <div style={{ filter: active ? "blur(10px)" : "none", opacity: active ? 0.55 : 1, transition: "filter 180ms ease, opacity 180ms ease", pointerEvents: active ? "none" : "auto" }} aria-hidden={active ? true : undefined}>
        <div className={b.container}>
          <header className={b.headerRow}>
            <div className={b.titleLine}><span aria-hidden className={b.titleIcon}>🚀</span><div className={styles.title}>Fidéliser</div></div>
            <div className={b.tagline}>Faites revenir vos clients. <strong>3 actions</strong>, maintenant.</div>
            <div className={b.closeWrap}><div style={{ display: "flex", alignItems: "center", gap: 10 }}><HelpButton onClick={() => setHelpOpen(true)} title="Aide Fidéliser" /><ResponsiveActionButton desktopLabel="Booster" mobileIcon="Booster" href="/dashboard/booster" ariaLabel="Aller vers Booster" title="Booster" /><ResponsiveActionButton desktopLabel="Fermer" mobileIcon="✕" href="/dashboard" /></div></div>
          </header>

          <HelpModal open={helpOpen} title="Fidéliser" onClose={() => setHelpOpen(false)}>
            <p style={{ marginTop: 0 }}>Fidéliser vous aide à faire revenir vos clients avec un rythme simple.</p>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>Restez visible après l’intervention.</li>
              <li>Transformez la relation client en récurrence.</li>
              <li>Débloquez vos UI avec le multiplicateur Turbo UI.</li>
            </ul>
          </HelpModal>

          <details className={[styles.blockCard, b.missionAccordion].join(" ")}>
            <summary className={b.missionSummary}>
              <div className={b.missionSummaryLeft}>
                <div className={b.heroEyebrow}>Missions de la semaine</div>
              </div>
              <div className={b.missionSummaryCenter}>Turbo UI ×{data.turbo} · Jusqu’à +{data.missions.totalAvailable} UI</div>
              <div className={b.missionSummaryMeta}>
                <div className={b.heroScore}>+{data.missions.totalEarned} UI</div>
                <span className={b.missionToggle}>Voir le détail <span className={b.missionChev} aria-hidden>▾</span></span>
              </div>
            </summary>
            <div className={b.missionBody}>
              <div className={b.heroMeta}><span>{data.missions.completedCount}/2 missions validées</span><span>{weeklySummary?.turbo?.connectedCount ?? 0}/{weeklySummary?.turbo?.totalChannels ?? 6} canaux connectés</span><span>Gains boostés par le multiplicateur</span></div>
              <div className={b.heroMissionGrid}>
                <MissionPill title="Créer une actu" done={data.missions.createActuDone} reward={data.missions.projectedActu} turbo={data.turbo} />
                <MissionPill title="Utiliser Booster / Fidéliser" done={data.missions.featureDone} reward={data.missions.projectedFeature} turbo={data.turbo} />
              </div>
            </div>
          </details>

          <div className={b.desktopOnly}>
            <section className={b.triRow} aria-hidden>
              <div className={[b.triItem, b.triCyan].join(" ")}><div className={b.triLabel}>INFORMER</div></div>
              <div className={[b.triItem, b.triPurple].join(" ")}><div className={b.triLabel}>SUIVRE</div></div>
              <div className={[b.triItem, b.triPink].join(" ")}><div className={b.triLabel}>ENQUÊTER</div></div>
            </section>
            <section className={b.grid3}>
              {data.actions.map((a) => <ActionCard key={a.key} styles={styles} accent={a.accent} title={a.title} desc={a.desc} cta={a.cta} status={a.status} reward={a.reward} onClick={() => setActive(a.key)} />)}
            </section>
            <section className={b.grid3} style={{ marginTop: 8 }}>
              {data.metrics.map((m, idx) => <div key={m.title} className={b.stackCard}><MetricCard styles={styles} title={m.title} month={m.month} week={m.week} goal={m.goal} channels={m.channels} status={m.status} /><TipAccordion styles={styles} title={data.tips[idx].title} lines={data.tips[idx].lines} /></div>)}
            </section>
          </div>

          <section className={b.mobileOnly}>
            {data.actions.map((a, idx) => {
              const m = data.metrics[idx];
              const tip = data.tips[idx];
              return <div key={a.key} className={b.mobileGroup}><ActionCard styles={styles} accent={a.accent} title={a.title} desc={a.desc} cta={a.cta} status={a.status} reward={a.reward} onClick={() => setActive(a.key)} /><details className={b.accordion}><summary className={b.accordionSummary}><span>📊 Progression</span><span className={b.chev}>▾</span></summary><div className={b.accordionBody}><MetricCard styles={styles} title={m.title} month={m.month} week={m.week} goal={m.goal} channels={m.channels} status={m.status} /></div></details><TipAccordion styles={styles} title={tip.title} lines={tip.lines} /></div>;
            })}
          </section>
        </div>
      </div>

      {active && (
        <BaseModal title={active === "inform" ? "Informer" : active === "thanks" ? "Suivre" : "Enquêter"} moduleLabel="Module Fidéliser" onClose={() => setActive(null)}>
          {active === "inform" && <InformModal styles={styles} onClose={() => setActive(null)} />}
          {active === "thanks" && <ThanksModal styles={styles} onClose={() => setActive(null)} />}
          {active === "satisfaction" && <SatisfactionModal styles={styles} onClose={() => setActive(null)} />}
        </BaseModal>
      )}
    </main>
  );
}

function MissionPill({ title, done, reward, turbo }: { title: string; done: boolean; reward: number; turbo: number }) {
  return <div className={[b.missionPill, done ? b.missionDone : b.missionTodo].join(" ")}><div><div className={b.missionTitle}>{title}</div><div className={b.missionSubtitle}>{done ? "Mission validée" : `+${reward} UI avec ×${turbo}`}</div></div><div className={[b.missionState, done ? b.missionStateDone : b.missionStateTodo].join(" ")}>{done ? "Fait" : "À faire"}</div></div>;
}

function ActionCard({ styles, accent, title, desc, cta, status, reward, onClick }: any) {
  const toneClass = status.color === "green" ? b.toneGreen : status.color === "orange" ? b.toneOrange : b.toneRed;
  return <article className={[styles.moduleCard, styles[`accent_${accent}`], b.actionCard].join(" ")}><div className={styles.moduleGlow} /><div className={b.actionTop}><div className={b.actionMiniTitle}>{title}</div><div className={[b.status, toneClass].join(" ")}><span className={[b.dot, b[`dot${status.color.charAt(0).toUpperCase()}${status.color.slice(1)}`]].join(" ")} aria-hidden /><span>{status.label}</span></div></div><div className={b.actionCenter}><div className={[styles.moduleDesc, b.actionDesc].join(" ")}>{desc}</div><div className={b.actionReward}>{reward}</div><div className={b.actionHelper}>{status.helper}</div></div><div className={b.actionBtnWrap}><button type="button" className={[styles.primaryBtn, b.actionBtn].join(" ")} onClick={onClick}>{cta}</button></div></article>;
}

function MetricCard({ styles, title, month, week, goal, channels, status }: any) {
  const paddedChannels = [...channels, ...Array.from({ length: Math.max(0, 6 - channels.length) }, (_, idx) => ({ name: `__empty_${idx}`, value: "", empty: true }))];
  const progress = clampProgress(week, goal);
  const toneClass = status.color === "green" ? b.toneGreen : status.color === "orange" ? b.toneOrange : b.toneRed;
  return <div className={[styles.blockCard, b.metricCard].join(" ")}><div className={b.cardTopRow}><div><div className={styles.blockTitle}>{title}</div><div className={b.progressLabel}>Progression hebdo</div></div><div className={b.pill}>Ce mois : {month}</div></div><div className={b.metricLine}><div className={b.metricBubble}>{week}/{goal}</div><div className={[b.progressState, toneClass].join(" ")}>{status.label}</div></div><div className={b.progressBar}><div className={[b.progressFill, toneClass].join(" ")} style={{ width: `${progress * 100}%` }} /></div><div className={b.progressHint}>{status.helper}</div><div className={b.channelGridCompact}>{paddedChannels.map((c: any) => <div key={c.name} className={[b.channelItemCompact, c.empty ? b.channelItemPlaceholder : ""].join(" ")} aria-hidden={c.empty ? true : undefined}><span>{c.name}</span><span className={b.channelCount}>{c.value}</span></div>)}</div></div>;
}

function TipAccordion({ styles, title, lines }: any) {
  return <details className={b.accordion}><summary className={b.accordionSummary}><span>💡 {title}</span><span className={b.chev}>▾</span></summary><div className={b.accordionBody}><div className={[styles.blockCard, b.tipCard].join(" ")}><div className={b.tipListCompact}>{lines.map((l: any, idx: number) => <div key={idx} className={b.tipLineCompact}><span>{l.left}</span><span className={b.tipBadge}>{l.right}</span></div>)}</div></div></div></details>;
}
