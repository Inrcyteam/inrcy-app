"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import styles from "../../dashboard/dashboard.module.css";
import b from "./booster.module.css";
import BaseModal from "./components/BaseModal";
import PublishModal from "./components/PublishModal";
import ReviewModal from "./components/ReviewModal";
import PromoModal from "./components/PromoModal";
import ResponsiveActionButton from "../_components/ResponsiveActionButton";
import HelpButton from "../_components/HelpButton";
import HelpModal from "../_components/HelpModal";
import StatusMessage from "../_components/StatusMessage";
import { getSimpleFrenchApiError, getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import { WEEKLY_GOALS, clampProgress, getGoalCopy } from "@/lib/weeklyGoals";

type ActiveModal = null | "publish" | "reviews" | "promo";

type WeeklySummary = {
  turbo?: { multiplier: number; connectedCount: number; totalChannels: number };
  missions?: {
    createActu?: { done: boolean; gained: number; projected: number };
    weeklyFeatureUse?: { done: boolean; gained: number; projected: number };
  };
};

export default function BoosterPage() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [active, setActive] = useState<ActiveModal>(null);
  const [publishSuccessOpen, setPublishSuccessOpen] = useState(false);
  const [publishSummary, setPublishSummary] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);

  const searchParams = useSearchParams();

  useEffect(() => {
    const a = (searchParams?.get("action") || "").toLowerCase();
    const normalized =
      a === "publier" ? "publish" : a === "recolter" ? "reviews" : a === "offrir" ? "promo" : a;
    if (normalized === "publish" || normalized === "reviews" || normalized === "promo") {
      setActive(normalized as ActiveModal);
    }
  }, [searchParams]);

  const refreshMetrics = async () => {
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
  };

  const trackEvent = async (
    type: "publish" | "review_mail" | "promo_mail",
    payload: Record<string, any>
  ) => {
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
      if (type === "publish") {
        const res = await fetch("/api/booster/publish-now", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(await getSimpleFrenchApiError(res, "La publication a échoué."));
        }

        const summary = json?.summary || null;
        const failed = Object.entries((json?.results || {}) as Record<string, any>).filter(([, value]) => value && value.ok === false);
        if (summary?.allFailed || (!summary && failed.length)) {
          const detail = failed.map(([channel, value]) => `${channel}: ${String((value as any)?.error || "erreur")}`).join(" | ");
          throw new Error(getSimpleFrenchErrorMessage(detail, "La publication a échoué."));
        }

        await award("create_actu", 10, `week-${isoWeekId()}`, "Actu créée");
        return json;
      }

      await fetch("/api/booster/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, payload }),
      });
      await award("weekly_feature_use", 10, `week-${isoWeekId()}`, "Utilisation Booster/Fidéliser");
    } finally {
      await refreshMetrics();
    }
  };

  useEffect(() => {
    refreshMetrics();
  }, []);

  const data = useMemo(() => {
    const publish = metrics?.publish ?? {};
    const review = metrics?.review_mail ?? {};
    const promo = metrics?.promo_mail ?? {};

    const n = (v: any) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    const turbo = weeklySummary?.turbo?.multiplier ?? 1;
    const featureMissionDone = Boolean(weeklySummary?.missions?.weeklyFeatureUse?.done);
    const createActuDone = Boolean(weeklySummary?.missions?.createActu?.done);
    const missionProjected = Number(weeklySummary?.missions?.weeklyFeatureUse?.projected ?? Math.round(10 * turbo));
    const actuProjected = Number(weeklySummary?.missions?.createActu?.projected ?? Math.round(10 * turbo));
    const featureGained = Number(weeklySummary?.missions?.weeklyFeatureUse?.gained ?? 0);
    const actuGained = Number(weeklySummary?.missions?.createActu?.gained ?? 0);
    const totalEarned = actuGained + featureGained;

    const publishWeek = n(publish.week);
    const reviewWeek = n(review.week);
    const promoWeek = n(promo.week);

    const buildStatus = (done: number, goal: number) => {
      const copy = getGoalCopy(done, goal);
      return { label: copy.short, color: copy.tone, helper: copy.hint, ctaHint: copy.action };
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

    const publishChannels = publish.channels ?? {};
    const pc = (k: string) => n(publishChannels?.[k]);

    const actions = [
      {
        key: "publish" as const,
        title: "Publier",
        desc: "Publications, contenus, chantiers. Diffusez sur 1 ou plusieurs canaux.",
        accent: "cyan" as const,
        cta: "Publier",
        status: (() => { const s = buildStatus(publishWeek, WEEKLY_GOALS.booster.publish); return { ...s, helper: buildMissionHelper(publishWeek, createActuDone, s.helper) }; })(),
        reward: buildMissionReward(publishWeek, createActuDone, actuProjected, actuGained),
      },
      {
        key: "reviews" as const,
        title: "Récolter",
        desc: "Créez un mail clair. Sélectionnez des contacts CRM. Lancez.",
        accent: "purple" as const,
        cta: "Demander",
        status: (() => { const s = buildStatus(reviewWeek, WEEKLY_GOALS.booster.reviews); return { ...s, helper: buildMissionHelper(reviewWeek, featureMissionDone, s.helper) }; })(),
        reward: buildMissionReward(reviewWeek, featureMissionDone, missionProjected, featureGained),
      },
      {
        key: "promo" as const,
        title: "Offrir",
        desc: "Mettez en avant une offre. Choisissez un modèle. Envoyez aux bons contacts.",
        accent: "pink" as const,
        cta: "Envoyer",
        status: (() => { const s = buildStatus(promoWeek, WEEKLY_GOALS.booster.promo); return { ...s, helper: buildMissionHelper(promoWeek, featureMissionDone, s.helper) }; })(),
        reward: buildMissionReward(promoWeek, featureMissionDone, missionProjected, featureGained),
      },
    ];

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
      actions,
      metrics: [
        {
          title: "Publications",
          month: n(publish.month),
          week: publishWeek,
          goal: WEEKLY_GOALS.booster.publish,
          status: buildStatus(publishWeek, WEEKLY_GOALS.booster.publish),
          channels: [
            { name: "Site iNrCy", value: pc("inrcy_site") },
            { name: "Site web", value: pc("site_web") },
            { name: "Google Business", value: pc("gmb") },
            { name: "Facebook", value: pc("facebook") },
            { name: "Instagram", value: pc("instagram") },
            { name: "LinkedIn", value: pc("linkedin") },
          ],
        },
        {
          title: "Mails Récolter",
          month: n(review.month),
          week: reviewWeek,
          goal: WEEKLY_GOALS.booster.reviews,
          status: buildStatus(reviewWeek, WEEKLY_GOALS.booster.reviews),
          channels: [
            { name: "Envoyés", value: n(review.sent) },
            { name: "Ouverts", value: n(review.opened) },
            { name: "Cliqués", value: n(review.clicked) },
            { name: "Avis récoltés", value: n(review.reviews) },
          ],
        },
        {
          title: "Mails Promo",
          month: n(promo.month),
          week: promoWeek,
          goal: WEEKLY_GOALS.booster.promo,
          status: buildStatus(promoWeek, WEEKLY_GOALS.booster.promo),
          channels: [
            { name: "Envoyés", value: n(promo.sent) },
            { name: "Ouverts", value: n(promo.opened) },
            { name: "Cliqués", value: n(promo.clicked) },
            { name: "Demandes", value: n(promo.leads) },
          ],
        },
      ],
      tips: [
        {
          title: "Pour mieux Publier",
          lines: [
            { left: "1 post / semaine", right: "Rythme minimum" },
            { left: "Avant / après chantier", right: "Confiance" },
            { left: "Photo + 3 lignes", right: "Rapide à lancer" },
          ],
        },
        {
          title: "Pour mieux Récolter",
          lines: [
            { left: "Envoyer à J+1", right: "Meilleur taux" },
            { left: "10 contacts ciblés", right: "Plus d’avis" },
            { left: "1 relance simple", right: "x1.4" },
          ],
        },
        {
          title: "Pour mieux Offrir",
          lines: [
            { left: "Offre courte 7 jours", right: "Décision rapide" },
            { left: "1 CTA clair", right: "Plus de clics" },
            { left: "Segmenter la liste", right: "Plus pertinent" },
          ],
        },
      ],
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
            <div className={b.tagline}>Faites décoller votre activité. <strong>3 actions</strong>, maintenant.</div>
            <div className={b.closeWrap}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <HelpButton onClick={() => setHelpOpen(true)} title="Aide Booster" />
                <ResponsiveActionButton desktopLabel="Fidéliser" mobileIcon="Fidéliser" href="/dashboard/fideliser" ariaLabel="Aller vers Fidéliser" title="Fidéliser" />
                <ResponsiveActionButton desktopLabel="Fermer" mobileIcon="✕" href="/dashboard" />
              </div>
            </div>
          </header>

          <HelpModal open={helpOpen} title="Booster" onClose={() => setHelpOpen(false)}>
            <p style={{ marginTop: 0 }}>Booster est l’outil principal pour développer votre activité.</p>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>Communiquez vite sur vos canaux.</li>
              <li>Débloquez vos UI hebdomadaires avec le multiplicateur Turbo UI.</li>
              <li>Gardez un rythme simple, visible et motivant.</li>
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
              <div className={[b.triItem, b.triCyan].join(" ")}><div className={b.triLabel}>PUBLIER</div></div>
              <div className={[b.triItem, b.triPurple].join(" ")}><div className={b.triLabel}>RÉCOLTER</div></div>
              <div className={[b.triItem, b.triPink].join(" ")}><div className={b.triLabel}>OFFRIR</div></div>
            </section>

            <section className={b.grid3}>
              {data.actions.map((a) => (
                <ActionCard key={a.key} styles={styles} accent={a.accent} title={a.title} desc={a.desc} cta={a.cta} status={a.status} reward={a.reward} onClick={() => setActive(a.key)} />
              ))}
            </section>

            <section className={b.grid3} style={{ marginTop: 8 }}>
              {data.metrics.map((m, idx) => (
                <div key={m.title} className={b.stackCard}>
                  <MetricCard styles={styles} title={m.title} month={m.month} week={m.week} goal={m.goal} channels={m.channels} status={m.status} />
                  <TipAccordion styles={styles} title={data.tips[idx].title} lines={data.tips[idx].lines} />
                </div>
              ))}
            </section>
          </div>

          <section className={b.mobileOnly}>
            {data.actions.map((a, idx) => {
              const m = data.metrics[idx];
              const tip = data.tips[idx];
              return (
                <div key={a.key} className={b.mobileGroup}>
                  <ActionCard styles={styles} accent={a.accent} title={a.title} desc={a.desc} cta={a.cta} status={a.status} reward={a.reward} onClick={() => setActive(a.key)} />
                  <details className={b.accordion}>
                    <summary className={b.accordionSummary}><span>📊 Progression</span><span className={b.chev}>▾</span></summary>
                    <div className={b.accordionBody}>
                      <MetricCard styles={styles} title={m.title} month={m.month} week={m.week} goal={m.goal} channels={m.channels} status={m.status} />
                    </div>
                  </details>
                  <TipAccordion styles={styles} title={tip.title} lines={tip.lines} />
                </div>
              );
            })}
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
              {publishSummary?.failureCount
                ? `Votre publication a été envoyée sur ${publishSummary?.successCount || 0} canal(aux). ${publishSummary?.failureCount || 0} canal(aux) n'ont pas pu publier.`
                : "Votre actualité a bien été prise en compte. Elle est maintenant en cours de diffusion sur vos canaux sélectionnés."}
            </div>
            <StatusMessage variant={publishSummary?.failureCount ? "error" : "success"} style={{ marginTop: 0, fontSize: 14 }}>
              {publishSummary?.failureCount ? "Succès partiel : vérifiez le détail ci-dessous." : "C&apos;est parfait, votre publication est lancée."}
            </StatusMessage>
            {Array.isArray(publishSummary?.entries) ? (
              <div style={{ marginTop: 14, display: "grid", gap: 8, textAlign: "left" }}>
                {publishSummary.entries.map((entry: any) => (
                  <div key={entry.channel} style={{ borderRadius: 14, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                      <strong>{entry.ok ? "✅" : "❌"} {entry.label}</strong>
                      <span style={{ fontSize: 12, opacity: 0.75 }}>{entry.ok ? "Publié" : "Échec"}</span>
                    </div>
                    {entry.error ? <div style={{ marginTop: 6, fontSize: 13, color: "#ffb4b4" }}>{entry.error}</div> : null}
                    {entry.warning_message ? <div style={{ marginTop: 6, fontSize: 13, color: "#fde68a" }}>{entry.warning_message}</div> : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {active && (
        <BaseModal title={active === "publish" ? "Publier" : active === "reviews" ? "Récolter" : "Offrir"} moduleLabel="Module Booster" onClose={() => setActive(null)}>
          {active === "publish" && <PublishModal styles={styles} onClose={() => setActive(null)} trackEvent={trackEvent} onPublishSuccess={(result) => { setPublishSummary(result?.summary || null); setPublishSuccessOpen(true); }} />}
          {active === "reviews" && <ReviewModal styles={styles} onClose={() => setActive(null)} />}
          {active === "promo" && <PromoModal styles={styles} onClose={() => setActive(null)} />}
        </BaseModal>
      )}
    </main>
  );
}

function MissionPill({ title, done, reward, turbo }: { title: string; done: boolean; reward: number; turbo: number }) {
  return (
    <div className={[b.missionPill, done ? b.missionDone : b.missionTodo].join(" ")}>
      <div>
        <div className={b.missionTitle}>{title}</div>
        <div className={b.missionSubtitle}>{done ? "Mission validée" : `+${reward} UI avec ×${turbo}`}</div>
      </div>
      <div className={[b.missionState, done ? b.missionStateDone : b.missionStateTodo].join(" ")}>{done ? "Fait" : "À faire"}</div>
    </div>
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
      <div className={b.actionBtnWrap}>
        <button type="button" className={[styles.primaryBtn, b.actionBtn].join(" ")} onClick={onClick}>{cta}</button>
      </div>
    </article>
  );
}

function MetricCard({ styles, title, month, week, goal, channels, status }: any) {
  const paddedChannels = [...channels, ...Array.from({ length: Math.max(0, 6 - channels.length) }, (_, idx) => ({ name: `__empty_${idx}`, value: "", empty: true }))];
  const progress = clampProgress(week, goal);
  const toneClass = status.color === "green" ? b.toneGreen : status.color === "orange" ? b.toneOrange : b.toneRed;
  return (
    <div className={[styles.blockCard, b.metricCard].join(" ")}>
      <div className={b.cardTopRow}>
        <div>
          <div className={styles.blockTitle}>{title}</div>
          <div className={b.progressLabel}>Progression hebdo</div>
        </div>
        <div className={b.pill}>Ce mois : {month}</div>
      </div>
      <div className={b.metricLine}>
        <div className={b.metricBubble}>{week}/{goal}</div>
        <div className={[b.progressState, toneClass].join(" ")}>{status.label}</div>
      </div>
      <div className={b.progressBar}><div className={[b.progressFill, toneClass].join(" ")} style={{ width: `${progress * 100}%` }} /></div>
      <div className={b.progressHint}>{status.helper}</div>
      <div className={b.channelGridCompact}>
        {paddedChannels.map((c: any) => <div key={c.name} className={[b.channelItemCompact, c.empty ? b.channelItemPlaceholder : ""].join(" ")} aria-hidden={c.empty ? true : undefined}><span>{c.name}</span><span className={b.channelCount}>{c.value}</span></div>)}
      </div>
    </div>
  );
}

function TipAccordion({ styles, title, lines }: any) {
  return (
    <details className={b.accordion}>
      <summary className={b.accordionSummary}><span>💡 {title}</span><span className={b.chev}>▾</span></summary>
      <div className={b.accordionBody}>
        <div className={[styles.blockCard, b.tipCard].join(" ")}>
          <div className={b.tipListCompact}>
            {lines.map((l: any, idx: number) => <div key={idx} className={b.tipLineCompact}><span>{l.left}</span><span className={b.tipBadge}>{l.right}</span></div>)}
          </div>
        </div>
      </div>
    </details>
  );
}
