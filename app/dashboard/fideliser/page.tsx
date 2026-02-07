"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import styles from "../../dashboard/dashboard.module.css";
import b from "./fideliser.module.css";
import BaseModal from "./components/BaseModal";
import InformModal from "./components/InformModal";
import ThanksModal from "./components/ThanksModal";
import SatisfactionModal from "./components/SatisfactionModal";

type ActiveModal = null | "inform" | "thanks" | "satisfaction";

export default function FideliserPage() {
  const [active, setActive] = useState<ActiveModal>(null);

  const searchParams = useSearchParams();

  // Deep-link support: /dashboard/fideliser?action=inform|thanks|satisfaction
  useEffect(() => {
    const a = (searchParams?.get("action") || "").toLowerCase();
    if (a === "inform" || a === "thanks" || a === "satisfaction") {
      setActive(a as ActiveModal);
    }
  }, [searchParams]);

  const [metrics, setMetrics] = useState<any>(null);

  const refreshMetrics = async () => {
  try {
    const res = await fetch("/api/fideliser/metrics?days=30", { cache: "no-store" as any });
    if (!res.ok) return;
    const json = await res.json();
    setMetrics(json);
  } catch {
    // ignore
  }
};

const trackEvent = async (
  type: "newsletter_mail" | "thanks_mail" | "satisfaction_mail",
  payload: Record<string, any>
) => {
  try {
    await fetch("/api/fideliser/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, payload }),
    });
  } finally {
    // Refresh even if the call fails, to keep UI in sync
    await refreshMetrics();
  }
};

