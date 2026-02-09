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
    const msg = j?.error?.message || j?.error_description || raw || "GMB accounts API error";
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
  const j = await fetchJsonOrThrow(r, "GMB locations (businessinformation) error");

  const items = (j.locations || []) as GMBLocation[];
  return items.map((l: any) => ({ ...l, name: normalizeLocationName(l.name) }));
}

// Fallback API: older My Business API (v4). Useful when the v1 API is not enabled on the GCP project.
async function gmbListLocationsV4(accessToken: string, accountName: string) {
  const accountId = accountName.split("/").pop();
  if (!accountId) throw new Error("Invalid accountName");

  const url = new URL(`https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations`);
  url.searchParams.set("pageSize", "100");

  const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  const j = await fetchJsonOrThrow(r, "GMB locations (v4) error");

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
  if (!r.ok) throw new Error(j?.error?.message || j?.error_description || "GMB performance API error");
  return j;
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
  if (!accountId || !locationId) throw new Error("Invalid account/location selection");

  const endpoint = `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/localPosts`;

  const payload: any = {
    languageCode: args.languageCode || "fr-FR",
    summary: args.summary,
    topicType: "STANDARD",
  };

  const urls = (args.imageUrls || []).filter(Boolean).slice(0, 1); // GBP: keep 1 photo for now (simple & reliable)
  if (urls.length) {
    payload.media = [
      {
        mediaFormat: "PHOTO",
        sourceUrl: urls[0],
      },
    ];
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
  if (!r.ok) throw new Error(j?.error?.message || j?.error_description || "GMB create post error");

  return j;
}
