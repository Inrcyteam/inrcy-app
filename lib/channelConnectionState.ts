import { asRecord, asString } from "@/lib/tsSafe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hasActiveInrcySite } from "@/lib/inrcySite";

type JsonRecord = Record<string, unknown>;

type IntegrationLite = {
  provider?: string | null;
  source?: string | null;
  product?: string | null;
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
    resource_id: string | null;
    resource_label: string | null;
    email: string | null;
  };
  facebook: {
    accountConnected: boolean;
    pageConnected: boolean;
    connected: boolean;
    expired: boolean;
    resource_id: string | null;
    resource_label: string | null;
    user_email: string | null;
    page_url: string | null;
  };
  instagram: {
    accountConnected: boolean;
    connected: boolean;
    expired: boolean;
    resource_id: string | null;
    username: string | null;
    profile_url: string | null;
  };
  linkedin: {
    accountConnected: boolean;
    connected: boolean;
    expired: boolean;
    resource_id: string | null;
    display_name: string | null;
    profile_url: string | null;
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
          .select("provider,source,product,status,resource_id,resource_label,display_name,email_address,expires_at,access_token_enc,refresh_token_enc,meta,updated_at,created_at")
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
  const fbPageUrl = asString(asRecord(fb.meta).page_url) || asString(fbSettings.url) || null;
  const fbPageConnected = Boolean((fbAccountConnected && fbResourceId) || fbSettings.pageConnected);

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

  const li = latestIntegration(rows, "linkedin", "linkedin", "linkedin");
  const liSettings = asRecord(settings.linkedin);
  const liExpired = isExpired(li.expires_at);
  const liStatus = asString(li.status);
  const liHasToken = hasTruthyString(li.access_token_enc);
  const liMeta = asRecord(li.meta);
  const liConnected = Boolean(((liStatus === "connected" || liStatus === "account_connected") && !liExpired && liHasToken) || liSettings.accountConnected || liSettings.connected);

  const gmb = latestIntegration(rows, "google", "gmb", "gmb");
  const gmbSettings = asRecord(settings.gmb);
  const gmbExpired = isExpired(gmb.expires_at);
  const gmbStatus = asString(gmb.status);
  const gmbHasToken = hasTruthyString(gmb.access_token_enc);
  const gmbAccountConnected = Boolean(((gmbStatus === "connected" || gmbStatus === "account_connected") && !gmbExpired && gmbHasToken) || gmbSettings.connected || gmbSettings.accountEmail);
  const gmbResourceId = asString(gmb.resource_id) || asString(gmbSettings.locationName) || null;
  const gmbResourceLabel = asString(gmb.resource_label) || asString(gmbSettings.locationTitle) || null;
  const gmbConfigured = Boolean((gmbAccountConnected && gmbResourceId) || (gmbSettings.connected && (gmbSettings.locationName || gmbSettings.locationTitle)));

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
      resource_id: gmbResourceId,
      resource_label: gmbResourceLabel,
      email: asString(gmb.email_address) || asString(gmbSettings.accountEmail) || null,
    },
    facebook: {
      accountConnected: fbAccountConnected,
      pageConnected: fbPageConnected,
      connected: fbPageConnected,
      expired: fbExpired,
      resource_id: fbResourceId,
      resource_label: fbResourceLabel,
      user_email: asString(fb.email_address) || asString(fbSettings.userEmail) || null,
      page_url: fbPageUrl,
    },
    instagram: {
      accountConnected: igAccountConnected,
      connected: igConnected,
      expired: igExpired,
      resource_id: igResourceId,
      username: igUsername,
      profile_url: igProfileUrl,
    },
    linkedin: {
      accountConnected: liConnected,
      connected: liConnected,
      expired: liExpired,
      resource_id: asString(li.resource_id) || null,
      display_name: asString(li.resource_label) || asString(li.display_name) || asString(liSettings.displayName) || null,
      profile_url: asString(liMeta.profile_url) || asString(liMeta.profile) || asString(liSettings.url) || null,
    },
  };
}