useEffect(() => {
  refreshMetrics();
}, []);

	const data = useMemo(() => {
    const newsletter = metrics?.newsletter_mail ?? {};
    const thanks = metrics?.thanks_mail ?? {};
    const satisfaction = metrics?.satisfaction_mail ?? {};

    const n = (v: any) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

    const newsletterMonth = n(newsletter.month);
    const thanksMonth = n(thanks.month);
    const satisfactionMonth = n(satisfaction.month);

    const statusFromMonth = (m: number) =>
      m >= 3
        ? { label: "Souvent utilisé", color: "green" as const }
        : { label: "Peu utilisé", color: "orange" as const };

    return {
      actions: [
        {
          key: "inform" as const,
          title: "Informer",
          desc: "Newsletter, actus, nouveautés. Choisissez vos contacts CRM et envoyez.",
          accent: "cyan" as const,
          cta: "Envoyer",
          status: statusFromMonth(newsletterMonth),
        },
        {
          key: "thanks" as const,
          title: "Remercier",
          desc: "Un mail simple après intervention. Sélectionnez des contacts CRM. Lancez.",
          accent: "purple" as const,
          cta: "Envoyer",
          status: statusFromMonth(thanksMonth),
        },
        {
          key: "satisfaction" as const,
          title: "Satisfaction",
          desc: "Enquête de satisfaction ou demande d’avis. Envoyez aux bons clients.",
          accent: "pink" as const,
          cta: "Envoyer",
          status: statusFromMonth(satisfactionMonth),
        },
      ],
      metrics: [
        {
          title: "Newsletters",
          month: newsletterMonth,
          week: n(newsletter.week),
          channels: [
            { name: "Envoyés", value: n(newsletter.sent) },
            { name: "Ouverts", value: n(newsletter.opened) },
            { name: "Cliqués", value: n(newsletter.clicked) },
            { name: "Désinscriptions", value: n(newsletter.unsub) },
          ],
        },
        {
          title: "Mails Remerciement",
          month: thanksMonth,
          week: n(thanks.week),
          channels: [
            { name: "Envoyés", value: n(thanks.sent) },
            { name: "Ouverts", value: n(thanks.opened) },
            { name: "Cliqués", value: n(thanks.clicked) },
            { name: "Réponses", value: n(thanks.replies) },
          ],
        },
        {
          title: "Satisfaction",
          month: satisfactionMonth,
          week: n(satisfaction.week),
          channels: [
            { name: "Envoyés", value: n(satisfaction.sent) },
            { name: "Ouverts", value: n(satisfaction.opened) },
            { name: "Avis reçus", value: n(satisfaction.reviews) },
            { name: "Scores", value: n(satisfaction.scores) },
          ],
        },
      ],
      tips: [
        {
          title: "Informer",
          lines: [
            { left: "1 newsletter / mois", right: "Top rappel" },
            { left: "Sujet clair", right: "Plus d’ouvertures" },
            { left: "1 CTA max", right: "Plus de clics" },
          ],
        },
        {
          title: "Remercier",
          lines: [
            { left: "Envoyer à J+1", right: "Meilleur timing" },
            { left: "Message court", right: "Taux de lecture" },
            { left: "Proposer le prochain pas", right: "Récurrence" },
          ],
        },
        {
          title: "Satisfaction",
          lines: [
            { left: "Enquête 3 questions", right: "Plus de réponses" },
            { left: "Demande d’avis ciblée", right: "Plus d’avis" },
            { left: "1 relance", right: "x1.4" },
          ],
        },
      ],
	    };
  }, [metrics]);


  return (
    <main className={styles.page}>
      {/* BLUR du Booster quand une modale est ouverte */}
      <div
        style={{
          filter: active ? "blur(10px)" : "none",
          opacity: active ? 0.55 : 1,
          transition: "filter 180ms ease, opacity 180ms ease",
          pointerEvents: active ? "none" : "auto",
        }}
        aria-hidden={active ? true : undefined}
      >
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <header className={b.headerRow}>
            <div className={b.titleLine}>
              <span aria-hidden style={{ fontSize: 28 }}>
                🚀
              </span>
              <div className={styles.title}>Fidéliser</div>
            </div>

            <div className={b.tagline}>
              Faites revenir vos clients. <strong>3 actions</strong>, maintenant.
            </div>

            <div className={b.closeWrap}>
              <Link href="/dashboard" className={styles.ghostBtn}>
                Fermer
              </Link>
            </div>
          </header>

<div className={b.desktopOnly}>
  {/* Triangles (non cliquables) */}
  <section className={b.triRow} aria-hidden>
    <div className={[b.triItem, b.triCyan].join(" ")}>
      <div className={b.triLabel}>INFORMER</div>
    </div>
    <div className={[b.triItem, b.triPurple].join(" ")}>
      <div className={b.triLabel}>REMERCIER</div>
    </div>
    <div className={[b.triItem, b.triPink].join(" ")}>
      <div className={b.triLabel}>SATISFACTION</div>
    </div>
  </section>

  <section className={b.grid3}>
    {data.actions.map((a) => (
      <ActionCard
        key={a.key}
        styles={styles}
        accent={a.accent}
        title={a.title}
        desc={a.desc}
        cta={a.cta}
        status={a.status}
        onClick={() => setActive(a.key)}
      />
    ))}
  </section>

  <section className={b.grid3} style={{ marginTop: 12 }}>
    {data.metrics.map((m) => (
      <MetricCard
        key={m.title}
        styles={styles}
        title={m.title}
        month={m.month}
        week={m.week}
        channels={m.channels}
      />
    ))}
  </section>

  <section className={b.grid3} style={{ marginTop: 12 }}>
    {data.tips.map((t) => (
      <TipCard key={t.title} styles={styles} title={t.title} lines={t.lines} />
    ))}
  </section>
</div>

{/* Mobile: empiler Action -> Stats -> Conseils (accordéons fermés par défaut) */}
<section className={b.mobileOnly}>
  {data.actions.map((a, idx) => {
    const m = data.metrics[idx];
    const tip = data.tips[idx];
    return (
      <div key={a.key} className={b.mobileGroup}>
        <ActionCard
          styles={styles}
          accent={a.accent}
          title={a.title}
          desc={a.desc}
          cta={a.cta}
          status={a.status}
          onClick={() => setActive(a.key)}
        />

        <details className={b.accordion}>
          <summary className={b.accordionSummary}>
            <span>📊 Stats</span>
            <span className={b.chev}>▾</span>
          </summary>
          <div className={b.accordionBody}>
            <MetricCard
              styles={styles}
              title={m.title}
              month={m.month}
              week={m.week}
              channels={m.channels}
            />
          </div>
        </details>

        <details className={b.accordion}>
          <summary className={b.accordionSummary}>
            <span>💡 Conseils</span>
            <span className={b.chev}>▾</span>
          </summary>
          <div className={b.accordionBody}>
            <TipCard styles={styles} title={tip.title} lines={tip.lines} />
          </div>
        </details>
      </div>
    );
  })}
</section>
        </div>
      </div>

      {/* Modales plein écran */}
      {active && (
        <BaseModal
          title={
            active === "inform" ? "Informer" : active === "thanks" ? "Remercier" : "Satisfaction"
          }
          onClose={() => setActive(null)}
        >
          {active === "inform" && <InformModal styles={styles} onClose={() => setActive(null)} trackEvent={trackEvent} />}
          {active === "thanks" && <ThanksModal styles={styles} onClose={() => setActive(null)} trackEvent={trackEvent} />}
          {active === "satisfaction" && <SatisfactionModal styles={styles} onClose={() => setActive(null)} trackEvent={trackEvent} />}
        </BaseModal>
      )}
    </main>
  );
}

