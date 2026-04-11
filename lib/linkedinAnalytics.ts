const LI_API = "https://api.linkedin.com/rest";
const LI_VERSION = process.env.LINKEDIN_API_VERSION || "202602";

async function fetchLinkedInJson(url: string, accessToken: string, extraHeaders?: Record<string, string>) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Restli-Protocol-Version": "2.0.0",
      "Linkedin-Version": LI_VERSION,
      "Content-Type": "application/json",
      ...(extraHeaders || {}),
    },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
  return data;
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

function sumFollowerFacetRows(rows: unknown, key: string): number {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((acc, row) => {
    const counts = (row && typeof row === "object" ? (row as Record<string, unknown>)[key] : null) || {};
    const rec = counts && typeof counts === "object" ? (counts as Record<string, unknown>) : {};
    return acc + safeNum(rec.organicFollowerCount) + safeNum(rec.paidFollowerCount);
  }, 0);
}

function extractOrgPageViewCount(el: Record<string, unknown>): number {
  const pageStatistics = el.pageStatistics && typeof el.pageStatistics === "object" ? (el.pageStatistics as Record<string, unknown>) : {};
  const views = pageStatistics.views && typeof pageStatistics.views === "object" ? (pageStatistics.views as Record<string, unknown>) : {};
  const candidates = [
    (((views.allPageViews as Record<string, unknown> | undefined) || {}).pageViews),
    (((views.overviewPageViews as Record<string, unknown> | undefined) || {}).pageViews),
    (((views.allDesktopPageViews as Record<string, unknown> | undefined) || {}).pageViews),
    (((views.allMobilePageViews as Record<string, unknown> | undefined) || {}).pageViews),
    (((views.desktopOverviewPageViews as Record<string, unknown> | undefined) || {}).pageViews),
    (((views.mobileOverviewPageViews as Record<string, unknown> | undefined) || {}).pageViews),
  ];
  for (const candidate of candidates) {
    const n = safeNum(candidate);
    if (n > 0) return n;
  }
  return 0;
}

function parseMetricType(metricType: unknown): string {
  if (typeof metricType === "string") return metricType;
  if (metricType && typeof metricType === "object") {
    const values = Object.values(metricType as Record<string, unknown>);
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
    shareCount: 0,
  };
  if (!Array.isArray(elements)) return totals;

  for (const raw of elements) {
    const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
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
        break;
      case "RESHARE":
        totals.shareCount += count;
        break;
      default:
        break;
    }
  }
  return totals;
}

async function liFetchMemberFollowers(accessToken: string, start: Date, end: Date): Promise<Record<string, number>> {
  const life = await fetchLinkedInJson(`${LI_API}/memberFollowersCount?q=me`, accessToken);
  const lifetimeFollowers = safeNum(life?.elements?.[0]?.memberFollowersCount);

  const daily = await fetchLinkedInJson(
    `${LI_API}/memberFollowersCount?q=dateRange&dateRange=${encodeURIComponent(toDateRangeParam(start, end))}`,
    accessToken,
    { "X-RestLi-Method": "FINDER" }
  );

  const followerGain = Array.isArray(daily?.elements)
    ? daily.elements.reduce((sum: number, row: Record<string, unknown>) => sum + safeNum(row.memberFollowersCount), 0)
    : 0;

  return {
    followerCount: lifetimeFollowers,
    memberFollowersCount: lifetimeFollowers,
    newFollowers: followerGain,
  };
}

async function liFetchMemberPostAnalytics(accessToken: string, start: Date, end: Date): Promise<Record<string, number>> {
  const queryTypes = ["IMPRESSION", "MEMBERS_REACHED", "REACTION", "COMMENT", "RESHARE"];
  const settled = await Promise.allSettled(
    queryTypes.map((queryType) =>
      fetchLinkedInJson(
        `${LI_API}/memberCreatorPostAnalytics?q=me&queryType=${encodeURIComponent(queryType)}&aggregation=TOTAL&dateRange=${encodeURIComponent(toDateRangeParam(start, end))}`,
        accessToken,
        { "X-RestLi-Method": "FINDER" }
      )
    )
  );

  return settled.reduce<Record<string, number>>((acc, result) => {
    if (result.status !== "fulfilled") return acc;
    const totals = aggregatePostAnalyticsElements(result.value?.elements);
    for (const [key, value] of Object.entries(totals)) {
      acc[key] = (acc[key] || 0) + safeNum(value);
    }
    return acc;
  }, {});
}

