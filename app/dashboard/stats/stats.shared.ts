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
    tiktok: { connected: boolean; metrics?: any | null };
    youtube_shorts?: { connected: boolean; metrics?: any | null };
    pinterest?: { connected: boolean; metrics?: any | null };
    mails?: { connected: boolean; metrics?: any | null };
  };
  inrcyActivity?: Partial<Record<CubeKey, InrcyActivityStats>>;
  identities?: Partial<Record<CubeKey, { label?: string | null; url?: string | null }>>;
  meta?: { generatedAt?: string; snapshotDate?: string | null; live?: boolean };
};

export type CubeKey = "inrbadge" | "site_inrcy" | "site_web" | "gmb" | "facebook" | "instagram" | "linkedin" | "mails" | "tiktok" | "youtube_shorts" | "pinterest";

export type Period = 7 | 14 | 30 | 60;

export type CapturedLeads = {
  week: number;
  month: number;
};

export type CubeState = {
  ov: Overview | null;
  loading: boolean;
  error?: string;
  capturedLeads?: CapturedLeads;
};

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
  capturedLeadsByCube?: {
    week?: Partial<Record<CubeKey, number>>;
    month?: Partial<Record<CubeKey, number>>;
  };
  blocks?: Partial<Record<CubeKey, InrstatsChannelBlock>>;
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
  blocks?: Partial<Record<CubeKey, InrstatsChannelBlock>>;
  snapshotDate: string | null;
};

export type ActionKey =
  | "booster_publier"
  | "propulser_action"
  | "fideliser_action"
  | "booster_avis"
  | "booster_promotion"
  | "fideliser_informer"
  | "fideliser_satisfaction"
  | "fideliser_remercier"
  | "mail_simple"
  | "connect"
  | "loading";

export type ActionEffort = {
  level: "faible" | "moyen" | "eleve";
  label: string;
};

export type CubeMetricItem = {
  label: string;
  value: string;
  subValue?: string;
};

export type InrcyActivityCount = {
  week: number;
  month: number;
  total: number;
};

