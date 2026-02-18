const GRAPH = "https://graph.facebook.com/v20.0";

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data;
}

export type InstagramDailyMetrics = {
  range: { since: string; until: string };
  totals: Record<string, number>;
  daily: Array<{ date: string; values: Record<string, number> }>;
};

export async function igFetchDailyInsights(
  accessToken: string,
  igUserId: string,
  start: Date,
  end: Date
): Promise<InstagramDailyMetrics> {
  const since = Math.floor(start.getTime() / 1000);
  const until = Math.floor(end.getTime() / 1000);

  // Metrics oriented toward lead intent.
  const metrics = [
    "impressions",
    "reach",
    "profile_views",
    // Optional / varies by account type & region
    "website_clicks",
    "phone_call_clicks",
    "email_contacts",
    "get_direction_clicks",
  ];

  const url =
    `${GRAPH}/${encodeURIComponent(igUserId)}/insights?` +
    new URLSearchParams({
      metric: metrics.join(","),
      period: "day",
      since: String(since),
      until: String(until),
      access_token: accessToken,
    }).toString();

  const resp = await fetchJson(url);
  const data = Array.isArray(resp?.data) ? resp.data : [];

  const byDay = new Map<string, Record<string, number>>();
  for (const m of data) {
    const name = String(m?.name || "");
    const values = Array.isArray(m?.values) ? m.values : [];
    for (const v of values) {
      const endTime = String(v?.end_time || "").slice(0, 10); // YYYY-MM-DD
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
