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
  raw?: {
    supportedMetrics?: { account?: string[]; media?: string[] };
    unsupportedMetrics?: { account?: string[]; media?: string[] };
    metricErrors?: { account?: Record<string, string>; media?: Record<string, string> };
    mediaInsights?: Record<string, number> | { error: string };
  };
};

const IG_ACCOUNT_METRICS = [
  // Supported account-level metrics
  "impressions",
  "reach",
  "follower_count",
  "online_followers",
  "accounts_engaged",
  "total_interactions",
  "likes",
  "comments",
  "shares",
  "saves",
  "replies",
  "profile_links_taps",
  "views",
  "content_views",
  // Legacy / optional metrics. We still probe them so the app captures
  // everything a given account/API version still returns.
  "profile_views",
  "website_clicks",
  "phone_call_clicks",
  "email_contacts",
  "text_message_clicks",
  "get_directions_clicks",
] as const;

const IG_MEDIA_METRICS = [
  "impressions",
  "reach",
  "likes",
  "comments",
  "saved",
  "shares",
  "total_interactions",
  "profile_activity",
  "profile_visits",
  "profile_links_taps",
  "views",
  "replies",
  "follows",
  "video_views",
] as const;

function normalizeMetricError(error: unknown): string {
  return String((error as { message?: string })?.message || error || "unknown_error").trim();
}

function addNumeric(target: Record<string, number>, key: string, value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(n)) target[key] = (target[key] || 0) + n;
}

function addMetricValue(row: Record<string, number>, metricName: string, rawValue: unknown) {
  if (typeof rawValue === "number") {
    addNumeric(row, metricName, rawValue);
    return;
  }
  if (!rawValue || typeof rawValue !== "object") return;

  const obj = rawValue as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    if (k === "value" || k === "total_value") {
      addMetricValue(row, metricName, v);
      continue;
    }
    addNumeric(row, `${metricName}_${k}`, v);
    addNumeric(row, k, v);
  }
}

