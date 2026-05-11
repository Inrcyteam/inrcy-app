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
import DashboardSettingsDrawerContent from "./_components/DashboardSettingsDrawerContent";
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

// ✅ IMPORTANT : même client que ta page login
import { createClient } from "@/lib/supabaseClient";
import { purgeAllBrowserAccountCaches, readAccountCacheValue, setActiveBrowserUserId, writeAccountCacheValue } from "@/lib/browserAccountCache";
import { expectedUiSnapshotDate, getLastChannelSyncAt, getOverviewSnapshotDate, hasFreshLocalGeneratorSnapshot, markChannelsSynced, mergeChannelBlockIntoCachedSnapshots, mergeGeneratorChannelBlockIntoCachedKpis, syncGeneratorOpportunitiesFromStatsSummary, readCachedChannelBlocks, readCachedChannelSyncAt, readCachedGeneratorChannelSyncAt, readCachedOppTotal, readGeneratorCache, readInrStatsPeriodSyncAt, statsCubeSessionKey, statsSummarySessionKey, type StatsWarmPeriod, writeUiCacheValue } from "./dashboard.client-cache";
import { markDailyStatsRefreshBootstrapChecked, markServerCacheSyncChecked, runDailyStatsRefreshBootstrap, wasDailyStatsRefreshBootstrapCheckedRecently, wasServerCacheSyncCheckedRecently, type DailyStatsRefreshBootstrapResponse } from "@/lib/dailyStatsRefreshClient";
import { hasActiveInrcySite } from "@/lib/inrcySite";
import { computeInertiaSnapshot } from "@/lib/loyalty/inertia";
import { PROFILE_VERSION_EVENT, type ProfileVersionChangeDetail } from "@/lib/profileVersioning";
import { getDrawerTitle, isDrawerPanel } from "./dashboard.utils";
import { inferChannelsFromRealtimePayload, inferChannelsFromSearchParams } from "./dashboard.shared";
import type { GoogleProduct, GoogleSource, ModuleStatus, Ownership } from "./dashboard.types";
import { DASHBOARD_CHANNEL_KEYS, type DashboardChannelKey } from "@/lib/dashboardChannels";
import { buildFluxBubbleItems } from "./dashboard.flux-bubbles";
import { buildDashboardPanelProps } from "./dashboard.panel-props";
import { createEmptyChannelBlock, createEmptyChannelBlocks, type InrstatsChannelBlock, type InrstatsChannelBlocksByChannel } from "@/lib/inrstats/channelBlocks";
import type { ConnectionDisplayStatus } from "@/lib/connectionVersions";


const useBrowserLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
const FORCED_SERVER_CACHE_CHECK_DEDUP_MS = 30_000;
const AUTO_DAILY_REFRESH_DEDUP_MS = 5 * 60_000;