export type InrcyActivityStats = {
  publications: InrcyActivityCount;
  photos: InrcyActivityCount;
  videos: InrcyActivityCount;
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
  connectionPending?: boolean;
  provenance: Array<{ label: string; value: number; colorVar: string }>;
  opportunity30: number;
  opportunityLabel: string;
  capturedLeads: CapturedLeads;
  capturedLeadsUnavailable?: boolean;
  capturedLeadsHint?: string;
  provenanceHint?: string;
  visibilityStats: CubeMetricItem[];
  actionStats: CubeMetricItem[];
  inrcyActivityStats?: InrcyActivityStats | null;
  qualityScore: number;
  qualityLabel: string;
  qualityTone: "low" | "ok" | "solid" | "excellent";
  insights: string[];
  action: {
    key: ActionKey;
    title: string;
    detail: string;
    href: string;
    pill: "Booster" | "Propulser" | "Fidéliser" | "Mail simple" | "Connexion";
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

const CUBE_KEYS: CubeKey[] = ["inrbadge", "mails", "site_inrcy", "site_web", "gmb", "facebook", "instagram", "linkedin", "tiktok", "youtube_shorts", "pinterest"];
const REMOTE_STATS_CUBE_KEYS: CubeKey[] = CUBE_KEYS.filter((key) => key !== "mails" && key !== "inrbadge");

export function hasCapturedLeadsBlocks(blocks: Partial<Record<CubeKey, InrstatsChannelBlock>> | undefined) {
  if (!blocks || typeof blocks !== "object") return false;
  return REMOTE_STATS_CUBE_KEYS.every((key) => {
    const leads = blocks[key]?.capturedLeads;
    return Number.isFinite(Number(leads?.week)) && Number.isFinite(Number(leads?.month));
  });
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

export function parseCachedCubeSnapshot(raw: string | null): { syncedAt: number; overviews: Record<CubeKey, Overview>; snapshotDate: string | null; blocks?: Partial<Record<CubeKey, InrstatsChannelBlock>> } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as any;
    if (parsed && typeof parsed === "object" && parsed.overviews && typeof parsed.overviews === "object") {
      return {
        syncedAt: safeNum(parsed.syncedAt),
        overviews: parsed.overviews as Record<CubeKey, Overview>,
        snapshotDate: typeof parsed.snapshotDate === "string" ? parsed.snapshotDate : getOverviewSnapshotDate(parsed.overviews),
        blocks: parsed.blocks && typeof parsed.blocks === "object" ? (parsed.blocks as Partial<Record<CubeKey, InrstatsChannelBlock>>) : undefined,
      };
    }
    if (parsed && typeof parsed === "object") {
      return {
        syncedAt: 0,
        overviews: parsed as Record<CubeKey, Overview>,
        snapshotDate: getOverviewSnapshotDate(parsed),
        blocks: parsed.blocks && typeof parsed.blocks === "object" ? (parsed.blocks as Partial<Record<CubeKey, InrstatsChannelBlock>>) : undefined,
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
    hasCapturedLeadsBlocks(cachedCube.blocks) &&
    cachedSummary &&
    cachedCube.syncedAt >= lastChannelSyncAt &&
    cachedSummary.syncedAt >= lastChannelSyncAt &&
    cachedCube.snapshotDate === snapshotDate &&
    cachedSummary.snapshotDate === snapshotDate
  );
}

export function emptyCubeState(): Record<CubeKey, CubeState> {
  return {
    inrbadge: { ov: null, loading: false, capturedLeads: { week: 0, month: 0 } },
    site_inrcy: { ov: null, loading: true, capturedLeads: { week: 0, month: 0 } },
    site_web: { ov: null, loading: true, capturedLeads: { week: 0, month: 0 } },
    gmb: { ov: null, loading: true, capturedLeads: { week: 0, month: 0 } },
    facebook: { ov: null, loading: true, capturedLeads: { week: 0, month: 0 } },
    instagram: { ov: null, loading: true, capturedLeads: { week: 0, month: 0 } },
    linkedin: { ov: null, loading: true, capturedLeads: { week: 0, month: 0 } },
    mails: { ov: null, loading: false, capturedLeads: { week: 0, month: 0 } },
    tiktok: { ov: null, loading: true, capturedLeads: { week: 0, month: 0 } },
    youtube_shorts: { ov: null, loading: false, capturedLeads: { week: 0, month: 0 } },
    pinterest: { ov: null, loading: false, capturedLeads: { week: 0, month: 0 } },
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

  const coldStartBaseline = cubeKey === "instagram" ? 0.18 : cubeKey === "linkedin" ? 0 : (cubeKey === "tiktok" || cubeKey === "youtube_shorts" || cubeKey === "pinterest") ? 0.18 : 0.2;
  if (!m) return coldStartBaseline;

  const audienceTotal =
    getTotalMetric(m, [
      "followers",
      "followerCount",
      "memberFollowersCount",
      "organicFollowerCount",
      "paidFollowerCount",
      "follower_count",
      "followers_count",
      "fan_count",
      "fans",
      "fanCount",
      "audience",
      "subscribers",
    ]) || 0;

  if (safeObj(m).error && !(cubeKey === "linkedin" && audienceTotal > 0)) return coldStartBaseline;

  const impressionsTotal =
    getTotalMetric(m, [
      "impressions",
      "post_impressions",
      "postImpressions",
      "post_impressions_sum",
      "IMPRESSIONS",
      "impressionCount",
      "uniqueImpressionsCount",
      "viewerImpressions",
      "reach",
      "REACH",
    ]) || 0;

  const engagementsTotal =
    getTotalMetric(m, [
      "engagements",
      "engagementCount",
      "post_engagements",
      "postEngagements",
      "ENGAGEMENTS",
      "total_engagements",
      "page_engaged_users",
      "post_engaged_users_sum",
      "reactions",
      "reactionCount",
      "comments",
      "commentCount",
      "shares",
      "shareCount",
      "likes",
      "likeCount",
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
      "profile_links_taps",
      "text_message_clicks",
      "get_directions_clicks",
      "get_direction_clicks",
    ]) || 0;

  const impressionsPerDay = impressionsTotal / baseDays;
  const engagementsPerDay = engagementsTotal / baseDays;
  const ctaClicksPerDay = ctaClicksTotal / baseDays;

  if (cubeKey === "linkedin") {
    const commentsTotal = getTotalMetric(m, ["commentCount", "comments"]);
    const sharesTotal = getTotalMetric(m, ["shareCount", "shares"]);
    const likesTotal = getTotalMetric(m, ["likeCount", "likes", "reactions", "reactionCount"]);
    const newFollowersTotal = getTotalMetric(m, ["newFollowers", "followerGainedFromContentCount"]);
    const postsPublishedTotal = getTotalMetric(m, ["postsPublished"]);
    const uniqueImpressionsTotal = getTotalMetric(m, ["uniqueImpressionsCount"]);
    const contentClicksTotal = getTotalMetric(m, ["linkClickCount", "premiumCtaClickCount", "clickCount", "clicks", "pageClicks"]);
    const contentSavesTotal = getTotalMetric(m, ["postSaveCount"]);
    const contentSendsTotal = getTotalMetric(m, ["postSendCount"]);
    const contentProfileViewsTotal = getTotalMetric(m, ["profileViewFromContentCount", "profileViews"]);

    const hasRealLinkedInSignal =
      impressionsTotal > 0 ||
      uniqueImpressionsTotal > 0 ||
      engagementsTotal > 0 ||
      commentsTotal > 0 ||
      sharesTotal > 0 ||
      likesTotal > 0 ||
      newFollowersTotal > 0 ||
      postsPublishedTotal > 0 ||
      contentClicksTotal > 0 ||
      contentSavesTotal > 0 ||
      contentSendsTotal > 0 ||
      contentProfileViewsTotal > 0 ||
      audienceTotal > 0;

    if (!hasRealLinkedInSignal) return 0;

    const currentPerDay = clamp(
      0.03 +
        (commentsTotal / baseDays) * 0.22 +
        (sharesTotal / baseDays) * 0.18 +
        (newFollowersTotal / baseDays) * 0.14 +
        (likesTotal / baseDays) * 0.05 +
        (contentClicksTotal / baseDays) * 0.20 +
        (contentSavesTotal / baseDays) * 0.12 +
        (contentSendsTotal / baseDays) * 0.10 +
        (contentProfileViewsTotal / baseDays) * 0.16 +
        (postsPublishedTotal / baseDays) * 0.08 +
        (uniqueImpressionsTotal / baseDays) * 0.004 +
        (impressionsTotal / baseDays) * 0.0015,
      0,
      1.4,
    );

    const publishTarget = Math.max(2, Math.round(baseDays / 10));
    const publishDeficit = clamp(1 - postsPublishedTotal / publishTarget, 0, 1);
    const exposureN = logNorm(impressionsPerDay, 1200);
    const engagementN = logNorm(engagementsPerDay, 45);
    const audienceN = logNorm(audienceTotal, 2000);
    const audienceHeadroom = clamp(0.5 * (1 - engagementN) + 0.5 * (1 - exposureN), 0, 1);

    const potentialPerDay = clamp(
      currentPerDay + 0.08 + 0.18 * publishDeficit + 0.22 * audienceHeadroom + 0.12 * audienceN,
      coldStartBaseline,
      2.2,
    );
    const additionalPerDay = Math.max(0, potentialPerDay - currentPerDay);
    return clamp(additionalPerDay, 0, 2.2);
  }

  const refs =
    cubeKey === "instagram"
      ? { imp: 2500, eng: 120, cta: 6, aud: 3000 }
      : (cubeKey === "tiktok" || cubeKey === "youtube_shorts" || cubeKey === "pinterest")
        ? { imp: 3200, eng: 160, cta: 5, aud: 2500 }
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
  if (cubeKey === "mails") {
    const connected = !!ov?.sources?.mails?.connected;
    if (!connected) return 0;
    const m = ov?.sources?.mails?.metrics;
    const base = safeNum(m?.campagnes30) <= 0 ? 8 : 3;
    const contactsPotential = Math.min(28, safeNum(m?.contactsCrm) / 14);
    const activityPotential = Math.min(14, safeNum(m?.campagnes30) * 2 + safeNum(m?.destinataires30) / 45 + safeNum(m?.agendaReminders30) / 20);
    return Math.max(0, Math.round(base + contactsPotential + activityPotential));
  }

  if (cubeKey === "facebook" || cubeKey === "instagram" || cubeKey === "linkedin" || cubeKey === "tiktok" || cubeKey === "youtube_shorts" || cubeKey === "pinterest") {
    const perDay = computeOpportunityPerDaySocial(cubeKey, ov);
    return Math.max(0, Math.round(perDay * 30));
  }
  const perDay = computeOpportunityPerDayWeb(ov);
  return Math.max(0, Math.round(perDay * 30));
}

const LINKEDIN_DETAIL_SIGNAL_KEYS = [
  "messages",
  "conversations",
  "impressions",
  "impressionCount",
  "uniqueImpressionsCount",
  "viewerImpressions",
  "engagements",
  "likes",
  "likeCount",
  "comments",
  "commentCount",
  "shares",
  "shareCount",
  "clicks",
  "clickCount",
  "linkClickCount",
  "premiumCtaClickCount",
  "pageClicks",
  "profileViews",
  "profileViewFromContentCount",
  "pageViews",
  "postsPublished",
  "postSaveCount",
  "postSendCount",
] as const;

function deepHasLinkedInError(value: any): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((entry) => String(entry || "").trim().length > 0);
  if (typeof value.error === "string" && value.error.trim()) return true;
  if (Array.isArray(value.errors) && value.errors.some((entry: any) => String(entry || "").trim())) return true;
  return Object.values(value).some((entry) => deepHasLinkedInError(entry));
}

function linkedInMetricValue(metrics: any, key: string) {
  return safeNum(metrics?.totals?.[key]) + safeNum(metrics?.[key]);
}

export function hasLinkedInDetailedStats(ov: Overview | null | undefined) {
  const m = ov?.sources?.linkedin?.metrics;
  if (!m) return false;

  // LinkedIn peut remonter des stats exploitables tout en signalant
  // une erreur sur un sous-appel API (ex : profil OK, page partielle, ou inversement).
  // Dans ce cas on garde les chiffres au lieu de masquer tout le bloc.
  return LINKEDIN_DETAIL_SIGNAL_KEYS.some((key) => linkedInMetricValue(m, key) > 0);
}

export function isLinkedInStatsPartial(ov: Overview | null | undefined) {
  const node = ov?.sources?.linkedin;
  if (!node?.connected) return false;
  const m = node.metrics;
  if (!m) return true;

  const hasUsableSignals = hasLinkedInDetailedStats(ov);
  if (hasUsableSignals) return false;

  if (m?.error) return true;
  if (deepHasLinkedInError(m?.raw)) return true;
  return true;
}

export function buildProvenance(cubeKey: CubeKey, ov: Overview) {
  if (cubeKey === "mails") {
    const m = ov?.sources?.mails?.metrics;
    return [
      { label: "Fidéliser", value: safeNum(m?.fidelisations30), colorVar: "--cSocial" },
      { label: "Propulser", value: safeNum(m?.propulsions30), colorVar: "--cGoogle" },
      { label: "Mails simples", value: safeNum(m?.mailsSimples30), colorVar: "--cDirect" },
    ];
  }

  if (cubeKey === "gmb") {
    const m = ov?.sources?.gmb?.metrics;
    const { impressions, mapsImpressions: maps, searchImpressions: search } = getGmbTotals(m);
    if (maps > 0 || search > 0) {
      return [
        { label: "Maps", value: maps, colorVar: "--cGoogle" },
        { label: "Search", value: search, colorVar: "--cDirect" },
      ];
    }
    if (impressions > 0) {
      return [
        { label: "Visibilité locale", value: impressions, colorVar: "--cGoogle" },
      ];
    }
    return [
      { label: "Maps", value: 0, colorVar: "--cGoogle" },
      { label: "Search", value: 0, colorVar: "--cDirect" },
    ];
  }

  if (cubeKey === "facebook") {
    const m = ov?.sources?.facebook?.metrics;
    const audience = Math.max(
      safeNum(m?.totals?.page_impressions_unique),
      safeNum(m?.totals?.post_impressions_unique_sum),
      safeNum(m?.totals?.reach),
      safeNum(m?.totals?.fan_count),
      safeNum(m?.totals?.followers_count),
      safeNum(m?.totals?.page_views_total),
    );
    const interactions =
      bestMetricValue(m, ["page_post_engagements", "page_engaged_users", "post_engaged_users_sum"]) ||
      sumMetricValues(m, ["reactions", "comments", "shares"]);
    return [
      { label: "Audience", value: audience, colorVar: "--cSocial" },
      { label: "Interactions", value: interactions, colorVar: "--cGoogle" },
    ];
  }

  if (cubeKey === "instagram") {
    const m = ov?.sources?.instagram?.metrics;
    const audience =
      safeNum(m?.totals?.reach) +
      safeNum(m?.totals?.profile_views) +
      latestDailyMetricValue(m, "follower_count");
    const engagement =
      bestMetricValue(m, ["total_interactions", "accounts_engaged"]) ||
      sumMetricValues(m, ["profile_links_taps", "website_clicks", "phone_call_clicks", "email_contacts", "text_message_clicks", "get_directions_clicks", "get_direction_clicks"]);
    return [
      { label: "Audience", value: audience, colorVar: "--cSocial" },
      { label: "Engagement", value: engagement, colorVar: "--cGoogle" },
    ];
  }

  if (cubeKey === "tiktok") {
    const m = ov?.sources?.tiktok?.metrics;
    const audience = safeNum(m?.totals?.video_views) + safeNum(m?.totals?.views) + safeNum(m?.totals?.profile_views) + safeNum(m?.totals?.followers);
    const engagement = sumMetricValues(m, ["engagements", "likes", "comments", "shares", "saves"]);
    return [
      { label: "Vues", value: audience, colorVar: "--cSocial" },
      { label: "Engagement", value: engagement, colorVar: "--cGoogle" },
    ];
  }

  if (cubeKey === "youtube_shorts") {
    const m = ov?.sources?.youtube_shorts?.metrics;
    const audience = safeNum(m?.totals?.video_views) + safeNum(m?.totals?.views) + safeNum(m?.totals?.profile_views) + safeNum(m?.totals?.subscribers);
    const engagement = sumMetricValues(m, ["engagements", "likes", "comments", "shares", "saves"]);
    return [
      { label: "Vues", value: audience, colorVar: "--cSocial" },
      { label: "Engagement", value: engagement, colorVar: "--cGoogle" },
    ];
  }

  if (cubeKey === "linkedin") {
    const m = ov?.sources?.linkedin?.metrics;
    const impressions =
      bestMetricValue(m, ["impressionCount", "impressions"]) +
      safeNum(m?.totals?.uniqueImpressionsCount) +
      safeNum(m?.totals?.pageViews);
    const clicks = sumMetricValues(m, ["clickCount", "clicks", "linkClickCount", "premiumCtaClickCount", "pageClicks"]);
    return [
      { label: "Impressions", value: impressions, colorVar: "--cSocial" },
      { label: "Clics", value: clicks, colorVar: "--cGoogle" },
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

  if (cubeKey === "mails") {
    const connected = !!ov?.sources?.mails?.connected;
    if (!connected) return { score: 0, ...qualityLabel(0) };
    const m = ov?.sources?.mails?.metrics;
    const accounts = safeNum(m?.connectedCount);
    const contacts = safeNum(m?.contactsCrm);
    const campaigns = safeNum(m?.campagnes30);
    const destinataires = safeNum(m?.destinataires30);
    const agenda = safeNum(m?.agendaReminders30);
    const score = clamp(Math.round(35 + Math.min(25, accounts * 8) + Math.min(20, contacts / 10) + Math.min(20, campaigns * 4 + destinataires * 0.10 + agenda * 0.12)), 35, 92);
    return { score, ...qualityLabel(score) };
  }

  if (cubeKey === "facebook" || cubeKey === "instagram" || cubeKey === "linkedin" || cubeKey === "tiktok" || cubeKey === "youtube_shorts" || cubeKey === "pinterest") {
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

function getSocialMetrics(cubeKey: "facebook" | "instagram" | "linkedin" | "tiktok" | "youtube_shorts" | "pinterest", ov: Overview) {
  const m =
    cubeKey === "facebook"
      ? ov?.sources?.facebook?.metrics
      : cubeKey === "instagram"
        ? ov?.sources?.instagram?.metrics
        : cubeKey === "tiktok"
          ? ov?.sources?.tiktok?.metrics
          : cubeKey === "youtube_shorts"
            ? ov?.sources?.youtube_shorts?.metrics
            : cubeKey === "pinterest"
              ? ov?.sources?.pinterest?.metrics
              : ov?.sources?.linkedin?.metrics;

  const audience =
    cubeKey === "facebook"
      ? safeNum(m?.totals?.fan_count) + safeNum(m?.totals?.followers_count) + safeNum(m?.totals?.post_impressions_sum)
      : cubeKey === "instagram"
        ? latestDailyMetricValue(m, "follower_count") + safeNum(m?.totals?.reach) + safeNum(m?.totals?.profile_views)
        : cubeKey === "tiktok"
          ? safeNum(m?.totals?.followers) + safeNum(m?.totals?.profile_views) + safeNum(m?.totals?.video_views)
          : cubeKey === "youtube_shorts"
            ? safeNum(m?.totals?.subscribers) + safeNum(m?.totals?.followers) + safeNum(m?.totals?.profile_views) + safeNum(m?.totals?.video_views) + safeNum(m?.totals?.views)
            : safeNum(m?.totals?.followers) +
            safeNum(m?.totals?.followerCount) +
            safeNum(m?.totals?.memberFollowersCount) +
            safeNum(m?.totals?.organicFollowerCount) +
            safeNum(m?.totals?.paidFollowerCount) +
            safeNum(m?.totals?.pageViews) +
            safeNum(m?.totals?.uniqueImpressionsCount);

  const engagement =
    cubeKey === "facebook"
      ? safeNum(m?.totals?.page_engaged_users) + safeNum(m?.totals?.post_engaged_users_sum) + safeNum(m?.totals?.reactions) + safeNum(m?.totals?.comments) + safeNum(m?.totals?.shares)
      : cubeKey === "instagram"
        ? safeNum(m?.totals?.likes) + safeNum(m?.totals?.comments) + safeNum(m?.totals?.shares) + safeNum(m?.totals?.replies) + safeNum(m?.totals?.saves)
        : cubeKey === "tiktok"
          ? safeNum(m?.totals?.engagements) + safeNum(m?.totals?.likes) + safeNum(m?.totals?.comments) + safeNum(m?.totals?.shares) + safeNum(m?.totals?.saves)
          : cubeKey === "youtube_shorts"
            ? safeNum(m?.totals?.engagements) + safeNum(m?.totals?.likes) + safeNum(m?.totals?.comments) + safeNum(m?.totals?.shares) + safeNum(m?.totals?.saves)
            : safeNum(m?.totals?.engagementCount) + safeNum(m?.totals?.reactionCount) + safeNum(m?.totals?.commentCount) + safeNum(m?.totals?.shareCount);

  const conversions =
    cubeKey === "facebook"
      ? safeNum(m?.totals?.page_website_clicks_logged_in_unique) + safeNum(m?.totals?.page_call_phone_clicks_logged_in_unique) + safeNum(m?.totals?.page_get_directions_clicks_logged_in_unique)
      : cubeKey === "instagram"
        ? safeNum(m?.totals?.profile_links_taps) + safeNum(m?.totals?.website_clicks) + safeNum(m?.totals?.phone_call_clicks) + safeNum(m?.totals?.email_contacts) + safeNum(m?.totals?.text_message_clicks) + safeNum(m?.totals?.get_directions_clicks) + safeNum(m?.totals?.get_direction_clicks)
        : cubeKey === "tiktok"
          ? safeNum(m?.totals?.website_clicks) + safeNum(m?.totals?.profile_views) + safeNum(m?.totals?.messages)
          : cubeKey === "youtube_shorts"
            ? safeNum(m?.totals?.website_clicks) + safeNum(m?.totals?.profile_views) + safeNum(m?.totals?.messages)
            : safeNum(m?.totals?.clickCount) + safeNum(m?.totals?.pageClicks);

  const visibility =
    cubeKey === "facebook"
      ? safeNum(m?.totals?.post_impressions_sum) + safeNum(m?.totals?.page_impressions)
      : cubeKey === "instagram"
        ? safeNum(m?.totals?.impressions) + safeNum(m?.totals?.reach)
        : cubeKey === "tiktok"
          ? safeNum(m?.totals?.impressions) + safeNum(m?.totals?.video_views) + safeNum(m?.totals?.views)
          : cubeKey === "youtube_shorts"
            ? safeNum(m?.totals?.impressions) + safeNum(m?.totals?.video_views) + safeNum(m?.totals?.views)
            : safeNum(m?.totals?.impressionCount) + safeNum(m?.totals?.uniqueImpressionsCount);

  return { audience, engagement, conversions, visibility };
}

function computeSocialQuality(cubeKey: "facebook" | "instagram" | "linkedin" | "tiktok" | "youtube_shorts" | "pinterest", ov: Overview) {
  const connected =
    cubeKey === "facebook"
      ? !!ov?.sources?.facebook?.connected
      : cubeKey === "instagram"
        ? !!ov?.sources?.instagram?.connected
        : cubeKey === "tiktok"
          ? !!ov?.sources?.tiktok?.connected
          : cubeKey === "youtube_shorts"
            ? !!ov?.sources?.youtube_shorts?.connected
            : cubeKey === "pinterest"
              ? !!ov?.sources?.pinterest?.connected
              : !!ov?.sources?.linkedin?.connected;
  if (!connected) return { score: 0, ...qualityLabel(0) };

  const { audience, engagement, conversions, visibility } = getSocialMetrics(cubeKey, ov);
  const exposureBase =
    cubeKey === "instagram" ? 2500 : cubeKey === "linkedin" ? 1200 : (cubeKey === "tiktok" || cubeKey === "youtube_shorts" || cubeKey === "pinterest") ? 3200 : 3000;
  const engagementBase =
    cubeKey === "instagram" ? 120 : cubeKey === "linkedin" ? 45 : (cubeKey === "tiktok" || cubeKey === "youtube_shorts" || cubeKey === "pinterest") ? 160 : 90;
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
  capturedLeads: CapturedLeads,
) {
  if (cubeKey === "mails") {
    const m = ov?.sources?.mails?.metrics;
    return {
      channelType: "social" as const,
      channelKey: "linkedin" as const,
      connected: !!ov?.sources?.mails?.connected,
      opportunities: opp30,
      quality: qualityScore,
      capturedLeads,
      metrics: {
        audience: safeNum(m?.contactsCrm),
        engagement: safeNum(m?.campagnes30),
        conversions: safeNum(m?.destinataires30),
        visibility: safeNum(m?.destinataires30),
      },
      provenance: provenance.map((entry) => ({ label: entry.label, value: entry.value })),
    };
  }

  if (cubeKey === "facebook" || cubeKey === "instagram" || cubeKey === "linkedin" || cubeKey === "tiktok" || cubeKey === "youtube_shorts" || cubeKey === "pinterest") {
    const metrics = getSocialMetrics(cubeKey, ov);
    const connected =
      cubeKey === "facebook"
        ? !!ov?.sources?.facebook?.connected
        : cubeKey === "instagram"
          ? !!ov?.sources?.instagram?.connected
          : cubeKey === "tiktok"
          ? !!ov?.sources?.tiktok?.connected
          : cubeKey === "youtube_shorts"
            ? !!ov?.sources?.youtube_shorts?.connected
            : cubeKey === "pinterest"
              ? !!ov?.sources?.pinterest?.connected
              : !!ov?.sources?.linkedin?.connected;

    return {
      channelType: "social" as const,
      channelKey: cubeKey,
      connected,
      opportunities: opp30,
      quality: qualityScore,
      capturedLeads,
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
      capturedLeads,
      metrics: {
        traffic: conversions,
        conversions,
        visibility,
      },
      provenance: provenance.map((entry) => ({ label: entry.label, value: entry.value })),
    };
  }

  if (cubeKey === "inrbadge") {
    return {
      channelType: "website" as const,
      channelKey: "site_web" as const,
      connected: true,
      opportunities: opp30,
      quality: qualityScore,
      capturedLeads,
      metrics: {
        traffic: 0,
        intent: 0,
        conversions: 0,
        engagement: 0,
        visibility: 0,
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
    capturedLeads,
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


function boosterToolAction(detail: string): CubeModel["action"] {
  return {
    key: "booster_publier",
    title: "Booster",
    detail,
    href: "/dashboard?action=publish",
    pill: "Booster",
    effort: { level: "faible", label: "Effort faible • 5 min" },
  };
}

function propulserToolAction(detail: string): CubeModel["action"] {
  return {
    key: "propulser_action",
    title: "Propulser",
    detail,
    href: "/dashboard/propulser",
    pill: "Propulser",
    effort: { level: "moyen", label: "Effort moyen • 10-15 min" },
  };
}

function fideliserToolAction(detail: string): CubeModel["action"] {
  return {
    key: "fideliser_action",
    title: "Fidéliser",
    detail,
    href: "/dashboard/fideliser",
    pill: "Fidéliser",
    effort: { level: "moyen", label: "Effort moyen • 10-15 min" },
  };
}

function actionFromDecision(baseAction: CubeModel["action"], decision: DecisionResult): CubeModel["action"] {

  const map: Record<DecisionResult["action"], CubeModel["action"]> = {
    publier: boosterToolAction(decision.reason),
    offrir: propulserToolAction(decision.reason),
    recolter: propulserToolAction(decision.reason),
    informer: fideliserToolAction(decision.reason),
    suivre: fideliserToolAction(decision.reason),
    enqueter: fideliserToolAction(decision.reason),
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

  if (cubeKey === "tiktok" && !ov?.sources?.tiktok?.connected) {
    return {
      key: "connect",
      title: "Connecter TikTok",
      detail: "Pour activer vos photos, vidéos et contenus courts.",
      href: "/dashboard?panel=tiktok",
      pill: "Connexion",
    };
  }

  if (cubeKey === "tiktok" && isTikTokStatsPermissionError(ov?.sources?.tiktok?.metrics)) {
    return {
      key: "connect",
      title: "Reconnecter TikTok",
      detail: "TikTok est connecté, mais les autorisations statistiques sont incomplètes. Reconnectez le canal pour autoriser les stats.",
      href: "/dashboard?panel=tiktok",
      pill: "Connexion",
    };
  }

  if (cubeKey === "youtube_shorts" && !ov?.sources?.youtube_shorts?.connected) {
    return {
      key: "connect",
      title: "Configurer YouTube",
      detail: "Pour activer votre canal vidéo.",
      href: "/dashboard?panel=youtube_shorts",
      pill: "Connexion",
    };
  }

  if (cubeKey === "pinterest" && !ov?.sources?.pinterest?.connected) {
    return {
      key: "connect",
      title: "Connecter Pinterest",
      detail: "Pour activer les épingles et la visibilité inspirationnelle.",
      href: "/dashboard?panel=pinterest",
      pill: "Connexion",
    };
  }

  const effortMap: Partial<Record<ActionKey, CubeModel["action"]["effort"] | undefined>> = {
    booster_publier: { level: "faible", label: "Effort faible • 5 min" },
    propulser_action: { level: "moyen", label: "Effort moyen • 10-15 min" },
    fideliser_action: { level: "moyen", label: "Effort moyen • 10-15 min" },
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
      return fideliserToolAction("Entretenez la relation avec vos clients satisfaits pour générer recommandations, avis et retours.");
    }
    return propulserToolAction("Lancez une action guidée pour mettre en avant une offre, une preuve ou une demande claire.");
  }

  if (cubeKey === "site_web") {
    if (qualityScore < 60) {
      return propulserToolAction("Lancez une action guidée pour renforcer le déclencheur commercial : offre, preuve ou demande d’avis.");
    }
    if (qualityScore >= 75 && opp30 > 4) {
      return fideliserToolAction("Créez un lien régulier avec vos contacts : information, suivi ou enquête.");
    }
    return boosterToolAction("Publiez une actualité locale pour relancer la visibilité et le trafic.");
  }

  if (cubeKey === "mails") {
    if (!ov?.sources?.mails?.connected) {
      return {
        key: "connect",
        title: "Configurer",
        detail: "Connectez une boîte d’envoi pour activer Fidéliser, Propulser et les mails simples.",
        href: "/dashboard?panel=mails",
        pill: "Connexion",
      };
    }
    return fideliserToolAction("Communiquez avec vos contacts depuis le canal Mails : information, suivi ou relance.");
  }

  if (cubeKey === "gmb") {
    const m = ov?.sources?.gmb?.metrics;
    const hasError = !!m?.error;
    if (hasError) {
      return boosterToolAction("Publiez 1 post Google Business pour activer le canal, même sans métriques détaillées.");
    }
    return propulserToolAction("Lancez une action Propulser : les avis et preuves de confiance sont le levier n°1 pour gagner des appels locaux.");
  }

  const socialLabel = cubeKey === "linkedin" ? "votre audience pro" : cubeKey === "pinterest" ? "votre audience inspiration" : (cubeKey === "tiktok" || cubeKey === "youtube_shorts") ? "votre audience vidéo" : "votre audience";
  return boosterToolAction(`1 publication simple/semaine suffit pour capter ${socialLabel}.`);
}

export function buildInsights(cubeKey: CubeKey, ov: Overview, qualityScore: number, decision?: DecisionResult) {
  const insights: string[] = [];

  if (cubeKey === "linkedin" && isLinkedInStatsPartial(ov)) {
    return [
      "Les données LinkedIn ne sont pas exploitables actuellement.",
      "Réessayez demain pour actualiser les statistiques détaillées.",
      "En attendant, publiez régulièrement pour entretenir votre visibilité professionnelle.",
    ];
  }

  if (cubeKey === "tiktok") {
    const connected = Boolean(ov?.sources?.tiktok?.connected);
    const metrics = ov?.sources?.tiktok?.metrics;
    const metricError = readMetricError(metrics);
    if (!connected) {
      return ["Canal TikTok non connecté.", "Connectez TikTok pour publier photos et vidéos depuis Booster."];
    }
    if (isTikTokStatsPermissionError(metrics)) {
      return [
        "Compte TikTok connecté, mais autorisations statistiques incomplètes.",
        "Reconnectez TikTok depuis Canaux pour autoriser la lecture des statistiques.",
        "La publication reste disponible depuis Booster pendant la mise à jour.",
      ];
    }
    if (metricError) {
      return [
        "Compte TikTok connecté.",
        "Les statistiques TikTok sont momentanément indisponibles, mais le canal reste prêt pour publier.",
        "Réactualisez iNrStats après vos prochaines publications publiques.",
      ];
    }
    if (!hasTikTokStatsSignal(metrics)) {
      return [
        "Compte TikTok connecté.",
        "Les premières statistiques seront enrichies dès que TikTok remontera des données publiques.",
        "Publiez une photo ou une vidéo depuis Booster pour activer le suivi.",
      ];
    }
  }

  if (decision) {
    const tool = decision.action === "publier"
      ? "Booster"
      : decision.action === "offrir" || decision.action === "recolter"
        ? "Propulser"
        : "Fidéliser";
    const toolLine = tool === "Booster"
      ? "Recommandation : utiliser Booster pour publier et activer le canal."
      : tool === "Propulser"
        ? "Recommandation : utiliser Propulser pour choisir une action business adaptée."
        : "Recommandation : utiliser Fidéliser pour entretenir et convertir la relation client.";
    return [toolLine, decision.reason].filter(Boolean).slice(0, 3);
  }

  if (cubeKey === "mails") {
    if (!ov?.sources?.mails?.connected) {
      return ["Canal mail non connecté.", "Connectez une boîte d’envoi pour activer Fidéliser, Propulser et les mails simples."];
    }
    const m = ov?.sources?.mails?.metrics;
    return [
      `Boîtes connectées : ${fmtInt(safeNum(m?.connectedCount))}/4.`,
      `${fmtInt(safeNum(m?.contactsCrm))} contacts CRM exploitables pour vos campagnes.`,
      safeNum(m?.campagnes30) > 0 ? "Des campagnes sont déjà visibles sur les 30 derniers jours." : "Canal prêt : lancez une première campagne Fidéliser ou Propulser.",
    ];
  }

  if (cubeKey === "facebook") {
    if (!ov?.sources?.facebook?.connected) {
      return ["Canal non connecté : aucune lecture possible.", "Connectez Facebook pour activer la visibilité sociale."];
    }
    return ["Canal social prêt à être activé.", "Misez sur la régularité plutôt que sur le volume."];
  }

  if (cubeKey === "tiktok") {
    if (!ov?.sources?.tiktok?.connected) {
      return ["Canal non connecté : aucune lecture possible.", "Connectez TikTok pour préparer vos publications photos et vidéos."];
    }
    return ["TikTok est connecté et mesurable.", "Publiez régulièrement des photos ou vidéos courtes pour développer votre audience."];
  }

  if (cubeKey === "youtube_shorts") {
    if (!ov?.sources?.youtube_shorts?.connected) {
      return ["Canal YouTube non connecté.", "Configurez votre chaîne pour préparer vos publications vidéo."];
    }
    return ["YouTube est connecté.", "Publiez régulièrement des vidéos courtes ou longues pour développer votre audience."];
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

function formatPercent(value: number, digits = 0) {
  const safe = Number.isFinite(value) ? value : 0;
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(safe)} %`;
}

function formatSecondsToLabel(value: number) {
  const totalSeconds = Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
  if (totalSeconds <= 0) return "0 s";
  if (totalSeconds < 60) return `${totalSeconds} s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes} min ${seconds}s` : `${minutes} min`;
}

function metricKeyExists(metrics: any, keys: string[]) {
  const totals = safeObj(safeObj(metrics).totals);
  return keys.some((key) => Object.prototype.hasOwnProperty.call(totals, key));
}

function readMetricError(metrics: any) {
  const error = safeObj(metrics).error;
  return typeof error === "string" ? error.trim() : "";
}

function isTikTokStatsPermissionError(metrics: any) {
  const m = safeObj(metrics);
  const raw = safeObj(m.raw);
  const videoList = safeObj(raw.videoList);
  const nestedVideoListError = typeof videoList.error === "string" ? videoList.error : "";
  if (m.needs_reconnect === true) return true;
  const text = `${readMetricError(metrics)} ${typeof m.raw_error === "string" ? m.raw_error : ""} ${nestedVideoListError}`.toLowerCase();
  return Boolean(text.trim()) && (
    text.includes("scope") ||
    text.includes("permission") ||
    text.includes("autorisation") ||
    text.includes("unauthorized") ||
    text.includes("forbidden") ||
    text.includes("access token") ||
    text.includes("reconnect") ||
    text.includes("reconnecte")
  );
}

function hasTikTokStatsSignal(metrics: any) {
  const m = safeObj(metrics);
  const totals = safeObj(m.totals);
  if (!Object.keys(totals).length) return false;
  return [
    "followers",
    "following",
    "likes",
    "likes_total",
    "video_count",
    "videos_public",
    "postsPublished",
    "postsPublishedLocal",
    "inrcy_posts",
    "inrcy_video_posts",
    "inrcy_photo_posts",
    "inrcy_photos",
    "video_views",
    "views",
    "engagements",
    "likes_period",
    "comments",
    "shares",
  ].some((key) => safeNum(totals[key]) > 0 || Object.prototype.hasOwnProperty.call(totals, key));
}


const INRCY_ACTIVITY_CUBE_KEYS = new Set<CubeKey>(["site_inrcy", "site_web", "gmb", "facebook", "instagram", "linkedin", "tiktok", "youtube_shorts", "pinterest"]);

function normalizeInrcyActivityCount(value: any): InrcyActivityCount {
  return {
    week: Math.max(0, Math.round(safeNum(value?.week))),
    month: Math.max(0, Math.round(safeNum(value?.month))),
    total: Math.max(0, Math.round(safeNum(value?.total))),
  };
}

function emptyInrcyActivityStats(): InrcyActivityStats {
  const empty = { week: 0, month: 0, total: 0 };
  return {
    publications: { ...empty },
    photos: { ...empty },
    videos: { ...empty },
  };
}

function buildInrcyActivityStats(cubeKey: CubeKey, ov: Overview): InrcyActivityStats | null {
  if (!INRCY_ACTIVITY_CUBE_KEYS.has(cubeKey)) return null;
  const raw = (ov as any)?.inrcyActivity?.[cubeKey];
  if (!raw || typeof raw !== "object") return emptyInrcyActivityStats();
  return {
    publications: normalizeInrcyActivityCount((raw as any).publications),
    photos: normalizeInrcyActivityCount((raw as any).photos),
    videos: normalizeInrcyActivityCount((raw as any).videos),
  };
}

function tikTokMetricItems(metrics: any, kind: "visibility" | "actions"): CubeMetricItem[] {
  const totals = safeObj(safeObj(metrics).totals);
  const videoViews = safeNum(totals.video_views) || safeNum(totals.views);
  const followers = safeNum(totals.followers);
  const likesTotal = safeNum(totals.likes_total);
  const videoCount = safeNum(totals.video_count) || safeNum(totals.videos_public);
  const inrcyPosts = safeNum(totals.inrcy_posts) || safeNum(totals.postsPublishedLocal);
  const likes = safeNum(totals.likes) || safeNum(totals.likes_period);
  const comments = safeNum(totals.comments);
  const shares = safeNum(totals.shares);
  const saves = safeNum(totals.saves);
  const posts = Math.max(safeNum(totals.postsPublished), inrcyPosts, videoCount);
  const interactions = safeNum(totals.engagements) || likes + comments + shares + saves;

  if (kind === "visibility") {
    return [
      { label: "Vues vidéo", value: fmtInt(videoViews) },
      { label: "Abonnés", value: fmtInt(followers) },
      { label: "J’aime reçus", value: fmtInt(likesTotal) },
      { label: "Vidéos profil", value: fmtInt(videoCount) },
    ];
  }

  return [
    { label: "Interactions", value: fmtInt(interactions), subValue: `${fmtInt(posts)} post${posts > 1 ? "s" : ""} suivi${posts > 1 ? "s" : ""}` },
    { label: "J’aime", value: fmtInt(likes) },
    { label: "Commentaires", value: fmtInt(comments) },
    { label: "Partages", value: fmtInt(shares) },
  ];
}

function sumMetricValues(metrics: any, keys: string[]) {
  const totals = safeObj(safeObj(metrics).totals);
  return keys.reduce((sum, key) => sum + safeNum(totals[key]), 0);
}

function bestMetricValue(metrics: any, keys: string[]) {
  const totals = safeObj(safeObj(metrics).totals);
  for (const key of keys) {
    const value = safeNum(totals[key]);
    if (value > 0) return value;
  }
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(totals, key)) return safeNum(totals[key]);
  }
  return 0;
}

function latestDailyMetricValue(metrics: any, key: string) {
  const daily = Array.isArray(metrics?.daily) ? metrics.daily : [];
  for (let index = daily.length - 1; index >= 0; index -= 1) {
    const value = safeNum(daily[index]?.values?.[key], NaN);
    if (Number.isFinite(value)) return value;
  }
  return safeNum(metrics?.totals?.[key]);
}

function pushNumberMetric(
  items: CubeMetricItem[],
  label: string,
  value: number,
  options: { available?: boolean; keepZero?: boolean; formatter?: (value: number) => string } = {},
) {
  const n = Number.isFinite(value) ? value : 0;
  const available = options.available ?? n > 0;
  if (!available) return;
  if (!options.keepZero && n <= 0) return;
  items.push({ label, value: options.formatter ? options.formatter(n) : fmtInt(n) });
}

function firstFour(items: CubeMetricItem[]) {
  return items.slice(0, 4);
}

function isWebsiteConnected(cubeKey: CubeKey, ov: Overview) {
  if (cubeKey === "site_inrcy") {
    return !!ov?.sources?.site_inrcy?.connected?.ga4 || !!ov?.sources?.site_inrcy?.connected?.gsc;
  }
  if (cubeKey === "site_web") {
    return !!ov?.sources?.site_web?.connected?.ga4 || !!ov?.sources?.site_web?.connected?.gsc;
  }
  return false;
}

function buildVisibilityStats(cubeKey: CubeKey, ov: Overview): CubeMetricItem[] {
  const items: CubeMetricItem[] = [];

  if (cubeKey === "gmb") {
    if (!ov?.sources?.gmb?.connected) return [];
    const metrics = ov?.sources?.gmb?.metrics;
    const totals = getGmbTotals(metrics);
    pushNumberMetric(items, "Impressions", totals.impressions, { available: !!metrics && totals.impressions > 0 });
    pushNumberMetric(items, "Vues Maps", totals.mapsImpressions, { available: !!metrics && totals.mapsImpressions > 0 });
    pushNumberMetric(items, "Vues Search", totals.searchImpressions, { available: !!metrics && totals.searchImpressions > 0 });
    pushNumberMetric(items, "Vues fiche", safeNum(metrics?.totals?.views) || safeNum(metrics?.totals?.BUSINESS_PROFILE_VIEWS), {
      available: metricKeyExists(metrics, ["views", "BUSINESS_PROFILE_VIEWS"]),
    });
    return firstFour(items);
  }

  if (cubeKey === "facebook") {
    if (!ov?.sources?.facebook?.connected) return [];
    const m = ov?.sources?.facebook?.metrics;
    const impressions = sumMetricValues(m, ["page_impressions", "post_impressions_sum", "impressions"]);
    const reach = bestMetricValue(m, ["page_impressions_unique", "reach", "post_impressions_unique_sum"]);
    const audience = Math.max(safeNum(m?.totals?.fan_count), safeNum(m?.totals?.followers_count));
    const pageViews = safeNum(m?.totals?.page_views_total);
    pushNumberMetric(items, "Impressions", impressions, { available: metricKeyExists(m, ["page_impressions", "post_impressions_sum", "impressions"]) });
    pushNumberMetric(items, "Portée", reach, { available: metricKeyExists(m, ["page_impressions_unique", "reach", "post_impressions_unique_sum"]) });
    pushNumberMetric(items, "Audience", audience, { available: metricKeyExists(m, ["fan_count", "followers_count"]) });
    pushNumberMetric(items, "Vues page", pageViews, { available: metricKeyExists(m, ["page_views_total"]) });
    return firstFour(items);
  }

  if (cubeKey === "instagram") {
    if (!ov?.sources?.instagram?.connected) return [];
    const m = ov?.sources?.instagram?.metrics;
    const followers = latestDailyMetricValue(m, "follower_count");
    pushNumberMetric(items, "Portée", safeNum(m?.totals?.reach), { available: metricKeyExists(m, ["reach"]) });
    pushNumberMetric(items, "Impressions", safeNum(m?.totals?.impressions), { available: metricKeyExists(m, ["impressions"]) });
    pushNumberMetric(items, "Vues profil", safeNum(m?.totals?.profile_views), { available: metricKeyExists(m, ["profile_views"]) });
    pushNumberMetric(items, "Abonnés", followers, { available: metricKeyExists(m, ["follower_count"]) });
    return firstFour(items);
  }

  if (cubeKey === "tiktok") {
    if (!ov?.sources?.tiktok?.connected) return [];
    return tikTokMetricItems(ov?.sources?.tiktok?.metrics, "visibility");
  }

  if (cubeKey === "youtube_shorts") {
    if (!ov?.sources?.youtube_shorts?.connected) return [];
    const m = ov?.sources?.youtube_shorts?.metrics;
    pushNumberMetric(items, "Vues vidéo", safeNum(m?.totals?.video_views) || safeNum(m?.totals?.views), { available: metricKeyExists(m, ["video_views", "views"]), keepZero: true });
    pushNumberMetric(items, "Vues chaîne", safeNum(m?.totals?.channel_views_total), { available: metricKeyExists(m, ["channel_views_total"]), keepZero: true });
    pushNumberMetric(items, "Abonnés", safeNum(m?.totals?.subscribers) || safeNum(m?.totals?.followers), { available: metricKeyExists(m, ["subscribers", "followers"]), keepZero: true });
    pushNumberMetric(items, "Vidéos chaîne", safeNum(m?.totals?.video_count) || safeNum(m?.totals?.shorts_count), { available: metricKeyExists(m, ["video_count", "shorts_count"]), keepZero: true });
    return firstFour(items);
  }

  if (cubeKey === "mails") {
    if (!ov?.sources?.mails?.connected) return [];
    const m = ov?.sources?.mails?.metrics;
    pushNumberMetric(items, "Boîtes", safeNum(m?.connectedCount), { formatter: (value) => `${fmtInt(value)}/4` });
    pushNumberMetric(items, "Contacts email", safeNum(m?.contactsEmail) || safeNum(m?.contactsCrm));
    pushNumberMetric(items, "Campagnes 30j", safeNum(m?.campagnes30));
    pushNumberMetric(items, "Destinataires", safeNum(m?.destinataires30));
    return firstFour(items);
  }

  if (cubeKey === "linkedin") {
    if (!ov?.sources?.linkedin?.connected || isLinkedInStatsPartial(ov)) return [];
    const m = ov?.sources?.linkedin?.metrics;
    const impressions = bestMetricValue(m, ["impressionCount", "impressions"]);
    const uniqueImpressions = safeNum(m?.totals?.uniqueImpressionsCount);
    const pageViews = bestMetricValue(m, ["pageViews", "profileViews"]);
    const followers = bestMetricValue(m, ["followers", "followerCount", "memberFollowersCount"]);
    pushNumberMetric(items, "Impressions", impressions, { available: metricKeyExists(m, ["impressionCount", "impressions"]) });
    pushNumberMetric(items, "Impr. uniques", uniqueImpressions, { available: metricKeyExists(m, ["uniqueImpressionsCount"]) });
    pushNumberMetric(items, "Vues page", pageViews, { available: metricKeyExists(m, ["pageViews", "profileViews"]) });
    pushNumberMetric(items, "Abonnés", followers, { available: metricKeyExists(m, ["followers", "followerCount", "memberFollowersCount"]) });
    return firstFour(items);
  }

  if (!isWebsiteConnected(cubeKey, ov)) return [];
  const totals = ov?.totals || ({} as any);
  const gscConnected = cubeKey === "site_inrcy" ? !!ov.sources?.site_inrcy?.connected?.gsc : !!ov.sources?.site_web?.connected?.gsc;
  const ga4Connected = cubeKey === "site_inrcy" ? !!ov.sources?.site_inrcy?.connected?.ga4 : !!ov.sources?.site_web?.connected?.ga4;
  if (gscConnected) {
    pushNumberMetric(items, "Impressions Google", safeNum(totals.impressions));
    pushNumberMetric(items, "Clics Google", safeNum(totals.clicks));
  }
  if (ga4Connected) {
    pushNumberMetric(items, "Sessions", safeNum(totals.sessions));
    pushNumberMetric(items, "Pages vues", safeNum(totals.pageviews));
  }
  if (items.length < 4 && gscConnected && safeNum(totals.ctr) > 0) {
    pushNumberMetric(items, "CTR Google", safeNum(totals.ctr) * 100, { formatter: (value) => formatPercent(value) });
  }
  return firstFour(items);
}

function buildActionStats(cubeKey: CubeKey, ov: Overview): CubeMetricItem[] {
  const items: CubeMetricItem[] = [];

  if (cubeKey === "gmb") {
    if (!ov?.sources?.gmb?.connected) return [];
    const metrics = ov?.sources?.gmb?.metrics;
    const totals = getGmbTotals(metrics);
    const conversations = safeNum(metrics?.totals?.conversations) || safeNum(metrics?.totals?.BUSINESS_CONVERSATIONS) || gmbMetricSeriesTotal(metrics, ["BUSINESS_CONVERSATIONS"]);
    pushNumberMetric(items, "Appels", totals.callClicks, { available: !!metrics && totals.callClicks > 0 });
    pushNumberMetric(items, "Itinéraires", totals.directionRequests, { available: !!metrics && totals.directionRequests > 0 });
    pushNumberMetric(items, "Clics site", totals.websiteClicks, { available: !!metrics && totals.websiteClicks > 0 });
    pushNumberMetric(items, "Messages", conversations, { available: !!metrics && conversations > 0 });
    return firstFour(items);
  }

  if (cubeKey === "facebook") {
    if (!ov?.sources?.facebook?.connected) return [];
    const m = ov?.sources?.facebook?.metrics;
    const interactions =
      bestMetricValue(m, ["page_post_engagements", "page_engaged_users", "post_engaged_users_sum"]) ||
      sumMetricValues(m, ["reactions", "comments", "shares"]);
    pushNumberMetric(items, "Interactions", interactions, {
      available: metricKeyExists(m, ["page_post_engagements", "page_engaged_users", "post_engaged_users_sum", "reactions", "comments", "shares"]),
    });
    pushNumberMetric(items, "Clics site", safeNum(m?.totals?.page_website_clicks_logged_in_unique), {
      available: metricKeyExists(m, ["page_website_clicks_logged_in_unique"]),
    });
    pushNumberMetric(items, "Appels", safeNum(m?.totals?.page_call_phone_clicks_logged_in_unique), {
      available: metricKeyExists(m, ["page_call_phone_clicks_logged_in_unique"]),
    });
    pushNumberMetric(items, "Itinéraires", safeNum(m?.totals?.page_get_directions_clicks_logged_in_unique), {
      available: metricKeyExists(m, ["page_get_directions_clicks_logged_in_unique"]),
    });
    return firstFour(items);
  }

  if (cubeKey === "instagram") {
    if (!ov?.sources?.instagram?.connected) return [];
    const m = ov?.sources?.instagram?.metrics;
    const linkClicks = sumMetricValues(m, ["profile_links_taps", "website_clicks"]);
    const interactions = bestMetricValue(m, ["total_interactions", "accounts_engaged"]) || sumMetricValues(m, ["likes", "comments", "shares", "replies", "saves"]);
    const messages = sumMetricValues(m, ["text_message_clicks", "replies"]);
    const calls = safeNum(m?.totals?.phone_call_clicks);
    const directions = safeNum(m?.totals?.get_directions_clicks) + safeNum(m?.totals?.get_direction_clicks);
    pushNumberMetric(items, "Clics lien", linkClicks, { available: metricKeyExists(m, ["profile_links_taps", "website_clicks"]) });
    pushNumberMetric(items, "Interactions", interactions, {
      available: metricKeyExists(m, ["total_interactions", "accounts_engaged", "likes", "comments", "shares", "replies", "saves"]),
    });
    pushNumberMetric(items, "Messages", messages, { available: metricKeyExists(m, ["text_message_clicks", "replies"]) });
    pushNumberMetric(items, "Appels", calls, { available: metricKeyExists(m, ["phone_call_clicks"]) });
    pushNumberMetric(items, "Itinéraires", directions, { available: metricKeyExists(m, ["get_directions_clicks", "get_direction_clicks"]) });
    return firstFour(items);
  }

  if (cubeKey === "tiktok") {
    if (!ov?.sources?.tiktok?.connected) return [];
    return tikTokMetricItems(ov?.sources?.tiktok?.metrics, "actions");
  }

  if (cubeKey === "youtube_shorts") {
    if (!ov?.sources?.youtube_shorts?.connected) return [];
    const m = ov?.sources?.youtube_shorts?.metrics;
    const interactions = sumMetricValues(m, ["engagements", "likes", "comments", "shares", "saves"]);
    pushNumberMetric(items, "Interactions", interactions, { available: metricKeyExists(m, ["engagements", "likes", "comments", "shares", "saves"]) });
    pushNumberMetric(items, "J’aime", safeNum(m?.totals?.likes), { available: metricKeyExists(m, ["likes"]) });
    pushNumberMetric(items, "Commentaires", safeNum(m?.totals?.comments), { available: metricKeyExists(m, ["comments"]) });
    pushNumberMetric(items, "Partages", safeNum(m?.totals?.shares), { available: metricKeyExists(m, ["shares"]) });
    pushNumberMetric(items, "Vidéos", safeNum(m?.totals?.postsPublished) || safeNum(m?.totals?.video_count), { available: metricKeyExists(m, ["postsPublished", "video_count"]) });
    return firstFour(items);
  }

  if (cubeKey === "mails") {
    if (!ov?.sources?.mails?.connected) return [];
    const m = ov?.sources?.mails?.metrics;
    pushNumberMetric(items, "Boîtes", safeNum(m?.connectedCount), { formatter: (value) => `${fmtInt(value)}/4` });
    pushNumberMetric(items, "Contacts email", safeNum(m?.contactsEmail) || safeNum(m?.contactsCrm));
    pushNumberMetric(items, "Campagnes 30j", safeNum(m?.campagnes30));
    pushNumberMetric(items, "Destinataires", safeNum(m?.destinataires30));
    return firstFour(items);
  }

  if (cubeKey === "linkedin") {
    if (!ov?.sources?.linkedin?.connected || isLinkedInStatsPartial(ov)) return [];
    const m = ov?.sources?.linkedin?.metrics;
    const clicks = sumMetricValues(m, ["clickCount", "clicks", "linkClickCount", "pageClicks", "premiumCtaClickCount"]);
    const reactions = bestMetricValue(m, ["reactionCount", "likeCount", "likes"]);
    const comments = bestMetricValue(m, ["commentCount", "comments"]);
    const shares = bestMetricValue(m, ["shareCount", "shares"]);
    pushNumberMetric(items, "Clics", clicks, { available: metricKeyExists(m, ["clickCount", "clicks", "linkClickCount", "pageClicks", "premiumCtaClickCount"]) });
    pushNumberMetric(items, "Réactions", reactions, { available: metricKeyExists(m, ["reactionCount", "likeCount", "likes"]) });
    pushNumberMetric(items, "Commentaires", comments, { available: metricKeyExists(m, ["commentCount", "comments"]) });
    pushNumberMetric(items, "Partages", shares, { available: metricKeyExists(m, ["shareCount", "shares"]) });
    return firstFour(items);
  }

  if (!isWebsiteConnected(cubeKey, ov)) return [];
  const totals = ov?.totals || ({} as any);
  const queries = Array.isArray(ov.topQueries) ? ov.topQueries : [];
  const topPages = Array.isArray(ov.topPages) ? ov.topPages : [];
  const intentQueryCount = queries.filter((q) => isIntentQuery(q.query) && (safeNum(q.clicks) > 0 || safeNum(q.impressions) > 0)).length;
  const contactViews = topPages.filter((page) => pageKind(page.path) === "contact").reduce((sum, page) => sum + safeNum(page.views), 0);
  pushNumberMetric(items, "Pages contact", contactViews);
  pushNumberMetric(items, "Requêtes intention", intentQueryCount);
  pushNumberMetric(items, "Engagement", safeNum(totals.engagementRate) * 100, { formatter: (value) => formatPercent(value) });
  pushNumberMetric(items, "Durée moy.", safeNum(totals.avgSessionDuration), { formatter: (value) => formatSecondsToLabel(value) });
  return firstFour(items);
}

export function buildCubeModel(
  key: CubeKey,
  title: string,
  subtitle: string,
  period: Period,
  state: CubeState | undefined | null,
  summaryOppByCube: Record<CubeKey, number>,
): CubeModel {
  const safeState: CubeState = state && typeof state === "object"
    ? state
    : { ov: null, loading: false, error: undefined, capturedLeads: { week: 0, month: 0 } };
  const hasRealOverview = !!safeState.ov;
  const ov = safeState.ov ||
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
        tiktok: { connected: false },
        youtube_shorts: { connected: false },
        pinterest: { connected: false },
        mails: { connected: false },
      },
    } as Overview);

  const accountLabel = key === "tiktok" ? "" : String(ov?.identities?.[key]?.label || ov?.identities?.[key]?.url || "").trim();
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
              : key === "mails"
                ? { main: !!ov.sources?.mails?.connected }
                : key === "tiktok"
                  ? { main: !!ov.sources?.tiktok?.connected }
                  : key === "youtube_shorts"
                    ? { main: !!ov.sources?.youtube_shorts?.connected }
                    : key === "pinterest"
                      ? { main: !!ov.sources?.pinterest?.connected }
                      : { main: !!ov.sources?.linkedin?.connected };

  const provenance = buildProvenance(key, ov);
  const computedOpp30 = computeOpportunity30(key, ov);
  const linkedInPartial = key === "linkedin" && isLinkedInStatsPartial(ov);
  const summaryOpp30 = summaryOppByCube[key];
  const opp30 = linkedInPartial && computedOpp30 > safeNum(summaryOpp30)
    ? computedOpp30
    : summaryOpp30 ?? computedOpp30;

  const q = computeQuality(key, ov);
  const capturedLeads: CapturedLeads = {
    week: Math.max(0, Math.round(safeNum(safeState.capturedLeads?.week))),
    month: Math.max(0, Math.round(safeNum(safeState.capturedLeads?.month))),
  };
  let action = recommendAction(key, ov, q.score);
  let decision: DecisionResult | undefined;

  if (key !== "mails" && key !== "inrbadge" && action.key !== "connect" && action.key !== "loading") {
    decision = decideAction(getDecisionInput(key, ov, q.score, opp30, provenance, capturedLeads));
    action = actionFromDecision(action, decision);
  }

  if (linkedInPartial && action.key !== "connect" && action.key !== "loading") {
    action = {
      ...action,
      key: "booster_publier",
      title: "Booster",
      detail: "Données LinkedIn non exploitables actuellement. Publiez depuis Booster puis réessayez demain.",
      href: "/dashboard?action=publish",
      pill: "Booster",
    };
  }

  const insights = buildInsights(key, ov, q.score, decision);

  if (safeState.loading && !hasRealOverview) {
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
    loading: !!safeState.loading,
    error: safeState.error,
    connections,
    provenance,
    opportunity30: opp30,
    opportunityLabel,
    capturedLeads,
    capturedLeadsUnavailable: linkedInPartial,
    capturedLeadsHint: linkedInPartial
      ? "Données LinkedIn non exploitables actuellement. Réessayez demain."
      : "Demandes réelles mesurées sur ce canal.",
    provenanceHint:
      key === "linkedin" && (linkedInPartial || provenance.every((entry) => safeNum(entry.value) <= 0))
        ? "Données non exploitables actuellement."
        : key === "tiktok" && ov?.sources?.tiktok?.connected && isTikTokStatsPermissionError(ov?.sources?.tiktok?.metrics)
          ? "Autorisations statistiques TikTok incomplètes : reconnectez le canal."
          : key === "tiktok" && ov?.sources?.tiktok?.connected && readMetricError(ov?.sources?.tiktok?.metrics)
            ? "Statistiques TikTok momentanément indisponibles."
            : key === "tiktok" && ov?.sources?.tiktok?.connected && !hasTikTokStatsSignal(ov?.sources?.tiktok?.metrics)
              ? "Compte connecté : données en attente de remontée par TikTok."
              : key === "gmb" && provenance.length === 1 && provenance[0]?.label === "Visibilité locale"
                ? "La répartition Maps / Search n’est pas remontée par Google sur cette période."
                : undefined,
    visibilityStats: buildVisibilityStats(key, ov),
    actionStats: buildActionStats(key, ov),
    inrcyActivityStats: buildInrcyActivityStats(key, ov),
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
    inrbadge: !!models.find((m) => m.key === "inrbadge")?.connections.main,
    site_inrcy: !!models.find((m) => m.key === "site_inrcy")?.connections.ga4 || !!models.find((m) => m.key === "site_inrcy")?.connections.gsc,
    site_web: !!models.find((m) => m.key === "site_web")?.connections.ga4 || !!models.find((m) => m.key === "site_web")?.connections.gsc,
    gmb: !!models.find((m) => m.key === "gmb")?.connections.main,
    facebook: !!models.find((m) => m.key === "facebook")?.connections.main,
    instagram: !!models.find((m) => m.key === "instagram")?.connections.main,
    linkedin: !!models.find((m) => m.key === "linkedin")?.connections.main,
    mails: !!models.find((m) => m.key === "mails")?.connections.main,
    tiktok: !!models.find((m) => m.key === "tiktok")?.connections.main,
    youtube_shorts: !!models.find((m) => m.key === "youtube_shorts")?.connections.main,
    pinterest: !!models.find((m) => m.key === "pinterest")?.connections.main,
  };

  const connectedCopy: Record<CubeKey, { label: string; kicker: string; motive: string; badge: string }> = {
    inrbadge: {
      label: "Partager le badge",
      kicker: "Votre hub de conversion",
      motive: "iNr’Badge centralise vos canaux et transforme vos visiteurs en actions utiles.",
      badge: "Booster",
    },
    facebook: {
      label: "Utiliser Booster",
      kicker: "Relancez votre visibilité locale",
      motive: "Booster permet de publier rapidement pour remettre votre activité en mouvement.",
      badge: "Booster",
    },
    instagram: {
      label: "Utiliser Booster",
      kicker: "Réactivez votre visibilité de marque",
      motive: "Booster vous aide à publier régulièrement pour transformer l’attention en contacts.",
      badge: "Booster",
    },
    linkedin: {
      label: "Utiliser Booster",
      kicker: "Renforcez votre crédibilité pro",
      motive: "Booster vous aide à prendre la parole simplement sur LinkedIn.",
      badge: "Booster",
    },
    mails: {
      label: "Utiliser Fidéliser",
      kicker: "Animez votre base par mail",
      motive: "Mails analyse vos usages Fidéliser, Propulser et mails simples pour transformer votre CRM en actions concrètes.",
      badge: "Fidéliser",
    },
    tiktok: {
      label: "Utiliser Booster",
      kicker: "Activez vos contenus courts",
      motive: "Booster vous aide à publier photos et vidéos TikTok depuis le même flux.",
      badge: "Booster",
    },
    youtube_shorts: {
      label: "Utiliser Booster",
      kicker: "Activez vos vidéos YouTube",
      motive: "YouTube transforme vos vidéos courtes ou longues en visibilité durable depuis le même flux iNrCy.",
      badge: "Booster",
    },
    pinterest: {
      label: "Utiliser Booster",
      kicker: "Activez votre visibilité inspiration",
      motive: "Booster vous aide à publier des visuels Pinterest depuis le même flux de communication.",
      badge: "Booster",
    },
    site_web: {
      label: "Utiliser Propulser",
      kicker: "Transformez plus de visiteurs en prospects",
      motive: "Propulser vous propose une action business claire : valoriser, récolter ou offrir.",
      badge: "Propulser",
    },
    site_inrcy: {
      label: "Utiliser Propulser",
      kicker: "Accélérez une machine déjà lancée",
      motive: "Propulser aide à transformer le potentiel visible en action commerciale concrète.",
      badge: "Propulser",
    },
    gmb: {
      label: "Utiliser Propulser",
      kicker: "Débloquez un potentiel local immédiat",
      motive: "Propulser permet de valoriser vos preuves, récolter des avis ou pousser une offre locale.",
      badge: "Propulser",
    },
  };

  const disconnectedCopy: Record<CubeKey, { label: string; kicker: string; motive: string; badge: string }> = {
    inrbadge: {
      label: "Configurer iNr’Badge",
      kicker: "Activez votre fiche publique",
      motive: "Complétez iNr’Badge pour centraliser vos canaux, vos actions rapides et votre QR Code.",
      badge: "Connexion",
    },
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
    mails: {
      label: "Connecter une boîte mail",
      kicker: "Activez vos campagnes",
      motive: "Connectez au moins une boîte d’envoi pour utiliser Fidéliser, Propulser et les mails simples.",
      badge: "Connexion",
    },
    tiktok: {
      label: "Connecter TikTok",
      kicker: "Préparez le canal vidéo/photo",
      motive: "Reliez TikTok pour publier photos et vidéos, suivre le profil et lire les vidéos publiques dans iNrStats.",
      badge: "Connexion",
    },
    youtube_shorts: {
      label: "Configurer YouTube",
      kicker: "Préparez le canal vidéo",
      motive: "Ajoutez votre chaîne YouTube pour publier vos vidéos depuis iNrCy.",
      badge: "Connexion",
    },
    pinterest: {
      label: "Connecter Pinterest",
      kicker: "Activez le canal inspiration",
      motive: "Reliez Pinterest pour publier vos visuels et renforcer votre découverte par l’image.",
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
    { key: "inrbadge" as CubeKey, opportunities: centralByCube.inrbadge, revenue: computedEstimatedByCube.inrbadge || summaryEstimatedByCube.inrbadge },
    { key: "site_inrcy" as CubeKey, opportunities: centralByCube.site_inrcy, revenue: computedEstimatedByCube.site_inrcy || summaryEstimatedByCube.site_inrcy },
    { key: "site_web" as CubeKey, opportunities: centralByCube.site_web, revenue: computedEstimatedByCube.site_web || summaryEstimatedByCube.site_web },
    { key: "gmb" as CubeKey, opportunities: centralByCube.gmb, revenue: computedEstimatedByCube.gmb || summaryEstimatedByCube.gmb },
    { key: "facebook" as CubeKey, opportunities: centralByCube.facebook, revenue: computedEstimatedByCube.facebook || summaryEstimatedByCube.facebook },
    { key: "instagram" as CubeKey, opportunities: centralByCube.instagram, revenue: computedEstimatedByCube.instagram || summaryEstimatedByCube.instagram },
    { key: "linkedin" as CubeKey, opportunities: centralByCube.linkedin, revenue: computedEstimatedByCube.linkedin || summaryEstimatedByCube.linkedin },
    { key: "mails" as CubeKey, opportunities: centralByCube.mails, revenue: computedEstimatedByCube.mails || summaryEstimatedByCube.mails },
    { key: "tiktok" as CubeKey, opportunities: centralByCube.tiktok, revenue: computedEstimatedByCube.tiktok || summaryEstimatedByCube.tiktok },
    { key: "youtube_shorts" as CubeKey, opportunities: centralByCube.youtube_shorts, revenue: computedEstimatedByCube.youtube_shorts || summaryEstimatedByCube.youtube_shorts },
    { key: "pinterest" as CubeKey, opportunities: centralByCube.pinterest, revenue: computedEstimatedByCube.pinterest || summaryEstimatedByCube.pinterest },
  ].map((item) => ({
    ...item,
    ...(connectionStateByCube[item.key] ? connectedCopy[item.key] : disconnectedCopy[item.key]),
    connected: connectionStateByCube[item.key],
  }));
}