async function liFetchMemberPosts(accessToken: string, authorUrn: string, start: Date): Promise<Record<string, number>> {
  if (!authorUrn) return { postsPublished: 0 };
  const url =
    `${LI_API}/posts?` +
    new URLSearchParams({
      q: "author",
      author: authorUrn,
      count: "50",
      sortBy: "LAST_MODIFIED",
      viewContext: "AUTHOR",
    }).toString();

  const resp = await fetchLinkedInJson(url, accessToken, { "X-RestLi-Method": "FINDER" });
  const elements = Array.isArray(resp?.elements) ? resp.elements : [];
  const postCount = elements.filter((raw: unknown) => {
    const post = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const createdAt = safeNum(post.createdAt || post.publishedAt || post.lastModifiedAt);
    return createdAt <= 0 || createdAt >= start.getTime();
  }).length;

  return { postsPublished: postCount };
}

export async function liResolveFirstAdminOrgUrn(accessToken: string): Promise<string> {
  const url =
    `${LI_API}/organizationAcls?` +
    new URLSearchParams({
      q: "roleAssignee",
      role: "ADMINISTRATOR",
      state: "APPROVED",
      count: "10",
      start: "0",
    }).toString();

  const resp = await fetchLinkedInJson(url, accessToken, { "X-RestLi-Method": "FINDER" });
  const els = Array.isArray(resp?.elements) ? resp.elements : [];
  for (const el of els) {
    const row = el && typeof el === "object" ? (el as Record<string, unknown>) : {};
    const urn = String(row.organization || row.organizationalTarget || "");
    if (urn.startsWith("urn:li:organization:")) return urn;
  }
  return "";
}

async function liFetchOrgShareStats(accessToken: string, orgUrn: string, start: Date, end: Date): Promise<Record<string, number>> {
  const url =
    `${LI_API}/organizationalEntityShareStatistics?` +
    new URLSearchParams({
      q: "organizationalEntity",
      organizationalEntity: orgUrn,
      "timeIntervals.timeGranularityType": "DAY",
      "timeIntervals.timeRange.start": String(toMs(start)),
      "timeIntervals.timeRange.end": String(toMs(end)),
    }).toString();

  const resp = await fetchLinkedInJson(url, accessToken, { "X-RestLi-Method": "FINDER" });
  const elements = Array.isArray(resp?.elements) ? resp.elements : [];

  const totals: Record<string, number> = {
    impressionCount: 0,
    uniqueImpressionsCount: 0,
    clickCount: 0,
    likeCount: 0,
    likes: 0,
    commentCount: 0,
    shareCount: 0,
    engagement: 0,
  };

  for (const el of elements) {
    const row = el && typeof el === "object" ? (el as Record<string, unknown>) : {};
    const stats = (row.totalShareStatistics && typeof row.totalShareStatistics === "object"
      ? row.totalShareStatistics
      : row.shareStatistics && typeof row.shareStatistics === "object"
        ? row.shareStatistics
        : row.statistics && typeof row.statistics === "object"
          ? row.statistics
          : {}) as Record<string, unknown>;
    for (const k of Object.keys(totals)) {
      totals[k] += safeNum(stats[k]);
    }
  }

  return totals;
}

async function liFetchOrgPageStats(accessToken: string, orgUrn: string, start: Date, end: Date): Promise<Record<string, number>> {
  const url =
    `${LI_API}/organizationPageStatistics?` +
    new URLSearchParams({
      q: "organization",
      organization: orgUrn,
      "timeIntervals.timeGranularityType": "DAY",
      "timeIntervals.timeRange.start": String(toMs(start)),
      "timeIntervals.timeRange.end": String(toMs(end)),
    }).toString();

  const resp = await fetchLinkedInJson(url, accessToken, { "X-RestLi-Method": "FINDER" });
  const elements = Array.isArray(resp?.elements) ? resp.elements : [];

  let pageViews = 0;
  let pageClicks = 0;
  for (const raw of elements) {
    const el = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    pageViews += extractOrgPageViewCount(el);
    const pageStatistics = el.pageStatistics && typeof el.pageStatistics === "object" ? (el.pageStatistics as Record<string, unknown>) : {};
    const clicks = pageStatistics.clicks && typeof pageStatistics.clicks === "object" ? (pageStatistics.clicks as Record<string, unknown>) : {};
    pageClicks += safeNum(((clicks.careersPageClicks as Record<string, unknown> | undefined) || {}).pageClicks);
    pageClicks += safeNum(((clicks.overviewPageClicks as Record<string, unknown> | undefined) || {}).pageClicks);
    pageClicks += safeNum(((clicks.customButtonClicks as Record<string, unknown> | undefined) || {}).pageClicks);
  }

  return {
    pageViews,
    pageClicks,
  };
}

