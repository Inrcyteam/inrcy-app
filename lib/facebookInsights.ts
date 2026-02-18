const GRAPH = "https://graph.facebook.com/v20.0";

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data;
}

export type FacebookDailyMetrics = {
  range: { since: string; until: string };
  totals: Record<string, number>;
  daily: Array<{ date: string; values: Record<string, number> }>;
};

// Facebook Page Insights. Requires a Page access token.
export async function fbFetchDailyInsights(
  pageAccessToken: string,
  pageId: string,
  start: Date,
  end: Date
): Promise<FacebookDailyMetrics> {
  const since = Math.floor(start.getTime() / 1000);
  const until = Math.floor(end.getTime() / 1000);

  // Keep to "safe" metrics available on most Pages.
  // If a metric is not available, the Graph API returns an error; we handle that upstream.
  const metrics = [
    "page_impressions",
    "page_engaged_users",
    "page_views_total",
    "page_fans",
    // Some pages have these (optional):
    "page_call_phone_clicks_logged_in_unique",
    "page_get_directions_clicks_logged_in_unique",
    "page_website_clicks_logged_in_unique",
  ];

  const url =
    `${GRAPH}/${encodeURIComponent(pageId)}/insights?` +
    new URLSearchParams({
      metric: metrics.join(","),
      period: "day",
      since: String(since),
      until: String(until),
      access_token: pageAccessToken,
    }).toString();

  const resp = await fetchJson(url);
  const data = Array.isArray(resp?.data) ? resp.data : [];

  const byDay = new Map<string, Record<string, number>>();
  for (const m of data) {
    const name = String(m?.name || "");
    const values = Array.isArray(m?.values) ? m.values : [];
    for (const v of values) {
      const endTime = String(v?.end_time || "").slice(0, 10);
      const value = typeof v?.value === "number" ? v.value : 0;
      if (!endTime) continue;
      const row = byDay.get(endTime) || {};
      row[name] = (row[name] || 0) + value;
      byDay.set(endTime, row);
    }
  }

  const daily = Array.from(byDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, values]) => ({ date, values }));

  const totals: Record<string, number> = {};
  for (const d of daily) {
    for (const [k, val] of Object.entries(d.values)) {
      totals[k] = (totals[k] || 0) + (Number(val) || 0);
    }
  }

  return {
    range: { since: start.toISOString(), until: end.toISOString() },
    totals,
    daily,
  };
}
