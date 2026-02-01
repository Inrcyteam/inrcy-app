import { createSupabaseServer } from "@/lib/supabaseServer";

export type StatsSourceKey = "site_inrcy" | "site_web" | "gmb" | "facebook";
export type StatsProductKey = "ga4" | "gsc" | "gmb" | "facebook";

export type GoogleTokenRow = {
  id: number;
  user_id: string;
  source: StatsSourceKey;
  product: StatsProductKey;
  provider: "google";
  email_address: string;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  expires_at: string | null;
  scopes: string | null;
  resource_id: string | null;
  resource_label: string | null;
  status: string;
  meta: any;
};

export async function refreshGoogleAccessToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error_description || data?.error || "Token refresh failed");
  }

  const accessToken = data.access_token as string;
  const expiresIn = Number(data.expires_in || 3600);
  const expiresAtIso = new Date(Date.now() + expiresIn * 1000).toISOString();

  return { accessToken, expiresAtIso };
}

export function isExpired(expiresAtIso: string | null) {
  if (!expiresAtIso) return true;
  const t = new Date(expiresAtIso).getTime();
  // refresh 2 minutes early
  return Date.now() > t - 2 * 60 * 1000;
}

export async function getGoogleTokenFor(source: StatsSourceKey, product: "ga4" | "gsc") {
  const supabase = await createSupabaseServer();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) throw new Error("Not authenticated");
  const userId = authData.user.id;

  const { data, error } = await supabase
    .from("stats_integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "google")
    .eq("source", source)
    .eq("product", product)
    .eq("status", "connected")
    .maybeSingle();

  if (error) throw new Error("DB read failed");
  if (!data) return null;

  const row = data as unknown as GoogleTokenRow;

  if (!row.refresh_token_enc) {
    // Without refresh_token, we cannot keep the connection alive reliably
    return null;
  }

  let accessToken = row.access_token_enc;
  let expiresAt = row.expires_at;

  if (!accessToken || isExpired(expiresAt)) {
    const refreshed = await refreshGoogleAccessToken(row.refresh_token_enc);
    accessToken = refreshed.accessToken;
    expiresAt = refreshed.expiresAtIso;

    await supabase
      .from("stats_integrations")
      .update({ access_token_enc: accessToken, expires_at: expiresAt })
      .eq("id", row.id);
  }

  return { accessToken: accessToken!, row };
}

export async function runGa4Report(accessToken: string, propertyId: string, days: number) {
  const end = new Date();
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: fmt(start), endDate: fmt(end) }],
        metrics: [
          { name: "activeUsers" },
          { name: "sessions" },
          { name: "screenPageViews" },
          { name: "engagementRate" },
          { name: "averageSessionDuration" },
        ],
      }),
    }
  );

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "GA4 runReport failed");

  const row = data?.rows?.[0];
  const values = row?.metricValues?.map((v: any) => v?.value) || [];
  const [activeUsers, sessions, pageviews, engagementRate, avgSessionDuration] = values;

  return {
    users: Number(activeUsers || 0),
    sessions: Number(sessions || 0),
    pageviews: Number(pageviews || 0),
    engagementRate: Number(engagementRate || 0),
    avgSessionDuration: Number(avgSessionDuration || 0),
  };
}

export async function runGa4TopPages(accessToken: string, propertyId: string, days: number) {
  const end = new Date();
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: fmt(start), endDate: fmt(end) }],
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 8,
      }),
    }
  );

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "GA4 top pages failed");

  const rows = (data?.rows || []).map((r: any) => ({
    path: r?.dimensionValues?.[0]?.value || "/",
    views: Number(r?.metricValues?.[0]?.value || 0),
  }));

  return rows;
}

export async function runGa4Channels(accessToken: string, propertyId: string, days: number) {
  const end = new Date();
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: fmt(start), endDate: fmt(end) }],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 6,
      }),
    }
  );

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "GA4 channels failed");

  const rows = (data?.rows || []).map((r: any) => ({
    channel: r?.dimensionValues?.[0]?.value || "Other",
    sessions: Number(r?.metricValues?.[0]?.value || 0),
  }));

  return rows;
}

export async function runGscQuery(accessToken: string, property: string, days: number) {
  const end = new Date();
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const siteUrlEnc = encodeURIComponent(property);

  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${siteUrlEnc}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate: fmt(start),
        endDate: fmt(end),
        dimensions: ["query"],
        rowLimit: 8,
      }),
    }
  );

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "GSC query failed");

  const rows = (data?.rows || []).map((r: any) => ({
    query: r?.keys?.[0] || "",
    clicks: Number(r?.clicks || 0),
    impressions: Number(r?.impressions || 0),
    ctr: Number(r?.ctr || 0),
    position: Number(r?.position || 0),
  }));

  const totals = {
    clicks: Number(data?.responseAggregationType ? 0 : 0), // API doesn't return totals; we'll sum
  };

  return { rows };
}


// Generic helper for any Google-backed integration stored in stats_integrations (GA4, GSC, GMB, ...).
export async function getGoogleTokenForAnyGoogle(source: StatsSourceKey, product: StatsProductKey) {
  const supabase = await createSupabaseServer();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) throw new Error("Not authenticated");
  const userId = authData.user.id;

  const { data, error } = await supabase
    .from("stats_integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "google")
    .eq("source", source)
    .eq("product", product)
    .eq("status", "connected")
    .maybeSingle();

  if (error) throw new Error("DB read failed");
  if (!data) return null;

  const row = data as unknown as GoogleTokenRow;

  // For any Google integration, refresh token is required to keep the connection alive.
  if (!row.refresh_token_enc) return null;

  let accessToken = row.access_token_enc;
  let expiresAt = row.expires_at;

  if (!accessToken || isExpired(expiresAt)) {
    const refreshed = await refreshGoogleAccessToken(row.refresh_token_enc);
    accessToken = refreshed.accessToken;
    expiresAt = refreshed.expiresAtIso;

    await supabase
      .from("stats_integrations")
      .update({ access_token_enc: accessToken, expires_at: expiresAt })
      .eq("id", row.id);
  }

  return { accessToken, row };
}