async function liFetchOrgFollowerStats(accessToken: string, orgUrn: string, start: Date, end: Date): Promise<Record<string, number>> {
  const url =
    `${LI_API}/organizationalEntityFollowerStatistics?` +
    new URLSearchParams({
      q: "organizationalEntity",
      organizationalEntity: orgUrn,
      "timeIntervals.timeGranularityType": "DAY",
      "timeIntervals.timeRange.start": String(toMs(start)),
      "timeIntervals.timeRange.end": String(toMs(end)),
    }).toString();

  const resp = await fetchLinkedInJson(url, accessToken, { "X-RestLi-Method": "FINDER" });
  const elements = Array.isArray(resp?.elements) ? resp.elements : [];

  let organicFollowers = 0;
  let paidFollowers = 0;
  for (const raw of elements) {
    const el = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const followerCounts = el.followerCounts && typeof el.followerCounts === "object" ? (el.followerCounts as Record<string, unknown>) : {};
    const directOrganic = safeNum(followerCounts.organicFollowerCount);
    const directPaid = safeNum(followerCounts.paidFollowerCount);
    if (directOrganic || directPaid) {
      organicFollowers += directOrganic;
      paidFollowers += directPaid;
    } else {
      organicFollowers += sumFollowerFacetRows(el.followerCountsByGeoCountry, "followerCounts");
    }
  }

  return {
    organicFollowerCount: organicFollowers,
    paidFollowerCount: paidFollowers,
    followerCount: organicFollowers + paidFollowers,
  };
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
  ]);

  const totals: Record<string, number> = {};
  const raw: Record<string, unknown> = {};
  const errors: string[] = [];

  const merge = (label: string, idx: number) => {
    const result = settled[idx];
    if (result.status === "fulfilled") {
      Object.assign(totals, Object.fromEntries(Object.entries(result.value).map(([k, v]) => [k, (totals[k] || 0) + safeNum(v)])));
      raw[label] = result.value;
    } else {
      raw[label] = { error: result.reason instanceof Error ? result.reason.message : String(result.reason) };
      errors.push(`${label}:${raw[label] && typeof raw[label] === "object" ? (raw[label] as { error?: string }).error || "error" : "error"}`);
    }
  };

  merge("shareStats", 0);
  merge("pageStats", 1);
  merge("followerStats", 2);

  if (!Object.keys(totals).length) {
    throw new Error(errors[0] || "Aucune métrique LinkedIn exploitable.");
  }

  return {
    range: { since: start.toISOString(), until: end.toISOString() },
    totals,
    raw,
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
    liFetchMemberPosts(accessToken, authorUrn, start),
  ]);

  const totals: Record<string, number> = {};
  const raw: Record<string, unknown> = {};
  const errors: string[] = [];
  const labels = ["memberFollowers", "memberPostAnalytics", "memberPosts"];

  settled.forEach((result, idx) => {
    const label = labels[idx];
    if (result.status === "fulfilled") {
      Object.assign(totals, Object.fromEntries(Object.entries(result.value).map(([k, v]) => [k, (totals[k] || 0) + safeNum(v)])));
      raw[label] = result.value;
    } else {
      raw[label] = { error: result.reason instanceof Error ? result.reason.message : String(result.reason) };
      errors.push(`${label}:${raw[label] && typeof raw[label] === "object" ? (raw[label] as { error?: string }).error || "error" : "error"}`);
    }
  });

  if (!Object.keys(totals).length) {
    throw new Error(errors[0] || "Aucune métrique LinkedIn membre exploitable.");
  }

  return {
    range: { since: start.toISOString(), until: end.toISOString() },
    totals,
    raw,
  };
}
