const LI_API = "https://api.linkedin.com/rest";
const LI_VERSION = process.env.LINKEDIN_API_VERSION || "202604";

type Dict = Record<string, unknown>;

type LinkedInFetchOptions = {
  extraHeaders?: Record<string, string>;
  useRestHeaders?: boolean;
};

async function fetchLinkedInJson(url: string, accessToken: string, options?: LinkedInFetchOptions) {
  const useRestHeaders = options?.useRestHeaders ?? url.includes("/rest/");
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(useRestHeaders ? {
        "X-Restli-Protocol-Version": "2.0.0",
        "Linkedin-Version": LI_VERSION,
      } : {}),
      "Content-Type": "application/json",
      ...(options?.extraHeaders || {}),
    },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || data?.error_description || data?.error || `HTTP ${res.status}`);
  return data;
}

async function fetchFirstOk(urls: string[], accessToken: string, options?: LinkedInFetchOptions) {
  const errors: string[] = [];
  for (const url of urls) {
    try {
      return await fetchLinkedInJson(url, accessToken, options);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(errors[0] || "LinkedIn API error");
}

export type LinkedInMetrics = {
  range: { since: string; until: string };
  totals: Record<string, number>;
  raw?: unknown;
};

function toMs(d: Date): number {
  return d.getTime();
}

function safeNum(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : 0;
}

function toDateRangeParam(start: Date, end: Date): string {
  return `(start:(year:${start.getUTCFullYear()},month:${start.getUTCMonth() + 1},day:${start.getUTCDate()}),end:(year:${end.getUTCFullYear()},month:${end.getUTCMonth() + 1},day:${end.getUTCDate()}))`;
}

function toRestTimeParams(start: Date, end: Date) {
  return {
    "timeIntervals.timeGranularityType": "DAY",
    "timeIntervals.timeRange.start": String(toMs(start)),
    "timeIntervals.timeRange.end": String(toMs(end)),
  };
}

function sumFollowerFacetRows(rows: unknown, key: string): number {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((acc: number, row: unknown) => {
    const counts = (row && typeof row === "object" ? (row as Dict)[key] : null) || {};
    const rec = counts && typeof counts === "object" ? (counts as Dict) : {};
    return acc + safeNum(rec.organicFollowerCount) + safeNum(rec.paidFollowerCount);
  }, 0);
}

function extractOrgPageViewCount(el: Dict): number {
  const pageStatistics = el.pageStatistics && typeof el.pageStatistics === "object" ? (el.pageStatistics as Dict) : {};
  const views = pageStatistics.views && typeof pageStatistics.views === "object" ? (pageStatistics.views as Dict) : {};
  const candidates = [
    (((views.allPageViews as Dict | undefined) || {}).pageViews),
    (((views.overviewPageViews as Dict | undefined) || {}).pageViews),
    (((views.allDesktopPageViews as Dict | undefined) || {}).pageViews),
    (((views.allMobilePageViews as Dict | undefined) || {}).pageViews),
    (((views.desktopOverviewPageViews as Dict | undefined) || {}).pageViews),
    (((views.mobileOverviewPageViews as Dict | undefined) || {}).pageViews),
  ];
  return candidates.reduce<number>((sum, candidate) => sum + safeNum(candidate), 0);
}

function parseMetricType(metricType: unknown): string {
  if (typeof metricType === "string") return metricType;
  if (metricType && typeof metricType === "object") {
    const values = Object.values(metricType as Dict);
    for (const value of values) {
      if (typeof value === "string") return value;
    }
  }
  return "";
}

function aggregatePostAnalyticsElements(elements: unknown): Record<string, number> {
  const totals: Record<string, number> = {
    impressionCount: 0,
    uniqueImpressionsCount: 0,
    likeCount: 0,
    likes: 0,
    commentCount: 0,
    comments: 0,
    shareCount: 0,
    shares: 0,
    postSendCount: 0,
    postSaveCount: 0,
    linkClickCount: 0,
    premiumCtaClickCount: 0,
    followerGainedFromContentCount: 0,
    profileViewFromContentCount: 0,
  };
  if (!Array.isArray(elements)) return totals;

  for (const raw of elements) {
    const row = raw && typeof raw === "object" ? (raw as Dict) : {};
    const metric = parseMetricType(row.metricType).toUpperCase();
    const count = safeNum(row.count);
    switch (metric) {
      case "IMPRESSION":
        totals.impressionCount += count;
        break;
      case "MEMBERS_REACHED":
        totals.uniqueImpressionsCount += count;
        break;
      case "REACTION":
        totals.likeCount += count;
        totals.likes += count;
        break;
      case "COMMENT":
        totals.commentCount += count;
        totals.comments += count;
        break;
      case "RESHARE":
        totals.shareCount += count;
        totals.shares += count;
        break;
      case "POST_SEND":
        totals.postSendCount += count;
        break;
      case "POST_SAVE":
        totals.postSaveCount += count;
        break;
      case "LINK_CLICKS":
        totals.linkClickCount += count;
        break;
      case "PREMIUM_CTA_CLICKS":
        totals.premiumCtaClickCount += count;
        break;
      case "FOLLOWER_GAINED_FROM_CONTENT":
        totals.followerGainedFromContentCount += count;
        totals.newFollowers = (totals.newFollowers || 0) + count;
        break;
      case "PROFILE_VIEW_FROM_CONTENT":
        totals.profileViewFromContentCount += count;
        totals.profileViews = (totals.profileViews || 0) + count;
        break;
      default:
        break;
    }
  }
  return totals;
}

function normalizeTotals(input: Record<string, number>): Record<string, number> {
  const out = { ...input };
  const impressionCount = safeNum(out.impressionCount) || safeNum(out.impressions);
  const uniqueImpressionsCount = safeNum(out.uniqueImpressionsCount) || safeNum(out.uniqueImpressions);
  const clickCount = safeNum(out.clickCount) + safeNum(out.linkClickCount) + safeNum(out.premiumCtaClickCount) + safeNum(out.pageClicks);
  const likeCount = safeNum(out.likeCount) || safeNum(out.likes);
  const commentCount = safeNum(out.commentCount) || safeNum(out.comments);
  const shareCount = safeNum(out.shareCount) || safeNum(out.shares);
  const followerCount = safeNum(out.followerCount) || safeNum(out.memberFollowersCount);
  const newFollowers = safeNum(out.newFollowers) + safeNum(out.followerGainedFromContentCount) + safeNum(out.organicFollowerCount) + safeNum(out.paidFollowerCount);
  const profileViews = safeNum(out.profileViews) + safeNum(out.profileViewFromContentCount);
  const pageViews = safeNum(out.pageViews);

  out.impressions = impressionCount;
  out.impressionCount = impressionCount;
  out.uniqueImpressionsCount = uniqueImpressionsCount;
  out.clicks = clickCount;
  out.clickCount = clickCount;
  out.likes = likeCount;
  out.likeCount = likeCount;
  out.comments = commentCount;
  out.commentCount = commentCount;
  out.shares = shareCount;
  out.shareCount = shareCount;
  out.followers = followerCount;
  out.followerCount = followerCount;
  out.newFollowers = newFollowers;
  out.profileViews = profileViews;
  out.pageViews = pageViews;
  out.engagements = safeNum(out.engagements) + likeCount + commentCount + shareCount + safeNum(out.postSaveCount) + safeNum(out.postSendCount);
  return out;
}

function mergeTotals(target: Record<string, number>, source: Record<string, number>) {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] || 0) + safeNum(value);
  }
}

