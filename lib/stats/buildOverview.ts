import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import type { StatsSourceKey } from "@/lib/googleStats";
import { encryptToken, tryDecryptToken } from "@/lib/oauthCrypto";
import { getChannelConnectionStates } from "@/lib/channelConnectionState";
import { hasActiveInrcySite } from "@/lib/inrcySite";
import { decodeBusinessSector } from "@/lib/activitySectors";
import { buildSnapshotWindow } from "@/lib/stats/snapshotWindow";
import { getLinkedInAccessToken } from "@/lib/linkedinOAuth";
import { refreshTiktokAccessToken } from "@/lib/tiktokOAuth";
import { fetchTiktokAnalyticsSnapshot } from "@/lib/tiktokAnalytics";

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function isLinkedInRateLimitMessage(message: unknown): boolean {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("throttle") ||
    text.includes("rate limit") ||
    text.includes("resource level") ||
    text.includes("application day limit") ||
    text.includes("utilisation maximale") ||
    text.includes("étranglé") ||
    text.includes("etrangle")
  );
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
  tiktok: { connected: boolean; metrics: unknown | null };
  youtube_shorts: { connected: boolean; metrics: unknown | null };
};

type LiveSourcesSnapshot = {
  site_inrcy: { connected: SiteConn };
  site_web: { connected: SiteConn };
  gmb: { connected: boolean; metrics: unknown | null };
  facebook: { connected: boolean; metrics: unknown | null };
  instagram: { connected: boolean; metrics: unknown | null };
  linkedin: { connected: boolean; metrics: unknown | null };
  tiktok: { connected: boolean; metrics: unknown | null };
  youtube_shorts: { connected: boolean; metrics: unknown | null };
};

type OverviewCubeKey =
  | "site_inrcy"
  | "site_web"
  | "gmb"
  | "facebook"
  | "instagram"
  | "linkedin"
  | "tiktok"
  | "youtube_shorts";

function isStatsActiveConnection(state: {
  connected: boolean;
  requiresUpdate?: boolean;
}) {
  return Boolean(state.connected && !state.requiresUpdate);
}

function mergeCachedSourcesWithLiveState(
  existingSources: unknown,
  liveSources: LiveSourcesSnapshot,
) {
  const existing = asRecord(existingSources);
  const out: Record<string, unknown> = { ...existing };
  for (const [key, liveNodeUnknown] of Object.entries(liveSources)) {
    const liveNode = asRecord(liveNodeUnknown);
    const prevNode = asRecord(existing[key]);
    const nextNode: Record<string, unknown> = { ...prevNode, ...liveNode };
    const liveConnected = liveNode["connected"];

    // Si le canal n'est plus actif pour iNrStats (déconnecté ou à actualiser),
    // on supprime aussi les anciennes métriques du cache pour éviter un calcul live/stale.
    if (liveConnected === false) {
      nextNode["metrics"] = null;
    } else if (
      prevNode["metrics"] !== undefined &&
      (liveNode["metrics"] === undefined ||
        (liveNode["metrics"] === null && prevNode["metrics"] !== null))
    ) {
      nextNode["metrics"] = prevNode["metrics"];
    }

    out[key] = nextNode;
  }
  return out;
}

function normalizeIdentityValue(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\/+$/g, "")
    .toLowerCase();
}

function resolveRequestedCube(
  includeRaw: string,
  includeAll: boolean,
): OverviewCubeKey | null {
  if (includeAll) return null;
  const normalized = String(includeRaw || "").trim();
  if (!normalized) return null;
  if (normalized === "facebook") return "facebook";
  if (normalized === "instagram") return "instagram";
  if (normalized === "linkedin") return "linkedin";
  if (normalized === "tiktok") return "tiktok";
  if (normalized === "youtube_shorts") return "youtube_shorts";
  if (normalized === "gmb") return "gmb";
  if (normalized.includes("site_inrcy")) return "site_inrcy";
  if (normalized.includes("site_web")) return "site_web";
  return null;
}

function isCubeConnectedInPayload(
  payload: Record<string, unknown>,
  cube: OverviewCubeKey,
) {
  const sources = asRecord(payload["sources"]);
  if (cube === "site_inrcy" || cube === "site_web") {
    const connected = asRecord(asRecord(sources[cube])["connected"]);
    return Boolean(connected["ga4"] || connected["gsc"]);
  }
  return Boolean(asRecord(sources[cube])["connected"]);
}

const LINKEDIN_DETAIL_SIGNAL_KEYS = [
  "messages",
  "conversations",
  "impressions",
  "impressionCount",
  "uniqueImpressionsCount",
  "viewerImpressions",
  "engagements",
  "likes",
  "likeCount",
  "comments",
  "commentCount",
  "shares",
  "shareCount",
  "clicks",
  "clickCount",
  "linkClickCount",
  "premiumCtaClickCount",
  "pageClicks",
  "profileViews",
  "profileViewFromContentCount",
  "pageViews",
  "postsPublished",
  "postSaveCount",
  "postSendCount",
] as const;

const LINKEDIN_AUDIENCE_ONLY_KEYS = [
  "followers",
  "followerCount",
  "memberFollowersCount",
  "newFollowers",
  "followerGainedFromContentCount",
  "organicFollowerCount",
  "paidFollowerCount",
] as const;

function metricNum(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function linkedInMetricValue(metricsRec: Record<string, unknown>, key: string) {
  const totals = asRecord(metricsRec["totals"]);
  return metricNum(totals[key]) + metricNum(metricsRec[key]);
}

function collectLinkedInMetricErrors(value: unknown, out: string[] = []): string[] {
  if (!value) return out;
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (entry && typeof entry === "object") collectLinkedInMetricErrors(entry, out);
      else if (String(entry || "").trim()) out.push(String(entry));
    }
    return out;
  }
  if (typeof value !== "object") return out;
  const rec = value as Record<string, unknown>;
  if (String(rec["error"] || "").trim()) out.push(String(rec["error"]));
  if (Array.isArray(rec["errors"])) collectLinkedInMetricErrors(rec["errors"], out);
  for (const [key, entry] of Object.entries(rec)) {
    if (key === "error" || key === "errors") continue;
    collectLinkedInMetricErrors(entry, out);
  }
  return out;
}

function hasLinkedInMetricErrors(metrics: unknown) {
  const metricsRec = asRecord(metrics);
  return collectLinkedInMetricErrors(metricsRec).length > 0;
}

function getLinkedInRateLimitErrorFromMetrics(metrics: unknown) {
  return collectLinkedInMetricErrors(metrics).find((message) =>
    isLinkedInRateLimitMessage(message),
  );
}

function hasDetailedLinkedInMetrics(metrics: unknown) {
  const metricsRec = asRecord(metrics);
  if (!Object.keys(metricsRec).length) return false;
  if (String(metricsRec["error"] || "").trim()) return false;
  return LINKEDIN_DETAIL_SIGNAL_KEYS.some((key) => linkedInMetricValue(metricsRec, key) > 0);
}

function hasAudienceOnlyLinkedInMetrics(metrics: unknown) {
  const metricsRec = asRecord(metrics);
  if (!Object.keys(metricsRec).length) return false;
  if (String(metricsRec["error"] || "").trim()) return false;
  return LINKEDIN_AUDIENCE_ONLY_KEYS.some((key) => linkedInMetricValue(metricsRec, key) > 0);
}

function hasUsableLinkedInMetrics(metrics: unknown) {
  // Vrais signaux détaillés : exploitables pour les demandes captées.
  return hasDetailedLinkedInMetrics(metrics);
}

function hasLinkedInOpportunityMetrics(metrics: unknown) {
  // Followers / audience seuls : insuffisants pour les demandes captées,
  // mais suffisants pour conserver le potentiel détecté.
  return hasDetailedLinkedInMetrics(metrics) || hasAudienceOnlyLinkedInMetrics(metrics);
}

function shouldCacheLinkedInMetrics(metrics: unknown) {
  const metricsRec = asRecord(metrics);
  // Cache dédié LinkedIn : même une réponse valide à zéro/partielle doit être
  // conservée, sinon chaque ouverture consomme le quota. On refuse uniquement
  // les payloads vides et les réponses liées à un quota atteint.
  return (
    Object.keys(metricsRec).length > 0 &&
    !getLinkedInRateLimitErrorFromMetrics(metricsRec)
  );
}


type InrcyWindowCount = {
  week: number;
  month: number;
  total: number;
};

type InrcyChannelActivityStats = {
  publications: InrcyWindowCount;
  photoPosts: InrcyWindowCount;
  photos: InrcyWindowCount;
  videos: InrcyWindowCount;
  latestAt: string | null;
};

type InrcyActivityStatsByChannel = Partial<Record<OverviewCubeKey, InrcyChannelActivityStats>>;

type TiktokLocalPublicationStats = {
  posts: number;
  videoPosts: number;
  photoPosts: number;
  photos: number;
  latestAt: string | null;
};

const INRCY_PUBLISHABLE_CHANNELS: OverviewCubeKey[] = [
  "site_inrcy",
  "site_web",
  "gmb",
  "facebook",
  "instagram",
  "linkedin",
  "tiktok",
  "youtube_shorts",
];

function emptyWindowCount(): InrcyWindowCount {
  return { week: 0, month: 0, total: 0 };
}

function emptyInrcyChannelActivityStats(): InrcyChannelActivityStats {
  return {
    publications: emptyWindowCount(),
    photoPosts: emptyWindowCount(),
    photos: emptyWindowCount(),
    videos: emptyWindowCount(),
    latestAt: null,
  };
}

function emptyInrcyActivityStatsByChannel(): InrcyActivityStatsByChannel {
  return Object.fromEntries(
    INRCY_PUBLISHABLE_CHANNELS.map((channel) => [channel, emptyInrcyChannelActivityStats()]),
  ) as InrcyActivityStatsByChannel;
}


function normalizePayloadChannels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry || "").trim().toLowerCase())
    .filter(Boolean);
}

function payloadSucceededForChannel(payload: Record<string, unknown>, channel: OverviewCubeKey) {
  const summary = asRecord(payload["summary"]);
  const successChannels = normalizePayloadChannels(summary["successChannels"]);
  if (successChannels.includes(channel)) return true;

  const results = asRecord(payload["results"]);
  const channelResult = asRecord(results[channel]);
  if (Object.keys(channelResult).length) return channelResult["ok"] !== false;

  const channels = normalizePayloadChannels(payload["channels"]);
  return channels.includes(channel);
}

