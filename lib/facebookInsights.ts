const GRAPH = "https://graph.facebook.com/v20.0";

function graphErrorMessage(data: any, status: number) {
  const e = data?.error;
  if (!e) return `HTTP ${status}`;
  return [e.message, e.type, e.code ? `code=${e.code}` : "", e.error_subcode ? `subcode=${e.error_subcode}` : ""]
    .filter(Boolean)
    .join(" | ");
}

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(graphErrorMessage(data, res.status));
  return data;
}

export type FacebookDailyMetrics = {
  range: { since: string; until: string };
  totals: Record<string, number>;
  daily: Array<{ date: string; values: Record<string, number> }>;
  raw?: {
    supportedMetrics?: string[];
    unsupportedMetrics?: string[];
    metricErrors?: Record<string, string>;
  };
};

function normalizeMetricError(error: unknown): string {
  return String((error as { message?: string })?.message || error || "unknown_error").trim();
}

function addNumeric(target: Record<string, number>, key: string, value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(n)) target[key] = (target[key] || 0) + n;
}

function extractDailyRows(metricRow: Record<string, unknown>) {
  const name = String(metricRow?.name || "").trim();
  if (!name) return [] as Array<{ date: string; value: number }>;
  const values = Array.isArray(metricRow?.values) ? metricRow.values : [];
  return values
    .map((v) => ({
      date: String((v as Record<string, unknown>)?.end_time || "").slice(0, 10),
      value: Number((v as Record<string, unknown>)?.value || 0),
    }))
    .filter((v) => v.date && Number.isFinite(v.value));
}

async function resolvePageAccessToken(userOrPageToken: string, pageId: string): Promise<string> {
  // Direct field lookup works if the token can see the selected Page.
  try {
    const direct = await fetchJson(
      `${GRAPH}/${encodeURIComponent(pageId)}?` +
        new URLSearchParams({ fields: "access_token", access_token: userOrPageToken }).toString()
    );
    const token = String(direct?.access_token || "");
    if (token) return token;
  } catch {}

  // Fallback for user tokens: find the selected Page in /me/accounts.
  try {
    const accounts = await fetchJson(
      `${GRAPH}/me/accounts?` +
        new URLSearchParams({ fields: "id,name,access_token", limit: "100", access_token: userOrPageToken }).toString()
    );
    const rows = Array.isArray(accounts?.data) ? accounts.data : [];
    const match = rows.find((row: any) => String(row?.id || "") === String(pageId));
    const token = String(match?.access_token || "");
    if (token) return token;
  } catch {}

  return userOrPageToken;
}

const FB_PAGE_INSIGHT_METRICS = [
  // These are commonly available Page insights. Each is queried separately so
  // one removed/unsupported metric never kills the whole Facebook block.
  "page_post_engagements",
  "page_engaged_users",
  "page_views_total",
  "page_actions_post_reactions_total",
  "page_fans",
  "page_fan_adds",
  "page_impressions_unique",
  "page_impressions",
  "page_call_phone_clicks_logged_in_unique",
  "page_get_directions_clicks_logged_in_unique",
  "page_website_clicks_logged_in_unique",
] as const;

async function fetchPageMetric(token: string, pageId: string, metric: string, since: number, until: number) {
  const url =
    `${GRAPH}/${encodeURIComponent(pageId)}/insights?` +
    new URLSearchParams({
      metric,
      period: "day",
      since: String(since),
      until: String(until),
      access_token: token,
    }).toString();
  const resp = await fetchJson(url);
  return Array.isArray(resp?.data) ? resp.data : [];
}

async function enrichPageFields(token: string, pageId: string, totals: Record<string, number>) {
  try {
    const pageInfo = await fetchJson(
      `${GRAPH}/${encodeURIComponent(pageId)}?` +
        new URLSearchParams({
          fields: "fan_count,followers_count,new_like_count,link",
          access_token: token,
        }).toString()
    );
    addNumeric(totals, "fan_count", pageInfo?.fan_count);
    addNumeric(totals, "followers_count", pageInfo?.followers_count);
    addNumeric(totals, "new_like_count", pageInfo?.new_like_count);
  } catch {}
}

async function enrichPublishedPosts(token: string, pageId: string, totals: Record<string, number>, since: number, until: number) {
  try {
    const posts = await fetchJson(
      `${GRAPH}/${encodeURIComponent(pageId)}/published_posts?` +
        new URLSearchParams({
          fields: "id,created_time",
          limit: "50",
          since: String(since),
          until: String(until),
          access_token: token,
        }).toString()
    );
    const arr = Array.isArray(posts?.data) ? posts.data : [];
    for (const p of arr) {
      const postId = String(p?.id || "");
      if (!postId) continue;
      try {
        const ins = await fetchJson(
          `${GRAPH}/${encodeURIComponent(postId)}/insights?` +
            new URLSearchParams({
              metric: "post_impressions,post_impressions_unique,post_engaged_users,post_clicks",
              period: "lifetime",
              access_token: token,
            }).toString()
        );
        const rows = Array.isArray(ins?.data) ? ins.data : [];
        for (const r of rows) {
          const name = String(r?.name || "");
          const v = Array.isArray(r?.values) ? r.values[0]?.value : undefined;
          addNumeric(totals, `${name}_sum`, v);
          if (name === "post_impressions") addNumeric(totals, "impressions", v);
          if (name === "post_impressions_unique") addNumeric(totals, "reach", v);
          if (name === "post_engaged_users") addNumeric(totals, "engagements", v);
          if (name === "post_clicks") addNumeric(totals, "clicks", v);
        }
      } catch {}
    }
  } catch {}
}

export async function fbFetchDailyInsights(
  userOrPageToken: string,
  pageId: string,
  start: Date,
  end: Date
): Promise<FacebookDailyMetrics> {
  const since = Math.floor(start.getTime() / 1000);
  const until = Math.floor(end.getTime() / 1000);

  const tokenToUse = await resolvePageAccessToken(userOrPageToken, pageId);
  const byDay = new Map<string, Record<string, number>>();
  const totals: Record<string, number> = {};
  const supportedMetrics: string[] = [];
  const unsupportedMetrics: string[] = [];
  const metricErrors: Record<string, string> = {};

  for (const metric of FB_PAGE_INSIGHT_METRICS) {
    try {
      const rows = await fetchPageMetric(tokenToUse, pageId, metric, since, until);
      if (rows.length) supportedMetrics.push(metric);
      for (const metricRow of rows) {
        const name = String(metricRow?.name || metric);
        for (const row of extractDailyRows(metricRow as Record<string, unknown>)) {
          const current = byDay.get(row.date) || {};
          current[name] = (current[name] || 0) + row.value;
          byDay.set(row.date, current);
          totals[name] = (totals[name] || 0) + row.value;
        }
      }
    } catch (error) {
      const message = normalizeMetricError(error);
      unsupportedMetrics.push(metric);
      metricErrors[metric] = message;
      // Continue. This is the important fix: one bad FB metric must not block all stats.
    }
  }

  await enrichPageFields(tokenToUse, pageId, totals);
  await enrichPublishedPosts(tokenToUse, pageId, totals, since, until);

  const daily = Array.from(byDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, values]) => ({ date, values }));

  return {
    range: { since: start.toISOString(), until: end.toISOString() },
    totals,
    daily,
    raw: {
      supportedMetrics,
      unsupportedMetrics,
      metricErrors,
    },
  };
}
