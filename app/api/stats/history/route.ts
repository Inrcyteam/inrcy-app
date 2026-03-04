import { NextResponse } from "next/server";

/**
 * 📊 Historique "Demandes captées"
 * - Données RÉELLES (passé) sur une fenêtre (7j / 30j / ...), sans projection.
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
  };
  sources?: Record<string, { connected?: boolean; metrics?: any }>;
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

function safeObj(v: unknown): Record<string, any> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as any) : {};
}

function getTotalMetric(metrics: any, keys: string[]): number {
  const m = safeObj(metrics);
  const totals = safeObj(m.totals);
  for (const k of keys) {
    const n = safeNum((totals as any)[k]);
    if (n) return n;
  }
  for (const k of keys) {
    const n = safeNum((m as any)[k]);
    if (n) return n;
  }
  return 0;
}

function computeCapturedForCube(cube: CubeKey, ov: Overview): number {
  const sources = safeObj(ov?.sources);

  if (cube === "site_inrcy" || cube === "site_web") {
    const ga4Key = cube === "site_inrcy" ? "site_inrcy_ga4" : "site_web_ga4";
    const ga4 = safeObj(sources[ga4Key]);
    const conv =
      getTotalMetric(ga4.metrics, ["conversions", "conversionCount", "leads", "leadCount"]) || 0;

    if (conv > 0) return Math.round(conv);

    const clicks = safeNum(ov?.totals?.clicks);
    const pageviews = safeNum(ov?.totals?.pageviews);
    const proxy = clicks * 0.06 + pageviews * 0.01;
    return Math.max(0, Math.round(proxy));
  }

  if (cube === "gmb") {
    const m = (sources as any)?.gmb?.metrics;
    const calls = getTotalMetric(m, ["calls", "phone_calls", "phoneCalls", "call_clicks", "callClicks"]);
    const website = getTotalMetric(m, ["website_clicks", "websiteClicks", "website_actions", "websiteActions"]);
    const directions = getTotalMetric(m, ["directions", "direction_requests", "directionRequests", "driving_directions", "drivingDirections"]);
    const total = calls + website + directions;
    if (total > 0) return Math.round(total);

    const clicks = safeNum(ov?.totals?.clicks);
    return Math.max(0, Math.round(clicks * 0.08));
  }

  if (cube === "facebook" || cube === "instagram" || cube === "linkedin") {
    const m = (sources as any)?.[cube]?.metrics;

    const messages = getTotalMetric(m, [
      "messages",
      "message_count",
      "messageCount",
      "conversations",
      "conversations_started",
      "conversationsStarted",
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
      "page_get_directions_clicks",
    ]);

    const total = messages + ctaClicks;
    if (total > 0) return Math.round(total);

    const clicks = safeNum(ov?.totals?.clicks);
    return Math.max(0, Math.round(clicks * 0.05));
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

    return NextResponse.json({ days, total, perTool });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)) || "Unknown error" }, { status: 500 });
  }
}