export default function DashboardClient() {
  const [helpGeneratorOpen, setHelpGeneratorOpen] = useState(false);
  const [helpCanauxOpen, setHelpCanauxOpen] = useState(false);
  const [helpSiteInrcyOpen, setHelpSiteInrcyOpen] = useState(false);
  const [helpSiteWebOpen, setHelpSiteWebOpen] = useState(false);
  const [helpInertieOpen, setHelpInertieOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { panel, openPanel, closePanel, goToModule } = useDashboardPanelRouting();

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
  disconnectLinkedinAccount,
  saveLinkedinProfileUrl,
  setPanelSuccess: setLinkedinPanelSuccess,
  setPanelError: setLinkedinPanelError,
} = useLinkedinChannel({
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

const { profileIncomplete, activityIncomplete, checkProfile, checkActivity } = useDashboardCompletionChecks();

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
          site_inrcy: Boolean(hasActiveInrcySite(siteInrcyOwnership) && normalizeSiteUrl(siteInrcySavedUrl) && (siteInrcyGa4Connected || siteInrcyGscConnected)),
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
        },
        { maxMultiplier: 7 }
      ),
    [
      normalizeSiteUrl,
      siteInrcyOwnership,
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
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  if (!user || requestSeq !== siteConfigRequestSeqRef.current) return;

  const profileRes = await supabase
    .from("profiles")
    .select("inrcy_site_ownership")
    .eq("user_id", user.id)
    .maybeSingle();
  if (requestSeq !== siteConfigRequestSeqRef.current) return;

  const profile = profileRes.data as any | null;
  const ownership = (profile?.inrcy_site_ownership ?? "none") as Ownership;

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

  const nextState = {
    siteInrcyOwnership: ownership,
    siteInrcyUrl: siteInrcyUrlValue,
    siteInrcySavedUrl: siteInrcyUrlValue,
    siteInrcyContactEmail: siteInrcyContactEmailValue,
    siteInrcySettingsText: siteInrcySettingsTextValue,
    ga4MeasurementId: ga4MeasurementIdValue,
    ga4PropertyId: ga4PropertyIdValue,
    gscProperty: gscPropertyValue,
    siteWebSettingsText: siteWebSettingsTextValue,
    siteWebUrl: (siteWebObj as any)?.url ?? "",
    siteWebSavedUrl: (siteWebObj as any)?.url ?? "",
    siteWebGa4MeasurementId: (siteWebObj as any)?.ga4?.measurement_id ?? "",
    siteWebGa4PropertyId: String((siteWebObj as any)?.ga4?.property_id ?? ""),
    siteWebGscProperty: (siteWebObj as any)?.gsc?.property ?? "",
    instagramUrl: igObj?.url ?? "",
    instagramAccountConnected: !!igObj?.accountConnected,
    instagramConnected: !!igObj?.connected,
    instagramConnectionStatus: (igObj?.connected ? "connected" : "disconnected") as ConnectionDisplayStatus,
    instagramUsername: String(igObj?.username ?? ""),
    linkedinUrl: liObj?.url ?? "",
    linkedinAccountConnected: !!liObj?.accountConnected,
    linkedinConnected: !!liObj?.connected,
    linkedinConnectionStatus: (liObj?.connected || liObj?.accountConnected ? "connected" : "disconnected") as ConnectionDisplayStatus,
    linkedinDisplayName: String(liObj?.displayName ?? ""),
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
    siteInrcyGa4Connected: !!(ga4MeasurementIdValue || ga4PropertyIdValue),
    siteInrcyGscConnected: !!gscPropertyValue,
    siteWebGa4Connected: !!((siteWebObj as any)?.ga4?.measurement_id || (siteWebObj as any)?.ga4?.property_id),
    siteWebGscConnected: !!((siteWebObj as any)?.gsc?.property),
  };

  try {
    const states = await fetch("/api/integrations/channel-states", { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => null) as any;
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
      if (states?.linkedin?.profile_url) nextState.linkedinUrl = String(states.linkedin.profile_url);
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
  setSiteInrcyOwnership(nextState.siteInrcyOwnership);
  setSiteInrcyUrl(nextState.siteInrcyUrl);
  setSiteInrcySavedUrl(nextState.siteInrcySavedUrl);
  setSiteInrcyContactEmail(nextState.siteInrcyContactEmail);
  setSiteInrcySettingsText(nextState.siteInrcySettingsText);
  setSiteInrcySettingsError(null);
  setGa4MeasurementId(nextState.ga4MeasurementId);
  setGa4PropertyId(nextState.ga4PropertyId);
  setGscProperty(nextState.gscProperty);
  setSiteWebSettingsText(nextState.siteWebSettingsText);
  setSiteWebSettingsError(null);
  setSiteWebUrl(nextState.siteWebUrl);
  setSiteWebSavedUrl(nextState.siteWebSavedUrl);
  setSiteWebGa4MeasurementId(nextState.siteWebGa4MeasurementId);
  setSiteWebGa4PropertyId(nextState.siteWebGa4PropertyId);
  setSiteWebGscProperty(nextState.siteWebGscProperty);
  setInstagramUrl(nextState.instagramUrl);
  setInstagramAccountConnected(nextState.instagramAccountConnected);
  setInstagramConnected(nextState.instagramConnected);
  setInstagramConnectionStatus(nextState.instagramConnectionStatus);
  setInstagramUsername(nextState.instagramUsername);
  setLinkedinUrl(nextState.linkedinUrl);
  setLinkedinAccountConnected(nextState.linkedinAccountConnected);
  setLinkedinConnected(nextState.linkedinConnected);
  setLinkedinConnectionStatus(nextState.linkedinConnectionStatus);
  setLinkedinDisplayName(nextState.linkedinDisplayName);
  setGmbUrl(nextState.gmbUrl);
  setGmbAccountConnected(nextState.gmbAccountConnected);
  setGmbConfigured(nextState.gmbConfigured);
  setGmbConnected(nextState.gmbConnected);
  setGmbConnectionStatus(nextState.gmbConnectionStatus);
  setGmbAccountEmail(nextState.gmbAccountEmail);
  setGmbLocationName(nextState.gmbLocationName);
  setGmbLocationLabel(nextState.gmbLocationLabel);
  setFacebookUrl(nextState.facebookUrl);
  setFacebookAccountConnected(nextState.facebookAccountConnected);
  setFacebookPageConnected(nextState.facebookPageConnected);
  setFacebookConnectionStatus(nextState.facebookConnectionStatus);
  setFacebookAccountEmail(nextState.facebookAccountEmail);
  setFbSelectedPageId(nextState.fbSelectedPageId);
  setFbSelectedPageName(nextState.fbSelectedPageName);
  setSiteInrcyGa4Connected(nextState.siteInrcyGa4Connected);
  setSiteInrcyGscConnected(nextState.siteInrcyGscConnected);
  setSiteWebGa4Connected(nextState.siteWebGa4Connected);
  setSiteWebGscConnected(nextState.siteWebGscConnected);
}, [fetchGoogleConnected]);

useEffect(() => {
  loadSiteInrcy();
}, [loadSiteInrcy]);

const canAccessSiteInrcy = hasActiveInrcySite(siteInrcyOwnership);
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
const siteInrcyAllGreen = hasActiveInrcySite(siteInrcyOwnership) && siteInrcyProgressCount === 3;
const siteWebAllGreen = siteWebProgressCount === 3;
const profileCompleted = !profileIncomplete;
const activityCompleted = !activityIncomplete;
const sitePowerLinkConnected = hasSiteInrcyUrl || hasSiteWebUrl;
const sitePowerGa4Connected = (hasSiteInrcyUrl && siteInrcyGa4Connected) || (hasSiteWebUrl && siteWebGa4Connected);
const sitePowerGscConnected = (hasSiteInrcyUrl && siteInrcyGscConnected) || (hasSiteWebUrl && siteWebGscConnected);

const generatorPowerSteps = [
  { key: "profile", label: "Compléter mon profil", shortLabel: "Profil", weight: 15, completed: profileCompleted },
  { key: "activity", label: "Compléter mon activité", shortLabel: "Activité", weight: 15, completed: activityCompleted },
  { key: "site_link", label: "Connecter un site internet", shortLabel: "Site internet", weight: 10, completed: sitePowerLinkConnected },
  { key: "site_ga4", label: "Brancher GA4", shortLabel: "GA4", weight: 5, completed: sitePowerGa4Connected },
  { key: "site_gsc", label: "Brancher GSC", shortLabel: "GSC", weight: 5, completed: sitePowerGscConnected },
  { key: "gmb", label: "Connecter Google Business", shortLabel: "Google Business", weight: 20, completed: gmbConnected && gmbConnectionStatus !== "needs_update" },
  { key: "facebook", label: "Connecter Facebook", shortLabel: "Facebook", weight: 10, completed: facebookPageConnected && facebookConnectionStatus !== "needs_update" },
  { key: "instagram", label: "Connecter Instagram", shortLabel: "Instagram", weight: 10, completed: instagramConnected && instagramConnectionStatus !== "needs_update" },
  { key: "linkedin", label: "Connecter LinkedIn", shortLabel: "LinkedIn", weight: 10, completed: linkedinConnected && linkedinConnectionStatus !== "needs_update" },
] as const;

const generatorPower = generatorPowerSteps.reduce((sum, step) => sum + (step.completed ? step.weight : 0), 0);
const nextGeneratorPowerStep = generatorPowerSteps.find((step) => !step.completed) ?? null;
const remainingGeneratorPowerSteps = generatorPowerSteps.filter((step) => !step.completed).length;

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
    estimatedValue: options?.clearData ? 0 : current.estimatedValue,
    live: options?.clearData ? false : current.live,
    error: options?.clearError === false ? current.error : null,
    syncAt: Date.now(),
    snapshotDate: expectedUiSnapshotDate(),
  })), [updateChannelBlockLocally]);
  patchChannelConnectionLocallyRef.current = patchChannelConnectionLocally;

  const refreshChannelBlocksFromApi = useCallback(async (channel: DashboardChannelKey, fallbackSyncAt?: number) => {
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

    return applyChannelRefreshPayload(channel, json, fallbackSyncAt);
  }, [applyChannelRefreshPayload]);

  const refreshAllChannelBlocksFromApi = useCallback(async (fallbackSyncAt?: number) => {
    for (const channel of DASHBOARD_CHANNEL_KEYS) {
      await refreshChannelBlocksFromApi(channel, fallbackSyncAt);
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

  const refreshGeneratorChannelFromApi = useCallback(async (channel: DashboardChannelKey, fallbackSyncAt?: number) => {
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

    return applyGeneratorChannelRefreshPayload(channel, json, fallbackSyncAt);
  }, [applyGeneratorChannelRefreshPayload]);

  const refreshGeneratorChannelsFromApi = useCallback(async (channelsInput: readonly DashboardChannelKey[], fallbackSyncAt?: number) => {
    const channels = Array.from(new Set(channelsInput.filter((channel): channel is DashboardChannelKey => typeof channel === "string" && channel.length > 0)));
    for (const channel of channels) {
      await refreshGeneratorChannelFromApi(channel, fallbackSyncAt);
    }
  }, [refreshGeneratorChannelFromApi]);

  const refreshAllGeneratorChannelsFromApi = useCallback(async (fallbackSyncAt?: number) => {
    await refreshGeneratorChannelsFromApi(DASHBOARD_CHANNEL_KEYS, fallbackSyncAt);
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
        refreshAllGeneratorChannelsFromApi(syncAt),
        refreshAllChannelBlocksFromApi(syncAt),
      ]);
      notifyStatsRefresh(syncAt, DASHBOARD_CHANNEL_KEYS);
    };

    clearScheduledGeneratorRefreshes();
    await runSync();
  }, [clearScheduledGeneratorRefreshes, loadSiteInrcy, notifyStatsRefresh, refreshAllChannelBlocksFromApi, refreshAllGeneratorChannelsFromApi]);

  const fallbackToServerSyncThenGlobal = useCallback(async () => {
    try {
      await syncFromServerCacheIfNeeded(true);
    } catch {
      await triggerGeneratorRefresh();
    }
  }, [syncFromServerCacheIfNeeded, triggerGeneratorRefresh]);
  latestFallbackToServerSyncThenGlobalRef.current = fallbackToServerSyncThenGlobal;

  const triggerChannelRefresh = useCallback(async (channel: DashboardChannelKey) => {
    const syncAt = Date.now();
    lastGeneratorRefreshAtRef.current = syncAt;

    try {
      clearScheduledGeneratorRefreshes();

      const results = await Promise.allSettled([
        channel === "site_inrcy" ? loadSiteInrcy() : Promise.resolve(),
        refreshGeneratorChannelFromApi(channel, syncAt),
        refreshChannelBlocksFromApi(channel, syncAt),
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
        refreshGeneratorChannelsFromApi(channels, syncAt),
        ...channels.map((channel) => refreshChannelBlocksFromApi(channel, syncAt)),
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
    const cached = readGeneratorCache();
    const lastChannelSyncAt = getLastChannelSyncAt();
    if (cached?.payload?.leads && cached.syncedAt >= lastChannelSyncAt && cached.snapshotDate === expectedUiSnapshotDate()) {
      return;
    }
    void Promise.allSettled([
      refreshAllGeneratorChannelsFromApi(),
      refreshAllChannelBlocksFromApi(),
    ]).then((results) => {
      const failed = results.some((result) => result.status === "rejected");
      if (!failed) return;
      void syncFromServerCacheIfNeeded(true).catch(() => {
        void refreshKpis();
      });
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

  const leadsToday = typeof kpis?.leads?.today === "number" ? kpis.leads.today : null;
  const leadsWeek = typeof kpis?.leads?.week === "number" ? kpis.leads.week : null;
  const leadsMonth = typeof kpis?.leads?.month === "number" ? kpis.leads.month : null;
  const generatorIsActive = Boolean(
    hasSiteInrcyUrl ||
    hasSiteWebUrl ||
    gmbConnected ||
    facebookPageConnected ||
    instagramConnected ||
    linkedinConnected
  );

  const estimatedValue = typeof kpis?.estimatedValue === "number" ? kpis.estimatedValue : null;

  const getSiteBubbleProgress = useCallback((kind: "site_inrcy" | "site_web") => {
    const progress = kind === "site_inrcy" ? siteInrcyProgressCount : siteWebProgressCount;
    const hasUrl = kind === "site_inrcy" ? hasSiteInrcyUrl : hasSiteWebUrl;
    const canUseSite = kind === "site_inrcy" ? hasActiveInrcySite(siteInrcyOwnership) : true;

    if (kind === "site_inrcy" && !canUseSite) {
      return { status: "coming" as ModuleStatus, text: "Aucun site" };
    }

    return {
      status: hasUrl ? "connected" as ModuleStatus : "available" as ModuleStatus,
      text: `${hasUrl ? "Connecté" : "A configurer"} ${progress}/3`,
    };
  }, [hasSiteInrcyUrl, hasSiteWebUrl, siteInrcyOwnership, siteInrcyProgressCount, siteWebProgressCount]);

  const fluxBubbleItems = useMemo(() => buildFluxBubbleItems({
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
    linkedinConnected,
    linkedinUrl,
    openPanel,
    savedSiteWebUrlMeta,
    setHelpSiteInrcyOpen,
    setHelpSiteWebOpen,
    siteInrcySavedUrl,
    siteWebSavedUrl,
  }), [
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
    linkedinConnected,
    linkedinUrl,
    openPanel,
    savedSiteWebUrlMeta,
    siteInrcySavedUrl,
    siteWebSavedUrl,
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


  const locals = {
    canConfigureSite, canConnectSiteInrcyGoogle, canConnectSiteWebGoogle,
    connectFacebookAccount, connectFacebookBusinessAccount, connectGmbAccount, connectInstagramAccount, connectInstagramBusinessAccount, connectLinkedinAccount,
    connectSiteInrcyGa4, connectSiteInrcyGsc, connectSiteWebGa4, connectSiteWebGsc,
    deleteSiteInrcyUrlFromDrawer, deleteSiteWebUrlFromDrawer,
    disconnectFacebookAccountFromDrawer, disconnectFacebookPageFromDrawer, disconnectGmbAccountFromDrawer, disconnectGmbBusinessFromDrawer,
    disconnectInstagramAccountFromDrawer, disconnectInstagramProfileFromDrawer, disconnectLinkedinAccountFromDrawer,
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
    loadFacebookPages, loadGmbAccountsAndLocations, loadInstagramAccounts,
    resetSiteInrcyAll, resetSiteWebAll,
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
  };

  const {
    siteWebPanelProps,
    gmbPanelProps,
    linkedinPanelProps,
    siteInrcyPanelProps,
    instagramPanelProps,
    facebookPanelProps,
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
        onOpenStats={() => router.push("/dashboard/stats")}
        leadsWeek={leadsWeek}
        leadsMonth={leadsMonth}
      />

      <DashboardChannelsSection
        fluxBubbleItems={fluxBubbleItems}
        goToModule={goToModule}
        openPanel={openPanel}
        onOpenChannelsHelp={() => setHelpCanauxOpen(true)}
      />

      <SettingsDrawer
        title={getDrawerTitle(panel)}
        isOpen={isDrawerPanel(panel)}
        onClose={closePanel}
        headerActions={
          panel === "inertie" ? <HelpButton onClick={() => setHelpInertieOpen(true)} title="Aide : Mon inertie" /> : null
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
        />
      </SettingsDrawer>

      <DashboardHelpModals
        helpGeneratorOpen={helpGeneratorOpen}
        helpCanauxOpen={helpCanauxOpen}
        helpSiteInrcyOpen={helpSiteInrcyOpen}
        helpSiteWebOpen={helpSiteWebOpen}
        helpInertieOpen={helpInertieOpen}
        onCloseGenerator={() => setHelpGeneratorOpen(false)}
        onCloseCanaux={() => setHelpCanauxOpen(false)}
        onCloseSiteInrcy={() => setHelpSiteInrcyOpen(false)}
        onCloseSiteWeb={() => setHelpSiteWebOpen(false)}
        onCloseInertie={() => setHelpInertieOpen(false)}
      />

      <footer className={styles.footer}>
        <div className={styles.footerLeft}>© 2026 iNrCy</div>
      </footer>
    </main>
  );
}