async function liFetchMemberFollowers(accessToken: string, start: Date, end: Date): Promise<Record<string, number>> {
  const life = await fetchFirstOk([
    `${LI_API}/memberFollowersCount?q=me`,
    `https://api.linkedin.com/v2/memberFollowersCount?q=me`,
  ], accessToken, { extraHeaders: { "X-RestLi-Method": "FINDER" } });
  const lifetimeFollowers = safeNum(life?.elements?.[0]?.memberFollowersCount);

  let followerGain = 0;
  try {
    const daily = await fetchFirstOk([
      `${LI_API}/memberFollowersCount?q=dateRange&dateRange=${encodeURIComponent(toDateRangeParam(start, end))}`,
      `https://api.linkedin.com/v2/memberFollowersCount?q=dateRange&dateRange=${encodeURIComponent(toDateRangeParam(start, end))}`,
    ], accessToken, { extraHeaders: { "X-RestLi-Method": "FINDER" } });
    followerGain = Array.isArray(daily?.elements)
      ? daily.elements.reduce((sum: number, row: Dict) => sum + safeNum(row.memberFollowersCount), 0)
      : 0;
  } catch {}

  return normalizeTotals({
    followerCount: lifetimeFollowers,
    memberFollowersCount: lifetimeFollowers,
    newFollowers: followerGain,
  });
}

