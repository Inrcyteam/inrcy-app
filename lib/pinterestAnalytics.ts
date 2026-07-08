import "server-only";

import { pinterestApiGet } from "@/lib/pinterestOAuth";
import { asNumber, asRecord, asString } from "@/lib/tsSafe";

const DEFAULT_METRICS = [
  "IMPRESSION",
  "ENGAGEMENT",
  "PIN_CLICK",
  "OUTBOUND_CLICK",
  "SAVE",
] as const;

export type PinterestAnalyticsSnapshot = {
  totals: {
    impressions: number;
    impressionCount: number;
    engagements: number;
    engagementCount: number;
    pin_clicks: number;
    clickCount: number;
    outbound_clicks: number;
    pageClicks: number;
    saves: number;
    postsPublished: number;
  };
  daily: Array<{
    date: string;
    impressions: number;
    engagements: number;
    pinClicks: number;
    outboundClicks: number;
    saves: number;
  }>;
  meta: {
    startDate: string;
    endDate: string;
    source: "pinterest_user_account_analytics";
  };
};

function nonNegative(value: unknown): number {
  const parsed = asNumber(value) ?? 0;
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function metricFromRecord(record: Record<string, unknown>, ...names: string[]): number {
  for (const name of names) {
    if (record[name] !== undefined && record[name] !== null) return nonNegative(record[name]);
    const lower = name.toLowerCase();
    if (record[lower] !== undefined && record[lower] !== null) return nonNegative(record[lower]);
  }
  return 0;
}

function collectSummaryMetricRecords(value: unknown, out: Record<string, unknown>[], depth = 0): void {
  if (depth > 5 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value) collectSummaryMetricRecords(item, out, depth + 1);
    return;
  }
  const rec = asRecord(value);
  if (!Object.keys(rec).length) return;

  const summary = asRecord(rec.summary_metrics);
  if (Object.keys(summary).length) out.push(summary);

  for (const [key, child] of Object.entries(rec)) {
    if (key === "summary_metrics" || key === "metrics") continue;
    if (child && typeof child === "object") collectSummaryMetricRecords(child, out, depth + 1);
  }
}

function collectDailyEntries(value: unknown, out: Array<{ date: string; metrics: Record<string, unknown> }>, depth = 0): void {
  if (depth > 5 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value) collectDailyEntries(item, out, depth + 1);
    return;
  }
  const rec = asRecord(value);
  if (!Object.keys(rec).length) return;

  const daily = Array.isArray(rec.daily_metrics) ? rec.daily_metrics : [];
  for (const item of daily) {
    const row = asRecord(item);
    const date = asString(row.date) || "";
    const metrics = asRecord(row.metrics);
    if (date && Object.keys(metrics).length) out.push({ date, metrics });
  }

  for (const [key, child] of Object.entries(rec)) {
    if (key === "daily_metrics") continue;
    if (child && typeof child === "object") collectDailyEntries(child, out, depth + 1);
  }
}

function sumMetric(records: Record<string, unknown>[], ...names: string[]): number {
  return records.reduce((sum, record) => sum + metricFromRecord(record, ...names), 0);
}

function normalizeDate(value: string | Date): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Période Pinterest invalide.");
  return date.toISOString().slice(0, 10);
}

export async function fetchPinterestAnalyticsSnapshot(args: {
  accessToken: string;
  start: string | Date;
  end: string | Date;
}): Promise<PinterestAnalyticsSnapshot> {
  const accessToken = String(args.accessToken || "").trim();
  if (!accessToken) throw new Error("Connexion Pinterest expirée. Reconnecte Pinterest dans Canaux.");

  const startDate = normalizeDate(args.start);
  const endDate = normalizeDate(args.end);
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    from_claimed_content: "BOTH",
    pin_format: "ALL",
    app_types: "ALL",
    content_type: "ALL",
    source: "ALL",
    metric_types: DEFAULT_METRICS.join(","),
    split_field: "NO_SPLIT",
  });

  const payload = await pinterestApiGet<unknown>(`/user_account/analytics?${params.toString()}`, accessToken);

  const summaries: Record<string, unknown>[] = [];
  collectSummaryMetricRecords(payload, summaries);
  const dailyRows: Array<{ date: string; metrics: Record<string, unknown> }> = [];
  collectDailyEntries(payload, dailyRows);

  // Normalement Pinterest renvoie summary_metrics. Si ce bloc est absent,
  // on agrège les métriques journalières afin de rester robuste aux variantes de réponse.
  const sourceRecords = summaries.length ? summaries : dailyRows.map((row) => row.metrics);
  const impressions = sumMetric(sourceRecords, "IMPRESSION", "IMPRESSION_COUNT");
  const engagements = sumMetric(sourceRecords, "ENGAGEMENT", "ENGAGEMENT_COUNT");
  const pinClicks = sumMetric(sourceRecords, "PIN_CLICK", "PIN_CLICKS");
  const outboundClicks = sumMetric(sourceRecords, "OUTBOUND_CLICK", "OUTBOUND_CLICKS");
  const saves = sumMetric(sourceRecords, "SAVE", "SAVES");

  const daily = dailyRows
    .map((row) => ({
      date: row.date,
      impressions: metricFromRecord(row.metrics, "IMPRESSION", "IMPRESSION_COUNT"),
      engagements: metricFromRecord(row.metrics, "ENGAGEMENT", "ENGAGEMENT_COUNT"),
      pinClicks: metricFromRecord(row.metrics, "PIN_CLICK", "PIN_CLICKS"),
      outboundClicks: metricFromRecord(row.metrics, "OUTBOUND_CLICK", "OUTBOUND_CLICKS"),
      saves: metricFromRecord(row.metrics, "SAVE", "SAVES"),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totals: {
      impressions,
      impressionCount: impressions,
      engagements,
      engagementCount: engagements,
      pin_clicks: pinClicks,
      clickCount: pinClicks,
      outbound_clicks: outboundClicks,
      pageClicks: outboundClicks,
      saves,
      postsPublished: 0,
    },
    daily,
    meta: {
      startDate,
      endDate,
      source: "pinterest_user_account_analytics",
    },
  };
}
