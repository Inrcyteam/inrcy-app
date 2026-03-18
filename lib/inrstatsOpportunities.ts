export type CubeKey = 'site_inrcy' | 'site_web' | 'gmb' | 'facebook' | 'instagram' | 'linkedin';

export type Overview = {
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
  topPages?: Array<{ path: string; views?: number }>;
  topQueries?: Array<{ query: string; clicks?: number; impressions?: number }>;
  channels?: Array<{ channel?: string; sessions?: number; key?: string; value?: number; name?: string }>;
  sources?: Record<string, { connected?: unknown; metrics?: Record<string, unknown> | null }>;
};

export const ALL_CUBES: CubeKey[] = ['site_inrcy', 'site_web', 'gmb', 'facebook', 'instagram', 'linkedin'];
export const EMPTY_CUBE_RECORD: Record<CubeKey, number> = {
  site_inrcy: 0,
  site_web: 0,
  gmb: 0,
  facebook: 0,
  instagram: 0,
  linkedin: 0,
};

function safeNum(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function safeObj(v: unknown): Record<string, any> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {};
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function logNorm(x: number, ref: number) {
  const xx = Math.max(0, x);
  const rr = Math.max(1, ref);
  return clamp(Math.log1p(xx) / Math.log1p(rr), 0, 1);
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

function isCubeConnected(cube: CubeKey, ov: Overview | null | undefined): boolean {
  if (!ov) return false;
  const sources = safeObj(ov.sources);
  if (cube === 'site_inrcy' || cube === 'site_web') {
    const conn = safeObj(safeObj(sources[cube]).connected);
    return Boolean(conn.ga4) && Boolean(conn.gsc);
  }
  return Boolean(safeObj(sources[cube]).connected);
}

function pageKind(path: string) {
  const p = (path || '').toLowerCase();
  if (p.includes('contact') || p.includes('devis') || p.includes('rdv') || p.includes('rendez')) return 'contact';
  return 'other';
}

function isIntentQuery(q: string) {
  const s = (q || '').toLowerCase();
  return /\b(devis|tarif|prix|contact|telephone|t[ée]l|rdv|rendez|urgence|près|proche)\b/.test(s);
}

function directShareFromChannels(ov: Overview, sessionsTotal: number) {
  const channels = Array.isArray(ov.channels) ? ov.channels : [];
  const directObj = channels.find((c) => ((c?.channel || c?.key || c?.name || '')).toLowerCase().includes('direct'));
  const directSessions = safeNum(directObj?.sessions ?? directObj?.value);
  if (sessionsTotal > 0) return clamp(directSessions / sessionsTotal, 0, 1);
  return 0;
}

function computeOpportunityPerDaySocial(cubeKey: CubeKey, ov: Overview): number {
  const baseDays = Math.max(1, safeNum(ov.days) || 30);
  const src = safeObj(ov.sources);
  const node = safeObj(src[cubeKey]);
  const connected = Boolean(node.connected);
  const m = node.metrics;
  if (!connected) return 0;

  const coldStartBaseline = cubeKey === 'instagram' ? 0.18 : cubeKey === 'linkedin' ? 0.12 : 0.2;
  if (!m || safeObj(m).error) return coldStartBaseline;

  const impressionsTotal = getTotalMetric(m, ['impressions', 'post_impressions', 'postImpressions', 'post_impressions_sum', 'IMPRESSIONS', 'impressionCount', 'viewerImpressions', 'reach', 'REACH']) || 0;
  const engagementsTotal = getTotalMetric(m, ['engagements', 'post_engagements', 'postEngagements', 'ENGAGEMENTS', 'total_engagements', 'page_engaged_users', 'post_engaged_users_sum', 'reactions', 'comments', 'shares', 'likes', 'saves', 'replies', 'video_views', 'videoViews']) || 0;
  const ctaClicksTotal = getTotalMetric(m, ['cta_clicks', 'ctaClicks', 'link_clicks', 'linkClicks', 'website_clicks', 'websiteClicks', 'page_website_clicks_logged_in_unique', 'WEBSITE_CLICKS', 'CLICK_COUNT', 'clickCount', 'clicks', 'outbound_clicks', 'outboundClicks']) || 0;
  const audienceTotal = getTotalMetric(m, ['followers', 'followerCount', 'follower_count', 'followers_count', 'fans', 'fanCount', 'fan_count', 'audience', 'subscribers']) || 0;

  const impressionsPerDay = impressionsTotal / baseDays;
  const engagementsPerDay = engagementsTotal / baseDays;
  const ctaClicksPerDay = ctaClicksTotal / baseDays;

  const refs = cubeKey === 'instagram'
    ? { imp: 2500, eng: 120, cta: 6, aud: 3000 }
    : cubeKey === 'linkedin'
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

function computeOpportunityPerDayWeb(ov: Overview) {
  const baseDays = Math.max(1, safeNum(ov.days) || 30);
  const totals = ov.totals || {};
  const sessions = safeNum(totals.sessions);
  const clicks = safeNum(totals.clicks);
  const engagementRate = clamp(safeNum(totals.engagementRate), 0, 1);
  const avgSessionDurationSec = safeNum(totals.avgSessionDuration);
  const directShare = directShareFromChannels(ov, sessions);
  const topQueries = Array.isArray(ov.topQueries) ? ov.topQueries : [];
  const intentClicks = topQueries.filter((q) => isIntentQuery(String(q.query || ''))).reduce((s, q) => s + safeNum(q.clicks), 0);
  const topPages = Array.isArray(ov.topPages) ? ov.topPages : [];
  const contactViews = topPages.filter((p) => pageKind(String(p.path || '')) === 'contact').reduce((s, p) => s + safeNum(p.views), 0);
  const trafficScore = clamp((sessions / baseDays) / 50, 0, 1);
  const intentScore = clamp((intentClicks / baseDays) / 3, 0, 1);
  const durationScore = clamp(avgSessionDurationSec / 180, 0, 1);
  const baseIndex = 0.45 * trafficScore + 0.3 * intentScore + 0.15 * engagementRate + 0.10 * durationScore;
  const rawPerDay = ((sessions / baseDays) * 0.08 + (clicks / baseDays) * 0.10 + (intentClicks / baseDays) * 0.32 + (contactViews / baseDays) * 0.05) * (0.65 + baseIndex) * (0.85 + clamp(directShare / 0.65, 0, 1) * 0.20);
  return clamp(rawPerDay, 0, 999);
}

export function computeOpportunity30(cubeKey: CubeKey, ov: Overview | null | undefined) {
  if (!ov || !isCubeConnected(cubeKey, ov)) return 0;
  if (cubeKey === 'gmb') {
    const gmb = ov.sources?.gmb;
    const connected = !!gmb?.connected;
    if (!connected) return 0;
    const m = gmb?.metrics;
    const totals = safeObj(m?.totals);
    const hasError = !!safeObj(m).error;
    const base = hasError || !m ? 0.8 : 1.2;
    const impressionsGuess = safeNum(totals.BUSINESS_IMPRESSIONS_DESKTOP_MAPS) + safeNum(totals.BUSINESS_IMPRESSIONS_MOBILE_MAPS);
    const interactionsGuess = safeNum(totals.WEBSITE_CLICKS) + safeNum(totals.CALL_CLICKS) + safeNum(totals.DIRECTION_REQUESTS);
    const perDay = clamp(base + impressionsGuess / 800 + interactionsGuess / 30, 0, 50);
    return Math.max(0, Math.round(perDay * 30));
  }
  if (cubeKey === 'facebook' || cubeKey === 'instagram' || cubeKey === 'linkedin') {
    return Math.max(0, Math.round(computeOpportunityPerDaySocial(cubeKey, ov) * 30));
  }
  return Math.max(0, Math.round(computeOpportunityPerDayWeb(ov) * 30));
}

export function computeOpportunitySnapshot(overviews: Partial<Record<CubeKey, Overview | null | undefined>>) {
  const byCube = { ...EMPTY_CUBE_RECORD };
  for (const cube of ALL_CUBES) {
    byCube[cube] = computeOpportunity30(cube, overviews[cube]);
  }
  const total = Object.values(byCube).reduce((sum, value) => sum + value, 0);
  return { total, byCube };
}
