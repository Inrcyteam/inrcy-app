import { getGoogleTokenForAnyGoogle } from "@/lib/googleStats";

type GMBAccount = { name: string; accountName?: string; type?: string };
type GMBLocation = { name: string; title?: string; storefrontAddress?: any };

export async function gmbListAccounts(accessToken: string) {
  const r = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const raw = await r.text().catch(() => "");
  let j: any = {};
  try {
    j = raw ? JSON.parse(raw) : {};
  } catch {
    j = {};
  }

  if (!r.ok) {
    const msg = j?.error?.message || j?.error_description || raw || "Impossible de récupérer les comptes Google Business pour le moment.";
    throw new Error(`GMB accounts error (${r.status}): ${msg}`);
  }
  return (j.accounts || []) as GMBAccount[];
}

function normalizeLocationName(name: string): string {
  // Accept:
  // - "locations/123"
  // - "accounts/AAA/locations/123"
  // - full resource paths
  const m = /\/locations\/(\d+)/.exec(name || "");
  if (m) return `locations/${m[1]}`;
  return name;
}

async function fetchJsonOrThrow(r: Response, label: string) {
  const raw = await r.text().catch(() => "");
  let j: any = {};
  try {
    j = raw ? JSON.parse(raw) : {};
  } catch {
    j = {};
  }
  if (!r.ok) {
    const msg = j?.error?.message || j?.error_description || raw || `${label} error`;
    throw new Error(`${label} (${r.status}): ${msg}`);
  }
  return j;
}

// Primary (recommended) API: Business Profile Business Information API (v1)
export async function gmbListLocations(accessToken: string, accountName: string) {
  const url = new URL(`https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations`);
  // Keep it small and compatible; some projects reject storefrontAddress in readMask depending on rollout.
  url.searchParams.set("readMask", "name,title");
  url.searchParams.set("pageSize", "100");

  const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  const j = await fetchJsonOrThrow(r, "Impossible de récupérer les établissements Google Business pour le moment.");

  const items = (j.locations || []) as GMBLocation[];
  return items.map((l: any) => ({ ...l, name: normalizeLocationName(l.name) }));
}

// Fallback API: older My Business API (v4). Useful when the v1 API is not enabled on the GCP project.
async function gmbListLocationsV4(accessToken: string, accountName: string) {
  const accountId = accountName.split("/").pop();
  if (!accountId) throw new Error("Compte Google Business invalide.");

  const url = new URL(`https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations`);
  url.searchParams.set("pageSize", "100");

  const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  const j = await fetchJsonOrThrow(r, "Impossible de récupérer les établissements Google Business pour le moment.");

  const locations = (j.locations || []) as any[];
  return locations.map((l) => ({
    name: normalizeLocationName(l.locationName || l.name),
    title: l.locationName || l.name,
    storefrontAddress: l.address || l.storefrontAddress,
  })) as GMBLocation[];
}

// Wrapper with fallback + pagination support if needed later
export async function gmbListLocationsWithFallback(accessToken: string, accountName: string) {
  try {
    return await gmbListLocations(accessToken, accountName);
  } catch (e: any) {
    const msg = String(e?.message || e);
    // If the primary API isn't enabled / configured, try v4.
    if (/Access Not Configured|accessNotConfigured|has not been used|API.*not enabled/i.test(msg)) {
      return await gmbListLocationsV4(accessToken, accountName);
    }
    throw e;
  }
}

/**
 * Returns an access token + the stored integration row for the current user,
 * refreshing the access token if needed.
 */
export async function getGmbToken() {
  const tok = await getGoogleTokenForAnyGoogle("gmb", "gmb");
  if (!tok?.accessToken) return null;
  return tok;
}

/**
 * Best-effort "real connectivity" test: call the accounts endpoint.
 * Returns { connected, accountsCount }.
 */
export async function testGmbConnectivity(accessToken: string) {
  try {
    const accounts = await gmbListAccounts(accessToken);
    return { connected: true, accountsCount: accounts.length };
  } catch {
    return { connected: false, accountsCount: 0 };
  }
}

// --- Performance API (best-effort, depends on the user's enabled API access) ---

type DateObj = { year: number; month: number; day: number };

function toDateObj(d: Date): DateObj {
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * Fetch multi daily metrics time series for a given location resource name:
 * locationName example: "locations/12345678901234567890"
 *
 * Note: This endpoint requires the Business Profile Performance API.
 */
export async function gmbFetchDailyMetrics(accessToken: string, locationName: string, start: Date, end: Date) {
  const endpoint = `https://businessprofileperformance.googleapis.com/v1/${locationName}:fetchMultiDailyMetricsTimeSeries`;
  const body = {
    dailyMetrics: [
      "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
      "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
      "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
      "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
      "WEBSITE_CLICKS",
      "CALL_CLICKS",
      "DIRECTION_REQUESTS",
    ],
    timeRange: { startDate: toDateObj(start), endDate: toDateObj(end) },
  };

  const r = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || j?.error_description || "Impossible de récupérer les statistiques Google Business pour le moment.");
  return j;
}

