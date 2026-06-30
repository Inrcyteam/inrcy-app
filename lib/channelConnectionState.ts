import { asRecord, asString } from "@/lib/tsSafe";
import { getConnectionDisplayStatus, mailConnectionKind, type ConnectionDisplayStatus } from "@/lib/connectionVersions";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hasActiveInrcySite } from "@/lib/inrcySite";
import { normalizeTiktokSettings } from "@/lib/tiktokSettings";
import { applyYoutubeShortsIntegrationState } from "@/lib/youtubeShortsOAuth";

type JsonRecord = Record<string, unknown>;

type IntegrationLite = {
  provider?: string | null;
  source?: string | null;
  product?: string | null;
  category?: string | null;
  account_email?: string | null;
  settings?: unknown;
  status?: string | null;
  resource_id?: string | null;
  resource_label?: string | null;
  display_name?: string | null;
  email_address?: string | null;
  expires_at?: string | null;
  access_token_enc?: string | null;
  refresh_token_enc?: string | null;
  meta?: unknown;
  updated_at?: string | null;
  created_at?: string | null;
};

export type ChannelStates = {
  site_inrcy: {
    connected: boolean;
    statsConnected: boolean;
    score: number;
    url: string | null;
    ga4: boolean;
    gsc: boolean;
  };
  site_web: {
    connected: boolean;
    statsConnected: boolean;
    score: number;
    url: string | null;
    ga4: boolean;
    gsc: boolean;
  };
  gmb: {
    accountConnected: boolean;
    configured: boolean;
    connected: boolean;
    expired: boolean;
    requiresUpdate: boolean;
    connection_status: ConnectionDisplayStatus;
    resource_id: string | null;
    resource_label: string | null;
    email: string | null;
    url: string | null;
  };
  facebook: {
    accountConnected: boolean;
    pageConnected: boolean;
    connected: boolean;
    expired: boolean;
    requiresUpdate: boolean;
    connection_status: ConnectionDisplayStatus;
    resource_id: string | null;
    resource_label: string | null;
    user_email: string | null;
    page_url: string | null;
  };
  instagram: {
    accountConnected: boolean;
    connected: boolean;
    expired: boolean;
    requiresUpdate: boolean;
    connection_status: ConnectionDisplayStatus;
    resource_id: string | null;
    username: string | null;
    profile_url: string | null;
  };
  linkedin: {
    accountConnected: boolean;
    connected: boolean;
    expired: boolean;
    requiresUpdate: boolean;
    connection_status: ConnectionDisplayStatus;
    resource_id: string | null;
    display_name: string | null;
    profile_url: string | null;
    organization_id: string | null;
    organization_name: string | null;
    organization_url: string | null;
  };
  mails: {
    accountConnected: boolean;
    connected: boolean;
    connectedCount: number;
    maxAccounts: number;
    requiresUpdate: boolean;
    connection_status: ConnectionDisplayStatus;
  };
  tiktok: {
    accountConnected: boolean;
    connected: boolean;
    expired: boolean;
    requiresUpdate: boolean;
    connection_status: ConnectionDisplayStatus;
    resource_id: string | null;
    username: string | null;
    profile_url: string | null;
  };
  youtube_shorts: {
    accountConnected: boolean;
    connected: boolean;
    expired: boolean;
    requiresUpdate: boolean;
    connection_status: ConnectionDisplayStatus;
    resource_id: string | null;
    channel_name: string | null;
    channel_url: string | null;
  };
  pinterest: {
    accountConnected: boolean;
    connected: boolean;
    expired: boolean;
    requiresUpdate: boolean;
    connection_status: ConnectionDisplayStatus;
    resource_id: string | null;
    username: string | null;
    profile_url: string | null;
    default_board_id: string | null;
    default_board_name: string | null;
  };
  trustpilot: {
    accountConnected: boolean;
    connected: boolean;
    expired: boolean;
    requiresUpdate: boolean;
    connection_status: ConnectionDisplayStatus;
    business_unit_id: string | null;
    business_name: string | null;
    profile_url: string | null;
    review_invite_url: string | null;
  };
};

