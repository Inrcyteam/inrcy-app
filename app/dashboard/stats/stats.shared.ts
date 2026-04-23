import { decideAction, type DecisionResult } from "@/lib/decision/decisionEngine";
import { getDefaultSnapshotDate } from "@/lib/stats/snapshotWindow";
import { readAccountCacheValue, removeAccountCacheValue, writeAccountCacheValue } from "@/lib/browserAccountCache";
import { type InrstatsChannelBlock } from "@/lib/inrstats/channelBlocks";

export type Overview = {
  inrcySiteOwnership?: "none" | "sold" | "rented";
  days: number;
  business?: { sectorCategory?: string | null; profession?: string | null };
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
    facebook: { connected: boolean; metrics?: any | null };
    instagram: { connected: boolean; metrics?: any | null };
    linkedin: { connected: boolean; metrics?: any | null };
  };
  identities?: Partial<Record<CubeKey, { label?: string | null; url?: string | null }>>;
  meta?: { generatedAt?: string; snapshotDate?: string | null; live?: boolean };
};

export type CubeKey = "site_inrcy" | "site_web" | "gmb" | "facebook" | "instagram" | "linkedin";

export type Period = 7 | 14 | 30 | 60;

export type StatsBulkResponse = {
  overviews?: Partial<Record<CubeKey, Overview>>;
  opportunities?: {
    total?: number;
    byCube?: Partial<Record<CubeKey, number>>;
  };
  profile?: {
    lead_conversion_rate?: number;
    avg_basket?: number;
  };
  estimatedByCube?: Partial<Record<CubeKey, number>>;
  meta?: { snapshotDate?: string | null; live?: boolean };
};

export type ChannelRefreshResponse = {
  periods?: Partial<Record<string, {
    block?: InrstatsChannelBlock;
    overview?: unknown;
    syncedAt?: number;
    snapshotDate?: string | null;
  }>>;
};

export type BulkFetchResult = {
  overviews: Partial<Record<CubeKey, Overview>>;
  summary: {
    total: number;
    byCube: Record<CubeKey, number>;
  };
  profile: {
    lead_conversion_rate: number;
    avg_basket: number;
  };
  estimatedByCube: Record<CubeKey, number>;
  snapshotDate: string | null;
};

export type ActionKey =
  | "booster_publier"
  | "booster_avis"
  | "booster_promotion"
  | "fideliser_informer"
  | "fideliser_satisfaction"
  | "fideliser_remercier"
  | "connect"
  | "loading";

export type ActionEffort = {
  level: "faible" | "moyen" | "eleve";
  label: string;
};

