"use client";

import styles from "./dashboard.module.css";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from "react";
import SettingsDrawer from "./SettingsDrawer";
import HelpButton from "./_components/HelpButton";
import DashboardHelpModals from "./_components/DashboardHelpModals";
import DashboardHero from "./_components/DashboardHero";
import DashboardTopbar from "./_components/DashboardTopbar";
import DashboardChannelsSection from "./_components/DashboardChannelsSection";
import DashboardBoosterModalLayer from "./_components/DashboardBoosterModalLayer";
import DashboardSettingsDrawerContent from "./_components/DashboardSettingsDrawerContent";
import InrBadgePreviewModal from "./_components/InrBadgePreviewModal";
import { useDrawerMutationGuard } from "./_hooks/useDrawerMutationGuard";
import { useDashboardNotifications } from "./_hooks/useDashboardNotifications";
import { useReferralForm } from "./_hooks/useReferralForm";
import { useDashboardPanelRouting } from "./_hooks/useDashboardPanelRouting";
import { useDashboardCompletionChecks } from "./_hooks/useDashboardCompletionChecks";
import { useDashboardMenus } from "./_hooks/useDashboardMenus";
import { useFacebookChannel } from "./_hooks/channels/useFacebookChannel";
import { useInstagramChannel } from "./_hooks/channels/useInstagramChannel";
import { useLinkedinChannel } from "./_hooks/channels/useLinkedinChannel";
import { useGoogleBusinessChannel } from "./_hooks/channels/useGoogleBusinessChannel";
import { useSiteInrcyChannel } from "./_hooks/channels/useSiteInrcyChannel";
import { useSiteWebChannel } from "./_hooks/channels/useSiteWebChannel";
import { useTiktokChannel } from "./_hooks/channels/useTiktokChannel";

// ✅ IMPORTANT : même client que ta page login
import { createClient } from "@/lib/supabaseClient";
import { purgeAllBrowserAccountCaches, readAccountCacheValue, setActiveBrowserUserId, writeAccountCacheValue } from "@/lib/browserAccountCache";
import { expectedUiSnapshotDate, getLastChannelSyncAt, getOverviewSnapshotDate, hasFreshLocalGeneratorSnapshot, markChannelsSynced, mergeChannelBlockIntoCachedSnapshots, mergeGeneratorChannelBlockIntoCachedKpis, syncGeneratorOpportunitiesFromStatsSummary, readCachedChannelBlocks, readCachedChannelSyncAt, readCachedGeneratorChannelSyncAt, readCachedOppTotal, readGeneratorCache, readInrStatsPeriodSyncAt, statsCubeSessionKey, statsSummarySessionKey, type StatsWarmPeriod, readUiCacheValue, writeUiCacheValue } from "./dashboard.client-cache";
import { markDailyStatsRefreshBootstrapChecked, markServerCacheSyncChecked, runDailyStatsRefreshBootstrap, wasDailyStatsRefreshBootstrapCheckedRecently, wasServerCacheSyncCheckedRecently, type DailyStatsRefreshBootstrapResponse } from "@/lib/dailyStatsRefreshClient";
import { buildBubbleAccessMap, createDefaultBubbleAccessMap, isBubbleEnabled, type AppBubbleAccessMap } from "@/lib/bubbleAccess";
import { computeInertiaSnapshot } from "@/lib/loyalty/inertia";
import { PROFILE_VERSION_EVENT, type ProfileVersionChangeDetail } from "@/lib/profileVersioning";
import { resolveProfileLogoUrl } from "@/lib/profileLogo";
import { getDrawerTitle, isDrawerPanel } from "./dashboard.utils";
import { inferChannelsFromRealtimePayload, inferChannelsFromSearchParams } from "./dashboard.shared";
import type { ActusFont, ActusLayout, ActusTheme, GoogleProduct, GoogleSource, ModuleStatus, Ownership } from "./dashboard.types";
import { DASHBOARD_CHANNEL_KEYS, type DashboardChannelKey } from "@/lib/dashboardChannels";
import { buildFluxBubbleItems } from "./dashboard.flux-bubbles";
import { createInrBadgePublicUrl, type InrBadgeProfileSummary } from "@/lib/inrBadge";
import { buildDashboardPanelProps } from "./dashboard.panel-props";
import { createEmptyChannelBlock, createEmptyChannelBlocks, type InrstatsChannelBlock, type InrstatsChannelBlocksByChannel } from "@/lib/inrstats/channelBlocks";
import type { ConnectionDisplayStatus } from "@/lib/connectionVersions";


const useBrowserLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
const FORCED_SERVER_CACHE_CHECK_DEDUP_MS = 30_000;
const AUTO_DAILY_REFRESH_DEDUP_MS = 5 * 60_000;
const CHANNEL_REFRESH_DEDUP_MS = 30_000;
const GENERATOR_POWER_CACHE_KEY = "inrcy_generator_power_percent_v1";
const GENERATOR_ACTIVE_CACHE_KEY = "inrcy_generator_active_v1";
const SITE_BUBBLE_PROGRESS_CACHE_KEY = "inrcy_site_bubble_progress_v1";
const DASHBOARD_CHANNEL_STATE_CACHE_KEY = "inrcy_dashboard_channel_state_v1";
const BUBBLE_ACCESS_CACHE_KEY = "inrcy_bubble_access_map_v1";

type SiteBubbleProgress = { status: ModuleStatus; text: string };
type SiteBubbleProgressCache = Partial<Record<"site_inrcy" | "site_web", SiteBubbleProgress>>;
type ChannelRefreshOptions = { force?: boolean; dedupeMs?: number };
type ChannelStatsRefreshResult = { preferredBlock: InrstatsChannelBlock | null; syncAt: number };
type GeneratorChannelRefreshResult = { block: unknown | null; syncAt: number };

function readCachedBubbleAccessMap(): AppBubbleAccessMap {
  try {
    const raw = readUiCacheValue(BUBBLE_ACCESS_CACHE_KEY);
    if (!raw) return createDefaultBubbleAccessMap();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return createDefaultBubbleAccessMap();
    const rows = Object.entries(parsed as Record<string, unknown>).map(([bubble_key, enabled]) => ({
      bubble_key,
      enabled: Boolean(enabled),
    }));
    return buildBubbleAccessMap(rows);
  } catch {
    return createDefaultBubbleAccessMap();
  }
}

function writeCachedBubbleAccessMap(accessMap: AppBubbleAccessMap) {
  try {
    writeUiCacheValue(BUBBLE_ACCESS_CACHE_KEY, JSON.stringify(accessMap));
  } catch {
    // ignore browser storage failures
  }
}

const EMPTY_INRBADGE_PROFILE: InrBadgeProfileSummary = {
  userId: "",
  logoUrl: "",
  companyLegalName: "",
  firstName: "",
  lastName: "",
  phone: "",
  contactEmail: "",
};

function normalizeCachedString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function sanitizeCachedInrBadgeProfile(value: unknown): InrBadgeProfileSummary {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    userId: normalizeCachedString(source.userId),
    logoUrl: normalizeCachedString(source.logoUrl),
    companyLegalName: normalizeCachedString(source.companyLegalName),
    firstName: normalizeCachedString(source.firstName),
    lastName: normalizeCachedString(source.lastName),
    phone: normalizeCachedString(source.phone),
    contactEmail: normalizeCachedString(source.contactEmail),
  };
}

function isEmptyInrBadgeProfile(profile: InrBadgeProfileSummary) {
  return !profile.userId && !profile.logoUrl && !profile.companyLegalName && !profile.firstName && !profile.lastName && !profile.phone && !profile.contactEmail;
}

function isModuleStatus(value: unknown): value is ModuleStatus {
  return value === "connected" || value === "available" || value === "coming";
}