function ActionCard({
  styles,
  accent,
  title,
  desc,
  cta,
  status,
  onClick,
}: {
  styles: Record<string, string>;
  accent: "cyan" | "purple" | "pink" | "orange";
  title: string;
  desc: string;
  cta: string;
  status: { label: string; color: "green" | "orange" };
  onClick: () => void;
}) {
  const dotClass = status.color === "green" ? "dotGreen" : "dotOrange";

  return (
    <article
      className={[styles.moduleCard, styles[`accent_${accent}`], b.actionCard].join(" ")}
      style={{ cursor: "pointer" }}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
    >
      <div className={styles.moduleGlow} />

      <div className={b.actionHeader}>
        <div className={b.actionHeaderTitle}>{title}</div>
        <div className={b.status} title="Usage">
          <span className={[b.dot, b[dotClass]].join(" ")} aria-hidden />
          <span>{status.label}</span>
        </div>
      </div>

      <div className={b.actionCenter}>
        <div className={[styles.moduleDesc, b.actionDesc].join(" ")}>{desc}</div>
      </div>

      <div className={b.actionBtnWrap}>
        <button
          type="button"
          className={[styles.primaryBtn, b.actionBtn].join(" ")}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          {cta}
        </button>
      </div>
    </article>
  );
}

function MetricCard({
  styles,
  title,
  month,
  week,
  channels,
}: {
  styles: Record<string, string>;
  title: string;
  month: number;
  week: number;
  channels: { name: string; value: number }[];
}) {
  const objectif = Math.max(week, 3) + 2;

  return (
    <div className={[styles.blockCard, b.metricCard].join(" ")}>
      <div className={b.cardTopRow}>
        <div className={styles.blockTitle}>{title}</div>
        <div className={b.pill}>Ce mois</div>
      </div>

      {/* bulle + semaine/objectifs sur la même ligne */}
      <div className={b.metricLine}>
        <div className={b.metricBubble}>{month}</div>

        <div className={b.metricPills}>
          <span className={b.pill}>Semaine: {week}</span>
          <span className={b.pill}>Objectif: {objectif}</span>
        </div>
      </div>

      <div className={b.channelGridCompact}>
        {channels.map((c) => (
          <div key={c.name} className={b.channelItemCompact}>
            <span>{c.name}</span>
            <span className={b.channelCount}>{c.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TipCard({
  styles,
  title,
  lines,
}: {
  styles: Record<string, string>;
  title: string;
  lines: { left: string; right: string }[];
}) {
  return (
    <div className={[styles.blockCard, b.tipCard].join(" ")}>
      <div className={b.cardTopRow}>
        <div>
          <div className={styles.blockTitle}>Conseil</div>
          <div className={styles.subtitle}>{title}</div>
        </div>
        <div className={b.pill}>À faire</div>
      </div>

      <div className={b.tipListCompact}>
        {lines.map((l, idx) => (
          <div key={idx} className={b.tipLineCompact}>
            <span>{l.left}</span>
            <span className={b.tipBadge}>{l.right}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
