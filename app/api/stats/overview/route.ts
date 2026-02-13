import { NextResponse } from "next/server";
import type { StatsSourceKey } from "@/lib/googleStats";

// NOTE: We lazy-import internal libs inside the handler to avoid returning an HTML error page
// when a dependency throws at module-evaluation time (e.g. cookies()/headers() scope issues).

function safeJsonParse<T>(s: any, fallback: T): T {
  if (!s) return fallback;
  try {
    if (typeof s === "string") return JSON.parse(s) as T;
    return s as T;
  } catch {
    return fallback;
  }
}

type SiteSettings = {
  ga4?: { property_id?: string; measurement_id?: string };
  gsc?: { property?: string };
  site_web?: {
    ga4?: { property_id?: string; measurement_id?: string };
    gsc?: { property?: string };
  };
};

function sumMap<K extends string>(items: Array<{ key: K; value: number }>) {
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
    const { gmbFetchDailyMetrics } = await import("@/lib/googleBusiness");

    const { searchParams } = new URL(request.url);
    const days = Math.min(Math.max(Number(searchParams.get("days") || 28), 7), 90);

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

    const supabase = await createSupabaseServer();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const userId = authData.user.id;


// Ownership du site iNrCy : utile pour l'UI (rented => connexion globale "Suivi")
const { data: profileRow } = await supabase
  .from("profiles")
  .select("inrcy_site_ownership")
  .eq("user_id", userId)
  .maybeSingle();

const inrcySiteOwnership = String((profileRow as any)?.inrcy_site_ownership || "none");

    
// Load settings from the new schema:
// - site_inrcy -> inrcy_site_configs.settings
// - site_web -> pro_tools_configs.settings.site_web
// Fallback legacy : site_configs.settings
const [inrcyCfgRes, proCfgRes, legacyCfgRes] = await Promise.all([
  supabase.from("inrcy_site_configs").select("settings").eq("user_id", userId).maybeSingle(),
  supabase.from("pro_tools_configs").select("settings").eq("user_id", userId).maybeSingle(),
  supabase.from("site_configs").select("settings").eq("user_id", userId).maybeSingle(),
]);

// NOTE: SiteSettings has only optional fields, so an empty object is a valid fallback.
// Using `null` breaks TS in production builds (null not assignable to SiteSettings).
const inrcySettings = safeJsonParse<SiteSettings>((inrcyCfgRes.data as any)?.settings, {}) ??
  safeJsonParse<SiteSettings>((legacyCfgRes.data as any)?.settings, {});
const proSettings = safeJsonParse<any>((proCfgRes.data as any)?.settings, null) ??
  safeJsonParse<any>((legacyCfgRes.data as any)?.settings, {});

// Flag: en mode rented, on peut couper uniquement la couche iNrCy (sans débrancher GA4/GSC)
const inrcyTrackingEnabled = Boolean((inrcySettings as any)?.inrcy_tracking_enabled ?? true);

// ---- Cache (anti-quota Google) ----
// IMPORTANT: le cache doit dépendre de l'état ON/OFF du suivi iNrCy.
// Sinon, après une désactivation, on pourrait resservir des stats calculées
// quand iNrCy était encore activé.
// On inclut donc un flag dans la clé de cache.
const rangeKey = `days=${days}|include=${includeRaw || "all"}|inrcy=${inrcyTrackingEnabled ? 1 : 0}`;
try {
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
  if ((cacheHit as any)?.payload) {
    return NextResponse.json((cacheHit as any).payload);
  }
} catch {
  // Table stats_cache non présente ou non accessible : on ignore.
}


    
const sources: Array<{ key: StatsSourceKey; ga4Property?: string; gscProperty?: string }> = [
  {
    key: "site_inrcy",
    ga4Property: inrcyTrackingEnabled ? (inrcySettings as any)?.ga4?.property_id : undefined,
    gscProperty: inrcyTrackingEnabled ? (inrcySettings as any)?.gsc?.property : undefined,
  },
  {
    key: "site_web",
    ga4Property: (proSettings as any)?.site_web?.ga4?.property_id,
    gscProperty: (proSettings as any)?.site_web?.gsc?.property,
  },
];


    // Fetch each source
    const perSource: any = {};
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

    for (const s of sources) {
      perSource[s.key] = { ga4: null, gsc: null, connected: { ga4: false, gsc: false } };

      const includeGa4 =
        includeAll || includeSet.has(`${s.key}_ga4`) || includeSet.has(`${s.key}-ga4`);
      const includeGsc =
        includeAll || includeSet.has(`${s.key}_gsc`) || includeSet.has(`${s.key}-gsc`);


      // GA4
      if (s.ga4Property) {
        const token = await getGoogleTokenFor(s.key, "ga4");
        if (token?.accessToken) {
          perSource[s.key].connected.ga4 = true;

          const overview = await runGa4Report(token.accessToken, s.ga4Property, days);
          const pages = await runGa4TopPages(token.accessToken, s.ga4Property, days);
          const channels = await runGa4Channels(token.accessToken, s.ga4Property, days);

          perSource[s.key].ga4 = { propertyId: s.ga4Property, overview, pages, channels };

          if (includeGa4) totalUsers += overview.users;
          if (includeGa4) totalSessions += overview.sessions;
          if (includeGa4) totalPageviews += overview.pageviews;

          if (includeGa4) engagementWeighted += overview.engagementRate * overview.sessions;
          if (includeGa4) durationWeighted += overview.avgSessionDuration * overview.sessions;

          if (includeGa4) for (const p of pages) pageAgg.set(p.path, (pageAgg.get(p.path) || 0) + p.views);
          if (includeGa4) for (const c of channels) channelAgg.set(c.channel, (channelAgg.get(c.channel) || 0) + c.sessions);
        }
      }

      // GSC
      if (s.gscProperty) {
        const token = await getGoogleTokenFor(s.key, "gsc");
        if (token?.accessToken) {
          perSource[s.key].connected.gsc = true;

          const q = await runGscQuery(token.accessToken, s.gscProperty, days);
          perSource[s.key].gsc = { property: s.gscProperty, queries: q.rows };

          for (const r of q.rows) {
            if (!includeGsc) continue;
            totalClicks += r.clicks;
            totalImpressions += r.impressions;

            const cur = queryAgg.get(r.query) || { clicks: 0, impressions: 0, positionSum: 0, rows: 0 };
            cur.clicks += r.clicks;
            cur.impressions += r.impressions;
            cur.positionSum += r.position;
            cur.rows += 1;
            queryAgg.set(r.query, cur);
          }
        }
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

    // --- GMB + Facebook connections (for badges + future metrics) ---
    const sourcesStatus: any = {
      site_inrcy: { connected: { ga4: false, gsc: false } },
      site_web: { connected: { ga4: false, gsc: false } },
      gmb: { connected: false, metrics: null },
      facebook: { connected: false },
    };

    // copy site connections from perSource (built above)
    sourcesStatus.site_inrcy.connected = perSource.site_inrcy?.connected || { ga4: false, gsc: false };
    sourcesStatus.site_web.connected = perSource.site_web?.connected || { ga4: false, gsc: false };

    // Facebook: presence of a connected row is enough (token validity is handled in its own status endpoint)
    try {
      const { data: fbRow } = await supabase
        .from("stats_integrations")
        .select("id,status")
        .eq("user_id", userId)
        .eq("provider", "facebook")
        .eq("source", "facebook")
        .eq("product", "facebook")
        .eq("status", "connected")
        .maybeSingle();
      sourcesStatus.facebook.connected = !!fbRow;
    } catch {}

    // GMB: the UI needs a stable "connected" flag like GA4/GSC.
    // We consider it connected if an OAuth row exists in stats_integrations.
    // (We still *try* to fetch metrics, but a missing API enablement should not flip the badge back to "off".)
    try {
      const { data: gmbRow } = await supabase
        .from("stats_integrations")
        .select("id,status,resource_id")
        .eq("user_id", userId)
        .eq("provider", "google")
        .eq("source", "gmb")
        .eq("product", "gmb")
        .eq("status", "connected")
        .maybeSingle();

      sourcesStatus.gmb.connected = !!gmbRow;

      if (gmbRow) {
        const includeGmb = includeAll || includeSet.has("gmb");
        if (!includeGmb) {
          // Do not fetch metrics when filtered out.
          sourcesStatus.gmb.metrics = null;
        } else {
        const tok = await getGoogleTokenForAnyGoogle("gmb", "gmb");
        const accessToken = tok?.accessToken;
        const loc = gmbRow?.resource_id || tok?.row?.resource_id;

        if (accessToken && loc) {
          const end = new Date();
          const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
          try {
            sourcesStatus.gmb.metrics = await gmbFetchDailyMetrics(accessToken, loc, start, end);
          } catch (e: any) {
            sourcesStatus.gmb.metrics = { error: e?.message || "performance fetch failed", location: loc };
          }
        }
        }
      }
    } catch {}



    const payload = {
      days,
      selected: includeAll ? null : Array.from(includeSet),
      inrcySiteOwnership,
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
      note: "Sources connectées: site iNrCy (GA4/GSC), site web (GA4/GSC), GMB, Facebook.",
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

    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