async function liFetchMemberPostAnalytics(accessToken: string, start: Date, end: Date): Promise<Record<string, number>> {
  const queryTypes = [
    "IMPRESSION",
    "MEMBERS_REACHED",
    "REACTION",
    "COMMENT",
    "RESHARE",
    "LINK_CLICKS",
    "PREMIUM_CTA_CLICKS",
    "POST_SAVE",
    "POST_SEND",
    "FOLLOWER_GAINED_FROM_CONTENT",
    "PROFILE_VIEW_FROM_CONTENT",
  ];
  const settled = await Promise.allSettled(
    queryTypes.map((queryType) =>
      fetchFirstOk([
        `${LI_API}/memberCreatorPostAnalytics?q=me&queryType=${encodeURIComponent(queryType)}&aggregation=TOTAL&dateRange=${encodeURIComponent(toDateRangeParam(start, end))}`,
        `https://api.linkedin.com/v2/memberCreatorPostAnalytics?q=me&queryType=${encodeURIComponent(queryType)}&aggregation=TOTAL&dateRange=${encodeURIComponent(toDateRangeParam(start, end))}`,
      ], accessToken, { extraHeaders: { "X-RestLi-Method": "FINDER" } })
    )
  );

  const totals = settled.reduce<Record<string, number>>((acc, result) => {
    if (result.status !== "fulfilled") return acc;
    mergeTotals(acc, aggregatePostAnalyticsElements(result.value?.elements));
    return acc;
  }, {});
  return normalizeTotals(totals);
}

async function liFetchPosts(accessToken: string, authorUrn: string, start: Date): Promise<Record<string, number>> {
  if (!authorUrn) return { postsPublished: 0 };
  const params = new URLSearchParams({
    q: "author",
    author: authorUrn,
    count: "100",
    sortBy: "LAST_MODIFIED",
    viewContext: "AUTHOR",
  }).toString();

  const resp = await fetchFirstOk([
    `${LI_API}/posts?${params}`,
    `https://api.linkedin.com/v2/posts?${params}`,
  ], accessToken, { extraHeaders: { "X-RestLi-Method": "FINDER" } });
  const elements = Array.isArray(resp?.elements) ? resp.elements : [];
  const postCount = elements.filter((raw: unknown) => {
    const post = raw && typeof raw === "object" ? (raw as Dict) : {};
    const createdAt = safeNum(post.createdAt || post.publishedAt || post.lastModifiedAt);
    return createdAt <= 0 || createdAt >= start.getTime();
  }).length;

  return { postsPublished: postCount };
}

export async function liResolveFirstAdminOrgUrn(accessToken: string): Promise<string> {
  const params = new URLSearchParams({
    q: "roleAssignee",
    role: "ADMINISTRATOR",
    state: "APPROVED",
    count: "10",
    start: "0",
  }).toString();

  const resp = await fetchFirstOk([
    `${LI_API}/organizationAcls?${params}`,
    `https://api.linkedin.com/v2/organizationAcls?${params}`,
  ], accessToken, { extraHeaders: { "X-RestLi-Method": "FINDER" } });
  const els = Array.isArray(resp?.elements) ? resp.elements : [];
  for (const el of els) {
    const row = el && typeof el === "object" ? (el as Dict) : {};
    const urn = String(row.organization || row.organizationalTarget || "");
    if (urn.startsWith("urn:li:organization:")) return urn;
  }
  return "";
}