function readCachedSiteBubbleProgress(): SiteBubbleProgressCache {
  try {
    const raw = readUiCacheValue(SITE_BUBBLE_PROGRESS_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const cache: SiteBubbleProgressCache = {};
    for (const key of ["site_inrcy", "site_web"] as const) {
      const entry = parsed[key] as Record<string, unknown> | undefined;
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      if (!isModuleStatus(entry.status) || typeof entry.text !== "string") continue;
      cache[key] = { status: entry.status, text: entry.text };
    }
    return cache;
  } catch {
    return {};
  }
}

function readCachedGeneratorPowerPercent(): number | null {
  try {
    const raw = readUiCacheValue(GENERATOR_POWER_CACHE_KEY);
    if (!raw) return null;
    const value = Number(raw);
    if (!Number.isFinite(value)) return null;
    return Math.max(0, Math.min(100, Math.round(value)));
  } catch {
    return null;
  }
}

function readCachedGeneratorIsActive(): boolean | null {
  try {
    const raw = readUiCacheValue(GENERATOR_ACTIVE_CACHE_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
    return null;
  } catch {
    return null;
  }
}

function readCachedDashboardChannelState(): Record<string, any> | null {
  try {
    const raw = readUiCacheValue(DASHBOARD_CHANNEL_STATE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as any;
    const state = parsed?.state && typeof parsed.state === "object" ? parsed.state : parsed;
    if (!state || typeof state !== "object" || Array.isArray(state)) return null;
    return state as Record<string, any>;
  } catch {
    return null;
  }
}

function readCachedInrBadgeProfile() {
  try {
    const state = readCachedDashboardChannelState();
    if (!state || !state.inrBadgeProfile) return { ...EMPTY_INRBADGE_PROFILE };
    const profile = sanitizeCachedInrBadgeProfile(state.inrBadgeProfile);
    return isEmptyInrBadgeProfile(profile) ? { ...EMPTY_INRBADGE_PROFILE } : profile;
  } catch {
    return { ...EMPTY_INRBADGE_PROFILE };
  }
}

function readCachedInrBadgeProfileReady(): boolean | null {
  try {
    const state = readCachedDashboardChannelState();
    return typeof state?.inrBadgeProfileReady === "boolean" ? state.inrBadgeProfileReady : null;
  } catch {
    return null;
  }
}

function writeCachedDashboardChannelState(state: Record<string, any>) {
  try {
    writeUiCacheValue(DASHBOARD_CHANNEL_STATE_CACHE_KEY, JSON.stringify({ cachedAt: Date.now(), state }));
  } catch {
    // ignore browser storage failures
  }
}

function isConnectionStatus(value: unknown): value is ConnectionDisplayStatus {
  return value === "connected" || value === "disconnected" || value === "needs_update";
}

function isOwnership(value: unknown): value is Ownership {
  return value === "none" || value === "rented" || value === "sold";
}

function sanitizeMailAccountsConnectedCount(value: unknown) {
  const count = Number(value);
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.min(4, Math.round(count)));
}

function readCachedMailAccountsConnectedCount(): number | null {
  try {
    const state = readCachedDashboardChannelState();
    if (state && Object.prototype.hasOwnProperty.call(state, "mailAccountsConnectedCount")) {
      return sanitizeMailAccountsConnectedCount(state.mailAccountsConnectedCount);
    }
  } catch {
    // ignore malformed dashboard cache
  }

  try {
    // Même source que iNrStats : permet à la bulle Mails du dashboard
    // d'arriver déjà hydratée si iNrStats a été ouvert avant.
    for (const period of [30, 7] as const) {
      const raw = [
        `inrcy_stats_mail_snapshot_v3:${period}`,
        `inrcy_stats_mail_snapshot_v2:${period}`,
        `inrcy_stats_mail_snapshot_v1:${period}`,
      ].map((key) => readUiCacheValue(key)).find(Boolean);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as any;
      const syncedAt = Number(parsed?.syncedAt ?? parsed?.stats?.syncedAt);
      const age = Date.now() - syncedAt;
      if (!Number.isFinite(age) || age < 0 || age > 7 * 24 * 60 * 60 * 1000) continue;
      if (parsed?.stats && Object.prototype.hasOwnProperty.call(parsed.stats, "connectedCount")) {
        return sanitizeMailAccountsConnectedCount(parsed.stats.connectedCount);
      }
      if (Object.prototype.hasOwnProperty.call(parsed, "connectedCount")) {
        return sanitizeMailAccountsConnectedCount(parsed.connectedCount);
      }
    }
  } catch {
    // ignore malformed iNrStats cache
  }

  return null;
}

function mergeCachedDashboardChannelState(patch: Record<string, any>) {
  try {
    writeCachedDashboardChannelState({
      ...(readCachedDashboardChannelState() ?? {}),
      ...patch,
    });
  } catch {
    // ignore browser storage failures
  }
}

type DashboardClientProps = {
  isAdmin?: boolean;
};

export default function DashboardClient({ isAdmin = false }: DashboardClientProps) {
  const [helpGeneratorOpen, setHelpGeneratorOpen] = useState(false);
  const [helpCanauxOpen, setHelpCanauxOpen] = useState(false);
  const [helpSiteInrcyOpen, setHelpSiteInrcyOpen] = useState(false);
  const [helpSiteWebOpen, setHelpSiteWebOpen] = useState(false);
  const [helpInertieOpen, setHelpInertieOpen] = useState(false);
  const [helpInstagramOpen, setHelpInstagramOpen] = useState(false);
  const [helpFacebookOpen, setHelpFacebookOpen] = useState(false);
  const [dashboardBoosterModal, setDashboardBoosterModal] = useState<null | "publish" | "stats">(null);
  const [siteConnectionsReady, setSiteConnectionsReady] = useState(false);
  const [mailAccountsConnectedCount, setMailAccountsConnectedCount] = useState(() => readCachedMailAccountsConnectedCount() ?? 0);
  const [youtubeShortsConnected, setYoutubeShortsConnected] = useState(false);
  const [youtubeShortsUrl, setYoutubeShortsUrl] = useState("");
  const [pinterestConnected, setPinterestConnected] = useState(false);
  const [pinterestUrl, setPinterestUrl] = useState("");
  const [trustpilotConnected, setTrustpilotConnected] = useState(false);
  const [trustpilotUrl, setTrustpilotUrl] = useState("");
  const [inrBadgeProfile, setInrBadgeProfile] = useState<InrBadgeProfileSummary>(() => readCachedInrBadgeProfile());
  const [cachedInrBadgeProfileReady, setCachedInrBadgeProfileReady] = useState<boolean | null>(() => readCachedInrBadgeProfileReady());
  const [inrBadgeModalOpen, setInrBadgeModalOpen] = useState(false);
  const [displayedGeneratorPower, setDisplayedGeneratorPower] = useState<number | null>(() => readCachedGeneratorPowerPercent());
  const [displayedGeneratorIsActive, setDisplayedGeneratorIsActive] = useState<boolean | null>(() => readCachedGeneratorIsActive());
  const [displayedSiteBubbleProgress, setDisplayedSiteBubbleProgress] = useState<SiteBubbleProgressCache>(() => readCachedSiteBubbleProgress());
  const router = useRouter();
  const searchParams = useSearchParams();
  const { panel, openPanel, closePanel, goToModule } = useDashboardPanelRouting();

  const openStatsModule = useCallback(() => {
    try {
      sessionStorage.setItem("inrcy_dashboard_scrollY", String(window.scrollY ?? 0));
    } catch {}

    router.push("/dashboard/stats");

    window.setTimeout(() => {
      if (window.location.pathname !== "/dashboard/stats") {
        window.location.assign("/dashboard/stats");
      }
    }, 120);
  }, [router]);

  useEffect(() => {
    const action = searchParams.get("action");
    const stats = searchParams.get("stats");
    if (action === "publish") {
      setDashboardBoosterModal("publish");
    } else if (stats === "1") {
      setDashboardBoosterModal("stats");
    }
  }, [searchParams]);

  // Orientation: gérée globalement via <OrientationGuard />

  // ✅ Déconnexion Supabase + retour /login
  const handleLogout = async () => {
    const supabase = createClient();
    setActiveBrowserUserId(null);
    const { error } = await (supabase.auth.signOut as any)({ scope: "local" }).catch(() => ({ error: null as { message?: string } | null }));
    if (error) {
      console.error("Erreur déconnexion:", error.message);
      return;
    }
    window.location.replace("/login");
  };

  const {
    notifications,
    notificationsLoading,
    notificationsError,
    unreadNotificationsCount,
    refreshNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
  } = useDashboardNotifications();
  const kpisRequestSeqRef = useRef(0);
  const siteConfigRequestSeqRef = useRef(0);
  const activeUserIdRef = useRef<string | null>(null);
  const latestApplyBootstrapRefreshRef = useRef<((bootstrap: DailyStatsRefreshBootstrapResponse) => { syncAt: number; bootstrapSnapshotDate: string | null }) | null>(null);
  const latestSyncFromServerCacheIfNeededRef = useRef<((force?: boolean) => Promise<void>) | null>(null);
  const latestFallbackToServerSyncThenGlobalRef = useRef<(() => Promise<void>) | null>(null);
  const latestTriggerChannelsRefreshRef = useRef<((channelsInput: DashboardChannelKey[]) => Promise<void>) | null>(null);
  const initialGeneratorRefreshDoneRef = useRef(false);
  const lastAutoDailyRefreshAtRef = useRef(0);
  const dashboardChannelCacheLastWriteRef = useRef("");
  const [kpisLoading, setKpisLoading] = useState(false);
  const [dailyBootReady, setDailyBootReady] = useState(false);
  const [kpis, setKpis] = useState<null | {
    leads: { today: number; week: number; month: number };
    estimatedValue: number;
  }>(null);
  const [oppTotal, setOppTotal] = useState<number | null>(null);
  const [channelBlocks, setChannelBlocks] = useState<InrstatsChannelBlocksByChannel | null>(() => readCachedChannelBlocks());
  const channelBlocksRef = useRef<InrstatsChannelBlocksByChannel | null>(channelBlocks);

  useEffect(() => {
    channelBlocksRef.current = channelBlocks;
  }, [channelBlocks]);
  const { runDrawerMutation, isDrawerMutationPending } = useDrawerMutationGuard();

  useBrowserLayoutEffect(() => {
    try {
      const cached = readGeneratorCache();
      const payload = cached?.payload;
      if (payload?.leads) {
        setKpis(payload);
        const oppMonth = Number(payload?.details?.opportunities?.month);
        if (Number.isFinite(oppMonth)) {
          setOppTotal(oppMonth);
        }
      }
    } catch {
      // ignore
    }

    const cachedOppTotal = readCachedOppTotal();
    if (cachedOppTotal !== null) {
      setOppTotal((prev) => prev ?? cachedOppTotal);
    }

    const cachedBlocks = readCachedChannelBlocks();
    if (cachedBlocks) {
      setChannelBlocks(cachedBlocks);
    }
  }, []);

  const extractDomain = useCallback((input: string) => {
    const url = (input || "").trim();
    if (!url) return "";
    try {
      const withProto = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      return new URL(withProto).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return url
        .toLowerCase()
        .replace(/^https?:\/\//i, "")
        .replace(/^www\./i, "")
        .split("/")[0];
    }
  }, []);

  const normalizeSiteUrl = useCallback((input: string) => {
    const raw = (input || "").trim();
    if (!raw) return null;
    try {
      const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      const parsed = new URL(withProto);
      const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
      if (!hostname || !hostname.includes(".")) return null;
      if (!["http:", "https:"].includes(parsed.protocol)) return null;
      return {
        normalizedUrl: withProto,
        hostname,
      };
    } catch {
      return null;
    }
  }, []);

  const fetchWidgetToken = useCallback(async (domain: string, source: "inrcy_site" | "site_web") => {
    if (!domain) return "";
    const res = await fetch(
      `/api/widgets/issue-token?domain=${encodeURIComponent(domain)}&source=${encodeURIComponent(source)}`,
      { method: "GET", credentials: "include" }
    );
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) return "";
    return String(json.token || "");
  }, []);

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const {
    userMenuOpen,
    setUserMenuOpen,
    userMenuRef,
    notificationMenuOpen,
    setNotificationMenuOpen,
    desktopNotificationMenuRef,
    mobileNotificationMenuRef,
    userFirstLetter,
    menuOpen,
    setMenuOpen,
    menuRef,
  } = useDashboardMenus(userEmail);

const {
  referralName,
  referralPhone,
  referralEmail,
  referralFrom,
  referralSubmitting,
  referralNotice,
  referralError,
  setReferralName,
  setReferralPhone,
  setReferralEmail,
  setReferralFrom,
  submitReferral,
} = useReferralForm();
const patchChannelConnectionLocallyRef = useRef<(
  channel: DashboardChannelKey,
  patch: Partial<InrstatsChannelBlock["connection"]>,
  options?: { clearData?: boolean; clearError?: boolean },
) => void>(() => {});
const triggerChannelRefreshRef = useRef<(channel: DashboardChannelKey) => Promise<void>>(async () => {});

const [bubbleAccessMap, setBubbleAccessMap] = useState<AppBubbleAccessMap>(() => readCachedBubbleAccessMap());
const canAccessSiteInrcy = isBubbleEnabled(bubbleAccessMap, "site_inrcy");
const canAccessInrAgent = isBubbleEnabled(bubbleAccessMap, "inr_agent");
const canAccessPinterest = isBubbleEnabled(bubbleAccessMap, "pinterest");
const canAccessTrustpilot = isBubbleEnabled(bubbleAccessMap, "trustpilot");

const patchChannelConnectionLocallyProxy = useCallback((
  channel: DashboardChannelKey,
  patch: Partial<InrstatsChannelBlock["connection"]>,
  options?: { clearData?: boolean; clearError?: boolean },
) => patchChannelConnectionLocallyRef.current(channel, patch, options), []);

const triggerChannelRefreshProxy = useCallback(
  (channel: DashboardChannelKey) => triggerChannelRefreshRef.current(channel),
  []
);

const updateRootSettingsKey = useCallback(
  async (key: "gmb" | "facebook" | "instagram" | "linkedin", nextObj: any) => {
    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user) return;

    const { data: row, error: readErr } = await supabase
      .from("pro_tools_configs")
      .select("settings")
      .eq("user_id", user.id)
      .maybeSingle();

    if (readErr) return;

    const current = (row as any)?.settings ?? {};
    const merged = { ...(current ?? {}), [key]: nextObj ?? {} };

    await supabase.from("pro_tools_configs").upsert({ user_id: user.id, settings: merged }, { onConflict: "user_id" });
  },
  []
);

const {
  siteInrcyOwnership,
  setSiteInrcyOwnership,
  siteInrcyUrl,
  setSiteInrcyUrl,
  siteInrcySavedUrl,
  setSiteInrcySavedUrl,
  siteInrcyContactEmail,
  setSiteInrcyContactEmail,
  siteInrcySettingsText,
  setSiteInrcySettingsText,
  siteInrcySettingsError,
  setSiteInrcySettingsError,
  siteInrcyTrackingBusy,
  siteInrcyGa4Notice,
  setSiteInrcyGa4Notice,
  siteInrcyGscNotice,
  setSiteInrcyGscNotice,
  siteInrcyUrlNotice,
  widgetTokenInrcySite,
  siteInrcyActusLayout,
  setSiteInrcyActusLayout,
  siteInrcyActusLimit,
  setSiteInrcyActusLimit,
  siteInrcyActusFont,
  setSiteInrcyActusFont,
  siteInrcyActusTheme,
  setSiteInrcyActusTheme,
  showSiteInrcyWidgetCode,
  setShowSiteInrcyWidgetCode,
  siteInrcyGa4Connected,
  setSiteInrcyGa4Connected,
  siteInrcyGscConnected,
  setSiteInrcyGscConnected,
  ga4MeasurementId,
  setGa4MeasurementId,
  ga4PropertyId,
  setGa4PropertyId,
  gscProperty,
  setGscProperty,
  connectSiteInrcyGa4,
  connectSiteInrcyGsc,
  activateSiteInrcyTracking,
  deactivateSiteInrcyTracking,
  disconnectSiteInrcyGa4,
  disconnectSiteInrcyGsc,
  saveSiteInrcyUrl,
  deleteSiteInrcyUrl,
  saveSiteInrcyActusWidgetSettings,
  resetSiteInrcyAll,
} = useSiteInrcyChannel({
  normalizeSiteUrl,
  extractDomain,
  fetchWidgetToken,
  patchChannelConnectionLocally: patchChannelConnectionLocallyProxy,
  triggerChannelRefresh: triggerChannelRefreshProxy,
});

const {
  siteWebUrl,
  setSiteWebUrl,
  siteWebSavedUrl,
  setSiteWebSavedUrl,
  siteWebSettingsText,
  setSiteWebSettingsText,
  siteWebSettingsError,
  setSiteWebSettingsError,
  siteWebGa4MeasurementId,
  setSiteWebGa4MeasurementId,
  siteWebGa4PropertyId,
  setSiteWebGa4PropertyId,
  siteWebGscProperty,
  setSiteWebGscProperty,
  siteWebGa4Notice,
  setSiteWebGa4Notice,
  siteWebGscNotice,
  setSiteWebGscNotice,
  siteWebUrlNotice,
  widgetTokenSiteWeb,
  siteWebActusLayout,
  setSiteWebActusLayout,
  siteWebActusLimit,
  setSiteWebActusLimit,
  siteWebActusFont,
  setSiteWebActusFont,
  siteWebActusTheme,
  setSiteWebActusTheme,
  showSiteWebWidgetCode,
  setShowSiteWebWidgetCode,
  siteWebGa4Connected,
  setSiteWebGa4Connected,
  siteWebGscConnected,
  setSiteWebGscConnected,
  saveSiteWebUrl,
  deleteSiteWebUrl,
  saveSiteWebActusWidgetSettings,
  resetSiteWebAll,
  attachWebsiteGoogleAnalytics,
  attachWebsiteGoogleSearchConsole,
  connectSiteWebGa4,
  connectSiteWebGsc,
  disconnectSiteWebGa4,
  disconnectSiteWebGsc,
} = useSiteWebChannel({
  normalizeSiteUrl,
  extractDomain,
  fetchWidgetToken,
  patchChannelConnectionLocally: patchChannelConnectionLocallyProxy,
  triggerChannelRefresh: triggerChannelRefreshProxy,
});

const {
  facebookUrl,
  setFacebookUrl,
  facebookAccountConnected,
  setFacebookAccountConnected,
  facebookPageConnected,
  setFacebookPageConnected,
  facebookConnectionStatus,
  setFacebookConnectionStatus,
  facebookAccountEmail,
  setFacebookAccountEmail,
  facebookUrlNotice,
  facebookUrlError,
  fbPages,
  fbPagesLoading,
  fbSelectedPageId,
  setFbSelectedPageId,
  fbSelectedPageName,
  setFbSelectedPageName,
  fbPagesError,
  connectFacebookAccount,
  connectFacebookBusinessAccount,
  disconnectFacebookAccount,
  disconnectFacebookPage,
  loadFacebookPages,
  saveFacebookPage,
  setPanelSuccess: setFacebookPanelSuccess,
  setPanelError: setFacebookPanelError,
} = useFacebookChannel({
  panel,
  searchParams,
  patchChannelConnectionLocally: patchChannelConnectionLocallyProxy,
  triggerChannelRefresh: triggerChannelRefreshProxy,
  updateRootSettingsKey,
});

const {
  instagramUrl,
  setInstagramUrl,
  instagramAccountConnected,
  setInstagramAccountConnected,
  instagramConnected,
  setInstagramConnected,
  instagramConnectionStatus,
  setInstagramConnectionStatus,
  instagramUsername,
  setInstagramUsername,
  instagramUrlNotice,
  instagramUrlError,
  igAccounts,
  igAccountsLoading,
  igSelectedPageId,
  setIgSelectedPageId,
  igAccountsError,
  connectInstagramAccount,
  connectInstagramBusinessAccount,
  disconnectInstagramAccount,
  disconnectInstagramProfile,
  loadInstagramAccounts,
  saveInstagramProfile,
  syncInstagramStateFromServer,
  setPanelSuccess: setInstagramPanelSuccess,
  setPanelError: setInstagramPanelError,
} = useInstagramChannel({
  panel,
  searchParams,
  patchChannelConnectionLocally: patchChannelConnectionLocallyProxy,
  triggerChannelRefresh: triggerChannelRefreshProxy,
  updateRootSettingsKey,
});

const {
  linkedinUrl,
  setLinkedinUrl,
  linkedinAccountConnected,
  setLinkedinAccountConnected,
  linkedinConnected,
  setLinkedinConnected,
  linkedinConnectionStatus,
  setLinkedinConnectionStatus,
  linkedinDisplayName,
  setLinkedinDisplayName,
  linkedinUrlNotice,
  setLinkedinUrlNotice,
  linkedinUrlError,
  connectLinkedinAccount,
  connectLinkedinBusinessAccount,
  disconnectLinkedinAccount,
  saveLinkedinProfileUrl,
  linkedinOrganizations,
  linkedinOrganizationsLoading,
  linkedinOrganizationPickerOpen,
  linkedinSelectedOrganizationId,
  setLinkedinSelectedOrganizationId,
  linkedinSelectedOrganizationName,
  setLinkedinSelectedOrganizationName,
  loadLinkedinOrganizations,
  selectLinkedinOrganization,
  useLinkedinPersonalProfile,
  setPanelSuccess: setLinkedinPanelSuccess,
  setPanelError: setLinkedinPanelError,
} = useLinkedinChannel({
  panel,
  searchParams,
  patchChannelConnectionLocally: patchChannelConnectionLocallyProxy,
  triggerChannelRefresh: triggerChannelRefreshProxy,
  updateRootSettingsKey,
});

const {
  gmbUrl,
  setGmbUrl,
  gmbConnected,
  setGmbConnected,
  gmbConnectionStatus,
  setGmbConnectionStatus,
  gmbAccountConnected,
  setGmbAccountConnected,
  gmbConfigured,
  setGmbConfigured,
  gmbAccountEmail,
  setGmbAccountEmail,
  gmbUrlNotice,
  gmbUrlError,
  gmbAccounts,
  gmbLocations,
  gmbAccountName,
  gmbLocationName,
  setGmbLocationName,
  gmbLocationLabel,
  setGmbLocationLabel,
  gmbLoadingList,
  gmbListError,
  connectGmbAccount,
  disconnectGmbAccount,
  disconnectGmbBusiness,
  loadGmbAccountsAndLocations,
  saveGmbLocation,
  setPanelSuccess: setGmbPanelSuccess,
  setPanelError: setGmbPanelError,
} = useGoogleBusinessChannel({
  panel,
  searchParams,
  patchChannelConnectionLocally: patchChannelConnectionLocallyProxy,
  triggerChannelRefresh: triggerChannelRefreshProxy,
  updateRootSettingsKey,
});

const {
  tiktokConnected,
  tiktokUsername,
  tiktokProfileUrl,
  setTiktokProfileUrl,
  tiktokProfileUrlNotice,
  tiktokProfileUrlError,
  tiktokSettingsNotice,
  tiktokSettingsError,
  tiktokLoading,
  connectTiktok,
  disconnectTiktok,
  saveTiktokProfileUrl,
  tiktokPreferredMedia,
  setTiktokPreferredMedia,
  tiktokAllowComments,
  setTiktokAllowComments,
  tiktokAllowDuo,
  setTiktokAllowDuo,
  tiktokAllowStitch,
  setTiktokAllowStitch,
  tiktokPhotoAutoMusic,
  setTiktokPhotoAutoMusic,
  tiktokCommercialContent,
  setTiktokCommercialContent,
  tiktokAiContent,
  setTiktokAiContent,
  saveTiktokDefaults,
} = useTiktokChannel({
  panel,
  patchChannelConnectionLocally: patchChannelConnectionLocallyProxy,
  triggerChannelRefresh: triggerChannelRefreshProxy,
});

const { profileIncomplete, activityIncomplete, profileCheckReady, checkProfile, checkActivity } = useDashboardCompletionChecks();

const applyDashboardChannelState = useCallback((state: Record<string, any> | null, options?: { markReady?: boolean }) => {
  if (!state) return false;

  if (isOwnership(state.siteInrcyOwnership)) setSiteInrcyOwnership(state.siteInrcyOwnership);
  if (typeof state.siteInrcyUrl === "string") setSiteInrcyUrl(state.siteInrcyUrl);
  if (typeof state.siteInrcySavedUrl === "string") setSiteInrcySavedUrl(state.siteInrcySavedUrl);
  if (typeof state.siteInrcyContactEmail === "string") setSiteInrcyContactEmail(state.siteInrcyContactEmail);
  if (typeof state.siteInrcySettingsText === "string") setSiteInrcySettingsText(state.siteInrcySettingsText);
  if (typeof state.ga4MeasurementId === "string") setGa4MeasurementId(state.ga4MeasurementId);
  if (typeof state.ga4PropertyId === "string") setGa4PropertyId(state.ga4PropertyId);
  if (typeof state.gscProperty === "string") setGscProperty(state.gscProperty);
  if (state.siteInrcyActusLayout === "list" || state.siteInrcyActusLayout === "carousel") setSiteInrcyActusLayout(state.siteInrcyActusLayout);
  if ([3, 5, 10].includes(Number(state.siteInrcyActusLimit))) setSiteInrcyActusLimit(Number(state.siteInrcyActusLimit));
  if (["site", "inter", "poppins", "montserrat", "lora"].includes(String(state.siteInrcyActusFont))) setSiteInrcyActusFont(state.siteInrcyActusFont);
  if (["white", "dark", "gray", "nature", "sand"].includes(String(state.siteInrcyActusTheme))) setSiteInrcyActusTheme(state.siteInrcyActusTheme);

  if (typeof state.siteWebSettingsText === "string") setSiteWebSettingsText(state.siteWebSettingsText);
  if (typeof state.siteWebUrl === "string") setSiteWebUrl(state.siteWebUrl);
  if (typeof state.siteWebSavedUrl === "string") setSiteWebSavedUrl(state.siteWebSavedUrl);
  if (typeof state.siteWebGa4MeasurementId === "string") setSiteWebGa4MeasurementId(state.siteWebGa4MeasurementId);
  if (typeof state.siteWebGa4PropertyId === "string") setSiteWebGa4PropertyId(state.siteWebGa4PropertyId);
  if (typeof state.siteWebGscProperty === "string") setSiteWebGscProperty(state.siteWebGscProperty);
  if (state.siteWebActusLayout === "list" || state.siteWebActusLayout === "carousel") setSiteWebActusLayout(state.siteWebActusLayout);
  if ([3, 5, 10].includes(Number(state.siteWebActusLimit))) setSiteWebActusLimit(Number(state.siteWebActusLimit));
  if (["site", "inter", "poppins", "montserrat", "lora"].includes(String(state.siteWebActusFont))) setSiteWebActusFont(state.siteWebActusFont);
  if (["white", "dark", "gray", "nature", "sand"].includes(String(state.siteWebActusTheme))) setSiteWebActusTheme(state.siteWebActusTheme);

  if (typeof state.instagramUrl === "string") setInstagramUrl(state.instagramUrl);
  if (typeof state.instagramAccountConnected === "boolean") setInstagramAccountConnected(state.instagramAccountConnected);
  if (typeof state.instagramConnected === "boolean") setInstagramConnected(state.instagramConnected);
  if (isConnectionStatus(state.instagramConnectionStatus)) setInstagramConnectionStatus(state.instagramConnectionStatus);
  if (typeof state.instagramUsername === "string") setInstagramUsername(state.instagramUsername);

  if (typeof state.linkedinUrl === "string") setLinkedinUrl(state.linkedinUrl);
  if (typeof state.linkedinAccountConnected === "boolean") setLinkedinAccountConnected(state.linkedinAccountConnected);
  if (typeof state.linkedinConnected === "boolean") setLinkedinConnected(state.linkedinConnected);
  if (isConnectionStatus(state.linkedinConnectionStatus)) setLinkedinConnectionStatus(state.linkedinConnectionStatus);
  if (typeof state.linkedinDisplayName === "string") setLinkedinDisplayName(state.linkedinDisplayName);
  if (typeof state.linkedinSelectedOrganizationId === "string") setLinkedinSelectedOrganizationId(state.linkedinSelectedOrganizationId);
  if (typeof state.linkedinSelectedOrganizationName === "string") setLinkedinSelectedOrganizationName(state.linkedinSelectedOrganizationName);

  if (typeof state.gmbUrl === "string") setGmbUrl(state.gmbUrl);
  if (typeof state.gmbAccountConnected === "boolean") setGmbAccountConnected(state.gmbAccountConnected);
  if (typeof state.gmbConfigured === "boolean") setGmbConfigured(state.gmbConfigured);
  if (typeof state.gmbConnected === "boolean") setGmbConnected(state.gmbConnected);
  if (isConnectionStatus(state.gmbConnectionStatus)) setGmbConnectionStatus(state.gmbConnectionStatus);
  if (typeof state.gmbAccountEmail === "string") setGmbAccountEmail(state.gmbAccountEmail);
  if (typeof state.gmbLocationName === "string") setGmbLocationName(state.gmbLocationName);
  if (typeof state.gmbLocationLabel === "string") setGmbLocationLabel(state.gmbLocationLabel);

  if (typeof state.facebookUrl === "string") setFacebookUrl(state.facebookUrl);
  if (typeof state.facebookAccountConnected === "boolean") setFacebookAccountConnected(state.facebookAccountConnected);
  if (typeof state.facebookPageConnected === "boolean") setFacebookPageConnected(state.facebookPageConnected);
  if (isConnectionStatus(state.facebookConnectionStatus)) setFacebookConnectionStatus(state.facebookConnectionStatus as "connected" | "disconnected" | "needs_update");
  if (typeof state.facebookAccountEmail === "string") setFacebookAccountEmail(state.facebookAccountEmail);
  if (typeof state.fbSelectedPageId === "string") setFbSelectedPageId(state.fbSelectedPageId);
  if (typeof state.fbSelectedPageName === "string") setFbSelectedPageName(state.fbSelectedPageName);
  if (typeof state.youtubeShortsConnected === "boolean") setYoutubeShortsConnected(state.youtubeShortsConnected);
  if (typeof state.youtubeShortsUrl === "string") setYoutubeShortsUrl(state.youtubeShortsUrl);
  if (typeof state.pinterestConnected === "boolean") setPinterestConnected(state.pinterestConnected);
  if (typeof state.pinterestUrl === "string") setPinterestUrl(state.pinterestUrl);
  if (typeof state.trustpilotConnected === "boolean") setTrustpilotConnected(state.trustpilotConnected);
  if (typeof state.trustpilotUrl === "string") setTrustpilotUrl(state.trustpilotUrl);

  if (typeof state.siteInrcyGa4Connected === "boolean") setSiteInrcyGa4Connected(state.siteInrcyGa4Connected);
  if (typeof state.siteInrcyGscConnected === "boolean") setSiteInrcyGscConnected(state.siteInrcyGscConnected);
  if (typeof state.siteWebGa4Connected === "boolean") setSiteWebGa4Connected(state.siteWebGa4Connected);
  if (typeof state.siteWebGscConnected === "boolean") setSiteWebGscConnected(state.siteWebGscConnected);

  if (Object.prototype.hasOwnProperty.call(state, "mailAccountsConnectedCount")) {
    setMailAccountsConnectedCount(sanitizeMailAccountsConnectedCount(state.mailAccountsConnectedCount));
  }

  if (state.inrBadgeProfile && typeof state.inrBadgeProfile === "object") {
    setInrBadgeProfile(sanitizeCachedInrBadgeProfile(state.inrBadgeProfile));
  }

  if (typeof state.inrBadgeProfileReady === "boolean") {
    setCachedInrBadgeProfileReady(state.inrBadgeProfileReady);
  }

  setSiteInrcySettingsError(null);
  setSiteWebSettingsError(null);
  if (options?.markReady) setSiteConnectionsReady(true);
  return true;
}, [
  setFacebookAccountConnected, setFacebookConnectionStatus, setFacebookPageConnected, setFacebookUrl,
  setFbSelectedPageId, setFbSelectedPageName, setGa4MeasurementId, setGa4PropertyId, setGmbAccountConnected,
  setGmbConfigured, setGmbConnected, setGmbConnectionStatus, setGmbLocationLabel, setGmbLocationName, setGmbUrl,
  setGscProperty, setInstagramAccountConnected, setInstagramConnected, setInstagramConnectionStatus, setInstagramUrl,
  setInstagramUsername, setLinkedinAccountConnected, setLinkedinConnected, setLinkedinConnectionStatus,
  setLinkedinDisplayName, setLinkedinSelectedOrganizationId, setLinkedinSelectedOrganizationName, setLinkedinUrl,
  setSiteInrcyActusFont, setSiteInrcyActusLayout, setSiteInrcyActusLimit, setSiteInrcyActusTheme, setSiteInrcyContactEmail,
  setSiteInrcyGa4Connected, setSiteInrcyGscConnected, setSiteInrcyOwnership, setSiteInrcySavedUrl,
  setSiteInrcySettingsError, setSiteInrcySettingsText, setSiteInrcyUrl, setSiteWebActusFont, setSiteWebActusLayout,
  setSiteWebActusLimit, setSiteWebActusTheme, setSiteWebGa4Connected, setSiteWebGa4MeasurementId,
  setSiteWebGa4PropertyId, setSiteWebGscConnected, setSiteWebGscProperty, setSiteWebSavedUrl,
  setSiteWebSettingsError, setSiteWebSettingsText, setSiteWebUrl, setMailAccountsConnectedCount,
  setYoutubeShortsConnected, setYoutubeShortsUrl, setPinterestConnected, setPinterestUrl, setTrustpilotConnected, setTrustpilotUrl,
]);

useEffect(() => {
  const handlePinterestUpdate = (event: Event) => {
    const detail = (event as CustomEvent)?.detail ?? {};
    const connected = Boolean(detail.connected);
    const profileUrl = typeof detail.profileUrl === "string" ? detail.profileUrl : "";
    setPinterestConnected(connected);
    setPinterestUrl(profileUrl);
    mergeCachedDashboardChannelState({ pinterestConnected: connected, pinterestUrl: profileUrl });
  };

  const handleTrustpilotUpdate = (event: Event) => {
    const detail = (event as CustomEvent)?.detail ?? {};
    const connected = Boolean(detail.connected);
    const profileUrl = typeof detail.profileUrl === "string" ? detail.profileUrl : "";
    setTrustpilotConnected(connected);
    setTrustpilotUrl(profileUrl);
    mergeCachedDashboardChannelState({ trustpilotConnected: connected, trustpilotUrl: profileUrl });
  };

  window.addEventListener("inrcy:pinterest-settings-updated", handlePinterestUpdate);
  window.addEventListener("inrcy:trustpilot-settings-updated", handleTrustpilotUpdate);
  return () => {
    window.removeEventListener("inrcy:pinterest-settings-updated", handlePinterestUpdate);
    window.removeEventListener("inrcy:trustpilot-settings-updated", handleTrustpilotUpdate);
  };
}, []);

useEffect(() => {
  const handleYoutubeShortsUpdate = (event: Event) => {
    const detail = (event as CustomEvent)?.detail ?? {};
    const connected = Boolean(detail.connected);
    const channelUrl = typeof detail.channelUrl === "string" ? detail.channelUrl : "";
    const channelHandle = typeof detail.channelHandle === "string" ? detail.channelHandle : "";
    const channelName = typeof detail.channelName === "string" ? detail.channelName : "";
    const channelId = typeof detail.channelId === "string" ? detail.channelId : "";

    setYoutubeShortsConnected(connected);
    setYoutubeShortsUrl(channelUrl);
    mergeCachedDashboardChannelState({
      youtubeShortsConnected: connected,
      youtubeShortsUrl: channelUrl,
    });

    patchChannelConnectionLocallyRef.current("youtube_shorts", {
      connected,
      accountConnected: connected,
      configured: connected,
      statsConnected: connected,
      expired: false,
      requiresUpdate: false,
      connectionStatus: connected ? "connected" : "disconnected",
      resourceId: connected ? (channelId || channelHandle || channelUrl || null) : null,
      resourceLabel: connected ? (channelName || channelHandle || channelUrl || null) : null,
      resourceUrl: connected ? (channelUrl || null) : null,
    }, { clearData: !connected, clearError: true });

    void triggerChannelRefreshRef.current("youtube_shorts").catch((error) => {
      console.warn("[youtube-shorts] channel refresh failed", error);
    });
  };

  window.addEventListener("inrcy:youtube-shorts-settings-updated", handleYoutubeShortsUpdate);
  return () => window.removeEventListener("inrcy:youtube-shorts-settings-updated", handleYoutubeShortsUpdate);
}, []);

useBrowserLayoutEffect(() => {
  const cached = readCachedDashboardChannelState();
  applyDashboardChannelState(cached, { markReady: true });
}, [applyDashboardChannelState]);

const setPanelSuccess = useCallback((kind: "facebook" | "instagram" | "linkedin" | "gmb", message: string, timeout = 2200) => {
  if (kind === "facebook") { setFacebookPanelSuccess(message, timeout); return; }
  if (kind === "instagram") { setInstagramPanelSuccess(message, timeout); return; }
  if (kind === "linkedin") { setLinkedinPanelSuccess(message, timeout); return; }
  setGmbPanelSuccess(message, timeout);
}, [setFacebookPanelSuccess, setInstagramPanelSuccess, setLinkedinPanelSuccess, setGmbPanelSuccess]);

const setPanelError = useCallback((kind: "facebook" | "instagram" | "linkedin" | "gmb", input: unknown, fallback: string, timeout = 3200) => {
  if (kind === "facebook") { setFacebookPanelError(input, fallback, timeout); return; }
  if (kind === "instagram") { setInstagramPanelError(input, fallback, timeout); return; }
  if (kind === "linkedin") { setLinkedinPanelError(input, fallback, timeout); return; }
  setGmbPanelError(input, fallback, timeout);
}, [setFacebookPanelError, setInstagramPanelError, setLinkedinPanelError, setGmbPanelError]);

  // ✅ Unités d'Inertie : multiplicateur basé sur les 6 canaux connectés.
  // Calculé ici (dans le composant) pour être réutilisé dans le KPI + le drawer.
  const inertiaSnapshot = useMemo(
    () =>
      computeInertiaSnapshot(
        {
          site_inrcy: Boolean(canAccessSiteInrcy && normalizeSiteUrl(siteInrcySavedUrl) && (siteInrcyGa4Connected || siteInrcyGscConnected)),
          site_web: Boolean(normalizeSiteUrl(siteWebSavedUrl) && (siteWebGa4Connected || siteWebGscConnected)),
          // IMPORTANT: on ne compte les réseaux sociaux que si le compte est réellement connecté (OAuth),
          // pas seulement si un lien est renseigné.
          // Google Business : compte + fiche (location) configurée.
          gmb: Boolean(gmbAccountConnected && gmbConfigured && gmbConnectionStatus !== "needs_update"),
          // Facebook : compte + page sélectionnée.
          facebook: Boolean(facebookAccountConnected && facebookPageConnected && facebookConnectionStatus !== "needs_update"),
          // Instagram : compte + page/profil (resource) sélectionné.
          instagram: Boolean(instagramAccountConnected && instagramConnected && instagramConnectionStatus !== "needs_update"),
          linkedin: Boolean(linkedinAccountConnected && linkedinConnectionStatus !== "needs_update"),
          // TikTok est compté uniquement quand la vraie connexion OAuth est active.
          tiktok: Boolean(tiktokConnected),
          youtube_shorts: Boolean(youtubeShortsConnected),
        },
        { maxMultiplier: 7 }
      ),
    [
      normalizeSiteUrl,
      canAccessSiteInrcy,
      siteInrcySavedUrl,
      siteInrcyGa4Connected,
      siteInrcyGscConnected,
      siteWebSavedUrl,
      siteWebGa4Connected,
      siteWebGscConnected,
      gmbAccountConnected,
      gmbConfigured,
      facebookAccountConnected,
      facebookPageConnected,
      facebookConnectionStatus,
      instagramAccountConnected,
      instagramConnected,
      instagramConnectionStatus,
      linkedinAccountConnected,
      linkedinConnectionStatus,
      tiktokConnected,
      youtubeShortsConnected,
      gmbConnectionStatus,
    ]
  );

  // ✅ Solde UI (Unités d'Inertie) pour l'affichage dans le Générateur
  // Objectif: éviter un « blink » (0 → vraie valeur) au retour de navigation / pendant un refresh.
  // On garde la dernière valeur connue en mémoire (sessionStorage) tant que la nouvelle n'est pas chargée.
  const [uiBalance, setUiBalance] = useState<number>(0);

  useEffect(() => {
    try {
      const raw = readAccountCacheValue("inrcy_ui_balance_v1");
      const n = raw ? Number(raw) : NaN;
      if (Number.isFinite(n)) setUiBalance(n);
    } catch {
      // ignore
    }
  }, []);

  const refreshUiBalance = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) {
        // Ne pas écraser l'affichage par 0 pendant un instant (retour navigation / auth async)
        return;
      }
      const res = await supabase
        .from("loyalty_balance")
        .select("balance")
        .eq("user_id", user.id)
        .maybeSingle();
      const bal = Number((res.data as any)?.balance ?? 0);
      const next = Number.isFinite(bal) ? bal : 0;
      setUiBalance(next);
      try {
        writeAccountCacheValue("inrcy_ui_balance_v1", String(next));
      } catch {
        // ignore
      }
    } catch {
      // silence (ex: tables non activées)
      // Ne pas forcer à 0 pour éviter un flash; on garde la dernière valeur connue.
    }
  }, []);

