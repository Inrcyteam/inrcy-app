import { NextResponse } from "next/server";
import { getChannelConnectionStates, type ChannelStates } from "@/lib/channelConnectionState";
import { saveDailyMetricsSummary, type SnapshotDetail } from "@/lib/dailyMetricsSummary";
import { buildMetricsSummary } from "@/lib/metrics/summary";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAppUrl } from "@/lib/stripeRest";

export const runtime = "nodejs";


type CubeKey = "site_inrcy" | "site_web" | "facebook" | "instagram" | "linkedin" | "gmb";

type Overview = {
  days: number;
  business?: { sectorCategory?: string | null; profession?: string | null };
  totals?: {
    pageviews?: number;
    clicks?: number;
    sessions?: number;
    impressions?: number;
    engagementRate?: number;
    avgSessionDuration?: number;
  };
  topPages?: Array<{ path: string; views: number }>;
  topQueries?: Array<{ query: string; clicks: number }>;
  channels?: Array<{ channel?: string; sessions?: number; key?: string; value?: number }>;
  sources?: Record<string, { connected?: boolean | Record<string, boolean>; metrics?: Record<string, unknown> | null }>;
};

const INCLUDE_BY_CUBE: Record<CubeKey, string> = {
  site_inrcy: "site_inrcy_ga4,site_inrcy_gsc",
  site_web: "site_web_ga4,site_web_gsc",
  gmb: "gmb",
  facebook: "facebook",
  instagram: "instagram",
  linkedin: "linkedin",
};

const DEFAULT_TOTAL_SHARDS = 12;
const DEFAULT_CONCURRENCY = 2;
const LOCK_BASE_KEY = 90421001;