async function liFetchOrgShareStats(accessToken: string, orgUrn: string, start: Date, end: Date): Promise<Record<string, number>> {
  const params = new URLSearchParams({
    q: "organizationalEntity",
    organizationalEntity: orgUrn,
    ...toRestTimeParams(start, end),
  }).toString();

  const resp = await fetchFirstOk([
    `${LI_API}/organizationalEntityShareStatistics?${params}`,
    `https://api.linkedin.com/v2/organizationalEntityShareStatistics?${params}`,
  ], accessToken, { extraHeaders: { "X-RestLi-Method": "FINDER" } });
  const elements = Array.isArray(resp?.elements) ? resp.elements : [];

  const totals: Record<string, number> = {};
  for (const el of elements) {
    const row = el && typeof el === "object" ? (el as Dict) : {};
    const stats = (row.totalShareStatistics && typeof row.totalShareStatistics === "object"
      ? row.totalShareStatistics
      : row.shareStatistics && typeof row.shareStatistics === "object"
        ? row.shareStatistics
        : row.statistics && typeof row.statistics === "object"
          ? row.statistics
          : {}) as Dict;
    for (const key of ["impressionCount", "uniqueImpressionsCount", "clickCount", "likeCount", "commentCount", "shareCount", "engagement"]) {
      totals[key] = (totals[key] || 0) + safeNum(stats[key]);
    }
  }

  return normalizeTotals(totals);
}

async function liFetchOrgPageStats(accessToken: string, orgUrn: string, start: Date, end: Date): Promise<Record<string, number>> {
  const params = new URLSearchParams({
    q: "organization",
    organization: orgUrn,
    ...toRestTimeParams(start, end),
  }).toString();

  const resp = await fetchFirstOk([
    `${LI_API}/organizationPageStatistics?${params}`,
    `https://api.linkedin.com/v2/organizationPageStatistics?${params}`,
  ], accessToken, { extraHeaders: { "X-RestLi-Method": "FINDER" } });
  const elements = Array.isArray(resp?.elements) ? resp.elements : [];

  let pageViews = 0;
  let pageClicks = 0;
  for (const raw of elements) {
    const el = raw && typeof raw === "object" ? (raw as Dict) : {};
    pageViews += extractOrgPageViewCount(el);
    const pageStatistics = el.pageStatistics && typeof el.pageStatistics === "object" ? (el.pageStatistics as Dict) : {};
    const clicks = pageStatistics.clicks && typeof pageStatistics.clicks === "object" ? (pageStatistics.clicks as Dict) : {};
    pageClicks += safeNum(((clicks.careersPageClicks as Dict | undefined) || {}).pageClicks);
    pageClicks += safeNum(((clicks.overviewPageClicks as Dict | undefined) || {}).pageClicks);
    pageClicks += safeNum(((clicks.customButtonClicks as Dict | undefined) || {}).pageClicks);
  }

  return normalizeTotals({ pageViews, pageClicks, clickCount: pageClicks });
}

