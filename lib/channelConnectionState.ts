import { asRecord, asString } from "@/lib/tsSafe";

type JsonRecord = Record<string, unknown>;

type IntegrationLite = {
  provider?: string | null;
  source?: string | null;
  product?: string | null;
  status?: string | null;
  resource_id?: string | null;
  resource_label?: string | null;
  resource_url?: string | null;
  display_name?: string | null;
  email_address?: string | null;
  expires_at?: string | null;
  access_token_enc?: string | null;
  meta?: unknown;
  updated_at?: string | null;
  created_at?: string | null;
};

export type ChannelStates = {
  site_inrcy: {
    connected: boolean;
    url: string | null;
    ga4: boolean;
    gsc: boolean;
  };
  site_web: {
    connected: boolean;
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

function isConnectedGoogleStat(rows: IntegrationLite[], source: "site_inrcy" | "site_web", product: "ga4" | "gsc") {
  const row = latestIntegration(rows, "google", source, product);
  return asString(row.status) === "connected" && !isExpired(row.expires_at);
}

export async function getChannelConnectionStates(supabase: any, userId: string): Promise<ChannelStates> {
  const [profileRes, inrcyCfgRes, proCfgRes, integrationsRes] = await Promise.all([
    supabase.from("profiles").select("inrcy_site_ownership,inrcy_site_url").eq("user_id", userId).maybeSingle(),
    supabase.from("inrcy_site_configs").select("site_url").eq("user_id", userId).maybeSingle(),
    supabase.from("pro_tools_configs").select("settings").eq("user_id", userId).maybeSingle(),
    supabase
      .from("integrations")
      .select("provider,source,product,status,resource_id,resource_label,resource_url,display_name,email_address,expires_at,access_token_enc,meta,updated_at,created_at")
      .eq("user_id", userId),
  ]);

  const profile = asRecord(profileRes.data);
  const inrcyCfg = asRecord(inrcyCfgRes.data);
  const proCfg = asRecord(proCfgRes.data);
  const settings = asRecord(proCfg.settings);
  const rows = Array.isArray(integrationsRes.data) ? (integrationsRes.data as IntegrationLite[]) : [];

  const ownership = asString(profile.inrcy_site_ownership) || "none";
  const inrcyUrl = (asString(profile.inrcy_site_url) || asString(inrcyCfg.site_url) || "").trim();
  const siteWeb = asRecord(settings.site_web);
  const siteWebUrl = (asString(siteWeb.url) || "").trim();

  const inrcyGa4 = isConnectedGoogleStat(rows, "site_inrcy", "ga4");
  const inrcyGsc = isConnectedGoogleStat(rows, "site_inrcy", "gsc");
  const webGa4 = isConnectedGoogleStat(rows, "site_web", "ga4");
  const webGsc = isConnectedGoogleStat(rows, "site_web", "gsc");

  const fb = latestIntegration(rows, "facebook", "facebook", "facebook");
  const fbExpired = isExpired(fb.expires_at);
  const fbStatus = asString(fb.status);
  const fbAccountConnected = (fbStatus === "account_connected" || fbStatus === "connected") && !fbExpired;
  const fbPageConnected = fbStatus === "connected" && !!asString(fb.resource_id) && !fbExpired;

  const ig = latestIntegration(rows, "instagram", "instagram", "instagram");
  const igExpired = isExpired(ig.expires_at);
  const igStatus = asString(ig.status);
  const igAccountConnected = (igStatus === "account_connected" || igStatus === "connected") && !igExpired;
  const igConnected = igStatus === "connected" && !!asString(ig.resource_id) && !igExpired;
  const igUsername = asString(ig.resource_label) || null;

  const li = latestIntegration(rows, "linkedin", "linkedin", "linkedin");
  const liExpired = isExpired(li.expires_at);
  const liStatus = asString(li.status);
  const liConnected = liStatus === "connected" && !liExpired;
  const liMeta = asRecord(li.meta);

  const gmb = latestIntegration(rows, "google", "gmb", "gmb");
  const gmbExpired = isExpired(gmb.expires_at);
  const gmbStatus = asString(gmb.status);
  const gmbAccountConnected = gmbStatus === "connected" && !gmbExpired;
  const gmbConfigured = gmbAccountConnected && !!asString(gmb.resource_id);

  return {
    site_inrcy: {
      connected: ownership !== "none" && !!inrcyUrl && inrcyGa4 && inrcyGsc,
      url: inrcyUrl || null,
      ga4: ownership !== "none" && inrcyGa4,
      gsc: ownership !== "none" && inrcyGsc,
    },
    site_web: {
      connected: !!siteWebUrl && webGa4 && webGsc,
      url: siteWebUrl || null,
      ga4: webGa4,
      gsc: webGsc,
    },
    gmb: {
      accountConnected: gmbAccountConnected,
      configured: gmbConfigured,
      connected: gmbConfigured,
      expired: gmbExpired,
      resource_id: asString(gmb.resource_id) || null,
      resource_label: asString(gmb.resource_label) || null,
      email: asString(gmb.email_address) || null,
    },
    facebook: {
      accountConnected: fbAccountConnected,
      pageConnected: fbPageConnected,
      connected: fbPageConnected,
      expired: fbExpired,
      resource_id: asString(fb.resource_id) || null,
      resource_label: asString(fb.resource_label) || null,
      user_email: asString(fb.email_address) || null,
      page_url: asString(fb.resource_url) || null,
    },
    instagram: {
      accountConnected: igAccountConnected,
      connected: igConnected,
      expired: igExpired,
      resource_id: asString(ig.resource_id) || null,
      username: igUsername,
      profile_url: igUsername ? `https://www.instagram.com/${igUsername}/` : null,
    },
    linkedin: {
      accountConnected: liConnected,
      connected: liConnected,
      expired: liExpired,
      resource_id: asString(li.resource_id) || null,
      display_name: asString(li.resource_label) || asString(li.display_name) || null,
      profile_url: asString(liMeta.profile_url) || asString(liMeta.profile) || null,
    },
  };
}
