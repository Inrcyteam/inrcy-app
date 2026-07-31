import { type CubeKey, type CubeMetricItem, type InrcyActivityCount, type InrcyActivityStats, type Overview } from "./stats.shared.types";
import { bestMetricValue, fmtInt, latestDailyMetricValue, safeNum, safeObj, sumMetricValues } from "./stats.shared.core";
import { getGmbTotals, gmbMetricSeriesTotal, isIntentQuery, pageKind } from "./stats.shared.opportunity";
import { isLinkedInStatsPartial } from "./stats.shared.quality";

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

export function readMetricError(metrics: any) {
  const error = safeObj(metrics).error;
  return typeof error === "string" ? error.trim() : "";
}

export function isTikTokStatsPermissionError(metrics: any) {
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

export function hasTikTokStatsSignal(metrics: any) {
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

export function buildInrcyActivityStats(cubeKey: CubeKey, ov: Overview): InrcyActivityStats | null {
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

export function buildVisibilityStats(cubeKey: CubeKey, ov: Overview): CubeMetricItem[] {
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

export function buildActionStats(cubeKey: CubeKey, ov: Overview): CubeMetricItem[] {
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