export type CubeModel = {
  inrcyOwnership?: "none" | "sold" | "rented";
  key: CubeKey;
  title: string;
  subtitle: string;
  accountLabel?: string;
  period: Period;
  loading: boolean;
  error?: string;
  connections: {
    ga4?: boolean;
    gsc?: boolean;
    main?: boolean;
  };
  provenance: Array<{ label: string; value: number; colorVar: string }>;
  opportunity30: number;
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

export const AVAILABLE_PERIODS: Period[] = [7, 14, 30, 60];

export function cubeSessionKey(period: Period) {
  return `inrcy_stats_cube_snapshot_v1:${period}`;
}

export function summarySessionKey(period: Period) {
  return `inrcy_stats_summary_snapshot_v2:${period}`;
}

export function fmtInt(n: number) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(Number.isFinite(n) ? n : 0));
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function safeNum(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function readUiCacheValue(key: string): string | null {
  return readAccountCacheValue(key);
}

export function writeUiCacheValue(key: string, value: string) {
  writeAccountCacheValue(key, value);
}

export function removeUiCacheValue(key: string) {
  removeAccountCacheValue(key);
}

export function expectedUiSnapshotDate() {
  return getDefaultSnapshotDate();
}

export function getStatsLastChannelSyncAt() {
  const raw = readUiCacheValue("inrcy_stats_last_channel_sync_v1");
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : 0;
}

export function getOverviewSnapshotDate(overviews: unknown): string | null {
  if (!overviews || typeof overviews !== "object") return null;
  for (const overview of Object.values(overviews as Record<string, unknown>)) {
    const snapshotDate = typeof (overview as any)?.meta?.snapshotDate === "string"
      ? (overview as any).meta.snapshotDate
      : null;
    if (snapshotDate) return snapshotDate;
  }
  return null;
}

export function parseCachedCubeSnapshot(raw: string | null): { syncedAt: number; overviews: Record<CubeKey, Overview>; snapshotDate: string | null } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as any;
    if (parsed && typeof parsed === "object" && parsed.overviews && typeof parsed.overviews === "object") {
      return {
        syncedAt: safeNum(parsed.syncedAt),
        overviews: parsed.overviews as Record<CubeKey, Overview>,
        snapshotDate: typeof parsed.snapshotDate === "string" ? parsed.snapshotDate : getOverviewSnapshotDate(parsed.overviews),
      };
    }
    if (parsed && typeof parsed === "object") {
      return {
        syncedAt: 0,
        overviews: parsed as Record<CubeKey, Overview>,
        snapshotDate: getOverviewSnapshotDate(parsed),
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function parseCachedSummarySnapshot(raw: string | null): {
  syncedAt: number;
  total?: number;
  byCube?: Partial<Record<CubeKey, number>>;
  profile?: { lead_conversion_rate?: number; avg_basket?: number };
  estimatedByCube?: Partial<Record<CubeKey, number>>;
  snapshotDate?: string | null;
} | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as any;
    if (parsed && typeof parsed === "object") {
      return {
        syncedAt: safeNum(parsed.syncedAt),
        total: parsed.total,
        byCube: parsed.byCube,
        profile: parsed.profile,
        estimatedByCube: parsed.estimatedByCube,
        snapshotDate: typeof parsed.snapshotDate === "string" ? parsed.snapshotDate : null,
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function getLocalPeriodSyncAt(period: Period): number {
  const cubeSync = parseCachedCubeSnapshot(readUiCacheValue(cubeSessionKey(period)))?.syncedAt || 0;
  const summarySync = parseCachedSummarySnapshot(readUiCacheValue(summarySessionKey(period)))?.syncedAt || 0;
  return Math.max(cubeSync, summarySync);
}

export function hasFreshLocalPeriodSnapshot(period: Period) {
  const lastChannelSyncAt = getStatsLastChannelSyncAt();
  const cachedCube = parseCachedCubeSnapshot(readUiCacheValue(cubeSessionKey(period)));
  const cachedSummary = parseCachedSummarySnapshot(readUiCacheValue(summarySessionKey(period)));
  const snapshotDate = expectedUiSnapshotDate();
  return Boolean(
    cachedCube?.overviews &&
    cachedSummary &&
    cachedCube.syncedAt >= lastChannelSyncAt &&
    cachedSummary.syncedAt >= lastChannelSyncAt &&
    cachedCube.snapshotDate === snapshotDate &&
    cachedSummary.snapshotDate === snapshotDate
  );
}

export function emptyCubeState(): Record<CubeKey, { ov: Overview | null; loading: boolean; error?: string }> {
  return {
    site_inrcy: { ov: null, loading: true },
    site_web: { ov: null, loading: true },
    gmb: { ov: null, loading: true },
    facebook: { ov: null, loading: true },
    instagram: { ov: null, loading: true },
    linkedin: { ov: null, loading: true },
  };
}

function gmbMetricSeriesTotal(metrics: any, metricNames: string[]) {
  const rawSeries = Array.isArray(metrics?.raw?.multiDailyMetricTimeSeries)
    ? metrics.raw.multiDailyMetricTimeSeries
    : Array.isArray(metrics?.multiDailyMetricTimeSeries)
      ? metrics.multiDailyMetricTimeSeries
      : [];
  return rawSeries.reduce((sum: number, series: any) => {
    if (!metricNames.includes(String(series?.dailyMetric || ""))) return sum;
    const datedValues = Array.isArray(series?.timeSeries?.datedValues) ? series.timeSeries.datedValues : [];
    return sum + datedValues.reduce((inner: number, dv: any) => inner + safeNum(dv?.value?.value ?? dv?.value), 0);
  }, 0);
}

function getGmbTotals(metrics: any) {
  const totals = metrics?.totals || {};
  const impressions =
    safeNum(totals.impressions) ||
    safeNum(totals.BUSINESS_IMPRESSIONS) ||
    safeNum(totals.BUSINESS_IMPRESSIONS_DESKTOP_MAPS) +
      safeNum(totals.BUSINESS_IMPRESSIONS_MOBILE_MAPS) +
      safeNum(totals.BUSINESS_IMPRESSIONS_DESKTOP_SEARCH) +
      safeNum(totals.BUSINESS_IMPRESSIONS_MOBILE_SEARCH) ||
    gmbMetricSeriesTotal(metrics, [
      "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
      "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
      "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
      "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
    ]);

  const websiteClicks =
    safeNum(totals.websiteClicks) ||
    safeNum(totals.website_clicks) ||
    safeNum(totals.WEBSITE_CLICKS) ||
    gmbMetricSeriesTotal(metrics, ["WEBSITE_CLICKS"]);

  const callClicks =
    safeNum(totals.callClicks) ||
    safeNum(totals.call_clicks) ||
    safeNum(totals.CALL_CLICKS) ||
    gmbMetricSeriesTotal(metrics, ["CALL_CLICKS"]);

  const directionRequests =
    safeNum(totals.directionRequests) ||
    safeNum(totals.direction_requests) ||
    safeNum(totals.DIRECTION_REQUESTS) ||
    gmbMetricSeriesTotal(metrics, ["DIRECTION_REQUESTS", "BUSINESS_DIRECTION_REQUESTS"]);

  const mapsImpressions =
    safeNum(totals.BUSINESS_IMPRESSIONS_DESKTOP_MAPS) +
    safeNum(totals.BUSINESS_IMPRESSIONS_MOBILE_MAPS) ||
    gmbMetricSeriesTotal(metrics, ["BUSINESS_IMPRESSIONS_DESKTOP_MAPS", "BUSINESS_IMPRESSIONS_MOBILE_MAPS"]);

  const searchImpressions =
    safeNum(totals.BUSINESS_IMPRESSIONS_DESKTOP_SEARCH) +
    safeNum(totals.BUSINESS_IMPRESSIONS_MOBILE_SEARCH) ||
    gmbMetricSeriesTotal(metrics, ["BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", "BUSINESS_IMPRESSIONS_MOBILE_SEARCH"]);

  return { impressions, websiteClicks, callClicks, directionRequests, mapsImpressions, searchImpressions };
}

type GscOpportunitySectorConfig = {
  impressionRef: number;
  clickRef: number;
  intentRef: number;
  ctrTarget: number;
  bonusWeight: number;
  directIntentFactor: number;
  visibilityWeight: number;
  trafficWeight: number;
  intentWeight: number;
  ctrWeight: number;
  minImpressionsForCtr: number;
};

const DEFAULT_GSC_OPPORTUNITY_CONFIG: GscOpportunitySectorConfig = {
  impressionRef: 120,
  clickRef: 8,
  intentRef: 3,
  ctrTarget: 0.05,
  bonusWeight: 0.35,
  directIntentFactor: 0.10,
  visibilityWeight: 0.20,
  trafficWeight: 0.20,
  intentWeight: 0.40,
  ctrWeight: 0.20,
  minImpressionsForCtr: 150,
};

const GSC_OPPORTUNITY_CONFIG_BY_SECTOR: Record<string, Partial<GscOpportunitySectorConfig>> = {
  artisan_btp: { impressionRef: 80, clickRef: 5, intentRef: 1.8, ctrTarget: 0.045, bonusWeight: 0.44, directIntentFactor: 0.16 },
  sante: { impressionRef: 90, clickRef: 5, intentRef: 2, ctrTarget: 0.05, bonusWeight: 0.42, directIntentFactor: 0.15 },
  medecine_douce: { impressionRef: 90, clickRef: 5, intentRef: 2, ctrTarget: 0.048, bonusWeight: 0.41, directIntentFactor: 0.15 },
  immobilier: { impressionRef: 85, clickRef: 5, intentRef: 1.8, ctrTarget: 0.045, bonusWeight: 0.45, directIntentFactor: 0.16 },
  services_particuliers: { impressionRef: 85, clickRef: 5, intentRef: 1.8, ctrTarget: 0.045, bonusWeight: 0.43, directIntentFactor: 0.15 },
  transport: { impressionRef: 85, clickRef: 5, intentRef: 1.8, ctrTarget: 0.045, bonusWeight: 0.43, directIntentFactor: 0.15 },
  juridique: { impressionRef: 75, clickRef: 4, intentRef: 1.5, ctrTarget: 0.05, bonusWeight: 0.46, directIntentFactor: 0.17 },
  finance: { impressionRef: 75, clickRef: 4, intentRef: 1.5, ctrTarget: 0.05, bonusWeight: 0.45, directIntentFactor: 0.16 },
  hotel_restaurant: { impressionRef: 140, clickRef: 10, intentRef: 3.5, ctrTarget: 0.04, bonusWeight: 0.32, directIntentFactor: 0.09 },
  commerce_boutique: { impressionRef: 130, clickRef: 9, intentRef: 3.2, ctrTarget: 0.04, bonusWeight: 0.31, directIntentFactor: 0.09 },
  automobile: { impressionRef: 100, clickRef: 6, intentRef: 2.2, ctrTarget: 0.045, bonusWeight: 0.39, directIntentFactor: 0.13 },
  communication: { impressionRef: 160, clickRef: 12, intentRef: 4, ctrTarget: 0.035, bonusWeight: 0.28, directIntentFactor: 0.08 },
  services_entreprises: { impressionRef: 140, clickRef: 10, intentRef: 3.5, ctrTarget: 0.038, bonusWeight: 0.30, directIntentFactor: 0.09 },
  evenementiel: { impressionRef: 130, clickRef: 9, intentRef: 3, ctrTarget: 0.04, bonusWeight: 0.34, directIntentFactor: 0.11 },
  animalier: { impressionRef: 105, clickRef: 6, intentRef: 2.2, ctrTarget: 0.045, bonusWeight: 0.38, directIntentFactor: 0.12 },
  autre: { impressionRef: 110, clickRef: 7, intentRef: 2.6, ctrTarget: 0.045, bonusWeight: 0.35, directIntentFactor: 0.10 },
};

function getGscOpportunityConfig(sectorCategory?: string | null): GscOpportunitySectorConfig {
  const overrides = GSC_OPPORTUNITY_CONFIG_BY_SECTOR[String(sectorCategory || "").trim()] || {};
  return { ...DEFAULT_GSC_OPPORTUNITY_CONFIG, ...overrides };
}

function normalizeRange(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return 0;
  if (max <= min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}

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
  const impressions = safeNum(t.impressions);
  const ctr = clamp(safeNum(t.ctr, 0), 0, 1);
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

  let rawPerDay =
    ((sessions / baseDays) * 0.08 + (clicks / baseDays) * 0.10 + (intentClicks / baseDays) * 0.32 + (contactViews / baseDays) * 0.05) *
    (0.65 + baseIndex) *
    (0.85 + clamp(directShare / 0.65, 0, 1) * 0.20);

  const gscConnected = !!ov?.sources?.site_inrcy?.connected?.gsc || !!ov?.sources?.site_web?.connected?.gsc;
  if (gscConnected && (impressions > 0 || clicks > 0 || intentClicks > 0)) {
    const cfg = getGscOpportunityConfig(ov.business?.sectorCategory);
    const gscImpressionsPerDay = impressions / baseDays;
    const gscClicksPerDay = clicks / baseDays;
    const gscIntentClicksPerDay = intentClicks / baseDays;
    const visibilityN = logNorm(gscImpressionsPerDay, cfg.impressionRef);
    const trafficN = logNorm(gscClicksPerDay, cfg.clickRef);
    const intentN = logNorm(gscIntentClicksPerDay, cfg.intentRef);
    const ctrOppN = impressions >= cfg.minImpressionsForCtr ? clamp((cfg.ctrTarget - ctr) / Math.max(0.01, cfg.ctrTarget), 0, 1) : 0;
    const gscBonusIndex =
      cfg.visibilityWeight * visibilityN +
      cfg.trafficWeight * trafficN +
      cfg.intentWeight * intentN +
      cfg.ctrWeight * ctrOppN;
    const gscBasePerDay = 0.10 * visibilityN + 0.12 * trafficN + 0.22 * intentN + 0.08 * ctrOppN;
    rawPerDay = (rawPerDay + gscBasePerDay + gscIntentClicksPerDay * cfg.directIntentFactor) * (1 + gscBonusIndex * cfg.bonusWeight);
  }

  return clamp(rawPerDay, 0, 999);
}

function safeObj(v: any): Record<string, any> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {};
}

function getTotalMetric(metrics: any, keys: string[]): number {
  const m = safeObj(metrics);
  const totals = safeObj(m.totals);
  for (const k of keys) {
    const n = safeNum((totals as any)[k]);
    if (n) return n;
  }
  return 0;
}

function logNorm(x: number, ref: number) {
  const xx = Math.max(0, x);
  const rr = Math.max(1, ref);
  return clamp(Math.log1p(xx) / Math.log1p(rr), 0, 1);
}

function computeOpportunityPerDaySocial(cubeKey: CubeKey, ov: Overview): number {
  const baseDays = Math.max(1, safeNum(ov.days, 30));
  const node = safeObj((ov as any)?.sources?.[cubeKey]);
  const connected = !!node.connected;
  const m = (node as any).metrics;

  if (!connected) return 0;

  const coldStartBaseline = cubeKey === "instagram" ? 0.18 : cubeKey === "linkedin" ? 0.12 : 0.2;
  if (!m || safeObj(m).error) return coldStartBaseline;

  const impressionsTotal =
    getTotalMetric(m, [
      "impressions",
      "post_impressions",
      "postImpressions",
      "post_impressions_sum",
      "IMPRESSIONS",
      "impressionCount",
      "viewerImpressions",
      "reach",
      "REACH",
    ]) || 0;

  const engagementsTotal =
    getTotalMetric(m, [
      "engagements",
      "post_engagements",
      "postEngagements",
      "ENGAGEMENTS",
      "total_engagements",
      "page_engaged_users",
      "post_engaged_users_sum",
      "reactions",
      "comments",
      "shares",
      "likes",
      "saves",
      "replies",
      "video_views",
      "videoViews",
    ]) || 0;

  const ctaClicksTotal =
    getTotalMetric(m, [
      "cta_clicks",
      "ctaClicks",
      "link_clicks",
      "linkClicks",
      "website_clicks",
      "websiteClicks",
      "page_website_clicks_logged_in_unique",
      "CLICK_COUNT",
      "clickCount",
      "clicks",
      "outbound_clicks",
      "outboundClicks",
    ]) || 0;

  const audienceTotal =
    getTotalMetric(m, [
      "followers",
      "follower_count",
      "followers_count",
      "fan_count",
      "fans",
      "fanCount",
      "audience",
      "subscribers",
    ]) || 0;

  const impressionsPerDay = impressionsTotal / baseDays;
  const engagementsPerDay = engagementsTotal / baseDays;
  const ctaClicksPerDay = ctaClicksTotal / baseDays;

  const refs =
    cubeKey === "instagram"
      ? { imp: 2500, eng: 120, cta: 6, aud: 3000 }
      : cubeKey === "linkedin"
        ? { imp: 1200, eng: 45, cta: 3, aud: 2000 }
        : { imp: 3000, eng: 90, cta: 5, aud: 5000 };

  const exposureN = logNorm(impressionsPerDay, refs.imp);
  const engagementN = logNorm(engagementsPerDay, refs.eng);
  const intentN = logNorm(ctaClicksPerDay, refs.cta);
  const audienceN = logNorm(audienceTotal, refs.aud);

  const currentPerDay = clamp(0.02 + 0.2 * intentN + 0.12 * engagementN + 0.06 * exposureN + 0.04 * audienceN, 0, 1.6);
  const uplift = clamp(0.35 + 0.35 * (1 - intentN) + 0.2 * (1 - exposureN), 0.35, 0.9);
  const histWeight = clamp(exposureN * 0.7 + intentN * 0.3, 0, 1);
  const base = histWeight * currentPerDay + (1 - histWeight) * coldStartBaseline;
  const potentialPerDay = clamp(base * (1 + uplift), coldStartBaseline, 2.5);
  const additionalPerDay = Math.max(0, potentialPerDay - currentPerDay);
  return clamp(additionalPerDay, 0, 2.5);
}

export function computeOpportunity30(cubeKey: CubeKey, ov: Overview) {
  if (cubeKey === "gmb") {
    const connected = !!ov?.sources?.gmb?.connected;
    if (!connected) return 0;

    const m = ov?.sources?.gmb?.metrics;
    const hasError = !!m?.error;
    const { impressions, websiteClicks, callClicks, directionRequests } = getGmbTotals(m);
    const conversations =
      safeNum(m?.totals?.conversations) ||
      safeNum(m?.totals?.BUSINESS_CONVERSATIONS);

    const intentOpportunity =
      websiteClicks * 0.45 +
      callClicks * 0.70 +
      directionRequests * 0.55 +
      conversations * 0.65;
    const visibilityOpportunity = impressions / 450;
    const baseline = hasError || !m ? 2 : 0;

    return Math.max(0, Math.round(clamp(baseline + intentOpportunity + visibilityOpportunity, 0, 80)));
  }
  if (cubeKey === "facebook" || cubeKey === "instagram" || cubeKey === "linkedin") {
    const perDay = computeOpportunityPerDaySocial(cubeKey, ov);
    return Math.max(0, Math.round(perDay * 30));
  }
  const perDay = computeOpportunityPerDayWeb(ov);
  return Math.max(0, Math.round(perDay * 30));
}

export function buildProvenance(cubeKey: CubeKey, ov: Overview) {
  if (cubeKey === "gmb") {
    const m = ov?.sources?.gmb?.metrics;
    const { mapsImpressions: maps, searchImpressions: search } = getGmbTotals(m);
    const total = maps + search;
    return [
      { label: "Maps", value: total > 0 ? maps : 1, colorVar: "--cGoogle" },
      { label: "Search", value: total > 0 ? search : 1, colorVar: "--cDirect" },
    ];
  }

  if (cubeKey === "facebook") {
    const m = ov?.sources?.facebook?.metrics;
    const audience =
      safeNum(m?.totals?.post_impressions_sum) ||
      safeNum(m?.totals?.fan_count) ||
      safeNum(m?.totals?.followers_count) ||
      safeNum(m?.totals?.page_views_total);
    const interactions =
      safeNum(m?.totals?.page_engaged_users) +
      safeNum(m?.totals?.post_engaged_users_sum) +
      safeNum(m?.totals?.page_website_clicks_logged_in_unique) +
      safeNum(m?.totals?.page_call_phone_clicks_logged_in_unique) +
      safeNum(m?.totals?.page_get_directions_clicks_logged_in_unique);
    const total = audience + interactions;
    return [
      { label: "Audience", value: total > 0 ? audience : 1, colorVar: "--cSocial" },
      { label: "Interactions", value: total > 0 ? interactions : 1, colorVar: "--cGoogle" },
    ];
  }

  if (cubeKey === "instagram") {
    const m = ov?.sources?.instagram?.metrics;
    const audience =
      safeNum(m?.totals?.reach) +
      safeNum(m?.totals?.profile_views) +
      safeNum(m?.totals?.follower_count);
    const engagement =
      safeNum(m?.totals?.website_clicks) +
      safeNum(m?.totals?.phone_call_clicks) +
      safeNum(m?.totals?.email_contacts) +
      safeNum(m?.totals?.text_message_clicks) +
      safeNum(m?.totals?.get_directions_clicks) +
      safeNum(m?.totals?.get_direction_clicks);
    const total = audience + engagement;
    return [
      { label: "Audience", value: total > 0 ? audience : 1, colorVar: "--cSocial" },
      { label: "Engagement", value: total > 0 ? engagement : 1, colorVar: "--cGoogle" },
    ];
  }

  if (cubeKey === "linkedin") {
    const m = ov?.sources?.linkedin?.metrics;
    const impressions =
      safeNum(m?.totals?.impressionCount) +
      safeNum(m?.totals?.uniqueImpressionsCount) +
      safeNum(m?.totals?.pageViews);
    const clicks =
      safeNum(m?.totals?.clickCount) +
      safeNum(m?.totals?.pageClicks);
    const total = impressions + clicks;
    return [
      { label: "Impressions", value: total > 0 ? impressions : 1, colorVar: "--cSocial" },
      { label: "Clics", value: total > 0 ? clicks : 1, colorVar: "--cGoogle" },
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

export function computeQuality(cubeKey: CubeKey, ov: Overview) {
  if (cubeKey === "gmb") {
    const connected = !!ov?.sources?.gmb?.connected;
    if (!connected) return { score: 0, ...qualityLabel(0) };

    const m = ov?.sources?.gmb?.metrics;
    if (m?.error) return { score: 55, ...qualityLabel(55) };
    return { score: 70, ...qualityLabel(70) };
  }

  if (cubeKey === "facebook" || cubeKey === "instagram" || cubeKey === "linkedin") {
    return computeSocialQuality(cubeKey, ov);
  }

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

  if (cubeKey === "site_inrcy") score += 10;

  score = clamp(score, 15, 95);
  return { score, ...qualityLabel(score) };
}

function getSocialMetrics(cubeKey: "facebook" | "instagram" | "linkedin", ov: Overview) {
  const m =
    cubeKey === "facebook"
      ? ov?.sources?.facebook?.metrics
      : cubeKey === "instagram"
        ? ov?.sources?.instagram?.metrics
        : ov?.sources?.linkedin?.metrics;

  const audience =
    cubeKey === "facebook"
      ? safeNum(m?.totals?.fan_count) + safeNum(m?.totals?.followers_count) + safeNum(m?.totals?.post_impressions_sum)
      : cubeKey === "instagram"
        ? safeNum(m?.totals?.follower_count) + safeNum(m?.totals?.reach) + safeNum(m?.totals?.profile_views)
        : safeNum(m?.totals?.followerCount) + safeNum(m?.totals?.pageViews) + safeNum(m?.totals?.uniqueImpressionsCount);

  const engagement =
    cubeKey === "facebook"
      ? safeNum(m?.totals?.page_engaged_users) + safeNum(m?.totals?.post_engaged_users_sum) + safeNum(m?.totals?.reactions) + safeNum(m?.totals?.comments) + safeNum(m?.totals?.shares)
      : cubeKey === "instagram"
        ? safeNum(m?.totals?.likes) + safeNum(m?.totals?.comments) + safeNum(m?.totals?.shares) + safeNum(m?.totals?.replies) + safeNum(m?.totals?.saves)
        : safeNum(m?.totals?.engagementCount) + safeNum(m?.totals?.reactionCount) + safeNum(m?.totals?.commentCount) + safeNum(m?.totals?.shareCount);

  const conversions =
    cubeKey === "facebook"
      ? safeNum(m?.totals?.page_website_clicks_logged_in_unique) + safeNum(m?.totals?.page_call_phone_clicks_logged_in_unique) + safeNum(m?.totals?.page_get_directions_clicks_logged_in_unique)
      : cubeKey === "instagram"
        ? safeNum(m?.totals?.website_clicks) + safeNum(m?.totals?.phone_call_clicks) + safeNum(m?.totals?.email_contacts) + safeNum(m?.totals?.text_message_clicks) + safeNum(m?.totals?.get_directions_clicks) + safeNum(m?.totals?.get_direction_clicks)
        : safeNum(m?.totals?.clickCount) + safeNum(m?.totals?.pageClicks);

  const visibility =
    cubeKey === "facebook"
      ? safeNum(m?.totals?.post_impressions_sum) + safeNum(m?.totals?.page_impressions)
      : cubeKey === "instagram"
        ? safeNum(m?.totals?.impressions) + safeNum(m?.totals?.reach)
        : safeNum(m?.totals?.impressionCount) + safeNum(m?.totals?.uniqueImpressionsCount);

  return { audience, engagement, conversions, visibility };
}

function computeSocialQuality(cubeKey: "facebook" | "instagram" | "linkedin", ov: Overview) {
  const connected =
    cubeKey === "facebook"
      ? !!ov?.sources?.facebook?.connected
      : cubeKey === "instagram"
        ? !!ov?.sources?.instagram?.connected
        : !!ov?.sources?.linkedin?.connected;
  if (!connected) return { score: 0, ...qualityLabel(0) };

  const { audience, engagement, conversions, visibility } = getSocialMetrics(cubeKey, ov);
  const exposureBase =
    cubeKey === "instagram" ? 2500 : cubeKey === "linkedin" ? 1200 : 3000;
  const engagementBase =
    cubeKey === "instagram" ? 120 : cubeKey === "linkedin" ? 45 : 90;
  const conversionBase =
    cubeKey === "instagram" ? 6 : cubeKey === "linkedin" ? 3 : 5;

  const s1 = logNorm(Math.max(visibility, audience), exposureBase);
  const s2 = logNorm(engagement, engagementBase);
  const s3 = logNorm(conversions, conversionBase);

  const score = clamp(Math.round((s1 * 0.35 + s2 * 0.35 + s3 * 0.30) * 100), 18, 92);
  return { score, ...qualityLabel(score) };
}

function getDecisionInput(
  cubeKey: CubeKey,
  ov: Overview,
  qualityScore: number,
  opp30: number,
  provenance: Array<{ label: string; value: number; colorVar: string }>,
) {
  if (cubeKey === "facebook" || cubeKey === "instagram" || cubeKey === "linkedin") {
    const metrics = getSocialMetrics(cubeKey, ov);
    const connected =
      cubeKey === "facebook"
        ? !!ov?.sources?.facebook?.connected
        : cubeKey === "instagram"
          ? !!ov?.sources?.instagram?.connected
          : !!ov?.sources?.linkedin?.connected;

    return {
      channelType: "social" as const,
      channelKey: cubeKey,
      connected,
      opportunities: opp30,
      quality: qualityScore,
      metrics: {
        audience: metrics.audience,
        engagement: metrics.engagement,
        conversions: metrics.conversions,
        visibility: metrics.visibility,
      },
      provenance: provenance.map((entry) => ({ label: entry.label, value: entry.value })),
    };
  }

  if (cubeKey === "gmb") {
    const m = ov?.sources?.gmb?.metrics;
    const { impressions: visibility, websiteClicks, callClicks, directionRequests } = getGmbTotals(m);

    const conversions = websiteClicks + callClicks + directionRequests;

    return {
      channelType: "gmb" as const,
      channelKey: cubeKey,
      connected: !!ov?.sources?.gmb?.connected,
      opportunities: opp30,
      quality: qualityScore,
      metrics: {
        traffic: conversions,
        conversions,
        visibility,
      },
      provenance: provenance.map((entry) => ({ label: entry.label, value: entry.value })),
    };
  }

  const queries = Array.isArray(ov.topQueries) ? ov.topQueries : [];
  const topPages = Array.isArray(ov.topPages) ? ov.topPages : [];
  const intentClicks = queries.filter((q) => isIntentQuery(q.query)).reduce((s, q) => s + safeNum(q.clicks), 0);
  const contactViews = topPages.filter((p) => pageKind(p.path) === "contact").reduce((s, p) => s + safeNum(p.views), 0);
  const traffic = safeNum(ov?.totals?.sessions);
  const visibility = safeNum(ov?.totals?.impressions);
  const engagement = Math.round((safeNum(ov?.totals?.engagementRate) || 0) * 100);

  return {
    channelType: "website" as const,
    channelKey: cubeKey,
    connected: cubeKey === "site_inrcy"
      ? !!ov?.sources?.site_inrcy?.connected?.ga4 || !!ov?.sources?.site_inrcy?.connected?.gsc
      : !!ov?.sources?.site_web?.connected?.ga4 || !!ov?.sources?.site_web?.connected?.gsc,
    opportunities: opp30,
    quality: qualityScore,
    metrics: {
      traffic,
      intent: intentClicks,
      conversions: contactViews,
      engagement,
      visibility,
    },
    provenance: provenance.map((entry) => ({ label: entry.label, value: entry.value })),
  };
}

function actionFromDecision(baseAction: CubeModel["action"], decision: DecisionResult): CubeModel["action"] {
  const map: Record<DecisionResult["action"], CubeModel["action"]> = {
    publier: {
      key: "booster_publier",
      title: "Publier",
      detail: decision.reason,
      href: "/dashboard/booster?action=publish",
      pill: "Booster",
      effort: { level: "faible", label: "Effort faible • 5 min" },
    },
    offrir: {
      key: "booster_promotion",
      title: "Offrir",
      detail: decision.reason,
      href: "/dashboard/booster?action=promo",
      pill: "Booster",
      effort: { level: "moyen", label: "Effort moyen • 15 min" },
    },
    recolter: {
      key: "booster_avis",
      title: "Récolter",
      detail: decision.reason,
      href: "/dashboard/booster?action=reviews",
      pill: "Booster",
      effort: { level: "moyen", label: "Effort moyen • 10 min" },
    },
    informer: {
      key: "fideliser_informer",
      title: "Informer",
      detail: decision.reason,
      href: "/dashboard/fideliser?action=inform",
      pill: "Fidéliser",
      effort: { level: "moyen", label: "Effort moyen • 15 min" },
    },
    suivre: {
      key: "fideliser_remercier",
      title: "Suivre",
      detail: decision.reason,
      href: "/dashboard/fideliser?action=thanks",
      pill: "Fidéliser",
      effort: { level: "faible", label: "Effort faible • 2 min" },
    },
    enqueter: {
      key: "fideliser_satisfaction",
      title: "Enquêter",
      detail: decision.reason,
      href: "/dashboard/fideliser?action=satisfaction",
      pill: "Fidéliser",
      effort: { level: "faible", label: "Effort faible • 3 min" },
    },
  };

  return { ...baseAction, ...map[decision.action] };
}

function recommendAction(cubeKey: CubeKey, ov: Overview, qualityScore: number): CubeModel["action"] {
  if (cubeKey === "site_inrcy") {
    const ownership = ov?.inrcySiteOwnership;
    const c = ov?.sources?.site_inrcy?.connected;

    if (ownership === "none") {
      return {
        key: "connect",
        title: "Configurer",
        detail: "Aucun site iNrCy associé pour le moment.",
        href: "/dashboard?panel=site_inrcy",
        pill: "Connexion",
      };
    }

    if (!c?.ga4) {
      return {
        key: "connect",
        title: "Connecter GA4",
        detail: "Pour analyser vos visiteurs et leur comportement.",
        href: "/dashboard?panel=site_inrcy",
        pill: "Connexion",
      };
    }
    if (!c?.gsc) {
      return {
        key: "connect",
        title: "Connecter Google Search Console",
        detail: "Pour lire les intentions de recherche (mots-clés).",
        href: "/dashboard?panel=site_inrcy",
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
        href: "/dashboard?panel=site_web",
        pill: "Connexion",
      };
    }
    if (!c?.gsc) {
      return {
        key: "connect",
        title: "Connecter Google Search Console",
        detail: "Pour lire les intentions de recherche (mots-clés).",
        href: "/dashboard?panel=site_web",
        pill: "Connexion",
      };
    }
  }

  if (cubeKey === "gmb" && !ov?.sources?.gmb?.connected) {
    return {
      key: "connect",
      title: "Connecter Google Business",
      detail: "Pour capter les demandes locales (appels, itinéraires, clics site).",
      href: "/dashboard?panel=gmb",
      pill: "Connexion",
    };
  }

  if (cubeKey === "facebook" && !ov?.sources?.facebook?.connected) {
    return {
      key: "connect",
      title: "Connecter Facebook",
      detail: "Pour activer la visibilité sociale et la communauté.",
      href: "/dashboard?panel=facebook",
      pill: "Connexion",
    };
  }

  if (cubeKey === "instagram" && !ov?.sources?.instagram?.connected) {
    return {
      key: "connect",
      title: "Connecter Instagram",
      detail: "Pour activer la visibilité de votre marque.",
      href: "/dashboard?panel=instagram",
      pill: "Connexion",
    };
  }

  if (cubeKey === "linkedin" && !ov?.sources?.linkedin?.connected) {
    return {
      key: "connect",
      title: "Connecter LinkedIn",
      detail: "Pour activer la crédibilité.",
      href: "/dashboard?panel=linkedin",
      pill: "Connexion",
    };
  }

  const effortMap: Partial<Record<ActionKey, CubeModel["action"]["effort"] | undefined>> = {
    booster_publier: { level: "faible", label: "Effort faible • 5 min" },
    booster_avis: { level: "moyen", label: "Effort moyen • 10 min" },
    booster_promotion: { level: "moyen", label: "Effort moyen • 15 min" },
    fideliser_informer: { level: "moyen", label: "Effort moyen • 15 min" },
    fideliser_satisfaction: { level: "faible", label: "Effort faible • 3 min" },
    fideliser_remercier: { level: "faible", label: "Effort faible • 2 min" },
    connect: undefined,
    loading: undefined,
  };

  const attachEffort = (a: CubeModel["action"]): CubeModel["action"] => {
    if (a.key === "connect") return a;
    return { ...a, effort: effortMap[a.key] };
  };

  const opp30 = computeOpportunity30(cubeKey, ov);

  if (cubeKey === "site_inrcy") {
    if (qualityScore >= 70) {
      return attachEffort({
        key: "fideliser_remercier",
        title: "Suivre",
        detail: "Convertissez vos clients satisfaits en recommandations et avis.",
        href: "/dashboard/fideliser?action=thanks",
        pill: "Fidéliser",
      });
    }
    return attachEffort({
      key: "booster_promotion",
      title: "Offrir",
      detail: "Mettez en avant une offre / un message clair pour déclencher le contact.",
      href: "/dashboard/booster?action=promo",
      pill: "Booster",
    });
  }

  if (cubeKey === "site_web") {
    if (qualityScore < 60) {
      return attachEffort({
        key: "booster_promotion",
        title: "Offrir",
        detail: "Ajoutez/optimisez un déclencheur (devis, urgence, appel à l’action).",
        href: "/dashboard/booster?action=promo",
        pill: "Booster",
      });
    }
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
      title: "Récolter",
      detail: "Les avis sont le levier n°1 pour gagner des appels locaux.",
      href: "/dashboard/booster?action=reviews",
      pill: "Booster",
    });
  }

  const socialLabel = cubeKey === "linkedin" ? "votre audience pro" : "votre audience";
  return attachEffort({
    key: "booster_publier",
    title: "Publier",
    detail: `1 publication simple/semaine suffit pour capter ${socialLabel}.`,
    href: "/dashboard/booster?action=publish",
    pill: "Booster",
  });
}

export function buildInsights(cubeKey: CubeKey, ov: Overview, qualityScore: number, decision?: DecisionResult) {
  const insights: string[] = [];

  if (decision?.businessLecture?.length) {
    return decision.businessLecture.slice(0, 4);
  }

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

  const t = ov.totals || ({} as any);
  const sessions = safeNum(t.sessions);
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

  return insights.slice(0, 3);
}

export function buildCubeModel(
  key: CubeKey,
  title: string,
  subtitle: string,
  period: Period,
  state: { ov: Overview | null; loading: boolean; error?: string },
  summaryOppByCube: Record<CubeKey, number>,
): CubeModel {
  const hasRealOverview = !!state.ov;
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
        instagram: { connected: false },
        linkedin: { connected: false },
      },
    } as Overview);

  const accountLabel = String(ov?.identities?.[key]?.label || ov?.identities?.[key]?.url || "").trim();
  const inrcyOwnership = (ov as any)?.inrcySiteOwnership;
  const inrcyDisconnected = inrcyOwnership === "none";

  const connections =
    key === "site_inrcy"
      ? inrcyDisconnected
        ? { ga4: false, gsc: false }
        : { ga4: !!ov.sources?.site_inrcy?.connected?.ga4, gsc: !!ov.sources?.site_inrcy?.connected?.gsc }
      : key === "site_web"
        ? { ga4: !!ov.sources?.site_web?.connected?.ga4, gsc: !!ov.sources?.site_web?.connected?.gsc }
        : key === "gmb"
          ? { main: !!ov.sources?.gmb?.connected }
          : key === "facebook"
            ? { main: !!ov.sources?.facebook?.connected }
            : key === "instagram"
              ? { main: !!ov.sources?.instagram?.connected }
              : { main: !!ov.sources?.linkedin?.connected };

  const provenance = buildProvenance(key, ov);
  const opp30 = summaryOppByCube[key] ?? computeOpportunity30(key, ov);

  const q = computeQuality(key, ov);
  let action = recommendAction(key, ov, q.score);
  let decision: DecisionResult | undefined;

  if (action.key !== "connect" && action.key !== "loading") {
    decision = decideAction(getDecisionInput(key, ov, q.score, opp30, provenance));
    action = actionFromDecision(action, decision);
  }

  const insights = buildInsights(key, ov, q.score, decision);

  if (state.loading && !hasRealOverview) {
    action = {
      key: "loading",
      title: "Connexion…",
      detail: "Récupération de vos connexions",
      href: "",
      pill: "Connexion",
    };
  }

  const opportunityLabel =
    opp30 >= 14 ? "Fort potentiel" : opp30 >= 7 ? "Potentiel réel" : opp30 >= 3 ? "Potentiel modéré" : "À activer";

  return {
    key,
    inrcyOwnership: key === "site_inrcy" ? (inrcyOwnership as any) : undefined,
    title,
    subtitle,
    accountLabel: accountLabel || undefined,
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
}

export function buildSummaryActionItems({
  centralByCube,
  computedEstimatedByCube,
  models,
  summaryEstimatedByCube,
}: {
  centralByCube: Record<CubeKey, number>;
  computedEstimatedByCube: Record<CubeKey, number>;
  models: CubeModel[];
  summaryEstimatedByCube: Record<CubeKey, number>;
}) {
  const connectionStateByCube: Record<CubeKey, boolean> = {
    site_inrcy: !!models.find((m) => m.key === "site_inrcy")?.connections.ga4 || !!models.find((m) => m.key === "site_inrcy")?.connections.gsc,
    site_web: !!models.find((m) => m.key === "site_web")?.connections.ga4 || !!models.find((m) => m.key === "site_web")?.connections.gsc,
    gmb: !!models.find((m) => m.key === "gmb")?.connections.main,
    facebook: !!models.find((m) => m.key === "facebook")?.connections.main,
    instagram: !!models.find((m) => m.key === "instagram")?.connections.main,
    linkedin: !!models.find((m) => m.key === "linkedin")?.connections.main,
  };

  const connectedCopy: Record<CubeKey, { label: string; kicker: string; motive: string; badge: string }> = {
    facebook: {
      label: "Publier sur Facebook",
      kicker: "Relancez votre visibilité locale",
      motive: "Une publication ciblée peut remettre votre activité en mouvement et générer de nouvelles demandes rapidement.",
      badge: "Booster",
    },
    instagram: {
      label: "Publier sur Instagram",
      kicker: "Réactivez votre visibilité de marque",
      motive: "Du contenu récent et régulier peut transformer plus d’attention en prises de contact concrètes.",
      badge: "Booster",
    },
    linkedin: {
      label: "Publier sur LinkedIn",
      kicker: "Renforcez votre crédibilité pro",
      motive: "Une prise de parole visible peut faire émerger de nouvelles opportunités professionnelles.",
      badge: "Publier",
    },
    site_web: {
      label: "Optimiser votre site",
      kicker: "Transformez plus de visiteurs en prospects",
      motive: "Quelques ajustements ciblés peuvent augmenter le rendement commercial de votre site rapidement.",
      badge: "Fidéliser",
    },
    site_inrcy: {
      label: "Optimiser votre site iNrCy",
      kicker: "Accélérez une machine déjà lancée",
      motive: "Votre générateur tourne déjà : quelques optimisations peuvent faire monter le chiffre plus vite.",
      badge: "Fidéliser",
    },
    gmb: {
      label: "Optimiser Google Business",
      kicker: "Débloquez un potentiel local immédiat",
      motive: "Votre fiche locale peut capter plus d’appels, de clics et d’itinéraires avec quelques actions ciblées.",
      badge: "Booster",
    },
  };

  const disconnectedCopy: Record<CubeKey, { label: string; kicker: string; motive: string; badge: string }> = {
    facebook: {
      label: "Connecter Facebook",
      kicker: "Activez un levier social local",
      motive: "Reliez Facebook pour mesurer votre visibilité sociale et capter plus de demandes locales.",
      badge: "Connexion",
    },
    instagram: {
      label: "Connecter Instagram",
      kicker: "Activez votre vitrine de marque",
      motive: "Reliez Instagram pour exploiter votre visibilité et transformer plus d’attention en opportunités.",
      badge: "Connexion",
    },
    linkedin: {
      label: "Connecter LinkedIn",
      kicker: "Activez votre crédibilité professionnelle",
      motive: "Reliez LinkedIn pour publier facilement et préparer le suivi analytics dès que les accès seront disponibles.",
      badge: "Connexion",
    },
    site_web: {
      label: "Connecter votre site",
      kicker: "Mesurez enfin votre rendement web",
      motive: "Connectez GA4 et GSC pour analyser votre trafic, vos intentions et votre potentiel business.",
      badge: "Connexion",
    },
    site_inrcy: {
      label: "Connecter le site iNrCy",
      kicker: "Branchez votre machine à leads",
      motive: "Activez les outils de mesure du site iNrCy pour suivre sa performance et ses opportunités.",
      badge: "Connexion",
    },
    gmb: {
      label: "Connecter Google Business",
      kicker: "Débloquez un potentiel local immédiat",
      motive: "Vous laissez probablement passer des demandes locales : ce canal mérite d’être activé en priorité.",
      badge: "Connexion",
    },
  };

  return [
    { key: "site_inrcy" as CubeKey, opportunities: centralByCube.site_inrcy, revenue: computedEstimatedByCube.site_inrcy || summaryEstimatedByCube.site_inrcy },
    { key: "site_web" as CubeKey, opportunities: centralByCube.site_web, revenue: computedEstimatedByCube.site_web || summaryEstimatedByCube.site_web },
    { key: "gmb" as CubeKey, opportunities: centralByCube.gmb, revenue: computedEstimatedByCube.gmb || summaryEstimatedByCube.gmb },
    { key: "facebook" as CubeKey, opportunities: centralByCube.facebook, revenue: computedEstimatedByCube.facebook || summaryEstimatedByCube.facebook },
    { key: "instagram" as CubeKey, opportunities: centralByCube.instagram, revenue: computedEstimatedByCube.instagram || summaryEstimatedByCube.instagram },
    { key: "linkedin" as CubeKey, opportunities: centralByCube.linkedin, revenue: computedEstimatedByCube.linkedin || summaryEstimatedByCube.linkedin },
  ].map((item) => ({
    ...item,
    ...(connectionStateByCube[item.key] ? connectedCopy[item.key] : disconnectedCopy[item.key]),
    connected: connectionStateByCube[item.key],
  }));
}