function extractRowsForMetric(metricRow: Record<string, unknown>): Array<{ date: string; values: Record<string, number> }> {
  const name = String(metricRow?.name || "").trim();
  if (!name) return [];

  const byDay = new Map<string, Record<string, number>>();
  const pushValue = (date: string, rawValue: unknown) => {
    if (!date) return;
    const row = byDay.get(date) || {};
    addMetricValue(row, name, rawValue);
    if (name === "get_directions_clicks") addMetricValue(row, "get_direction_clicks", rawValue);
    if (name === "saved") addMetricValue(row, "saves", rawValue);
    byDay.set(date, row);
  };

  const values = Array.isArray(metricRow?.values) ? metricRow.values : [];
  for (const valueRow of values) {
    const date = String((valueRow as Record<string, unknown>)?.end_time || "").slice(0, 10);
    pushValue(date, (valueRow as Record<string, unknown>)?.value);
  }

  if (byDay.size === 0 && metricRow?.total_value && typeof metricRow.total_value === "object") {
    const totalValue = metricRow.total_value as Record<string, unknown>;
    const fallbackDate = String(totalValue?.end_time || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
    pushValue(fallbackDate, totalValue?.value ?? totalValue);
  }

  return Array.from(byDay.entries()).map(([date, vals]) => ({ date, values: vals }));
}

async function igFetchAccountMetric(
  accessToken: string,
  igUserId: string,
  metric: string,
  since: number,
  until: number
): Promise<Array<{ date: string; values: Record<string, number> }>> {
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
  return rows.flatMap((row: Record<string, unknown>) => extractRowsForMetric(row));
}

export async function igFetchDailyInsights(
  accessToken: string,
  igUserId: string,
  start: Date,
  end: Date
): Promise<InstagramDailyMetrics> {
  const since = Math.floor(start.getTime() / 1000);
  const until = Math.floor(end.getTime() / 1000);

  const byDay = new Map<string, Record<string, number>>();
  const supportedMetrics: string[] = [];
  const unsupportedMetrics: string[] = [];
  const metricErrors: Record<string, string> = {};

  for (const metric of IG_ACCOUNT_METRICS) {
    try {
      const rows = await igFetchAccountMetric(accessToken, igUserId, metric, since, until);
      if (!rows.length) {
        supportedMetrics.push(metric);
        continue;
      }
      supportedMetrics.push(metric);
      for (const row of rows) {
        const current = byDay.get(row.date) || {};
        for (const [key, value] of Object.entries(row.values)) {
          current[key] = (current[key] || 0) + value;
        }
        byDay.set(row.date, current);
      }
    } catch (error) {
      const message = normalizeMetricError(error);
      unsupportedMetrics.push(metric);
      metricErrors[metric] = message;
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
    raw: {
      supportedMetrics: { account: supportedMetrics },
      unsupportedMetrics: { account: unsupportedMetrics },
      metricErrors: { account: metricErrors },
    },
  };
}

function metricListForMediaType(mediaType: string): string[] {
  const normalized = String(mediaType || "").toUpperCase();
  if (normalized === "IMAGE" || normalized === "CAROUSEL_ALBUM") {
    return IG_MEDIA_METRICS.filter((metric) => metric !== "video_views" && metric !== "views");
  }
  return [...IG_MEDIA_METRICS];
}

export async function igFetchRecentMediaInsights(accessToken: string, igUserId: string, start: Date) {
  const mediaUrl = `${GRAPH}/${encodeURIComponent(igUserId)}/media?` +
    new URLSearchParams({ fields: "id,timestamp,media_type", limit: "50", access_token: accessToken }).toString();

  const mediaResp = await fetchJson(mediaUrl);
  const media = Array.isArray(mediaResp?.data) ? mediaResp.data : [];
  const totals: Record<string, number> = {};
  const supportedMetrics = new Set<string>();
  const unsupportedMetrics = new Set<string>();
  const metricErrors: Record<string, string> = {};

  for (const item of media) {
    const mediaId = String(item?.id || "");
    const ts = String(item?.timestamp || "");
    if (!mediaId) continue;
    if (ts) {
      const when = Date.parse(ts);
      if (Number.isFinite(when) && when < start.getTime()) continue;
    }

    const requestedMetrics = metricListForMediaType(String(item?.media_type || ""));
    const buildUrl = (metricList: string[]) => `${GRAPH}/${encodeURIComponent(mediaId)}/insights?` +
      new URLSearchParams({ metric: metricList.join(","), access_token: accessToken }).toString();

    let rows: Array<Record<string, unknown>> = [];
    let needsFallback = false;

    try {
      const resp = await fetchJson(buildUrl(requestedMetrics));
      rows = Array.isArray(resp?.data) ? resp.data : [];
      if (!rows.length) needsFallback = true;
      else requestedMetrics.forEach((metric) => supportedMetrics.add(metric));
    } catch (error) {
      const message = normalizeMetricError(error);
      if (/valid insights metric|unsupported|not available|metric/i.test(message)) {
        needsFallback = true;
      } else {
        metricErrors[`${mediaId}:batch`] = message;
        continue;
      }
    }

    if (needsFallback) {
      rows = [];
      for (const metric of requestedMetrics) {
        try {
          const resp = await fetchJson(buildUrl([metric]));
          const arr = Array.isArray(resp?.data) ? resp.data : [];
          rows.push(...arr);
          supportedMetrics.add(metric);
        } catch (error) {
          unsupportedMetrics.add(metric);
          metricErrors[`${mediaId}:${metric}`] = normalizeMetricError(error);
        }
      }
    }

    for (const row of rows) {
      const name = String(row?.name || "").trim();
      const values = Array.isArray(row?.values) ? row.values : [];
      if (!name) continue;
      if (!values.length && row?.total_value && typeof row.total_value === "object") {
        addMetricValue(totals, name, (row.total_value as Record<string, unknown>)?.value ?? row.total_value);
        continue;
      }
      for (const valueRow of values) {
        addMetricValue(totals, name, (valueRow as Record<string, unknown>)?.value);
      }
    }
  }

  return {
    totals,
    supportedMetrics: Array.from(supportedMetrics).sort(),
    unsupportedMetrics: Array.from(unsupportedMetrics).sort(),
    metricErrors,
  };
}