function inferPayloadMediaKindForChannel(
  payload: Record<string, unknown>,
  channel: OverviewCubeKey,
): "video" | "photos" | "none" | "unknown" {
  const results = asRecord(payload["results"]);
  const channelResult = asRecord(results[channel]);
  const diagnostics = asRecord(channelResult["diagnostics"]);
  const modeByChannel = asRecord(payload["mediaModeByChannel"]);
  const postByChannel = asRecord(payload["postByChannel"]);
  const channelPost = asRecord(postByChannel[channel]);
  const candidates = [
    channelResult["tiktok_media_type"],
    channelResult["media_type"],
    channelResult["mediaType"],
    diagnostics["mediaType"],
    modeByChannel[channel],
    channelPost["mediaMode"],
    payload["mediaType"],
  ];

  for (const candidate of candidates) {
    const value = String(candidate || "").trim().toLowerCase();
    if (!value) continue;
    if (value === "none") return "none";
    if (value.includes("video")) return "video";
    if (value.includes("photo") || value.includes("image") || value.includes("images")) return "photos";
  }

  return "unknown";
}

function inferPhotoCountForChannel(payload: Record<string, unknown>, channel: OverviewCubeKey) {
  const results = asRecord(payload["results"]);
  const channelResult = asRecord(results[channel]);
  const diagnostics = asRecord(channelResult["diagnostics"]);
  const postByChannel = asRecord(payload["postByChannel"]);
  const channelPost = asRecord(postByChannel[channel]);

  const explicitCount = Number(
    channelResult["media_count"] ??
      channelResult["mediaCount"] ??
      channelResult["photo_count"] ??
      channelResult["photoCount"],
  );
  if (Number.isFinite(explicitCount) && explicitCount > 0) return Math.round(explicitCount);

  const diagnosticUrls = diagnostics["mediaUrls"];
  if (Array.isArray(diagnosticUrls) && diagnosticUrls.length > 0) return diagnosticUrls.length;

  const channelCandidates = [
    channelPost["images"],
    channelPost["attachments"],
    channelPost["publishableUrls"],
    channelPost["instagramPublishableUrls"],
    channelPost["socialFeedPublishableUrls"],
    channelPost["siteCardPublishableUrls"],
    channelPost["gmbPublishableUrls"],
  ];
  for (const candidate of channelCandidates) {
    if (Array.isArray(candidate) && candidate.length > 0) return candidate.length;
  }

  const payloadCandidates = [
    payload["images"],
    payload["publishableUrls"],
    payload["instagramPublishableUrls"],
    payload["socialFeedPublishableUrls"],
    payload["siteCardPublishableUrls"],
    payload["gmbPublishableUrls"],
  ];
  for (const candidate of payloadCandidates) {
    if (Array.isArray(candidate) && candidate.length > 0) return candidate.length;
  }

  return 1;
}

function incrementWindowCount(
  counter: InrcyWindowCount,
  createdAtMs: number,
  nowMs: number,
  amount = 1,
) {
  const deltaMs = Number.isFinite(createdAtMs) ? nowMs - createdAtMs : Number.POSITIVE_INFINITY;
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const monthMs = 30 * 24 * 60 * 60 * 1000;
  counter.total += amount;
  if (deltaMs >= 0 && deltaMs <= weekMs) counter.week += amount;
  if (deltaMs >= 0 && deltaMs <= monthMs) counter.month += amount;
}

function mergeTiktokLocalPublicationStats(
  metrics: unknown,
  local: TiktokLocalPublicationStats,
) {
  const current = asRecord(metrics);
  const totals = asRecord(current["totals"]);
  const raw = asRecord(current["raw"]);

  return {
    ...current,
    totals: {
      ...totals,
      inrcy_posts: local.posts,
      inrcy_video_posts: local.videoPosts,
      inrcy_photo_posts: local.photoPosts,
      inrcy_photos: local.photos,
      postsPublishedLocal: local.posts,
    },
    raw: {
      ...raw,
      inrcyLocalPublications: {
        posts: local.posts,
        videoPosts: local.videoPosts,
        photoPosts: local.photoPosts,
        photos: local.photos,
        latestAt: local.latestAt,
      },
    },
  };
}

function cubeHasUsableData(
  payload: Record<string, unknown>,
  cube: OverviewCubeKey,
) {
  if (!isCubeConnectedInPayload(payload, cube)) return false;
  if (cube === "site_inrcy" || cube === "site_web") {
    const totals = asRecord(payload["totals"]);
    const topPages = Array.isArray(payload["topPages"])
      ? payload["topPages"]
      : [];
    const topQueries = Array.isArray(payload["topQueries"])
      ? payload["topQueries"]
      : [];
    const channels = Array.isArray(payload["channels"])
      ? payload["channels"]
      : [];
    return Boolean(
      Number(totals["sessions"] || 0) > 0 ||
      Number(totals["pageviews"] || 0) > 0 ||
      Number(totals["clicks"] || 0) > 0 ||
      Number(totals["impressions"] || 0) > 0 ||
      topPages.length > 0 ||
      topQueries.length > 0 ||
      channels.length > 0,
    );
  }
  const metrics = asRecord(asRecord(payload["sources"])[cube])["metrics"];
  if (metrics === null || metrics === undefined) return false;
  const metricsRec = asRecord(metrics);
  if (cube === "linkedin") {
    // LinkedIn peut être partiellement indisponible côté stats détaillées,
    // mais un cache avec audience/followers reste exploitable pour le potentiel.
    return hasUsableLinkedInMetrics(metricsRec) || hasLinkedInOpportunityMetrics(metricsRec);
  }
  return !String(metricsRec["error"] || "").trim();
}

function cubeNeedsPreservation(
  payload: Record<string, unknown>,
  cube: OverviewCubeKey,
) {
  if (!isCubeConnectedInPayload(payload, cube)) return false;
  return !cubeHasUsableData(payload, cube);
}

function identitiesCompatible(
  currentPayload: Record<string, unknown>,
  candidatePayload: Record<string, unknown>,
  cube: OverviewCubeKey,
) {
  const currentIdentity = asRecord(
    asRecord(currentPayload["identities"])[cube],
  );
  const candidateIdentity = asRecord(
    asRecord(candidatePayload["identities"])[cube],
  );
  const currentLabel = normalizeIdentityValue(currentIdentity["label"]);
  const candidateLabel = normalizeIdentityValue(candidateIdentity["label"]);
  const currentUrl = normalizeIdentityValue(currentIdentity["url"]);
  const candidateUrl = normalizeIdentityValue(candidateIdentity["url"]);
  if (currentLabel && candidateLabel && currentLabel !== candidateLabel)
    return false;
  if (currentUrl && candidateUrl && currentUrl !== candidateUrl) return false;
  return true;
}

function mergePreservedSources(
  candidateSources: unknown,
  currentSources: unknown,
) {
  const candidate = asRecord(candidateSources);
  const current = asRecord(currentSources);
  const out: Record<string, unknown> = { ...candidate };
  for (const key of new Set([
    ...Object.keys(candidate),
    ...Object.keys(current),
  ])) {
    const prevNode = asRecord(candidate[key]);
    const currNode = asRecord(current[key]);
    const nextNode: Record<string, unknown> = { ...prevNode, ...currNode };
    const currMetrics = currNode["metrics"];
    const currMetricsError = String(
      asRecord(currMetrics)["error"] || "",
    ).trim();
    const shouldPreserveLinkedInMetrics =
      key === "linkedin" &&
      prevNode["metrics"] !== undefined &&
      !hasLinkedInOpportunityMetrics(currMetrics);

    if (
      ((currMetrics === null || currMetrics === undefined || currMetricsError) &&
        prevNode["metrics"] !== undefined) ||
      shouldPreserveLinkedInMetrics
    ) {
      nextNode["metrics"] = prevNode["metrics"];
    }
    out[key] = nextNode;
  }
  return out;
}

async function loadPreviousOverviewCandidate(args: {
  supabase: SupabaseClient;
  userId: string;
  days: number;
  includeRaw: string;
  cube: OverviewCubeKey;
  currentPayload: Record<string, unknown>;
}) {
  const { supabase, userId, days, includeRaw, cube, currentPayload } = args;
  const primaryPrefix = `days=${days}|include=${includeRaw || "all"}|`;
  const prefixes = Array.from(new Set([
    primaryPrefix,
    `days=${days}|include=all|`,
  ]));

  for (const prefix of prefixes) {
    try {
      const { data: rows = [] } = await supabase
        .from("stats_cache")
        .select("payload, expires_at")
        .eq("user_id", userId)
        .eq("source", "overview")
        .like("range_key", `${prefix}%`)
        .order("expires_at", { ascending: false })
        .limit(12);

      for (const row of Array.isArray(rows) ? rows : []) {
        const candidate = asRecord(asRecord(row)["payload"]);
        if (!candidate || Object.keys(candidate).length === 0) continue;
        if (!identitiesCompatible(currentPayload, candidate, cube)) continue;
        if (!cubeHasUsableData(candidate, cube)) continue;
        return candidate;
      }
    } catch {}
  }

  for (const prefix of prefixes) {
    try {
      const { data: rows = [] } = await supabase
        .from("cache_statistiques")
        .select("charge_utile, cree_a")
        .eq("id_utilisateur", userId)
        .eq("source", "apercu")
        .like("plage_cle", `${prefix}%`)
        .order("cree_a", { ascending: false })
        .limit(12);

      for (const row of Array.isArray(rows) ? rows : []) {
        const candidate = asRecord(asRecord(row)["charge_utile"]);
        if (!candidate || Object.keys(candidate).length === 0) continue;
        if (!identitiesCompatible(currentPayload, candidate, cube)) continue;
        if (!cubeHasUsableData(candidate, cube)) continue;
        return candidate;
      }
    } catch {}
  }

  return null;
}

async function stabilizeOverviewPayload(args: {
  supabase: SupabaseClient;
  userId: string;
  days: number;
  includeRaw: string;
  includeAll: boolean;
  payload: Record<string, unknown>;
}) {
  const { supabase, userId, days, includeRaw, includeAll, payload } = args;
  const cube = resolveRequestedCube(includeRaw, includeAll);
  if (!cube) return payload;
  if (!cubeNeedsPreservation(payload, cube)) return payload;

  const candidate = await loadPreviousOverviewCandidate({
    supabase,
    userId,
    days,
    includeRaw,
    cube,
    currentPayload: payload,
  });
  if (!candidate) return payload;

  const currentMeta = asRecord(payload["meta"]);
  const candidateMeta = asRecord(candidate["meta"]);

  return {
    ...candidate,
    days: payload["days"] ?? candidate["days"],
    selected: payload["selected"] ?? candidate["selected"],
    inrcySiteOwnership:
      payload["inrcySiteOwnership"] ?? candidate["inrcySiteOwnership"],
    identities: {
      ...asRecord(candidate["identities"]),
      ...asRecord(payload["identities"]),
    },
    sources: mergePreservedSources(candidate["sources"], payload["sources"]),
    inrcyActivity: {
      ...asRecord(candidate["inrcyActivity"]),
      ...asRecord(payload["inrcyActivity"]),
    },
    business: {
      ...asRecord(candidate["business"]),
      ...asRecord(payload["business"]),
    },
    meta: {
      ...candidateMeta,
      ...currentMeta,
      generatedAt: currentMeta["generatedAt"] ?? new Date().toISOString(),
      snapshotDate:
        currentMeta["snapshotDate"] ?? candidateMeta["snapshotDate"] ?? null,
      preservedCube: cube,
      preservedFromGeneratedAt: candidateMeta["generatedAt"] ?? null,
      preservedFromSnapshotDate: candidateMeta["snapshotDate"] ?? null,
      preservedReason: "technical_refresh_failure",
    },
  };
}

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

