async function fetchJson(url: string, accessToken: string) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Restli-Protocol-Version": "2.0.0",
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

// Uses organizationalEntityShareStatistics (works with many apps even without deeper page analytics).
export async function liFetchOrgShareStats(
  accessToken: string,
  orgUrn: string,
  start: Date,
  end: Date
): Promise<LinkedInMetrics> {
  const s = { day: start.getUTCDate(), month: start.getUTCMonth() + 1, year: start.getUTCFullYear() };
  const e = { day: end.getUTCDate(), month: end.getUTCMonth() + 1, year: end.getUTCFullYear() };

  const url =
    "https://api.linkedin.com/v2/organizationalEntityShareStatistics?" +
    new URLSearchParams({
      q: "organizationalEntity",
      organizationalEntity: orgUrn,
      "timeIntervals.timeGranularityType": "DAY",
      "timeIntervals.timeRange.start.day": String(s.day),
      "timeIntervals.timeRange.start.month": String(s.month),
      "timeIntervals.timeRange.start.year": String(s.year),
      "timeIntervals.timeRange.end.day": String(e.day),
      "timeIntervals.timeRange.end.month": String(e.month),
      "timeIntervals.timeRange.end.year": String(e.year),
    }).toString();

  const resp = await fetchJson(url, accessToken);
  const elements = Array.isArray(resp?.elements) ? resp.elements : [];

  const totals: Record<string, number> = {
    impressionCount: 0,
    clickCount: 0,
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    engagement: 0,
  };

  for (const el of elements) {
    const stats = el?.totalShareStatistics || el?.shareStatistics || el?.statistics || {};
    for (const k of Object.keys(totals)) {
      const v = Number(stats?.[k] ?? 0);
      totals[k] += Number.isFinite(v) ? v : 0;
    }
  }

  return {
    range: { since: start.toISOString(), until: end.toISOString() },
    totals,
    raw: resp,
  };
}