function isExpired(expiresAt: unknown, skewSeconds = 60) {
  const iso = asString(expiresAt);
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return t <= Date.now() + skewSeconds * 1000;
}

function latestIntegration(rows: IntegrationLite[], provider: string, source: string, product: string): JsonRecord {
  const filtered = rows.filter((row) => row.provider === provider && row.source === source && row.product === product);
  filtered.sort((a, b) => {
    const at = new Date(String(a.updated_at || a.created_at || 0)).getTime();
    const bt = new Date(String(b.updated_at || b.created_at || 0)).getTime();
    return bt - at;
  });
  return asRecord(filtered[0]);
}

function hasTruthyString(v: unknown) {
  return !!(asString(v) || "").trim();
}

function buildGoogleMapsSearchUrl(label: string | null) {
  const clean = (label || "").trim();
  return clean ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clean)}` : null;
}

function buildFacebookPageUrl(resourceId: string | null) {
  const clean = (resourceId || "").trim();
  return clean ? `https://www.facebook.com/${encodeURIComponent(clean)}` : null;
}

function hasGoogleSetting(settingsNode: unknown, product: "ga4" | "gsc") {
  const node = asRecord(settingsNode);
  if (product === "ga4") return hasTruthyString(asRecord(node.ga4).property_id) || hasTruthyString(asRecord(node.ga4).measurement_id);
  return hasTruthyString(asRecord(node.gsc).property);
}

function isConnectedGoogleStat(rows: IntegrationLite[], source: "site_inrcy" | "site_web", product: "ga4" | "gsc", fallbackSettingsNode?: unknown) {
  const settingsConnected = hasGoogleSetting(fallbackSettingsNode, product);
  const row = latestIntegration(rows, "google", source, product);
  const status = (asString(asRecord(row).status) || "").toLowerCase();

  // For GA4/GSC, the persisted property selection is the business truth.
  // Access tokens are short-lived and are refreshed on demand in lib/googleStats.ts.
  // So an expired access token must never make the UI or iNrStats look disconnected.
  // Only an explicit "disconnected" status should turn the connection off.
  if (status === "disconnected") return false;

  // If the integration row is connected, trust it as the official state.
  if (status === "connected" || status === "account_connected") return true;

  // If the row is missing or has no clear status yet, keep the persisted setup visible.
  return settingsConnected;
}

