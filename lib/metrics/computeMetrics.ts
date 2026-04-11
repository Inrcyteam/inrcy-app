import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildStatsOverview, type OverviewPayload } from '@/lib/stats/buildOverview';

export type Period = 7 | 30 | 60 | 90;
export type CubeKey = 'site_inrcy' | 'site_web' | 'gmb' | 'facebook' | 'instagram' | 'linkedin';

export type Overview = {
  days: number;
  business?: { sectorCategory?: string | null; profession?: string | null };
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
  topQueries?: Array<{ query: string; clicks?: number; impressions?: number }>;
  channels?: Array<{ channel?: string; sessions?: number; key?: string; value?: number; name?: string }>;
  sources?: Record<string, { connected?: unknown; metrics?: unknown | null }>;
};

export type OpportunitiesSnapshot = {
  days: number;
  total: number;
  byCube: Record<CubeKey, number>;
};

export type InrstatsOpportunitiesSnapshot = {
  baseDays: number;
  today: number;
  week: number;
  month: number;
  total: number;
  byCube: Record<CubeKey, number>;
  confidence: 'low' | 'medium' | 'high';
};

export type HistorySnapshot = {
  days: number;
  total: number;
  perTool: Record<CubeKey, number>;
  model: string;
};

export const CUBES: CubeKey[] = ['site_inrcy', 'site_web', 'gmb', 'facebook', 'instagram', 'linkedin'];

export const EMPTY_CUBE_RECORD: Record<CubeKey, number> = {
  site_inrcy: 0,
  site_web: 0,
  gmb: 0,
  facebook: 0,
  instagram: 0,
  linkedin: 0,
};

export const INCLUDE_BY_CUBE: Record<CubeKey, string> = {
  site_inrcy: 'site_inrcy_ga4,site_inrcy_gsc',
  site_web: 'site_web_ga4,site_web_gsc',
  gmb: 'gmb',
  facebook: 'facebook',
  instagram: 'instagram',
  linkedin: 'linkedin',
};

