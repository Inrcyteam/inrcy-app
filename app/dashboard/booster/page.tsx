"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import styles from "../../dashboard/dashboard.module.css";
import b from "./booster.module.css";
import BaseModal from "./components/BaseModal";
import PublishModal from "./components/PublishModal";
import ReviewModal from "./components/ReviewModal";
import PromoModal from "./components/PromoModal";

type ActiveModal = null | "publish" | "reviews" | "promo";

export default function BoosterPage() {
  const [active, setActive] = useState<ActiveModal>(null);

  const searchParams = useSearchParams();

  // Deep-link support: /dashboard/booster?action=publish|reviews|promo
  useEffect(() => {
    const a = (searchParams?.get("action") || "").toLowerCase();
    if (a === "publish" || a === "reviews" || a === "promo") {
      setActive(a as ActiveModal);
    }
  }, [searchParams]);

  const [metrics, setMetrics] = useState<any>(null);

  const refreshMetrics = async () => {
  try {
    const res = await fetch("/api/booster/metrics?days=30", { cache: "no-store" as any });
    if (!res.ok) return;
    const json = await res.json();
    setMetrics(json);
  } catch {
    // ignore
  }
};

const trackEvent = async (
  type: "publish" | "review_mail" | "promo_mail",
  payload: Record<string, any>
) => {
  try {
    // Publish: on envoie directement vers l'API "publish-now" (création publication + queue + metrics)
    if (type === "publish") {
      await fetch("/api/booster/publish-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/booster/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, payload }),
      });
    }
  } finally {
    // Refresh even if the call fails, to keep UI in sync
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

    const publishMonth = n(publish.month);
    const reviewMonth = n(review.month);
    const promoMonth = n(promo.month);

    const statusFromMonth = (m: number) =>
      m >= 3
        ? { label: "Souvent utilisé", color: "green" as const }
        : { label: "Peu utilisé", color: "orange" as const };

    const publishChannels = publish.channels ?? {};
    const pc = (k: string) => n(publishChannels?.[k]);

    return {
      actions: [
        {
          key: "publish" as const,
          title: "Publier",
          desc: "Publications, contenus, chantiers. Diffusez sur 1 ou plusieurs canaux.",
          accent: "cyan" as const,
          cta: "Publier",
          status: statusFromMonth(publishMonth),
        },
        {
          key: "reviews" as const,
          title: "Récolter",
          desc: "Créez un mail clair. Sélectionnez des contacts CRM. Lancez.",
          accent: "purple" as const,
          cta: "Demander",
          status: statusFromMonth(reviewMonth),
        },
        {
          key: "promo" as const,
          title: "Offrir",
          desc: "Mettez en avant une offre. Choisissez un modèle. Envoyez aux bons contacts.",
          accent: "pink" as const,
          cta: "Envoyer",
          status: statusFromMonth(promoMonth),
        },
      ],
      metrics: [
        {
          title: "Publications",
          month: publishMonth,
          week: n(publish.week),
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
          month: reviewMonth,
          week: n(review.week),
          channels: [
            { name: "Envoyés", value: n(review.sent) },
            { name: "Ouverts", value: n(review.opened) },
            { name: "Cliqués", value: n(review.clicked) },
            { name: "Avis récoltés", value: n(review.reviews) },
          ],
        },
        {
          title: "Mails Promo",
          month: promoMonth,
          week: n(promo.week),
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
          title: "Rythme",
          lines: [
            { left: "1 post / semaine", right: "≈ + visibilité" },
            { left: "Chantiers avant/après", right: "Top confiance" },
            { left: "Photo + 3 lignes", right: "Simple" },
          ],
        },
        {
          title: "Récolter",
          lines: [
            { left: "Envoyer à J+1", right: "Meilleur taux" },
            { left: "10 contacts ciblés", right: "Plus d’avis" },
            { left: "1 relance", right: "x1.4" },
          ],
        },
        {
          title: "Offrir",
          lines: [
            { left: "Offre courte (7 jours)", right: "Décision rapide" },
            { left: "1 CTA clair", right: "Plus de clics" },
            { left: "Segmenter la liste", right: "Pertinent" },
          ],
        },
      ],
    };
  }, [metrics]);


  return (
    <main className={`${styles.page} ${b.page}`}>
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
        <div className={b.container}>
          <header className={b.headerRow}>
            <div className={b.titleLine}>
              <span aria-hidden style={{ fontSize: 28 }}>
                🚀
              </span>
              <div className={styles.title}>Booster</div>
            </div>

            <div className={b.tagline}>
              Faites décoller votre activité. <strong>3 actions</strong>, maintenant.
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
      <div className={b.triLabel}>PUBLIER</div>
    </div>
    <div className={[b.triItem, b.triPurple].join(" ")}>
      <div className={b.triLabel}>RÉCOLTER</div>
    </div>
    <div className={[b.triItem, b.triPink].join(" ")}>
      <div className={b.triLabel}>OFFRIR</div>
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

  <section className={b.grid3} style={{ marginTop: 8 }}>
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

  <section className={b.grid3} style={{ marginTop: 8 }}>
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
            active === "publish" ? "Publier" : active === "reviews" ? "Récolter" : "Offrir"
          }
          moduleLabel="Module Booster"
          onClose={() => setActive(null)}
        >
          {active === "publish" && (
            <PublishModal
              styles={styles}
              onClose={() => setActive(null)}
              trackEvent={trackEvent}
            />
          )}
          {active === "reviews" && <ReviewModal styles={styles} onClose={() => setActive(null)} />}
          {active === "promo" && <PromoModal styles={styles} onClose={() => setActive(null)} />}
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

      <div className={b.actionTop}>
        <div className={b.actionMiniTitle}>{title}</div>
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
