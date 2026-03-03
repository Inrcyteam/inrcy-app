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

async function getPageAccessToken(userOrPageToken: string, pageId: string): Promise<string> {
  // If the provided token is already a page token, this request still works.
  // Requires pages_read_engagement/pages_show_list on the user token.
  const url =
    `${GRAPH}/${encodeURIComponent(pageId)}?` +
    new URLSearchParams({ fields: "access_token", access_token: userOrPageToken }).toString();
  const resp = await fetchJson(url);
  const t = String(resp?.access_token || "");
  return t || userOrPageToken;
}

// Facebook Page Insights. Requires a Page access token.
export async function fbFetchDailyInsights(
  pageAccessToken: string,
  pageId: string,
  start: Date,
  end: Date
): Promise<FacebookDailyMetrics> {
  const since = Math.floor(start.getTime() / 1000);
  const until = Math.floor(end.getTime() / 1000);

  // Facebook Insights is strict: if you pass ONE invalid metric name, the whole request fails.
  // Metric availability varies by Page/category and can change across API versions.
  // To avoid breaking the entire channel, we try a batched request first, then
  // (only on "valid insights metric" errors) retry metric-by-metric and keep the ones that work.
  const coreMetrics = ["page_impressions", "page_engaged_users", "page_views_total"];
  const optionalMetrics = [
    "page_call_phone_clicks_logged_in_unique",
    "page_get_directions_clicks_logged_in_unique",
    "page_website_clicks_logged_in_unique",
  ];
  const metrics = [...coreMetrics, ...optionalMetrics];

  const buildUrl = (token: string, metricList: string[]) =>
    `${GRAPH}/${encodeURIComponent(pageId)}/insights?` +
    new URLSearchParams({
      metric: metricList.join(","),
      period: "day",
      since: String(since),
      until: String(until),
      access_token: token,
    }).toString();

  // Some setups store a *user* token. Page insights often require a page token.
  // We try direct first; on auth errors we retry with a resolved page token.
  let resp: any;
  let tokenToUse = pageAccessToken;

  const fetchWithToken = async (token: string, metricList: string[]) => fetchJson(buildUrl(token, metricList));

  // First attempt: batched metrics
  try {
    resp = await fetchWithToken(tokenToUse, metrics);
  } catch (e: any) {
    const msg = String(e?.message || e);
    // If auth/permissions, resolve a page token and retry.
    if (/OAuth|access token|permissions|token/i.test(msg)) {
      tokenToUse = await getPageAccessToken(pageAccessToken, pageId);
      resp = await fetchWithToken(tokenToUse, metrics);
    } else if (/valid insights metric/i.test(msg)) {
      // One (or more) metrics are not supported for this Page/API version.
      // Fall back to per-metric requests below.
      resp = { data: [] };
    } else {
      throw e;
    }
  }

  // In some cases, Graph can surface "valid insights metric" errors (or return no data)
  // when one of the requested metrics is not supported for the Page.
  // Fallback: request metrics one by one and keep the successes.
  let data: any[] = Array.isArray(resp?.data) ? resp.data : [];
  const embeddedErrMsg = String(resp?.error?.message || "");
  if (/valid insights metric/i.test(embeddedErrMsg) || data.length === 0) {
    const collected: any[] = [];
    for (const m of metrics) {
      try {
        const r = await fetchWithToken(tokenToUse, [m]);
        const arr = Array.isArray(r?.data) ? r.data : [];
        collected.push(...arr);
      } catch (err: any) {
        const em = String(err?.message || err);
        // Ignore unsupported metrics.
        if (/valid insights metric/i.test(em)) continue;
        throw err;
      }
    }
    data = collected;
  }

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
