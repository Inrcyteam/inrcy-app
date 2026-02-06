"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./stats.module.css";
import Image from "next/image";

type Overview = {
  days: number;
  totals: {
    users: number;
    sessions: number;
    pageviews: number;
    engagementRate: number;
    avgSessionDuration: number;
    clicks: number;
    impressions: number;
    ctr: number;
  };
  topPages: Array<{ path: string; views: number }>;
  channels: Array<{ channel: string; sessions: number }>;
  topQueries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>;
  sources: {
    site_inrcy: { connected: { ga4: boolean; gsc: boolean } };
    site_web: { connected: { ga4: boolean; gsc: boolean } };
    gmb: { connected: boolean; metrics: any | null };
    facebook: { connected: boolean };
  };
};

type CubeKey = "site_inrcy" | "site_web" | "gmb" | "facebook";

type Period = 7 | 14 | 30 | 60;

type ActionKey =
  | "booster_publier"
  | "booster_avis"
  | "booster_promotion"
  | "fideliser_informer"
  | "fideliser_satisfaction"
  | "fideliser_remercier"
  | "connect";


type ActionEffort = {
  level: "faible" | "moyen" | "eleve";
  label: string;
};

type CubeModel = {
  key: CubeKey;
  title: string;
  subtitle: string;
  period: Period;
  loading: boolean;
  error?: string;
  connections: {
    ga4?: boolean;
    gsc?: boolean;
    main?: boolean; // for gmb/facebook
  };
  provenance: Array<{ label: string; value: number; colorVar: string }>;
  opportunity30: number; // projected opportunities for 30 days
  opportunityLabel: string;
  qualityScore: number;
  qualityLabel: string;
  qualityTone: "low" | "ok" | "solid" | "excellent";
  insights: string[];
  action: {
    key: ActionKey;
    title: string;
    detail: string;
    href: string;
    pill: "Booster" | "Fidéliser" | "Connexion";
    effort?: ActionEffort;
  };
};

const PERIODS: Period[] = [7, 14, 30, 60];

