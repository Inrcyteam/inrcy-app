import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import {
  getGoogleTokenFor,
  runGa4Report,
  runGa4TopPages,
  runGa4Channels,
  runGscQuery,
  StatsSourceKey,
  getGoogleTokenForAnyGoogle,
} from "@/lib/googleStats";
import { testGmbConnectivity, gmbFetchDailyMetrics } from "@/lib/googleBusiness";

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
    const { searchParams } = new URL(request.url);
    const days = Math.min(Math.max(Number(searchParams.get("days") || 28), 7), 90);

    const supabase = await createSupabaseServer();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const userId = authData.user.id;

    // Load settings for both sources from site_configs.settings
    const { data: cfg, error: cfgErr } = await supabase
      .from("site_configs")
      .select("settings")
      .eq("user_id", userId)
      .maybeSingle();

    if (cfgErr) return NextResponse.json({ error: "DB read site_configs failed" }, { status: 500 });

    const settings = safeJsonParse<SiteSettings>(cfg?.settings, {});

    const sources: Array<{ key: StatsSourceKey; ga4Property?: string; gscProperty?: string }> = [
      {
        key: "site_inrcy",
        ga4Property: settings?.ga4?.property_id,
        gscProperty: settings?.gsc?.property,
      },
      {
        key: "site_web",
        ga4Property: settings?.site_web?.ga4?.property_id,
        gscProperty: settings?.site_web?.gsc?.property,
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

      // GA4
      if (s.ga4Property) {
        const token = await getGoogleTokenFor(s.key, "ga4");
        if (token?.accessToken) {
          perSource[s.key].connected.ga4 = true;

          const overview = await runGa4Report(token.accessToken, s.ga4Property, days);
          const pages = await runGa4TopPages(token.accessToken, s.ga4Property, days);
          const channels = await runGa4Channels(token.accessToken, s.ga4Property, days);

          perSource[s.key].ga4 = { propertyId: s.ga4Property, overview, pages, channels };

          totalUsers += overview.users;
          totalSessions += overview.sessions;
          totalPageviews += overview.pageviews;

          engagementWeighted += overview.engagementRate * overview.sessions;
          durationWeighted += overview.avgSessionDuration * overview.sessions;

          for (const p of pages) pageAgg.set(p.path, (pageAgg.get(p.path) || 0) + p.views);
          for (const c of channels) channelAgg.set(c.channel, (channelAgg.get(c.channel) || 0) + c.sessions);
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

    // GMB: get token (auto-refresh) and do a real connectivity test (accounts endpoint).
    try {
      const tok = await getGoogleTokenForAnyGoogle("gmb", "gmb");
      if (tok?.accessToken) {
        const t = await testGmbConnectivity(tok.accessToken);
        sourcesStatus.gmb.connected = !!t.connected;

        // Best-effort: if we have a saved default location, try to fetch performance metrics for the selected period.
        const loc = tok.row?.resource_id;
        if (t.connected && loc) {
          const end = new Date();
          const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
          try {
            sourcesStatus.gmb.metrics = await gmbFetchDailyMetrics(tok.accessToken, loc, start, end);
          } catch (e: any) {
            // Keep connected=true even if performance API not enabled; expose error for debugging.
            sourcesStatus.gmb.metrics = { error: e?.message || "performance fetch failed", location: loc };
          }
        }
      }
    } catch {}



    return NextResponse.json({
      days,
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
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