export async function getChannelConnectionStates(
  supabase: any,
  userId: string,
  preload?: {
    profile?: unknown;
    inrcySiteConfig?: unknown;
    proToolsConfig?: unknown;
    integrations?: unknown[];
  }
): Promise<ChannelStates> {
  const usePreload = Boolean(preload);
  const [profileRes, inrcyCfgRes, proCfgRes, integrationsRes] = usePreload
    ? await Promise.all([
        Promise.resolve({ data: preload?.profile ?? null }),
        Promise.resolve({ data: preload?.inrcySiteConfig ?? null }),
        Promise.resolve({ data: preload?.proToolsConfig ?? null }),
        Promise.resolve({ data: preload?.integrations ?? [] }),
      ])
    : await Promise.all([
        supabase.from("profiles").select("inrcy_site_ownership").eq("user_id", userId).maybeSingle(),
        supabase.from("inrcy_site_configs").select("site_url,settings").eq("user_id", userId).maybeSingle(),
        supabase.from("pro_tools_configs").select("settings").eq("user_id", userId).maybeSingle(),
        supabaseAdmin
          .from("integrations")
          .select("provider,source,product,category,account_email,settings,status,resource_id,resource_label,display_name,email_address,expires_at,access_token_enc,refresh_token_enc,meta,updated_at,created_at")
          .eq("user_id", userId),
      ]);

  const profile = asRecord((profileRes as { data?: unknown }).data);
  const inrcyCfg = asRecord((inrcyCfgRes as { data?: unknown }).data);
  const inrcyCfgSettings = asRecord(inrcyCfg.settings);
  const proCfg = asRecord((proCfgRes as { data?: unknown }).data);
  const settings = asRecord(proCfg.settings);
  const rowsRaw = (integrationsRes as { data?: unknown }).data;
  const rows = Array.isArray(rowsRaw) ? (rowsRaw as IntegrationLite[]) : [];

  const ownership = asString(profile.inrcy_site_ownership) || "none";
  const inrcyHasSite = hasActiveInrcySite(ownership);
  const inrcyUrl = (asString(inrcyCfg?.site_url) || "").trim();
  const siteWeb = asRecord(settings.site_web);
  const siteWebUrl = (asString(siteWeb.url) || "").trim();

  const inrcyGa4 = isConnectedGoogleStat(rows, "site_inrcy", "ga4", inrcyCfgSettings);
  const inrcyGsc = isConnectedGoogleStat(rows, "site_inrcy", "gsc", inrcyCfgSettings);
  const webGa4 = isConnectedGoogleStat(rows, "site_web", "ga4", siteWeb);
  const webGsc = isConnectedGoogleStat(rows, "site_web", "gsc", siteWeb);
  const inrcyScore = (inrcyHasSite && !!inrcyUrl ? 1 : 0) + (inrcyGa4 ? 1 : 0) + (inrcyGsc ? 1 : 0);
  const webScore = (!!siteWebUrl ? 1 : 0) + (webGa4 ? 1 : 0) + (webGsc ? 1 : 0);

  const fb = latestIntegration(rows, "facebook", "facebook", "facebook");
  const fbSettings = asRecord(settings.facebook);
  const fbMeta = asRecord(fb.meta);
  const fbHasSelectedPageToken = hasTruthyString(fbMeta.selected) || hasTruthyString(fb.resource_id);
  const fbExpired = isExpired(fb.expires_at) && !fbHasSelectedPageToken;
  const fbStatus = asString(fb.status);
  const fbHasToken = hasTruthyString(fb.access_token_enc) || hasTruthyString(fbMeta.standard_user_access_token_enc) || hasTruthyString(fbMeta.business_user_access_token_enc) || hasTruthyString(fbMeta.user_access_token_enc);
  const fbAccountConnected = Boolean(((fbStatus === "account_connected" || fbStatus === "connected") && !fbExpired && fbHasToken) || fbSettings.accountConnected);
  const fbResourceId = asString(fb.resource_id) || asString(fbSettings.pageId) || null;
  const fbResourceLabel = asString(fb.resource_label) || asString(fbSettings.pageName) || null;
  const fbPageUrl = asString(asRecord(fb.meta).page_url) || asString(fbSettings.url) || buildFacebookPageUrl(fbResourceId);
  const fbPageConnected = Boolean((fbAccountConnected && fbResourceId) || fbSettings.pageConnected);
  const fbConnectionStatus = getConnectionDisplayStatus(fbPageConnected, "channel:facebook", fbMeta);
  const fbRequiresUpdate = fbConnectionStatus === "needs_update";

  const ig = latestIntegration(rows, "instagram", "instagram", "instagram");
  const igSettings = asRecord(settings.instagram);
  const igMeta = asRecord(ig.meta);
  const igHasSelectedProfileToken = hasTruthyString(igMeta.page_id) || hasTruthyString(ig.resource_id);
  const igExpired = isExpired(ig.expires_at) && !igHasSelectedProfileToken;
  const igStatus = asString(ig.status);
  const igHasToken = hasTruthyString(ig.access_token_enc);
  const igAccountConnected = Boolean(((igStatus === "account_connected" || igStatus === "connected") && !igExpired && igHasToken) || igSettings.accountConnected);
  const igResourceId = asString(ig.resource_id) || asString(igSettings.igId) || asString(igSettings.pageId) || null;
  const igUsername = asString(ig.resource_label) || asString(igSettings.username) || null;
  const igProfileUrl = asString(igSettings.url) || (igUsername ? `https://www.instagram.com/${igUsername}/` : null);
  const igConnected = Boolean(igAccountConnected && igResourceId);
  const igConnectionStatus = getConnectionDisplayStatus(igConnected, "channel:instagram", igMeta);
  const igRequiresUpdate = igConnectionStatus === "needs_update";

  const li = latestIntegration(rows, "linkedin", "linkedin", "linkedin");
  const liSettings = asRecord(settings.linkedin);
  const liHasToken = hasTruthyString(li.access_token_enc);
  const liHasRefreshToken = hasTruthyString(li.refresh_token_enc);
  const liHasReusableAuth = liHasToken || liHasRefreshToken;
  const liExpired = isExpired(li.expires_at) && !liHasRefreshToken;
  const liStatus = asString(li.status);
  const liMeta = asRecord(li.meta);
  const liConnected = Boolean(((liStatus === "connected" || liStatus === "account_connected") && liHasReusableAuth && !liExpired) || liSettings.accountConnected || liSettings.connected);
  const liConnectionStatus = getConnectionDisplayStatus(liConnected, "channel:linkedin", liMeta);
  const liRequiresUpdate = liConnectionStatus === "needs_update";
  const liActiveOrganizationId = asString(liMeta.org_id) || asString(liSettings.orgId) || "";
  const liProfileUrl = asString(liMeta.profile_url) || asString(liMeta.profile) || asString(liSettings.profileUrl) || (!liActiveOrganizationId ? asString(liSettings.url) : "") || null;
  const liOrganizationUrl = asString(liMeta.org_url) || asString(liSettings.orgUrl) || (liActiveOrganizationId ? asString(liSettings.url) : "") || null;

  const tk = latestIntegration(rows, "tiktok", "tiktok", "tiktok");
  const tiktokSettings = normalizeTiktokSettings(settings.tiktok);
  const tkHasToken = hasTruthyString(tk.access_token_enc);
  const tkHasRefreshToken = hasTruthyString(tk.refresh_token_enc);
  const tkHasReusableAuth = tkHasToken || tkHasRefreshToken;
  const tkExpired = isExpired(tk.expires_at) && !tkHasRefreshToken;
  const tkStatus = asString(tk.status);
  const tkMeta = asRecord(tk.meta);
  // TikTok est connecté uniquement si une intégration OAuth réelle est active.
  // Les anciens réglages/mock ou un simple lien public ne doivent jamais rendre la bulle verte.
  const tiktokConnected = Boolean((tkStatus === "connected" || tkStatus === "account_connected") && tkHasReusableAuth && !tkExpired);
  const tiktokNeedsReconnect = Boolean(
    tkMeta["needs_reconnect"] === true ||
      tkMeta["tiktok_needs_reconnect"] === true ||
      asString(tkMeta["tiktok_stats_needs_reconnect_at"]) ||
      asString(tkMeta["tiktok_token_invalid_at"]),
  );
  const tiktokConnectionStatus = tiktokNeedsReconnect && tiktokConnected
    ? "needs_update"
    : getConnectionDisplayStatus(tiktokConnected, "channel:tiktok", tkMeta);
  const tiktokRequiresUpdate = tiktokConnectionStatus === "needs_update";
  const tiktokUsername = tiktokConnected ? (asString(tkMeta.username) || asString(tk.resource_label) || tiktokSettings.username || null) : null;
  const tiktokProfileUrl = tiktokConnected ? (asString(tkMeta.profile_url) || tiktokSettings.profileUrl || null) : null;

  const yt = latestIntegration(rows, "youtube", "youtube_shorts", "youtube_shorts");
  const ytMeta = asRecord(yt.meta);
  const youtubeShorts = applyYoutubeShortsIntegrationState(settings.youtube_shorts, yt);
  const youtubeShortsHasRefreshToken = hasTruthyString(yt.refresh_token_enc);
  const youtubeShortsExpired = isExpired(yt.expires_at) && !youtubeShortsHasRefreshToken;
  const youtubeShortsConnectionStatus = getConnectionDisplayStatus(youtubeShorts.connected, "channel:youtube_shorts", ytMeta);
  const youtubeShortsRequiresUpdate = youtubeShortsConnectionStatus === "needs_update";

  const mailRows = rows.filter((row) => row.category === "mail");
  const connectedMailRows = mailRows.filter((row) => {
    const status = (asString(row.status) || "").toLowerCase();
    const isConnected = status === "connected";
    const kind = mailConnectionKind(row.provider);
    const connectionStatus = kind
      ? getConnectionDisplayStatus(isConnected, kind, asRecord(row.settings))
      : isConnected
        ? "connected"
        : "disconnected";
    return isConnected && connectionStatus !== "needs_update";
  });
  const mailConnectedCount = Math.max(0, Math.min(4, connectedMailRows.length));
  const mailsConnected = mailConnectedCount > 0;

  const pinterest = latestIntegration(rows, "pinterest", "pinterest", "pinterest");
  const pinterestMeta = asRecord(pinterest.meta);
  const pinterestSettings = asRecord(settings.pinterest);
  const pinterestHasToken = hasTruthyString(pinterest.access_token_enc) || hasTruthyString(pinterest.refresh_token_enc);
  const pinterestExpired = isExpired(pinterest.expires_at) && !hasTruthyString(pinterest.refresh_token_enc);
  const pinterestStatus = asString(pinterest.status);
  const pinterestOAuthConnected = Boolean((pinterestStatus === "connected" || pinterestStatus === "account_connected") && pinterestHasToken && !pinterestExpired);
  const pinterestProfileUrl = asString(pinterestMeta.profile_url) || asString(pinterestSettings.profileUrl) || asString(pinterestSettings.url) || null;
  const pinterestDefaultBoardId = asString(pinterestMeta.default_board_id) || asString(pinterestSettings.defaultBoardId) || asString(pinterestSettings.boardId) || null;
  const pinterestDefaultBoardName = asString(pinterestMeta.default_board_name) || asString(pinterestSettings.defaultBoardName) || asString(pinterestSettings.boardName) || null;
  const pinterestUsername = asString(pinterestMeta.username) || asString(pinterest.resource_label) || asString(pinterestSettings.username) || asString(pinterestSettings.accountName) || null;
  const pinterestConnected = Boolean(pinterestOAuthConnected || pinterestSettings.connected || pinterestProfileUrl || pinterestDefaultBoardId);

  const trustpilot = latestIntegration(rows, "trustpilot", "trustpilot", "trustpilot");
  const trustpilotMeta = asRecord(trustpilot.meta);
  const trustpilotSettings = asRecord(settings.trustpilot);
  const trustpilotHasToken = hasTruthyString(trustpilot.access_token_enc) || hasTruthyString(trustpilot.refresh_token_enc);
  const trustpilotHasRefreshToken = hasTruthyString(trustpilot.refresh_token_enc);
  const trustpilotExpired = isExpired(trustpilot.expires_at) && !trustpilotHasRefreshToken;
  const trustpilotStatus = asString(trustpilot.status);
  const trustpilotOAuthConnected = Boolean((trustpilotStatus === "connected" || trustpilotStatus === "account_connected") && trustpilotHasToken && !trustpilotExpired);
  const trustpilotProfileUrl =
    asString(trustpilotMeta.profile_url) || asString(trustpilotSettings.profileUrl) || asString(trustpilotSettings.url) || null;
  const trustpilotBusinessUnitId =
    asString(trustpilot.resource_id) || asString(trustpilotMeta.business_unit_id) || asString(trustpilotSettings.businessUnitId) || asString(trustpilotSettings.business_unit_id) || null;
  const trustpilotBusinessName =
    asString(trustpilot.resource_label) || asString(trustpilotMeta.business_name) || asString(trustpilotSettings.businessName) || asString(trustpilotSettings.name) || null;
  const trustpilotReviewInviteUrl =
    asString(trustpilotMeta.review_invite_url) || asString(trustpilotSettings.reviewInviteUrl) || asString(trustpilotSettings.inviteUrl) || null;
  const trustpilotConnected = Boolean(trustpilotOAuthConnected || trustpilotSettings.connected || trustpilotProfileUrl || trustpilotBusinessUnitId || trustpilotReviewInviteUrl);
  const trustpilotConnectionStatus = getConnectionDisplayStatus(trustpilotConnected, "channel:trustpilot", trustpilotMeta);
  const trustpilotRequiresUpdate = trustpilotConnectionStatus === "needs_update";

  const gmb = latestIntegration(rows, "google", "gmb", "gmb");
  const gmbSettings = asRecord(settings.gmb);
  const gmbMeta = asRecord(gmb.meta);
  const gmbStatus = asString(gmb.status);
  const gmbHasToken = hasTruthyString(gmb.access_token_enc);
  const gmbHasRefreshToken = hasTruthyString(gmb.refresh_token_enc);
  const gmbHasReusableAuth = gmbHasToken || gmbHasRefreshToken;
  const gmbExpired = isExpired(gmb.expires_at) && !gmbHasRefreshToken;
  const gmbAccountConnected = Boolean(
    (((gmbStatus === "connected" || gmbStatus === "account_connected") && gmbHasReusableAuth && !gmbExpired) || gmbSettings.connected || gmbSettings.accountEmail)
  );
  const gmbResourceId = asString(gmb.resource_id) || asString(gmbSettings.locationName) || null;
  const gmbResourceLabel = asString(gmb.resource_label) || asString(gmbSettings.locationTitle) || null;
  const gmbUrl = asString(gmbMeta.url) || asString(gmbSettings.url) || buildGoogleMapsSearchUrl(gmbResourceLabel || gmbResourceId);
  const gmbConfigured = Boolean((gmbAccountConnected && gmbResourceId) || (gmbSettings.connected && (gmbSettings.locationName || gmbSettings.locationTitle)));
  const gmbConnectionStatus = getConnectionDisplayStatus(gmbConfigured, "channel:gmb", gmbMeta);
  const gmbRequiresUpdate = gmbConnectionStatus === "needs_update";

  return {
    site_inrcy: {
      connected: inrcyHasSite && !!inrcyUrl,
      statsConnected: inrcyGa4 || inrcyGsc,
      score: inrcyScore,
      url: inrcyUrl || null,
      ga4: inrcyHasSite && inrcyGa4,
      gsc: inrcyHasSite && inrcyGsc,
    },
    site_web: {
      connected: !!siteWebUrl,
      statsConnected: webGa4 || webGsc,
      score: webScore,
      url: siteWebUrl || null,
      ga4: webGa4,
      gsc: webGsc,
    },
    gmb: {
      accountConnected: gmbAccountConnected,
      configured: gmbConfigured,
      connected: gmbConfigured,
      expired: gmbExpired,
      requiresUpdate: gmbRequiresUpdate,
      connection_status: gmbConnectionStatus,
      resource_id: gmbResourceId,
      resource_label: gmbResourceLabel,
      email: asString(gmb.email_address) || asString(gmbSettings.accountEmail) || null,
      url: gmbUrl,
    },
    facebook: {
      accountConnected: fbAccountConnected,
      pageConnected: fbPageConnected,
      connected: fbPageConnected,
      expired: fbExpired,
      requiresUpdate: fbRequiresUpdate,
      connection_status: fbConnectionStatus,
      resource_id: fbResourceId,
      resource_label: fbResourceLabel,
      user_email: asString(fb.email_address) || asString(fbSettings.userEmail) || null,
      page_url: fbPageUrl,
    },
    instagram: {
      accountConnected: igAccountConnected,
      connected: igConnected,
      expired: igExpired,
      requiresUpdate: igRequiresUpdate,
      connection_status: igConnectionStatus,
      resource_id: igResourceId,
      username: igUsername,
      profile_url: igProfileUrl,
    },
    linkedin: {
      accountConnected: liConnected,
      connected: liConnected,
      expired: liExpired,
      requiresUpdate: liRequiresUpdate,
      connection_status: liConnectionStatus,
      resource_id: asString(li.resource_id) || null,
      display_name: asString(liMeta.profile_display_name) || asString(li.display_name) || asString(liSettings.displayName) || asString(li.resource_label) || null,
      profile_url: liProfileUrl,
      organization_id: asString(liMeta.org_id) || asString(liSettings.orgId) || null,
      organization_name: asString(liMeta.org_name) || asString(liSettings.orgName) || null,
      organization_url: liOrganizationUrl,
    },
    mails: {
      accountConnected: mailsConnected,
      connected: mailsConnected,
      connectedCount: mailConnectedCount,
      maxAccounts: 4,
      requiresUpdate: false,
      connection_status: mailsConnected ? "connected" : "disconnected",
    },
    tiktok: {
      accountConnected: tiktokConnected,
      connected: tiktokConnected,
      expired: tkExpired,
      requiresUpdate: tiktokRequiresUpdate,
      connection_status: tiktokConnectionStatus,
      resource_id: tiktokConnected ? (asString(tk.resource_id) || tiktokUsername) : null,
      username: tiktokConnected ? tiktokUsername : null,
      profile_url: tiktokConnected ? tiktokProfileUrl : null,
    },
    youtube_shorts: {
      accountConnected: youtubeShorts.connected,
      connected: youtubeShorts.connected,
      expired: youtubeShortsExpired,
      requiresUpdate: youtubeShortsRequiresUpdate,
      connection_status: youtubeShortsConnectionStatus,
      resource_id: youtubeShorts.connected ? (youtubeShorts.channelId || youtubeShorts.channelHandle || youtubeShorts.channelUrl || null) : null,
      channel_name: youtubeShorts.connected ? (youtubeShorts.channelName || youtubeShorts.channelHandle || youtubeShorts.channelUrl || null) : null,
      channel_url: youtubeShorts.connected ? (youtubeShorts.channelUrl || null) : null,
    },
    pinterest: {
      accountConnected: pinterestConnected,
      connected: pinterestConnected,
      expired: pinterestExpired,
      requiresUpdate: false,
      connection_status: pinterestConnected ? "connected" : "disconnected",
      resource_id: pinterestConnected ? (asString(pinterest.resource_id) || pinterestDefaultBoardId || pinterestUsername || pinterestProfileUrl || null) : null,
      username: pinterestConnected ? pinterestUsername : null,
      profile_url: pinterestConnected ? pinterestProfileUrl : null,
      default_board_id: pinterestConnected ? pinterestDefaultBoardId : null,
      default_board_name: pinterestConnected ? pinterestDefaultBoardName : null,
    },
    trustpilot: {
      accountConnected: trustpilotOAuthConnected || trustpilotConnected,
      connected: trustpilotConnected,
      expired: trustpilotExpired,
      requiresUpdate: trustpilotRequiresUpdate,
      connection_status: trustpilotConnectionStatus,
      business_unit_id: trustpilotConnected ? trustpilotBusinessUnitId : null,
      business_name: trustpilotConnected ? trustpilotBusinessName : null,
      profile_url: trustpilotConnected ? trustpilotProfileUrl : null,
      review_invite_url: trustpilotConnected ? trustpilotReviewInviteUrl : null,
    },
  };
}