function fmtInt(n: number) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(Number.isFinite(n) ? n : 0));
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeNum(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeRange(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return 0;
  if (max <= min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}

// --- Business signals (web) ---

const INTENT_PATTERNS: RegExp[] = [
  /\bdevis\b/i,
  /\bprix\b/i,
  /\btarif\b/i,
  /\burgen/i,
  /\b24\/?24\b/i,
  /\bcontact\b/i,
  /\brdv\b/i,
  /\brendez[- ]?vous\b/i,
  /\bprès de moi\b/i,
  /\bpres de moi\b/i,
  /\bnear me\b/i,
];

function isIntentQuery(q: string) {
  return INTENT_PATTERNS.some((re) => re.test(q));
}

function pageKind(path: string): "contact" | "pricing" | "service" | "other" {
  const p = (path || "").toLowerCase();
  if (/(contact|devis|rdv|rendez|reservation|telephone|t[ée]l[ée]phone)/.test(p)) return "contact";
  if (/(tarif|prix|pricing)/.test(p)) return "pricing";
  if (/(service|services|prestation|prestations|depannage|intervention|urgence)/.test(p)) return "service";
  return "other";
}

function mapChannelBucket(ch: string): "google" | "direct" | "social" | "other" {
  const c = (ch || "").toLowerCase();
  if (c.includes("organic search") || c.includes("paid search") || c.includes("cross-network") || c.includes("google")) {
    return "google";
  }
  if (c.includes("direct")) return "direct";
  if (c.includes("social")) return "social";
  return "other";
}

function engagementScore100(t: Overview["totals"]) {
  // Stable, explainable score.
  const engagementRate = safeNum(t.engagementRate, 0);
  const sessions = Math.max(0, safeNum(t.sessions, 0));
  const pageviews = Math.max(0, safeNum(t.pageviews, 0));
  const pps = sessions > 0 ? pageviews / sessions : 0;
  const duration = safeNum(t.avgSessionDuration, 0);

  const s1 = normalizeRange(engagementRate, 0.20, 0.78);
  const s2 = normalizeRange(pps, 1.1, 4.0);
  const s3 = normalizeRange(duration, 35, 210);

  const raw = (s1 * 0.5 + s2 * 0.3 + s3 * 0.2) * 100;
  return Math.max(15, Math.min(95, Math.round(raw)));
}

function qualityLabel(score: number) {
  if (score >= 80) return { label: "Excellent", tone: "excellent" as const };
  if (score >= 65) return { label: "Solide", tone: "solid" as const };
  if (score >= 45) return { label: "Correct", tone: "ok" as const };
  return { label: "À améliorer", tone: "low" as const };
}

function computeOpportunityPerDayWeb(ov: Overview) {
  const baseDays = Math.max(1, safeNum(ov.days, 30));
  const t = ov.totals || ({} as any);
  const sessions = safeNum(t.sessions);
  const clicks = safeNum(t.clicks);
  const engagementRate = clamp(safeNum(t.engagementRate, 0.45), 0, 1);
  const avgSessionDurationSec = clamp(safeNum(t.avgSessionDuration, 110), 10, 600);

  const channels = Array.isArray(ov.channels) ? ov.channels : [];
  const direct = channels.find((c) => (c?.channel || "").toLowerCase().includes("direct"));
  const directShare = sessions > 0 ? clamp(safeNum(direct?.sessions) / sessions, 0, 1) : 0;

  const topQueries = Array.isArray(ov.topQueries) ? ov.topQueries : [];
  const intentClicks = topQueries.filter((q) => isIntentQuery(q.query)).reduce((s, q) => s + safeNum(q.clicks), 0);

  const topPages = Array.isArray(ov.topPages) ? ov.topPages : [];
  const contactViews = topPages.filter((p) => pageKind(p.path) === "contact").reduce((s, p) => s + safeNum(p.views), 0);

  const trafficScore = clamp((sessions / baseDays) / 50, 0, 1);
  const intentScore = clamp((intentClicks / baseDays) / 3, 0, 1);
  const durationScore = clamp(avgSessionDurationSec / 180, 0, 1);

  const baseIndex = 0.45 * trafficScore + 0.30 * intentScore + 0.15 * engagementRate + 0.10 * durationScore;

  const rawPerDay =
    ((sessions / baseDays) * 0.08 + (clicks / baseDays) * 0.10 + (intentClicks / baseDays) * 0.32 + (contactViews / baseDays) * 0.05) *
    (0.65 + baseIndex) *
    (0.85 + clamp(directShare / 0.65, 0, 1) * 0.20);

  return clamp(rawPerDay, 0, 999);
}

function computeOpportunity30(cubeKey: CubeKey, ov: Overview) {
  if (cubeKey === "gmb") {
    const m = ov?.sources?.gmb?.metrics;
    // Best-effort: sum interactions over the window and convert to a "potential".
    // If metrics API is not enabled we still provide a conservative number.
    const daily = m?.multiDailyMetricTimeSeries || m?.timeSeries || null;
    // The API response shape may vary; we will just scan numeric fields.
    const flatNums: number[] = [];
    try {
      const asStr = JSON.stringify(m || {});
      // Cheap heuristic: count website clicks / calls / directions if present.
      // We'll parse a few known metric keys if we can find them.
      if (asStr) {
        // no-op: keep conservative.
      }
    } catch {}

    const hasError = !!m?.error;
    const base = hasError ? 1.5 : 3.0;
    // Use impressions if present (we can sometimes read them from the timeSeries).
    const impressionsGuess = safeNum(m?.totals?.BUSINESS_IMPRESSIONS_DESKTOP_MAPS) + safeNum(m?.totals?.BUSINESS_IMPRESSIONS_MOBILE_MAPS);
    const interactionsGuess = safeNum(m?.totals?.WEBSITE_CLICKS) + safeNum(m?.totals?.CALL_CLICKS) + safeNum(m?.totals?.DIRECTION_REQUESTS);
    const perDay = clamp(base + impressionsGuess / 800 + interactionsGuess / 30, 0, 50);
    return Math.max(0, Math.round(perDay * 30));
  }
  if (cubeKey === "facebook") {
    // No insights yet: keep neutral. Once Meta metrics are integrated, this will become real.
    return ov?.sources?.facebook?.connected ? 2 : 0;
  }
  // web sites
  const perDay = computeOpportunityPerDayWeb(ov);
  return Math.max(0, Math.round(perDay * 30));
}

function buildProvenance(cubeKey: CubeKey, ov: Overview) {
  if (cubeKey === "gmb") {
    // Try to extract search vs maps impressions from known keys when available.
    const m = ov?.sources?.gmb?.metrics;
    const maps =
      safeNum(m?.totals?.BUSINESS_IMPRESSIONS_DESKTOP_MAPS) +
      safeNum(m?.totals?.BUSINESS_IMPRESSIONS_MOBILE_MAPS) +
      safeNum(m?.totals?.BUSINESS_IMPRESSIONS_DESKTOP_MAPS?.value) +
      safeNum(m?.totals?.BUSINESS_IMPRESSIONS_MOBILE_MAPS?.value);
    const search =
      safeNum(m?.totals?.BUSINESS_IMPRESSIONS_DESKTOP_SEARCH) +
      safeNum(m?.totals?.BUSINESS_IMPRESSIONS_MOBILE_SEARCH) +
      safeNum(m?.totals?.BUSINESS_IMPRESSIONS_DESKTOP_SEARCH?.value) +
      safeNum(m?.totals?.BUSINESS_IMPRESSIONS_MOBILE_SEARCH?.value);
    const total = maps + search;
    return [
      { label: "Maps", value: total > 0 ? maps : 1, colorVar: "--cGoogle" },
      { label: "Search", value: total > 0 ? search : 1, colorVar: "--cDirect" },
    ];
  }

  if (cubeKey === "facebook") {
    // Placeholder until we fetch Meta Insights.
    return [
      { label: "Audience", value: 1, colorVar: "--cSocial" },
      { label: "Interactions", value: 1, colorVar: "--cGoogle" },
    ];
  }

  const buckets = { google: 0, direct: 0, social: 0, other: 0 };
  for (const c of Array.isArray(ov.channels) ? ov.channels : []) {
    const b = mapChannelBucket(c.channel);
    buckets[b] += safeNum(c.sessions);
  }
  return [
    { label: "Google", value: buckets.google, colorVar: "--cGoogle" },
    { label: "Direct", value: buckets.direct, colorVar: "--cDirect" },
    { label: "Social", value: buckets.social, colorVar: "--cSocial" },
    { label: "Autres", value: buckets.other, colorVar: "--cOther" },
  ];
}

function computeQuality(cubeKey: CubeKey, ov: Overview) {
  if (cubeKey === "gmb") {
    const connected = !!ov?.sources?.gmb?.connected;
    if (!connected) return { score: 0, ...qualityLabel(0) };

    const m = ov?.sources?.gmb?.metrics;
    if (m?.error) return { score: 55, ...qualityLabel(55) };
    // Without a reliable time series parser, keep it "correct" by default.
    return { score: 70, ...qualityLabel(70) };
  }

  if (cubeKey === "facebook") {
    const connected = !!ov?.sources?.facebook?.connected;
    if (!connected) return { score: 0, ...qualityLabel(0) };
    return { score: 60, ...qualityLabel(60) };
  }

  // websites: quality = engagement + structure + intent
  const t = ov.totals || ({} as any);
  const engagement = engagementScore100(t);
  const pages = Array.isArray(ov.topPages) ? ov.topPages : [];
  const queries = Array.isArray(ov.topQueries) ? ov.topQueries : [];

  const hasContact = pages.some((p) => pageKind(p.path) === "contact");
  const hasService = pages.some((p) => pageKind(p.path) === "service");
  const hasPricing = pages.some((p) => pageKind(p.path) === "pricing");

  const intentClicks = queries.filter((q) => isIntentQuery(q.query)).reduce((s, q) => s + safeNum(q.clicks), 0);
  const totalClicks = queries.reduce((s, q) => s + safeNum(q.clicks), 0);
  const intentShare = totalClicks > 0 ? clamp(intentClicks / totalClicks, 0, 1) : 0;

  let score = engagement;
  score += hasContact ? 8 : -6;
  score += hasService ? 6 : -4;
  score += hasPricing ? 4 : 0;
  score += Math.round(intentShare * 10);

  // Natural iNrCy advantage: structure + coherence (not performance).
  if (cubeKey === "site_inrcy") score += 10;

  score = clamp(score, 15, 95);
  return { score, ...qualityLabel(score) };
}

function recommendAction(cubeKey: CubeKey, ov: Overview, qualityScore: number): CubeModel["action"] {
  const returnTo = encodeURIComponent("/dashboard/stats");

  // Connection states
  if (cubeKey === "site_inrcy") {
    const c = ov?.sources?.site_inrcy?.connected;
    if (!c?.ga4) {
      return {
        key: "connect",
        title: "Connecter GA4",
        detail: "Pour analyser vos visiteurs et leur comportement.",
        href: `/api/integrations/google-stats/start?source=site_inrcy&product=ga4&returnTo=${returnTo}`,
        pill: "Connexion",
      };
    }
    if (!c?.gsc) {
      return {
        key: "connect",
        title: "Connecter Google Search Console",
        detail: "Pour lire les intentions de recherche (mots-clés).",
        href: `/api/integrations/google-stats/start?source=site_inrcy&product=gsc&returnTo=${returnTo}`,
        pill: "Connexion",
      };
    }
  }

  if (cubeKey === "site_web") {
    const c = ov?.sources?.site_web?.connected;
    if (!c?.ga4) {
      return {
        key: "connect",
        title: "Connecter GA4",
        detail: "Pour analyser vos visiteurs et leur comportement.",
        href: `/api/integrations/google-stats/start?source=site_web&product=ga4&returnTo=${returnTo}`,
        pill: "Connexion",
      };
    }
    if (!c?.gsc) {
      return {
        key: "connect",
        title: "Connecter Google Search Console",
        detail: "Pour lire les intentions de recherche (mots-clés).",
        href: `/api/integrations/google-stats/start?source=site_web&product=gsc&returnTo=${returnTo}`,
        pill: "Connexion",
      };
    }
  }

  if (cubeKey === "gmb") {
    if (!ov?.sources?.gmb?.connected) {
      return {
        key: "connect",
        title: "Connecter Google Business",
        detail: "Pour capter les demandes locales (appels, itinéraires, clics site).",
        href: `/api/integrations/google-business/start?returnTo=${returnTo}`,
        pill: "Connexion",
      };
    }
  }

  if (cubeKey === "facebook") {
    if (!ov?.sources?.facebook?.connected) {
      return {
        key: "connect",
        title: "Connecter Facebook",
        detail: "Pour activer la visibilité sociale et la communauté.",
        href: `/api/integrations/facebook/start?returnTo=${returnTo}`,
        pill: "Connexion",
      };
    }
  }

  const effortMap: Record<ActionKey, CubeModel["action"]["effort"] | undefined> = {
    booster_publier: { level: "faible", label: "Effort faible • 5 min" },
    booster_avis: { level: "moyen", label: "Effort moyen • 10 min" },
    booster_promotion: { level: "moyen", label: "Effort moyen • 15 min" },
    fideliser_informer: { level: "moyen", label: "Effort moyen • 15 min" },
    fideliser_satisfaction: { level: "faible", label: "Effort faible • 3 min" },
    fideliser_remercier: { level: "faible", label: "Effort faible • 2 min" },
    connect: undefined,
  };

  const attachEffort = (a: CubeModel["action"]): CubeModel["action"] => {
    if (a.key === "connect") return a;
    return { ...a, effort: effortMap[a.key] };
  };

  // Business-based rules (Booster/Fidéliser)
  const opp30 = computeOpportunity30(cubeKey, ov);

  if (cubeKey === "site_inrcy") {
    // iNrCy: default to fidéliser when quality is good.
    if (qualityScore >= 70) {
      return attachEffort({
        key: "fideliser_remercier",
        title: "Remercier",
        detail: "Convertissez vos clients satisfaits en recommandations et avis.",
        href: "/dashboard/fideliser?action=thanks",
        pill: "Fidéliser",
      });
    }
    // If quality is lower, we boost basics.
    return attachEffort({
      key: "booster_promotion",
      title: "Promotion",
      detail: "Mettez en avant une offre / un message clair pour déclencher le contact.",
      href: "/dashboard/booster?action=promo",
      pill: "Booster",
    });
  }

  if (cubeKey === "site_web") {
    // Site pro : booster d'abord.
    if (qualityScore < 60) {
      return attachEffort({
        key: "booster_promotion",
        title: "Promotion",
        detail: "Ajoutez/optimisez un déclencheur (devis, urgence, appel à l’action).",
        href: "/dashboard/booster?action=promo",
        pill: "Booster",
      });
    }
    // If the site is already solid, fidéliser.
    if (qualityScore >= 75 && opp30 > 4) {
      return attachEffort({
        key: "fideliser_informer",
        title: "Informer",
        detail: "Créez un lien régulier (conseils, prévention, actu).",
        href: "/dashboard/fideliser?action=inform",
        pill: "Fidéliser",
      });
    }
    return attachEffort({
      key: "booster_publier",
      title: "Publier",
      detail: "Ajoutez une actualité locale pour relancer la visibilité et le trafic.",
      href: "/dashboard/booster?action=publish",
      pill: "Booster",
    });
  }

  if (cubeKey === "gmb") {
    const m = ov?.sources?.gmb?.metrics;
    const hasError = !!m?.error;
    if (hasError) {
      return attachEffort({
        key: "booster_publier",
        title: "Publier",
        detail: "Publiez 1 post Google Business pour activer le canal (même sans métriques détaillées).",
        href: "/dashboard/booster?action=publish",
        pill: "Booster",
      });
    }
    return attachEffort({
      key: "booster_avis",
      title: "Avis",
      detail: "Les avis sont le levier n°1 pour gagner des appels locaux.",
      href: "/dashboard/booster?action=reviews",
      pill: "Booster",
    });
  }

  // facebook
  return attachEffort({
    key: "booster_publier",
    title: "Publier",
    detail: "1 publication simple/semaine suffit pour rester visible auprès de votre audience.",
    href: "/dashboard/booster?action=publish",
    pill: "Booster",
  });
}

function buildInsights(cubeKey: CubeKey, ov: Overview, qualityScore: number) {
  const insights: string[] = [];

  if (cubeKey === "facebook") {
    if (!ov?.sources?.facebook?.connected) {
      return ["Canal non connecté : aucune lecture possible.", "Connectez Facebook pour activer la visibilité sociale."];
    }
    return ["Canal social prêt à être activé.", "Misez sur la régularité plutôt que sur le volume."];
  }

  if (cubeKey === "gmb") {
    if (!ov?.sources?.gmb?.connected) {
      return ["Canal local non connecté.", "Google Business est souvent le meilleur levier d’appels locaux."];
    }
    if (ov?.sources?.gmb?.metrics?.error) {
      return ["Connexion OK, métriques détaillées indisponibles.", "On peut quand même agir : posts + avis."];
    }
    return ["Présence locale active.", "Les avis + des posts réguliers maximisent les demandes."];
  }

  // websites
  const t = ov.totals || ({} as any);
  const sessions = safeNum(t.sessions);
  const engagement = safeNum(t.engagementRate, 0);
  const queries = Array.isArray(ov.topQueries) ? ov.topQueries : [];
  const intentClicks = queries.filter((q) => isIntentQuery(q.query)).reduce((s, q) => s + safeNum(q.clicks), 0);
  const anyIntent = intentClicks > 0;

  if (sessions <= 20) insights.push("Trafic faible sur la période : opportunité d’activation rapide.");
  else insights.push("Trafic présent : on peut optimiser la conversion.");

  if (anyIntent) insights.push("Des recherches à intention business existent (devis, urgence, prix…).");
  else insights.push("Peu d’intention business détectée : il faut clarifier l’offre et la zone.");

  if (qualityScore >= 75) insights.push("Structure solide : vous êtes prêt à capter des demandes.");
  else if (qualityScore >= 55) insights.push("Structure correcte : quelques ajustements peuvent booster les demandes.");
  else insights.push("Structure à renforcer : il manque des déclencheurs de contact.");

  // Keep it short (2–3 max)
  return insights.slice(0, 3);
}

function Donut({ segments }: { segments: Array<{ label: string; value: number; colorVar: string }> }) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const bg = useMemo(() => {
    if (total <= 0) return "conic-gradient(rgba(255,255,255,.10) 0deg 360deg)";
    let cur = 0;
    const parts = segments
      .filter((s) => s.value > 0)
      .map((s) => {
        const a0 = (cur / total) * 360;
        cur += s.value;
        const a1 = (cur / total) * 360;
        return `var(${s.colorVar}) ${a0.toFixed(2)}deg ${a1.toFixed(2)}deg`;
      });
    return `conic-gradient(${parts.join(", ")})`;
  }, [segments, total]);

  return (
    <div className={styles.donutWrap}>
      <div className={styles.donut} style={{ background: bg }} aria-hidden>
        <div className={styles.donutHole} />
      </div>
      <div className={styles.legend}>
        {segments.map((s) => {
          const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
          return (
            <div key={s.label} className={styles.legendRow}>
              <span className={styles.legendDot} style={{ background: `var(${s.colorVar})` }} aria-hidden />
              <span className={styles.legendLabel}>{s.label}</span>
              <span className={styles.legendVal}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RingScore({ value, tone }: { value: number; tone: "low" | "ok" | "solid" | "excellent" }) {
  const deg = Math.round(clamp(value / 100, 0, 1) * 360);
  return (
    <div className={`${styles.ring} ${styles[`ring_${tone}`]}`} style={{ ["--deg" as any]: `${deg}deg` }}>
      <div className={styles.ringInner}>
        <div className={styles.ringValue}>{value}</div>
        <div className={styles.ringSub}>/100</div>
      </div>
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`${styles.pill} ${ok ? styles.pillOn : styles.pillOff}`}>{label}</span>;
}

function PeriodSelect({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <select className={styles.period} value={value} onChange={(e) => onChange(Number(e.target.value) as Period)}>
      {PERIODS.map((p) => (
        <option key={p} value={p}>
          {p} j
        </option>
      ))}
    </select>
  );
}

export default function StatsClient() {
  const router = useRouter();

  const inrcyRef = useRef<HTMLDivElement | null>(null);
  const webRef = useRef<HTMLDivElement | null>(null);
  const gmbRef = useRef<HTMLDivElement | null>(null);
  const fbRef = useRef<HTMLDivElement | null>(null);

  const scrollTo = (key: "site_inrcy" | "site_web" | "gmb" | "facebook") => {
    const map = {
      site_inrcy: inrcyRef,
      site_web: webRef,
      gmb: gmbRef,
      facebook: fbRef,
    } as const;

    map[key].current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const [periodByCube, setPeriodByCube] = useState<Record<CubeKey, Period>>({
    site_inrcy: 30,
    site_web: 30,
    gmb: 30,
    facebook: 30,
  });

  const [dataByCube, setDataByCube] = useState<Record<CubeKey, { ov: Overview | null; loading: boolean; error?: string }>>({
    site_inrcy: { ov: null, loading: true },
    site_web: { ov: null, loading: true },
    gmb: { ov: null, loading: true },
    facebook: { ov: null, loading: true },
  });

  const fetchCube = async (key: CubeKey, period: Period) => {
    const include =
      key === "site_inrcy"
        ? "site_inrcy_ga4,site_inrcy_gsc"
        : key === "site_web"
          ? "site_web_ga4,site_web_gsc"
          : key === "gmb"
            ? "gmb"
            : "facebook";
    const r = await fetch(`/api/stats/overview?days=${period}&include=${encodeURIComponent(include)}`, { cache: "no-store" });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`fetch_failed:${r.status}:${txt.slice(0, 160)}`);
    }
    return (await r.json()) as Overview;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const keys: CubeKey[] = ["site_inrcy", "site_web", "gmb", "facebook"];
      // Set loading state
      setDataByCube((prev) => {
        const next: any = { ...prev };
        for (const k of keys) next[k] = { ...next[k], loading: true, error: undefined };
        return next;
      });

      try {
        const res = await Promise.all(
          keys.map(async (k) => {
            const ov = await fetchCube(k, periodByCube[k]);
            return [k, ov] as const;
          })
        );
        if (cancelled) return;
        setDataByCube((prev) => {
          const next: any = { ...prev };
          for (const [k, ov] of res) next[k] = { ov, loading: false };
          return next;
        });
      } catch (e: any) {
        if (cancelled) return;
        const msg = e?.message || "Erreur inconnue";
        setDataByCube((prev) => {
          const next: any = { ...prev };
          // Mark all cubes with the error only if they have no data yet.
          for (const k of ["site_inrcy", "site_web", "gmb", "facebook"] as CubeKey[]) {
            next[k] = { ...next[k], loading: false, error: next[k]?.ov ? undefined : msg };
          }
          return next;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [periodByCube.site_inrcy, periodByCube.site_web, periodByCube.gmb, periodByCube.facebook]);

  const models: CubeModel[] = useMemo(() => {
    const build = (key: CubeKey, title: string, subtitle: string): CubeModel => {
      const period = periodByCube[key];
      const state = dataByCube[key];
      const ov = state.ov ||
        ({
          days: period,
          totals: { users: 0, sessions: 0, pageviews: 0, engagementRate: 0, avgSessionDuration: 0, clicks: 0, impressions: 0, ctr: 0 },
          topPages: [],
          channels: [],
          topQueries: [],
          sources: {
            site_inrcy: { connected: { ga4: false, gsc: false } },
            site_web: { connected: { ga4: false, gsc: false } },
            gmb: { connected: false, metrics: null },
            facebook: { connected: false },
          },
        } as Overview);

      const connections =
        key === "site_inrcy"
          ? { ga4: !!ov.sources?.site_inrcy?.connected?.ga4, gsc: !!ov.sources?.site_inrcy?.connected?.gsc }
          : key === "site_web"
            ? { ga4: !!ov.sources?.site_web?.connected?.ga4, gsc: !!ov.sources?.site_web?.connected?.gsc }
            : key === "gmb"
              ? { main: !!ov.sources?.gmb?.connected }
              : { main: !!ov.sources?.facebook?.connected };

      const provenance = buildProvenance(key, ov);
      const opp30 = computeOpportunity30(key, ov);

      const q = computeQuality(key, ov);
      const insights = buildInsights(key, ov, q.score);
      const action = recommendAction(key, ov, q.score);

      const opportunityLabel =
        opp30 >= 14 ? "Fort potentiel" : opp30 >= 7 ? "Potentiel réel" : opp30 >= 3 ? "Potentiel modéré" : "À activer";

      return {
        key,
        title,
        subtitle,
        period,
        loading: !!state.loading,
        error: state.error,
        connections,
        provenance,
        opportunity30: opp30,
        opportunityLabel,
        qualityScore: q.score,
        qualityLabel: q.label,
        qualityTone: q.tone,
        insights,
        action,
      };
    };

    return [
      build("site_inrcy", "Site iNrCy", "Votre site iNrCy (optimisé pour convertir)"),
      build("site_web", "Site Web", "Votre site externe / historique"),
      build("gmb", "Google Business", "Visibilité locale (appels, itinéraires, clics site)"),
      build("facebook", "Facebook", "Visibilité sociale / communauté"),
    ];
  }, [dataByCube, periodByCube]);

  const centralPotential30 = useMemo(() => models.reduce((s, m) => s + safeNum(m.opportunity30), 0), [models]);
  const centralByCube = useMemo(() => {
    const by: Record<CubeKey, number> = { site_inrcy: 0, site_web: 0, gmb: 0, facebook: 0 };
    for (const m of models) by[m.key] = safeNum(m.opportunity30);
    return by;
  }, [models]);


  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.brand}>
          <Image
  src="/inrstats-logo.png"
  alt="iNrStats"
  width={154}
  height={64}
  priority
/>
          <div className={styles.brandText}>
            <div className={styles.brandRow}>
                            <span className={styles.tagline}>Vos données analysées en mode business.</span>
            </div>
          </div>
        </div>

        <button className={styles.closeBtn} onClick={() => router.push("/dashboard")}>
          Fermer
        </button>
      </div>

      <div className={styles.grid}>
        {/* Top-left */}
        <div ref={inrcyRef}>
          <Cube
          model={models[0]}
          onChangePeriod={(p) => setPeriodByCube((prev) => ({ ...prev, site_inrcy: p }))}
          onNavigate={(href) => (href.startsWith("/api/") ? (window.location.href = href) : router.push(href))}
        />
        </div>

        {/* Top-right */}
        <div ref={webRef}>
          <Cube
          model={models[1]}
          onChangePeriod={(p) => setPeriodByCube((prev) => ({ ...prev, site_web: p }))}
          onNavigate={(href) => (href.startsWith("/api/") ? (window.location.href = href) : router.push(href))}
        />
        </div>

        {/* Center (desktop only via CSS) */}
        <div className={styles.center}>
          <div className={styles.centerRing}>
            <div className={styles.centerValue}>+{fmtInt(centralPotential30)}</div>
            <div className={styles.centerLabel}>opportunités activables</div>
            <div className={styles.centerSub}>projection sur 30 jours si actions menées</div>

            <div className={styles.centerBreakdown}>
              <button type="button" className={styles.centerLine} onClick={() => scrollTo("site_inrcy")}>
                <span>Site iNrCy</span>
                <b>+{fmtInt(centralByCube.site_inrcy)}</b>
              </button>
              <button type="button" className={styles.centerLine} onClick={() => scrollTo("site_web")}>
                <span>Site Web</span>
                <b>+{fmtInt(centralByCube.site_web)}</b>
              </button>
              <button type="button" className={styles.centerLine} onClick={() => scrollTo("gmb")}>
                <span>Google Business</span>
                <b>+{fmtInt(centralByCube.gmb)}</b>
              </button>
              <button type="button" className={styles.centerLine} onClick={() => scrollTo("facebook")}>
                <span>Facebook</span>
                <b>+{fmtInt(centralByCube.facebook)}</b>
              </button>
            </div>
          </div>
        </div>

        {/* Bottom-left */}
        <div ref={gmbRef}>
          <Cube
          model={models[2]}
          onChangePeriod={(p) => setPeriodByCube((prev) => ({ ...prev, gmb: p }))}
          onNavigate={(href) => (href.startsWith("/api/") ? (window.location.href = href) : router.push(href))}
        />
        </div>

        {/* Bottom-right */}
        <div ref={fbRef}>
          <Cube
          model={models[3]}
          onChangePeriod={(p) => setPeriodByCube((prev) => ({ ...prev, facebook: p }))}
          onNavigate={(href) => (href.startsWith("/api/") ? (window.location.href = href) : router.push(href))}
        />
        </div>
      </div>
    </div>
  );
}

function Cube({
  model,
  onChangePeriod,
  onNavigate,
}: {
  model: CubeModel;
  onChangePeriod: (p: Period) => void;
  onNavigate: (href: string) => void;
}) {
  const isSite = model.key === "site_inrcy" || model.key === "site_web";

  const connectionOk = isSite
    ? !!model.connections.ga4 || !!model.connections.gsc
    : !!model.connections.main;

  return (
    <section className={`${styles.cube} ${connectionOk ? "" : styles.cubeOff}`}
      aria-label={model.title}
    >
      <div className={styles.cubeTop}>
        <div>
          <div className={styles.cubeTitleRow}>
            <h2 className={styles.cubeTitle}>{model.title}</h2>
            {model.loading ? <span className={styles.spinner} aria-hidden /> : null}
          </div>
          <div className={styles.cubeSub}>{model.subtitle}</div>
        </div>

        <div className={styles.cubeMeta}>
          <PeriodSelect value={model.period} onChange={onChangePeriod} />
          <div className={styles.pills}>
            {isSite ? (
              <>
                <StatusPill ok={!!model.connections.ga4} label="GA4" />
                <StatusPill ok={!!model.connections.gsc} label="GSC" />
              </>
            ) : (
              <StatusPill ok={!!model.connections.main} label={model.key === "gmb" ? "Connecté" : "Connecté"} />
            )}
          </div>
        </div>
      </div>

      {model.error ? <div className={styles.error}>Erreur : {model.error}</div> : null}

      <div className={styles.cubeBody}>
        <div className={styles.block}>
          <div className={styles.blockTitle}>Provenance</div>
          <Donut segments={model.provenance} />
        </div>

        <div className={styles.blockRow}>
          <div className={styles.block}>
            <div className={styles.blockTitle}>Opportunité</div>
            <div className={styles.oppValue}>+{fmtInt(model.opportunity30)}</div>
            <div className={styles.oppSub}>{model.opportunityLabel} (projection 30 j)</div>
          </div>
          <div className={styles.block}>
            <div className={styles.blockTitle}>Qualité</div>
            <div className={styles.qualityRow}>
              <RingScore value={model.qualityScore} tone={model.qualityTone} />
              <div>
                <div className={styles.qualityLabel}>{model.qualityLabel}</div>
                <div className={styles.qualitySub}>Structure & exploitabilité</div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.block}>
          <div className={styles.blockTitle}>Lecture business</div>
          <ul className={styles.bullets}>
            {model.insights.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>

        <div className={styles.action}>
          <div className={styles.actionLeft}>
            <div className={styles.actionTopRow}>
              <span className={`${styles.actionPill} ${styles[`action_${model.action.pill.toLowerCase()}`]}`}>{model.action.pill}</span>

              <div className={styles.actionTopText}>
                {model.action.pill === "Connexion" ? (
                  <span className={styles.actionTitle}>{model.action.title}</span>
                ) : (
                  <>
                    <span className={styles.actionArrow}>→</span>
                    <span className={styles.actionTitle}>{model.action.title}</span>
                  </>
                )}
              </div>

              {model.action.effort ? (
                <span className={`${styles.effort} ${styles[`effort_${model.action.effort.level}`]}`}>{model.action.effort.label}</span>
              ) : null}
            </div>

            <div className={styles.actionDetail}>{model.action.detail}</div>
          </div>

          <button className={styles.actionBtn} onClick={() => onNavigate(model.action.href)}>
            Lancer
          </button>
        </div>
      </div>
    </section>
  );
}
