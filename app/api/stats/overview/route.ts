import { NextResponse } from "next/server";
import type { StatsSourceKey } from "@/lib/googleStats";
import { tryDecryptToken } from "@/lib/oauthCrypto";
import { getChannelConnectionStates } from "@/lib/channelConnectionState";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function isExpired(expiresAt: unknown): boolean {
  if (!expiresAt) return false; // unknown => don't block
  const d =
    expiresAt instanceof Date
      ? expiresAt
      : typeof expiresAt === "string" || typeof expiresAt === "number"
        ? new Date(expiresAt)
        : null;
  if (!d) return false;
  const t = d.getTime();
  if (Number.isNaN(t)) return false;
  // 60s safety margin
  return t <= Date.now() + 60_000;
}

// NOTE: We lazy-import internal libs inside the handler to avoid returning an HTML error page
// when a dependency throws at module-evaluation time (e.g. cookies()/headers() scope issues).

function safeJsonParse<T>(s: unknown, fallback: T): T {
  if (!s) return fallback;
  try {
    if (typeof s === "string") return JSON.parse(s) as T;
    return s as T;
  } catch {
    return fallback;
  }
}

type SiteConn = { ga4: boolean; gsc: boolean };

type SourcesStatus = {
  site_inrcy: { connected: SiteConn };
  site_web: { connected: SiteConn };
  gmb: { connected: boolean; metrics: unknown | null };
  facebook: { connected: boolean; metrics: unknown | null };
  instagram: { connected: boolean; metrics: unknown | null };
  linkedin: { connected: boolean; metrics: unknown | null };
};

type SocialSnapshot = {
  gmb: { connected: boolean; metrics: unknown | null };
  facebook: { connected: boolean };
  instagram: { connected: boolean };
  linkedin: { connected: boolean };
};

type SiteSettings = {
  ga4?: { property_id?: string; measurement_id?: string };
  gsc?: { property?: string };
  site_web?: {
    ga4?: { property_id?: string; measurement_id?: string };
    gsc?: { property?: string };
  };
};

function _sumMap<K extends string>(items: Array<{ key: K; value: number }>) {
  const m = new Map<K, number>();
  for (const it of items) m.set(it.key, (m.get(it.key) || 0) + it.value);
  return m;
}

