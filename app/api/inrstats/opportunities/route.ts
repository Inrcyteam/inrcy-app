import { NextResponse } from "next/server";

// iNrCy: single source of truth for "opportunités".
// Used by:
// - /dashboard/stats (iNr'Stats)
// - /api/generator/kpis (home generator KPIs)

type OverviewResponse = unknown;

type OpportunitiesResult = {
  baseDays: number;
  today: number;
  week: number;
  month: number;
  confidence: "low" | "medium" | "high";
  debug?: Record<string, unknown>;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeNumber(n: unknown, fallback = 0): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return v;
}

function isIntentQuery(q: string) {
  const s = (q || "").toLowerCase();
  return (
    s.includes("devis") ||
    s.includes("prix") ||
    s.includes("tarif") ||
    s.includes("urgence") ||
    s.includes("près") ||
    s.includes("pro") ||
    s.includes("entreprise") ||
    s.includes("artisan") ||
    s.includes("contact") ||
    s.includes("téléphone") ||
    s.includes("rdv") ||
    s.includes("rendez")
  );
}

function pageKind(path: string) {
  const p = (path || "").toLowerCase();
  if (p.includes("contact")) return "contact";
  if (p.includes("devis") || p.includes("pricing") || p.includes("tarif")) return "pricing";
  if (p.includes("service") || p.includes("prestation")) return "service";
  return "other";
}