export type OverviewPayload = {
  days: number;
  selected: string[] | null;
  inrcySiteOwnership: string;
  identities: Record<string, { label: string | null; url: string | null }>;
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
  topQueries: Array<{
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
  business: { sectorCategory: string | null; profession: string | null };
  sources: SourcesStatus;
  inrcyActivity: InrcyActivityStatsByChannel;
  note: string;
  meta: {
    generatedAt: string;
    snapshotDate: string | null;
    live: boolean;
  };
};

export async function buildStatsOverview(args: {
  supabase: SupabaseClient;
  userId: string;
  days: number;
  includeRaw?: string;
  fresh?: boolean;
  snapshotDate?: string | null;
}): Promise<OverviewPayload> {
  const { supabase, userId, fresh = false } = args;
  const days = Math.min(Math.max(Number(args.days || 28), 7), 90);
  const includeRaw = (args.includeRaw || "").trim();
  const includeSet = new Set(
    includeRaw
      ? includeRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
  );
  const includeAll = includeSet.size === 0;

  const dateWindow = buildSnapshotWindow({
    days,
    fresh,
    snapshotDate: args.snapshotDate,
  });
  async function loadInrcyPublishedActivityStats(): Promise<InrcyActivityStatsByChannel> {
    const statsByChannel = emptyInrcyActivityStatsByChannel();
    const nowMs = Date.now();

    try {
      const { data, error } = await supabase
        .from("app_events")
        .select("payload,created_at,module,type")
        .eq("user_id", userId)
        .in("module", ["booster", "propulser", "fideliser"])
        .in("type", ["publish", "valorize"])
        .order("created_at", { ascending: false })
        .limit(5000);

      if (error || !Array.isArray(data)) return statsByChannel;

      for (const row of data) {
        const payload = asRecord(asRecord(row)["payload"]);
        const createdAt = String(asRecord(row)["created_at"] || "").trim();
        const createdAtMs = createdAt ? new Date(createdAt).getTime() : NaN;

        for (const channel of INRCY_PUBLISHABLE_CHANNELS) {
          if (!payloadSucceededForChannel(payload, channel)) continue;
          const stats = statsByChannel[channel] || emptyInrcyChannelActivityStats();
          statsByChannel[channel] = stats;

          incrementWindowCount(stats.publications, createdAtMs, nowMs);
          if (createdAt && (!stats.latestAt || createdAt > stats.latestAt)) stats.latestAt = createdAt;

          const kind = inferPayloadMediaKindForChannel(payload, channel);
          if (kind === "video") {
            incrementWindowCount(stats.videos, createdAtMs, nowMs);
          } else if (kind === "photos") {
            incrementWindowCount(stats.photoPosts, createdAtMs, nowMs);
            incrementWindowCount(stats.photos, createdAtMs, nowMs, inferPhotoCountForChannel(payload, channel));
          }
        }
      }

      return statsByChannel;
    } catch {
      return statsByChannel;
    }
  }

  const inrcyPublishedActivityStats = await loadInrcyPublishedActivityStats();
  const tiktokActivity = inrcyPublishedActivityStats.tiktok;
  const tiktokLocalPublicationStats: TiktokLocalPublicationStats = {
    posts: tiktokActivity?.publications.month || 0,
    videoPosts: tiktokActivity?.videos.month || 0,
    photoPosts: tiktokActivity?.photoPosts.month || 0,
    photos: tiktokActivity?.photos.month || 0,
    latestAt: tiktokActivity?.latestAt || null,
  };

  // Lazy-import server helpers inside the request scope to avoid Next.js request-scope errors.
  const {
    getGoogleTokenFor,
    runGa4Report,
    runGa4TopPages,
    runGa4Channels,
    runGscQuery,
    getGoogleTokenForAnyGoogle,
  } = await import("@/lib/googleStats");
  const { gmbFetchDailyMetricsNormalizedWithRecovery } =
    await import("@/lib/googleBusiness");
  const { igFetchDailyInsights } = await import("@/lib/metaInsights");
  const { fbFetchDailyInsights } = await import("@/lib/facebookInsights");
  const { extractFacebookUserTokens } =
    await import("@/lib/metaBusinessAssets");
  const {
    liAggregateAnalytics,
    liFetchCombinedAnalytics,
    liFetchMemberAnalytics,
    liFetchOrgAnalytics,
    liResolveFirstAdminOrgUrn,
    isLinkedInRateLimitMessage,
    getLinkedInNextUtcResetIso,
  } = await import("@/lib/linkedinAnalytics");

  // --- Load all integration rows once (avoid Supabase rate-limits) ---
  // iNrStats calls this endpoint several times; repeated per-provider selects can hit Supabase mw:read limits.
  // We fetch the minimal integration snapshot once and reuse it for connection flags + metrics.
  const { data: integrationsAll = [] } = await supabase
    .from("integrations")
    .select(
      "provider,source,product,status,resource_id,resource_label,display_name,access_token_enc,refresh_token_enc,scopes,expires_at,meta,updated_at,created_at",
    )
    .eq("user_id", userId);

  // Legacy table (older installs) used by some utilities (keep best-effort).
  const { data: integrationsLegacyAll = [] } = await supabase
    .from("integrations_statistiques")
    .select("provider,source,product,status,resource_id,updated_at,created_at")
    .eq("user_id", userId);

  function latestIntegrationAny(
    provider: string,
    source: string,
    product: string,
  ) {
    const allRows = Array.isArray(integrationsAll) ? integrationsAll : [];
    const exactRows = allRows.filter((row) => {
      const record = asRecord(row);
      return (
        String(record["provider"] ?? "") === provider &&
        String(record["source"] ?? "") === source &&
        String(record["product"] ?? "") === product
      );
    });

    // Sécurité prod : si une ancienne migration a sauvé source/product différemment,
    // on retombe sur provider seul au lieu de déclarer le canal déconnecté.
    const rows = exactRows.length
      ? exactRows
      : allRows.filter(
          (row) => String(asRecord(row)["provider"] ?? "") === provider,
        );

    rows.sort((left, right) => {
      const leftRecord = asRecord(left);
      const rightRecord = asRecord(right);
      const leftScore =
        (String(leftRecord["status"] || "") === "connected" ? 100 : 0) +
        (leftRecord["resource_id"] ? 10 : 0) +
        (leftRecord["access_token_enc"] ? 1 : 0);
      const rightScore =
        (String(rightRecord["status"] || "") === "connected" ? 100 : 0) +
        (rightRecord["resource_id"] ? 10 : 0) +
        (rightRecord["access_token_enc"] ? 1 : 0);
      if (rightScore !== leftScore) return rightScore - leftScore;
      const leftTime = new Date(
        String(leftRecord["updated_at"] ?? leftRecord["created_at"] ?? 0),
      ).getTime();
      const rightTime = new Date(
        String(rightRecord["updated_at"] ?? rightRecord["created_at"] ?? 0),
      ).getTime();
      return rightTime - leftTime;
    });
    return asRecord(rows[0]);
  }

  function bestIntegrationAny(
    provider: string,
    source: string,
    product: string,
    hasToken: (row: Record<string, unknown>) => boolean,
  ) {
    const allRows = Array.isArray(integrationsAll) ? integrationsAll : [];
    const exactRows = allRows.filter((row) => {
      const record = asRecord(row);
      return (
        String(record["provider"] ?? "") === provider &&
        String(record["source"] ?? "") === source &&
        String(record["product"] ?? "") === product
      );
    });
    const fallbackRows = allRows.filter(
      (row) => String(asRecord(row)["provider"] ?? "") === provider,
    );
    const rows = (exactRows.length ? exactRows : fallbackRows).map((row) =>
      asRecord(row),
    );

    rows.sort((left, right) => {
      const leftActive = hasActiveStoredIntegration(left, hasToken(left));
      const rightActive = hasActiveStoredIntegration(right, hasToken(right));
      if (leftActive !== rightActive) return rightActive ? 1 : -1;
      const leftScore =
        (String(left["status"] || "") === "connected" ? 100 : 0) +
        (left["resource_id"] ? 10 : 0) +
        (hasToken(left) ? 1 : 0);
      const rightScore =
        (String(right["status"] || "") === "connected" ? 100 : 0) +
        (right["resource_id"] ? 10 : 0) +
        (hasToken(right) ? 1 : 0);
      if (rightScore !== leftScore) return rightScore - leftScore;
      const leftTime = new Date(
        String(left["updated_at"] ?? left["created_at"] ?? 0),
      ).getTime();
      const rightTime = new Date(
        String(right["updated_at"] ?? right["created_at"] ?? 0),
      ).getTime();
      return rightTime - leftTime;
    });

    return asRecord(rows[0]);
  }

  function hasFacebookStoredToken(row: Record<string, unknown>) {
    const meta = asRecord(row["meta"]);
    return Boolean(
      row["access_token_enc"] ||
      meta["user_access_token_enc"] ||
      meta["standard_user_access_token_enc"] ||
      meta["business_user_access_token_enc"],
    );
  }

  function hasActiveStoredIntegration(
    row: Record<string, unknown>,
    hasToken: boolean,
  ) {
    return Boolean(
      String(row["status"] || "") === "connected" &&
      row["resource_id"] &&
      hasToken &&
      !isExpired(row["expires_at"]),
    );
  }

  async function safeGetGoogleTokenFor(
    source: StatsSourceKey,
    product: "ga4" | "gsc",
  ) {
    try {
      return await getGoogleTokenFor(source, product, { supabase, userId });
    } catch {
      return null;
    }
  }

  // Ownership du site iNrCy : utile pour l'UI (rented => connexion globale "Suivi")
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("inrcy_site_ownership")
    .eq("user_id", userId)
    .maybeSingle();

  const inrcySiteOwnership = String(
    asRecord(profileRow)["inrcy_site_ownership"] ?? "none",
  );
  const hasInrcySite = hasActiveInrcySite(inrcySiteOwnership);

  // Load settings from the new schema:
  // - site_inrcy -> inrcy_site_configs.settings
  // - site_web -> pro_tools_configs.settings.site_web
  const [inrcyCfgRes, proCfgRes, businessProfileRes] = await Promise.all([
    supabase
      .from("inrcy_site_configs")
      .select("site_url,settings")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("pro_tools_configs")
      .select("settings")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("business_profiles")
      .select("sector")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  // NOTE: SiteSettings has only optional fields, so an empty object is a valid fallback.
  // Using `null` breaks TS in production builds (null not assignable to SiteSettings).
  const inrcySettings = safeJsonParse<SiteSettings>(
    asRecord(inrcyCfgRes.data)["settings"],
    {},
  );
  const proSettings = safeJsonParse<Record<string, unknown>>(
    asRecord(proCfgRes.data)["settings"],
    {},
  );

  const rawBusinessSector = String(
    asRecord(businessProfileRes.data)["sector"] ?? "",
  ).trim();
  const decodedBusinessSector = decodeBusinessSector(rawBusinessSector);

  // Flag: en mode rented, on peut couper uniquement la couche iNrCy (sans débrancher GA4/GSC)
  const inrcyTrackingEnabled = Boolean(
    asRecord(inrcySettings)["inrcy_tracking_enabled"] ?? true,
  );

  // --- Social connection snapshot (always computed live) ---
  // IMPORTANT: iNrStats calls the same overview endpoint with different `include=` values.
  // If we return a cached payload generated by an older version (or without social keys),
  // the UI can incorrectly show "Déconnecté" even when integrations are connected.
  // So we always (re)hydrate social connection flags from `integrations` before returning.
  // IMPORTANT:
  // Use the same direct DB resolution path as /api/integrations/channel-states.
  // The preloaded snapshot used here could diverge from the live dashboard state and
  // make iNrStats show only one site as connected when both bubbles were green.
  const channelStatesPromise = getChannelConnectionStates(supabase, userId);

  async function fetchLiveSourcesStatus() {
    const states = await channelStatesPromise;
    const fbRow = bestIntegrationAny(
      "facebook",
      "facebook",
      "facebook",
      hasFacebookStoredToken,
    );
    const igRow = bestIntegrationAny(
      "instagram",
      "instagram",
      "instagram",
      (row) => Boolean(row["access_token_enc"]),
    );

    // Meta stats must trust the DB integration row first. In production we observed
    // channelStates returning requiresUpdate/false while Supabase had a valid
    // connected row + encrypted token, which made Instagram appear disconnected
    // and forced fallback opportunities.
    const facebookConnected = hasActiveStoredIntegration(
      fbRow,
      hasFacebookStoredToken(fbRow),
    );
    const instagramConnected = hasActiveStoredIntegration(
      igRow,
      Boolean(igRow["access_token_enc"]),
    );

    console.info("[META_CONNECTION_OVERVIEW]", {
      facebookConnected,
      instagramConnected,
      fbHasResource: Boolean(fbRow["resource_id"]),
      igHasResource: Boolean(igRow["resource_id"]),
      fbHasToken: hasFacebookStoredToken(fbRow),
      igHasToken: Boolean(igRow["access_token_enc"]),
      fbStatus: String(fbRow["status"] || ""),
      igStatus: String(igRow["status"] || ""),
    });

    return {
      site_inrcy: {
        connected: { ga4: states.site_inrcy.ga4, gsc: states.site_inrcy.gsc },
      },
      site_web: {
        connected: { ga4: states.site_web.ga4, gsc: states.site_web.gsc },
      },
      gmb: { connected: isStatsActiveConnection(states.gmb), metrics: null },
      facebook: { connected: facebookConnected, metrics: null },
      instagram: { connected: instagramConnected, metrics: null },
      linkedin: {
        connected: isStatsActiveConnection(states.linkedin),
        metrics: null,
      },
      tiktok: {
        connected: isStatsActiveConnection(states.tiktok),
        metrics: null,
      },
      youtube_shorts: {
        connected: isStatsActiveConnection(states.youtube_shorts),
        metrics: null,
      },
    } satisfies LiveSourcesSnapshot;
  }

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
      const rows = Array.isArray(integrationsAll)
        ? (integrationsAll as unknown[])
        : [];
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
        keyParts.push(
          `${provider}:${source}:${product}:${status}:${resource}:${updated}`,
        );
      }
    } catch {}

    // 2) legacy snapshot (integrations_statistiques)
    try {
      const rows = Array.isArray(integrationsLegacyAll)
        ? (integrationsLegacyAll as unknown[])
        : [];
      for (const r of rows) {
        const rr = asRecord(r);
        const provider = String(rr["provider"] ?? "");
        const source = String(rr["source"] ?? "");
        const product = String(rr["product"] ?? "");
        const status = String(rr["status"] ?? "");
        const resource = String(rr["resource_id"] ?? "");
        const updated = String(rr["updated_at"] ?? rr["created_at"] ?? "");
        if (!provider || !source || !product) continue;
        keyParts.push(
          `legacy:${provider}:${source}:${product}:${status}:${resource}:${updated}`,
        );
      }
    } catch {}

    // 3) persisted site settings must also invalidate the cache, otherwise
    // iNrStats can keep an old disconnected snapshot even after the bubble saved
    // GA4/GSC ids successfully.
    try {
      const inrcyGa4Cfg = asRecord(asRecord(inrcySettings)["ga4"]);
      const inrcyGscCfg = asRecord(asRecord(inrcySettings)["gsc"]);
      const proSiteWebCfg = asRecord(asRecord(proSettings)["site_web"]);
      const webGa4Cfg = asRecord(proSiteWebCfg["ga4"]);
      const webGscCfg = asRecord(proSiteWebCfg["gsc"]);
      keyParts.push(`profile:ownership=${inrcySiteOwnership}`);
      keyParts.push(
        `inrcy:site_url=${String(asRecord(inrcyCfgRes.data)["site_url"] ?? "")}`,
      );
      keyParts.push(
        `inrcy:ga4:${String(inrcyGa4Cfg["property_id"] ?? "")}:${String(inrcyGa4Cfg["measurement_id"] ?? "")}`,
      );
      keyParts.push(`inrcy:gsc:${String(inrcyGscCfg["property"] ?? "")}`);
      keyParts.push(
        `site_web:ga4:${String(webGa4Cfg["property_id"] ?? "")}:${String(webGa4Cfg["measurement_id"] ?? "")}`,
      );
      keyParts.push(`site_web:gsc:${String(webGscCfg["property"] ?? "")}`);
    } catch {}

    // Tracking toggle impacts GA4/GSC visibility (avoid serving stale cached payload)
    keyParts.push(`inrcyTrackingEnabled:${inrcyTrackingEnabled ? "1" : "0"}`);
    keyParts.push(
      `business:sector=${decodedBusinessSector.sectorCategory}:profession=${decodedBusinessSector.profession}`,
    );
    keyParts.push("statsVersion:inrcyPublishedActivityV1");
    keyParts.push(
      `inrcyActivity:${INRCY_PUBLISHABLE_CHANNELS.map((channel) => {
        const stats = inrcyPublishedActivityStats[channel];
        return [
          channel,
          stats?.publications.week || 0,
          stats?.publications.month || 0,
          stats?.publications.total || 0,
          stats?.photoPosts.week || 0,
          stats?.photoPosts.month || 0,
          stats?.photoPosts.total || 0,
          stats?.photos.week || 0,
          stats?.photos.month || 0,
          stats?.photos.total || 0,
          stats?.videos.week || 0,
          stats?.videos.month || 0,
          stats?.videos.total || 0,
          stats?.latestAt || "none",
        ].join(":");
      }).join("|")}`,
    );

    return keyParts.join("|") || "none";
  }

  const connectionsKey = await buildConnectionsKey();
  const rangeKey = `days=${days}|include=${includeRaw || "all"}|snapshot=${dateWindow.snapshotDate || "live"}|inrcy=${inrcyTrackingEnabled ? 1 : 0}|conn=${connectionsKey}`;

  const LINKEDIN_METRICS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const LINKEDIN_LAST_GOOD_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const LINKEDIN_METRICS_SOURCE = "linkedin_metrics";
  const LINKEDIN_LAST_GOOD_METRICS_SOURCE = "linkedin_metrics_last_good";
  const LINKEDIN_OPPORTUNITY_LAST_GOOD_SOURCE = "linkedin_opportunity_last_good";
  const LINKEDIN_QUOTA_GUARD_SOURCE = "linkedin_quota_guard";

  function normalizeLinkedInCachePart(value: unknown) {
    return String(value || "none")
      .trim()
      .replace(/[^a-zA-Z0-9:_-]+/g, "_")
      .slice(0, 160);
  }

  function buildLinkedInMetricsCacheKey(authorUrn: string, orgUrn: string) {
    return [
      `days=${days}`,
      `snapshot=${dateWindow.snapshotDate || "live"}`,
      `person=${normalizeLinkedInCachePart(authorUrn)}`,
      `org=${normalizeLinkedInCachePart(orgUrn)}`,
    ].join("|");
  }

  function buildLinkedInSourceMetricsCacheKey(
    source: "member" | "organization",
    urn: string,
  ) {
    return [
      `days=${days}`,
      `snapshot=${dateWindow.snapshotDate || "live"}`,
      `linkedin_source=${source}`,
      source === "member"
        ? `person=${normalizeLinkedInCachePart(urn)}`
        : `org=${normalizeLinkedInCachePart(urn)}`,
    ].join("|");
  }

  function annotateLinkedInMetrics(metrics: unknown, cacheMode: string, extra?: Record<string, unknown>) {
    const rec = asRecord(metrics);
    return {
      ...rec,
      raw: {
        ...asRecord(rec["raw"]),
        cache: {
          mode: cacheMode,
          usedAt: new Date().toISOString(),
          ...(extra || {}),
        },
      },
    };
  }

  async function readLinkedInMetricsCache(cacheKey: string, options?: { allowExpired?: boolean }) {
    try {
      let query = supabase
        .from("stats_cache")
        .select("payload, expires_at")
        .eq("user_id", userId)
        .eq("source", LINKEDIN_METRICS_SOURCE)
        .eq("range_key", cacheKey)
        .order("expires_at", { ascending: false })
        .limit(1);

      if (!options?.allowExpired) {
        query = query.gt("expires_at", new Date().toISOString());
      }

      const { data } = await query.maybeSingle();
      const payload = asRecord(asRecord(data)["payload"]);
      return Object.keys(payload).length ? payload : null;
    } catch {
      return null;
    }
  }

  function isLastGoodLinkedInMetrics(metrics: unknown) {
    return hasUsableLinkedInMetrics(metrics) && !hasLinkedInMetricErrors(metrics);
  }

  async function readLastGoodLinkedInMetrics(
    authorUrn: string,
    orgUrn: string,
    cacheKey?: string,
  ) {
    const identityPrefix = [
      `days=${days}`,
      `snapshot=`,
    ].join("|");
    const person = normalizeLinkedInCachePart(authorUrn);
    const org = normalizeLinkedInCachePart(orgUrn);
    const orgPattern = orgUrn ? org : "%";

    async function firstUsableFrom(source: string, query: "exact" | "identity") {
      try {
        let request = supabase
          .from("stats_cache")
          .select("payload, expires_at, range_key")
          .eq("user_id", userId)
          .eq("source", source);

        if (query === "exact" && cacheKey) {
          request = request.eq("range_key", cacheKey);
        } else {
          request = request.like(
            "range_key",
            `${identityPrefix}%person=${person}|org=${orgPattern}`,
          );
        }

        const { data: rows = [] } = await request
          .order("expires_at", { ascending: false })
          .limit(12);

        for (const row of Array.isArray(rows) ? rows : []) {
          const payload = asRecord(asRecord(row)["payload"]);
          if (isLastGoodLinkedInMetrics(payload)) return payload;
        }
      } catch {}
      return null;
    }

    // Source dédiée : uniquement les snapshots LinkedIn réellement exploitables.
    if (cacheKey) {
      const exactLastGood = await firstUsableFrom(
        LINKEDIN_LAST_GOOD_METRICS_SOURCE,
        "exact",
      );
      if (exactLastGood) return exactLastGood;
    }

    const identityLastGood = await firstUsableFrom(
      LINKEDIN_LAST_GOOD_METRICS_SOURCE,
      "identity",
    );
    if (identityLastGood) return identityLastGood;

    // Migration douce : anciens caches linkedin_metrics, seulement s'ils sont vraiment exploitables.
    if (cacheKey) {
      const exactLegacy = await firstUsableFrom(LINKEDIN_METRICS_SOURCE, "exact");
      if (exactLegacy) return exactLegacy;
    }

    return firstUsableFrom(LINKEDIN_METRICS_SOURCE, "identity");
  }

  async function readLastGoodLinkedInOpportunityMetrics(
    authorUrn: string,
    orgUrn: string,
    cacheKey?: string,
  ) {
    const identityPrefix = [
      `days=${days}`,
      `snapshot=`,
    ].join("|");
    const person = normalizeLinkedInCachePart(authorUrn);
    const org = normalizeLinkedInCachePart(orgUrn);
    const orgPattern = orgUrn ? org : "%";

    async function firstOpportunityFrom(source: string, query: "exact" | "identity") {
      try {
        let request = supabase
          .from("stats_cache")
          .select("payload, expires_at, range_key")
          .eq("user_id", userId)
          .eq("source", source);

        if (query === "exact" && cacheKey) {
          request = request.eq("range_key", cacheKey);
        } else {
          request = request.like(
            "range_key",
            `${identityPrefix}%person=${person}|org=${orgPattern}`,
          );
        }

        const { data: rows = [] } = await request
          .order("expires_at", { ascending: false })
          .limit(12);

        for (const row of Array.isArray(rows) ? rows : []) {
          const payload = asRecord(asRecord(row)["payload"]);
          if (hasLinkedInOpportunityMetrics(payload)) return payload;
        }
      } catch {}
      return null;
    }

    for (const source of [
      LINKEDIN_OPPORTUNITY_LAST_GOOD_SOURCE,
      LINKEDIN_LAST_GOOD_METRICS_SOURCE,
      LINKEDIN_METRICS_SOURCE,
    ]) {
      if (cacheKey) {
        const exact = await firstOpportunityFrom(source, "exact");
        if (exact) return exact;
      }
      const identity = await firstOpportunityFrom(source, "identity");
      if (identity) return identity;
    }

    return null;
  }

  async function writeLinkedInMetricsCache(cacheKey: string, payload: unknown) {
    try {
      await supabase.from("stats_cache").upsert(
        {
          user_id: userId,
          source: LINKEDIN_METRICS_SOURCE,
          range_key: cacheKey,
          payload,
          expires_at: new Date(Date.now() + LINKEDIN_METRICS_CACHE_TTL_MS).toISOString(),
        },
        { onConflict: "user_id,source,range_key" },
      );
    } catch {}
  }

  async function writeLastGoodLinkedInMetricsCache(cacheKey: string, payload: unknown) {
    if (!isLastGoodLinkedInMetrics(payload)) return;
    try {
      await supabase.from("stats_cache").upsert(
        {
          user_id: userId,
          source: LINKEDIN_LAST_GOOD_METRICS_SOURCE,
          range_key: cacheKey,
          payload,
          expires_at: new Date(Date.now() + LINKEDIN_LAST_GOOD_CACHE_TTL_MS).toISOString(),
        },
        { onConflict: "user_id,source,range_key" },
      );
    } catch {}
  }

  async function writeLastGoodLinkedInOpportunityCache(cacheKey: string, payload: unknown) {
    if (!hasLinkedInOpportunityMetrics(payload)) return;
    try {
      await supabase.from("stats_cache").upsert(
        {
          user_id: userId,
          source: LINKEDIN_OPPORTUNITY_LAST_GOOD_SOURCE,
          range_key: cacheKey,
          payload,
          expires_at: new Date(Date.now() + LINKEDIN_LAST_GOOD_CACHE_TTL_MS).toISOString(),
        },
        { onConflict: "user_id,source,range_key" },
      );
    } catch {}
  }

  async function resolveLinkedInCachedMetrics(
    cacheKey: string,
    authorUrn: string,
    orgUrn: string,
  ) {
    const cached = await readLinkedInMetricsCache(cacheKey);
    if (cached && isLastGoodLinkedInMetrics(cached)) {
      return { metrics: cached, mode: "fresh_linkedin_cache" };
    }

    const lastGood = await readLastGoodLinkedInMetrics(authorUrn, orgUrn, cacheKey);
    if (lastGood) {
      return {
        metrics: lastGood,
        mode: cached ? "last_good_over_partial_cache" : "last_good_cache",
      };
    }

    // Important : un cache d'opportunité seul ne doit PAS bloquer une nouvelle
    // synchro LinkedIn. Il sert uniquement de secours en cas de quota/erreur.
    // Sinon, après le reset LinkedIn, l'app peut rester bloquée sur "+18 / demandes —"
    // pendant 30 jours au lieu de retenter les stats détaillées.
    if (cached && hasDetailedLinkedInMetrics(cached)) {
      return {
        metrics: cached,
        mode: hasLinkedInMetricErrors(cached)
          ? "usable_partial_linkedin_cache"
          : "valid_partial_linkedin_cache",
      };
    }

    if (cached && !hasLinkedInMetricErrors(cached)) {
      return { metrics: cached, mode: "valid_partial_linkedin_cache" };
    }

    return null;
  }

  async function readLinkedInQuotaGuard() {
    try {
      const { data } = await supabase
        .from("stats_cache")
        .select("payload, expires_at")
        .eq("user_id", userId)
        .eq("source", LINKEDIN_QUOTA_GUARD_SOURCE)
        .eq("range_key", "application")
        .gt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const payload = asRecord(asRecord(data)["payload"]);
      const expiresAt = String(asRecord(data)["expires_at"] || payload["blockedUntil"] || "");
      return expiresAt ? { payload, expiresAt } : null;
    } catch {
      return null;
    }
  }

  async function writeLinkedInQuotaGuard(errorMessage: string) {
    const blockedUntil = getLinkedInNextUtcResetIso();
    try {
      await supabase.from("stats_cache").upsert(
        {
          user_id: userId,
          source: LINKEDIN_QUOTA_GUARD_SOURCE,
          range_key: "application",
          payload: {
            blockedUntil,
            error: errorMessage,
            reason: "linkedin_api_quota",
          },
          expires_at: blockedUntil,
        },
        { onConflict: "user_id,source,range_key" },
      );
    } catch {}
    return blockedUntil;
  }

  // Lecture cache (best-effort)
  if (!fresh)
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
      if (asRecord(cacheHit)["payload"]) {
        const payload = asRecord(asRecord(cacheHit)["payload"]);
        // Rehydrate all live connection flags to avoid stale/missing keys in cached payloads.
        try {
          const liveSources = await fetchLiveSourcesStatus();
          payload["sources"] = mergeCachedSourcesWithLiveState(
            payload["sources"],
            liveSources,
          );
        } catch {}
        const stabilizedPayload = await stabilizeOverviewPayload({
          supabase,
          userId,
          days,
          includeRaw,
          includeAll,
          payload,
        });
        return stabilizedPayload as OverviewPayload;
      }
    } catch {
      // Table stats_cache non présente ou non accessible : on ignore.
    }

  // Cache legacy (best-effort)
  if (!fresh)
    try {
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
        // Rehydrate all live connection flags to avoid stale/missing keys in legacy cached payloads.
        try {
          const liveSources = await fetchLiveSourcesStatus();
          payload["sources"] = mergeCachedSourcesWithLiveState(
            payload["sources"],
            liveSources,
          );
        } catch {}
        const stabilizedPayload = await stabilizeOverviewPayload({
          supabase,
          userId,
          days,
          includeRaw,
          includeAll,
          payload,
        });
        return stabilizedPayload as OverviewPayload;
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

  const sources: Array<{
    key: StatsSourceKey;
    ga4Property?: string;
    gscProperty?: string;
  }> = [
    {
      key: "site_inrcy",
      // CRITICAL BUSINESS RULE:
      // when profiles.inrcy_site_ownership = "none", the iNrCy site must be treated as non-existent.
      // We therefore ignore any stale GA4/GSC configuration still present in inrcy_site_configs.
      ga4Property: hasInrcySite
        ? String(inrcyGa4["property_id"] ?? "").trim() || undefined
        : undefined,
      gscProperty: hasInrcySite
        ? String(inrcyGsc["property"] ?? "").trim() || undefined
        : undefined,
    },
    {
      key: "site_web",
      ga4Property: String(webGa4["property_id"] ?? "").trim() || undefined,
      gscProperty: String(webGsc["property"] ?? "").trim() || undefined,
    },
  ];

  // Fetch each source (SAFE PERF): run site sources concurrently, and run GA4 calls in parallel.
  const perSource: Record<
    string,
    { ga4: unknown | null; gsc: unknown | null; connected: SiteConn }
  > = {};
  const pageAgg = new Map<string, number>();
  const channelAgg = new Map<string, number>();
  const queryAgg = new Map<
    string,
    { clicks: number; impressions: number; positionSum: number; rows: number }
  >();

  let totalUsers = 0;
  let totalSessions = 0;
  let totalPageviews = 0;

  let engagementWeighted = 0; // engagementRate * sessions
  let durationWeighted = 0; // avgSessionDuration * sessions

  let totalClicks = 0;
  let totalImpressions = 0;

  const siteResults = await Promise.all(
    sources.map(async (s) => {
      const entry: {
        ga4: unknown | null;
        gsc: unknown | null;
        connected: SiteConn;
      } = {
        ga4: null,
        gsc: null,
        connected: { ga4: false, gsc: false },
      };

      const includeGa4 =
        includeAll ||
        includeSet.has(`${s.key}_ga4`) ||
        includeSet.has(`${s.key}-ga4`);
      const includeGsc =
        includeAll ||
        includeSet.has(`${s.key}_gsc`) ||
        includeSet.has(`${s.key}-gsc`);

      const localPages = new Map<string, number>();
      const localChannels = new Map<string, number>();
      const localQueries = new Map<
        string,
        {
          clicks: number;
          impressions: number;
          positionSum: number;
          rows: number;
        }
      >();

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
              runGa4Report(token.accessToken, s.ga4Property, days, {
                start: dateWindow.start,
                end: dateWindow.end,
                startDateYmd: dateWindow.startDateYmd,
                endDateYmd: dateWindow.endDateYmd,
              }),
              runGa4TopPages(token.accessToken, s.ga4Property, days, {
                start: dateWindow.start,
                end: dateWindow.end,
                startDateYmd: dateWindow.startDateYmd,
                endDateYmd: dateWindow.endDateYmd,
              }),
              runGa4Channels(token.accessToken, s.ga4Property, days, {
                start: dateWindow.start,
                end: dateWindow.end,
                startDateYmd: dateWindow.startDateYmd,
                endDateYmd: dateWindow.endDateYmd,
              }),
            ]);

            entry.connected.ga4 = true;
            entry.ga4 = {
              propertyId: s.ga4Property,
              overview,
              pages,
              channels,
            };

            users += overview.users;
            sessions += overview.sessions;
            pageviews += overview.pageviews;
            engagementW += overview.engagementRate * overview.sessions;
            durationW += overview.avgSessionDuration * overview.sessions;

            for (const p of pages)
              localPages.set(p.path, (localPages.get(p.path) || 0) + p.views);
            for (const c of channels)
              localChannels.set(
                c.channel,
                (localChannels.get(c.channel) || 0) + c.sessions,
              );
          } catch (e) {
            entry.connected.ga4 = false;
            entry.ga4 = {
              propertyId: s.ga4Property,
              error: getSimpleFrenchErrorMessage(
                e,
                "Impossible de récupérer les statistiques GA4 pour le moment.",
              ),
            };
          }
        }
      }

      // GSC
      if (includeGsc && s.gscProperty) {
        const token = await safeGetGoogleTokenFor(s.key, "gsc");
        if (token?.accessToken) {
          try {
            const q = await runGscQuery(
              token.accessToken,
              s.gscProperty,
              days,
              {
                start: dateWindow.start,
                end: dateWindow.end,
                startDateYmd: dateWindow.startDateYmd,
                endDateYmd: dateWindow.endDateYmd,
              },
            );
            entry.connected.gsc = true;
            entry.gsc = { property: s.gscProperty, queries: q.rows };

            const rows = Array.isArray(asRecord(q)["rows"])
              ? (asRecord(q)["rows"] as unknown[])
              : [];
            for (const r of rows) {
              const rr = asRecord(r);
              const clicks = Number(rr["clicks"] ?? 0) || 0;
              const impressions = Number(rr["impressions"] ?? 0) || 0;
              const query = String(rr["query"] ?? "");
              const position = Number(rr["position"] ?? 0) || 0;

              clicksSum += clicks;
              impressionsSum += impressions;

              const cur = localQueries.get(query) || {
                clicks: 0,
                impressions: 0,
                positionSum: 0,
                rows: 0,
              };
              cur.clicks += clicks;
              cur.impressions += impressions;
              cur.positionSum += position;
              cur.rows += 1;
              localQueries.set(query, cur);
            }
          } catch (e) {
            entry.connected.gsc = false;
            entry.gsc = {
              property: s.gscProperty,
              error: getSimpleFrenchErrorMessage(
                e,
                "Impossible de récupérer les statistiques Search Console pour le moment.",
              ),
            };
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
    }),
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
      const cur = queryAgg.get(query) || {
        clicks: 0,
        impressions: 0,
        positionSum: 0,
        rows: 0,
      };
      cur.clicks += v.clicks;
      cur.impressions += v.impressions;
      cur.positionSum += v.positionSum;
      cur.rows += v.rows;
      queryAgg.set(query, cur);
    }
  }

  const engagementRate =
    totalSessions > 0 ? engagementWeighted / totalSessions : 0;
  const avgSessionDuration =
    totalSessions > 0 ? durationWeighted / totalSessions : 0;
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
    tiktok: { connected: false, metrics: null },
    youtube_shorts: { connected: false, metrics: null },
  };

  const channelStates = await channelStatesPromise;

  // source commune des états de connexion
  sourcesStatus.site_inrcy.connected = {
    ga4: channelStates.site_inrcy.ga4,
    gsc: channelStates.site_inrcy.gsc,
  };
  sourcesStatus.youtube_shorts.connected = isStatsActiveConnection(channelStates.youtube_shorts);

  sourcesStatus.site_web.connected = {
    ga4: channelStates.site_web.ga4,
    gsc: channelStates.site_web.gsc,
  };
  // TikTok: Display API / User Info + video.list.
  // Données réelles : profil (followers/likes/vidéos) + vidéos publiques publiées sur la période.
  try {
    const tiktokRow = bestIntegrationAny(
      "tiktok",
      "tiktok",
      "tiktok",
      (row) => Boolean(row["access_token_enc"] || row["refresh_token_enc"]),
    );
    const tiktokHasAuth = Boolean(tiktokRow["access_token_enc"] || tiktokRow["refresh_token_enc"]);
    const tiktokStatus = String(tiktokRow["status"] || "");
    const tiktokExpiredWithoutRefresh = isExpired(tiktokRow["expires_at"]) && !tiktokRow["refresh_token_enc"];
    sourcesStatus.tiktok.connected = Boolean(
      (tiktokStatus === "connected" || tiktokStatus === "account_connected") &&
        tiktokRow["resource_id"] &&
        tiktokHasAuth &&
        !tiktokExpiredWithoutRefresh,
    );

    const includeTikTok = includeAll || includeSet.has("tiktok");
    if (!includeTikTok) {
      sourcesStatus.tiktok.metrics = null;
    } else if (sourcesStatus.tiktok.connected) {
      try {
        let accessToken = tryDecryptToken(String(tiktokRow["access_token_enc"] || "")) || "";
        const refreshToken = tryDecryptToken(String(tiktokRow["refresh_token_enc"] || "")) || "";

        if ((!accessToken || isExpired(tiktokRow["expires_at"])) && refreshToken) {
          const refreshed = await refreshTiktokAccessToken(refreshToken);
          const nextAccessToken = String(refreshed["access_token"] || "").trim();
          const nextRefreshToken = String(refreshed["refresh_token"] || "").trim() || refreshToken;
          const expiresIn = Number(refreshed["expires_in"] || 0);
          const refreshExpiresIn = Number(refreshed["refresh_expires_in"] || 0);
          const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0
            ? new Date(Date.now() + expiresIn * 1000).toISOString()
            : null;
          const nextMeta = {
            ...asRecord(tiktokRow["meta"]),
            refresh_expires_at: Number.isFinite(refreshExpiresIn) && refreshExpiresIn > 0
              ? new Date(Date.now() + refreshExpiresIn * 1000).toISOString()
              : asRecord(tiktokRow["meta"])["refresh_expires_at"] || null,
            tiktok_token_refreshed_at: new Date().toISOString(),
          };

          if (nextAccessToken) {
            await supabase
              .from("integrations")
              .update({
                access_token_enc: encryptToken(nextAccessToken),
                refresh_token_enc: nextRefreshToken ? encryptToken(nextRefreshToken) : tiktokRow["refresh_token_enc"] || null,
                expires_at: expiresAt || tiktokRow["expires_at"] || null,
                meta: nextMeta,
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", userId)
              .eq("provider", "tiktok")
              .eq("source", "tiktok")
              .eq("product", "tiktok");
            accessToken = nextAccessToken;
          }
        }

        if (!accessToken) {
          throw new Error("Connexion TikTok expirée. Reconnecte TikTok dans Canaux.");
        }

        const remoteTiktokMetrics = await fetchTiktokAnalyticsSnapshot({
          accessToken,
          start: dateWindow.start,
          end: dateWindow.end,
        });
        sourcesStatus.tiktok.metrics = mergeTiktokLocalPublicationStats(
          remoteTiktokMetrics,
          tiktokLocalPublicationStats,
        );
      } catch (e) {
        console.error("[TIKTOK_STATS_REAL_ERROR]", e);
        const rawMessage = e instanceof Error ? e.message : String(e || "");
        const lowerMessage = rawMessage.toLowerCase();
        const needsReconnect =
          lowerMessage.includes("scope") ||
          lowerMessage.includes("permission") ||
          lowerMessage.includes("autorisation") ||
          lowerMessage.includes("unauthorized") ||
          lowerMessage.includes("forbidden") ||
          lowerMessage.includes("access token") ||
          lowerMessage.includes("reconnect") ||
          lowerMessage.includes("reconnecte");
        sourcesStatus.tiktok.metrics = mergeTiktokLocalPublicationStats(
          {
            error: getSimpleFrenchErrorMessage(
              e,
              "Impossible de récupérer les statistiques TikTok pour le moment.",
            ),
            raw_error: rawMessage || null,
            needs_reconnect: needsReconnect,
          },
          tiktokLocalPublicationStats,
        );
      }
    } else {
      sourcesStatus.tiktok.metrics = tiktokLocalPublicationStats.posts > 0
        ? mergeTiktokLocalPublicationStats({}, tiktokLocalPublicationStats)
        : null;
    }
  } catch {}

  // Facebook: connected if a page has been selected (resource_id)
  try {
    const fbRow = bestIntegrationAny(
      "facebook",
      "facebook",
      "facebook",
      hasFacebookStoredToken,
    );
    sourcesStatus.facebook.connected = hasActiveStoredIntegration(
      fbRow,
      hasFacebookStoredToken(fbRow),
    );

    // Real Facebook Page metrics (only if included)
    const includeFb = includeAll || includeSet.has("facebook");
    if (!includeFb) {
      sourcesStatus.facebook.metrics = null;
    } else if (
      sourcesStatus.facebook.connected &&
      fbRow["resource_id"] &&
      (fbRow["access_token_enc"] ||
        asRecord(fbRow["meta"])["user_access_token_enc"] ||
        asRecord(fbRow["meta"])["standard_user_access_token_enc"] ||
        asRecord(fbRow["meta"])["business_user_access_token_enc"])
    ) {
      try {
        const end = dateWindow.end;
        const start = dateWindow.start;
        const fbEncryptedToken =
          extractFacebookUserTokens(
            fbRow["meta"],
            String(fbRow["access_token_enc"] || "") || null,
          )[0] || String(fbRow["access_token_enc"] || "");
        const token = tryDecryptToken(fbEncryptedToken);
        if (!token)
          throw new Error(
            "La connexion Facebook a expiré ou n’est plus valide.",
          );
        sourcesStatus.facebook.metrics = await fbFetchDailyInsights(
          token,
          String(fbRow["resource_id"]),
          start,
          end,
        );
      } catch (e) {
        console.error("[FB_STATS_REAL_ERROR]", e);
        sourcesStatus.facebook.metrics = {
          error: e instanceof Error ? e.message : String(e),
        };
      }
    } else {
      sourcesStatus.facebook.metrics = null;
    }
  } catch {}

  // Instagram: Meta family. Connected only once a profile is selected (resource_id).
  try {
    const igRow = bestIntegrationAny(
      "instagram",
      "instagram",
      "instagram",
      (row) => Boolean(row["access_token_enc"]),
    );
    sourcesStatus.instagram.connected = hasActiveStoredIntegration(
      igRow,
      Boolean(igRow["access_token_enc"]),
    );

    const includeIg = includeAll || includeSet.has("instagram");
    if (!includeIg) {
      sourcesStatus.instagram.metrics = null;
    } else if (
      sourcesStatus.instagram.connected &&
      igRow["resource_id"] &&
      igRow["access_token_enc"]
    ) {
      try {
        const end = dateWindow.end;
        const start = dateWindow.start;
        const token = tryDecryptToken(String(igRow["access_token_enc"]));
        if (!token)
          throw new Error(
            "La connexion Instagram a expiré ou n’est plus valide.",
          );
        const baseMetrics = await igFetchDailyInsights(
          token,
          String(igRow["resource_id"]),
          start,
          end,
        );
        if (!baseMetrics)
          throw new Error(
            "Impossible de récupérer les statistiques Instagram pour le moment.",
          );
        sourcesStatus.instagram.metrics = {
          ...baseMetrics,
          raw: {
            ...(baseMetrics.raw || {}),
            supportedMetrics: {
              account: Array.isArray(baseMetrics.raw?.supportedMetrics?.account)
                ? baseMetrics.raw.supportedMetrics.account
                : [],
              media: [],
            },
            unsupportedMetrics: {
              account: Array.isArray(
                baseMetrics.raw?.unsupportedMetrics?.account,
              )
                ? baseMetrics.raw.unsupportedMetrics.account
                : [],
              media: [],
            },
            metricErrors: {
              account: baseMetrics.raw?.metricErrors?.account || {},
              media: {},
            },
            mediaInsights: { error: "skipped_for_fast_refresh" },
          },
        };
      } catch (e) {
        console.error("[IG_STATS_REAL_ERROR]", e);
        sourcesStatus.instagram.metrics = {
          error: e instanceof Error ? e.message : String(e),
        };
      }
    } else {
      sourcesStatus.instagram.metrics = null;
    }
  } catch {}

  // LinkedIn: connected if an OAuth row exists.
  try {
    sourcesStatus.linkedin.connected = isStatsActiveConnection(
      channelStates.linkedin,
    );

    const includeLi = includeAll || includeSet.has("linkedin");
    if (!includeLi) {
      sourcesStatus.linkedin.metrics = null;
    } else if (sourcesStatus.linkedin.connected) {
      try {
        const auth = await getLinkedInAccessToken({ userId });
        const token = auth.accessToken;
        if (!token)
          throw new Error(
            auth.error ||
              "La connexion LinkedIn a expiré ou n’est plus valide.",
          );
        let orgUrn = auth.orgUrn || "";
        const authorUrn = auth.authorUrn || "";
        const end = dateWindow.end;
        const start = dateWindow.start;

        // Si aucun URN n'est persistant, on résout l'organisation seulement si aucun
        // guard quota n'est actif, pour éviter un appel inutile pendant le blocage LinkedIn.
        const preliminaryCacheKey = buildLinkedInMetricsCacheKey(authorUrn, orgUrn);
        const preliminaryCached = await resolveLinkedInCachedMetrics(
          preliminaryCacheKey,
          authorUrn,
          orgUrn,
        );
        const quotaGuard = await readLinkedInQuotaGuard();

        if (preliminaryCached) {
          sourcesStatus.linkedin.metrics = annotateLinkedInMetrics(
            preliminaryCached.metrics,
            preliminaryCached.mode,
          );
        } else if (quotaGuard) {
          const lastGood = await readLastGoodLinkedInMetrics(
            authorUrn,
            orgUrn,
            preliminaryCacheKey,
          );
          const lastOpportunity = lastGood
            ? null
            : await readLastGoodLinkedInOpportunityMetrics(
                authorUrn,
                orgUrn,
                preliminaryCacheKey,
              );
          sourcesStatus.linkedin.metrics = lastGood
            ? annotateLinkedInMetrics(lastGood, "last_good_quota_guard", {
                blockedUntil: quotaGuard.expiresAt,
              })
            : lastOpportunity
              ? annotateLinkedInMetrics(lastOpportunity, "last_opportunity_quota_guard", {
                  blockedUntil: quotaGuard.expiresAt,
                })
              : {
                  error: "Stats LinkedIn temporairement indisponibles : quota API atteint.",
                  raw: {
                    errors: [String(asRecord(quotaGuard.payload)["error"] || "linkedin_api_quota")],
                    quotaGuard: { blockedUntil: quotaGuard.expiresAt },
                  },
                };
        } else {
          if (!authorUrn.startsWith("urn:li:person:") && !orgUrn) {
            orgUrn = await liResolveFirstAdminOrgUrn(token);
          }

          const cacheKey = buildLinkedInMetricsCacheKey(authorUrn, orgUrn);
          const cached = await resolveLinkedInCachedMetrics(cacheKey, authorUrn, orgUrn);
          if (cached) {
            sourcesStatus.linkedin.metrics = annotateLinkedInMetrics(
              cached.metrics,
              cached.mode,
            );
          } else {
            try {
              type LinkedInSourceFetch = {
                label: "member" | "organization";
                cacheKey: string;
                authorForCache: string;
                orgForCache: string;
                run: () => Promise<unknown>;
              };

              const sourceFetches: LinkedInSourceFetch[] = [];
              if (authorUrn.startsWith("urn:li:person:")) {
                sourceFetches.push({
                  label: "member",
                  cacheKey: buildLinkedInSourceMetricsCacheKey("member", authorUrn),
                  authorForCache: authorUrn,
                  orgForCache: "",
                  run: () => liFetchMemberAnalytics(token, authorUrn, start, end),
                });
              }
              if (orgUrn.startsWith("urn:li:organization:")) {
                sourceFetches.push({
                  label: "organization",
                  cacheKey: buildLinkedInSourceMetricsCacheKey("organization", orgUrn),
                  authorForCache: "",
                  orgForCache: orgUrn,
                  run: () => liFetchOrgAnalytics(token, orgUrn, start, end),
                });
              }
              if (!sourceFetches.length) {
                throw new Error("Le compte LinkedIn n’est pas correctement configuré.");
              }

              const sourceResults: Array<{
                label: "member" | "organization";
                metrics?: unknown | null;
                error?: string | null;
                mode?: string | null;
              }> = [];

              for (const sourceFetch of sourceFetches) {
                const sourceCached = await resolveLinkedInCachedMetrics(
                  sourceFetch.cacheKey,
                  sourceFetch.authorForCache,
                  sourceFetch.orgForCache,
                );
                if (sourceCached) {
                  sourceResults.push({
                    label: sourceFetch.label,
                    metrics: sourceCached.metrics,
                    mode: sourceCached.mode,
                  });
                  continue;
                }

                try {
                  const sourceMetrics = await sourceFetch.run();
                  const sourceQuotaError = getLinkedInRateLimitErrorFromMetrics(sourceMetrics);
                  if (sourceQuotaError) await writeLinkedInQuotaGuard(sourceQuotaError);
                  if (shouldCacheLinkedInMetrics(sourceMetrics)) {
                    await writeLinkedInMetricsCache(sourceFetch.cacheKey, sourceMetrics);
                  }
                  await writeLastGoodLinkedInOpportunityCache(
                    sourceFetch.cacheKey,
                    sourceMetrics,
                  );

                  if (isLastGoodLinkedInMetrics(sourceMetrics)) {
                    await writeLastGoodLinkedInMetricsCache(
                      sourceFetch.cacheKey,
                      sourceMetrics,
                    );
                    sourceResults.push({
                      label: sourceFetch.label,
                      metrics: sourceMetrics,
                      mode: "live",
                    });
                  } else if (hasUsableLinkedInMetrics(sourceMetrics)) {
                    // Réponse partielle mais exploitable : on la garde pour éviter
                    // de rappeler LinkedIn à chaque ouverture.
                    sourceResults.push({
                      label: sourceFetch.label,
                      metrics: sourceMetrics,
                      mode: "live_partial",
                    });
                  } else {
                    const sourceLastGood = await readLastGoodLinkedInMetrics(
                      sourceFetch.authorForCache,
                      sourceFetch.orgForCache,
                      sourceFetch.cacheKey,
                    );
                    const sourceLastOpportunity = sourceLastGood
                      ? null
                      : await readLastGoodLinkedInOpportunityMetrics(
                          sourceFetch.authorForCache,
                          sourceFetch.orgForCache,
                          sourceFetch.cacheKey,
                        );
                    sourceResults.push({
                      label: sourceFetch.label,
                      metrics: sourceLastGood || sourceLastOpportunity || sourceMetrics,
                      mode: sourceLastGood
                        ? "last_good_after_partial_refresh"
                        : sourceLastOpportunity
                          ? "last_opportunity_after_partial_refresh"
                          : "live_partial",
                    });
                  }
                } catch (sourceError) {
                  const rawSourceMessage = sourceError instanceof Error
                    ? sourceError.message
                    : String(sourceError);
                  if (isLinkedInRateLimitMessage(rawSourceMessage)) {
                    await writeLinkedInQuotaGuard(rawSourceMessage);
                  }
                  const sourceLastGood = await readLastGoodLinkedInMetrics(
                    sourceFetch.authorForCache,
                    sourceFetch.orgForCache,
                    sourceFetch.cacheKey,
                  );
                  const sourceLastOpportunity = sourceLastGood
                    ? null
                    : await readLastGoodLinkedInOpportunityMetrics(
                        sourceFetch.authorForCache,
                        sourceFetch.orgForCache,
                        sourceFetch.cacheKey,
                      );

                  if (sourceLastGood || sourceLastOpportunity) {
                    sourceResults.push({
                      label: sourceFetch.label,
                      metrics: annotateLinkedInMetrics(
                        sourceLastGood || sourceLastOpportunity,
                        sourceLastGood
                          ? "last_good_source_after_error"
                          : "last_opportunity_source_after_error",
                        { refreshIssue: rawSourceMessage },
                      ),
                      mode: sourceLastGood
                        ? "last_good_source_after_error"
                        : "last_opportunity_source_after_error",
                    });
                  } else {
                    sourceResults.push({
                      label: sourceFetch.label,
                      error: rawSourceMessage,
                    });
                  }
                }
              }

              const metrics = liAggregateAnalytics(sourceResults, start, end);
              const quotaMetricError = getLinkedInRateLimitErrorFromMetrics(metrics);
              if (quotaMetricError) {
                await writeLinkedInQuotaGuard(quotaMetricError);
              }
              if (shouldCacheLinkedInMetrics(metrics)) {
                await writeLinkedInMetricsCache(cacheKey, metrics);
              }
              await writeLastGoodLinkedInOpportunityCache(cacheKey, metrics);

              if (isLastGoodLinkedInMetrics(metrics)) {
                await writeLastGoodLinkedInMetricsCache(cacheKey, metrics);
                sourcesStatus.linkedin.metrics = annotateLinkedInMetrics(
                  metrics,
                  "live_sources_aggregate",
                );
              } else if (hasUsableLinkedInMetrics(metrics)) {
                sourcesStatus.linkedin.metrics = annotateLinkedInMetrics(
                  metrics,
                  "partial_sources_aggregate",
                  { refreshIssue: collectLinkedInMetricErrors(metrics)[0] || null },
                );
              } else {
                const lastGood = await readLastGoodLinkedInMetrics(
                  authorUrn,
                  orgUrn,
                  cacheKey,
                );
                const lastOpportunity = lastGood
                  ? null
                  : await readLastGoodLinkedInOpportunityMetrics(authorUrn, orgUrn, cacheKey);
                sourcesStatus.linkedin.metrics = lastGood
                  ? annotateLinkedInMetrics(lastGood, "last_good_after_partial_refresh", {
                      refreshIssue: collectLinkedInMetricErrors(metrics)[0] || null,
                    })
                  : lastOpportunity
                    ? annotateLinkedInMetrics(lastOpportunity, "last_opportunity_after_partial_refresh", {
                        refreshIssue: collectLinkedInMetricErrors(metrics)[0] || null,
                      })
                    : annotateLinkedInMetrics(metrics, "live_partial");
              }
            } catch (e) {
              const rawMessage = e instanceof Error ? e.message : String(e);
              const blockedUntil = isLinkedInRateLimitMessage(rawMessage)
                ? await writeLinkedInQuotaGuard(rawMessage)
                : null;
              const lastGood = await readLastGoodLinkedInMetrics(
                authorUrn,
                orgUrn,
                cacheKey,
              );

              const lastOpportunity = lastGood
                ? null
                : await readLastGoodLinkedInOpportunityMetrics(
                    authorUrn,
                    orgUrn,
                    cacheKey,
                  );

              sourcesStatus.linkedin.metrics = lastGood
                ? annotateLinkedInMetrics(lastGood, "last_good_after_error", {
                    refreshIssue: rawMessage,
                    blockedUntil,
                  })
                : lastOpportunity
                  ? annotateLinkedInMetrics(lastOpportunity, "last_opportunity_after_error", {
                      refreshIssue: rawMessage,
                      blockedUntil,
                    })
                  : {
                      error: getSimpleFrenchErrorMessage(
                        e,
                        "Impossible de récupérer les statistiques LinkedIn pour le moment.",
                      ),
                      raw: {
                        errors: [rawMessage],
                        quotaGuard: blockedUntil ? { blockedUntil } : undefined,
                      },
                    };
            }
          }
        }
      } catch (e) {
        sourcesStatus.linkedin.metrics = {
          error: getSimpleFrenchErrorMessage(
            e,
            "Impossible de récupérer les statistiques LinkedIn pour le moment.",
          ),
        };
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
      const legacyRows = Array.isArray(integrationsLegacyAll)
        ? (integrationsLegacyAll as unknown[])
        : [];
      const legacy = legacyRows
        .map((r) => asRecord(r))
        .filter(
          (r) =>
            r["provider"] === "google" &&
            r["source"] === "gmb" &&
            r["product"] === "gmb" &&
            r["status"] === "connected",
        )
        .sort((a, b) => {
          const aa = new Date(
            String(a["updated_at"] ?? a["created_at"] ?? 0),
          ).getTime();
          const bb = new Date(
            String(b["updated_at"] ?? b["created_at"] ?? 0),
          ).getTime();
          return bb - aa;
        })[0];
      legacyResource = String(asRecord(legacy)["resource_id"] || "");
    } catch {}

    const resourceId = String(gmbRow["resource_id"] || legacyResource || "");
    sourcesStatus.gmb.connected = isStatsActiveConnection(channelStates.gmb);

    const includeGmb = includeAll || includeSet.has("gmb");
    if (!includeGmb) {
      sourcesStatus.gmb.metrics = null;
    } else if (!sourcesStatus.gmb.connected) {
      sourcesStatus.gmb.metrics = null;
    } else {
      const tok = await getGoogleTokenForAnyGoogle("gmb", "gmb", {
        supabase,
        userId,
      });
      const accessToken = tok?.accessToken;

      // IMPORTANT: GMB metrics are tied to a *location* (establishment page), not the Google account.
      // We only fetch metrics once a location has been explicitly selected and saved.
      const loc = resourceId;

      if (accessToken && loc) {
        const end = dateWindow.end;
        const start = dateWindow.start;
        try {
          const preferredAccountName =
            String(asRecord(gmbRow["meta"])["account"] || "") || null;
          const recovered = await gmbFetchDailyMetricsNormalizedWithRecovery({
            accessToken,
            locationName: loc,
            start,
            end,
            preferredAccountName,
          });
          sourcesStatus.gmb.metrics = recovered.metrics;

          if (
            recovered.recovered &&
            recovered.locationName &&
            recovered.locationName !== loc
          ) {
            const nextMeta = {
              ...asRecord(gmbRow["meta"]),
              ...(recovered.accountName
                ? { account: recovered.accountName }
                : {}),
            };
            try {
              await supabase
                .from("integrations")
                .update({
                  resource_id: recovered.locationName,
                  resource_label: recovered.locationTitle,
                  meta: nextMeta,
                  updated_at: new Date().toISOString(),
                })
                .eq("user_id", userId)
                .eq("provider", "google")
                .eq("source", "gmb")
                .eq("product", "gmb");
            } catch {}

            try {
              const currentGmb = asRecord(asRecord(proSettings)["gmb"]);
              const mergedSettings = {
                ...proSettings,
                gmb: {
                  ...currentGmb,
                  accountName:
                    recovered.accountName || currentGmb["accountName"] || null,
                  locationName: recovered.locationName,
                  locationTitle:
                    recovered.locationTitle ||
                    currentGmb["locationTitle"] ||
                    null,
                  resource_id: recovered.locationName,
                  resource_label:
                    recovered.locationTitle ||
                    currentGmb["resource_label"] ||
                    null,
                },
              };
              await supabase
                .from("pro_tools_configs")
                .upsert(
                  { user_id: userId, settings: mergedSettings },
                  { onConflict: "user_id" },
                );
            } catch {}
          }
        } catch (e) {
          sourcesStatus.gmb.metrics = {
            error: getSimpleFrenchErrorMessage(
              e,
              "Impossible de récupérer les statistiques Google Business pour le moment.",
            ),
            location: loc,
          };
        }
      } else {
        sourcesStatus.gmb.metrics = null;
      }
    }
  } catch {}

  const generatedAt = new Date().toISOString();

  const payload = await stabilizeOverviewPayload({
    supabase,
    userId,
    days,
    includeRaw,
    includeAll,
    payload: {
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
          label:
            channelStates.facebook.resource_label ||
            String(
              asRecord(
                latestIntegrationAny("facebook", "facebook", "facebook"),
              )["resource_label"] || "",
            ) ||
            null,
          url:
            channelStates.facebook.page_url ||
            String(
              asRecord(
                asRecord(
                  latestIntegrationAny("facebook", "facebook", "facebook"),
                )["meta"],
              )["page_url"] || "",
            ) ||
            null,
        },
        instagram: {
          label: channelStates.instagram.username
            ? `@${channelStates.instagram.username}`
            : String(
                asRecord(
                  latestIntegrationAny("instagram", "instagram", "instagram"),
                )["resource_label"] || "",
              ) || null,
          url:
            channelStates.instagram.profile_url ||
            String(
              asRecord(
                asRecord(
                  latestIntegrationAny("instagram", "instagram", "instagram"),
                )["meta"],
              )["profile_url"] || "",
            ) ||
            null,
        },
        linkedin: {
          label:
            channelStates.linkedin.organization_name ||
            channelStates.linkedin.display_name ||
            null,
          url: channelStates.linkedin.organization_id
            ? channelStates.linkedin.organization_url
            : channelStates.linkedin.profile_url,
        },
        tiktok: {
          label: channelStates.tiktok.username || null,
          url: channelStates.tiktok.profile_url || null,
        },
        youtube_shorts: {
          label: channelStates.youtube_shorts.channel_name || null,
          url: channelStates.youtube_shorts.channel_url || null,
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
      business: {
        sectorCategory: decodedBusinessSector.sectorCategory || null,
        profession: decodedBusinessSector.profession || null,
      },
      sources: sourcesStatus,
      inrcyActivity: inrcyPublishedActivityStats,
      note: "Sources connectées: site iNrCy (GA4/GSC), site web (GA4/GSC), GMB, Facebook, Instagram, LinkedIn, TikTok.",
      meta: {
        generatedAt,
        snapshotDate: dateWindow.snapshotDate,
        live: dateWindow.live,
      },
    },
  });

  // cache write (best-effort)
  try {
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    await supabase.from("stats_cache").upsert(
      {
        user_id: userId,
        source: "overview",
        range_key: rangeKey,
        payload,
        expires_at: expiresAt,
      },
      { onConflict: "user_id,source,range_key" },
    );
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

  return payload as OverviewPayload;
}