function safeNum(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : 0;
}
function safeObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function clamp(n: number, min: number, max: number) { return Math.min(max, Math.max(min, n)); }
type GscOpportunitySectorConfig = {
  impressionRef: number; clickRef: number; intentRef: number; ctrTarget: number; bonusWeight: number; directIntentFactor: number; visibilityWeight: number; trafficWeight: number; intentWeight: number; ctrWeight: number; minImpressionsForCtr: number;
};
const DEFAULT_GSC_OPPORTUNITY_CONFIG: GscOpportunitySectorConfig = {
  impressionRef: 120, clickRef: 8, intentRef: 3, ctrTarget: 0.05, bonusWeight: 0.35, directIntentFactor: 0.10, visibilityWeight: 0.20, trafficWeight: 0.20, intentWeight: 0.40, ctrWeight: 0.20, minImpressionsForCtr: 150,
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
  const overrides = GSC_OPPORTUNITY_CONFIG_BY_SECTOR[String(sectorCategory || '').trim()] || {};
  return { ...DEFAULT_GSC_OPPORTUNITY_CONFIG, ...overrides };
}
function roundNonNeg(n: number) { return Math.max(0, Math.round(n)); }
function getTotalMetric(metrics: unknown, keys: string[]): number {
  const m = safeObj(metrics);
  const totals = safeObj(m.totals);
  for (const k of keys) { const n = safeNum(totals[k]); if (n) return n; }
  for (const k of keys) { const n = safeNum(m[k]); if (n) return n; }
  return 0;
}
function estimateEngagedSessions(ov: Overview): number {
  const sessions = safeNum(ov?.totals?.sessions);
  const er = safeNum(ov?.totals?.engagementRate);
  if (sessions <= 0 || er <= 0) return 0;
  return sessions * clamp(er, 0, 1);
}
function isCubeConnected(cube: CubeKey, ov: Overview): boolean {
  const sources = safeObj(ov?.sources);
  if (cube === "site_inrcy" || cube === "site_web") {
    const conn = safeObj(safeObj(sources[cube])["connected"]);
    return Boolean(conn["ga4"]) || Boolean(conn["gsc"]);
  }
  return Boolean(safeObj(sources[cube])["connected"]);
}
function computeCapturedForCube(cube: CubeKey, ov: Overview): number {
  if (!isCubeConnected(cube, ov)) return 0;
  const sources = safeObj(ov?.sources);
  const clicks = safeNum(ov?.totals?.clicks);
  const impressions = safeNum(ov?.totals?.impressions);
  const pageviews = safeNum(ov?.totals?.pageviews);
  const engagedSessions = estimateEngagedSessions(ov);
  const CAP = 3;
  if (cube === "site_inrcy" || cube === "site_web") {
    const ga4Key = cube === "site_inrcy" ? "site_inrcy_ga4" : "site_web_ga4";
    const ga4 = safeObj(sources[ga4Key]);
    const convStrong = getTotalMetric(ga4.metrics, ["conversions", "conversionCount", "leads", "leadCount"]) || 0;
    const estimate = clicks * 0.12 + pageviews * 0.03 + engagedSessions * 0.08 + impressions * 0.003;
    if (convStrong > 0) return roundNonNeg(Math.min(convStrong * CAP, Math.max(convStrong, estimate)));
    return roundNonNeg(estimate);
  }
  if (cube === "gmb") {
    const m = safeObj(safeObj(sources["gmb"])["metrics"]);
    const calls = getTotalMetric(m, ["calls", "phone_calls", "phoneCalls", "call_clicks", "callClicks", "CALL_CLICKS"]);
    const website = getTotalMetric(m, ["website_clicks", "websiteClicks", "website_actions", "websiteActions", "WEBSITE_CLICKS"]);
    const directions = getTotalMetric(m, ["directions", "direction_requests", "directionRequests", "driving_directions", "drivingDirections", "DIRECTION_REQUESTS", "BUSINESS_DIRECTION_REQUESTS"]);
    const strong = calls + website + directions;
    const gmbImpr = getTotalMetric(m, ["impressions", "business_impressions", "BUSINESS_IMPRESSIONS", "BUSINESS_IMPRESSIONS_DESKTOP_MAPS", "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", "BUSINESS_IMPRESSIONS_MOBILE_MAPS", "BUSINESS_IMPRESSIONS_MOBILE_SEARCH", "views", "viewCount"]);
    const estimate = strong + clicks * 0.08 + gmbImpr * 0.002;
    if (strong > 0) return roundNonNeg(Math.min(strong * CAP, estimate));
    return roundNonNeg(estimate);
  }
  const m = safeObj(safeObj(sources[cube])["metrics"]);
  const messages = getTotalMetric(m, ["messages","message_count","messageCount","conversations","conversations_started","conversationsStarted","text_message_clicks"]);
  const ctaClicks = getTotalMetric(m, ["cta_clicks","ctaClicks","link_clicks","linkClicks","website_clicks","websiteClicks","clickCount","clicks","outbound_clicks","outboundClicks","page_website_clicks_logged_in_unique","page_website_clicks","page_call_phone_clicks","page_call_phone_clicks_logged_in_unique","page_get_directions_clicks","page_get_directions_clicks_logged_in_unique","phone_call_clicks","email_contacts","text_message_clicks","get_directions_clicks","get_direction_clicks"]);
  const strong = messages + ctaClicks;
  const engagements = getTotalMetric(m, ["engagements","post_engaged_users","page_engaged_users","post_engaged_users_sum","likes","comments","shares","saves"]);
  const reach = getTotalMetric(m, ["reach","uniqueReach","unique_reach"]);
  const profileViews = getTotalMetric(m, ["profile_views", "profileVisits", "profile_visits", "profileViews"]);
  const searchAppearances = getTotalMetric(m, ["searchAppearances", "search_appearances"]);
  const socialImpr = getTotalMetric(m, ["impressions","post_impressions_sum","post_impressions","views","video_views","impressionCount","uniqueImpressionsCount"]);
  const fbPageViews = cube === "facebook" ? getTotalMetric(m, ["page_views_total"]) : 0;
  const igReach = cube === "instagram" ? getTotalMetric(m, ["reach", "uniqueReach", "unique_reach"]) : 0;
  const igProfileViews = cube === "instagram" ? getTotalMetric(m, ["profile_views", "profileVisits", "profile_visits"]) : 0;
  const liPageViews = cube === "linkedin" ? getTotalMetric(m, ["pageViews"]) : 0;
  const liFollowerCount = cube === "linkedin" ? getTotalMetric(m, ["followerCount", "memberFollowersCount"]) : 0;
  const fallbackPresence = ((cube === "facebook" && fbPageViews > 0) || (cube === "instagram" && (igReach > 0 || igProfileViews > 0 || profileViews > 0)) || (cube === "linkedin" && (liPageViews > 0 || liFollowerCount > 0 || profileViews > 0 || searchAppearances > 0 || socialImpr > 0 || engagements > 0))) ? 1 : 0;
  const estimate = Math.max(fallbackPresence, strong + clicks * 0.05 + engagements * 0.03 + reach * 0.001 + socialImpr * 0.001 + fbPageViews * 0.04 + igReach * 0.03 + igProfileViews * 0.06 + profileViews * 0.06 + searchAppearances * 0.03 + liPageViews * 0.04 + liFollowerCount * 0.002);
  if (strong > 0) return roundNonNeg(Math.min(strong * CAP, estimate));
  return roundNonNeg(estimate);
}
function pageKind(path: string) { const p = (path || "").toLowerCase(); return (p.includes("contact") || p.includes("devis") || p.includes("rdv") || p.includes("rendez")) ? "contact" : "other"; }
function isIntentQuery(q: string) { return /(devis|tarif|prix|contact|telephone|t[ée]l|rdv|rendez|urgence|près|proche)/.test((q || "").toLowerCase()); }
function directShareFromChannels(ov: Overview, sessionsTotal: number) {
  const channels = Array.isArray(ov.channels) ? ov.channels : [];
  const directObj = channels.find((c) => String(c?.channel || c?.key || "").toLowerCase().includes("direct"));
  const directSessions = safeNum(directObj?.sessions ?? directObj?.value);
  return sessionsTotal > 0 ? clamp(directSessions / sessionsTotal, 0, 1) : 0;
}
function computeOpportunityPerDaySocial(cubeKey: CubeKey, ov: Overview): number {
  const baseDays = Math.max(1, safeNum(ov.days) || 30);
  const node = safeObj(safeObj(ov.sources)[cubeKey]);
  const connected = Boolean(node.connected);
  const m = node.metrics;
  if (!connected) return 0;
  const coldStartBaseline = cubeKey === "instagram" ? 0.18 : cubeKey === "linkedin" ? 0.12 : 0.20;
  if (!m || safeObj(m).error) return coldStartBaseline;
  const impressionsTotal = getTotalMetric(m, ["impressions","post_impressions","postImpressions","post_impressions_sum","IMPRESSIONS","impressionCount","viewerImpressions","reach","REACH"]);
  const engagementsTotal = getTotalMetric(m, ["engagements","post_engagements","postEngagements","ENGAGEMENTS","total_engagements","page_engaged_users","post_engaged_users_sum","reactions","comments","shares","likes","saves","replies","video_views","videoViews"]);
  const ctaClicksTotal = getTotalMetric(m, ["cta_clicks","ctaClicks","link_clicks","linkClicks","website_clicks","websiteClicks","page_website_clicks_logged_in_unique","WEBSITE_CLICKS","CLICK_COUNT","clickCount","clicks","outbound_clicks","outboundClicks"]);
  const audienceTotal = getTotalMetric(m, ["followers","followerCount","follower_count","followers_count","fans","fanCount","fan_count","audience","subscribers"]);
  const impressionsPerDay = impressionsTotal / baseDays;
  const engagementsPerDay = engagementsTotal / baseDays;
  const ctaClicksPerDay = ctaClicksTotal / baseDays;
  const logNorm = (x:number, ref:number) => clamp(Math.log1p(Math.max(0, x)) / Math.log1p(Math.max(1, ref)), 0, 1);
  const refs = cubeKey === "instagram" ? { imp: 2500, eng: 120, cta: 6, aud: 3000 } : cubeKey === "linkedin" ? { imp: 1200, eng: 45, cta: 3, aud: 2000 } : { imp: 3000, eng: 90, cta: 5, aud: 5000 };
  const exposureN = logNorm(impressionsPerDay, refs.imp);
  const engagementN = logNorm(engagementsPerDay, refs.eng);
  const intentN = logNorm(ctaClicksPerDay, refs.cta);
  const audienceN = logNorm(audienceTotal, refs.aud);
  const currentPerDay = clamp(0.02 + 0.20 * intentN + 0.12 * engagementN + 0.06 * exposureN + 0.04 * audienceN, 0, 1.6);
  const uplift = clamp(0.35 + 0.35 * (1 - intentN) + 0.20 * (1 - exposureN), 0.35, 0.90);
  const histWeight = clamp(exposureN * 0.7 + intentN * 0.3, 0, 1);
  const base = histWeight * currentPerDay + (1 - histWeight) * coldStartBaseline;
  const potentialPerDay = clamp(base * (1 + uplift), coldStartBaseline, 2.5);
  return clamp(Math.max(0, potentialPerDay - currentPerDay), 0, 2.5);
}
function computeOpportunityPerDayWeb(ov: Overview) {
  const baseDays = Math.max(1, safeNum(ov.days) || 30);
  const totals = ov.totals || {};
  const sessions = safeNum(totals.sessions);
  const clicks = safeNum(totals.clicks);
  const impressions = safeNum(totals.impressions);
  const ctr = clamp(safeNum((totals as Record<string, unknown>).ctr), 0, 1);
  const engagementRate = clamp(safeNum(totals.engagementRate), 0, 1);
  const avgSessionDurationSec = safeNum(totals.avgSessionDuration);
  const directShare = directShareFromChannels(ov, sessions);
  const topQueries = Array.isArray(ov.topQueries) ? ov.topQueries : [];
  const intentClicks = topQueries.filter((q) => isIntentQuery(q.query)).reduce((s, q) => s + safeNum(q.clicks), 0);
  const topPages = Array.isArray(ov.topPages) ? ov.topPages : [];
  const contactViews = topPages.filter((p) => pageKind(p.path) === "contact").reduce((s, p) => s + safeNum(p.views), 0);
  const trafficScore = clamp((sessions / baseDays) / 50, 0, 1);
  const intentScore = clamp((intentClicks / baseDays) / 3, 0, 1);
  const durationScore = clamp(avgSessionDurationSec / 180, 0, 1);
  const baseIndex = 0.45 * trafficScore + 0.30 * intentScore + 0.15 * engagementRate + 0.10 * durationScore;
  let rawPerDay = ((sessions / baseDays) * 0.08 + (clicks / baseDays) * 0.10 + (intentClicks / baseDays) * 0.32 + (contactViews / baseDays) * 0.05) * (0.65 + baseIndex) * (0.85 + clamp(directShare / 0.65, 0, 1) * 0.20);

  const siteInrcyConn = safeObj(safeObj(safeObj(ov?.sources)["site_inrcy"])["connected"]);
  const siteWebConn = safeObj(safeObj(safeObj(ov?.sources)["site_web"])["connected"]);
  const gscConnected = Boolean(siteInrcyConn["gsc"]) || Boolean(siteWebConn["gsc"]);
  if (gscConnected && (impressions > 0 || clicks > 0 || intentClicks > 0)) {
    const cfg = getGscOpportunityConfig(ov.business?.sectorCategory);
    const gscImpressionsPerDay = impressions / baseDays;
    const gscClicksPerDay = clicks / baseDays;
    const gscIntentClicksPerDay = intentClicks / baseDays;
    const logNorm = (x:number, ref:number) => clamp(Math.log1p(Math.max(0, x)) / Math.log1p(Math.max(1, ref)), 0, 1);
    const visibilityN = logNorm(gscImpressionsPerDay, cfg.impressionRef);
    const trafficN = logNorm(gscClicksPerDay, cfg.clickRef);
    const intentN = logNorm(gscIntentClicksPerDay, cfg.intentRef);
    const ctrOppN = impressions >= cfg.minImpressionsForCtr ? clamp((cfg.ctrTarget - ctr) / Math.max(0.01, cfg.ctrTarget), 0, 1) : 0;
    const gscBonusIndex = cfg.visibilityWeight * visibilityN + cfg.trafficWeight * trafficN + cfg.intentWeight * intentN + cfg.ctrWeight * ctrOppN;
    const gscBasePerDay = 0.10 * visibilityN + 0.12 * trafficN + 0.22 * intentN + 0.08 * ctrOppN;
    rawPerDay = (rawPerDay + gscBasePerDay + gscIntentClicksPerDay * cfg.directIntentFactor) * (1 + gscBonusIndex * cfg.bonusWeight);
  }
  return clamp(rawPerDay, 0, 999);
}
function computeOpportunity30(cubeKey: CubeKey, ov: Overview) {
  if (!isCubeConnected(cubeKey, ov)) return 0;
  if (cubeKey === "gmb") {
    const gmb = ov.sources?.gmb;
    const connected = !!gmb?.connected;
    if (!connected) return 0;
    const totals = safeObj(safeObj(gmb?.metrics).totals);
    const hasError = !!safeObj(gmb?.metrics).error;
    const base = hasError || !gmb?.metrics ? 0.8 : 1.2;
    const impressionsGuess =
      safeNum(totals["impressions"]) ||
      safeNum(totals["BUSINESS_IMPRESSIONS"]) ||
      (safeNum(totals["BUSINESS_IMPRESSIONS_DESKTOP_MAPS"]) +
        safeNum(totals["BUSINESS_IMPRESSIONS_MOBILE_MAPS"]) +
        safeNum(totals["BUSINESS_IMPRESSIONS_DESKTOP_SEARCH"]) +
        safeNum(totals["BUSINESS_IMPRESSIONS_MOBILE_SEARCH"]));
    const interactionsGuess =
      (safeNum(totals["websiteClicks"]) || safeNum(totals["website_clicks"]) || safeNum(totals["WEBSITE_CLICKS"])) +
      (safeNum(totals["callClicks"]) || safeNum(totals["call_clicks"]) || safeNum(totals["CALL_CLICKS"])) +
      (safeNum(totals["directionRequests"]) || safeNum(totals["direction_requests"]) || safeNum(totals["DIRECTION_REQUESTS"]) || safeNum(totals["BUSINESS_DIRECTION_REQUESTS"]));
    return Math.max(0, Math.round(clamp(base + impressionsGuess / 800 + interactionsGuess / 30, 0, 50) * 30));
  }
  if (cubeKey === "facebook" || cubeKey === "instagram" || cubeKey === "linkedin") return Math.max(0, Math.round(computeOpportunityPerDaySocial(cubeKey, ov) * 30));
  return Math.max(0, Math.round(computeOpportunityPerDayWeb(ov) * 30));
}
async function fetchOverviewForUser(req: Request, userId: string, cube: CubeKey, days = 30): Promise<Overview> {
  const baseUrl = getAppUrl(req);
  const secret = process.env.VERCEL_CRON_SECRET || process.env.CRON_SECRET || "";
  const url = new URL(`${baseUrl}/api/stats/overview`);
  url.searchParams.set("days", String(days));
  url.searchParams.set("include", INCLUDE_BY_CUBE[cube]);
  url.searchParams.set("userId", userId);
  url.searchParams.set("secret", secret);
  const res = await fetch(url.toString(), { headers: { "x-cron-secret": secret }, cache: "no-store" });
  if (!res.ok) throw new Error(`overview_failed:${cube}:${res.status}:${(await res.text()).slice(0, 140)}`);
  return (await res.json()) as Overview;
}