function computeOpportunities(overview: OverviewResponse): { perDay: number; confidence: OpportunitiesResult["confidence"]; debug: Record<string, unknown> } {
  const baseDays = Math.max(1, safeNumber(overview?.days, 28));

  const totals = overview?.totals || {};
  const sessions = safeNumber(totals.sessions);
  const pageviews = safeNumber(totals.pageviews);
  const clicks = safeNumber(totals.clicks);
  const engagementRate = clamp(safeNumber(totals.engagementRate, 0.45), 0, 1);
  const avgSessionDurationSec = clamp(safeNumber(totals.avgSessionDuration, 110), 10, 600);

  // GA4 traffic mix: direct share is a proxy for notoriety / bouche-à-oreille / lien partagé.
  const channels: Array<{ name: string; sessions: number }> = Array.isArray(overview?.channels) ? overview.channels : [];
  const direct = channels.find((c) => (c?.name || "").toLowerCase().includes("direct"));
  const directSessions = safeNumber(direct?.sessions);
  const directShare = sessions > 0 ? clamp(directSessions / sessions, 0, 1) : 0;

  // GSC business intent: queries that look like someone who wants a quote / price / nearby.
  const topQueries: Array<{ query: string; clicks?: number; impressions?: number }> = Array.isArray(overview?.topQueries)
    ? overview.topQueries
    : [];
  const intentClicks = topQueries
    .filter((q) => isIntentQuery(q?.query || ""))
    .reduce((sum, q) => sum + safeNumber(q?.clicks), 0);

  // High-value pages (contact, pricing, service) increase opportunity potential.
  const topPages: Array<{ path: string; views: number }> = Array.isArray(overview?.topPages) ? overview.topPages : [];
  const pageWeight = topPages.reduce((sum, p) => {
    const kind = pageKind(p?.path || "");
    const v = safeNumber(p?.views);
    if (kind == "contact") return sum + v * 1.2;
    if (kind == "pricing") return sum + v * 1.1;
    if (kind == "service") return sum + v * 1.0;
    return sum + v * 0.6;
  }, 0);

  // Boosts for connected acquisition channels (GMB / Facebook / Instagram / LinkedIn)
  // /api/stats/overview exposes connection state + (when available) channel metrics under `sources.*.metrics`.
  const sourcesStatus = overview?.sources || {};
  const gmbMetricsTotals = sourcesStatus?.gmb?.metrics?.totals || {};
  const fbMetricsTotals = sourcesStatus?.facebook?.metrics?.totals || {};
  const igMetricsTotals = sourcesStatus?.instagram?.metrics?.totals || {};
  const liMetricsTotals = sourcesStatus?.linkedin?.metrics?.totals || {};

  // Turn social/local actions into a comparable "intent" signal.
  // The weights are intentionally conservative to avoid overestimating.
  const gmbActions =
    safeNumber(gmbMetricsTotals.websiteClicks) +
    safeNumber(gmbMetricsTotals.callClicks) +
    safeNumber(gmbMetricsTotals.directions) +
    safeNumber(gmbMetricsTotals.directionRequests) +
    safeNumber(gmbMetricsTotals.website_clicks) +
    safeNumber(gmbMetricsTotals.call_clicks);

  const fbActions =
    safeNumber(fbMetricsTotals.page_website_clicks_logged_in_unique) +
    safeNumber(fbMetricsTotals.page_call_phone_clicks_logged_in_unique) +
    safeNumber(fbMetricsTotals.page_get_directions_clicks_logged_in_unique) +
    safeNumber(fbMetricsTotals.page_engaged_users) * 0.05 +
    safeNumber(fbMetricsTotals.page_views_total) * 0.02;

  const igActions =
    safeNumber(igMetricsTotals.website_clicks) +
    safeNumber(igMetricsTotals.phone_call_clicks) +
    safeNumber(igMetricsTotals.email_contacts) +
    safeNumber(igMetricsTotals.get_direction_clicks) +
    safeNumber(igMetricsTotals.profile_views) * 0.05;

  const liActions =
    safeNumber(liMetricsTotals.clickCount) +
    (safeNumber(liMetricsTotals.likeCount) + safeNumber(liMetricsTotals.commentCount) + safeNumber(liMetricsTotals.shareCount)) * 0.15;

  const channelActionsPerDay = (gmbActions + fbActions + igActions + liActions) / baseDays;

  // Normalize signals.
  const trafficScore = clamp((sessions / baseDays) / 50, 0, 1); // 50 sessions/day -> 1
  const intentScore = clamp((intentClicks / baseDays) / 3, 0, 1); // 3 intent clicks/day -> 1
  const depthScore = clamp((pageviews / Math.max(1, sessions)) / 2.2, 0, 1);
  const durationScore = clamp(avgSessionDurationSec / 180, 0, 1);

  // Blend into a business opportunity index.
  // Goal: "motivating but real"; never explode on small sites.
  const baseIndex =
    0.35 * trafficScore +
    0.25 * intentScore +
    0.15 * engagementRate +
    0.10 * depthScore +
    0.10 * durationScore +
    0.05 * clamp(directShare / 0.6, 0, 1);

  // Convert index into opportunities/day.
  // - small sites still show something if there is intent
  // - larger sites scale smoothly
  const rawPerDay =
    (
      (sessions / baseDays) * 0.08 +
      (clicks / baseDays) * 0.12 +
      (intentClicks / baseDays) * 0.30 +
      channelActionsPerDay * 0.35
    ) *
    (0.6 + baseIndex);

  const perDay = clamp(rawPerDay, 0, 999);

  const confidence: OpportunitiesResult["confidence"] =
    sessions >= 300 ? "high" : sessions >= 120 ? "medium" : "low";

  const debug = {
    baseDays,
    sessions,
    clicks,
    intentClicks,
    engagementRate,
    avgSessionDurationSec,
    directShare,
    pageWeight,
    trafficScore,
    intentScore,
    depthScore,
    durationScore,
    baseIndex,
    gmbActions,
    fbActions,
    igActions,
    liActions,
    channelActionsPerDay,
    rawPerDay,
    perDay,
    confidence,
  };

  return { perDay, confidence, debug };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    // IMPORTANT:
    // The pro wants 3 *real* windows:
    // - "Aujourd'hui"  : use last 72h to compensate GA4/GSC lag, then normalize to 1 day
    // - "7 jours"      : use last 7 days (real)
    // - "30 jours"     : use last 30 days (real)
    // We still compute an opportunity *index/day* (computeOpportunities), but each window
    // uses its own underlying dataset so we don't just multiply the same number.

    // Allow explicit overrides (useful for Générateur windows)
    const qMode = (url.searchParams.get("mode") || "").toLowerCase();
    const qToday = Number(url.searchParams.get("todayDays") || "0") || 0;
    const qWeek = Number(url.searchParams.get("weekDays") || "0") || 0;
    const qMonth = Number(url.searchParams.get("monthDays") || url.searchParams.get("days") || "0") || 0;

    // Defaults
    const todayDays = qToday > 0 ? qToday : qMode === "generator" ? 2 : 3;
    const weekDays = qWeek > 0 ? qWeek : 7;
    const monthDays = qMonth > 0 ? qMonth : qMode === "generator" ? 28 : 30;

    const origin = url.origin;
    const cookie = request.headers.get("cookie") || "";

    const fetchOverview = async (days: number) => {
      const res = await fetch(`${origin}/api/stats/overview?days=${days}`, {
        headers: { cookie },
        cache: "no-store",
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`overview_fetch_failed:${days}:${res.status}:${txt.slice(0, 180)}`);
      }
      return (await res.json()) as OverviewResponse;
    };

    const [ovToday, ovWeek, ovMonth] = await Promise.all([
      fetchOverview(todayDays),
      fetchOverview(weekDays),
      fetchOverview(monthDays),
    ]);

    const todayCalc = computeOpportunities(ovToday);
    const weekCalc = computeOpportunities(ovWeek);
    const monthCalc = computeOpportunities(ovMonth);

    const result: OpportunitiesResult = {
      baseDays: monthDays,
      // normalize to the label window
      today: Math.max(0, Math.ceil(todayCalc.perDay * 1)),
      week: Math.max(0, Math.ceil(weekCalc.perDay * weekDays)),
      month: Math.max(0, Math.ceil(monthCalc.perDay * monthDays)),
      confidence: monthCalc.confidence,
      debug:
        url.searchParams.get("debug") === "1"
          ? {
              todayDays,
              weekDays,
              monthDays,
              today: todayCalc.debug,
              week: weekCalc.debug,
              month: monthCalc.debug,
            }
          : undefined,
    };

    return NextResponse.json(result);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: "inrstats_opportunities_failed", message: e?.message || String(e) },
      { status: 500 }
    );
  }
}