export function safeNum(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function safeObj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function roundNonNeg(n: number): number {
  return Math.max(0, Math.round(n));
}

function logNorm(x: number, ref: number) {
  const xx = Math.max(0, x);
  const rr = Math.max(1, ref);
  return clamp(Math.log1p(xx) / Math.log1p(rr), 0, 1);
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
  const overrides = GSC_OPPORTUNITY_CONFIG_BY_SECTOR[String(sectorCategory || '').trim()] || {};
  return { ...DEFAULT_GSC_OPPORTUNITY_CONFIG, ...overrides };
}

export function getTotalMetric(metrics: unknown, keys: string[]): number {
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

export function isCubeConnected(cube: CubeKey, ov: Overview): boolean {
  const sources = safeObj(ov?.sources);
  if (cube === 'site_inrcy' || cube === 'site_web') {
    const conn = safeObj(safeObj(sources[cube]).connected);
    return Boolean(conn.ga4) || Boolean(conn.gsc);
  }
  return Boolean(safeObj(sources[cube]).connected);
}

function estimateEngagedSessions(ov: Overview): number {
  const sessions = safeNum(ov?.totals?.sessions);
  const er = safeNum(ov?.totals?.engagementRate);
  if (sessions <= 0 || er <= 0) return 0;
  return sessions * clamp(er, 0, 1);
}

const CAP_MULTIPLIER_WHEN_STRONG_SIGNAL = 3;
export const CAPTURED_MODEL_VERSION = 'captured_v2.3';

export function computeCapturedForCube(cube: CubeKey, ov: Overview): number {
  if (!isCubeConnected(cube, ov)) return 0;
  const sources = safeObj(ov?.sources);

  const clicks = safeNum(ov?.totals?.clicks);
  const impressions = safeNum(ov?.totals?.impressions);
  const pageviews = safeNum(ov?.totals?.pageviews);
  const engagedSessions = estimateEngagedSessions(ov);

  if (cube === 'site_inrcy' || cube === 'site_web') {
    const ga4Key = cube === 'site_inrcy' ? 'site_inrcy_ga4' : 'site_web_ga4';
    const ga4 = safeObj(sources[ga4Key]);
    const convStrong = getTotalMetric(ga4.metrics, ['conversions', 'conversionCount', 'leads', 'leadCount']) || 0;
    const estimate = clicks * 0.12 + pageviews * 0.03 + engagedSessions * 0.08 + impressions * 0.003;
    if (convStrong > 0) {
      const capped = Math.min(convStrong * CAP_MULTIPLIER_WHEN_STRONG_SIGNAL, Math.max(convStrong, estimate));
      return roundNonNeg(capped);
    }
    return roundNonNeg(estimate);
  }

  if (cube === 'gmb') {
    const gmbNode = safeObj(sources.gmb);
    const m = gmbNode.metrics;
    const calls = getTotalMetric(m, ['calls', 'phone_calls', 'phoneCalls', 'call_clicks', 'callClicks', 'CALL_CLICKS']);
    const website = getTotalMetric(m, ['website_clicks', 'websiteClicks', 'website_actions', 'websiteActions', 'WEBSITE_CLICKS']);
    const directions = getTotalMetric(m, ['directions', 'direction_requests', 'directionRequests', 'driving_directions', 'drivingDirections', 'DIRECTION_REQUESTS']);
    const strong = calls + website + directions;
    const gmbImpr = getTotalMetric(m, [
      'impressions', 'business_impressions', 'BUSINESS_IMPRESSIONS', 'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
      'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH', 'BUSINESS_IMPRESSIONS_MOBILE_MAPS', 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
      'views', 'viewCount',
    ]);
    const estimate = strong + clicks * 0.08 + gmbImpr * 0.002;
    if (strong > 0) {
      const capped = Math.min(strong * CAP_MULTIPLIER_WHEN_STRONG_SIGNAL, estimate);
      return roundNonNeg(capped);
    }
    return roundNonNeg(estimate);
  }

  if (cube === 'facebook' || cube === 'instagram' || cube === 'linkedin') {
    const socialNode = safeObj(sources[cube]);
    const m = socialNode.metrics;
    const messages = getTotalMetric(m, [
      'messages', 'message_count', 'messageCount', 'conversations', 'conversations_started', 'conversationsStarted', 'text_message_clicks',
    ]);
    const engagements = getTotalMetric(m, [
      'engagements', 'post_engaged_users', 'page_engaged_users', 'post_engaged_users_sum', 'likes', 'comments', 'shares', 'saves',
    ]);
    const reach = getTotalMetric(m, ['reach', 'uniqueReach', 'unique_reach']);
    const profileViews = getTotalMetric(m, ['profile_views', 'profileVisits', 'profile_visits', 'profileViews']);
    const searchAppearances = getTotalMetric(m, ['searchAppearances', 'search_appearances']);
    const socialImpr = getTotalMetric(m, ['impressions', 'post_impressions_sum', 'post_impressions', 'views', 'video_views', 'impressionCount', 'uniqueImpressionsCount']);
    const fbPageViews = cube === 'facebook' ? getTotalMetric(m, ['page_views_total']) : 0;
    const igReach = cube === 'instagram' ? getTotalMetric(m, ['reach', 'uniqueReach', 'unique_reach']) : 0;
    const igProfileViews = cube === 'instagram' ? getTotalMetric(m, ['profile_views', 'profileVisits', 'profile_visits', 'profile_links_taps']) : 0;
    const liPageViews = cube === 'linkedin' ? getTotalMetric(m, ['pageViews']) : 0;
    const liFollowerCount = cube === 'linkedin' ? getTotalMetric(m, ['followerCount', 'memberFollowersCount']) : 0;

    if (cube === 'instagram') {
      const directSignals =
        messages +
        getTotalMetric(m, [
          'profile_links_taps', 'website_clicks', 'websiteClicks', 'phone_call_clicks', 'email_contacts',
          'text_message_clicks', 'get_directions_clicks', 'get_direction_clicks',
        ]);
      const profileIntent =
        getTotalMetric(m, ['profile_activity']) * 1.35 +
        getTotalMetric(m, ['profile_visits', 'profileVisits']) * 1.25 +
        getTotalMetric(m, ['profile_views', 'profileViews']) * 0.9;
      const communityIntent =
        getTotalMetric(m, ['replies']) * 1.0 +
        getTotalMetric(m, ['comments']) * 0.5 +
        getTotalMetric(m, ['shares']) * 0.4 +
        getTotalMetric(m, ['saved', 'saves']) * 0.35 +
        getTotalMetric(m, ['likes']) * 0.12 +
        getTotalMetric(m, ['follows', 'follower_count']) * 0.2;
      const visibilityAssist =
        igReach * 0.012 +
        socialImpr * 0.006 +
        getTotalMetric(m, ['accounts_engaged']) * 0.08 +
        getTotalMetric(m, ['total_interactions']) * 0.08;
      const estimate = directSignals + profileIntent + communityIntent + visibilityAssist;
      if (directSignals > 0) {
        const capped = Math.min(directSignals * CAP_MULTIPLIER_WHEN_STRONG_SIGNAL + profileIntent * 1.0 + communityIntent * 0.35, estimate);
        return roundNonNeg(capped);
      }
      return roundNonNeg(estimate);
    }

    if (cube === 'linkedin') {
      const liComments = getTotalMetric(m, ['commentCount', 'comments']);
      const liShares = getTotalMetric(m, ['shareCount', 'shares']);
      const liLikes = getTotalMetric(m, ['likeCount', 'likes', 'reactions']);
      const liNewFollowers = getTotalMetric(m, ['newFollowers']);
      const liPostsPublished = getTotalMetric(m, ['postsPublished']);
      const liUniqueImpr = getTotalMetric(m, ['uniqueImpressionsCount']);
      const liClicks = getTotalMetric(m, [
        'cta_clicks', 'ctaClicks', 'link_clicks', 'linkClicks', 'website_clicks', 'websiteClicks', 'clickCount', 'clicks',
        'outbound_clicks', 'outboundClicks', 'profile_views', 'profileVisits', 'profile_visits', 'searchAppearances', 'search_appearances',
      ]);
      const directSignals =
        messages +
        liClicks +
        profileViews * 0.75 +
        searchAppearances * 0.6 +
        liPageViews * 0.35;
      const memberRawScore =
        liComments * 3.5 +
        liShares * 2.5 +
        liNewFollowers * 2.0 +
        liLikes * 0.6 +
        liPostsPublished * 0.5 +
        liUniqueImpr * 0.015 +
        socialImpr * 0.005;
      const memberEstimate = memberRawScore / 2.5;
      const hasAnySignal =
        liPostsPublished > 0 ||
        liComments > 0 ||
        liShares > 0 ||
        liLikes > 0 ||
        liNewFollowers > 0 ||
        directSignals > 0;
      console.log('[LinkedIn][Captured][inputs]', JSON.stringify({
        comments: liComments,
        shares: liShares,
        likes: liLikes,
        newFollowers: liNewFollowers,
        postsPublished: liPostsPublished,
        uniqueImpressions: liUniqueImpr,
        socialImpressions: socialImpr,
        profileViews,
        searchAppearances,
        pageViews: liPageViews,
        clicks: liClicks,
        directSignals,
        memberRawScore,
        memberEstimate,
        hasAnySignal,
      }));
      if (!hasAnySignal) return 0;
      const estimate = directSignals + memberEstimate;
      if (directSignals > 0) {
        const capped = Math.min(directSignals * CAP_MULTIPLIER_WHEN_STRONG_SIGNAL + memberEstimate * 0.5, estimate);
        console.log('[LinkedIn][Captured][result]', JSON.stringify({ estimate, capped, rounded: roundNonNeg(capped) }));
        return roundNonNeg(capped);
      }
      console.log('[LinkedIn][Captured][result]', JSON.stringify({ estimate: memberEstimate, rounded: roundNonNeg(memberEstimate) }));
      return roundNonNeg(memberEstimate);
    }

    const ctaClicks = getTotalMetric(m, [
      'cta_clicks', 'ctaClicks', 'link_clicks', 'linkClicks', 'website_clicks', 'websiteClicks', 'clickCount', 'clicks',
      'outbound_clicks', 'outboundClicks', 'page_website_clicks_logged_in_unique', 'page_website_clicks',
      'page_call_phone_clicks', 'page_call_phone_clicks_logged_in_unique', 'page_get_directions_clicks',
      'page_get_directions_clicks_logged_in_unique', 'phone_call_clicks', 'email_contacts', 'text_message_clicks',
      'get_directions_clicks', 'get_direction_clicks', 'profile_views', 'profileVisits', 'profile_visits', 'searchAppearances', 'search_appearances',
    ]);
    const strong = messages + ctaClicks;
    const fallbackPresence = fbPageViews > 0 ? 1 : 0;
    const estimate = Math.max(
      fallbackPresence,
      strong + clicks * 0.05 + engagements * 0.03 + reach * 0.001 + socialImpr * 0.001 + fbPageViews * 0.04 + profileViews * 0.06 + searchAppearances * 0.03 + liPageViews * 0.04 + liFollowerCount * 0.002
    );
    if (strong > 0) {
      const capped = Math.min(strong * CAP_MULTIPLIER_WHEN_STRONG_SIGNAL, estimate);
      return roundNonNeg(capped);
    }
    return roundNonNeg(estimate);
  }

  return 0;
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

export function computeOpportunityPerDaySocial(cubeKey: CubeKey, ov: Overview): number {
  const baseDays = Math.max(1, safeNum(ov.days) || 30);
  const src = safeObj(ov.sources);
  const node = safeObj(src[cubeKey]);
  const connected = Boolean(node.connected);
  const m = node.metrics;
  if (!connected) return 0;

  const coldStartBaseline = cubeKey === 'instagram' ? 0.18 : cubeKey === 'linkedin' ? 0.12 : 0.20;
  if (!m || safeObj(m).error) return coldStartBaseline;

  const impressionsTotal = getTotalMetric(m, ['impressions', 'post_impressions', 'postImpressions', 'post_impressions_sum', 'IMPRESSIONS', 'impressionCount', 'viewerImpressions', 'reach', 'REACH']) || 0;
  const engagementsTotal = getTotalMetric(m, ['engagements', 'post_engagements', 'postEngagements', 'ENGAGEMENTS', 'total_engagements', 'page_engaged_users', 'post_engaged_users_sum', 'reactions', 'comments', 'shares', 'likes', 'saves', 'replies', 'video_views', 'videoViews']) || 0;
  const ctaClicksTotal = getTotalMetric(m, ['cta_clicks', 'ctaClicks', 'link_clicks', 'linkClicks', 'website_clicks', 'websiteClicks', 'page_website_clicks_logged_in_unique', 'WEBSITE_CLICKS', 'CLICK_COUNT', 'clickCount', 'clicks', 'outbound_clicks', 'outboundClicks', 'profile_links_taps', 'profile_visits', 'profile_activity']) || 0;
  const audienceTotal = getTotalMetric(m, ['followers', 'followerCount', 'follower_count', 'followers_count', 'fans', 'fanCount', 'fan_count', 'audience', 'subscribers']) || 0;

  const impressionsPerDay = impressionsTotal / baseDays;
  const engagementsPerDay = engagementsTotal / baseDays;
  const ctaClicksPerDay = ctaClicksTotal / baseDays;

  if (cubeKey === 'linkedin') {
    const commentsTotal = getTotalMetric(m, ['commentCount', 'comments']);
    const sharesTotal = getTotalMetric(m, ['shareCount', 'shares']);
    const likesTotal = getTotalMetric(m, ['likeCount', 'likes', 'reactions']);
    const newFollowersTotal = getTotalMetric(m, ['newFollowers']);
    const postsPublishedTotal = getTotalMetric(m, ['postsPublished']);
    const uniqueImpressionsTotal = getTotalMetric(m, ['uniqueImpressionsCount']);

    const currentPerDay = clamp(
      0.03 +
        (commentsTotal / baseDays) * 0.22 +
        (sharesTotal / baseDays) * 0.18 +
        (newFollowersTotal / baseDays) * 0.14 +
        (likesTotal / baseDays) * 0.05 +
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
    console.log('[LinkedIn][Opportunity][inputs]', JSON.stringify({
      baseDays,
      commentsTotal,
      sharesTotal,
      likesTotal,
      newFollowersTotal,
      postsPublishedTotal,
      uniqueImpressionsTotal,
      impressionsTotal,
      engagementsTotal,
      audienceTotal,
      currentPerDay,
      publishTarget,
      publishDeficit,
      exposureN,
      engagementN,
      audienceN,
      audienceHeadroom,
      potentialPerDay,
      additionalPerDay,
    }));
    return clamp(additionalPerDay, 0, 2.2);
  }

  const refs = cubeKey === 'instagram'
    ? { imp: 2500, eng: 120, cta: 6, aud: 3000 }
    : { imp: 3000, eng: 90, cta: 5, aud: 5000 };

  const exposureN = logNorm(impressionsPerDay, refs.imp);
  const engagementN = logNorm(engagementsPerDay, refs.eng);
  const intentN = logNorm(ctaClicksPerDay, refs.cta);
  const audienceN = logNorm(audienceTotal, refs.aud);

  const currentPerDay = clamp(0.02 + 0.20 * intentN + 0.12 * engagementN + 0.06 * exposureN + 0.04 * audienceN, 0, 1.6);
  const uplift = clamp(0.35 + 0.35 * (1 - intentN) + 0.20 * (1 - exposureN), 0.35, 0.90);
  const histWeight = clamp(exposureN * 0.7 + intentN * 0.3, 0, 1);
  const base = histWeight * currentPerDay + (1 - histWeight) * coldStartBaseline;
  const potentialPerDay = clamp(base * (1 + uplift), coldStartBaseline, 2.5);
  const additionalPerDay = Math.max(0, potentialPerDay - currentPerDay);

  return clamp(additionalPerDay, 0, 2.5);
}

export function computeOpportunityPerDayWeb(ov: Overview) {
  const baseDays = Math.max(1, safeNum(ov.days) || 30);
  const totals = ov.totals || {};
  const sessions = safeNum(totals.sessions);
  const clicks = safeNum(totals.clicks);
  const impressions = safeNum(totals.impressions);
  const ctr = clamp(safeNum(totals.ctr), 0, 1);
  const engagementRate = clamp(safeNum(totals.engagementRate), 0, 1);
  const avgSessionDurationSec = safeNum(totals.avgSessionDuration);
  const directShare = directShareFromChannels(ov, sessions);
  const topQueries = Array.isArray(ov.topQueries) ? ov.topQueries : [];
  const intentClicks = topQueries.filter((q) => isIntentQuery(q.query)).reduce((s, q) => s + safeNum(q.clicks), 0);
  const topPages = Array.isArray(ov.topPages) ? ov.topPages : [];
  const contactViews = topPages.filter((p) => pageKind(p.path) === 'contact').reduce((s, p) => s + safeNum(p.views), 0);
  const trafficScore = clamp((sessions / baseDays) / 50, 0, 1);
  const intentScore = clamp((intentClicks / baseDays) / 3, 0, 1);
  const durationScore = clamp(avgSessionDurationSec / 180, 0, 1);
  const baseIndex = 0.45 * trafficScore + 0.30 * intentScore + 0.15 * engagementRate + 0.10 * durationScore;
  let rawPerDay = ((sessions / baseDays) * 0.08 + (clicks / baseDays) * 0.10 + (intentClicks / baseDays) * 0.32 + (contactViews / baseDays) * 0.05) * (0.65 + baseIndex) * (0.85 + clamp(directShare / 0.65, 0, 1) * 0.20);

  const sources = safeObj(ov.sources);
  const siteInrcyConn = safeObj(safeObj(sources.site_inrcy).connected);
  const siteWebConn = safeObj(safeObj(sources.site_web).connected);
  const gscConnected = Boolean(siteInrcyConn.gsc) || Boolean(siteWebConn.gsc);

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

export function computeOpportunity30(cubeKey: CubeKey, ov: Overview) {
  if (!isCubeConnected(cubeKey, ov)) return 0;
  if (cubeKey === 'gmb') {
    const gmb = ov.sources?.gmb;
    const connected = !!gmb?.connected;
    if (!connected) return 0;
    const rawMetrics = gmb?.metrics;
    const m = safeObj(rawMetrics);
    const totals = safeObj(m.totals);
    const hasError = !!m.error;
    const base = hasError || !rawMetrics ? 0.8 : 1.2;
    const impressionsGuess =
      safeNum(totals.impressions) ||
      safeNum(totals.BUSINESS_IMPRESSIONS) ||
      (safeNum(totals.BUSINESS_IMPRESSIONS_DESKTOP_MAPS) +
        safeNum(totals.BUSINESS_IMPRESSIONS_MOBILE_MAPS) +
        safeNum(totals.BUSINESS_IMPRESSIONS_DESKTOP_SEARCH) +
        safeNum(totals.BUSINESS_IMPRESSIONS_MOBILE_SEARCH));
    const interactionsGuess =
      (safeNum(totals.websiteClicks) || safeNum(totals.website_clicks) || safeNum(totals.WEBSITE_CLICKS)) +
      (safeNum(totals.callClicks) || safeNum(totals.call_clicks) || safeNum(totals.CALL_CLICKS)) +
      (safeNum(totals.directionRequests) || safeNum(totals.direction_requests) || safeNum(totals.DIRECTION_REQUESTS));
    const perDay = clamp(base + impressionsGuess / 800 + interactionsGuess / 30, 0, 50);
    return Math.max(0, Math.round(perDay * 30));
  }
  if (cubeKey === 'facebook' || cubeKey === 'instagram' || cubeKey === 'linkedin') {
    return Math.max(0, Math.round(computeOpportunityPerDaySocial(cubeKey, ov) * 30));
  }
  return Math.max(0, Math.round(computeOpportunityPerDayWeb(ov) * 30));
}

export function computeOpportunitiesFromOverviews(overviews: Partial<Record<CubeKey, Overview>>, days: number): OpportunitiesSnapshot {
  const byCube = {} as Record<CubeKey, number>;
  for (const cube of CUBES) {
    byCube[cube] = overviews[cube] ? computeOpportunity30(cube, overviews[cube] as Overview) : 0;
  }
  const total = Object.values(byCube).reduce((a, b) => a + b, 0);
  return { days, total, byCube };
}

export function computeHistoryFromOverviews(overviews: Partial<Record<CubeKey, Overview>>, days: number): HistorySnapshot {
  const perTool = {} as Record<CubeKey, number>;
  for (const cube of CUBES) {
    perTool[cube] = overviews[cube] ? computeCapturedForCube(cube, overviews[cube] as Overview) : 0;
  }
  const total = Object.values(perTool).reduce((a, b) => a + b, 0);
  return { days, total, perTool, model: CAPTURED_MODEL_VERSION };
}


// Small server-side TTL to collapse repeated internal overview reads.
// Connect/disconnect actions still force fresh=1 and clear this cache.
const OVERVIEW_TTL_MS = 60_000;
const overviewCache = new Map<string, { expiresAt: number; value?: Overview | null; promise?: Promise<Overview | null> }>();

export function invalidateOverviewCache(): void {
  overviewCache.clear();
}

async function resolveOverviewWithCache(key: string, loader: () => Promise<Overview | null>, bypassCache = false): Promise<Overview | null> {
  const now = Date.now();

  if (!bypassCache) {
    const cached = overviewCache.get(key);
    if (cached) {
      if (cached.value !== undefined && cached.expiresAt > now) return cached.value;
      if (cached.promise) return cached.promise;
    }
  } else {
    overviewCache.delete(key);
  }

  const promise = (async () => {
    try {
      const value = await loader();
      overviewCache.set(key, { value, expiresAt: Date.now() + OVERVIEW_TTL_MS });
      return value;
    } catch {
      overviewCache.set(key, { value: null, expiresAt: Date.now() + 2_000 });
      return null;
    }
  })();

  overviewCache.set(key, { promise, expiresAt: now + OVERVIEW_TTL_MS });
  return promise;
}

async function fetchOverviewWithCache(url: string, headers?: HeadersInit, bypassCache = false): Promise<Overview | null> {
  const headerKey = headers ? JSON.stringify(headers) : '';
  const key = `${url}::${headerKey}`;
  return resolveOverviewWithCache(
    key,
    async () => {
      const r = await fetch(url, { headers, cache: 'no-store' });
      if (!r.ok) return null;
      return (await r.json()) as Overview;
    },
    bypassCache,
  );
}

export function toInrstatsSnapshot(opportunities30: OpportunitiesSnapshot): InrstatsOpportunitiesSnapshot {
  const perDay = opportunities30.total / Math.max(1, opportunities30.days || 30);
  const confidence: InrstatsOpportunitiesSnapshot['confidence'] =
    opportunities30.total >= 30 ? 'high' : opportunities30.total >= 10 ? 'medium' : 'low';
  return {
    baseDays: opportunities30.days,
    today: Math.max(0, Math.round(perDay * 2)),
    week: Math.max(0, Math.round(perDay * 7)),
    month: Math.max(0, Math.round(opportunities30.total)),
    total: Math.max(0, Math.round(opportunities30.total)),
    byCube: opportunities30.byCube,
    confidence,
  };
}

export async function fetchCubeOverviews(args: {
  origin?: string;
  days: number;
  getHeaders?: () => HeadersInit | undefined;
  extraParams?: Record<string, string | number | undefined>;
  bypassCache?: boolean;
  supabase?: SupabaseClient;
  userId?: string;
}): Promise<Partial<Record<CubeKey, Overview>>> {
  const { origin, days, getHeaders, extraParams, bypassCache = false, supabase, userId } = args;
  const entries = await Promise.all(
    CUBES.map(async (cube) => {
      const includeRaw = INCLUDE_BY_CUBE[cube];
      if (supabase && userId) {
        const directKey = `direct:${userId}:days=${days}:include=${includeRaw}:fresh=${bypassCache ? 1 : 0}`;
        const overview = await resolveOverviewWithCache(
          directKey,
          async () => (await buildStatsOverview({ supabase, userId, days, includeRaw, fresh: bypassCache })) as OverviewPayload,
          bypassCache,
        );
        return [cube, overview] as const;
      }

      if (!origin) return [cube, null] as const;

      const params = new URLSearchParams({ days: String(days), include: includeRaw });
      for (const [k, v] of Object.entries(extraParams || {})) {
        if (v !== undefined && v !== null && `${v}` !== '') params.set(k, String(v));
      }
      if (bypassCache) params.set('fresh', '1');
      const url = `${origin}/api/stats/overview?${params.toString()}`;
      const headers = getHeaders?.();
      const overview = await fetchOverviewWithCache(url, headers, bypassCache);
      return [cube, overview] as const;
    })
  );
  const out: Partial<Record<CubeKey, Overview>> = {};
  for (const [cube, ov] of entries) {
    if (ov) out[cube] = ov;
  }
  return out;
}