export async function GET(request: Request) {
  try {
    // Lazy-import server helpers inside the request scope to avoid Next.js request-scope errors.
    const { createSupabaseServer } = await import("@/lib/supabaseServer");
    const {
      getGoogleTokenFor,
      runGa4Report,
      runGa4TopPages,
      runGa4Channels,
      runGscQuery,
      getGoogleTokenForAnyGoogle,
    } = await import("@/lib/googleStats");
    const { gmbFetchDailyMetricsNormalized } = await import("@/lib/googleBusiness");
    const { igFetchDailyInsights } = await import("@/lib/metaInsights");
    const { fbFetchDailyInsights } = await import("@/lib/facebookInsights");
    const { liFetchOrgAnalytics, liResolveFirstAdminOrgUrn } = await import("@/lib/linkedinAnalytics");

    const { searchParams } = new URL(request.url);
    const days = Math.min(Math.max(Number(searchParams.get("days") || 28), 7), 90);
    const fresh = searchParams.get("fresh") === "1";

    // Optional: filter which sources to aggregate.
    // Comma-separated keys:
    // - site_inrcy_ga4, site_inrcy_gsc
    // - site_web_ga4,  site_web_gsc
    // - gmb, facebook
    const includeRaw = (searchParams.get("include") || "").trim();
    const includeSet = new Set(
      includeRaw
        ? includeRaw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : []
    );
    const includeAll = includeSet.size === 0;

    const cronSecret = process.env.VERCEL_CRON_SECRET || process.env.CRON_SECRET || "";
    const suppliedSecret = (searchParams.get("secret") || request.headers.get("x-cron-secret") || "").trim();
    const forcedUserId = (searchParams.get("userId") || "").trim();
    const isCronMode = Boolean(cronSecret && suppliedSecret && suppliedSecret === cronSecret && forcedUserId);

    const supabase = isCronMode ? supabaseAdmin : await createSupabaseServer();
    let userId = forcedUserId;
    if (!isCronMode) {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr || !authData?.user) {
        return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
      }
      userId = authData.user.id;
    }


    // --- Load all integration rows once (avoid Supabase rate-limits) ---
    // iNrStats calls this endpoint several times; repeated per-provider selects can hit Supabase mw:read limits.
    // We fetch the minimal integration snapshot once and reuse it for connection flags + metrics.
    const { data: integrationsAll = [] } = await supabase
      .from("integrations")
      .select("provider,source,product,status,resource_id,access_token_enc,expires_at,updated_at,created_at")
      .eq("user_id", userId);

    // Legacy table (older installs) used by some utilities (keep best-effort).
    const { data: integrationsLegacyAll = [] } = await supabase
      .from("integrations_statistiques")
      .select("provider,source,product,status,resource_id,updated_at,created_at")
      .eq("user_id", userId);

    function latestIntegrationAny(provider: string, source: string, product: string) {
      const rows = (Array.isArray(integrationsAll) ? integrationsAll : []).filter((row) => {
        const record = asRecord(row);
        return (
          String(record["provider"] ?? "") === provider &&
          String(record["source"] ?? "") === source &&
          String(record["product"] ?? "") === product
        );
      });
      rows.sort((left, right) => {
        const leftRecord = asRecord(left);
        const rightRecord = asRecord(right);
        const leftTime = new Date(String(leftRecord["updated_at"] ?? leftRecord["created_at"] ?? 0)).getTime();
        const rightTime = new Date(String(rightRecord["updated_at"] ?? rightRecord["created_at"] ?? 0)).getTime();
        return rightTime - leftTime;
      });
      return asRecord(rows[0]);
    }

    async function safeGetGoogleTokenFor(source: StatsSourceKey, product: "ga4" | "gsc") {
      try {
        return await getGoogleTokenFor(source, product, { supabase, userId });
      } catch {
        return null;
      }
    }



    // --- Social connection snapshot (always computed live) ---
    // IMPORTANT: iNrStats calls the same overview endpoint with different `include=` values.
    // If we return a cached payload generated by an older version (or without social keys),
    // the UI can incorrectly show "Déconnecté" even when integrations are connected.
    // So we always (re)hydrate social connection flags from `integrations` before returning.
    async function fetchSocialStatus() {
      const states = await getChannelConnectionStates(supabase, userId);
      return {
        gmb: { connected: states.gmb.connected, metrics: null },
        facebook: { connected: states.facebook.connected },
        instagram: { connected: states.instagram.connected },
        linkedin: { connected: states.linkedin.connected },
      } satisfies SocialSnapshot;
    }

// Ownership du site iNrCy : utile pour l'UI (rented => connexion globale "Suivi")
const { data: profileRow } = await supabase
  .from("profiles")
  .select("inrcy_site_ownership")
  .eq("user_id", userId)
  .maybeSingle();

const inrcySiteOwnership = String(asRecord(profileRow)["inrcy_site_ownership"] ?? "none");
const hasInrcySite = inrcySiteOwnership !== "none";

    
// Load settings from the new schema:
// - site_inrcy -> inrcy_site_configs.settings
// - site_web -> pro_tools_configs.settings.site_web
const [inrcyCfgRes, proCfgRes] = await Promise.all([
  supabase.from("inrcy_site_configs").select("settings").eq("user_id", userId).maybeSingle(),
  supabase.from("pro_tools_configs").select("settings").eq("user_id", userId).maybeSingle(),
]);

// NOTE: SiteSettings has only optional fields, so an empty object is a valid fallback.
// Using `null` breaks TS in production builds (null not assignable to SiteSettings).
const inrcySettings = safeJsonParse<SiteSettings>(asRecord(inrcyCfgRes.data)["settings"], {});
const proSettings = safeJsonParse<Record<string, unknown>>(asRecord(proCfgRes.data)["settings"], {});

// Flag: en mode rented, on peut couper uniquement la couche iNrCy (sans débrancher GA4/GSC)
const inrcyTrackingEnabled = Boolean(asRecord(inrcySettings)["inrcy_tracking_enabled"] ?? true);

// ---- Cache (anti-quota Google) ----
// ⚠️ Correctif critique : la clé de cache DOIT dépendre de l'état des connexions.
// Sinon, après une déconnexion, on peut resservir un ancien payload (ex: GMB +90) jusqu'à expiration.
//
// On fabrique donc un "snapshot" léger des statuts, en lisant :
// - integrations (nouveau)
// - integrations_statistiques (legacy) si présent
async function buildConnectionsKey() {
  const keyParts: string[] = [];

  // 1) new system snapshot (integrations table)
  try {
    const rows = Array.isArray(integrationsAll) ? (integrationsAll as unknown[]) : [];
    for (const r of rows) {
      const rr = asRecord(r);
      const provider = String(rr["provider"] ?? "");
      const source = String(rr["source"] ?? "");
      const product = String(rr["product"] ?? "");
      const status = String(rr["status"] ?? "");
      const resource = String(rr["resource_id"] ?? "");
      const updated = String(rr["updated_at"] ?? rr["created_at"] ?? "");
      if (!provider || !source || !product) continue;
      // Include BOTH connected and disconnected rows so a disconnect changes the cache key.
      keyParts.push(`${provider}:${source}:${product}:${status}:${resource}:${updated}`);
    }
  } catch {}

  // 2) legacy snapshot (integrations_statistiques)
  try {
    const rows = Array.isArray(integrationsLegacyAll) ? (integrationsLegacyAll as unknown[]) : [];
    for (const r of rows) {
      const rr = asRecord(r);
      const provider = String(rr["provider"] ?? "");
      const source = String(rr["source"] ?? "");
      const product = String(rr["product"] ?? "");
      const status = String(rr["status"] ?? "");
      const resource = String(rr["resource_id"] ?? "");
      const updated = String(rr["updated_at"] ?? rr["created_at"] ?? "");
      if (!provider || !source || !product) continue;
      keyParts.push(`legacy:${provider}:${source}:${product}:${status}:${resource}:${updated}`);
    }
  } catch {}

  // Tracking toggle impacts GA4/GSC visibility (avoid serving stale cached payload)
  keyParts.push(`inrcyTrackingEnabled:${inrcyTrackingEnabled ? "1" : "0"}`);

  return keyParts.join("|") || "none";
}

const connectionsKey = await buildConnectionsKey();
const rangeKey = `days=${days}|include=${includeRaw || "all"}|inrcy=${inrcyTrackingEnabled ? 1 : 0}|conn=${connectionsKey}`;

// Lecture cache (best-effort)
if (!fresh) try {
  const nowIso = new Date().toISOString();
  const { data: cacheHit } = await supabase
    .from("stats_cache")
    .select("payload, expires_at")
    .eq("user_id", userId)
    .eq("source", "overview")
    .eq("range_key", rangeKey)
    .gt("expires_at", nowIso)
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (asRecord(cacheHit)["payload"]) {
      const payload = asRecord(asRecord(cacheHit)["payload"]);
      // Rehydrate social connection flags to avoid stale/missing keys in cached payloads.
      try {
        const social = await fetchSocialStatus();
        payload["sources"] = { ...asRecord(payload["sources"]), ...social };
      } catch {}
      return NextResponse.json(payload);
  }
} catch {
  // Table stats_cache non présente ou non accessible : on ignore.
}

// Cache legacy (best-effort)
if (!fresh) try {
  const { data: legacyHit } = await supabase
    .from("cache_statistiques")
    .select("charge_utile, cree_a")
    .eq("id_utilisateur", userId)
    .eq("source", "apercu")
    .eq("plage_cle", rangeKey)
    .order("cree_a", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (asRecord(legacyHit)["charge_utile"]) {
    const payload = asRecord(asRecord(legacyHit)["charge_utile"]);
    // Rehydrate social connection flags to avoid stale/missing keys in legacy cached payloads.
    try {
      const social = await fetchSocialStatus();
      payload["sources"] = { ...asRecord(payload["sources"]), ...social };
    } catch {}
    return NextResponse.json(payload, {
      headers: fresh
        ? {
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          }
        : undefined,
    });
  }
} catch {
  // ignore
}

// --- GA4/GSC properties ---
// iNrCy site settings live in `inrcy_site_configs.settings` (root ga4/gsc)
const inrcyGa4 = asRecord(asRecord(inrcySettings)["ga4"]);
const inrcyGsc = asRecord(asRecord(inrcySettings)["gsc"]);

// Pro "site web" settings live in `pro_tools_configs.settings.site_web`
const proSiteWeb = asRecord(asRecord(proSettings)["site_web"]);
const webGa4 = asRecord(proSiteWeb["ga4"]);
const webGsc = asRecord(proSiteWeb["gsc"]);

const sources: Array<{ key: StatsSourceKey; ga4Property?: string; gscProperty?: string }> = [
  {
    key: "site_inrcy",
    // CRITICAL BUSINESS RULE:
    // when profiles.inrcy_site_ownership = "none", the iNrCy site must be treated as non-existent.
    // We therefore ignore any stale GA4/GSC configuration still present in inrcy_site_configs.
    ga4Property: hasInrcySite ? (String(inrcyGa4["property_id"] ?? "").trim() || undefined) : undefined,
    gscProperty: hasInrcySite ? (String(inrcyGsc["property"] ?? "").trim() || undefined) : undefined,
  },
  {
    key: "site_web",
    ga4Property: String(webGa4["property_id"] ?? "").trim() || undefined,
    gscProperty: String(webGsc["property"] ?? "").trim() || undefined,
  },
];


    // Fetch each source (SAFE PERF): run site sources concurrently, and run GA4 calls in parallel.
    const perSource: Record<string, { ga4: unknown | null; gsc: unknown | null; connected: SiteConn }> = {};
    const pageAgg = new Map<string, number>();
    const channelAgg = new Map<string, number>();
    const queryAgg = new Map<string, { clicks: number; impressions: number; positionSum: number; rows: number }>();

    let totalUsers = 0;
    let totalSessions = 0;
    let totalPageviews = 0;

    let engagementWeighted = 0; // engagementRate * sessions
    let durationWeighted = 0; // avgSessionDuration * sessions

    let totalClicks = 0;
    let totalImpressions = 0;

    const siteResults = await Promise.all(
      sources.map(async (s) => {
        const entry: { ga4: unknown | null; gsc: unknown | null; connected: SiteConn } = {
          ga4: null,
          gsc: null,
          connected: { ga4: false, gsc: false },
        };

        const includeGa4 = includeAll || includeSet.has(`${s.key}_ga4`) || includeSet.has(`${s.key}-ga4`);
        const includeGsc = includeAll || includeSet.has(`${s.key}_gsc`) || includeSet.has(`${s.key}-gsc`);

        const localPages = new Map<string, number>();
        const localChannels = new Map<string, number>();
        const localQueries = new Map<string, { clicks: number; impressions: number; positionSum: number; rows: number }>();

        let users = 0;
        let sessions = 0;
        let pageviews = 0;
        let engagementW = 0;
        let durationW = 0;
        let clicksSum = 0;
        let impressionsSum = 0;

        // GA4
        if (includeGa4 && s.ga4Property) {
          const token = await safeGetGoogleTokenFor(s.key, "ga4");
          if (token?.accessToken) {
            try {
              // ✅ parallel GA4 calls (was sequential)
              const [overview, pages, channels] = await Promise.all([
                runGa4Report(token.accessToken, s.ga4Property, days),
                runGa4TopPages(token.accessToken, s.ga4Property, days),
                runGa4Channels(token.accessToken, s.ga4Property, days),
              ]);

              entry.connected.ga4 = true;
              entry.ga4 = { propertyId: s.ga4Property, overview, pages, channels };

              users += overview.users;
              sessions += overview.sessions;
              pageviews += overview.pageviews;
              engagementW += overview.engagementRate * overview.sessions;
              durationW += overview.avgSessionDuration * overview.sessions;

              for (const p of pages) localPages.set(p.path, (localPages.get(p.path) || 0) + p.views);
              for (const c of channels) localChannels.set(c.channel, (localChannels.get(c.channel) || 0) + c.sessions);
            } catch (e) {
              entry.connected.ga4 = false;
              entry.ga4 = { propertyId: s.ga4Property, error: e instanceof Error ? e.message : String(e) };
            }
          }
        }

        // GSC
        if (includeGsc && s.gscProperty) {
          const token = await safeGetGoogleTokenFor(s.key, "gsc");
          if (token?.accessToken) {
            try {
              const q = await runGscQuery(token.accessToken, s.gscProperty, days);
              entry.connected.gsc = true;
              entry.gsc = { property: s.gscProperty, queries: q.rows };

              const rows = Array.isArray(asRecord(q)["rows"]) ? (asRecord(q)["rows"] as unknown[]) : [];
              for (const r of rows) {
                const rr = asRecord(r);
                const clicks = Number(rr["clicks"] ?? 0) || 0;
                const impressions = Number(rr["impressions"] ?? 0) || 0;
                const query = String(rr["query"] ?? "");
                const position = Number(rr["position"] ?? 0) || 0;

                clicksSum += clicks;
                impressionsSum += impressions;

                const cur = localQueries.get(query) || { clicks: 0, impressions: 0, positionSum: 0, rows: 0 };
                cur.clicks += clicks;
                cur.impressions += impressions;
                cur.positionSum += position;
                cur.rows += 1;
                localQueries.set(query, cur);
              }
            } catch (e) {
              entry.connected.gsc = false;
              entry.gsc = { property: s.gscProperty, error: e instanceof Error ? e.message : String(e) };
            }
          }
        }

        return {
          key: s.key,
          entry,
          agg: {
            users,
            sessions,
            pageviews,
            engagementW,
            durationW,
            clicksSum,
            impressionsSum,
            localPages,
            localChannels,
            localQueries,
          },
        };
      })
    );

    for (const r of siteResults) {
      perSource[r.key] = r.entry;
      totalUsers += r.agg.users;
      totalSessions += r.agg.sessions;
      totalPageviews += r.agg.pageviews;
      engagementWeighted += r.agg.engagementW;
      durationWeighted += r.agg.durationW;
      totalClicks += r.agg.clicksSum;
      totalImpressions += r.agg.impressionsSum;

      for (const [path, views] of r.agg.localPages.entries()) {
        pageAgg.set(path, (pageAgg.get(path) || 0) + views);
      }
      for (const [channel, sessions] of r.agg.localChannels.entries()) {
        channelAgg.set(channel, (channelAgg.get(channel) || 0) + sessions);
      }
      for (const [query, v] of r.agg.localQueries.entries()) {
        const cur = queryAgg.get(query) || { clicks: 0, impressions: 0, positionSum: 0, rows: 0 };
        cur.clicks += v.clicks;
        cur.impressions += v.impressions;
        cur.positionSum += v.positionSum;
        cur.rows += v.rows;
        queryAgg.set(query, cur);
      }
    }

    const engagementRate = totalSessions > 0 ? engagementWeighted / totalSessions : 0;
    const avgSessionDuration = totalSessions > 0 ? durationWeighted / totalSessions : 0;
    const ctr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;

    const topPages = Array.from(pageAgg.entries())
      .map(([path, views]) => ({ path, views }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 8);

    const channels = Array.from(channelAgg.entries())
      .map(([channel, sessions]) => ({ channel, sessions }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 6);

    const topQueries = Array.from(queryAgg.entries())
      .map(([query, v]) => ({
        query,
        clicks: v.clicks,
        impressions: v.impressions,
        ctr: v.impressions > 0 ? v.clicks / v.impressions : 0,
        position: v.rows > 0 ? v.positionSum / v.rows : 0,
      }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 8);

    // --- Connections + channel metrics ---
    const sourcesStatus: SourcesStatus = {
      site_inrcy: { connected: { ga4: false, gsc: false } },
      site_web: { connected: { ga4: false, gsc: false } },
      gmb: { connected: false, metrics: null },
      facebook: { connected: false, metrics: null },
      instagram: { connected: false, metrics: null },
      linkedin: { connected: false, metrics: null },
    };

    const channelStates = await getChannelConnectionStates(supabase, userId);

    // source commune des états de connexion
    sourcesStatus.site_inrcy.connected = channelStates.site_inrcy.connected
      ? { ga4: true, gsc: true }
      : { ga4: false, gsc: false };
    sourcesStatus.site_web.connected = channelStates.site_web.connected
      ? { ga4: true, gsc: true }
      : { ga4: false, gsc: false };

        // Facebook: connected if a page has been selected (resource_id)
    try {
      const fbRow = latestIntegrationAny("facebook", "facebook", "facebook");
      sourcesStatus.facebook.connected = channelStates.facebook.connected;

      // Real Facebook Page metrics (only if included)
      const includeFb = includeAll || includeSet.has("facebook");
      if (!includeFb) {
        sourcesStatus.facebook.metrics = null;
      } else if (sourcesStatus.facebook.connected && fbRow["resource_id"] && fbRow["access_token_enc"] && !isExpired(fbRow["expires_at"])) {
        try {
          const end = new Date();
          const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
          const token = tryDecryptToken(String(fbRow["access_token_enc"]));
          if (!token) throw new Error("Facebook access token manquant ou invalide.");
          sourcesStatus.facebook.metrics = await fbFetchDailyInsights(
            token,
            String(fbRow["resource_id"]),
            start,
            end
          );
        } catch (e) {
         sourcesStatus.facebook.metrics = { error: e instanceof Error ? e.message : String(e) };
        }
      } else {
        sourcesStatus.facebook.metrics = null;
      }
    } catch {}
    
    // Instagram: Meta family. Connected only once a profile is selected (resource_id).
    try {
      const igRow = latestIntegrationAny("instagram", "instagram", "instagram");
      sourcesStatus.instagram.connected = channelStates.instagram.connected;

      const includeIg = includeAll || includeSet.has("instagram");
      if (!includeIg) {
        sourcesStatus.instagram.metrics = null;
      } else if (sourcesStatus.instagram.connected && igRow["resource_id"] && igRow["access_token_enc"] && !isExpired(igRow["expires_at"])) {
        try {
          const end = new Date();
          const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
          const token = tryDecryptToken(String(igRow["access_token_enc"]));
          if (!token) throw new Error("Instagram access token manquant ou invalide.");
          sourcesStatus.instagram.metrics = await igFetchDailyInsights(token, String(igRow["resource_id"]), start, end);
        } catch (e) {
          sourcesStatus.instagram.metrics = { error: e instanceof Error ? e.message : String(e) };
        }
      } else {
        sourcesStatus.instagram.metrics = null;
      }
    } catch {}

// LinkedIn: connected if an OAuth row exists.
    try {
      const liRow = latestIntegrationAny("linkedin", "linkedin", "linkedin");
      sourcesStatus.linkedin.connected = channelStates.linkedin.connected;

      const includeLi = includeAll || includeSet.has("linkedin");
      if (!includeLi) {
        sourcesStatus.linkedin.metrics = null;
      } else if (sourcesStatus.linkedin.connected && liRow["access_token_enc"] && !isExpired(liRow["expires_at"])) {
        try {
          const token = tryDecryptToken(String(liRow["access_token_enc"]));
          if (!token) throw new Error("LinkedIn access token manquant ou invalide.");
          // Resolve first admin org if needed
          const orgUrn = String(asRecord(liRow["meta"])["org_urn"] || "");
          const resolvedOrgUrn = orgUrn || (await liResolveFirstAdminOrgUrn(token));
          const end = new Date();
          const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
          sourcesStatus.linkedin.metrics = await liFetchOrgAnalytics(token, resolvedOrgUrn, start, end);
        } catch (e) {
          sourcesStatus.linkedin.metrics = { error: e instanceof Error ? e.message : String(e) };
        }
      } else {
        sourcesStatus.linkedin.metrics = null;
      }
    } catch {}

// GMB: the UI needs a stable "connected" flag like GA4/GSC.
    // We consider it connected if an OAuth row exists and a location (resource_id) has been selected.
    // (We still *try* to fetch metrics, but a missing API enablement should not flip the badge back to "off".)
    try {
      const gmbRow = latestIntegrationAny("google", "gmb", "gmb");

      // Legacy override (older table)
      let legacyResource = "";
      try {
        const legacyRows = Array.isArray(integrationsLegacyAll) ? (integrationsLegacyAll as unknown[]) : [];
        const legacy = legacyRows
          .map((r) => asRecord(r))
          .filter((r) => r["provider"] === "google" && r["source"] === "gmb" && r["product"] === "gmb" && r["status"] === "connected")
          .sort((a, b) => {
            const aa = new Date(String(a["updated_at"] ?? a["created_at"] ?? 0)).getTime();
            const bb = new Date(String(b["updated_at"] ?? b["created_at"] ?? 0)).getTime();
            return bb - aa;
          })[0];
        legacyResource = String(asRecord(legacy)["resource_id"] || "");
      } catch {}

      const resourceId = String(gmbRow["resource_id"] || legacyResource || "");
      sourcesStatus.gmb.connected = channelStates.gmb.connected;

      const includeGmb = includeAll || includeSet.has("gmb");
      if (!includeGmb) {
        sourcesStatus.gmb.metrics = null;
      } else if (!sourcesStatus.gmb.connected) {
        sourcesStatus.gmb.metrics = null;
      } else {
        const tok = await getGoogleTokenForAnyGoogle("gmb", "gmb", { supabase, userId });
        const accessToken = tok?.accessToken;

        // IMPORTANT: GMB metrics are tied to a *location* (establishment page), not the Google account.
        // We only fetch metrics once a location has been explicitly selected and saved.
        const loc = resourceId;

        if (accessToken && loc) {
          const end = new Date();
          const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
          try {
            sourcesStatus.gmb.metrics = await gmbFetchDailyMetricsNormalized(accessToken, loc, start, end);
          } catch (e) {
            sourcesStatus.gmb.metrics = { error: (e instanceof Error ? e.message : String(e)) || "Impossible de récupérer les statistiques pour le moment.", location: loc };
          }
        } else {
          sourcesStatus.gmb.metrics = null;
        }
      }
    } catch {}

    const payload = {
      days,
      selected: includeAll ? null : Array.from(includeSet),
      inrcySiteOwnership,
      identities: {
        site_inrcy: {
          label: channelStates.site_inrcy.url || null,
          url: channelStates.site_inrcy.url || null,
        },
        site_web: {
          label: channelStates.site_web.url || null,
          url: channelStates.site_web.url || null,
        },
        gmb: {
          label: channelStates.gmb.resource_label || null,
          url: null,
        },
        facebook: {
          label: channelStates.facebook.resource_label || null,
          url: channelStates.facebook.page_url || null,
        },
        instagram: {
          label: channelStates.instagram.username ? `@${channelStates.instagram.username}` : null,
          url: channelStates.instagram.profile_url || null,
        },
        linkedin: {
          label: channelStates.linkedin.display_name || null,
          url: channelStates.linkedin.profile_url || null,
        },
      },
      totals: {
        users: totalUsers,
        sessions: totalSessions,
        pageviews: totalPageviews,
        engagementRate,
        avgSessionDuration,
        clicks: totalClicks,
        impressions: totalImpressions,
        ctr,
      },
      topPages,
      channels,
      topQueries,
      sources: sourcesStatus,
      note: "Sources connectées: site iNrCy (GA4/GSC), site web (GA4/GSC), GMB, Facebook, Instagram, LinkedIn.",
    };

    // cache write (best-effort)
    try {
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await supabase.from("stats_cache").insert({
        user_id: userId,
        source: "overview",
        range_key: rangeKey,
        payload,
        expires_at: expiresAt,
      });
    } catch {}

    // cache legacy write (best-effort)
    try {
      await supabase.from("cache_statistiques").insert({
        id_utilisateur: userId,
        source: "apercu",
        plage_cle: rangeKey,
        charge_utile: payload,
      });
    } catch {}

    return NextResponse.json(payload, {
      headers: fresh
        ? {
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          }
        : undefined,
    });
  // NOTE: Turbopack/SWC can be picky about type annotations in catch clauses.
  // We keep the variable untyped (it is effectively `unknown`), then narrow.
  } catch (e) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)) || "Le service est momentanément indisponible. Merci de réessayer dans quelques minutes." }, { status: 500 });
  }
}