// OAuth credentials must be stored server-side (env vars), not in the UI.


  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      const user = data.user ?? null;
      activeUserIdRef.current = user?.id ?? null;
      setUserEmail(user?.email ?? null);
      setActiveBrowserUserId(user?.id ?? null);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      const previousUserId = activeUserIdRef.current;
      const nextUserId = nextUser?.id ?? null;
      if (previousUserId && nextUserId && previousUserId !== nextUserId) {
        purgeAllBrowserAccountCaches();
        setActiveBrowserUserId(nextUserId);
        window.location.replace("/dashboard");
        return;
      }
      activeUserIdRef.current = nextUserId;
      setUserEmail(nextUser?.email ?? null);
      setActiveBrowserUserId(nextUserId);
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, []);


  // =============================
  // UI (Unités iNrCy) — récompenses auto
  // - 50 UI à la 1ère ouverture du compte
  // - 50 UI d'ancienneté tous les 30 jours (1ère fois au 30e jour après création du compte)
  // =============================
  useEffect(() => {
    let cancelled = false;

    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

    const award = async (actionKey: string, amount: number, sourceId?: string, label?: string) => {
      try {
        await fetch("/api/loyalty/award", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actionKey,
            amount,
            sourceId: sourceId ?? null,
            label: label ?? null,
            meta: { origin: "dashboard" },
          }),
        });
      } catch {
        // ignore
      }
    };

    (async () => {
      // On laisse la RPC gérer l'idempotence via sourceId
      const supabase = createClient();
      const { data: authRes } = await supabase.auth.getUser();
      const userCreatedAt = authRes.user?.created_at ? new Date(authRes.user.created_at) : null;

      await award("account_open", 50, "once", "Ouverture du compte");

      if (userCreatedAt && !Number.isNaN(userCreatedAt.getTime())) {
        const elapsedMs = Date.now() - userCreatedAt.getTime();
        const seniorityCycles = Math.floor(elapsedMs / THIRTY_DAYS_MS);

        for (let cycle = 1; cycle <= seniorityCycles; cycle += 1) {
          if (cancelled) return;
          await award("monthly_seniority", 50, `seniority-${cycle}`, "Ancienneté");
        }
      }

      await refreshUiBalance();
      if (cancelled) return;
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // (re)charge le solde UI au chargement
  useEffect(() => {
    void refreshUiBalance();
  }, [refreshUiBalance]);

  const fetchGoogleConnected = useCallback(async (source: GoogleSource, product: GoogleProduct) => {
    const url = `/api/integrations/google-stats/status?source=${encodeURIComponent(source)}&product=${encodeURIComponent(product)}`;
    const res = await fetch(url, { method: "GET" }).catch(() => null);
    if (!res || !res.ok) return false;
    const json = (await res.json().catch(() => null)) as any;
    return !!json?.connected;
  }, []);

// ✅ Charge infos Site iNrCy + outils du pro depuis Supabase
// - ownership + url iNrCy : profiles
// - config iNrCy : inrcy_site_configs
// - outils du pro (site_web, gmb, facebook, houzz, pages_jaunes, ...) : pro_tools_configs
// (ancienne table site_configs supprimée)
const loadSiteInrcy = useCallback(async () => {
  const requestSeq = ++siteConfigRequestSeqRef.current;
  setSiteConnectionsReady(false);
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  if (!user || requestSeq !== siteConfigRequestSeqRef.current) {
    if (!user) setSiteConnectionsReady(true);
    return;
  }

  const [profileRes, bubbleAccessEnsureRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("inrcy_site_ownership,logo_url,logo_path,company_legal_name,first_name,last_name,phone,contact_email")
      .eq("user_id", user.id)
      .maybeSingle(),
    fetch("/api/bubble-access/ensure", { method: "GET", cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null),
  ]);
  if (requestSeq !== siteConfigRequestSeqRef.current) return;

  const nextBubbleAccessMap =
    bubbleAccessEnsureRes?.bubbleAccessMap && typeof bubbleAccessEnsureRes.bubbleAccessMap === "object"
      ? buildBubbleAccessMap(Object.entries(bubbleAccessEnsureRes.bubbleAccessMap).map(([bubble_key, enabled]) => ({
          bubble_key,
          enabled: Boolean(enabled),
        })))
      : createDefaultBubbleAccessMap();

  setBubbleAccessMap(nextBubbleAccessMap);
  writeCachedBubbleAccessMap(nextBubbleAccessMap);

  const profile = profileRes.data as any | null;
  const ownership = (profile?.inrcy_site_ownership ?? "none") as Ownership;
  const resolvedProfileLogo = await resolveProfileLogoUrl(supabase, {
    logo_path: profile?.logo_path ?? null,
    logo_url: profile?.logo_url ?? null,
  });
  if (requestSeq !== siteConfigRequestSeqRef.current) return;

  const nextInrBadgeProfile: InrBadgeProfileSummary = {
    userId: user.id,
    logoUrl: resolvedProfileLogo.logoUrl || "",
    companyLegalName: String(profile?.company_legal_name ?? ""),
    firstName: String(profile?.first_name ?? ""),
    lastName: String(profile?.last_name ?? ""),
    phone: String(profile?.phone ?? ""),
    contactEmail: String(profile?.contact_email ?? ""),
  };

  setInrBadgeProfile(nextInrBadgeProfile);
  mergeCachedDashboardChannelState({ inrBadgeProfile: nextInrBadgeProfile });

  const [inrcyRes, proRes] = await Promise.all([
    supabase
      .from("inrcy_site_configs")
      .select("contact_email,settings,site_url")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("pro_tools_configs")
      .select("settings")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  if (requestSeq !== siteConfigRequestSeqRef.current) return;

  const inrcyCfg = (inrcyRes.data as any | null) ?? null;
  const proCfg = (proRes.data as any | null) ?? null;
  type SettingsRow = { settings?: any | null } | null;
  const proSettingsObj = (proCfg as SettingsRow)?.settings ?? {};

  const siteInrcyUrlValue = (inrcyCfg?.site_url as string | undefined ?? "").trim();
  const siteInrcyContactEmailValue = (inrcyCfg?.contact_email ?? "") as string;
  const inrcySettingsObj = inrcyCfg?.settings ?? {};
  let siteInrcySettingsTextValue = "{}";
  try {
    siteInrcySettingsTextValue = JSON.stringify(inrcySettingsObj, null, 2);
  } catch {
    siteInrcySettingsTextValue = "{}";
  }

  const ga4MeasurementIdValue = (inrcySettingsObj as any)?.ga4?.measurement_id ?? "";
  const ga4PropertyIdValue = String((inrcySettingsObj as any)?.ga4?.property_id ?? "");
  const gscPropertyValue = (inrcySettingsObj as any)?.gsc?.property ?? "";

  const siteWebObj = (proSettingsObj as any)?.site_web ?? {};
  let siteWebSettingsTextValue = "{}";
  try {
    siteWebSettingsTextValue = JSON.stringify(siteWebObj, null, 2);
  } catch {
    siteWebSettingsTextValue = "{}";
  }

  const igObj = ((proSettingsObj as any)?.instagram ?? {}) as any;
  const liObj = ((proSettingsObj as any)?.linkedin ?? {}) as any;
  const gmbObj = ((proSettingsObj as any)?.gmb ?? {}) as any;
  const fbObj = ((proSettingsObj as any)?.facebook ?? {}) as any;
  const ytObj = ((proSettingsObj as any)?.youtube_shorts ?? {}) as any;
  const pinterestObj = ((proSettingsObj as any)?.pinterest ?? {}) as any;
  const trustpilotObj = ((proSettingsObj as any)?.trustpilot ?? {}) as any;
  const youtubeShortsUrlValue = String(ytObj?.channelUrl ?? ytObj?.url ?? "");
  const pinterestUrlValue = String(pinterestObj?.profileUrl ?? pinterestObj?.url ?? "");
  const trustpilotUrlValue = String(trustpilotObj?.profileUrl ?? trustpilotObj?.url ?? "");

  const nextState = {
    siteInrcyOwnership: ownership,
    siteInrcyUrl: siteInrcyUrlValue,
    siteInrcySavedUrl: siteInrcyUrlValue,
    siteInrcyContactEmail: siteInrcyContactEmailValue,
    siteInrcySettingsText: siteInrcySettingsTextValue,
    ga4MeasurementId: ga4MeasurementIdValue,
    ga4PropertyId: ga4PropertyIdValue,
    gscProperty: gscPropertyValue,
    siteInrcyActusLayout: ((inrcySettingsObj as any)?.actus_widget?.layout === "carousel" ? "carousel" : "list") as ActusLayout,
    siteInrcyActusLimit: [3, 5, 10].includes(Number((inrcySettingsObj as any)?.actus_widget?.limit)) ? Number((inrcySettingsObj as any)?.actus_widget?.limit) : 5,
    siteInrcyActusFont: (["site", "inter", "poppins", "montserrat", "lora"] as const).includes((inrcySettingsObj as any)?.actus_widget?.font as never) ? (inrcySettingsObj as any)?.actus_widget?.font as ActusFont : "site" as ActusFont,
    siteInrcyActusTheme: (["white", "dark", "gray", "nature", "sand"] as const).includes((inrcySettingsObj as any)?.actus_widget?.theme as never) ? (inrcySettingsObj as any)?.actus_widget?.theme as ActusTheme : "nature" as ActusTheme,
    siteWebSettingsText: siteWebSettingsTextValue,
    siteWebUrl: (siteWebObj as any)?.url ?? "",
    siteWebSavedUrl: (siteWebObj as any)?.url ?? "",
    siteWebGa4MeasurementId: (siteWebObj as any)?.ga4?.measurement_id ?? "",
    siteWebGa4PropertyId: String((siteWebObj as any)?.ga4?.property_id ?? ""),
    siteWebGscProperty: (siteWebObj as any)?.gsc?.property ?? "",
    siteWebActusLayout: ((siteWebObj as any)?.actus_widget?.layout === "carousel" ? "carousel" : "list") as ActusLayout,
    siteWebActusLimit: [3, 5, 10].includes(Number((siteWebObj as any)?.actus_widget?.limit)) ? Number((siteWebObj as any)?.actus_widget?.limit) : 5,
    siteWebActusFont: (["site", "inter", "poppins", "montserrat", "lora"] as const).includes((siteWebObj as any)?.actus_widget?.font as never) ? (siteWebObj as any)?.actus_widget?.font as ActusFont : "site" as ActusFont,
    siteWebActusTheme: (["white", "dark", "gray", "nature", "sand"] as const).includes((siteWebObj as any)?.actus_widget?.theme as never) ? (siteWebObj as any)?.actus_widget?.theme as ActusTheme : "nature" as ActusTheme,
    instagramUrl: igObj?.url ?? "",
    instagramAccountConnected: !!igObj?.accountConnected,
    instagramConnected: !!igObj?.connected,
    instagramConnectionStatus: (igObj?.connected ? "connected" : "disconnected") as ConnectionDisplayStatus,
    instagramUsername: String(igObj?.username ?? ""),
    linkedinUrl: liObj?.orgId ? (liObj?.orgUrl ?? liObj?.url ?? "") : (liObj?.profileUrl ?? liObj?.url ?? ""),
    linkedinAccountConnected: !!liObj?.accountConnected,
    linkedinConnected: !!liObj?.connected,
    linkedinConnectionStatus: (liObj?.connected || liObj?.accountConnected ? "connected" : "disconnected") as ConnectionDisplayStatus,
    linkedinDisplayName: String(liObj?.displayName ?? ""),
    linkedinSelectedOrganizationId: String(liObj?.orgId ?? ""),
    linkedinSelectedOrganizationName: String(liObj?.orgName ?? ""),
    gmbUrl: gmbObj?.url ?? "",
    gmbAccountConnected: !!gmbObj?.connected,
    gmbConfigured: !!gmbObj?.resource_id,
    gmbConnected: !!gmbObj?.connected && !!gmbObj?.resource_id,
    gmbConnectionStatus: (gmbObj?.connected && (gmbObj?.locationName || gmbObj?.resource_id) ? "connected" : "disconnected") as ConnectionDisplayStatus,
    gmbAccountEmail: gmbObj?.accountEmail ?? "",
    gmbLocationName: String(gmbObj?.locationName ?? gmbObj?.resource_id ?? ""),
    gmbLocationLabel: String(gmbObj?.locationTitle ?? gmbObj?.resource_label ?? ""),
    facebookUrl: fbObj?.url ?? "",
    facebookAccountConnected: !!fbObj?.accountConnected,
    facebookPageConnected: !!fbObj?.pageConnected,
    facebookConnectionStatus: (fbObj?.pageConnected ? "connected" : "disconnected") as ConnectionDisplayStatus,
    facebookAccountEmail: fbObj?.userEmail ?? "",
    fbSelectedPageId: fbObj?.pageId ?? "",
    fbSelectedPageName: fbObj?.pageName ?? "",
    youtubeShortsConnected: Boolean(ytObj?.connected),
    youtubeShortsUrl: youtubeShortsUrlValue,
    pinterestConnected: Boolean(pinterestObj?.connected),
    pinterestUrl: pinterestUrlValue,
    trustpilotConnected: Boolean(trustpilotObj?.connected),
    trustpilotUrl: trustpilotUrlValue,
    siteInrcyGa4Connected: !!(ga4MeasurementIdValue || ga4PropertyIdValue),
    siteInrcyGscConnected: !!gscPropertyValue,
    siteWebGa4Connected: !!((siteWebObj as any)?.ga4?.measurement_id || (siteWebObj as any)?.ga4?.property_id),
    siteWebGscConnected: !!((siteWebObj as any)?.gsc?.property),
    inrBadgeProfile: nextInrBadgeProfile,
  };

  try {
    const statesResponse = await fetch("/api/integrations/channel-states", { cache: "no-store" });
    const states = statesResponse.ok ? await statesResponse.json().catch(() => null) as any : null;
    if (requestSeq !== siteConfigRequestSeqRef.current) return;

    if (states) {
      nextState.siteInrcyGa4Connected = Boolean(states?.site_inrcy?.ga4 || ga4MeasurementIdValue || ga4PropertyIdValue);
      nextState.siteInrcyGscConnected = Boolean(states?.site_inrcy?.gsc || gscPropertyValue);
      nextState.siteWebGa4Connected = Boolean(states?.site_web?.ga4 || (siteWebObj as any)?.ga4?.measurement_id || (siteWebObj as any)?.ga4?.property_id);
      nextState.siteWebGscConnected = Boolean(states?.site_web?.gsc || (siteWebObj as any)?.gsc?.property);

      nextState.gmbConnected = !!states?.gmb?.connected;
      nextState.gmbAccountConnected = !!states?.gmb?.accountConnected;
      nextState.gmbConfigured = !!states?.gmb?.configured;
      nextState.gmbConnectionStatus = (states?.gmb?.connection_status || (states?.gmb?.connected ? "connected" : "disconnected")) as ConnectionDisplayStatus;
      if (states?.gmb?.email) nextState.gmbAccountEmail = String(states.gmb.email);
      if (states?.gmb?.resource_id) nextState.gmbLocationName = String(states.gmb.resource_id);
      if (states?.gmb?.resource_label) nextState.gmbLocationLabel = String(states.gmb.resource_label);
      if (states?.gmb?.url) nextState.gmbUrl = String(states.gmb.url);

      nextState.facebookAccountConnected = !!states?.facebook?.accountConnected;
      nextState.facebookPageConnected = !!states?.facebook?.pageConnected;
      nextState.facebookConnectionStatus = (states?.facebook?.connection_status || (states?.facebook?.connected ? "connected" : "disconnected")) as ConnectionDisplayStatus;
      if (states?.facebook?.user_email) nextState.facebookAccountEmail = String(states.facebook.user_email);
      if (states?.facebook?.resource_id) nextState.fbSelectedPageId = String(states.facebook.resource_id);
      if (states?.facebook?.resource_label) nextState.fbSelectedPageName = String(states.facebook.resource_label);
      if (states?.facebook?.page_url) nextState.facebookUrl = String(states.facebook.page_url);

      nextState.instagramAccountConnected = !!states?.instagram?.accountConnected;
      nextState.instagramConnected = !!states?.instagram?.connected;
      nextState.instagramConnectionStatus = (states?.instagram?.connection_status || (states?.instagram?.connected ? "connected" : "disconnected")) as ConnectionDisplayStatus;
      if (states?.instagram?.username) nextState.instagramUsername = String(states.instagram.username);
      if (states?.instagram?.profile_url) nextState.instagramUrl = String(states.instagram.profile_url);

      nextState.linkedinAccountConnected = !!states?.linkedin?.accountConnected;
      nextState.linkedinConnected = !!states?.linkedin?.connected;
      nextState.linkedinConnectionStatus = (states?.linkedin?.connection_status || (states?.linkedin?.connected ? "connected" : "disconnected")) as ConnectionDisplayStatus;
      if (states?.linkedin?.display_name) nextState.linkedinDisplayName = String(states.linkedin.display_name);

      if (states?.mails && Object.prototype.hasOwnProperty.call(states.mails, "connectedCount")) {
        (nextState as any).mailAccountsConnectedCount = sanitizeMailAccountsConnectedCount(states.mails.connectedCount);
      }

      if ((states?.linkedin as any)?.organization_id) {
        nextState.linkedinSelectedOrganizationId = String((states.linkedin as any).organization_id);
        nextState.linkedinUrl = String((states.linkedin as any).organization_url || states.linkedin.profile_url || "");
      } else if (states?.linkedin?.profile_url) {
        nextState.linkedinUrl = String(states.linkedin.profile_url);
      }
      if ((states?.linkedin as any)?.organization_name) nextState.linkedinSelectedOrganizationName = String((states.linkedin as any).organization_name);

      nextState.youtubeShortsConnected = Boolean(states?.youtube_shorts?.connected && !states?.youtube_shorts?.requiresUpdate);
      nextState.youtubeShortsUrl = String(states?.youtube_shorts?.channel_url || "");

      nextState.pinterestConnected = Boolean(states?.pinterest?.connected && !states?.pinterest?.requiresUpdate);
      nextState.pinterestUrl = String(states?.pinterest?.profile_url || pinterestUrlValue || "");

      nextState.trustpilotConnected = Boolean(states?.trustpilot?.connected && !states?.trustpilot?.requiresUpdate);
      nextState.trustpilotUrl = String(states?.trustpilot?.profile_url || trustpilotUrlValue || "");
    } else {
      const [inrcyGa4, inrcyGsc, webGa4, webGsc] = await Promise.all([
        fetchGoogleConnected("site_inrcy", "ga4"),
        fetchGoogleConnected("site_inrcy", "gsc"),
        fetchGoogleConnected("site_web", "ga4"),
        fetchGoogleConnected("site_web", "gsc"),
      ]);
      if (requestSeq !== siteConfigRequestSeqRef.current) return;
      nextState.siteInrcyGa4Connected = inrcyGa4;
      nextState.siteInrcyGscConnected = inrcyGsc;
      nextState.siteWebGa4Connected = webGa4;
      nextState.siteWebGscConnected = webGsc;
    }
  } catch {
    if (requestSeq !== siteConfigRequestSeqRef.current) return;
  }

  if (requestSeq !== siteConfigRequestSeqRef.current) return;
  writeCachedDashboardChannelState(nextState);
  applyDashboardChannelState(nextState, { markReady: true });
}, [applyDashboardChannelState, fetchGoogleConnected]);

useEffect(() => {
  loadSiteInrcy();
}, [loadSiteInrcy]);

const savedSiteInrcyUrlMeta = normalizeSiteUrl(siteInrcySavedUrl);
const savedSiteWebUrlMeta = normalizeSiteUrl(siteWebSavedUrl);
const draftSiteInrcyUrlMeta = normalizeSiteUrl(siteInrcyUrl);
const draftSiteWebUrlMeta = normalizeSiteUrl(siteWebUrl);

const canViewSite = canAccessSiteInrcy && !!savedSiteInrcyUrlMeta;
const canConfigureSite = canAccessSiteInrcy;

// ✅ UX : Google ne devient connectable qu'une fois un vrai lien enregistré
const hasSiteInrcyUrl = !!savedSiteInrcyUrlMeta;
const hasSiteWebUrl = !!savedSiteWebUrlMeta;
const canConnectSiteInrcyGoogle = canConfigureSite && hasSiteInrcyUrl;
const canConnectSiteWebGoogle = hasSiteWebUrl;

const siteInrcyProgressCount = (hasSiteInrcyUrl ? 1 : 0) + (hasSiteInrcyUrl && siteInrcyGa4Connected ? 1 : 0) + (hasSiteInrcyUrl && siteInrcyGscConnected ? 1 : 0);
const siteWebProgressCount = (hasSiteWebUrl ? 1 : 0) + (hasSiteWebUrl && siteWebGa4Connected ? 1 : 0) + (hasSiteWebUrl && siteWebGscConnected ? 1 : 0);
const siteInrcyAllGreen = canAccessSiteInrcy && siteInrcyProgressCount === 3;
const siteWebAllGreen = siteWebProgressCount === 3;
const profileCompleted = !profileIncomplete;
const activityCompleted = !activityIncomplete;
const sitePowerLinkConnected = hasSiteInrcyUrl || hasSiteWebUrl;
const sitePowerGa4Connected = (hasSiteInrcyUrl && siteInrcyGa4Connected) || (hasSiteWebUrl && siteWebGa4Connected);
const sitePowerGscConnected = (hasSiteInrcyUrl && siteInrcyGscConnected) || (hasSiteWebUrl && siteWebGscConnected);
const videoPowerConnected = Boolean(tiktokConnected || youtubeShortsConnected);
const proNetworkPowerConnected = Boolean(
  (linkedinConnected && linkedinConnectionStatus !== "needs_update") || (canAccessPinterest && pinterestConnected)
);

const generatorPowerSteps = [
  { key: "profile", label: "Compléter mon profil", shortLabel: "Profil", weight: 10, completed: profileCompleted },
  { key: "activity", label: "Compléter mon activité", shortLabel: "Activité", weight: 10, completed: activityCompleted },
  { key: "site_link", label: "Connecter un site internet", shortLabel: "Site internet", weight: 10, completed: sitePowerLinkConnected },
  { key: "site_ga4", label: "Brancher GA4", shortLabel: "GA4", weight: 5, completed: sitePowerGa4Connected },
  { key: "site_gsc", label: "Brancher GSC", shortLabel: "GSC", weight: 5, completed: sitePowerGscConnected },
  { key: "gmb", label: "Connecter Google Business", shortLabel: "Google Business", weight: 20, completed: gmbConnected && gmbConnectionStatus !== "needs_update" },
  { key: "facebook", label: "Connecter Facebook", shortLabel: "Facebook", weight: 10, completed: facebookPageConnected && facebookConnectionStatus !== "needs_update" },
  { key: "instagram", label: "Connecter Instagram", shortLabel: "Instagram", weight: 10, completed: instagramConnected && instagramConnectionStatus !== "needs_update" },
  { key: "pro_network", label: "Connecter LinkedIn ou Pinterest", shortLabel: "LinkedIn / Pinterest", weight: 7, completed: proNetworkPowerConnected },
  { key: "mails", label: "Connecter Mails", shortLabel: "Mails", weight: 5, completed: mailAccountsConnectedCount > 0 },
  { key: "video", label: "Connecter TikTok ou YouTube", shortLabel: "TikTok / YouTube", weight: 8, completed: videoPowerConnected },
] as const;

const computedGeneratorPower = generatorPowerSteps.reduce((sum, step) => sum + (step.completed ? step.weight : 0), 0);
const usingCachedGeneratorPower = !siteConnectionsReady && displayedGeneratorPower !== null && displayedGeneratorPower > computedGeneratorPower;
const generatorPower = usingCachedGeneratorPower ? displayedGeneratorPower : computedGeneratorPower;
const computedNextGeneratorPowerStep = generatorPowerSteps.find((step) => !step.completed) ?? null;
const computedRemainingGeneratorPowerSteps = generatorPowerSteps.filter((step) => !step.completed).length;
const nextGeneratorPowerStep = usingCachedGeneratorPower && generatorPower >= 100 ? null : computedNextGeneratorPowerStep;
const remainingGeneratorPowerSteps = usingCachedGeneratorPower && generatorPower >= 100 ? 0 : computedRemainingGeneratorPowerSteps;

useEffect(() => {
  if (!siteConnectionsReady) return;
  setDisplayedGeneratorPower(computedGeneratorPower);
  try {
    writeUiCacheValue(GENERATOR_POWER_CACHE_KEY, String(computedGeneratorPower));
  } catch {
    // ignore browser storage failures
  }
}, [computedGeneratorPower, siteConnectionsReady]);

const applyGeneratorCacheToState = useCallback(() => {
    const mergedPayload = readGeneratorCache()?.payload;
    if (!mergedPayload || typeof mergedPayload !== "object") return false;

    setKpis(mergedPayload as any);
    const oppMonth = Number((mergedPayload as any)?.details?.opportunities?.month);
    if (Number.isFinite(oppMonth)) {
      setOppTotal(oppMonth);
      try {
        writeUiCacheValue("inrcy_opp30_total_v1", String(oppMonth));
      } catch {
        // ignore
      }
    }

    return true;
  }, []);

  useEffect(() => {
    if (!channelBlocks) return;

    const hasActiveGeneratorSource = DASHBOARD_CHANNEL_KEYS.some((channel) => {
      const block = channelBlocks[channel];
      const connection = block?.connection;
      if (!connection) return false;
      if (connection.requiresUpdate || connection.connectionStatus === "needs_update") return false;
      if (channel === "site_inrcy" || channel === "site_web") {
        return Boolean(connection.statsConnected);
      }
      return Boolean(connection.connected);
    });

    if (hasActiveGeneratorSource) return;

    syncGeneratorOpportunitiesFromStatsSummary({
      byCube: {},
      estimatedByCube: {},
      syncedAt: Date.now(),
      snapshotDate: expectedUiSnapshotDate(),
      channelBlocks,
    });
    applyGeneratorCacheToState();
  }, [applyGeneratorCacheToState, channelBlocks]);

  const notifyGeneratorRefresh = useCallback((at?: number, channels?: readonly DashboardChannelKey[]) => {
    if (typeof window === "undefined") return;
    const syncAt = Number.isFinite(Number(at)) ? Number(at) : Date.now();
    const normalizedChannels = Array.isArray(channels)
      ? Array.from(new Set(channels.filter((channel): channel is DashboardChannelKey => typeof channel === "string" && channel.length > 0)))
      : [];

    if (normalizedChannels.length) {
      for (const channel of normalizedChannels) {
        window.dispatchEvent(new CustomEvent("inrcy:generator-channel-updated", { detail: { channel, at: syncAt } }));
      }
    }

    window.dispatchEvent(new CustomEvent("inrcy:generator-channels-updated", {
      detail: { at: syncAt, channels: normalizedChannels.length ? normalizedChannels : DASHBOARD_CHANNEL_KEYS },
    }));
  }, []);

const refreshKpis = useCallback(async (options?: { fresh?: boolean; syncedAt?: number; silent?: boolean }) => {
    const requestSeq = ++kpisRequestSeqRef.current;
    const fresh = options?.fresh === true;
    const silent = options?.silent === true;
    if (!silent || !kpis) setKpisLoading(true);
    try {
      const params = new URLSearchParams();
      const snapshotDate = expectedUiSnapshotDate();
      if (fresh) params.set("fresh", "1");
      if (snapshotDate) params.set("snapshotDate", snapshotDate);
      const url = `/api/metrics/summary${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 404) {
          if (requestSeq !== kpisRequestSeqRef.current) return;
          return;
        }
        throw new Error(`KPIs fetch failed: ${res.status}`);
      }
      const json = await res.json();
      if (requestSeq !== kpisRequestSeqRef.current) return;
      setKpis(json);
      const oppMonth = Number(json?.details?.opportunities?.month);
      if (Number.isFinite(oppMonth)) {
        setOppTotal(oppMonth);
        try {
          writeUiCacheValue("inrcy_opp30_total_v1", String(oppMonth));
        } catch {
          // ignore
        }
      }
      try {
        const syncedAt = Number.isFinite(Number(options?.syncedAt)) ? Number(options?.syncedAt) : Date.now();
        const responseSnapshotDate = typeof json?.meta?.snapshotDate === "string" ? json.meta.snapshotDate : null;
        writeUiCacheValue("inrcy_generator_kpis_v1", JSON.stringify({ syncedAt, snapshotDate: responseSnapshotDate || snapshotDate || null, payload: json }));
        notifyGeneratorRefresh(syncedAt, DASHBOARD_CHANNEL_KEYS);
      } catch {
        // ignore
      }
    } catch (err) {
      if (requestSeq !== kpisRequestSeqRef.current) return;
      console.error(err);
      // Keep the last known KPIs to avoid a visual "blink".
      // If nothing exists yet, we'll display 0.
    } finally {
      if (requestSeq === kpisRequestSeqRef.current && (!silent || !kpis)) {
        setKpisLoading(false);
      }
    }
  }, [kpis, notifyGeneratorRefresh]);

  const notifyStatsRefresh = useCallback((at?: number, channels?: readonly DashboardChannelKey[]) => {
    if (typeof window === "undefined") return;
    const syncAt = Number.isFinite(Number(at)) ? Number(at) : Date.now();
    const normalizedChannels = Array.isArray(channels)
      ? Array.from(new Set(channels.filter((channel): channel is DashboardChannelKey => typeof channel === "string" && channel.length > 0)))
      : [];

    if (normalizedChannels.length) {
      markChannelsSynced(normalizedChannels, syncAt);
      for (const channel of normalizedChannels) {
        window.dispatchEvent(new CustomEvent("inrcy:channel-updated", { detail: { channel, at: syncAt } }));
      }
    } else {
      try {
        writeUiCacheValue("inrcy_stats_last_channel_sync_v1", String(syncAt));
      } catch {
        // ignore
      }
    }

    window.dispatchEvent(new CustomEvent("inrcy:channels-updated", { detail: { at: syncAt, channels: normalizedChannels.length ? normalizedChannels : undefined } }));
  }, []);

  const warmInrStatsUi = useCallback(async (options?: {
    syncedAt?: number;
    fresh?: boolean;
    targetPeriods?: StatsWarmPeriod[];
    syncByPeriod?: Partial<Record<StatsWarmPeriod, number>>;
  }) => {
    if (typeof window === "undefined") return;

    const periods: StatsWarmPeriod[] = options?.targetPeriods?.length ? options.targetPeriods : [7, 30];
    const syncAt = Number.isFinite(Number(options?.syncedAt)) ? Number(options?.syncedAt) : Date.now();
    const fresh = options?.fresh === true;
    const syncByPeriod = options?.syncByPeriod || {};

    await Promise.allSettled(
      periods.map(async (days) => {
        const params = new URLSearchParams({ days: String(days) });
        const expectedSnapshotDate = expectedUiSnapshotDate();
        if (fresh) params.set("fresh", "1");
        if (expectedSnapshotDate) params.set("snapshotDate", expectedSnapshotDate);
        const res = await fetch(`/api/stats/dashboard-bulk?${params.toString()}`, {
          cache: "no-store",
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error(`iNrStats warmup failed: ${res.status}`);
        }

        const json = await res.json().catch(() => null);
        const overviews = json?.overviews;
        const opportunities = json?.opportunities;
        const blocks = json?.blocks;
        const snapshotDate = typeof json?.meta?.snapshotDate === "string" ? json.meta.snapshotDate : getOverviewSnapshotDate(overviews) || expectedSnapshotDate;

        if (!overviews || typeof overviews !== "object") return;

        const normalizedBlocks = blocks && typeof blocks === "object" ? (blocks as InrstatsChannelBlocksByChannel) : null;

        try {
          writeUiCacheValue(
            statsCubeSessionKey(days),
            JSON.stringify({ syncedAt: Number.isFinite(Number(syncByPeriod[days])) ? Number(syncByPeriod[days]) : syncAt, snapshotDate, overviews, blocks: normalizedBlocks })
          );
        } catch {
          // ignore
        }

        if (normalizedBlocks) {
          setChannelBlocks(normalizedBlocks);
        }

        try {
          writeUiCacheValue(
            statsSummarySessionKey(days),
            JSON.stringify({
              syncedAt: Number.isFinite(Number(syncByPeriod[days])) ? Number(syncByPeriod[days]) : syncAt,
              snapshotDate,
              total: Number(opportunities?.total ?? 0),
              byCube: opportunities?.byCube ?? {},
              profile: json?.profile ?? {},
              estimatedByCube: json?.estimatedByCube ?? {},
            })
          );
        } catch {
          // ignore
        }

        if (days === 30) {
          syncGeneratorOpportunitiesFromStatsSummary({
            byCube: opportunities?.byCube ?? {},
            estimatedByCube: json?.estimatedByCube ?? {},
            profile: json?.profile ?? {},
            syncedAt: Number.isFinite(Number(syncByPeriod[days])) ? Number(syncByPeriod[days]) : syncAt,
            snapshotDate,
            channelBlocks: normalizedBlocks ?? undefined,
          });
          applyGeneratorCacheToState();
        }
      })
    );
  }, [applyGeneratorCacheToState]);

  const refreshTimersRef = useRef<number[]>([]);
  const lastGeneratorRefreshAtRef = useRef(0);
  const lastServerCacheCheckAtRef = useRef(0);
  const serverCacheCheckPromiseRef = useRef<Promise<void> | null>(null);
  const inFlightStatsChannelRefreshesRef = useRef<Partial<Record<DashboardChannelKey, Promise<ChannelStatsRefreshResult>>>>({});
  const lastStatsChannelRefreshAtRef = useRef<Partial<Record<DashboardChannelKey, number>>>({});
  const inFlightGeneratorChannelRefreshesRef = useRef<Partial<Record<DashboardChannelKey, Promise<GeneratorChannelRefreshResult>>>>({});
  const lastGeneratorChannelRefreshAtRef = useRef<Partial<Record<DashboardChannelKey, number>>>({});

  const clearScheduledGeneratorRefreshes = useCallback(() => {
    refreshTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    refreshTimersRef.current = [];
  }, []);

  const applyChannelRefreshPayload = useCallback((channel: DashboardChannelKey, payload: {
    periods?: Partial<Record<string, { block?: InrstatsChannelBlock; overview?: unknown; syncedAt?: number; snapshotDate?: string | null }>>;
  } | null | undefined, fallbackSyncAt?: number) => {
    const syncAt = Number.isFinite(Number(fallbackSyncAt)) ? Number(fallbackSyncAt) : Date.now();
    let preferredBlock: InrstatsChannelBlock | null = null;
    let latestSyncAt = syncAt;

    for (const period of [7, 30] as StatsWarmPeriod[]) {
      const periodPayload = payload?.periods?.[String(period)];
      const block = periodPayload?.block;
      if (!block || typeof block !== "object") continue;

      const periodSyncAt = Number.isFinite(Number(periodPayload?.syncedAt)) ? Number(periodPayload?.syncedAt) : (block.syncAt ?? syncAt);
      latestSyncAt = Math.max(latestSyncAt, periodSyncAt);

      mergeChannelBlockIntoCachedSnapshots({
        period,
        channel,
        block,
        overview: periodPayload?.overview,
        syncedAt: periodSyncAt,
        snapshotDate: typeof periodPayload?.snapshotDate === "string" ? periodPayload.snapshotDate : block.snapshotDate ?? null,
      });

      if (period === 30 || !preferredBlock) {
        preferredBlock = block;
      }
    }

    if (preferredBlock) {
      setChannelBlocks((previous) => ({
        ...(previous ?? createEmptyChannelBlocks()),
        [channel]: preferredBlock as InrstatsChannelBlock,
      }));
      markChannelsSynced([channel], latestSyncAt);
    }

    return { preferredBlock, syncAt: latestSyncAt };
  }, []);

  const updateChannelBlockLocally = useCallback((
    channel: DashboardChannelKey,
    updater: (current: InrstatsChannelBlock) => InrstatsChannelBlock,
  ) => {
    const currentBlocks = channelBlocksRef.current ?? createEmptyChannelBlocks();
    const currentBlock = currentBlocks[channel] ?? createEmptyChannelBlock(channel);
    const nextBlock = updater({
      ...currentBlock,
      capturedLeads: (currentBlock as Partial<InrstatsChannelBlock>).capturedLeads ?? { week: 0, month: 0 },
      connection: { ...currentBlock.connection },
    });
    const nextSyncAt = Number.isFinite(Number(nextBlock.syncAt)) ? Number(nextBlock.syncAt) : Date.now();
    const nextBlocks = { ...currentBlocks, [channel]: nextBlock };

    channelBlocksRef.current = nextBlocks;
    setChannelBlocks(nextBlocks);

    for (const period of [7, 30] as StatsWarmPeriod[]) {
      mergeChannelBlockIntoCachedSnapshots({
        period,
        channel,
        block: nextBlock,
        syncedAt: nextSyncAt,
        snapshotDate: nextBlock.snapshotDate ?? expectedUiSnapshotDate(),
      });
    }

    notifyStatsRefresh(nextSyncAt, [channel]);
    return nextBlock;
  }, [notifyStatsRefresh]);

  const patchChannelConnectionLocally = useCallback((
    channel: DashboardChannelKey,
    patch: Partial<InrstatsChannelBlock["connection"]>,
    options?: { clearData?: boolean; clearError?: boolean },
  ) => updateChannelBlockLocally(channel, (current) => ({
    ...current,
    connection: {
      ...current.connection,
      ...patch,
    },
    overview: options?.clearData ? null : current.overview,
    opportunities: options?.clearData ? 0 : current.opportunities,
    capturedLeads: options?.clearData ? { week: 0, month: 0 } : current.capturedLeads,
    estimatedValue: options?.clearData ? 0 : current.estimatedValue,
    live: options?.clearData ? false : current.live,
    error: options?.clearError === false ? current.error : null,
    syncAt: Date.now(),
    snapshotDate: expectedUiSnapshotDate(),
  })), [updateChannelBlockLocally]);
  patchChannelConnectionLocallyRef.current = patchChannelConnectionLocally;

  const refreshChannelBlocksFromApi = useCallback(async (channel: DashboardChannelKey, fallbackSyncAt?: number, options?: ChannelRefreshOptions) => {
    const inFlight = inFlightStatsChannelRefreshesRef.current[channel];
    if (inFlight) return inFlight;

    const now = Date.now();
    const dedupeMs = Number.isFinite(Number(options?.dedupeMs)) ? Number(options?.dedupeMs) : CHANNEL_REFRESH_DEDUP_MS;
    const lastRefreshAt = Number(lastStatsChannelRefreshAtRef.current[channel] ?? 0);

    if (!options?.force && lastRefreshAt > 0 && now - lastRefreshAt < dedupeMs) {
      return { preferredBlock: null, syncAt: lastRefreshAt };
    }

    const job = (async (): Promise<ChannelStatsRefreshResult> => {
      lastStatsChannelRefreshAtRef.current[channel] = Date.now();

      const res = await fetch("/api/stats/channel-refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel }),
        cache: "no-store",
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error(`Channel refresh failed: ${res.status}`);
      }

      const json = await res.json().catch(() => null) as {
        periods?: Partial<Record<string, { block?: InrstatsChannelBlock; overview?: unknown; syncedAt?: number; snapshotDate?: string | null }>>;
      } | null;

      const applied = applyChannelRefreshPayload(channel, json, fallbackSyncAt);
      lastStatsChannelRefreshAtRef.current[channel] = Number.isFinite(Number(applied.syncAt)) ? Number(applied.syncAt) : Date.now();
      return applied;
    })();

    inFlightStatsChannelRefreshesRef.current[channel] = job;

    try {
      return await job;
    } finally {
      if (inFlightStatsChannelRefreshesRef.current[channel] === job) {
        delete inFlightStatsChannelRefreshesRef.current[channel];
      }
    }
  }, [applyChannelRefreshPayload]);

  const refreshAllChannelBlocksFromApi = useCallback(async (fallbackSyncAt?: number, options?: ChannelRefreshOptions) => {
    for (const channel of DASHBOARD_CHANNEL_KEYS) {
      await refreshChannelBlocksFromApi(channel, fallbackSyncAt, options);
    }
  }, [refreshChannelBlocksFromApi]);

  const applyGeneratorChannelRefreshPayload = useCallback((channel: DashboardChannelKey, payload: {
    syncAt?: number;
    generator?: {
      block?: {
        channel?: DashboardChannelKey;
        leads?: { today?: number; week?: number; month?: number };
        opportunities?: { month?: number };
        estimatedValue?: number;
        syncAt?: number | null;
        snapshotDate?: string | null;
        live?: boolean;
        error?: string | null;
      };
      details?: { profile?: unknown };
      meta?: { snapshotDate?: string | null; live?: boolean };
    };
  } | null | undefined, fallbackSyncAt?: number) => {
    const block = payload?.generator?.block;
    if (!block || typeof block !== "object") {
      return { block: null, syncAt: Number.isFinite(Number(fallbackSyncAt)) ? Number(fallbackSyncAt) : Date.now() };
    }

    const syncAt = Number.isFinite(Number(payload?.syncAt))
      ? Number(payload?.syncAt)
      : Number.isFinite(Number(fallbackSyncAt))
        ? Number(fallbackSyncAt)
        : Date.now();
    const resolvedSnapshotDate = typeof payload?.generator?.meta?.snapshotDate === "string"
      ? payload.generator.meta.snapshotDate
      : (typeof block.snapshotDate === "string" ? block.snapshotDate : expectedUiSnapshotDate());

    mergeGeneratorChannelBlockIntoCachedKpis({
      channel,
      block: {
        channel,
        leads: {
          today: Math.max(0, Math.round(Number(block.leads?.today ?? 0))),
          week: Math.max(0, Math.round(Number(block.leads?.week ?? 0))),
          month: Math.max(0, Math.round(Number(block.leads?.month ?? 0))),
        },
        opportunities: {
          month: Math.max(0, Math.round(Number(block.opportunities?.month ?? 0))),
        },
        estimatedValue: Math.max(0, Math.round(Number(block.estimatedValue ?? 0))),
        syncAt,
        snapshotDate: resolvedSnapshotDate ?? null,
        live: typeof payload?.generator?.meta?.live === "boolean" ? payload.generator.meta.live : Boolean(block.live),
        error: typeof block.error === "string" ? block.error : null,
      },
      syncedAt: syncAt,
      snapshotDate: resolvedSnapshotDate ?? null,
      live: typeof payload?.generator?.meta?.live === "boolean" ? payload.generator.meta.live : Boolean(block.live),
      profile: payload?.generator?.details?.profile,
    });

    applyGeneratorCacheToState();
    notifyGeneratorRefresh(syncAt, [channel]);

    return { block, syncAt };
  }, [applyGeneratorCacheToState, notifyGeneratorRefresh]);

  const refreshGeneratorChannelFromApi = useCallback(async (channel: DashboardChannelKey, fallbackSyncAt?: number, options?: ChannelRefreshOptions) => {
    const inFlight = inFlightGeneratorChannelRefreshesRef.current[channel];
    if (inFlight) return inFlight;

    const now = Date.now();
    const dedupeMs = Number.isFinite(Number(options?.dedupeMs)) ? Number(options?.dedupeMs) : CHANNEL_REFRESH_DEDUP_MS;
    const lastRefreshAt = Number(lastGeneratorChannelRefreshAtRef.current[channel] ?? 0);

    if (!options?.force && lastRefreshAt > 0 && now - lastRefreshAt < dedupeMs) {
      return { block: null, syncAt: lastRefreshAt };
    }

    const job = (async (): Promise<GeneratorChannelRefreshResult> => {
      lastGeneratorChannelRefreshAtRef.current[channel] = Date.now();

      const res = await fetch("/api/metrics/channel-refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel }),
        cache: "no-store",
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error(`Generator channel refresh failed: ${res.status}`);
      }

      const json = await res.json().catch(() => null) as {
        syncAt?: number;
        generator?: {
          block?: {
            channel?: DashboardChannelKey;
            leads?: { today?: number; week?: number; month?: number };
            opportunities?: { month?: number };
            estimatedValue?: number;
            syncAt?: number | null;
            snapshotDate?: string | null;
            live?: boolean;
            error?: string | null;
          };
          details?: { profile?: unknown };
          meta?: { snapshotDate?: string | null; live?: boolean };
        };
      } | null;

      const applied = applyGeneratorChannelRefreshPayload(channel, json, fallbackSyncAt);
      lastGeneratorChannelRefreshAtRef.current[channel] = Number.isFinite(Number(applied.syncAt)) ? Number(applied.syncAt) : Date.now();
      return applied;
    })();

    inFlightGeneratorChannelRefreshesRef.current[channel] = job;

    try {
      return await job;
    } finally {
      if (inFlightGeneratorChannelRefreshesRef.current[channel] === job) {
        delete inFlightGeneratorChannelRefreshesRef.current[channel];
      }
    }
  }, [applyGeneratorChannelRefreshPayload]);

  const refreshGeneratorChannelsFromApi = useCallback(async (channelsInput: readonly DashboardChannelKey[], fallbackSyncAt?: number, options?: ChannelRefreshOptions) => {
    const channels = Array.from(new Set(channelsInput.filter((channel): channel is DashboardChannelKey => typeof channel === "string" && channel.length > 0)));
    for (const channel of channels) {
      await refreshGeneratorChannelFromApi(channel, fallbackSyncAt, options);
    }
  }, [refreshGeneratorChannelFromApi]);

  const refreshAllGeneratorChannelsFromApi = useCallback(async (fallbackSyncAt?: number, options?: ChannelRefreshOptions) => {
    await refreshGeneratorChannelsFromApi(DASHBOARD_CHANNEL_KEYS, fallbackSyncAt, options);
  }, [refreshGeneratorChannelsFromApi]);

  const applyBootstrapRefresh = useCallback((bootstrap: DailyStatsRefreshBootstrapResponse) => {
    const syncAt = Number.isFinite(Number(bootstrap?.syncAt)) ? Number(bootstrap.syncAt) : Date.now();
    const bootstrapSnapshotDate = typeof bootstrap?.snapshotDate === "string"
      ? bootstrap.snapshotDate
      : expectedUiSnapshotDate();

    markDailyStatsRefreshBootstrapChecked({ snapshotDate: bootstrapSnapshotDate, checkedAt: Date.now(), syncAt });

    if (!bootstrap?.ran) {
      return { syncAt, bootstrapSnapshotDate };
    }

    const generator = bootstrap.generator;

    if (generator) {
      setKpis(generator);
      const oppMonth = Number(generator?.details?.opportunities?.month);
      if (Number.isFinite(oppMonth)) {
        setOppTotal(oppMonth);
        try {
          writeUiCacheValue("inrcy_opp30_total_v1", String(oppMonth));
        } catch {
          // ignore
        }
      }

      try {
        const generatorSnapshotDate = typeof generator?.meta?.snapshotDate === "string"
          ? generator.meta.snapshotDate
          : bootstrapSnapshotDate ?? null;
        writeUiCacheValue(
          "inrcy_generator_kpis_v1",
          JSON.stringify({ syncedAt: syncAt, snapshotDate: generatorSnapshotDate, payload: generator })
        );
      } catch {
        // ignore
      }
    }

    for (const [periodKey, payload] of Object.entries(bootstrap.inrstats || {})) {
      const days = Number(periodKey) as StatsWarmPeriod;
      if (![7, 30].includes(days)) continue;
      const overviews = payload?.overviews;
      if (!overviews || typeof overviews !== "object") continue;
      const payloadSnapshotDate = typeof payload?.meta?.snapshotDate === "string"
        ? payload.meta.snapshotDate
        : getOverviewSnapshotDate(overviews) || bootstrapSnapshotDate || null;
      const payloadBlocks = payload?.blocks && typeof payload.blocks === "object"
        ? payload.blocks as InrstatsChannelBlocksByChannel
        : null;

      try {
        writeUiCacheValue(
          statsCubeSessionKey(days),
          JSON.stringify({ syncedAt: syncAt, snapshotDate: payloadSnapshotDate, overviews, blocks: payloadBlocks })
        );
        writeUiCacheValue(
          statsSummarySessionKey(days),
          JSON.stringify({
            syncedAt: syncAt,
            snapshotDate: payloadSnapshotDate,
            total: Number(payload?.opportunities?.total ?? 0),
            byCube: payload?.opportunities?.byCube ?? {},
            profile: payload?.profile ?? {},
            estimatedByCube: payload?.estimatedByCube ?? {},
          })
        );
      } catch {
        // ignore
      }

      if (payloadBlocks) {
        setChannelBlocks(payloadBlocks);
      }
    }

    notifyStatsRefresh(syncAt);
    return { syncAt, bootstrapSnapshotDate };
  }, [notifyStatsRefresh]);
  latestApplyBootstrapRefreshRef.current = applyBootstrapRefresh;

  const syncFromServerCacheIfNeeded = useCallback(async (force = false) => {
    if (typeof window === "undefined") return;
    const now = Date.now();
    const snapshotDate = expectedUiSnapshotDate();
    if (force) {
      if (now - lastServerCacheCheckAtRef.current < FORCED_SERVER_CACHE_CHECK_DEDUP_MS) return;
    } else {
      if (now - lastServerCacheCheckAtRef.current < 60_000) return;
      if (wasServerCacheSyncCheckedRecently("dashboard", { snapshotDate })) return;
    }
    if (serverCacheCheckPromiseRef.current) {
      await serverCacheCheckPromiseRef.current;
      return;
    }

    const job = (async () => {
      lastServerCacheCheckAtRef.current = now;
      try {
        const res = await fetch("/api/dashboard/cache-status", {
          cache: "no-store",
          credentials: "include",
        });
        if (!res.ok) return;
        const json = await res.json().catch(() => null);
        if (json?.connections?.needsRefresh === true) {
          if (now - lastAutoDailyRefreshAtRef.current < AUTO_DAILY_REFRESH_DEDUP_MS) {
            markServerCacheSyncChecked("dashboard", { snapshotDate, checkedAt: Date.now() });
            return;
          }

          lastAutoDailyRefreshAtRef.current = now;
          const bootstrap = await runDailyStatsRefreshBootstrap({ announce: false, force });
          applyBootstrapRefresh(bootstrap);
          markServerCacheSyncChecked("dashboard", { snapshotDate, checkedAt: Date.now(), syncAt: Number(bootstrap?.syncAt ?? Date.now()) });
          return;
        }

        const generatorSyncedAt = Number(json?.generator?.syncedAt ?? 0);
        const generatorChannelStatuses = json?.generator?.channels && typeof json.generator.channels === "object"
          ? json.generator.channels as Partial<Record<DashboardChannelKey, number>>
          : null;
        const localGeneratorSyncedAt = readGeneratorCache()?.syncedAt || 0;
        const staleGeneratorChannels = generatorChannelStatuses
          ? Object.entries(generatorChannelStatuses)
              .filter(([channel, serverTs]) => Number(serverTs ?? 0) > readCachedGeneratorChannelSyncAt(channel as DashboardChannelKey))
              .map(([channel]) => channel as DashboardChannelKey)
          : [];

        const periodStatuses: Partial<Record<StatsWarmPeriod, { syncedAt?: number; channels?: Partial<Record<DashboardChannelKey, number>> }>> = {
          7: json?.inrstats?.[7] ?? json?.inrstats?.["7"] ?? null,
          30: json?.inrstats?.[30] ?? json?.inrstats?.["30"] ?? null,
        };
        const periodSyncs: Partial<Record<StatsWarmPeriod, number>> = {
          7: Number(periodStatuses[7]?.syncedAt ?? 0),
          30: Number(periodStatuses[30]?.syncedAt ?? 0),
        };
        const staleChannelsByPeriod = ([7, 30] as StatsWarmPeriod[]).reduce((acc, days) => {
          const channels = periodStatuses[days]?.channels;
          acc[days] = !channels || typeof channels !== "object"
            ? []
            : Object.entries(channels)
                .filter(([channel, serverTs]) => Number(serverTs ?? 0) > readCachedChannelSyncAt(days, channel as DashboardChannelKey))
                .map(([channel]) => channel as DashboardChannelKey);
          return acc;
        }, {} as Partial<Record<StatsWarmPeriod, DashboardChannelKey[]>>);
        const stalePeriods = ([7, 30] as StatsWarmPeriod[]).filter((days) => {
          const serverTs = Number(periodSyncs[days] ?? 0);
          if (serverTs <= readInrStatsPeriodSyncAt(days)) return false;
          return readInrStatsPeriodSyncAt(days) === 0 || !(staleChannelsByPeriod[days]?.length);
        });
        const staleChannels = Array.from(new Set((([7, 30] as StatsWarmPeriod[])
          .filter((days) => !stalePeriods.includes(days))
          .flatMap((days) => staleChannelsByPeriod[days] || []))));

        const generatorChannelsToRefresh = Array.from(new Set([
          ...staleGeneratorChannels,
          ...staleChannels,
        ]));
        if (!generatorChannelsToRefresh.length && generatorSyncedAt > localGeneratorSyncedAt) {
          generatorChannelsToRefresh.push(...DASHBOARD_CHANNEL_KEYS);
        }

        await Promise.allSettled([
          generatorChannelsToRefresh.length
            ? refreshGeneratorChannelsFromApi(generatorChannelsToRefresh, generatorSyncedAt || undefined)
            : Promise.resolve(),
          stalePeriods.length
            ? warmInrStatsUi({ targetPeriods: stalePeriods, syncByPeriod: periodSyncs })
            : Promise.resolve(),
          ...staleChannels.map((channel) => refreshChannelBlocksFromApi(channel)),
        ]);
        markServerCacheSyncChecked("dashboard", { snapshotDate, checkedAt: Date.now() });
      } catch {
        // ignore lightweight sync errors
      }
    })();

    serverCacheCheckPromiseRef.current = job;
    try {
      await job;
    } finally {
      serverCacheCheckPromiseRef.current = null;
    }
  }, [applyBootstrapRefresh, readCachedGeneratorChannelSyncAt, refreshChannelBlocksFromApi, refreshGeneratorChannelsFromApi, warmInrStatsUi]);
  latestSyncFromServerCacheIfNeededRef.current = syncFromServerCacheIfNeeded;

  const triggerGeneratorRefresh = useCallback(async () => {
    const runSync = async () => {
      const syncAt = Date.now();
      lastGeneratorRefreshAtRef.current = syncAt;
      await Promise.allSettled([
        loadSiteInrcy(),
        refreshAllGeneratorChannelsFromApi(syncAt, { force: true }),
        refreshAllChannelBlocksFromApi(syncAt, { force: true }),
      ]);
      notifyStatsRefresh(syncAt, DASHBOARD_CHANNEL_KEYS);
    };

    clearScheduledGeneratorRefreshes();
    await runSync();
  }, [clearScheduledGeneratorRefreshes, loadSiteInrcy, notifyStatsRefresh, refreshAllChannelBlocksFromApi, refreshAllGeneratorChannelsFromApi]);

  const fallbackToServerSyncThenGlobal = useCallback(async () => {
    const beforeGeneratorSyncAt = Number(readGeneratorCache()?.syncedAt ?? 0);
    const beforeStatsSyncAt = Math.max(
      Number(readInrStatsPeriodSyncAt(7) ?? 0),
      Number(readInrStatsPeriodSyncAt(30) ?? 0),
      Number(getLastChannelSyncAt() ?? 0),
    );

    try {
      await syncFromServerCacheIfNeeded(true);
    } catch {
      // Le cache serveur est la voie douce. Le refresh complet ne sert qu'en vrai secours.
    }

    const afterGeneratorSyncAt = Number(readGeneratorCache()?.syncedAt ?? 0);
    const afterStatsSyncAt = Math.max(
      Number(readInrStatsPeriodSyncAt(7) ?? 0),
      Number(readInrStatsPeriodSyncAt(30) ?? 0),
      Number(getLastChannelSyncAt() ?? 0),
    );

    if (afterGeneratorSyncAt > beforeGeneratorSyncAt || afterStatsSyncAt > beforeStatsSyncAt) {
      return;
    }

    await triggerGeneratorRefresh();
  }, [syncFromServerCacheIfNeeded, triggerGeneratorRefresh]);
  latestFallbackToServerSyncThenGlobalRef.current = fallbackToServerSyncThenGlobal;

  const triggerChannelRefresh = useCallback(async (channel: DashboardChannelKey) => {
    const syncAt = Date.now();
    lastGeneratorRefreshAtRef.current = syncAt;

    try {
      clearScheduledGeneratorRefreshes();

      const results = await Promise.allSettled([
        channel === "site_inrcy" ? loadSiteInrcy() : Promise.resolve(),
        refreshGeneratorChannelFromApi(channel, syncAt, { force: true }),
        refreshChannelBlocksFromApi(channel, syncAt, { force: true }),
      ]);

      const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult | undefined;
      if (rejected) throw rejected.reason;

      if (channel === "instagram") {
        await syncInstagramStateFromServer({ preserveSelection: true });
      }

      notifyStatsRefresh(syncAt, [channel]);
    } catch (error) {
      console.error(error);
      await fallbackToServerSyncThenGlobal();
    }
  }, [clearScheduledGeneratorRefreshes, fallbackToServerSyncThenGlobal, loadSiteInrcy, notifyStatsRefresh, refreshChannelBlocksFromApi, refreshGeneratorChannelFromApi, syncInstagramStateFromServer]);
  triggerChannelRefreshRef.current = triggerChannelRefresh;

  const triggerChannelsRefresh = useCallback(async (channelsInput: DashboardChannelKey[]) => {
    const channels = Array.from(new Set(channelsInput.filter((channel): channel is DashboardChannelKey => typeof channel === "string" && channel.length > 0)));
    if (!channels.length) return;
    if (channels.length === 1) {
      await triggerChannelRefresh(channels[0]);
      return;
    }

    const syncAt = Date.now();
    lastGeneratorRefreshAtRef.current = syncAt;

    try {
      clearScheduledGeneratorRefreshes();

      const results = await Promise.allSettled([
        channels.includes("site_inrcy") ? loadSiteInrcy() : Promise.resolve(),
        refreshGeneratorChannelsFromApi(channels, syncAt, { force: true }),
        ...channels.map((channel) => refreshChannelBlocksFromApi(channel, syncAt, { force: true })),
      ]);

      const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult | undefined;
      if (rejected) throw rejected.reason;

      if (channels.includes("instagram")) {
        await syncInstagramStateFromServer({ preserveSelection: true });
      }

      notifyStatsRefresh(syncAt, channels);
    } catch (error) {
      console.error(error);
      await fallbackToServerSyncThenGlobal();
    }
  }, [clearScheduledGeneratorRefreshes, fallbackToServerSyncThenGlobal, loadSiteInrcy, notifyStatsRefresh, refreshChannelBlocksFromApi, refreshGeneratorChannelsFromApi, triggerChannelRefresh, syncInstagramStateFromServer]);
  latestTriggerChannelsRefreshRef.current = triggerChannelsRefresh;



  const handleSharedGeneratorRefresh = useCallback(async () => {
    if (kpisLoading) return;
    setKpisLoading(true);

    try {
      const bootstrap = await runDailyStatsRefreshBootstrap({ announce: true, force: true });
      applyBootstrapRefresh(bootstrap);
      await loadSiteInrcy();

      if (!bootstrap?.ran) {
        await syncFromServerCacheIfNeeded(true);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setKpisLoading(false);
    }
  }, [applyBootstrapRefresh, kpisLoading, loadSiteInrcy, syncFromServerCacheIfNeeded]);



  useEffect(() => {
    const applyFromGeneratorCache = () => {
      applyGeneratorCacheToState();
    };

    const handleGeneratorChannelUpdated = () => {
      applyFromGeneratorCache();
    };

    const handleGeneratorChannelsUpdated = () => {
      applyFromGeneratorCache();
    };

    const handleStorage = (event: StorageEvent) => {
      if (!event.key || !event.key.includes("inrcy_generator_kpis_v1")) return;
      applyFromGeneratorCache();
    };

    window.addEventListener("inrcy:generator-channel-updated", handleGeneratorChannelUpdated as EventListener);
    window.addEventListener("inrcy:generator-channels-updated", handleGeneratorChannelsUpdated as EventListener);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("inrcy:generator-channel-updated", handleGeneratorChannelUpdated as EventListener);
      window.removeEventListener("inrcy:generator-channels-updated", handleGeneratorChannelsUpdated as EventListener);
      window.removeEventListener("storage", handleStorage);
    };
  }, [applyGeneratorCacheToState]);

  useEffect(() => {
    const handleProfileVersionChange = (event: Event) => {
      const detail = (event as CustomEvent<ProfileVersionChangeDetail>).detail;
      if (!detail) return;

      if (detail.field === "notifications_version") {
        void refreshNotifications();
        return;
      }

      if (detail.field === "loyalty_version") {
        void refreshUiBalance();
        return;
      }

      if (detail.field === "stats_version") {
        void latestSyncFromServerCacheIfNeededRef.current?.(true);
      }
    };

    window.addEventListener(PROFILE_VERSION_EVENT, handleProfileVersionChange as EventListener);
    return () => {
      window.removeEventListener(PROFILE_VERSION_EVENT, handleProfileVersionChange as EventListener);
    };
  }, [refreshNotifications, refreshUiBalance]);

  // ✅ Auto-refresh Générateur + statuts modules dès qu'un module se connecte / se déconnecte
  // On écoute les changements Postgres sur les tables qui impactent:
  // - integrations (OAuth/connecteurs)
  // - pro_tools_configs / inrcy_site_configs / profiles (mirrors/settings)
  useEffect(() => {
    const supabase = createClient();
    let disposed = false;
    let t: any = null;

    const scheduleRefresh = (payload?: any) => {
      if (disposed) return;
      if (Date.now() - lastGeneratorRefreshAtRef.current < 2500) return;
      if (t) window.clearTimeout(t);

      const impactedChannels = inferChannelsFromRealtimePayload(payload);

      t = window.setTimeout(() => {
        if (disposed) return;
        if (Date.now() - lastGeneratorRefreshAtRef.current < 2500) return;
        if (impactedChannels.length) {
          void latestTriggerChannelsRefreshRef.current?.(impactedChannels);
          return;
        }

        void latestFallbackToServerSyncThenGlobalRef.current?.();
      }, 500);
    };

    const ch = supabase
      .channel("inrcy-generator-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "integrations" },
        (payload: any) => scheduleRefresh(payload)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pro_tools_configs" },
        (payload: any) => scheduleRefresh(payload)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inrcy_site_configs" },
        (payload: any) => scheduleRefresh(payload)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        (payload: any) => scheduleRefresh(payload)
      )
      .subscribe();

    return () => {
      disposed = true;
      if (t) window.clearTimeout(t);
      clearScheduledGeneratorRefreshes();
      try {
        supabase.removeChannel(ch);
      } catch {}
    };
  }, [clearScheduledGeneratorRefreshes]);

  useEffect(() => {
    const linked = searchParams.get("linked");
    const activated = searchParams.get("activated");
    const ok = searchParams.get("ok");
    const toast = searchParams.get("toast");
    const warning = searchParams.get("warning");
    const targetPanel = searchParams.get("panel");

    if (!linked && !activated && !ok && !toast && !warning) return;

    const impactedChannels = inferChannelsFromSearchParams(linked, targetPanel);
    if (ok === "1" && impactedChannels.length) {
      void triggerChannelsRefresh(impactedChannels);
      return;
    }

    void fallbackToServerSyncThenGlobal();
  }, [fallbackToServerSyncThenGlobal, searchParams, triggerChannelsRefresh]);


  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      (async () => {
        try {
          const res = await fetch("/api/security/google/risc/status", { credentials: "include" });
          const json = await res.json().catch(() => null);
          if (!res.ok || cancelled) return;
          const reauth = (json as any)?.reauth || {};

          if (reauth?.site_inrcy?.ga4) setSiteInrcyGa4Notice("Reconnexion Google Analytics requise (sécurité).");
          if (reauth?.site_inrcy?.gsc) setSiteInrcyGscNotice("Reconnexion Search Console requise (sécurité).");
          if (reauth?.site_web?.ga4) setSiteWebGa4Notice("Reconnexion Google Analytics requise (sécurité).");
          if (reauth?.site_web?.gsc) setSiteWebGscNotice("Reconnexion Search Console requise (sécurité).");
          if (reauth?.gmb) setPanelError("gmb", "Reconnexion Google Business requise (sécurité).", "Reconnexion Google Business requise (sécurité).", 5000);
        } catch {}
      })();
    }, 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [setPanelError]);

  useEffect(() => {
    const linked = searchParams.get("linked");
    const ok = searchParams.get("ok");
    if (ok !== "1") return;

    if (linked === "facebook") {
      setPanelSuccess("facebook", "Compte Facebook connecté. Choisissez maintenant la page à utiliser.", 3200);
      return;
    }
    if (linked === "instagram") {
      setPanelSuccess("instagram", "Compte Instagram connecté. Choisissez maintenant le profil à utiliser.", 3200);
      void syncInstagramStateFromServer({ preserveSelection: true });
      return;
    }
    if (linked === "linkedin") {
      setPanelSuccess("linkedin", "Compte LinkedIn connecté.", 2600);
      return;
    }
    if (linked === "gmb") {
      setPanelSuccess("gmb", "Compte Google connecté. Choisissez maintenant votre établissement.", 3200);
    }
  }, [searchParams, setPanelSuccess, syncInstagramStateFromServer]);

  useEffect(() => {
    const linked = searchParams.get("linked");
    const ok = searchParams.get("ok");
    const skipped = searchParams.get("skipped");
    const targetPanel = searchParams.get("panel");
    if (ok !== "1" || skipped !== "1") return;

    if (targetPanel === "site_inrcy" && linked === "ga4") {
      setSiteInrcyGa4Notice("Google Analytics déjà connecté pour le site iNrCy.");
      window.setTimeout(() => setSiteInrcyGa4Notice(null), 2600);
      return;
    }
    if (targetPanel === "site_inrcy" && linked === "gsc") {
      setSiteInrcyGscNotice("Search Console déjà connecté pour le site iNrCy.");
      window.setTimeout(() => setSiteInrcyGscNotice(null), 2600);
      return;
    }
    if (targetPanel === "site_web" && linked === "ga4") {
      setSiteWebGa4Notice("Google Analytics déjà connecté pour le site web.");
      window.setTimeout(() => setSiteWebGa4Notice(null), 2600);
      return;
    }
    if (targetPanel === "site_web" && linked === "gsc") {
      setSiteWebGscNotice("Search Console déjà connecté pour le site web.");
      window.setTimeout(() => setSiteWebGscNotice(null), 2600);
    }
  }, [searchParams]);

  useEffect(() => {
    const linked = searchParams.get("linked");
    const ok = searchParams.get("ok");
    const error = searchParams.get("error");
    const message = searchParams.get("message");
    if (!linked || ok !== "0" || (!error && !message)) return;

    const byLinked = linked === "facebook" || linked === "instagram" || linked === "linkedin" || linked === "gmb" ? linked : null;
    const byPanel = panel === "facebook" || panel === "instagram" || panel === "linkedin" || panel === "gmb" ? panel : null;
    const target = byLinked || byPanel;
    if (!target) return;

    const fallbackByTarget = {
      facebook: "La connexion Facebook n'a pas pu aboutir.",
      instagram: "La connexion Instagram n'a pas pu aboutir.",
      linkedin: "La connexion LinkedIn n'a pas pu aboutir.",
      gmb: "La connexion Google Business n'a pas pu aboutir.",
    } as const;

    setPanelError(target, message || error, fallbackByTarget[target]);
  }, [panel, searchParams, setPanelError]);

// ✅ Onboarding non-bloquant : on affiche des alertes (badges / dots) mais
// on n'ouvre jamais un panneau automatiquement.
// (Sinon impossible de fermer un modal si le profil est incomplet.)

  useEffect(() => {
    const snapshotDate = expectedUiSnapshotDate();
    const hasFreshGenerator = hasFreshLocalGeneratorSnapshot();

    if (hasFreshGenerator) {
      try {
        const cached = readGeneratorCache();
        const payload = cached?.payload;
        if (payload?.leads) {
          setKpis(payload);
          const oppMonth = Number(payload?.details?.opportunities?.month);
          if (Number.isFinite(oppMonth)) {
            setOppTotal(oppMonth);
          }
        }
      } catch {
        // ignore
      }
    }

    if (hasFreshGenerator && wasDailyStatsRefreshBootstrapCheckedRecently({ snapshotDate })) {
      setDailyBootReady(true);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const bootstrap = await runDailyStatsRefreshBootstrap();
        if (cancelled) return;

        latestApplyBootstrapRefreshRef.current?.(bootstrap);

        if (!bootstrap.ran && !hasFreshGenerator) {
          await latestSyncFromServerCacheIfNeededRef.current?.(true);
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (!cancelled) setDailyBootReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!dailyBootReady) return;
    try {
      const cached = readGeneratorCache();
      const payload = cached?.payload;
      if (!payload?.leads) return;
      if (cached?.snapshotDate !== expectedUiSnapshotDate()) return;
      setKpis(payload);
      const oppMonth = Number(payload?.details?.opportunities?.month);
      if (Number.isFinite(oppMonth)) {
        setOppTotal(oppMonth);
      }
    } catch {
      // ignore
    }
  }, [dailyBootReady]);

  useEffect(() => {
    if (!dailyBootReady || initialGeneratorRefreshDoneRef.current) return;
    initialGeneratorRefreshDoneRef.current = true;

    const hasFreshDashboardCache = () => {
      const cached = readGeneratorCache();
      const lastChannelSyncAt = getLastChannelSyncAt();
      return Boolean(cached?.payload?.leads && cached.syncedAt >= lastChannelSyncAt && cached.snapshotDate === expectedUiSnapshotDate());
    };

    if (hasFreshDashboardCache()) {
      return;
    }

    void syncFromServerCacheIfNeeded(true)
      .then(() => {
        if (hasFreshDashboardCache()) {
          return;
        }

        return Promise.allSettled([
          refreshAllGeneratorChannelsFromApi(undefined, { force: false }),
          refreshAllChannelBlocksFromApi(undefined, { force: false }),
        ]).then((results) => {
          const failed = results.some((result) => result.status === "rejected");
          if (!failed) return;
          void refreshKpis();
        });
      })
      .catch(() => {
        void refreshKpis();
      });
  }, [dailyBootReady, refreshAllChannelBlocksFromApi, refreshAllGeneratorChannelsFromApi, refreshKpis, syncFromServerCacheIfNeeded]);

  useEffect(() => {
    if (!dailyBootReady) return;
    void latestSyncFromServerCacheIfNeededRef.current?.(false);

    const handleFocus = () => {
      void latestSyncFromServerCacheIfNeededRef.current?.(false);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void latestSyncFromServerCacheIfNeededRef.current?.(false);
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [dailyBootReady]);

  const refreshMailChannelStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/status", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const accounts = Array.isArray(data?.mailAccounts) ? data.mailAccounts : [];
      // Canal Mails = actif dès qu’au moins une boîte d’envoi est enregistrée.
      const nextCount = sanitizeMailAccountsConnectedCount(accounts.length);
      setMailAccountsConnectedCount(nextCount);
      mergeCachedDashboardChannelState({ mailAccountsConnectedCount: nextCount });
    } catch {
      // On garde le dernier état affiché si le statut mail est momentanément indisponible.
    }
  }, []);

  useEffect(() => {
    void refreshMailChannelStatus();
    const handler = () => void refreshMailChannelStatus();
    window.addEventListener("inrsend:mail-accounts-updated", handler);
    window.addEventListener("focus", handler);
    return () => {
      window.removeEventListener("inrsend:mail-accounts-updated", handler);
      window.removeEventListener("focus", handler);
    };
  }, [refreshMailChannelStatus]);

  const leadsToday = typeof kpis?.leads?.today === "number" ? kpis.leads.today : null;
  const leadsWeek = typeof kpis?.leads?.week === "number" ? kpis.leads.week : null;
  const leadsMonth = typeof kpis?.leads?.month === "number" ? kpis.leads.month : null;
  const computedGeneratorIsActive = Boolean(
    hasSiteInrcyUrl ||
    hasSiteWebUrl ||
    gmbConnected ||
    facebookPageConnected ||
    instagramConnected ||
    linkedinConnected ||
    (canAccessPinterest && pinterestConnected) ||
    tiktokConnected ||
    youtubeShortsConnected ||
    mailAccountsConnectedCount > 0
  );
  const generatorIsActive = !siteConnectionsReady && displayedGeneratorIsActive !== null
    ? displayedGeneratorIsActive
    : computedGeneratorIsActive;

  useEffect(() => {
    if (!siteConnectionsReady) return;
    setDisplayedGeneratorIsActive(computedGeneratorIsActive);
    try {
      writeUiCacheValue(GENERATOR_ACTIVE_CACHE_KEY, String(computedGeneratorIsActive));
    } catch {
      // ignore browser storage failures
    }
  }, [computedGeneratorIsActive, siteConnectionsReady]);

  const estimatedValue = typeof kpis?.estimatedValue === "number" ? kpis.estimatedValue : null;

  const computeSiteBubbleProgress = useCallback((kind: "site_inrcy" | "site_web"): SiteBubbleProgress => {
    const progress = kind === "site_inrcy" ? siteInrcyProgressCount : siteWebProgressCount;
    const hasUrl = kind === "site_inrcy" ? hasSiteInrcyUrl : hasSiteWebUrl;
    const canUseSite = kind === "site_inrcy" ? canAccessSiteInrcy : true;

    if (kind === "site_inrcy" && !canUseSite) {
      return { status: "coming", text: "Aucun site" };
    }

    return {
      status: hasUrl ? "connected" : "available",
      text: `${hasUrl ? "Connecté" : "A configurer"} ${progress}/3`,
    };
  }, [canAccessSiteInrcy, hasSiteInrcyUrl, hasSiteWebUrl, siteInrcyProgressCount, siteWebProgressCount]);

  const siteBubbleProgressSnapshot = useMemo<SiteBubbleProgressCache>(() => ({
    site_inrcy: computeSiteBubbleProgress("site_inrcy"),
    site_web: computeSiteBubbleProgress("site_web"),
  }), [computeSiteBubbleProgress]);

  useEffect(() => {
    if (!siteConnectionsReady) return;
    setDisplayedSiteBubbleProgress(siteBubbleProgressSnapshot);
    try {
      writeUiCacheValue(SITE_BUBBLE_PROGRESS_CACHE_KEY, JSON.stringify(siteBubbleProgressSnapshot));
    } catch {
      // ignore browser storage failures
    }
  }, [siteBubbleProgressSnapshot, siteConnectionsReady]);

  const getSiteBubbleProgress = useCallback((kind: "site_inrcy" | "site_web") => {
    if (!siteConnectionsReady && displayedSiteBubbleProgress[kind]) {
      return displayedSiteBubbleProgress[kind] as SiteBubbleProgress;
    }
    return siteBubbleProgressSnapshot[kind] ?? computeSiteBubbleProgress(kind);
  }, [computeSiteBubbleProgress, displayedSiteBubbleProgress, siteBubbleProgressSnapshot, siteConnectionsReady]);

  useEffect(() => {
    if (!siteConnectionsReady) return;
    const state = {
      siteInrcyOwnership,
      siteInrcyUrl,
      siteInrcySavedUrl,
      siteInrcyContactEmail,
      siteInrcySettingsText,
      ga4MeasurementId,
      ga4PropertyId,
      gscProperty,
      siteInrcyActusLayout,
      siteInrcyActusLimit,
      siteInrcyActusFont,
      siteInrcyActusTheme,
      siteWebSettingsText,
      siteWebUrl,
      siteWebSavedUrl,
      siteWebGa4MeasurementId,
      siteWebGa4PropertyId,
      siteWebGscProperty,
      siteWebActusLayout,
      siteWebActusLimit,
      siteWebActusFont,
      siteWebActusTheme,
      instagramUrl,
      instagramAccountConnected,
      instagramConnected,
      instagramConnectionStatus,
      instagramUsername,
      linkedinUrl,
      linkedinAccountConnected,
      linkedinConnected,
      linkedinConnectionStatus,
      linkedinDisplayName,
      linkedinSelectedOrganizationId,
      linkedinSelectedOrganizationName,
      tiktokConnected,
      tiktokUsername,
      tiktokProfileUrl,
      tiktokPreferredMedia,
      youtubeShortsConnected,
      youtubeShortsUrl,
      pinterestConnected,
      pinterestUrl,
      trustpilotConnected,
      trustpilotUrl,
      gmbUrl,
      gmbAccountConnected,
      gmbConfigured,
      gmbConnected,
      gmbConnectionStatus,
      gmbAccountEmail,
      gmbLocationName,
      gmbLocationLabel,
      facebookUrl,
      facebookAccountConnected,
      facebookPageConnected,
      facebookConnectionStatus,
      facebookAccountEmail,
      fbSelectedPageId,
      fbSelectedPageName,
      mailAccountsConnectedCount,
      inrBadgeProfile,
      inrBadgeProfileReady,
      siteInrcyGa4Connected,
      siteInrcyGscConnected,
      siteWebGa4Connected,
      siteWebGscConnected,
    };
    const serialized = JSON.stringify(state);
    if (serialized === dashboardChannelCacheLastWriteRef.current) return;
    dashboardChannelCacheLastWriteRef.current = serialized;
    writeCachedDashboardChannelState(state);
  });

  const inrBadgeProfileReady = useMemo(() => {
    // iNr'Badge se connecte quand "Mon profil" est complété.
    // Pendant l'hydratation, on garde le dernier état connu pour éviter le flash Déconnecté -> Connecté.
    // Si aucun cache n'existe encore, on reste optimiste comme les autres bulles : le contrôle profil corrigera ensuite si besoin.
    if (profileCheckReady) return !profileIncomplete;
    return cachedInrBadgeProfileReady ?? !profileIncomplete;
  }, [cachedInrBadgeProfileReady, profileCheckReady, profileIncomplete]);

  useEffect(() => {
    if (!profileCheckReady) return;
    const ready = !profileIncomplete;
    setCachedInrBadgeProfileReady(ready);
    mergeCachedDashboardChannelState({ inrBadgeProfileReady: ready });
  }, [profileCheckReady, profileIncomplete]);

  const inrBadgePublicUrl = useMemo(() => {
    if (!inrBadgeProfileReady) return "";
    return createInrBadgePublicUrl(inrBadgeProfile);
  }, [inrBadgeProfile, inrBadgeProfileReady]);

  const openInrBadgeModal = useCallback(() => {
    setInrBadgeModalOpen(true);
  }, []);

  const fluxBubbleItems = useMemo(() => buildFluxBubbleItems({
    bubbleAccessMap,
    canConfigureSite,
    canViewSite,
    channelBlocks,
    facebookPageConnected,
    facebookUrl,
    getSiteBubbleProgress,
    gmbConnected,
    gmbUrl,
    instagramConnected,
    instagramUrl,
    inrBadgeLogoUrl: inrBadgeProfile.logoUrl,
    inrBadgeProfileReady,
    onOpenInrBadgeModal: openInrBadgeModal,
    linkedinConnected,
    linkedinUrl,
    mailAccountsConnectedCount,
    tiktokConnected,
    tiktokUrl: tiktokProfileUrl,
    pinterestConnected,
    pinterestUrl,
    trustpilotConnected,
    trustpilotUrl,
    youtubeShortsConnected,
    youtubeShortsUrl,
    openPanel,
    savedSiteWebUrlMeta,
    setHelpSiteInrcyOpen,
    setHelpSiteWebOpen,
    siteInrcySavedUrl,
    siteWebSavedUrl,
  }), [
    bubbleAccessMap,
    canAccessPinterest,
    canAccessTrustpilot,
    canConfigureSite,
    canViewSite,
    channelBlocks,
    facebookPageConnected,
    facebookUrl,
    getSiteBubbleProgress,
    gmbConnected,
    gmbUrl,
    instagramConnected,
    instagramUrl,
    inrBadgeProfile.logoUrl,
    inrBadgeProfileReady,
    openInrBadgeModal,
    linkedinConnected,
    linkedinUrl,
    mailAccountsConnectedCount,
    tiktokConnected,
    tiktokProfileUrl,
    pinterestConnected,
    pinterestUrl,
    trustpilotConnected,
    trustpilotUrl,
    youtubeShortsConnected,
    youtubeShortsUrl,
    openPanel,
    savedSiteWebUrlMeta,
    siteInrcySavedUrl,
    siteWebSavedUrl,
  ]);

  const inrBadgeSettingsProps = useMemo(() => ({
    profile: inrBadgeProfile,
    publicUrl: inrBadgePublicUrl,
    profileReady: inrBadgeProfileReady,
    channels: {
      siteInrcy: {
        connected: Boolean(canAccessSiteInrcy && normalizeSiteUrl(siteInrcySavedUrl)),
        url: siteInrcySavedUrl,
      },
      siteWeb: {
        connected: Boolean(normalizeSiteUrl(siteWebSavedUrl)),
        url: siteWebSavedUrl,
      },
      googleBusiness: {
        connected: Boolean(gmbConnected && gmbUrl),
        url: gmbUrl,
      },
      facebook: {
        connected: Boolean(facebookPageConnected && facebookUrl),
        url: facebookUrl,
      },
      instagram: {
        connected: Boolean(instagramConnected && instagramUrl),
        url: instagramUrl,
      },
      linkedin: {
        connected: Boolean(linkedinConnected && linkedinUrl),
        url: linkedinUrl,
      },
      pinterest: {
        connected: Boolean(canAccessPinterest && pinterestConnected && pinterestUrl),
        url: canAccessPinterest ? pinterestUrl : null,
      },
      trustpilot: {
        connected: Boolean(canAccessTrustpilot && trustpilotConnected && trustpilotUrl),
        url: canAccessTrustpilot ? trustpilotUrl : null,
      },
      mails: {
        connected: mailAccountsConnectedCount > 0,
        url: null,
      },
      tiktok: {
        connected: Boolean(tiktokConnected),
        url: tiktokProfileUrl,
      },
      youtubeShorts: {
        connected: Boolean(youtubeShortsConnected && youtubeShortsUrl),
        url: youtubeShortsUrl,
      },
    },
    onOpenProfile: () => openPanel("profil"),
    onOpenActivity: () => openPanel("activite"),
    onOpenCalendarSettings: () => openPanel("agenda"),
  }), [
    inrBadgeProfile,
    inrBadgePublicUrl,
    canAccessPinterest,
    canAccessTrustpilot,
    inrBadgeProfileReady,
    siteInrcyOwnership,
    siteInrcySavedUrl,
    siteWebSavedUrl,
    gmbConnected,
    gmbUrl,
    facebookPageConnected,
    facebookUrl,
    instagramConnected,
    instagramUrl,
    linkedinConnected,
    linkedinUrl,
    mailAccountsConnectedCount,
    tiktokConnected,
    tiktokProfileUrl,
    pinterestConnected,
    pinterestUrl,
    trustpilotConnected,
    trustpilotUrl,
    youtubeShortsConnected,
    youtubeShortsUrl,
    openPanel,
  ]);

  const saveSiteInrcyUrlFromDrawer = useCallback(() => runDrawerMutation("site_inrcy:url:save", saveSiteInrcyUrl), [runDrawerMutation, saveSiteInrcyUrl]);
  const deleteSiteInrcyUrlFromDrawer = useCallback(() => runDrawerMutation("site_inrcy:url:delete", deleteSiteInrcyUrl), [runDrawerMutation, deleteSiteInrcyUrl]);
  const disconnectSiteInrcyGa4FromDrawer = useCallback(() => runDrawerMutation("site_inrcy:ga4:disconnect", disconnectSiteInrcyGa4), [runDrawerMutation, disconnectSiteInrcyGa4]);
  const disconnectSiteInrcyGscFromDrawer = useCallback(() => runDrawerMutation("site_inrcy:gsc:disconnect", disconnectSiteInrcyGsc), [runDrawerMutation, disconnectSiteInrcyGsc]);

  const saveSiteWebUrlFromDrawer = useCallback(() => runDrawerMutation("site_web:url:save", saveSiteWebUrl), [runDrawerMutation, saveSiteWebUrl]);
  const deleteSiteWebUrlFromDrawer = useCallback(() => runDrawerMutation("site_web:url:delete", deleteSiteWebUrl), [runDrawerMutation, deleteSiteWebUrl]);
  const disconnectSiteWebGa4FromDrawer = useCallback(() => runDrawerMutation("site_web:ga4:disconnect", disconnectSiteWebGa4), [runDrawerMutation, disconnectSiteWebGa4]);
  const disconnectSiteWebGscFromDrawer = useCallback(() => runDrawerMutation("site_web:gsc:disconnect", disconnectSiteWebGsc), [runDrawerMutation, disconnectSiteWebGsc]);

  const saveGmbLocationFromDrawer = useCallback(() => runDrawerMutation("gmb:location:save", saveGmbLocation), [runDrawerMutation, saveGmbLocation]);
  const disconnectGmbAccountFromDrawer = useCallback(() => runDrawerMutation("gmb:account:disconnect", disconnectGmbAccount), [runDrawerMutation, disconnectGmbAccount]);
  const disconnectGmbBusinessFromDrawer = useCallback(() => runDrawerMutation("gmb:location:disconnect", disconnectGmbBusiness), [runDrawerMutation, disconnectGmbBusiness]);

  const saveFacebookPageFromDrawer = useCallback(() => runDrawerMutation("facebook:page:save", saveFacebookPage), [runDrawerMutation, saveFacebookPage]);
  const disconnectFacebookAccountFromDrawer = useCallback(() => runDrawerMutation("facebook:account:disconnect", disconnectFacebookAccount), [runDrawerMutation, disconnectFacebookAccount]);
  const disconnectFacebookPageFromDrawer = useCallback(() => runDrawerMutation("facebook:page:disconnect", disconnectFacebookPage), [runDrawerMutation, disconnectFacebookPage]);

  const saveInstagramProfileFromDrawer = useCallback(() => runDrawerMutation("instagram:profile:save", saveInstagramProfile), [runDrawerMutation, saveInstagramProfile]);
  const disconnectInstagramAccountFromDrawer = useCallback(() => runDrawerMutation("instagram:account:disconnect", disconnectInstagramAccount), [runDrawerMutation, disconnectInstagramAccount]);
  const disconnectInstagramProfileFromDrawer = useCallback(() => runDrawerMutation("instagram:profile:disconnect", disconnectInstagramProfile), [runDrawerMutation, disconnectInstagramProfile]);

  const saveLinkedinProfileUrlFromDrawer = useCallback(() => runDrawerMutation("linkedin:url:save", saveLinkedinProfileUrl), [runDrawerMutation, saveLinkedinProfileUrl]);
  const disconnectLinkedinAccountFromDrawer = useCallback(() => runDrawerMutation("linkedin:account:disconnect", disconnectLinkedinAccount), [runDrawerMutation, disconnectLinkedinAccount]);
  const disconnectLinkedinOrganizationFromDrawer = useCallback(() => runDrawerMutation("linkedin:organization:disconnect", useLinkedinPersonalProfile), [runDrawerMutation, useLinkedinPersonalProfile]);


  const locals = {
    canConfigureSite, canConnectSiteInrcyGoogle, canConnectSiteWebGoogle,
    connectFacebookAccount, connectFacebookBusinessAccount, connectGmbAccount, connectInstagramAccount, connectInstagramBusinessAccount, connectLinkedinAccount, connectLinkedinBusinessAccount,
    connectSiteInrcyGa4, connectSiteInrcyGsc, connectSiteWebGa4, connectSiteWebGsc,
    deleteSiteInrcyUrlFromDrawer, deleteSiteWebUrlFromDrawer,
    disconnectFacebookAccountFromDrawer, disconnectFacebookPageFromDrawer, disconnectGmbAccountFromDrawer, disconnectGmbBusinessFromDrawer,
    disconnectInstagramAccountFromDrawer, disconnectInstagramProfileFromDrawer, disconnectLinkedinAccountFromDrawer, disconnectLinkedinOrganizationFromDrawer,
    disconnectSiteInrcyGa4FromDrawer, disconnectSiteInrcyGscFromDrawer, disconnectSiteWebGa4FromDrawer, disconnectSiteWebGscFromDrawer,
    draftSiteInrcyUrlMeta, draftSiteWebUrlMeta,
    facebookAccountConnected, facebookAccountEmail, facebookConnectionStatus, facebookPageConnected, facebookUrl, facebookUrlError, facebookUrlNotice,
    fbPages, fbPagesError, fbPagesLoading, fbSelectedPageId, fbSelectedPageName,
    ga4MeasurementId, ga4PropertyId,
    gmbAccountConnected, gmbAccountEmail, gmbAccountName, gmbAccounts, gmbConfigured, gmbConnected, gmbConnectionStatus, gmbListError, gmbLoadingList,
    gmbLocationLabel, gmbLocationName, gmbLocations, gmbUrl, gmbUrlError, gmbUrlNotice,
    gscProperty,
    igAccounts, igAccountsError, igAccountsLoading, igSelectedPageId,
    instagramAccountConnected, instagramConnected, instagramConnectionStatus, instagramUrl, instagramUrlError, instagramUrlNotice, instagramUsername,
    isDrawerMutationPending,
    linkedinAccountConnected, linkedinConnected, linkedinConnectionStatus, linkedinDisplayName, linkedinUrl, linkedinUrlError, linkedinUrlNotice,
    linkedinOrganizations, linkedinOrganizationsLoading, linkedinOrganizationPickerOpen, linkedinSelectedOrganizationId, linkedinSelectedOrganizationName, loadLinkedinOrganizations, selectLinkedinOrganization, useLinkedinPersonalProfile,
    loadFacebookPages, loadGmbAccountsAndLocations, loadInstagramAccounts,
    resetSiteInrcyAll, resetSiteWebAll, saveSiteInrcyActusWidgetSettings, saveSiteWebActusWidgetSettings,
    saveFacebookPageFromDrawer, saveGmbLocationFromDrawer, saveInstagramProfileFromDrawer, saveLinkedinProfileUrlFromDrawer, saveSiteInrcyUrlFromDrawer, saveSiteWebUrlFromDrawer,
    setFbSelectedPageId, setIgSelectedPageId, setGmbLocationName, setLinkedinUrl, setLinkedinUrlNotice,
    setShowSiteInrcyWidgetCode, setShowSiteWebWidgetCode,
    setSiteInrcyActusFont, setSiteInrcyActusLayout, setSiteInrcyActusLimit, setSiteInrcyActusTheme, setSiteInrcyUrl,
    setSiteWebActusFont, setSiteWebActusLayout, setSiteWebActusLimit, setSiteWebActusTheme, setSiteWebUrl,
    showSiteInrcyWidgetCode, showSiteWebWidgetCode,
    siteInrcyActusFont, siteInrcyActusLayout, siteInrcyActusLimit, siteInrcyActusTheme, siteInrcyAllGreen, siteInrcyContactEmail,
    siteInrcyGa4Connected, siteInrcyGa4Notice, siteInrcyGscConnected, siteInrcyGscNotice, siteInrcyOwnership, siteInrcySavedUrl, siteInrcySettingsError,
    siteInrcyUrl, siteInrcyUrlNotice,
    siteWebActusFont, siteWebActusLayout, siteWebActusLimit, siteWebActusTheme, siteWebAllGreen,
    siteWebGa4Connected, siteWebGa4MeasurementId, siteWebGa4Notice, siteWebGa4PropertyId, siteWebGscConnected, siteWebGscNotice, siteWebGscProperty,
    siteWebSavedUrl, siteWebSettingsError, siteWebUrl, siteWebUrlNotice,
    widgetTokenInrcySite, widgetTokenSiteWeb, hasSiteInrcyUrl, hasSiteWebUrl,
    tiktokConnected, tiktokUsername, tiktokProfileUrl, setTiktokProfileUrl, tiktokProfileUrlNotice, tiktokProfileUrlError, tiktokLoading,
    tiktokPreferredMedia, setTiktokPreferredMedia, tiktokAllowComments, setTiktokAllowComments,
    tiktokAllowDuo, setTiktokAllowDuo, tiktokAllowStitch, setTiktokAllowStitch,
    tiktokPhotoAutoMusic, setTiktokPhotoAutoMusic, tiktokCommercialContent, setTiktokCommercialContent,
    tiktokAiContent, setTiktokAiContent, tiktokSettingsNotice, tiktokSettingsError,
    connectTiktok, disconnectTiktok, saveTiktokProfileUrl, saveTiktokDefaults,
  };

  const {
    siteWebPanelProps,
    gmbPanelProps,
    linkedinPanelProps,
    siteInrcyPanelProps,
    instagramPanelProps,
    facebookPanelProps,
    tiktokPanelProps,
  } = buildDashboardPanelProps(locals);

  return (
    <main className={styles.page}>
      <DashboardTopbar
        desktopNotificationMenuRef={desktopNotificationMenuRef}
        mobileNotificationMenuRef={mobileNotificationMenuRef}
        userMenuRef={userMenuRef}
        menuRef={menuRef}
        notificationMenuOpen={notificationMenuOpen}
        setNotificationMenuOpen={setNotificationMenuOpen}
        unreadNotificationsCount={unreadNotificationsCount}
        refreshNotifications={refreshNotifications}
        notificationsLoading={notificationsLoading}
        notifications={notifications}
        notificationsError={notificationsError}
        markAllNotificationsRead={markAllNotificationsRead}
        markNotificationRead={markNotificationRead}
        deleteNotification={deleteNotification}
        onNavigateCta={(ctaUrl) => {
          if (ctaUrl.startsWith('/')) {
            router.push(ctaUrl);
          } else {
            window.location.href = ctaUrl;
          }
        }}
        openPanel={openPanel}
        inrAgentEnabled={canAccessInrAgent}
        isAdmin={isAdmin}
        userEmail={userEmail}
        userFirstLetter={userFirstLetter}
        profileIncomplete={profileIncomplete}
        activityIncomplete={activityIncomplete}
        userMenuOpen={userMenuOpen}
        setUserMenuOpen={setUserMenuOpen}
        goToGps={() => router.push("/dashboard/gps")}
        handleLogout={handleLogout}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
      />

      <DashboardHero
        generatorPower={generatorPower}
        generatorPowerSteps={generatorPowerSteps}
        remainingGeneratorPowerSteps={remainingGeneratorPowerSteps}
        nextGeneratorPowerStep={nextGeneratorPowerStep}
        onOpenGeneratorHelp={() => setHelpGeneratorOpen(true)}
        onRefreshGenerator={() => {
          void handleSharedGeneratorRefresh();
        }}
        kpisLoading={kpisLoading}
        generatorIsActive={generatorIsActive}
        uiBalance={uiBalance}
        inertiaSnapshot={inertiaSnapshot}
        estimatedValue={estimatedValue}
        oppTotal={oppTotal}
        onOpenStats={openStatsModule}
        leadsWeek={leadsWeek}
        leadsMonth={leadsMonth}
      />

      <DashboardChannelsSection
        fluxBubbleItems={fluxBubbleItems}
        goToModule={goToModule}
        openPanel={openPanel}
        onOpenChannelsHelp={() => setHelpCanauxOpen(true)}
        onOpenStats={openStatsModule}
        onOpenBoosterPublish={() => setDashboardBoosterModal("publish")}
        onOpenBoosterStats={() => setDashboardBoosterModal("stats")}
      />

      <DashboardBoosterModalLayer
        mode={dashboardBoosterModal}
        initialConnectedChannels={{
          inrcy_site: Boolean(canAccessSiteInrcy && normalizeSiteUrl(siteInrcySavedUrl) && (siteInrcyGa4Connected || siteInrcyGscConnected)),
          site_web: Boolean(normalizeSiteUrl(siteWebSavedUrl) && (siteWebGa4Connected || siteWebGscConnected)),
          gmb: Boolean(gmbAccountConnected && gmbConfigured && gmbConnectionStatus !== "needs_update"),
          facebook: Boolean(facebookAccountConnected && facebookPageConnected && facebookConnectionStatus !== "needs_update"),
          instagram: Boolean(instagramAccountConnected && instagramConnected && instagramConnectionStatus !== "needs_update"),
          linkedin: Boolean(linkedinAccountConnected && linkedinConnectionStatus !== "needs_update"),
          // TikTok suit maintenant le même état hydraté que les autres canaux.
          // Si l'OAuth réel est actif, la bulle Booster est allumée dès l'ouverture.
          tiktok: Boolean(tiktokConnected),
          // YouTube suit aussi l'état Dashboard déjà hydraté.
          // Ça évite que l'icône arrive après les autres dans Booster / Publier.
          youtube_shorts: Boolean(youtubeShortsConnected),
          pinterest: Boolean(canAccessPinterest && pinterestConnected),
        }}
        onClose={() => {
          setDashboardBoosterModal(null);
          if (searchParams.get("action") === "publish" || searchParams.get("stats") === "1" || searchParams.get("draftId")) {
            router.replace("/dashboard", { scroll: false });
          }
        }}
      />


      {inrBadgeModalOpen ? (
        <InrBadgePreviewModal
          profile={inrBadgeProfile}
          publicUrl={inrBadgePublicUrl}
          onClose={() => setInrBadgeModalOpen(false)}
          onConfigure={() => {
            setInrBadgeModalOpen(false);
            openPanel("inrbadge");
          }}
        />
      ) : null}

      <SettingsDrawer
        title={getDrawerTitle(panel)}
        isOpen={isDrawerPanel(panel)}
        onClose={closePanel}
        headerActions={
          panel === "inertie" ? (
            <HelpButton onClick={() => setHelpInertieOpen(true)} title="Aide : Mon inertie" />
          ) : panel === "facebook" ? (
            <HelpButton onClick={() => setHelpFacebookOpen(true)} title="Aide connexion Facebook" />
          ) : panel === "instagram" ? (
            <HelpButton onClick={() => setHelpInstagramOpen(true)} title="Aide connexion Instagram" />
          ) : null
        }
      >
        <DashboardSettingsDrawerContent
          panel={panel}
          checkProfile={checkProfile}
          checkActivity={checkActivity}
          inertiaSnapshot={inertiaSnapshot}
          openPanel={openPanel}
          onCloseDrawer={closePanel}
          referralName={referralName}
          referralPhone={referralPhone}
          referralEmail={referralEmail}
          referralFrom={referralFrom}
          referralSubmitting={referralSubmitting}
          referralNotice={referralNotice}
          referralError={referralError}
          onReferralNameChange={setReferralName}
          onReferralPhoneChange={setReferralPhone}
          onReferralEmailChange={setReferralEmail}
          onReferralFromChange={setReferralFrom}
          submitReferral={submitReferral}
          siteInrcyPanelProps={siteInrcyPanelProps}
          siteWebPanelProps={siteWebPanelProps}
          instagramPanelProps={instagramPanelProps}
          linkedinPanelProps={linkedinPanelProps}
          gmbPanelProps={gmbPanelProps}
          facebookPanelProps={facebookPanelProps}
          tiktokPanelProps={tiktokPanelProps}
          inrBadgeSettingsProps={inrBadgeSettingsProps}
          pinterestAccessEnabled={canAccessPinterest}
          trustpilotAccessEnabled={canAccessTrustpilot}
        />
      </SettingsDrawer>

      <DashboardHelpModals
        helpGeneratorOpen={helpGeneratorOpen}
        helpCanauxOpen={helpCanauxOpen}
        helpSiteInrcyOpen={helpSiteInrcyOpen}
        helpSiteWebOpen={helpSiteWebOpen}
        helpInertieOpen={helpInertieOpen}
        helpFacebookOpen={helpFacebookOpen}
        helpInstagramOpen={helpInstagramOpen}
        onCloseGenerator={() => setHelpGeneratorOpen(false)}
        onCloseCanaux={() => setHelpCanauxOpen(false)}
        onCloseSiteInrcy={() => setHelpSiteInrcyOpen(false)}
        onCloseSiteWeb={() => setHelpSiteWebOpen(false)}
        onCloseInertie={() => setHelpInertieOpen(false)}
        onCloseFacebook={() => setHelpFacebookOpen(false)}
        onCloseInstagram={() => setHelpInstagramOpen(false)}
      />

      <footer className={styles.footer}>
        <div className={styles.footerLeft}>© 2026 iNrCy</div>
      </footer>
    </main>
  );
}