const SNAPSHOT_SOURCES: Array<keyof ChannelStates> = [
  "site_inrcy",
  "site_web",
  "facebook",
  "instagram",
  "linkedin",
  "gmb",
];

function isAuthorizedCron(req: Request) {
  const cronSecret = process.env.VERCEL_CRON_SECRET || process.env.CRON_SECRET || "";
  if (!cronSecret) return false;

  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  const headerSecret = (req.headers.get("x-cron-secret") || "").trim();

  const url = new URL(req.url);
  const querySecret = (url.searchParams.get("secret") || "").trim();

  return bearer === cronSecret || headerSecret === cronSecret || querySecret === cronSecret;
}

function parsePositiveInt(raw: string | null, fallback: number, opts?: { min?: number; max?: number }) {
  const min = opts?.min ?? 0;
  const max = opts?.max ?? Number.MAX_SAFE_INTEGER;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

async function processUser(req: Request, userId: string) {
  const origin = getAppUrl(req);
  try {
    await buildMetricsSummary({
      supabase: supabaseAdmin,
      userId,
      origin,
      monthDays: 30,
      weekDays: 7,
      todayDays: 2,
      fresh: true,
    });
  } catch (error) {
    console.warn("daily-metrics-summary metrics_summary warm failed", userId, error instanceof Error ? error.message : String(error));
  }

  const states = await getChannelConnectionStates(supabaseAdmin, userId);
  const details: Partial<Record<CubeKey, SnapshotDetail>> = {};

  for (const source of SNAPSHOT_SOURCES) {
    const state = states[source];
    const overview = await fetchOverviewForUser(req, userId, source);
    const demandesCaptees = computeCapturedForCube(source as CubeKey, overview);
    const opportunites = computeOpportunity30(source as CubeKey, overview);

    details[source as CubeKey] = {
      connected: Boolean(state?.connected),
      metrics: overview?.sources?.[source] ? (overview.sources[source] as Record<string, unknown>) : ((state ?? {}) as Record<string, unknown>),
      demandes_captees: demandesCaptees,
      opportunites_activables: opportunites,
    };
  }

  await saveDailyMetricsSummary({
    supabase: supabaseAdmin,
    userId,
    details,
  });
}

async function runWithConcurrency<T>(items: T[], concurrency: number, worker: (_arg: T) => Promise<void>) {
  const queue = [...items];
  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item === undefined) return;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

async function tryAcquireShardLock(shard: number, totalShards: number): Promise<boolean> {
  const lockKey = LOCK_BASE_KEY + shard + totalShards * 1000;
  const { data, error } = await supabaseAdmin.rpc("try_advisory_job_lock", { lock_key: lockKey });
  if (error) {
    console.warn("daily-metrics-summary lock unavailable", error.message);
    return true;
  }
  return Boolean(data);
}

async function releaseShardLock(shard: number, totalShards: number): Promise<void> {
  const lockKey = LOCK_BASE_KEY + shard + totalShards * 1000;
  const { error } = await supabaseAdmin.rpc("advisory_job_unlock", { lock_key: lockKey });
  if (error) {
    console.warn("daily-metrics-summary unlock failed", error.message);
  }
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Accès non autorisé." }, { status: 401 });
  }

  const url = new URL(req.url);
  const totalShards = parsePositiveInt(url.searchParams.get("totalShards"), DEFAULT_TOTAL_SHARDS, { min: 1, max: 24 });
  const shard = parsePositiveInt(url.searchParams.get("shard"), 0, { min: 0, max: totalShards - 1 });
  const offset = parsePositiveInt(url.searchParams.get("offset"), 0, { min: 0 });
  const limitRaw = url.searchParams.get("limit");
  const concurrency = parsePositiveInt(url.searchParams.get("concurrency"), DEFAULT_CONCURRENCY, { min: 1, max: 8 });

  const lockAcquired = await tryAcquireShardLock(shard, totalShards);
  if (!lockAcquired) {
    return NextResponse.json({ ok: true, skipped: true, reason: "lock_not_acquired", shard, totalShards }, { status: 200 });
  }

  try {
    const { data: users, error: usersError } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .not("user_id", "is", null)
      .order("user_id", { ascending: true });

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 });
    }

    const allUserIds = (users || [])
      .map((user) => (typeof user?.user_id === "string" ? user.user_id : ""))
      .filter(Boolean);

    const shardUserIds = allUserIds.filter((_, index) => index % totalShards === shard);
    const limit = parsePositiveInt(limitRaw, shardUserIds.length, { min: 1, max: Math.max(1, shardUserIds.length || 1) });
    const selectedUserIds = shardUserIds.slice(offset, offset + limit);

    let processedUsers = 0;
    let writtenSnapshots = 0;
    const errors: Array<{ user_id: string; message: string }> = [];

    await runWithConcurrency(selectedUserIds, concurrency, async (userId) => {
      try {
        await processUser(req, userId);
        processedUsers += 1;
        writtenSnapshots += 1;
      } catch (error) {
        errors.push({
          user_id: userId,
          message: error instanceof Error ? error.message : "Unknown snapshot error",
        });
      }
    });

    return NextResponse.json({
      ok: errors.length === 0,
      shard,
      totalShards,
      offset,
      limit,
      selectedUsers: selectedUserIds.length,
      shardUsers: shardUserIds.length,
      totalUsers: allUserIds.length,
      processedUsers,
      writtenSnapshots,
      remainingInShard: Math.max(0, shardUserIds.length - (offset + selectedUserIds.length)),
      concurrency,
      errors,
    });
  } finally {
    await releaseShardLock(shard, totalShards);
  }
}
