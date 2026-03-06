const LI_API = "https://api.linkedin.com/rest";
const LI_VERSION = process.env.LINKEDIN_API_VERSION || "202602";

async function fetchLinkedInJson(url: string, accessToken: string) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Restli-Protocol-Version": "2.0.0",
      "Linkedin-Version": LI_VERSION,
      "Content-Type": "application/json",
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
  raw?: any;
};

function toMs(d: Date): number {
  return d.getTime();
}

function safeNum(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function sumFollowerFacetRows(rows: unknown, key: string): number {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((acc, row) => {
    const counts = (row && typeof row === "object" ? (row as Record<string, any>)[key] : null) || {};
    return acc + safeNum(counts?.organicFollowerCount) + safeNum(counts?.paidFollowerCount);
  }, 0);
}

function extractOrgPageViewCount(el: Record<string, any>): number {
  const views = el?.pageStatistics?.views || el?.views || {};
  const candidates = [
    views?.allPageViews?.pageViews,
    views?.overviewPageViews?.pageViews,
    views?.allDesktopPageViews?.pageViews,
    views?.allMobilePageViews?.pageViews,
    views?.desktopOverviewPageViews?.pageViews,
    views?.mobileOverviewPageViews?.pageViews,
  ];
  for (const c of candidates) {
    const n = safeNum(c);
    if (n > 0) return n;
  }
  return 0;
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

  const resp = await fetchLinkedInJson(url, accessToken);
  const els = Array.isArray(resp?.elements) ? resp.elements : [];
  for (const el of els) {
    const urn = String(el?.organization || el?.organizationalTarget || "");
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

  const resp = await fetchLinkedInJson(url, accessToken);
  const elements = Array.isArray(resp?.elements) ? resp.elements : [];

  const totals: Record<string, number> = {
    impressionCount: 0,
    uniqueImpressionsCount: 0,
    clickCount: 0,
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    engagement: 0,
  };

  for (const el of elements) {
    const stats = el?.totalShareStatistics || el?.shareStatistics || el?.statistics || {};
    for (const k of Object.keys(totals)) {
      totals[k] += safeNum(stats?.[k]);
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

  const resp = await fetchLinkedInJson(url, accessToken);
  const elements = Array.isArray(resp?.elements) ? resp.elements : [];

  let pageViews = 0;
  let pageClicks = 0;
  for (const raw of elements) {
    const el = raw && typeof raw === "object" ? (raw as Record<string, any>) : {};
    pageViews += extractOrgPageViewCount(el);
    pageClicks += safeNum(el?.pageStatistics?.clicks?.careersPageClicks?.pageClicks);
    pageClicks += safeNum(el?.pageStatistics?.clicks?.overviewPageClicks?.pageClicks);
    pageClicks += safeNum(el?.pageStatistics?.clicks?.customButtonClicks?.pageClicks);
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

  const resp = await fetchLinkedInJson(url, accessToken);
  const elements = Array.isArray(resp?.elements) ? resp.elements : [];

  let organicFollowers = 0;
  let paidFollowers = 0;
  for (const raw of elements) {
    const el = raw && typeof raw === "object" ? (raw as Record<string, any>) : {};
    const directOrganic = safeNum(el?.followerCounts?.organicFollowerCount);
    const directPaid = safeNum(el?.followerCounts?.paidFollowerCount);
    if (directOrganic || directPaid) {
      organicFollowers += directOrganic;
      paidFollowers += directPaid;
    } else {
      organicFollowers += sumFollowerFacetRows(el?.followerCountsByGeoCountry, "followerCounts");
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
  if (!orgUrn) throw new Error("LinkedIn org_urn manquant.");

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
      errors.push(`${label}:${raw[label] && typeof raw[label] === "object" ? (raw[label] as any).error : "error"}`);
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