async function liFetchOrgFollowerStats(accessToken: string, orgUrn: string, start: Date, end: Date): Promise<Record<string, number>> {
  const params = new URLSearchParams({
    q: "organizationalEntity",
    organizationalEntity: orgUrn,
    ...toRestTimeParams(start, end),
  }).toString();

  const resp = await fetchFirstOk([
    `${LI_API}/organizationalEntityFollowerStatistics?${params}`,
    `https://api.linkedin.com/v2/organizationalEntityFollowerStatistics?${params}`,
  ], accessToken, { extraHeaders: { "X-RestLi-Method": "FINDER" } });
  const elements = Array.isArray(resp?.elements) ? resp.elements : [];

  let organicFollowers = 0;
  let paidFollowers = 0;
  for (const raw of elements) {
    const el = raw && typeof raw === "object" ? (raw as Dict) : {};
    const followerCounts = el.followerCounts && typeof el.followerCounts === "object" ? (el.followerCounts as Dict) : {};
    const directOrganic = safeNum(followerCounts.organicFollowerCount);
    const directPaid = safeNum(followerCounts.paidFollowerCount);
    if (directOrganic || directPaid) {
      organicFollowers += directOrganic;
      paidFollowers += directPaid;
    } else {
      organicFollowers += sumFollowerFacetRows(el.followerCountsByGeoCountry, "followerCounts");
    }
  }

  return normalizeTotals({
    organicFollowerCount: organicFollowers,
    paidFollowerCount: paidFollowers,
    followerCount: organicFollowers + paidFollowers,
    newFollowers: organicFollowers + paidFollowers,
  });
}

export async function liFetchOrgAnalytics(
  accessToken: string,
  orgUrn: string,
  start: Date,
  end: Date
): Promise<LinkedInMetrics> {
  if (!orgUrn) throw new Error("Le compte LinkedIn n’est pas correctement configuré.");

  const settled = await Promise.allSettled([
    liFetchOrgShareStats(accessToken, orgUrn, start, end),
    liFetchOrgPageStats(accessToken, orgUrn, start, end),
    liFetchOrgFollowerStats(accessToken, orgUrn, start, end),
    liFetchPosts(accessToken, orgUrn, start),
  ]);

  const totals: Record<string, number> = {};
  const raw: Record<string, unknown> = {};
  const errors: string[] = [];
  const labels = ["shareStats", "pageStats", "followerStats", "posts"];

  settled.forEach((result, idx) => {
    const label = labels[idx];
    if (result.status === "fulfilled") {
      mergeTotals(totals, result.value);
      raw[label] = result.value;
    } else {
      raw[label] = { error: result.reason instanceof Error ? result.reason.message : String(result.reason) };
      errors.push(`${label}:${raw[label] && typeof raw[label] === "object" ? (raw[label] as { error?: string }).error || "error" : "error"}`);
    }
  });

  const normalizedTotals = normalizeTotals(totals);
  if (!Object.keys(normalizedTotals).length) {
    throw new Error(errors[0] || "Aucune métrique LinkedIn exploitable.");
  }

  return {
    range: { since: start.toISOString(), until: end.toISOString() },
    totals: normalizedTotals,
    raw: { ...raw, errors },
  };
}

export async function liFetchMemberAnalytics(
  accessToken: string,
  authorUrn: string,
  start: Date,
  end: Date
): Promise<LinkedInMetrics> {
  const settled = await Promise.allSettled([
    liFetchMemberFollowers(accessToken, start, end),
    liFetchMemberPostAnalytics(accessToken, start, end),
    liFetchPosts(accessToken, authorUrn, start),
  ]);

  const totals: Record<string, number> = {};
  const raw: Record<string, unknown> = {};
  const errors: string[] = [];
  const labels = ["memberFollowers", "memberPostAnalytics", "memberPosts"];

  settled.forEach((result, idx) => {
    const label = labels[idx];
    if (result.status === "fulfilled") {
      mergeTotals(totals, result.value);
      raw[label] = result.value;
    } else {
      raw[label] = { error: result.reason instanceof Error ? result.reason.message : String(result.reason) };
      errors.push(`${label}:${raw[label] && typeof raw[label] === "object" ? (raw[label] as { error?: string }).error || "error" : "error"}`);
    }
  });

  const normalizedTotals = normalizeTotals(totals);
  if (!Object.keys(normalizedTotals).length) {
    throw new Error(errors[0] || "Aucune métrique LinkedIn membre exploitable.");
  }

  return {
    range: { since: start.toISOString(), until: end.toISOString() },
    totals: normalizedTotals,
    raw: { ...raw, errors },
  };
}
