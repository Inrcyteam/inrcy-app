import { NextResponse } from "next/server";

/**
 * Lightweight endpoint to expose the global "opportunités activables" number
 * (same logic as iNrStats) without loading the full iNrStats UI.
 *
 * Strategy (safe): call the existing overview endpoint per cube (same auth cookies)
 * then compute the 30-day projection.
 */

type Period = 7 | 30 | 60 | 90;
type CubeKey = "site_inrcy" | "site_web" | "gmb" | "facebook" | "instagram" | "linkedin";

type MetricsTotals = Record<string, unknown>;

type SourceMetrics = {
  error?: unknown;
  totals?: MetricsTotals;
} & Record<string, unknown>;

type SourceNode = {
  connected?: boolean;
  metrics?: SourceMetrics;
} & Record<string, unknown>;

type Overview = {
  days: number;
  totals?: {
    users?: number;
    sessions?: number;
    pageviews?: number;
    engagementRate?: number;
    avgSessionDuration?: number;
    clicks?: number;
    impressions?: number;
    ctr?: number;
  };
  topPages?: Array<{ path: string; views: number }>;
  topQueries?: Array<{ query: string; clicks: number }>;
  // The overview endpoint returns GA4 channels as { channel, sessions }.
  // Older experiments may return { key, value }. We support both to stay safe.
  channels?: Array<{ channel?: string; sessions?: number; key?: string; value?: number }>;
  sources?: Partial<Record<CubeKey, SourceNode>>;
};

function safeNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n));
}

function logNorm(x: number, ref: number) {
  // Smooth normalization 0..1 using log scale (robust to outliers).
  const xx = Math.max(0, x);
  const rr = Math.max(1, ref);
  return clamp(Math.log1p(xx) / Math.log1p(rr), 0, 1);
}

function safeObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function getTotalMetric(metrics: unknown, keys: string[]): number {
  const m = safeObj(metrics);
  const totals = safeObj(m.totals);
  for (const k of keys) {
    const n = safeNum(totals[k]);
    if (n) return n;
  }
  return 0;
}