// --- Normalization helpers (stable shape for UI/opportunities) ---

export type GmbDailyMetrics = {
  range: { since: string; until: string };
  totals: {
    impressions: number;
    websiteClicks: number;
    callClicks: number;
    directionRequests: number;
  };
  daily: Array<{
    date: string; // YYYY-MM-DD
    impressions: number;
    websiteClicks: number;
    callClicks: number;
    directionRequests: number;
  }>;
  raw?: any;
};

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addTo(
  map: Map<string, { impressions: number; websiteClicks: number; callClicks: number; directionRequests: number }>,
  date: string,
  key: "impressions" | "websiteClicks" | "callClicks" | "directionRequests",
  v: number
) {
  const row = map.get(date) || { impressions: 0, websiteClicks: 0, callClicks: 0, directionRequests: 0 };
  row[key] = (row[key] || 0) + (Number.isFinite(v) ? v : 0);
  map.set(date, row);
}

/**
 * Performance API -> { totals, daily }
 * The API returns a `multiDailyMetricTimeSeries` array with per-metric dated values.
 */
export function gmbNormalizePerformanceResponse(raw: any, start: Date, end: Date): GmbDailyMetrics {
  const outByDay = new Map<string, { impressions: number; websiteClicks: number; callClicks: number; directionRequests: number }>();

  const series = Array.isArray(raw?.multiDailyMetricTimeSeries) ? raw.multiDailyMetricTimeSeries : [];
  for (const s of series) {
    const metric = String(s?.dailyMetric || "");
    const dated = Array.isArray(s?.timeSeries?.datedValues) ? s.timeSeries.datedValues : [];

    const key:
      | "impressions"
      | "websiteClicks"
      | "callClicks"
      | "directionRequests"
      | null =
      metric === "WEBSITE_CLICKS"
        ? "websiteClicks"
        : metric === "CALL_CLICKS"
          ? "callClicks"
          : metric === "DIRECTION_REQUESTS"
            ? "directionRequests"
            : metric.startsWith("BUSINESS_IMPRESSIONS_")
              ? "impressions"
              : null;
    if (!key) continue;

    for (const dv of dated) {
      const d = dv?.date;
      const dateStr =
        d && typeof d === "object"
          ? `${String(d.year).padStart(4, "0")}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`
          : "";
      if (!dateStr) continue;

      // value can be { value: "123" } depending on backend
      const vRaw = dv?.value?.value ?? dv?.value ?? 0;
      const v = Number(vRaw);
      addTo(outByDay, dateStr, key, Number.isFinite(v) ? v : 0);
    }
  }

  // Fill missing days so the shape is consistent
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (cur <= endDay) {
    const d = ymd(cur);
    if (!outByDay.has(d)) outByDay.set(d, { impressions: 0, websiteClicks: 0, callClicks: 0, directionRequests: 0 });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  const daily = Array.from(outByDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, ...v }));

  const totals = daily.reduce(
    (acc, d) => {
      acc.impressions += d.impressions;
      acc.websiteClicks += d.websiteClicks;
      acc.callClicks += d.callClicks;
      acc.directionRequests += d.directionRequests;
      return acc;
    },
    { impressions: 0, websiteClicks: 0, callClicks: 0, directionRequests: 0 }
  );

  return {
    range: { since: start.toISOString(), until: end.toISOString() },
    totals,
    daily,
    raw,
  };
}

export async function gmbFetchDailyMetricsNormalized(accessToken: string, locationName: string, start: Date, end: Date) {
  const raw = await gmbFetchDailyMetrics(accessToken, locationName, start, end);
  return gmbNormalizePerformanceResponse(raw, start, end);
}


export async function gmbCreateLocalPost(args: {
  accessToken: string;
  accountName: string; // "accounts/123"
  locationName: string; // "locations/456"
  summary: string;
  imageUrls?: string[];
  languageCode?: string; // default fr-FR
}) {
  const { accessToken, accountName, locationName } = args;

  const accountId = accountName.split("/").pop();
  const locationId = locationName.split("/").pop();
  if (!accountId || !locationId) throw new Error("Établissement Google Business invalide.");

  const endpoint = `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/localPosts`;

  const payload: any = {
    languageCode: args.languageCode || "fr-FR",
    summary: args.summary,
    topicType: "STANDARD",
  };

  const urls = (args.imageUrls || []).filter(Boolean).slice(0, 10);
  if (urls.length) {
    payload.media = urls.map((sourceUrl) => ({
      mediaFormat: "PHOTO",
      sourceUrl,
    }));
  }

  const r = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || j?.error_description || "Impossible de publier sur Google Business pour le moment.");

  return j;
}
