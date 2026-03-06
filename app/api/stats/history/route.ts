import { NextResponse } from "next/server";

/**
 * 📊 Historique "Demandes captées"
 * - Données observées (passé) sur une fenêtre (7j / 30j / ...), sans projection.
 * - "Demandes captées" est une **estimation bornée** à partir de signaux mesurés (actions) et de signaux d’intention (impressions, clics, sessions engagées).
 * - Total et détail par outil.
 *
 * IMPORTANT: Ce endpoint est volontairement distinct de /api/stats/opportunities
 * pour éviter toute corrélation accidentelle entre "historique" et "opportunités".
 */

type Period = 7 | 30 | 60 | 90;
type CubeKey = "site_inrcy" | "site_web" | "gmb" | "facebook" | "instagram" | "linkedin";

type Overview = {
  days: number;
  totals?: {
    pageviews?: number;
    clicks?: number;
    sessions?: number;
    impressions?: number;
    engagementRate?: number; // 0..1
    avgSessionDuration?: number; // seconds
  };
  sources?: Record<string, { connected?: boolean; metrics?: Record<string, unknown> | null }>;
};

const INCLUDE_BY_CUBE: Record<CubeKey, string> = {
  site_inrcy: "site_inrcy_ga4,site_inrcy_gsc",
  site_web: "site_web_ga4,site_web_gsc",
  gmb: "gmb",
  facebook: "facebook",
  instagram: "instagram",
  linkedin: "linkedin",
};

function safeNum(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
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
  for (const k of keys) {
    const n = safeNum(m[k]);
    if (n) return n;
  }
  return 0;
}


function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function estimateEngagedSessions(ov: Overview): number {
  const sessions = safeNum(ov?.totals?.sessions);
  const er = safeNum(ov?.totals?.engagementRate);
  if (sessions <= 0 || er <= 0) return 0;
  // engagementRate is expected 0..1. Clamp to avoid bad provider payloads.
  return sessions * clamp(er, 0, 1);
}

function roundNonNeg(n: number): number {
  return Math.max(0, Math.round(n));
}

function isCubeConnected(cube: CubeKey, ov: Overview): boolean {
  const sources = safeObj(ov?.sources);
  if (cube === "site_inrcy" || cube === "site_web") {
    const conn = safeObj(safeObj(sources[cube])["connected"]);
    return Boolean(conn["ga4"]) && Boolean(conn["gsc"]);
  }
  return Boolean(safeObj(sources[cube])["connected"]);
}

/**
 * "Demandes captées" (historique) = estimation de demandes commerciales à partir
 * de signaux à forte intention (conversions, appels, messages, itinéraires),
 * complétés par des signaux moyens/faibles (clics, sessions engagées, impressions...).
 *
 * Objectif: rester MOTIVANT sans mentir :
 * - On ne "fabrique" pas de leads : on estime un volume plausible.
 * - Dès qu'on a des signaux forts, on borne l'estimation (cap) pour rester crédible.
 */
const CAP_MULTIPLIER_WHEN_STRONG_SIGNAL = 3; // max = signaux forts * 3
const MODEL_VERSION = "captured_v2.0";