function computeOpportunityPerDaySocial(cubeKey: CubeKey, ov: Overview): number {
  const baseDays = Math.max(1, safeNum(ov.days) || 30);
  const src = safeObj(ov.sources);
  const node = safeObj(src[cubeKey]);
  const connected = Boolean(node.connected);
  const m = node.metrics;

  // Disconnected => 0.
  if (!connected) return 0;

  // Cold start: connected but no metrics available yet (new account / API limitation).
  // We return a small, honest baseline opportunity that represents "potential" once actions are executed,
  // instead of showing 0 which is demotivating and misleading.
  const coldStartBaseline =
    cubeKey === "instagram" ? 0.18 : cubeKey === "linkedin" ? 0.12 : 0.20; // fb

  if (!m || safeObj(m).error) return coldStartBaseline;

  const impressionsTotal =
    getTotalMetric(m, [
      "impressions",
      "post_impressions",
      "postImpressions",
      // Facebook fallback (published_posts -> post_impressions lifetime sum)
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
      // Facebook / Meta variants
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
      // Facebook Page clicks
      "page_website_clicks_logged_in_unique",
      "WEBSITE_CLICKS",
      "CLICK_COUNT",
      "clickCount",
      "clicks",
      "outbound_clicks",
      "outboundClicks",
    ]) || 0;

  const audienceTotal =
    getTotalMetric(m, [
      "followers",
      "followerCount",
      "follower_count",
      "followers_count",
      "fans",
      "fanCount",
      "fan_count",
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
        : { imp: 3000, eng: 90, cta: 5, aud: 5000 }; // facebook

  const exposureN = logNorm(impressionsPerDay, refs.imp);
  const engagementN = logNorm(engagementsPerDay, refs.eng);
  const intentN = logNorm(ctaClicksPerDay, refs.cta);
  const audienceN = logNorm(audienceTotal, refs.aud);

  // 1) Current "intent" proxy (historical) expressed in opportunity units.
  const currentPerDay = clamp(
    0.02 + 0.20 * intentN + 0.12 * engagementN + 0.06 * exposureN + 0.04 * audienceN,
    0,
    1.6
  );

  // 2) Improvement room based on deficits.
  // If CTA intent is low, there is more room for Booster actions.
  // If exposure is low, there is more room for consistency/posting frequency.
  const uplift = clamp(0.35 + 0.35 * (1 - intentN) + 0.20 * (1 - exposureN), 0.35, 0.90);

  // 3) Potential per day (what the pro can unlock by executing actions).
  // Blend cold-start baseline with history (so new/low-activity accounts still show potential).
  const histWeight = clamp(exposureN * 0.7 + intentN * 0.3, 0, 1);
  const base = histWeight * currentPerDay + (1 - histWeight) * coldStartBaseline;
  const potentialPerDay = clamp(base * (1 + uplift), coldStartBaseline, 2.5);

  // 4) "Opportunités activables" = additional opportunities the pro can generate (future),
  // not the historical volume.
  const additionalPerDay = Math.max(0, potentialPerDay - currentPerDay);

  return clamp(additionalPerDay, 0, 2.5);
}

function pageKind(path: string) {
  const p = (path || "").toLowerCase();
  if (p.includes("contact") || p.includes("devis") || p.includes("rdv") || p.includes("rendez")) return "contact";
  return "other";
}

function isIntentQuery(q: string) {
  const s = (q || "").toLowerCase();
  // simple intent words (same spirit as iNrStats)
  return /\b(devis|tarif|prix|contact|telephone|t[ée]l|rdv|rendez|urgence|près|proche)\b/.test(s);
}

function directShareFromChannels(ov: Overview, sessionsTotal: number) {
  const channels = Array.isArray(ov.channels) ? ov.channels : [];
  // Prefer canonical shape used by iNrStats: { channel, sessions }
  const directObj = channels.find((c) => (c?.channel || c?.key || "").toLowerCase().includes("direct"));
  const directSessions = safeNum(directObj?.sessions ?? directObj?.value);
  if (sessionsTotal > 0) return clamp(directSessions / sessionsTotal, 0, 1);
  return 0;
}

function computeOpportunityPerDayWeb(ov: Overview) {
  const baseDays = Math.max(1, safeNum(ov.days) || 30);
  const totals = ov.totals || {};
  const sessions = safeNum(totals.sessions);
  const clicks = safeNum(totals.clicks);
  const engagementRate = clamp(safeNum(totals.engagementRate), 0, 1);
  const avgSessionDurationSec = safeNum(totals.avgSessionDuration);

  // Match iNrStats logic: Direct share = Direct sessions / total sessions
  const directShare = directShareFromChannels(ov, sessions);

  const topQueries = Array.isArray(ov.topQueries) ? ov.topQueries : [];
  const intentClicks = topQueries.filter((q) => isIntentQuery(q.query)).reduce((s, q) => s + safeNum(q.clicks), 0);

  const topPages = Array.isArray(ov.topPages) ? ov.topPages : [];
  const contactViews = topPages.filter((p) => pageKind(p.path) === "contact").reduce((s, p) => s + safeNum(p.views), 0);

  const trafficScore = clamp((sessions / baseDays) / 50, 0, 1);
  const intentScore = clamp((intentClicks / baseDays) / 3, 0, 1);
  const durationScore = clamp(avgSessionDurationSec / 180, 0, 1);

  const baseIndex = 0.45 * trafficScore + 0.30 * intentScore + 0.15 * engagementRate + 0.10 * durationScore;

  const rawPerDay =
    ((sessions / baseDays) * 0.08 +
      (clicks / baseDays) * 0.10 +
      (intentClicks / baseDays) * 0.32 +
      (contactViews / baseDays) * 0.05) *
    (0.65 + baseIndex) *
    (0.85 + clamp(directShare / 0.65, 0, 1) * 0.20);

  return clamp(rawPerDay, 0, 999);
}

function computeOpportunity30(cubeKey: CubeKey, ov: Overview) {
  if (cubeKey === "gmb") {
    const gmb = ov.sources?.gmb;
    const connected = !!gmb?.connected;
    if (!connected) return 0;

    const m = gmb?.metrics;
    const totals = m?.totals;
    const hasError = !!m?.error;
    const base = hasError || !m ? 0.8 : 1.2;

    const impressionsGuess =
      safeNum(totals?.BUSINESS_IMPRESSIONS_DESKTOP_MAPS) +
      safeNum(totals?.BUSINESS_IMPRESSIONS_MOBILE_MAPS);

    const interactionsGuess =
      safeNum(totals?.WEBSITE_CLICKS) +
      safeNum(totals?.CALL_CLICKS) +
      safeNum(totals?.DIRECTION_REQUESTS);

    const perDay = clamp(base + impressionsGuess / 800 + interactionsGuess / 30, 0, 50);
    return Math.max(0, Math.round(perDay * 30));
  }

  if (cubeKey === "facebook" || cubeKey === "instagram" || cubeKey === "linkedin") {
    const perDay = computeOpportunityPerDaySocial(cubeKey, ov);
    return Math.max(0, Math.round(perDay * 30));
  }

  const perDay = computeOpportunityPerDayWeb(ov);
  return Math.max(0, Math.round(perDay * 30));
}

const INCLUDE_BY_CUBE: Record<CubeKey, string> = {
  site_inrcy: "site_inrcy_ga4,site_inrcy_gsc",
  site_web: "site_web_ga4,site_web_gsc",
  gmb: "gmb",
  facebook: "facebook",
  instagram: "instagram",
  linkedin: "linkedin",
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const days = Math.min(Math.max(Number(searchParams.get("days") || 30), 7), 90) as Period;

    const origin = new URL(request.url).origin;
    const cookie = request.headers.get("cookie") || "";

    const keys: CubeKey[] = ["site_inrcy", "site_web", "gmb", "facebook", "instagram", "linkedin"];
    const results = await Promise.all(
      keys.map(async (k) => {
        const include = INCLUDE_BY_CUBE[k];
        const url = `${origin}/api/stats/overview?days=${days}&include=${encodeURIComponent(include)}`;
        const r = await fetch(url, { headers: { cookie }, cache: "no-store" });
        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          throw new Error(`overview_failed:${k}:${r.status}:${txt.slice(0, 120)}`);
        }
        const ov = (await r.json()) as Overview;
        return [k, ov] as const;
      })
    );

    const byCube: Record<CubeKey, number> = {
      site_inrcy: 0,
      site_web: 0,
      gmb: 0,
      facebook: 0,
      instagram: 0,
      linkedin: 0,
    };

    for (const [k, ov] of results) {
      byCube[k] = computeOpportunity30(k, ov);
    }

    const total = Object.values(byCube).reduce((s, n) => s + safeNum(n), 0);

    return NextResponse.json({ days, total, byCube });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown_error" }, { status: 500 });
  }
}
