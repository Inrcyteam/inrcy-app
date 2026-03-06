import { createHash } from "crypto";
import { NextResponse } from "next/server";
import type { StatsSourceKey } from "@/lib/googleStats";
import { tryDecryptToken } from "@/lib/oauthCrypto";

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function safeJsonParse<T>(s: unknown, fallback: T): T {
  if (!s) return fallback;
  try {
    if (typeof s === "string") return JSON.parse(s) as T;
    return s as T;
  } catch {
    return fallback;
  }
}

function isExpired(expiresAt: unknown): boolean {
  if (!expiresAt) return false;
  const d =
    expiresAt instanceof Date
      ? expiresAt
      : typeof expiresAt === "string" || typeof expiresAt === "number"
        ? new Date(expiresAt)
        : null;
  if (!d) return false;
  const t = d.getTime();
  if (Number.isNaN(t)) return false;
  return t <= Date.now() + 60_000;
}

function hashKey(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

async function withTimeout<T>(label: string, ms: number, task: () => Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      task(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type SiteConn = { ga4: boolean; gsc: boolean };
type SiteSettings = {
  ga4?: { property_id?: string; measurement_id?: string };
  gsc?: { property?: string };
  site_web?: {
    ga4?: { property_id?: string; measurement_id?: string };
    gsc?: { property?: string };
  };
  inrcy_tracking_enabled?: boolean;
};

type OverviewPayload = {
  days: number;
  selected: string[] | null;
  inrcySiteOwnership: string;
  totals: {
    users: number;
    sessions: number;
    pageviews: number;
    engagementRate: number;
    avgSessionDuration: number;
    clicks: number;
    impressions: number;
    ctr: number;
  };
  topPages: Array<{ path: string; views: number }>;
  channels: Array<{ channel: string; sessions: number }>;
  topQueries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>;
  sources: {
    site_inrcy: { connected: SiteConn };
    site_web: { connected: SiteConn };
    gmb: { connected: boolean; metrics: unknown | null };
    facebook: { connected: boolean; metrics: unknown | null };
    instagram: { connected: boolean; metrics: unknown | null };
    linkedin: { connected: boolean; metrics: unknown | null };
  };
  note: string;
};

type SiteSnapshotPayload = {
  connected: SiteConn;
  totals: {
    users: number;
    sessions: number;
    pageviews: number;
    engagementWeighted: number;
    durationWeighted: number;
    clicks: number;
    impressions: number;
  };
  topPages: Array<{ path: string; views: number }>;
  channels: Array<{ channel: string; sessions: number }>;
  topQueries: Array<{ query: string; clicks: number; impressions: number; positionSum: number; rows: number }>;
};

type SocialSnapshotPayload = { metrics: unknown | null };
type SnapshotPayload = SiteSnapshotPayload | SocialSnapshotPayload;
type SnapshotSource = "site_inrcy" | "site_web" | "facebook" | "instagram" | "linkedin" | "gmb";

type IntegrationRow = Record<string, unknown>;

function getLatestIntegration(integrations: IntegrationRow[], provider: string, source: string, product: string) {
  const rows = integrations.filter((r) => {
    return r["provider"] === provider && r["source"] === source && r["product"] === product;
  });
  rows.sort((a, b) => {
    const aa = new Date(String(a["updated_at"] ?? a["created_at"] ?? 0)).getTime();
    const bb = new Date(String(b["updated_at"] ?? b["created_at"] ?? 0)).getTime();
    return bb - aa;
  });
  return asRecord(rows[0]);
}

function buildSourceConnectionKey(args: { source: SnapshotSource; days: number; parts: Array<string | number | boolean | null | undefined> }) {
  return hashKey(`${args.source}|days=${args.days}|${args.parts.map((x) => String(x ?? "")).join("|")}`);
}

async function readSnapshotMap(
  supabase: any,
  userId: string,
  days: number,
  sourceKeys: Partial<Record<SnapshotSource, string>>
): Promise<Map<SnapshotSource, SnapshotPayload>> {
  const sources = Object.keys(sourceKeys) as SnapshotSource[];
  const out = new Map<SnapshotSource, SnapshotPayload>();
  if (sources.length === 0) return out;

  const { data } = await supabase
    .from("stats_snapshot")
    .select("source, connection_key, payload, expires_at, updated_at")
    .eq("user_id", userId)
    .eq("days", days)
    .in("source", sources)
    .gt("expires_at", new Date().toISOString())
    .order("updated_at", { ascending: false });

  const rows = Array.isArray(data) ? (data as unknown[]) : [];
  for (const raw of rows) {
    const row = asRecord(raw);
    const source = String(row["source"] ?? "") as SnapshotSource;
    if (!source || out.has(source)) continue;
    if (String(row["connection_key"] ?? "") !== String(sourceKeys[source] ?? "")) continue;
    const payload = row["payload"] as SnapshotPayload;
    out.set(source, payload);
  }

  return out;
}

async function writeSnapshot(
  supabase: any,
  userId: string,
  source: SnapshotSource,
  days: number,
  connectionKey: string,
  payload: SnapshotPayload,
  ttlMinutes: number
) {
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
  await supabase.from("stats_snapshot").upsert(
    {
      user_id: userId,
      source,
      days,
      connection_key: connectionKey,
      payload,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,source,days,connection_key" }
  );
}

function emptySiteSnapshot(): SiteSnapshotPayload {
  return {
    connected: { ga4: false, gsc: false },
    totals: {
      users: 0,
      sessions: 0,
      pageviews: 0,
      engagementWeighted: 0,
      durationWeighted: 0,
      clicks: 0,
      impressions: 0,
    },
    topPages: [],
    channels: [],
    topQueries: [],
  };
}

export async function GET(request: Request) {
  try {
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
    const { liFetchOrgShareStats, liResolveFirstAdminOrgUrn } = await import("@/lib/linkedinAnalytics");

    const { searchParams } = new URL(request.url);
    const days = Math.min(Math.max(Number(searchParams.get("days") || 28), 7), 90);
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

    const [{ data: integrationsRaw = [] }, { data: profileRow }, inrcyCfgRes, proCfgRes] = await Promise.all([
      supabase
        .from("integrations")
        .select("provider,source,product,status,resource_id,access_token_enc,expires_at,updated_at,created_at,meta")
        .eq("user_id", userId),
      supabase.from("profiles").select("inrcy_site_ownership").eq("user_id", userId).maybeSingle(),
      supabase.from("inrcy_site_configs").select("settings").eq("user_id", userId).maybeSingle(),
      supabase.from("pro_tools_configs").select("settings").eq("user_id", userId).maybeSingle(),
    ]);

    const integrationsAll = (Array.isArray(integrationsRaw) ? integrationsRaw : []).map((r) => asRecord(r));
    const inrcySiteOwnership = String(asRecord(profileRow)["inrcy_site_ownership"] ?? "none");
    const inrcySettings = safeJsonParse<SiteSettings>(asRecord(inrcyCfgRes.data)["settings"], {});
    const proSettings = safeJsonParse<Record<string, unknown>>(asRecord(proCfgRes.data)["settings"], {});
    const inrcyTrackingEnabled = Boolean(asRecord(inrcySettings)["inrcy_tracking_enabled"] ?? true);

    const inrcyGa4 = asRecord(asRecord(inrcySettings)["ga4"]);
    const inrcyGsc = asRecord(asRecord(inrcySettings)["gsc"]);
    const proSiteWeb = asRecord(asRecord(proSettings)["site_web"]);
    const webGa4 = asRecord(proSiteWeb["ga4"]);
    const webGsc = asRecord(proSiteWeb["gsc"]);

    const siteConfigs: Array<{
      key: "site_inrcy" | "site_web";
      ga4Property?: string;
      gscProperty?: string;
      enabled: boolean;
    }> = [
      {
        key: "site_inrcy",
        ga4Property: String(inrcyGa4["property_id"] ?? "").trim() || undefined,
        gscProperty: String(inrcyGsc["property"] ?? "").trim() || undefined,
        enabled: inrcyTrackingEnabled,
      },
      {
        key: "site_web",
        ga4Property: String(webGa4["property_id"] ?? "").trim() || undefined,
        gscProperty: String(webGsc["property"] ?? "").trim() || undefined,
        enabled: true,
      },
    ];

    const fbRow = getLatestIntegration(integrationsAll, "facebook", "facebook", "facebook");
    const igRow = getLatestIntegration(integrationsAll, "instagram", "instagram", "instagram");
    const liRow = getLatestIntegration(integrationsAll, "linkedin", "linkedin", "linkedin");
    const gmbRow = getLatestIntegration(integrationsAll, "google", "gmb", "gmb");

    const socialConnected = {
      facebook: String(fbRow["status"] ?? "") === "connected" && !!fbRow["resource_id"] && !isExpired(fbRow["expires_at"]),
      instagram: String(igRow["status"] ?? "") === "connected" && !!igRow["resource_id"] && !isExpired(igRow["expires_at"]),
      linkedin: String(liRow["status"] ?? "") === "connected" && !isExpired(liRow["expires_at"]),
      gmb: String(gmbRow["status"] ?? "") === "connected" && !!gmbRow["resource_id"] && !isExpired(gmbRow["expires_at"]),
    };

    const sourceKeys: Partial<Record<SnapshotSource, string>> = {};

    for (const s of siteConfigs) {
      sourceKeys[s.key] = buildSourceConnectionKey({
        source: s.key,
        days,
        parts: [
          s.enabled ? 1 : 0,
          s.ga4Property || "",
          s.gscProperty || "",
          includeAll || includeSet.has(`${s.key}_ga4`) || includeSet.has(`${s.key}-ga4`) ? 1 : 0,
          includeAll || includeSet.has(`${s.key}_gsc`) || includeSet.has(`${s.key}-gsc`) ? 1 : 0,
          ...integrationsAll
            .filter((r) => r["provider"] === "google" && (r["source"] === s.key || r["source"] === "gmb"))
            .map((r) => `${r["provider"]}:${r["source"]}:${r["product"]}:${r["status"]}:${r["resource_id"]}:${r["updated_at"] ?? r["created_at"]}`),
        ],
      });
    }

 sourceKeys.facebook = buildSourceConnectionKey({
  source: "facebook",
  days,
  parts: [
    String(fbRow["status"] ?? ""),
    String(fbRow["resource_id"] ?? ""),
    String(fbRow["expires_at"] ?? ""),
    String(fbRow["updated_at"] ?? fbRow["created_at"] ?? ""),
  ],
});

sourceKeys.instagram = buildSourceConnectionKey({
  source: "instagram",
  days,
  parts: [
    String(igRow["status"] ?? ""),
    String(igRow["resource_id"] ?? ""),
    String(igRow["expires_at"] ?? ""),
    String(igRow["updated_at"] ?? igRow["created_at"] ?? ""),
  ],
});

sourceKeys.linkedin = buildSourceConnectionKey({
  source: "linkedin",
  days,
  parts: [
    String(liRow["status"] ?? ""),
    String(liRow["expires_at"] ?? ""),
    String(liRow["updated_at"] ?? liRow["created_at"] ?? ""),
    String(asRecord(liRow["meta"])["org_urn"] ?? ""),
  ],
});

sourceKeys.gmb = buildSourceConnectionKey({
  source: "gmb",
  days,
  parts: [
    String(gmbRow["status"] ?? ""),
    String(gmbRow["resource_id"] ?? ""),
    String(gmbRow["expires_at"] ?? ""),
    String(gmbRow["updated_at"] ?? gmbRow["created_at"] ?? ""),
  ],
});

    const snapshotMap = await readSnapshotMap(supabase, userId, days, sourceKeys);

    async function buildSiteSnapshot(sourceCfg: (typeof siteConfigs)[number]): Promise<SiteSnapshotPayload> {
      const cached = snapshotMap.get(sourceCfg.key) as SiteSnapshotPayload | undefined;
      if (cached) return cached;

      const includeGa4 = sourceCfg.enabled && (includeAll || includeSet.has(`${sourceCfg.key}_ga4`) || includeSet.has(`${sourceCfg.key}-ga4`));
      const includeGsc = sourceCfg.enabled && (includeAll || includeSet.has(`${sourceCfg.key}_gsc`) || includeSet.has(`${sourceCfg.key}-gsc`));
      const out = emptySiteSnapshot();

      if (!includeGa4 && !includeGsc) {
        return out;
      }

      const [ga4Token, gscToken] = await Promise.all([
        includeGa4 && sourceCfg.ga4Property
          ? withTimeout(`${sourceCfg.key} ga4 token`, 7000, () => getGoogleTokenFor(sourceCfg.key as StatsSourceKey, "ga4")).catch(() => null)
          : Promise.resolve(null),
        includeGsc && sourceCfg.gscProperty
          ? withTimeout(`${sourceCfg.key} gsc token`, 7000, () => getGoogleTokenFor(sourceCfg.key as StatsSourceKey, "gsc")).catch(() => null)
          : Promise.resolve(null),
      ]);

      const ga4Task = ga4Token?.accessToken && sourceCfg.ga4Property
        ? Promise.all([
            withTimeout(`${sourceCfg.key} ga4 overview`, 9000, () => runGa4Report(ga4Token.accessToken, sourceCfg.ga4Property!, days)),
            withTimeout(`${sourceCfg.key} ga4 pages`, 9000, () => runGa4TopPages(ga4Token.accessToken, sourceCfg.ga4Property!, days)),
            withTimeout(`${sourceCfg.key} ga4 channels`, 9000, () => runGa4Channels(ga4Token.accessToken, sourceCfg.ga4Property!, days)),
          ]).catch(() => null)
        : Promise.resolve(null);

      const gscTask = gscToken?.accessToken && sourceCfg.gscProperty
        ? withTimeout(`${sourceCfg.key} gsc queries`, 10000, () => runGscQuery(gscToken.accessToken, sourceCfg.gscProperty!, days)).catch(() => null)
        : Promise.resolve(null);

      const [ga4Data, gscData] = await Promise.all([ga4Task, gscTask]);

      if (ga4Data) {
        const [overview, pages, channels] = ga4Data;
        out.connected.ga4 = true;
        out.totals.users += Number(overview.users || 0);
        out.totals.sessions += Number(overview.sessions || 0);
        out.totals.pageviews += Number(overview.pageviews || 0);
        out.totals.engagementWeighted += Number(overview.engagementRate || 0) * Number(overview.sessions || 0);
        out.totals.durationWeighted += Number(overview.avgSessionDuration || 0) * Number(overview.sessions || 0);
        out.topPages = Array.isArray(pages)
          ? pages.map((p: any) => ({ path: String(p.path || ""), views: Number(p.views || 0) }))
          : [];
        out.channels = Array.isArray(channels)
          ? channels.map((c: any) => ({ channel: String(c.channel || ""), sessions: Number(c.sessions || 0) }))
          : [];
      }

      if (gscData) {
        out.connected.gsc = true;
        const rows = Array.isArray(asRecord(gscData)["rows"]) ? (asRecord(gscData)["rows"] as unknown[]) : [];
        for (const rawRow of rows) {
          const row = asRecord(rawRow);
          out.totals.clicks += Number(row["clicks"] || 0);
          out.totals.impressions += Number(row["impressions"] || 0);
          out.topQueries.push({
            query: String(row["query"] || ""),
            clicks: Number(row["clicks"] || 0),
            impressions: Number(row["impressions"] || 0),
            positionSum: Number(row["position"] || 0),
            rows: 1,
          });
        }
      }

      await writeSnapshot(supabase, userId, sourceCfg.key, days, String(sourceKeys[sourceCfg.key]), out, 15).catch(() => {});
      return out;
    }

    const [siteInrcySnap, siteWebSnap] = await Promise.all(siteConfigs.map((cfg) => buildSiteSnapshot(cfg)));
    const siteSnapshots: Record<"site_inrcy" | "site_web", SiteSnapshotPayload> = {
      site_inrcy: siteInrcySnap,
      site_web: siteWebSnap,
    };

    const pageAgg = new Map<string, number>();
    const channelAgg = new Map<string, number>();
    const queryAgg = new Map<string, { clicks: number; impressions: number; positionSum: number; rows: number }>();

    let totalUsers = 0;
    let totalSessions = 0;
    let totalPageviews = 0;
    let engagementWeighted = 0;
    let durationWeighted = 0;
    let totalClicks = 0;
    let totalImpressions = 0;

    for (const snap of Object.values(siteSnapshots)) {
      totalUsers += snap.totals.users;
      totalSessions += snap.totals.sessions;
      totalPageviews += snap.totals.pageviews;
      engagementWeighted += snap.totals.engagementWeighted;
      durationWeighted += snap.totals.durationWeighted;
      totalClicks += snap.totals.clicks;
      totalImpressions += snap.totals.impressions;

      for (const p of snap.topPages) pageAgg.set(p.path, (pageAgg.get(p.path) || 0) + p.views);
      for (const c of snap.channels) channelAgg.set(c.channel, (channelAgg.get(c.channel) || 0) + c.sessions);
      for (const q of snap.topQueries) {
        const cur = queryAgg.get(q.query) || { clicks: 0, impressions: 0, positionSum: 0, rows: 0 };
        cur.clicks += q.clicks;
        cur.impressions += q.impressions;
        cur.positionSum += q.positionSum;
        cur.rows += q.rows;
        queryAgg.set(q.query, cur);
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

    const socialSources: Array<{
      key: "facebook" | "instagram" | "linkedin" | "gmb";
      connected: boolean;
      include: boolean;
      row: IntegrationRow;
      ttlMinutes: number;
      fetcher: () => Promise<SocialSnapshotPayload>;
    }> = [
      {
        key: "facebook",
        connected: socialConnected.facebook,
        include: includeAll || includeSet.has("facebook"),
        row: fbRow,
        ttlMinutes: 15,
        fetcher: async () => {
          const token = tryDecryptToken(String(fbRow["access_token_enc"] ?? "")) || "";
          const end = new Date();
          const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
          const metrics = await withTimeout("facebook metrics", 7000, () =>
            fbFetchDailyInsights(token, String(fbRow["resource_id"] || ""), start, end)
          );
          return { metrics };
        },
      },
      {
        key: "instagram",
        connected: socialConnected.instagram,
        include: includeAll || includeSet.has("instagram"),
        row: igRow,
        ttlMinutes: 15,
        fetcher: async () => {
          const token = tryDecryptToken(String(igRow["access_token_enc"] ?? "")) || "";
          const end = new Date();
          const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
          const metrics = await withTimeout("instagram metrics", 7000, () =>
            igFetchDailyInsights(token, String(igRow["resource_id"] || ""), start, end)
          );
          return { metrics };
        },
      },
      {
        key: "linkedin",
        connected: socialConnected.linkedin,
        include: includeAll || includeSet.has("linkedin"),
        row: liRow,
        ttlMinutes: 15,
        fetcher: async () => {
          const token = tryDecryptToken(String(liRow["access_token_enc"] ?? "")) || "";
          const meta = asRecord(liRow["meta"]);
          const orgUrn = String(meta["org_urn"] ?? "") || (await withTimeout("linkedin org resolve", 5000, () => liResolveFirstAdminOrgUrn(token)));
          const end = new Date();
          const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
          const metrics = orgUrn
            ? await withTimeout("linkedin metrics", 7000, () => liFetchOrgShareStats(token, orgUrn, start, end))
            : { totals: {}, raw: null, range: { since: start.toISOString(), until: end.toISOString() } };
          return { metrics };
        },
      },
      {
        key: "gmb",
        connected: socialConnected.gmb,
        include: includeAll || includeSet.has("gmb"),
        row: gmbRow,
        ttlMinutes: 20,
        fetcher: async () => {
          const tok = await withTimeout("gmb token", 7000, () => getGoogleTokenForAnyGoogle("gmb", "gmb"));
          const accessToken = tok?.accessToken || "";
          const end = new Date();
          const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
          const metrics = await withTimeout("gmb metrics", 9000, () =>
            gmbFetchDailyMetricsNormalized(accessToken, String(gmbRow["resource_id"] || ""), start, end)
          );
          return { metrics };
        },
      },
    ];

    const socialMetrics: Record<"facebook" | "instagram" | "linkedin" | "gmb", unknown | null> = {
      facebook: null,
      instagram: null,
      linkedin: null,
      gmb: null,
    };

    await Promise.all(
      socialSources.map(async (src) => {
        if (!src.include || !src.connected) {
          socialMetrics[src.key] = null;
          return;
        }

        const cached = snapshotMap.get(src.key) as SocialSnapshotPayload | undefined;
        if (cached) {
          socialMetrics[src.key] = cached.metrics;
          return;
        }

        try {
          const payload = await src.fetcher();
          socialMetrics[src.key] = payload.metrics;
          await writeSnapshot(supabase, userId, src.key, days, String(sourceKeys[src.key]), payload, src.ttlMinutes).catch(() => {});
        } catch (e) {
          socialMetrics[src.key] = { error: e instanceof Error ? e.message : String(e) };
        }
      })
    );

    const payload: OverviewPayload = {
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
      sources: {
        site_inrcy: { connected: siteSnapshots.site_inrcy.connected },
        site_web: { connected: siteSnapshots.site_web.connected },
        facebook: { connected: socialConnected.facebook, metrics: socialMetrics.facebook },
        instagram: { connected: socialConnected.instagram, metrics: socialMetrics.instagram },
        linkedin: { connected: socialConnected.linkedin, metrics: socialMetrics.linkedin },
        gmb: { connected: socialConnected.gmb, metrics: socialMetrics.gmb },
      },
      note: "Sources connectées: site iNrCy (GA4/GSC), site web (GA4/GSC), GMB, Facebook, Instagram, LinkedIn.",
    };

    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json(
      { error: (e instanceof Error ? e.message : String(e)) || "Unknown error" },
      { status: 500 }
    );
  }
}
