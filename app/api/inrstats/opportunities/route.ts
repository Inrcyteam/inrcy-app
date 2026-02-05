import { NextResponse } from "next/server";

// iNrCy: single source of truth for "opportunités".
// Used by:
// - /dashboard/stats (iNr'Stats)
// - /api/generator/kpis (home generator KPIs)

type OverviewResponse = any;

type OpportunitiesResult = {
  baseDays: number;
  today: number;
  week: number;
  month: number;
  confidence: "low" | "medium" | "high";
  debug?: Record<string, any>;
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

function computeOpportunities(overview: OverviewResponse): { perDay: number; confidence: OpportunitiesResult["confidence"]; debug: Record<string, any> } {
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

  // Boosts for connected acquisition channels (GMB / Facebook) – even if we don't fetch their metrics yet.
  const sourcesStatus = overview?.sourcesStatus || {};
  const gmbBoost = sourcesStatus?.gmb?.connected ? 1.08 : 1.0;
  const fbBoost = sourcesStatus?.facebook?.connected ? 1.04 : 1.0;

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

  const multiplier = gmbBoost * fbBoost;

  // Convert index into opportunities/day.
  // - small sites still show something if there is intent
  // - larger sites scale smoothly
  const rawPerDay = ((sessions / baseDays) * 0.08 + (clicks / baseDays) * 0.12 + (intentClicks / baseDays) * 0.30) * (0.6 + baseIndex) * multiplier;

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
    gmbBoost,
    fbBoost,
    multiplier,
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

    const monthDays = Math.max(1, Math.min(90, Number(url.searchParams.get("days") || "30") || 30));
    const todayDays = 3;
    const weekDays = 7;

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
  } catch (e: any) {
    return NextResponse.json(
      { error: "inrstats_opportunities_failed", message: e?.message || String(e) },
      { status: 500 }
    );
  }
}
