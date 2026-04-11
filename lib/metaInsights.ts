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

  // Instagram account insights metric availability varies by account type.
  // Also, some metric names changed (ex: get_directions_clicks).
  // We fetch metrics one-by-one and skip unsupported ones so the whole
  // dashboard does not break.
  const metrics = [
    // Core audience / profile activity
    "reach",
    "impressions",
    "follower_count",
    "profile_views",
    "views",
    "accounts_engaged",
    "total_interactions",
    // Intent/CTA (optional)
    "website_clicks",
    "phone_call_clicks",
    "email_contacts",
    "text_message_clicks",
    "get_directions_clicks",
  ];

  const allRows: Array<Record<string, unknown>> = [];
  for (const metric of metrics) {
    try {
      const url =
        `${GRAPH}/${encodeURIComponent(igUserId)}/insights?` +
        new URLSearchParams({
          metric,
          period: "day",
          since: String(since),
          until: String(until),
          access_token: accessToken,
        }).toString();

      const resp = await fetchJson(url);
      const rows = Array.isArray(resp?.data) ? resp.data : [];
      allRows.push(...rows);
    } catch {
      // ignore unsupported metric
    }
  }

  const data = allRows;

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
      // Back-compat alias used in a few places in the app
      if (name === "get_directions_clicks") {
        row["get_direction_clicks"] = (row["get_direction_clicks"] || 0) + value;
      }
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


export async function igFetchRecentMediaInsights(accessToken: string, igUserId: string, start: Date) {
  const mediaUrl = `${GRAPH}/${encodeURIComponent(igUserId)}/media?` +
    new URLSearchParams({ fields: "id,timestamp,media_type", limit: "25", access_token: accessToken }).toString();

  const mediaResp = await fetchJson(mediaUrl);
  const media = Array.isArray(mediaResp?.data) ? mediaResp.data : [];
  const metrics = ["impressions", "reach", "likes", "comments", "saved", "shares", "total_interactions", "profile_activity", "profile_visits"];
  const totals: Record<string, number> = {};

  for (const item of media) {
    const mediaId = String(item?.id || "");
    const ts = String(item?.timestamp || "");
    if (!mediaId) continue;
    if (ts) {
      const when = Date.parse(ts);
      if (Number.isFinite(when) && when < start.getTime()) continue;
    }

    try {
      const url = `${GRAPH}/${encodeURIComponent(mediaId)}/insights?` +
        new URLSearchParams({ metric: metrics.join(","), access_token: accessToken }).toString();
      const resp = await fetchJson(url);
      const rows = Array.isArray(resp?.data) ? resp.data : [];
      for (const row of rows) {
        const name = String(row?.name || "");
        const values = Array.isArray(row?.values) ? row.values : [];
        if (!name) continue;
        for (const valueRow of values) {
          const rawValue = valueRow?.value;
          if (typeof rawValue === "number") {
            totals[name] = (totals[name] || 0) + rawValue;
          } else if (rawValue && typeof rawValue === "object") {
            for (const [k, v] of Object.entries(rawValue as Record<string, unknown>)) {
              const n = typeof v === "number" ? v : Number(v);
              if (Number.isFinite(n)) {
                totals[k] = (totals[k] || 0) + n;
              }
            }
          }
        }
      }
    } catch {
      // ignore per-media unsupported metrics
    }
  }

  return totals;
}