function computeCapturedForCube(cube: CubeKey, ov: Overview): number {
  if (!isCubeConnected(cube, ov)) return 0;
  const sources = safeObj(ov?.sources);

  const clicks = safeNum(ov?.totals?.clicks);
  const impressions = safeNum(ov?.totals?.impressions);
  const pageviews = safeNum(ov?.totals?.pageviews);
  const sessions = safeNum(ov?.totals?.sessions);
  const engagedSessions = estimateEngagedSessions(ov);

  // --- Websites (GA4 + GSC) ---
  if (cube === "site_inrcy" || cube === "site_web") {
    const ga4Key = cube === "site_inrcy" ? "site_inrcy_ga4" : "site_web_ga4";
    const ga4 = safeObj(sources[ga4Key]);

    // Strong signal (tracked conversions/leads)
    const convStrong =
      getTotalMetric(ga4.metrics, ["conversions", "conversionCount", "leads", "leadCount"]) || 0;

    // Mid/low intent signals
    const estimate =
      clicks * 0.12 +
      pageviews * 0.03 +
      engagedSessions * 0.08 +
      impressions * 0.003;

    if (convStrong > 0) {
      // If tracking is under-counting, allow a bounded uplift, otherwise keep real conversions.
      const capped = Math.min(convStrong * CAP_MULTIPLIER_WHEN_STRONG_SIGNAL, Math.max(convStrong, estimate));
      return roundNonNeg(capped);
    }

    return roundNonNeg(estimate);
  }

  // --- Google Business Profile ---
  if (cube === "gmb") {
    const gmbNode = safeObj(sources["gmb"]);
    const m = gmbNode["metrics"];

    // Strong signals (actions)
    const calls = getTotalMetric(m, ["calls", "phone_calls", "phoneCalls", "call_clicks", "callClicks", "CALL_CLICKS"]);
    const website = getTotalMetric(m, ["website_clicks", "websiteClicks", "website_actions", "websiteActions", "WEBSITE_CLICKS"]);
    const directions = getTotalMetric(m, ["directions", "direction_requests", "directionRequests", "driving_directions", "drivingDirections", "DIRECTION_REQUESTS"]);
    const strong = calls + website + directions;

    // Low intent: business impressions/views (when available)
    const gmbImpr = getTotalMetric(m, [
      "impressions",
      "business_impressions",
      "BUSINESS_IMPRESSIONS",
      "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
      "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
      "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
      "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
      "views",
      "viewCount",
    ]);

    const estimate = strong + clicks * 0.08 + gmbImpr * 0.002;

    if (strong > 0) {
      const capped = Math.min(strong * CAP_MULTIPLIER_WHEN_STRONG_SIGNAL, estimate);
      return roundNonNeg(capped);
    }

    return roundNonNeg(estimate);
  }

  // --- Social (Facebook / Instagram / LinkedIn) ---
  if (cube === "facebook" || cube === "instagram" || cube === "linkedin") {
    const socialNode = safeObj(sources[cube]);
    const m = socialNode["metrics"];

    // Strong signals
    const messages = getTotalMetric(m, [
      "messages",
      "message_count",
      "messageCount",
      "conversations",
      "conversations_started",
      "conversationsStarted",
      "text_message_clicks",
    ]);

    const ctaClicks = getTotalMetric(m, [
      "cta_clicks",
      "ctaClicks",
      "link_clicks",
      "linkClicks",
      "website_clicks",
      "websiteClicks",
      "clickCount",
      "clicks",
      "outbound_clicks",
      "outboundClicks",
      "page_website_clicks_logged_in_unique",
      "page_website_clicks",
      "page_call_phone_clicks",
      "page_call_phone_clicks_logged_in_unique",
      "page_get_directions_clicks",
      "page_get_directions_clicks_logged_in_unique",
      "phone_call_clicks",
      "email_contacts",
      "text_message_clicks",
      "get_directions_clicks",
      "get_direction_clicks",
    ]);

    const strong = messages + ctaClicks;

    // Medium/low intent
    const engagements = getTotalMetric(m, [
      "engagements",
      "post_engaged_users",
      "page_engaged_users",
      "post_engaged_users_sum",
      "likes",
      "comments",
      "shares",
      "saves",
    ]);

    const reach = getTotalMetric(m, ["reach", "uniqueReach", "unique_reach"]);
    const socialImpr = getTotalMetric(m, ["impressions", "post_impressions_sum", "post_impressions", "views", "video_views", "impressionCount", "uniqueImpressionsCount"]);
    const fbPageViews = cube === "facebook" ? getTotalMetric(m, ["page_views_total"]) : 0;
    const igReach = cube === "instagram" ? getTotalMetric(m, ["reach", "uniqueReach", "unique_reach"]) : 0;
    const liPageViews = cube === "linkedin" ? getTotalMetric(m, ["pageViews"]) : 0;

    const fallbackPresence =
      (cube === "facebook" && fbPageViews > 0) ||
      (cube === "instagram" && igReach > 0) ||
      (cube === "linkedin" && (liPageViews > 0 || socialImpr > 0 || engagements > 0))
        ? 1
        : 0;

    const estimate = Math.max(
      fallbackPresence,
      strong +
        clicks * 0.05 +
        engagements * 0.03 +
        reach * 0.001 +
        socialImpr * 0.001 +
        fbPageViews * 0.04 +
        igReach * 0.03 +
        liPageViews * 0.04
    );

    if (strong > 0) {
      const capped = Math.min(strong * CAP_MULTIPLIER_WHEN_STRONG_SIGNAL, estimate);
      return roundNonNeg(capped);
    }

    return roundNonNeg(estimate);
  }

  return 0;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const daysParam = Number(searchParams.get("days") || "30");
    const days: Period = (daysParam === 7 || daysParam === 30 || daysParam === 60 || daysParam === 90 ? daysParam : 30) as Period;

    const origin = request.headers.get("x-forwarded-host")
      ? `${request.headers.get("x-forwarded-proto") || "https"}://${request.headers.get("x-forwarded-host")}`
      : new URL(request.url).origin;

    const cookie = request.headers.get("cookie") || "";

    const keys: CubeKey[] = ["site_inrcy", "site_web", "gmb", "facebook", "instagram", "linkedin"];

    const perTool: Record<CubeKey, number> = {
      site_inrcy: 0,
      site_web: 0,
      gmb: 0,
      facebook: 0,
      instagram: 0,
      linkedin: 0,
    };

    await Promise.all(
      keys.map(async (k) => {
        const include = INCLUDE_BY_CUBE[k];
        const url = `${origin}/api/stats/overview?days=${days}&include=${encodeURIComponent(include)}`;
        const r = await fetch(url, { headers: { cookie }, cache: "no-store" });
        if (!r.ok) {
          perTool[k] = 0;
          return;
        }
        const ov = (await r.json()) as Overview;
        perTool[k] = computeCapturedForCube(k, ov);
      })
    );

    const total = Object.values(perTool).reduce((a, b) => a + b, 0);

    return NextResponse.json({ days, total, perTool, model: MODEL_VERSION });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)) || "Unknown error" }, { status: 500 });
  }
}
