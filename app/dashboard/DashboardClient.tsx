"use client";

import styles from "./dashboard.module.css";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from "react";
import { getSimpleFrenchApiError, getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import SettingsDrawer from "./SettingsDrawer";
import HelpButton from "./_components/HelpButton";
import DashboardHelpModals from "./_components/DashboardHelpModals";
import DashboardHero from "./_components/DashboardHero";
import DashboardTopbar from "./_components/DashboardTopbar";
import DashboardChannelsSection from "./_components/DashboardChannelsSection";
import type { DashboardFluxBubbleData } from "./_components/DashboardFluxBubble";
import DashboardSettingsDrawerContent from "./_components/DashboardSettingsDrawerContent";

// ✅ IMPORTANT : même client que ta page login
import { createClient } from "@/lib/supabaseClient";
import { purgeAllBrowserAccountCaches, readAccountCacheValue, setActiveBrowserUserId, writeAccountCacheValue } from "@/lib/browserAccountCache";
import { expectedUiSnapshotDate, getInitialGeneratorKpis, getInitialOppTotal, getLastChannelSyncAt, getOverviewSnapshotDate, hasFreshLocalGeneratorSnapshot, markChannelsSynced, mergeChannelBlockIntoCachedSnapshots, mergeGeneratorChannelBlockIntoCachedKpis, readCachedChannelBlocks, readCachedChannelSyncAt, readCachedGeneratorChannelSyncAt, readCachedOppTotal, readGeneratorCache, readInrStatsPeriodSyncAt, readUiCacheValue, statsCubeSessionKey, statsSummarySessionKey, type StatsWarmPeriod, writeUiCacheValue } from "./dashboard.client-cache";
import { markDailyStatsRefreshBootstrapChecked, markServerCacheSyncChecked, runDailyStatsRefreshBootstrap, wasDailyStatsRefreshBootstrapCheckedRecently, wasServerCacheSyncCheckedRecently, type DailyStatsRefreshBootstrapResponse } from "@/lib/dailyStatsRefreshClient";
import { hasActiveInrcySite, isManagedInrcySite } from "@/lib/inrcySite";
import { decodeBusinessSector } from "@/lib/activitySectors";
import { computeInertiaSnapshot } from "@/lib/loyalty/inertia";
import { PROFILE_VERSION_EVENT, type ProfileVersionChangeDetail } from "@/lib/profileVersioning";
import { fluxModules, GOOGLE_SOURCES, MODULE_ICONS } from "./dashboard.constants";
import { getDrawerTitle, isDrawerPanel, statusLabel } from "./dashboard.utils";
import { getBubbleStatusFromBlock, getBubbleViewHrefFromBlock, inferChannelsFromRealtimePayload, inferChannelsFromSearchParams, normalizeExternalHref } from "./dashboard.shared";
import type { ActusFont, ActusTheme, GoogleProduct, GoogleSource, ModuleStatus, NotificationItem, Ownership } from "./dashboard.types";
import { DASHBOARD_CHANNEL_KEYS, type DashboardChannelKey } from "@/lib/dashboardChannels";
import { createEmptyChannelBlock, createEmptyChannelBlocks, type InrstatsChannelBlock, type InrstatsChannelBlocksByChannel } from "@/lib/inrstats/channelBlocks";


const useBrowserLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function DashboardClient() {
  const [helpGeneratorOpen, setHelpGeneratorOpen] = useState(false);
  const [helpCanauxOpen, setHelpCanauxOpen] = useState(false);
  const [helpSiteInrcyOpen, setHelpSiteInrcyOpen] = useState(false);
  const [helpSiteWebOpen, setHelpSiteWebOpen] = useState(false);
  const [helpInertieOpen, setHelpInertieOpen] = useState(false);
  const router = useRouter();

  const searchParams = useSearchParams();
  const panel = searchParams.get("panel"); // "contact" | "profil" | "activite" | "abonnement" | "mails" | ... | null

  const openPanel = (
    name:
      | "contact"
      | "profil"
      | "compte"
      | "activite"
      | "abonnement"
      | "mails"
      | "site_inrcy"
      | "site_web"
      | "instagram"
      | "linkedin"
      | "gmb"
      | "facebook"
      | "legal"
      | "rgpd"
      | "inertie"
      | "boutique"
      | "notifications"
      | "parrainage"
  ) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("panel", name);
    // ✅ Marqueur: panneau ouvert volontairement par l'utilisateur.
    // Sert à éviter l'ouverture automatique en boucle lors d'un refresh/connexion.
    try {
      sessionStorage.setItem("inrcy_panel_explicit_open", "1");
      sessionStorage.setItem("inrcy_last_panel", name);
    } catch {}
    // ✅ En mobile, on garde la position de scroll (pas de jump en haut)
    try {
      sessionStorage.setItem("inrcy_dashboard_scrollY", String(window.scrollY ?? 0));
    } catch {}
    router.push(`/dashboard?${params.toString()}`, { scroll: false });
  };

  const closePanel = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("panel");
    ["linked", "ok", "error", "message", "warning", "toast", "activated", "skipped"].forEach((key) => {
      params.delete(key);
    });
    const qs = params.toString();
    // ✅ Quand on ferme, on remet le marqueur à zéro.
    // (Sinon un refresh pourrait relancer un panneau si une logique externe remet ?panel=...)
    try {
      sessionStorage.removeItem("inrcy_panel_explicit_open");
      sessionStorage.removeItem("inrcy_last_panel");
    } catch {}
    // ✅ En mobile, on garde la position de scroll (pas de jump en haut)
    try {
      sessionStorage.setItem("inrcy_dashboard_scrollY", String(window.scrollY ?? 0));
    } catch {}
    router.replace(qs ? `/dashboard?${qs}` : "/dashboard", { scroll: false });
  };

  // ✅ Sécurité UX: si l'URL arrive avec ?panel=profil (ou compte) sans action explicite
  // (cas observé: refresh/connexion + ancienne URL), on ferme automatiquement.
  // ⚠️ On ne touche PAS aux panels utilisés comme retours OAuth/Stripe (abonnement, mails, etc.).
  useEffect(() => {
    if (panel !== "profil" && panel !== "compte") return;
    try {
      const explicit = sessionStorage.getItem("inrcy_panel_explicit_open");
      if (explicit) return;
    } catch {
      // si sessionStorage indisponible, on ne force rien
      return;
    }
    closePanel();
  }, [panel]);

  // Orientation: gérée globalement via <OrientationGuard />

  // Preserve dashboard scroll position when leaving the dashboard (vers un module)
  const goToModule = useCallback(
    (path: string) => {
      try {
        sessionStorage.setItem("inrcy_dashboard_scrollY", String(window.scrollY ?? 0));
      } catch {}
      // IMPORTANT: en allant dans un module, on VEUT arriver en haut de page.
      // On ne désactive donc PAS le scroll automatique de Next ici.
      router.push(path);
    },
    [router]
  );

  useEffect(() => {
    try {
      const y = sessionStorage.getItem("inrcy_dashboard_scrollY");
      if (!y) return;
      const top = Math.max(0, parseInt(y, 10) || 0);
      // Let the page paint, then restore
      requestAnimationFrame(() => window.scrollTo(0, top));
      setTimeout(() => window.scrollTo(0, top), 60);
      sessionStorage.removeItem("inrcy_dashboard_scrollY");
    } catch {}
  }, [panel]);

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

  // ✅ Menu utilisateur (desktop)
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const desktopNotificationMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileNotificationMenuRef = useRef<HTMLDivElement | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const unreadNotificationsCount = useMemo(() => notifications.filter((item) => item.unread).length, [notifications]);
  const notificationsRequestSeqRef = useRef(0);
  const kpisRequestSeqRef = useRef(0);
  const siteConfigRequestSeqRef = useRef(0);
  const activeUserIdRef = useRef<string | null>(null);

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
  const [drawerMutationState, setDrawerMutationState] = useState<Record<string, boolean>>({});
  const drawerMutationStateRef = useRef<Record<string, boolean>>({});

  const setDrawerMutationBusy = useCallback((key: string, busy: boolean) => {
    if (busy) {
      drawerMutationStateRef.current = { ...drawerMutationStateRef.current, [key]: true };
      setDrawerMutationState((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
      return;
    }

    if (!drawerMutationStateRef.current[key]) return;
    const nextRef = { ...drawerMutationStateRef.current };
    delete nextRef[key];
    drawerMutationStateRef.current = nextRef;
    setDrawerMutationState((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const runDrawerMutation = useCallback(async <T,>(key: string, job: () => Promise<T> | T) => {
    if (drawerMutationStateRef.current[key]) return null;
    setDrawerMutationBusy(key, true);
    try {
      return await job();
    } finally {
      setDrawerMutationBusy(key, false);
    }
  }, [setDrawerMutationBusy]);

  const isDrawerMutationPending = useCallback((key: string) => Boolean(drawerMutationState[key]), [drawerMutationState]);

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

  const refreshNotifications = useCallback(async () => {
    const requestSeq = ++notificationsRequestSeqRef.current;
    try {
      setNotificationsLoading(true);
      const res = await fetch("/api/notifications/feed?limit=12", { credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(await getSimpleFrenchApiError(res));
      if (requestSeq !== notificationsRequestSeqRef.current) return;
      setNotifications(Array.isArray(json?.items) ? json.items : []);
      setNotificationsError(null);
    } catch (e: any) {
      if (requestSeq !== notificationsRequestSeqRef.current) return;
      setNotificationsError(getSimpleFrenchErrorMessage(e, "Impossible de charger les notifications pour le moment."));
    } finally {
      if (requestSeq === notificationsRequestSeqRef.current) {
        setNotificationsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      void refreshNotifications();
    };

    const initialTimer = window.setTimeout(run, 900);
    const timer = window.setInterval(run, 120000);
    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [refreshNotifications]);

  const markNotificationRead = useCallback(async (id: string) => {
    setNotifications((current) => current.map((item) => (item.id === id ? { ...item, unread: false } : item)));
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "POST", credentials: "include" });
    } catch {}
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    setNotifications((current) => current.map((item) => ({ ...item, unread: false })));
    try {
      await fetch("/api/notifications/mark-all-read", { method: "POST", credentials: "include" });
    } catch {}
  }, []);

  const deleteNotification = useCallback(async (id: string) => {
    const previous = notifications;
    setNotifications((current) => current.filter((item) => item.id !== id));
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error(await getSimpleFrenchApiError(res, "Impossible de supprimer cette notification."));
    } catch {
      setNotifications(previous);
    }
  }, [notifications]);

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

const [referralName, setReferralName] = useState("");
const [referralPhone, setReferralPhone] = useState("");
const [referralEmail, setReferralEmail] = useState("");
const [referralFrom, setReferralFrom] = useState("");
const [referralSubmitting, setReferralSubmitting] = useState(false);
const [referralNotice, setReferralNotice] = useState<string | null>(null);
const [referralError, setReferralError] = useState<string | null>(null);
// ✅ Site iNrCy (ownership + url + config)
const [siteInrcyOwnership, setSiteInrcyOwnership] = useState<Ownership>("none");
const [siteInrcyUrl, setSiteInrcyUrl] = useState<string>("");
const [siteInrcySavedUrl, setSiteInrcySavedUrl] = useState<string>("");
const [siteInrcyContactEmail, setSiteInrcyContactEmail] = useState<string>("");
const [siteInrcySettingsText, setSiteInrcySettingsText] = useState<string>("{}");
const [siteInrcySettingsError, setSiteInrcySettingsError] = useState<string | null>(null);
const [siteInrcyTrackingBusy, setSiteInrcyTrackingBusy] = useState(false);
  const [siteInrcyGa4Notice, setSiteInrcyGa4Notice] = useState<string | null>(null);
  const [siteInrcyGscNotice, setSiteInrcyGscNotice] = useState<string | null>(null);
  const [siteInrcyUrlNotice, setSiteInrcyUrlNotice] = useState<string | null>(null);
  const [siteWebGa4Notice, setSiteWebGa4Notice] = useState<string | null>(null);
  const [siteWebGscNotice, setSiteWebGscNotice] = useState<string | null>(null);
  const [siteWebUrlNotice, setSiteWebUrlNotice] = useState<string | null>(null);
  const [instagramUrlNotice, setInstagramUrlNotice] = useState<string | null>(null);
  const [instagramUrlError, setInstagramUrlError] = useState<string | null>(null);
  const [linkedinUrlNotice, setLinkedinUrlNotice] = useState<string | null>(null);
  const [linkedinUrlError, setLinkedinUrlError] = useState<string | null>(null);
  const [gmbUrlNotice, setGmbUrlNotice] = useState<string | null>(null);
  const [gmbUrlError, setGmbUrlError] = useState<string | null>(null);
  const [facebookUrlNotice, setFacebookUrlNotice] = useState<string | null>(null);
  const [facebookUrlError, setFacebookUrlError] = useState<string | null>(null);

  const clearPanelNotices = useCallback((kind: "facebook" | "instagram" | "linkedin" | "gmb") => {
    if (kind === "facebook") { setFacebookUrlNotice(null); setFacebookUrlError(null); return; }
    if (kind === "instagram") { setInstagramUrlNotice(null); setInstagramUrlError(null); return; }
    if (kind === "linkedin") { setLinkedinUrlNotice(null); setLinkedinUrlError(null); return; }
    setGmbUrlNotice(null); setGmbUrlError(null);
  }, []);

  const setPanelSuccess = useCallback((kind: "facebook" | "instagram" | "linkedin" | "gmb", message: string, timeout = 2200) => {
    clearPanelNotices(kind);
    const clean = message.trim();
    if (kind === "facebook") setFacebookUrlNotice(clean);
    else if (kind === "instagram") setInstagramUrlNotice(clean);
    else if (kind === "linkedin") setLinkedinUrlNotice(clean);
    else setGmbUrlNotice(clean);
    window.setTimeout(() => clearPanelNotices(kind), timeout);
  }, [clearPanelNotices]);

  const setPanelError = useCallback((kind: "facebook" | "instagram" | "linkedin" | "gmb", input: unknown, fallback: string, timeout = 3200) => {
    clearPanelNotices(kind);
    const clean = getSimpleFrenchErrorMessage(input, fallback);
    if (kind === "facebook") setFacebookUrlError(clean);
    else if (kind === "instagram") setInstagramUrlError(clean);
    else if (kind === "linkedin") setLinkedinUrlError(clean);
    else setGmbUrlError(clean);
    window.setTimeout(() => clearPanelNotices(kind), timeout);
  }, [clearPanelNotices]);

  // ✅ Tokens widget actus (signés + liés au domaine, anti-copie)
  const [widgetTokenInrcySite, setWidgetTokenInrcySite] = useState<string>("");
  const [widgetTokenSiteWeb, setWidgetTokenSiteWeb] = useState<string>("");
  const [siteInrcyActusLayout, setSiteInrcyActusLayout] = useState<"list" | "carousel">("list");
  const [siteInrcyActusLimit, setSiteInrcyActusLimit] = useState<number>(5);
  const [siteWebActusLayout, setSiteWebActusLayout] = useState<"list" | "carousel">("list");
  const [siteWebActusLimit, setSiteWebActusLimit] = useState<number>(5);
  const [siteInrcyActusFont, setSiteInrcyActusFont] = useState<ActusFont>("site");
  const [siteWebActusFont, setSiteWebActusFont] = useState<ActusFont>("site");
  const [siteInrcyActusTheme, setSiteInrcyActusTheme] = useState<ActusTheme>("nature");
  const [siteWebActusTheme, setSiteWebActusTheme] = useState<ActusTheme>("nature");
  const [showSiteInrcyWidgetCode, setShowSiteInrcyWidgetCode] = useState(false);
  const [showSiteWebWidgetCode, setShowSiteWebWidgetCode] = useState(false);

  // ✅ Connexions Google (viennent de integrations, pas des IDs)
  const [siteInrcyGa4Connected, setSiteInrcyGa4Connected] = useState(false);
  const [siteInrcyGscConnected, setSiteInrcyGscConnected] = useState(false);
  const [siteWebGa4Connected, setSiteWebGa4Connected] = useState(false);
  const [siteWebGscConnected, setSiteWebGscConnected] = useState(false);

const [ga4MeasurementId, setGa4MeasurementId] = useState<string>("");
const [ga4PropertyId, setGa4PropertyId] = useState<string>("");

// ✅ Google Search Console
const [gscProperty, setGscProperty] = useState<string>("");

// ✅ Site web (indépendant)
const [siteWebUrl, setSiteWebUrl] = useState<string>("");
const [siteWebSavedUrl, setSiteWebSavedUrl] = useState<string>("");
const [siteWebSettingsText, setSiteWebSettingsText] = useState<string>("{}");
const [siteWebSettingsError, setSiteWebSettingsError] = useState<string | null>(null);
const [siteWebGa4MeasurementId, setSiteWebGa4MeasurementId] = useState<string>("");
const [siteWebGa4PropertyId, setSiteWebGa4PropertyId] = useState<string>("");
const [siteWebGscProperty, setSiteWebGscProperty] = useState<string>("");

  // ✅ Génère automatiquement des tokens signés (liés au domaine) pour le widget actus
  useEffect(() => {
    const d = extractDomain(siteInrcyUrl);
    if (!d) {
      setWidgetTokenInrcySite("");
      return;
    }
    fetchWidgetToken(d, "inrcy_site")
      .then((t) => setWidgetTokenInrcySite(t))
      .catch(() => setWidgetTokenInrcySite(""));
  }, [siteInrcyUrl, extractDomain, fetchWidgetToken]);

  useEffect(() => {
    const d = extractDomain(siteWebUrl);
    if (!d) {
      setWidgetTokenSiteWeb("");
      return;
    }
    fetchWidgetToken(d, "site_web")
      .then((t) => setWidgetTokenSiteWeb(t))
      .catch(() => setWidgetTokenSiteWeb(""));
  }, [siteWebUrl, extractDomain, fetchWidgetToken]);

// ✅ Instagram & LinkedIn (connexion)
const [instagramUrl, setInstagramUrl] = useState<string>("");
const [instagramAccountConnected, setInstagramAccountConnected] = useState<boolean>(false);
const [instagramConnected, setInstagramConnected] = useState<boolean>(false);
const [instagramUsername, setInstagramUsername] = useState<string>("");

const [linkedinUrl, setLinkedinUrl] = useState<string>("");
const [linkedinAccountConnected, setLinkedinAccountConnected] = useState<boolean>(false);
const [linkedinConnected, setLinkedinConnected] = useState<boolean>(false);
const [linkedinDisplayName, setLinkedinDisplayName] = useState<string>("");
const [profileIncomplete, setProfileIncomplete] = useState(false);
const [activityIncomplete, setActivityIncomplete] = useState(false);

// ✅ Google Business & Facebook (liens + connexion)
const [gmbUrl, setGmbUrl] = useState<string>("");
const [gmbConnected, setGmbConnected] = useState<boolean>(false);
// Google Business has 2 levels:
// 1) accountConnected: OAuth OK (we can list locations)
// 2) configured/connected: a specific location is selected (we can fetch stats)
const [gmbAccountConnected, setGmbAccountConnected] = useState<boolean>(false);
const [gmbConfigured, setGmbConfigured] = useState<boolean>(false);
const [gmbAccountEmail, setGmbAccountEmail] = useState<string>("");
const [facebookUrl, setFacebookUrl] = useState<string>("");
	// Facebook has 2 levels:
	// 1) accountConnected: OAuth OK (we can list pages)
	// 2) pageConnected: a specific Page is selected (we can fetch stats)
	const [facebookAccountConnected, setFacebookAccountConnected] = useState<boolean>(false);
	const [facebookPageConnected, setFacebookPageConnected] = useState<boolean>(false);
	const [facebookAccountEmail, setFacebookAccountEmail] = useState<string>("");

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
          gmb: Boolean(gmbAccountConnected && gmbConfigured),
          // Facebook : compte + page sélectionnée.
          facebook: Boolean(facebookAccountConnected && facebookPageConnected),
          // Instagram : compte + page/profil (resource) sélectionné.
          instagram: Boolean(instagramAccountConnected && instagramConnected),
          linkedin: Boolean(linkedinAccountConnected),
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
      instagramAccountConnected,
      instagramConnected,
      linkedinAccountConnected,
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


const submitReferral = useCallback(async () => {
  const name = referralName.trim();
  const phone = referralPhone.trim();
  const email = referralEmail.trim();
  const from = referralFrom.trim();

  if (!name || !phone || !email || !from) {
    setReferralError("Merci de remplir tous les champs.");
    return;
  }

  setReferralSubmitting(true);
  setReferralError(null);
  setReferralNotice(null);

  try {
    const res = await fetch("/api/referrals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name, phone, email, from }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      throw new Error(await getSimpleFrenchApiError(res));
    }
    setReferralNotice("Merci, votre recommandation a bien été envoyée à l’équipe iNrCy.");
    setReferralName("");
    setReferralPhone("");
    setReferralEmail("");
    setReferralFrom("");
  } catch (e: any) {
    setReferralError(getSimpleFrenchErrorMessage(e, "Impossible d’envoyer la recommandation pour le moment."));
  } finally {
    setReferralSubmitting(false);
  }
}, [referralEmail, referralFrom, referralName, referralPhone]);

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

const removeGoogleProductFromSettings = useCallback((settingsObj: any, product: GoogleProduct) => {
  const next = settingsObj && typeof settingsObj === "object" ? { ...settingsObj } : {};
  if (product === "ga4") delete next.ga4;
  if (product === "gsc") delete next.gsc;
  return next;
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
    instagramUsername: String(igObj?.username ?? ""),
    linkedinUrl: liObj?.url ?? "",
    linkedinAccountConnected: !!liObj?.accountConnected,
    linkedinConnected: !!liObj?.connected,
    linkedinDisplayName: String(liObj?.displayName ?? ""),
    gmbUrl: gmbObj?.url ?? "",
    gmbAccountConnected: !!gmbObj?.connected,
    gmbConfigured: !!gmbObj?.resource_id,
    gmbConnected: !!gmbObj?.connected && !!gmbObj?.resource_id,
    gmbAccountEmail: gmbObj?.accountEmail ?? "",
    gmbLocationName: String(gmbObj?.locationName ?? gmbObj?.resource_id ?? ""),
    gmbLocationLabel: String(gmbObj?.locationTitle ?? gmbObj?.resource_label ?? ""),
    facebookUrl: fbObj?.url ?? "",
    facebookAccountConnected: !!fbObj?.accountConnected,
    facebookPageConnected: !!fbObj?.pageConnected,
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
      if (states?.gmb?.email) nextState.gmbAccountEmail = String(states.gmb.email);
      if (states?.gmb?.resource_id) nextState.gmbLocationName = String(states.gmb.resource_id);
      if (states?.gmb?.resource_label) nextState.gmbLocationLabel = String(states.gmb.resource_label);

      nextState.facebookAccountConnected = !!states?.facebook?.accountConnected;
      nextState.facebookPageConnected = !!states?.facebook?.pageConnected;
      if (states?.facebook?.user_email) nextState.facebookAccountEmail = String(states.facebook.user_email);
      if (states?.facebook?.resource_id) nextState.fbSelectedPageId = String(states.facebook.resource_id);
      if (states?.facebook?.resource_label) nextState.fbSelectedPageName = String(states.facebook.resource_label);
      if (states?.facebook?.page_url) nextState.facebookUrl = String(states.facebook.page_url);

      nextState.instagramAccountConnected = !!states?.instagram?.accountConnected;
      nextState.instagramConnected = !!states?.instagram?.connected;
      if (states?.instagram?.username) nextState.instagramUsername = String(states.instagram.username);
      if (states?.instagram?.profile_url) nextState.instagramUrl = String(states.instagram.profile_url);

      nextState.linkedinAccountConnected = !!states?.linkedin?.accountConnected;
      nextState.linkedinConnected = !!states?.linkedin?.connected;
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
  setInstagramUsername(nextState.instagramUsername);
  setLinkedinUrl(nextState.linkedinUrl);
  setLinkedinAccountConnected(nextState.linkedinAccountConnected);
  setLinkedinConnected(nextState.linkedinConnected);
  setLinkedinDisplayName(nextState.linkedinDisplayName);
  setGmbUrl(nextState.gmbUrl);
  setGmbAccountConnected(nextState.gmbAccountConnected);
  setGmbConfigured(nextState.gmbConfigured);
  setGmbConnected(nextState.gmbConnected);
  setGmbAccountEmail(nextState.gmbAccountEmail);
  setGmbLocationName(nextState.gmbLocationName);
  setGmbLocationLabel(nextState.gmbLocationLabel);
  setFacebookUrl(nextState.facebookUrl);
  setFacebookAccountConnected(nextState.facebookAccountConnected);
  setFacebookPageConnected(nextState.facebookPageConnected);
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
  { key: "gmb", label: "Connecter Google Business", shortLabel: "Google Business", weight: 20, completed: gmbConnected },
  { key: "facebook", label: "Connecter Facebook", shortLabel: "Facebook", weight: 10, completed: facebookPageConnected },
  { key: "instagram", label: "Connecter Instagram", shortLabel: "Instagram", weight: 10, completed: instagramConnected },
  { key: "linkedin", label: "Connecter LinkedIn", shortLabel: "LinkedIn", weight: 10, completed: linkedinConnected },
] as const;

const generatorPower = generatorPowerSteps.reduce((sum, step) => sum + (step.completed ? step.weight : 0), 0);
const nextGeneratorPowerStep = generatorPowerSteps.find((step) => !step.completed) ?? null;
const remainingGeneratorPowerSteps = generatorPowerSteps.filter((step) => !step.completed).length;

const updateSiteInrcySettings = useCallback(async (nextSettings: any) => {
  if (siteInrcyOwnership === "none") return;

  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  if (!user) return;

  const { error } = await supabase
    .from("inrcy_site_configs")
    .upsert({ user_id: user.id, settings: nextSettings ?? {} }, { onConflict: "user_id" });

  if (error) {
    setSiteInrcySettingsError(getSimpleFrenchErrorMessage(error));
    return;
  }

  setSiteInrcySettingsError(null);
  try {
    setSiteInrcySettingsText(JSON.stringify(nextSettings ?? {}, null, 2));
  } catch {
    setSiteInrcySettingsText("{}");
  }
}, [siteInrcyOwnership]);

const saveSiteInrcySettings = useCallback(async () => {
  if (siteInrcyOwnership === "none") return;

  let parsed: any;
  try {
    parsed = siteInrcySettingsText?.trim() ? JSON.parse(siteInrcySettingsText) : {};
  } catch (e) {
    setSiteInrcySettingsError("JSON invalide. Vérifie la syntaxe (guillemets, virgules, accolades…)." );
    return;
  }

  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  if (!user) return;

  const { error } = await supabase.from("inrcy_site_configs").upsert({ user_id: user.id, settings: parsed }, { onConflict: "user_id" });

  if (error) {
    setSiteInrcySettingsError(getSimpleFrenchErrorMessage(error));
    return;
  }

  setSiteInrcySettingsError(null);
}, [siteInrcyOwnership, siteInrcySettingsText]);


const attachGoogleAnalytics = useCallback(async () => {
  const measurement = ga4MeasurementId.trim();
  const propertyIdRaw = ga4PropertyId.trim();
  if (!measurement) {
    setSiteInrcySettingsError("Renseigne un ID de mesure GA4 (ex: G-XXXXXXXXXX).");
    return;
  }

  if (!propertyIdRaw || !/^\d+$/.test(propertyIdRaw)) {
    setSiteInrcySettingsError("Renseigne un Property ID GA4 (numérique, ex: 123456789).");
    return;
  }

  let parsed: any;
  try {
    parsed = siteInrcySettingsText?.trim() ? JSON.parse(siteInrcySettingsText) : {};
  } catch {
    setSiteInrcySettingsError("JSON invalide. Corrige la configuration avant de rattacher Google Analytics.");
    return;
  }

  parsed.ga4 = { ...(parsed.ga4 ?? {}), measurement_id: measurement, property_id: propertyIdRaw };

  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  if (!user) return;

  const { error } = await supabase.from("inrcy_site_configs").upsert({ user_id: user.id, settings: parsed }, { onConflict: "user_id" });

  if (error) {
    setSiteInrcySettingsError(getSimpleFrenchErrorMessage(error));
    return;
  }

  setSiteInrcySettingsText(JSON.stringify(parsed, null, 2));
  setSiteInrcyGa4Notice("✅ Enregistrement GA4 validé");
  window.setTimeout(() => setSiteInrcyGa4Notice(null), 2500);

  setSiteInrcySettingsError(null);
}, [ga4MeasurementId, ga4PropertyId, siteInrcySettingsText]);


const attachGoogleSearchConsole = useCallback(async () => {
  const property = gscProperty.trim();
  if (!property) {
    setSiteInrcySettingsError("Renseigne une propriété Search Console (ex: sc-domain:monsite.fr ou https://monsite.fr/).");
    return;
  }

  let parsed: any;
  try {
    parsed = siteInrcySettingsText?.trim() ? JSON.parse(siteInrcySettingsText) : {};
  } catch {
    setSiteInrcySettingsError("JSON invalide. Corrige la configuration avant de rattacher Search Console.");
    return;
  }

  parsed.gsc = { ...(parsed.gsc ?? {}), property };

  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  if (!user) return;

  const { error } = await supabase.from("inrcy_site_configs").upsert({ user_id: user.id, settings: parsed }, { onConflict: "user_id" });

  if (error) {
    setSiteInrcySettingsError(getSimpleFrenchErrorMessage(error));
    return;
  }

  setSiteInrcySettingsText(JSON.stringify(parsed, null, 2));
  setSiteInrcyGscNotice("✅ Enregistrement Search Console validé");
  window.setTimeout(() => setSiteInrcyGscNotice(null), 2500);

  setSiteInrcySettingsError(null);
}, [gscProperty, siteInrcySettingsText]);




const connectSiteInrcyGa4 = useCallback(() => {
  if (siteInrcyOwnership === "none") {
    setSiteInrcySettingsError("Connexion Google Analytics indisponible : aucun site iNrCy.");
    return;
  }
  const siteUrl = (siteInrcyUrl || "").trim();
  if (!siteUrl) {
    setSiteInrcySettingsError("Renseigne le lien du site iNrCy avant de connecter Google Analytics.");
    return;
  }
  const qp = new URLSearchParams({
    source: "site_inrcy",
    product: "ga4",
    siteUrl,
  });
  // L'OAuth stats est séparé de l'OAuth Gmail (mails).
  window.location.href = `/api/integrations/google-stats/start?${qp.toString()}`;
}, [normalizeSiteUrl, siteInrcyOwnership, siteInrcyUrl]);

const connectSiteInrcyGsc = useCallback(() => {
  if (siteInrcyOwnership === "none") {
    setSiteInrcySettingsError("Connexion Search Console indisponible : aucun site iNrCy.");
    return;
  }
  const siteUrl = (siteInrcyUrl || "").trim();
  if (!siteUrl) {
    setSiteInrcySettingsError("Renseigne le lien du site iNrCy avant de connecter Search Console.");
    return;
  }
  const qp = new URLSearchParams({
    source: "site_inrcy",
    product: "gsc",
    siteUrl,
  });
  window.location.href = `/api/integrations/google-stats/start?${qp.toString()}`;
}, [normalizeSiteUrl, siteInrcyOwnership, siteInrcyUrl]);

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
      })
    );
  }, []);

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

  const syncInstagramStateFromServer = useCallback(async (options?: { preserveSelection?: boolean }) => {
    try {
      const res = await fetch("/api/integrations/instagram/status", {
        cache: "no-store",
        credentials: "include",
      });
      if (!res.ok) return null;
      const json = await res.json().catch(() => null) as {
        accountConnected?: boolean;
        connected?: boolean;
        expired?: boolean;
        resource_id?: string | null;
        username?: string | null;
        profile_url?: string | null;
      } | null;
      if (!json) return null;

      const nextAccountConnected = !!json.accountConnected;
      const nextConnected = !!json.connected;
      const nextUsername = typeof json.username === "string" ? json.username : "";
      const nextProfileUrl = typeof json.profile_url === "string" ? json.profile_url : "";
      const nextResourceId = typeof json.resource_id === "string" ? json.resource_id : null;

      setInstagramAccountConnected(nextAccountConnected);
      setInstagramConnected(nextConnected);
      setInstagramUsername(nextUsername);
      setInstagramUrl(nextProfileUrl);
      if (!nextAccountConnected) setIgAccounts([]);
      if (!nextConnected && !options?.preserveSelection) setIgSelectedPageId("");

      patchChannelConnectionLocally("instagram", {
        connected: nextConnected,
        accountConnected: nextAccountConnected,
        configured: nextConnected,
        expired: !!json.expired,
        resourceId: nextConnected ? nextResourceId : null,
        resourceLabel: nextConnected ? (nextUsername || null) : null,
        resourceUrl: nextConnected ? (nextProfileUrl || null) : null,
      }, { clearData: !nextConnected });

      return json;
    } catch {
      return null;
    }
  }, [patchChannelConnectionLocally]);

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

  const syncFromServerCacheIfNeeded = useCallback(async (force = false) => {
    if (typeof window === "undefined") return;
    const now = Date.now();
    const snapshotDate = expectedUiSnapshotDate();
    if (!force) {
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

        const generatorChannelsToRefresh = staleGeneratorChannels.length
          ? staleGeneratorChannels
          : (generatorSyncedAt > localGeneratorSyncedAt ? DASHBOARD_CHANNEL_KEYS : []);

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
  }, [readCachedGeneratorChannelSyncAt, refreshChannelBlocksFromApi, refreshGeneratorChannelsFromApi, warmInrStatsUi]);

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
  }, [clearScheduledGeneratorRefreshes, fallbackToServerSyncThenGlobal, loadSiteInrcy, notifyStatsRefresh, refreshChannelBlocksFromApi, refreshGeneratorChannelFromApi]);

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
  }, [clearScheduledGeneratorRefreshes, fallbackToServerSyncThenGlobal, loadSiteInrcy, notifyStatsRefresh, refreshChannelBlocksFromApi, refreshGeneratorChannelsFromApi, triggerChannelRefresh]);

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

  const handleSharedGeneratorRefresh = useCallback(async () => {
    if (kpisLoading) return;
    setKpisLoading(true);

    try {
      const bootstrap = await runDailyStatsRefreshBootstrap();
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
        void syncFromServerCacheIfNeeded(true);
      }
    };

    window.addEventListener(PROFILE_VERSION_EVENT, handleProfileVersionChange as EventListener);
    return () => {
      window.removeEventListener(PROFILE_VERSION_EVENT, handleProfileVersionChange as EventListener);
    };
  }, [refreshNotifications, refreshUiBalance, syncFromServerCacheIfNeeded]);

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
          void triggerChannelsRefresh(impactedChannels);
          return;
        }

        void fallbackToServerSyncThenGlobal();
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
  }, [clearScheduledGeneratorRefreshes, fallbackToServerSyncThenGlobal, triggerChannelsRefresh]);

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

const activateSiteInrcyTracking = useCallback(async () => {
  if (!isManagedInrcySite(siteInrcyOwnership)) {
    setSiteInrcySettingsError("Activation indisponible : cette action est réservée au mode rented.");
    return;
  }
  const siteUrl = (siteInrcyUrl || "").trim();
  if (!siteUrl) {
    setSiteInrcySettingsError("Renseigne le lien du site iNrCy avant d'activer le suivi.");
    return;
  }

  setSiteInrcySettingsError(null);
  setSiteInrcyTrackingBusy(true);

  const res = await fetch("/api/integrations/google-stats/activate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: "site_inrcy", siteUrl }),
  }).catch(() => null);

  if (!res) {
    setSiteInrcyTrackingBusy(false);
    setSiteInrcySettingsError("Connexion au serveur impossible pour le moment. Merci de réessayer.");
    return;
  }

  const data = await res.json().catch(() => ({} as any));

  // En mode rented, l'activation doit être 100% silencieuse côté client.
  // Si le token admin iNrCy n'est pas configuré, on affiche une erreur explicite.
  if (!res.ok) {
    setSiteInrcyTrackingBusy(false);
    setSiteInrcySettingsError(getSimpleFrenchErrorMessage((data as any)?.error || String(res.status)));
    return;
  }

  setSiteInrcyTrackingBusy(false);

  // Rafraîchit les statuts
  setSiteInrcyGa4Connected(true);
  setSiteInrcyGscConnected(true);
  setSiteInrcyGa4Notice("✅ Suivi activé (GA4)");
  setSiteInrcyGscNotice("✅ Suivi activé (Search Console)");
  window.setTimeout(() => {
    setSiteInrcyGa4Notice(null);
    setSiteInrcyGscNotice(null);
  }, 2500);

  // Aligne immédiatement le bloc canal, puis confirme via le refresh ciblé.
  patchChannelConnectionLocally("site_inrcy", {
    connected: true,
    accountConnected: true,
    configured: true,
    statsConnected: true,
    resourceId: siteUrl,
    resourceLabel: siteUrl,
    resourceUrl: siteUrl,
  });
  triggerChannelRefresh("site_inrcy");
}, [patchChannelConnectionLocally, siteInrcyOwnership, siteInrcyUrl, triggerChannelRefresh]);

// ✅ Mode rented : désactive le suivi (GA4+GSC) et nettoie les settings.
const deactivateSiteInrcyTracking = useCallback(async () => {
  if (!isManagedInrcySite(siteInrcyOwnership)) {
    setSiteInrcySettingsError("Désactivation indisponible : cette action est réservée au mode rented.");
    return;
  }

  setSiteInrcySettingsError(null);
  setSiteInrcyTrackingBusy(true);

  const res = await fetch("/api/integrations/google-stats/deactivate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: "site_inrcy" }),
  }).catch(() => null);

  if (!res) {
    setSiteInrcyTrackingBusy(false);
    setSiteInrcySettingsError("Connexion au serveur impossible pour le moment. Merci de réessayer.");
    return;
  }

  const data = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    setSiteInrcyTrackingBusy(false);
    setSiteInrcySettingsError(getSimpleFrenchErrorMessage((data as any)?.error || String(res.status)));
    return;
  }

  setSiteInrcyGa4Connected(false);
  setSiteInrcyGscConnected(false);
  setSiteInrcyGa4Notice("Suivi désactivé (GA4). ");
  setSiteInrcyGscNotice("Suivi désactivé (Search Console). ");
  window.setTimeout(() => {
    setSiteInrcyGa4Notice(null);
    setSiteInrcyGscNotice(null);
  }, 2500);

  setSiteInrcyTrackingBusy(false);

  // Coupe immédiatement le bloc stats du canal, puis confirme via le refresh ciblé.
  patchChannelConnectionLocally("site_inrcy", {
    connected: Boolean(siteInrcySavedUrl.trim()),
    accountConnected: Boolean(siteInrcySavedUrl.trim()),
    configured: Boolean(siteInrcySavedUrl.trim()),
    statsConnected: false,
    resourceId: siteInrcySavedUrl || null,
    resourceLabel: siteInrcySavedUrl || null,
    resourceUrl: siteInrcySavedUrl || null,
  }, { clearData: true });
  triggerChannelRefresh("site_inrcy");
}, [patchChannelConnectionLocally, siteInrcyOwnership, siteInrcySavedUrl, triggerChannelRefresh]);


const disconnectGoogleStats = useCallback(
  async (source: "site_inrcy" | "site_web", product: "ga4" | "gsc") => {
    const res = await fetch("/api/integrations/google-stats/disconnect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source, product }),
    }).catch(() => null);

    if (!res || !res.ok) {
      const msg = !res
        ? "Connexion au serveur impossible pour le moment. Merci de réessayer."
        : getSimpleFrenchErrorMessage(String(res.status));
      if (source === "site_inrcy") setSiteInrcySettingsError(getSimpleFrenchErrorMessage(msg));
      else setSiteWebSettingsError(getSimpleFrenchErrorMessage(msg));
      return;
    }

    if (source === "site_inrcy") {
      let nextSettings: any = {};
      try {
        const parsed = siteInrcySettingsText?.trim() ? JSON.parse(siteInrcySettingsText) : {};
        nextSettings = removeGoogleProductFromSettings(parsed, product);
      } catch {
        nextSettings = removeGoogleProductFromSettings({}, product);
      }
      await updateSiteInrcySettings(nextSettings);
      setSiteInrcySettingsError(null);
      if (product === "ga4") {
        setGa4MeasurementId("");
        setGa4PropertyId("");
        setSiteInrcyGa4Connected(false);
        setSiteInrcyGa4Notice("Google Analytics déconnecté.");
      } else {
        setGscProperty("");
        setSiteInrcyGscConnected(false);
        setSiteInrcyGscNotice("Search Console déconnecté.");
      }

      patchChannelConnectionLocally("site_inrcy", {
        connected: Boolean(siteInrcySavedUrl.trim()),
        accountConnected: Boolean(siteInrcySavedUrl.trim()),
        configured: Boolean(siteInrcySavedUrl.trim()),
        statsConnected: product === "ga4" ? Boolean(siteInrcyGscConnected) : Boolean(siteInrcyGa4Connected),
        resourceId: siteInrcySavedUrl || null,
        resourceLabel: siteInrcySavedUrl || null,
        resourceUrl: siteInrcySavedUrl || null,
      });
    } else {
      let nextSettings: any = {};
      try {
        const parsed = siteWebSettingsText?.trim() ? JSON.parse(siteWebSettingsText) : {};
        nextSettings = removeGoogleProductFromSettings(parsed, product);
      } catch {
        nextSettings = removeGoogleProductFromSettings({}, product);
      }
      await updateSiteWebSettings(nextSettings);
      setSiteWebSettingsError(null);
      if (product === "ga4") {
        setSiteWebGa4MeasurementId("");
        setSiteWebGa4PropertyId("");
        setSiteWebGa4Connected(false);
        setSiteWebGa4Notice("Google Analytics déconnecté.");
      } else {
        setSiteWebGscProperty("");
        setSiteWebGscConnected(false);
        setSiteWebGscNotice("Search Console déconnecté.");
      }

      patchChannelConnectionLocally("site_web", {
        connected: Boolean(siteWebSavedUrl.trim()),
        accountConnected: Boolean(siteWebSavedUrl.trim()),
        configured: Boolean(siteWebSavedUrl.trim()),
        statsConnected: product === "ga4" ? Boolean(siteWebGscConnected) : Boolean(siteWebGa4Connected),
        resourceId: siteWebSavedUrl || null,
        resourceLabel: siteWebSavedUrl || null,
        resourceUrl: siteWebSavedUrl || null,
      });
    }

    void triggerChannelRefresh(source);
  },
  [
    patchChannelConnectionLocally,
    removeGoogleProductFromSettings,
    siteInrcyGa4Connected,
    siteInrcyGscConnected,
    siteInrcySavedUrl,
    siteInrcySettingsText,
    siteWebGa4Connected,
    siteWebGscConnected,
    siteWebSavedUrl,
    siteWebSettingsText,
    triggerChannelRefresh,
  ]
);

const disconnectSiteInrcyGa4 = useCallback(() => {
  // En mode "rented" : la config iNrCy est grisée (OK), mais on garde le message explicite ici.
  if (siteInrcyOwnership === "none") {
    setSiteInrcySettingsError("Déconnexion Google Analytics indisponible : aucun site iNrCy.");
    return;
  }
  void disconnectGoogleStats("site_inrcy", "ga4");
}, [disconnectGoogleStats, siteInrcyOwnership]);

const disconnectSiteInrcyGsc = useCallback(() => {
  if (siteInrcyOwnership === "none") {
    setSiteInrcySettingsError("Déconnexion Search Console indisponible : aucun site iNrCy.");
    return;
  }
  void disconnectGoogleStats("site_inrcy", "gsc");
}, [disconnectGoogleStats, siteInrcyOwnership]);


// ✅ Réinitialisation globale (lien + GA4 + GSC)
const resetGoogleStats = useCallback(async (source: GoogleSource) => {
  await Promise.all([
    fetch("/api/integrations/google-stats/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, product: "ga4" }),
    }).catch(() => null),
    fetch("/api/integrations/google-stats/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, product: "gsc" }),
    }).catch(() => null),
  ]);
}, []);


// =========================
// ✅ Site web (indépendant)
// - données stockées dans pro_tools_configs.settings.site_web
// =========================
const updateSiteWebSettings = useCallback(
  async (nextSiteWeb: any) => {
    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user) return;

    // Récupère les settings actuels pour ne pas écraser les autres clés
    const { data: row, error: readErr } = await supabase
      .from("pro_tools_configs")
      .select("settings")
      .eq("user_id", user.id)
      .maybeSingle();

    if (readErr) {
      setSiteWebSettingsError(getSimpleFrenchErrorMessage(readErr));
      return;
    }

    const current = (row as any)?.settings ?? {};
    const merged = { ...(current ?? {}), site_web: nextSiteWeb ?? {} };

    const { error } = await supabase.from("pro_tools_configs").upsert({ user_id: user.id, settings: merged }, { onConflict: "user_id" });
    if (error) {
      setSiteWebSettingsError(getSimpleFrenchErrorMessage(error));
      return;
    }

    setSiteWebSettingsError(null);
    try {
      setSiteWebSettingsText(JSON.stringify(nextSiteWeb ?? {}, null, 2));
    } catch {
      setSiteWebSettingsText("{}");
    }
  },
  []
);

const disconnectAllGoogleStatsForSource = useCallback(
  async (source: GoogleSource) => {
    await resetGoogleStats(source);

    if (source === "site_inrcy") {
      let nextSettings: any = {};
      try {
        const parsed = siteInrcySettingsText?.trim() ? JSON.parse(siteInrcySettingsText) : {};
        nextSettings = removeGoogleProductFromSettings(removeGoogleProductFromSettings(parsed, "ga4"), "gsc");
      } catch {
        nextSettings = {};
      }
      await updateSiteInrcySettings(nextSettings);
      setGa4MeasurementId("");
      setGa4PropertyId("");
      setGscProperty("");
      setSiteInrcyGa4Connected(false);
      setSiteInrcyGscConnected(false);
      setSiteInrcyGa4Notice("Google Analytics déconnecté automatiquement.");
      setSiteInrcyGscNotice("Search Console déconnecté automatiquement.");
      setSiteInrcySettingsError(null);
      window.setTimeout(() => {
        setSiteInrcyGa4Notice(null);
        setSiteInrcyGscNotice(null);
      }, 2500);
      return;
    }

    let nextSettings: any = {};
    try {
      const parsed = siteWebSettingsText?.trim() ? JSON.parse(siteWebSettingsText) : {};
      nextSettings = removeGoogleProductFromSettings(removeGoogleProductFromSettings(parsed, "ga4"), "gsc");
    } catch {
      nextSettings = {};
    }
    await updateSiteWebSettings(nextSettings);
    setSiteWebGa4MeasurementId("");
    setSiteWebGa4PropertyId("");
    setSiteWebGscProperty("");
    setSiteWebGa4Connected(false);
    setSiteWebGscConnected(false);
    setSiteWebGa4Notice("Google Analytics déconnecté automatiquement.");
    setSiteWebGscNotice("Search Console déconnecté automatiquement.");
    setSiteWebSettingsError(null);
    window.setTimeout(() => {
      setSiteWebGa4Notice(null);
      setSiteWebGscNotice(null);
    }, 2500);
  },
  [
    removeGoogleProductFromSettings,
    resetGoogleStats,
    siteInrcySettingsText,
    siteWebSettingsText,
    updateSiteInrcySettings,
    updateSiteWebSettings,
  ]
);

const syncSitePresenceState = useCallback(async () => {
  try {
    await fetch('/api/integrations/site-presence/sync', { method: 'POST' });
  } catch {}
}, []);

// ✅ Enregistrer le lien du site iNrCy (inrcy_site_configs.site_url)
const saveSiteInrcyUrl = useCallback(async () => {
  if (siteInrcyOwnership === "none") return;
  if (siteInrcySavedUrl.trim()) return;

  const rawUrl = siteInrcyUrl.trim();
  const nextNormalized = rawUrl ? normalizeSiteUrl(rawUrl) : null;

  if (rawUrl && !nextNormalized) {
    setSiteInrcySettingsError("Renseigne un vrai lien de site (ex: https://monsite.fr) avant d'enregistrer.");
    return;
  }

  const valueToSave = nextNormalized?.normalizedUrl ?? "";

  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  if (!user) return;

  const { error } = await supabase
    .from("inrcy_site_configs")
    .upsert({ user_id: user.id, site_url: valueToSave }, { onConflict: "user_id" });
  if (error) {
    setSiteInrcySettingsError(getSimpleFrenchErrorMessage(error));
    return;
  }

  setSiteInrcySettingsError(null);
  setSiteInrcyUrl(valueToSave);
  setSiteInrcySavedUrl(valueToSave);
  setSiteInrcyUrlNotice(valueToSave ? "✅ Lien du site enregistré" : null);
  patchChannelConnectionLocally("site_inrcy", {
    connected: Boolean(valueToSave),
    accountConnected: Boolean(valueToSave),
    configured: Boolean(valueToSave),
    statsConnected: Boolean(siteInrcyGa4Connected || siteInrcyGscConnected),
    resourceId: valueToSave || null,
    resourceLabel: valueToSave || null,
    resourceUrl: valueToSave || null,
  }, { clearData: !valueToSave });
  triggerChannelRefresh("site_inrcy");
  await syncSitePresenceState();
  if (valueToSave) {
    window.setTimeout(() => setSiteInrcyUrlNotice(null), 2500);
  }
}, [normalizeSiteUrl, patchChannelConnectionLocally, siteInrcyGa4Connected, siteInrcyGscConnected, siteInrcyOwnership, siteInrcySavedUrl, siteInrcyUrl, triggerChannelRefresh, syncSitePresenceState]);


const deleteSiteInrcyUrl = useCallback(async () => {
  if (siteInrcyOwnership === "none") return;
  if (!siteInrcySavedUrl.trim()) return;

  const ok = window.confirm(
    "Supprimer ce lien va déconnecter automatiquement Google Analytics et Google Search Console pour la bulle Site iNrCy. Continuer ?"
  );
  if (!ok) return;

  await disconnectAllGoogleStatsForSource("site_inrcy");

  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  if (!user) return;

  const { error } = await supabase
    .from("inrcy_site_configs")
    .upsert({ user_id: user.id, site_url: "" }, { onConflict: "user_id" });
  if (error) {
    setSiteInrcySettingsError(getSimpleFrenchErrorMessage(error));
    return;
  }

  setSiteInrcySettingsError(null);
  setSiteInrcyUrl("");
  setSiteInrcySavedUrl("");
  setShowSiteInrcyWidgetCode(false);
  setSiteInrcyUrlNotice("✅ Lien du site supprimé. GA4 et Search Console ont été déconnectés.");
  patchChannelConnectionLocally("site_inrcy", {
    connected: false,
    accountConnected: false,
    configured: false,
    statsConnected: false,
    resourceId: null,
    resourceLabel: null,
    resourceUrl: null,
  }, { clearData: true });
  triggerChannelRefresh("site_inrcy");
  await syncSitePresenceState();
  window.setTimeout(() => setSiteInrcyUrlNotice(null), 2500);
}, [disconnectAllGoogleStatsForSource, patchChannelConnectionLocally, siteInrcyOwnership, siteInrcySavedUrl, triggerChannelRefresh, syncSitePresenceState]);

// ✅ Enregistrer uniquement le lien du site web (settings.site_web.url)
const saveSiteWebUrl = useCallback(async () => {
  if (siteWebSavedUrl.trim()) return;

  let parsed: any;
  try {
    parsed = siteWebSettingsText?.trim() ? JSON.parse(siteWebSettingsText) : {};
  } catch {
    setSiteWebSettingsError("JSON invalide. Vérifie la syntaxe (guillemets, virgules, accolades…).");
    return;
  }

  const rawUrl = siteWebUrl.trim();
  const nextNormalized = rawUrl ? normalizeSiteUrl(rawUrl) : null;

  if (rawUrl && !nextNormalized) {
    setSiteWebSettingsError("Renseigne un vrai lien de site (ex: https://monsite.fr) avant d'enregistrer.");
    return;
  }

  const valueToSave = nextNormalized?.normalizedUrl ?? "";
  parsed.url = valueToSave;
  if (nextNormalized?.hostname) parsed.domain = nextNormalized.hostname;
  else delete parsed.domain;

  await updateSiteWebSettings(parsed);
  setSiteWebUrl(valueToSave);
  setSiteWebSavedUrl(valueToSave);
  patchChannelConnectionLocally("site_web", {
    connected: Boolean(valueToSave),
    accountConnected: Boolean(valueToSave),
    configured: Boolean(valueToSave),
    statsConnected: Boolean(siteWebGa4Connected || siteWebGscConnected),
    resourceId: valueToSave || null,
    resourceLabel: valueToSave || null,
    resourceUrl: valueToSave || null,
  }, { clearData: !valueToSave });
  triggerChannelRefresh("site_web");
  await syncSitePresenceState();
  setSiteWebUrlNotice(valueToSave ? "✅ Lien du site enregistré" : null);
  if (valueToSave) {
    window.setTimeout(() => setSiteWebUrlNotice(null), 2500);
  }
}, [normalizeSiteUrl, patchChannelConnectionLocally, siteWebGa4Connected, siteWebGscConnected, siteWebSavedUrl, siteWebSettingsText, siteWebUrl, triggerChannelRefresh, updateSiteWebSettings, syncSitePresenceState]);

const deleteSiteWebUrl = useCallback(async () => {
  if (!siteWebSavedUrl.trim()) return;

  const ok = window.confirm(
    "Supprimer ce lien va déconnecter automatiquement Google Analytics et Google Search Console pour la bulle Site web. Continuer ?"
  );
  if (!ok) return;

  await disconnectAllGoogleStatsForSource("site_web");

  let parsed: any;
  try {
    parsed = siteWebSettingsText?.trim() ? JSON.parse(siteWebSettingsText) : {};
  } catch {
    parsed = {};
  }
  parsed = parsed && typeof parsed === "object" ? { ...parsed } : {};
  delete parsed.url;
  delete parsed.domain;
  delete parsed.ga4;
  delete parsed.gsc;

  await updateSiteWebSettings(parsed);
  setSiteWebUrl("");
  setSiteWebSavedUrl("");
  setShowSiteWebWidgetCode(false);
  patchChannelConnectionLocally("site_web", {
    connected: false,
    accountConnected: false,
    configured: false,
    statsConnected: false,
    resourceId: null,
    resourceLabel: null,
    resourceUrl: null,
  }, { clearData: true });
  triggerChannelRefresh("site_web");
  await syncSitePresenceState();
  setSiteWebUrlNotice("✅ Lien du site supprimé. GA4 et Search Console ont été déconnectés.");
  window.setTimeout(() => setSiteWebUrlNotice(null), 2500);
}, [disconnectAllGoogleStatsForSource, patchChannelConnectionLocally, siteWebSavedUrl, siteWebSettingsText, triggerChannelRefresh, updateSiteWebSettings, syncSitePresenceState]);

const resetSiteInrcyAll = useCallback(async () => {
  if (!confirm("Réinitialiser la configuration (lien + GA4 + Search Console) ?")) return;
  if (siteInrcyOwnership === "none") return;

  await resetGoogleStats("site_inrcy");
  await updateSiteInrcySettings({});

  // Clear url in DB
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  if (user) {
    await supabase.from("inrcy_site_configs").upsert({ user_id: user.id, site_url: "" }, { onConflict: "user_id" });
  }

  setSiteInrcyUrl("");
  setSiteInrcySavedUrl("");
  setSiteInrcySettingsText("{}");
  setGa4MeasurementId("");
  setGa4PropertyId("");
  setGscProperty("");
  setSiteInrcyGa4Connected(false);
  setSiteInrcyGscConnected(false);
  patchChannelConnectionLocally("site_inrcy", {
    connected: false,
    accountConnected: false,
    configured: false,
    statsConnected: false,
    resourceId: null,
    resourceLabel: null,
    resourceUrl: null,
  }, { clearData: true });
  triggerChannelRefresh("site_inrcy");
}, [patchChannelConnectionLocally, resetGoogleStats, siteInrcyOwnership, triggerChannelRefresh, updateSiteInrcySettings]);

const resetSiteWebAll = useCallback(async () => {
  if (!confirm("Réinitialiser la configuration (lien + GA4 + Search Console) ?")) return;

  await resetGoogleStats("site_web");

  // Clear settings.site_web
  await updateSiteWebSettings({});

  setSiteWebUrl("");
  setSiteWebSavedUrl("");
  setSiteWebSettingsText("{}");
  setSiteWebGa4MeasurementId("");
  setSiteWebGa4PropertyId("");
  setSiteWebGscProperty("");
  setSiteWebGa4Connected(false);
  setSiteWebGscConnected(false);
  patchChannelConnectionLocally("site_web", {
    connected: false,
    accountConnected: false,
    configured: false,
    statsConnected: false,
    resourceId: null,
    resourceLabel: null,
    resourceUrl: null,
  }, { clearData: true });
  triggerChannelRefresh("site_web");
}, [patchChannelConnectionLocally, resetGoogleStats, updateSiteWebSettings, triggerChannelRefresh]);

// ✅ Houzz / Pages Jaunes (liens uniquement, stockés dans inrcy_site_configs.settings)
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


// Google Business page URL is automatic (derived from the selected establishment).
// No manual edit + no save button.

const connectGmbAccount = useCallback(async () => {
  // Start OAuth
  const returnTo = encodeURIComponent("/dashboard?panel=gmb");
  window.location.href = `/api/integrations/google-business/start?returnTo=${returnTo}`;
}, []);

const disconnectGmbAccount = useCallback(async () => {
  // Disconnect Google account (removes OAuth tokens)
  await fetch("/api/integrations/google-business/disconnect-account", { method: "POST" });
  setGmbConnected(false);
  setGmbAccountConnected(false);
  setGmbConfigured(false);
  setGmbAccountEmail("");
  setGmbUrl("");
  setGmbAccounts([]);
  setGmbLocations([]);
  setGmbAccountName("");
  setGmbLocationName("");
  setGmbLocationLabel("");
  await updateRootSettingsKey("gmb", { url: "", connected: false, configured: false, accountEmail: "", accountName: "", locationName: "", locationTitle: "", resource_id: "" });
  patchChannelConnectionLocally("gmb", {
    connected: false,
    accountConnected: false,
    configured: false,
    expired: false,
    resourceId: null,
    resourceLabel: null,
    resourceUrl: null,
  }, { clearData: true });
  await triggerChannelRefresh("gmb");
  setPanelSuccess("gmb", "Compte Google déconnecté.");
}, [patchChannelConnectionLocally, setPanelSuccess, triggerChannelRefresh, updateRootSettingsKey]);

const disconnectGmbBusiness = useCallback(async () => {
  // Disconnect Google Business ONLY (keeps Google account connected)
  const res = await fetch("/api/integrations/google-business/disconnect-location", { method: "POST" });
  const js = await res.json().catch(() => ({}));
  if (!res.ok) {
    setPanelError("gmb", js?.error, "Impossible de déconnecter l'établissement Google Business.");
    return;
  }
  setGmbConnected(false);
  setGmbConfigured(false);
  setGmbUrl("");
  setGmbLocationName("");
  setGmbLocationLabel("");
  await updateRootSettingsKey("gmb", { url: "", resource_id: "", locationName: "", locationTitle: "", configured: false, connected: true });
  patchChannelConnectionLocally("gmb", {
    connected: false,
    accountConnected: true,
    configured: false,
    resourceId: null,
    resourceLabel: null,
    resourceUrl: null,
  }, { clearData: true });
  await triggerChannelRefresh("gmb");
  setPanelSuccess("gmb", "Établissement Google Business déconnecté.");
}, [patchChannelConnectionLocally, setPanelError, setPanelSuccess, triggerChannelRefresh, updateRootSettingsKey]);


  // Facebook pages (selection)
  const [fbPages, setFbPages] = useState<Array<{ id: string; name?: string; access_token?: string }>>([]);
  const [fbPagesLoading, setFbPagesLoading] = useState(false);
  const [fbSelectedPageId, setFbSelectedPageId] = useState<string>("");
  const [fbSelectedPageName, setFbSelectedPageName] = useState<string>("");
  const [fbPagesError, setFbPagesError] = useState<string | null>(null);
  const fbPagesAutoLoadRef = useRef(false);
const gmbLocationsAutoLoadRef = useRef(false);

// Instagram accounts (selection via Facebook pages that have an IG Business account)
const [igAccounts, setIgAccounts] = useState<Array<{ page_id: string; page_name?: string; ig_id: string; username?: string; page_access_token?: string }>>([]);
const [igAccountsLoading, setIgAccountsLoading] = useState(false);
const [igSelectedPageId, setIgSelectedPageId] = useState<string>("");
const [igAccountsError, setIgAccountsError] = useState<string | null>(null);
const igAccountsAutoLoadRef = useRef(false);



  // Google Business locations (selection)
  const [gmbAccounts, setGmbAccounts] = useState<Array<{ name: string; accountName?: string; type?: string }>>([]);
  const [gmbLocations, setGmbLocations] = useState<Array<{ name: string; title?: string }>>([]);
  const [gmbAccountName, setGmbAccountName] = useState<string>("");
  const [gmbLocationName, setGmbLocationName] = useState<string>("");
  const [gmbLocationLabel, setGmbLocationLabel] = useState<string>("");
  const [gmbLoadingList, setGmbLoadingList] = useState(false);
  const [gmbListError, setGmbListError] = useState<string | null>(null);
const connectFacebookAccount = useCallback(async () => {
  const returnTo = encodeURIComponent("/dashboard?panel=facebook");
  window.location.href = `/api/integrations/facebook/start?returnTo=${returnTo}&mode=standard`;
}, []);

const connectFacebookBusinessAccount = useCallback(async () => {
  const returnTo = encodeURIComponent("/dashboard?panel=facebook");
  window.location.href = `/api/integrations/facebook/start?returnTo=${returnTo}&mode=business`;
}, []);

const disconnectFacebookAccount = useCallback(async () => {
	  await fetch("/api/integrations/facebook/disconnect-account", { method: "POST" });
	  setFacebookAccountConnected(false);
	  setFacebookPageConnected(false);
	  patchChannelConnectionLocally("facebook", {
	    connected: false,
	    accountConnected: false,
	    configured: false,
	    expired: false,
	    resourceId: null,
	    resourceLabel: null,
	    resourceUrl: null,
	  }, { clearData: true });
	  setFacebookAccountEmail("");
	  // Keep a lightweight mirror in pro_tools_configs for instant UI updates.
	  await updateRootSettingsKey("facebook", {
	    accountConnected: false,
	    pageConnected: false,
	    userEmail: "",
	    url: "",
	    pageId: "",
	    pageName: "",
	  });
	  await triggerChannelRefresh("facebook");
	  setFacebookUrl("");
	  setFbPages([]);
	  setFbSelectedPageId("");
	  setFbSelectedPageName("");
	  setPanelSuccess("facebook", "Compte Facebook déconnecté.");
}, [patchChannelConnectionLocally, updateRootSettingsKey, triggerChannelRefresh, setPanelSuccess]);

const disconnectFacebookPage = useCallback(async () => {
	  await fetch("/api/integrations/facebook/disconnect-page", { method: "POST" });
	  setFacebookPageConnected(false);
	  patchChannelConnectionLocally("facebook", {
	    connected: false,
	    accountConnected: true,
	    configured: false,
	    expired: false,
	    resourceId: null,
	    resourceLabel: null,
	    resourceUrl: null,
	  }, { clearData: true });
	  await updateRootSettingsKey("facebook", {
	    accountConnected: true,
	    pageConnected: false,
	    url: "",
	    pageId: "",
	    pageName: "",
	  });
	  await triggerChannelRefresh("facebook");
	  setFacebookUrl("");
	  setFbSelectedPageId("");
	  setFbSelectedPageName("");
	  setPanelSuccess("facebook", "Page Facebook déconnectée.");
}, [patchChannelConnectionLocally, updateRootSettingsKey, triggerChannelRefresh, setPanelSuccess]);
const loadFacebookPages = useCallback(async () => {
	  if (!facebookAccountConnected) return;
  setFbPagesLoading(true);
  setFbPagesError(null);
  try {
    const r = await fetch("/api/integrations/facebook/pages", { cache: "no-store" });
    if (!r.ok) throw new Error(await getSimpleFrenchApiError(r, "Impossible de charger vos pages Facebook."));
    const j = await r.json().catch(() => ({}));
    const pages = Array.isArray(j.pages) ? j.pages : [];
    setFbPages(pages);

    const matchedSelected = pages.find((p: { id: string; name?: string | null }) => p.id === fbSelectedPageId);
    if (matchedSelected?.name) setFbSelectedPageName(String(matchedSelected.name));

    // Preselect first if none
    if (!fbSelectedPageId && pages?.[0]?.id) {
      setFbSelectedPageId(pages[0].id);
      if (pages[0]?.name) setFbSelectedPageName(String(pages[0].name));
    }

    // If there is exactly one page, auto-select & save it server-side (no extra "Enregistrer").
    if (pages.length === 1) {
      const only = pages[0];
      if (only?.id) {
        const autoRes = await fetch("/api/integrations/facebook/select-page", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pageId: only.id,
            pageName: only.name || null,
          }),
        });
        const autoJson = await autoRes.json().catch(() => ({}));
        if (!autoRes.ok) throw new Error(autoJson?.error || "Impossible d’enregistrer la page Facebook.");
        const nextFacebookUrl = String(autoJson?.pageUrl || `https://www.facebook.com/${only.id}`);
        setFbSelectedPageId(only.id);
        setFbSelectedPageName(String(only.name || ""));
        setFacebookPageConnected(true);
        setFacebookUrl(nextFacebookUrl);
        patchChannelConnectionLocally("facebook", {
          connected: true,
          accountConnected: true,
          configured: true,
          resourceId: only.id,
          resourceLabel: only.name || null,
          resourceUrl: nextFacebookUrl,
        });
        await updateRootSettingsKey("facebook", {
          accountConnected: true,
          pageConnected: true,
          userEmail: facebookAccountEmail,
          url: nextFacebookUrl,
          pageId: only.id,
          pageName: String(only.name || ""),
        });
        await triggerChannelRefresh("facebook");
        setPanelSuccess("facebook", "Page Facebook enregistrée.");
      }
    }
  } catch (e: any) {
    setFbPagesError(getSimpleFrenchErrorMessage(e, "Impossible de charger vos pages Facebook."));
  } finally {
    setFbPagesLoading(false);
  }
	}, [facebookAccountConnected, fbSelectedPageId, facebookAccountEmail, patchChannelConnectionLocally, setPanelSuccess, triggerChannelRefresh, updateRootSettingsKey]);

useEffect(() => {
  const linked = searchParams.get("linked");
  const ok = searchParams.get("ok");
  const shouldAutoLoad = panel === "facebook" && linked === "facebook" && ok === "1";

  if (!shouldAutoLoad) {
    fbPagesAutoLoadRef.current = false;
    return;
  }

  if (!facebookAccountConnected || facebookPageConnected || fbPagesLoading || fbPagesAutoLoadRef.current) return;

  fbPagesAutoLoadRef.current = true;
  void loadFacebookPages();
}, [
  panel,
  searchParams,
  facebookAccountConnected,
  facebookPageConnected,
  fbPagesLoading,
  loadFacebookPages,
]);

const saveFacebookPage = useCallback(async () => {
  const picked = fbPages.find((p) => p.id === fbSelectedPageId);
  if (!picked?.id) return;

  const r = await fetch("/api/integrations/facebook/select-page", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pageId: picked.id,
      pageName: picked.name || null,
    }),
  });

  const j = await r.json().catch(() => ({}));
  if (r.ok) {
    const nextFacebookUrl = String(j?.pageUrl || `https://www.facebook.com/${picked.id}`);
    setFacebookUrl(nextFacebookUrl);
	    setFacebookPageConnected(true);
	    setFbSelectedPageName(picked.name || "");
    patchChannelConnectionLocally("facebook", {
      connected: true,
      accountConnected: true,
      configured: true,
      resourceId: picked.id,
      resourceLabel: picked.name || null,
      resourceUrl: nextFacebookUrl,
    });
    await updateRootSettingsKey("facebook", {
      accountConnected: true,
      pageConnected: true,
      userEmail: facebookAccountEmail,
      url: nextFacebookUrl,
      pageId: picked.id,
      pageName: String(picked.name || ""),
    });
    await triggerChannelRefresh("facebook");
    setPanelSuccess("facebook", "Page Facebook enregistrée.");
  } else {
    setPanelError("facebook", j?.error, "Impossible d'enregistrer la page Facebook.");
  }

}, [fbPages, fbSelectedPageId, facebookAccountEmail, patchChannelConnectionLocally, triggerChannelRefresh, updateRootSettingsKey, setPanelSuccess, setPanelError]);

// ===== Instagram (Meta) =====
const connectInstagramAccount = useCallback(async () => {
  const returnTo = encodeURIComponent("/dashboard?panel=instagram");
  window.location.href = `/api/integrations/instagram/start?returnTo=${returnTo}&mode=standard`;
}, []);

const connectInstagramBusinessAccount = useCallback(async () => {
  const returnTo = encodeURIComponent("/dashboard?panel=instagram");
  window.location.href = `/api/integrations/instagram/start?returnTo=${returnTo}&mode=business`;
}, []);

const disconnectInstagramAccount = useCallback(async () => {
  await fetch("/api/integrations/instagram/disconnect-account", { method: "POST" });
  setInstagramAccountConnected(false);
  setInstagramConnected(false);
  setInstagramUsername("");
  setInstagramUrl("");
  setIgAccounts([]);
  setIgSelectedPageId("");
  patchChannelConnectionLocally("instagram", {
    connected: false,
    accountConnected: false,
    configured: false,
    expired: false,
    resourceId: null,
    resourceLabel: null,
    resourceUrl: null,
  }, { clearData: true });
  await updateRootSettingsKey("instagram", {
    accountConnected: false,
    connected: false,
    username: "",
    url: "",
    pageId: "",
    igId: "",
  });
  await triggerChannelRefresh("instagram");
  await syncInstagramStateFromServer();
  setPanelSuccess("instagram", "Compte Instagram déconnecté.");
}, [patchChannelConnectionLocally, updateRootSettingsKey, triggerChannelRefresh, setPanelSuccess, syncInstagramStateFromServer]);

const disconnectInstagramProfile = useCallback(async () => {
  await fetch("/api/integrations/instagram/disconnect-profile", { method: "POST" });
  setInstagramConnected(false);
  setInstagramUsername("");
  setInstagramUrl("");
  setIgSelectedPageId("");
  patchChannelConnectionLocally("instagram", {
    connected: false,
    accountConnected: true,
    configured: false,
    resourceId: null,
    resourceLabel: null,
    resourceUrl: null,
  }, { clearData: true });
  await updateRootSettingsKey("instagram", {
    accountConnected: true,
    connected: false,
    username: "",
    url: "",
    pageId: "",
    igId: "",
  });
  await triggerChannelRefresh("instagram");
  await syncInstagramStateFromServer();
  setPanelSuccess("instagram", "Profil Instagram déconnecté.");
}, [patchChannelConnectionLocally, updateRootSettingsKey, triggerChannelRefresh, setPanelSuccess, syncInstagramStateFromServer]);

const loadInstagramAccounts = useCallback(async () => {
  if (!instagramAccountConnected) return;
  setIgAccountsLoading(true);
  setIgAccountsError(null);
  try {
    const r = await fetch("/api/integrations/instagram/accounts", { cache: "no-store" });
    if (!r.ok) throw new Error(await getSimpleFrenchApiError(r, "Impossible de charger vos comptes Instagram."));
    const j = await r.json().catch(() => ({}));
    setIgAccounts(j.accounts || []);
    if (!igSelectedPageId && (j.accounts?.[0]?.page_id)) setIgSelectedPageId(j.accounts[0].page_id);

    // Auto-connect if exactly 1 eligible account
    if ((j.accounts || []).length === 1) {
      const only = j.accounts[0];
      const autoRes = await fetch("/api/integrations/instagram/select-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: only.page_id }),
      });
      const autoJson = await autoRes.json().catch(() => ({}));
      if (!autoRes.ok) throw new Error(autoJson?.error || "Impossible d’enregistrer Instagram.");
      setInstagramConnected(true);
      const nextUsername = autoJson?.username ? String(autoJson.username) : String(only.username || "");
      if (nextUsername) setInstagramUsername(nextUsername);
      const nextInstagramUrl = autoJson?.profileUrl ? String(autoJson.profileUrl) : (only.username ? `https://www.instagram.com/${only.username}/` : "");
      setInstagramUrl(nextInstagramUrl);
      patchChannelConnectionLocally("instagram", {
        connected: true,
        accountConnected: true,
        configured: true,
        resourceId: only.ig_id || only.page_id,
        resourceLabel: nextUsername || null,
        resourceUrl: nextInstagramUrl || null,
      });
      await updateRootSettingsKey("instagram", {
        accountConnected: true,
        connected: true,
        username: nextUsername,
        url: nextInstagramUrl,
        pageId: String(only.page_id || ""),
        igId: String(only.ig_id || only.page_id || ""),
      });
      await triggerChannelRefresh("instagram");
      await syncInstagramStateFromServer({ preserveSelection: true });
      setPanelSuccess("instagram", "Compte Instagram enregistré.");
    }
  } catch (e: any) {
    setIgAccountsError(getSimpleFrenchErrorMessage(e, "Impossible de charger vos comptes Instagram."));
  } finally {
    setIgAccountsLoading(false);
  }
}, [instagramAccountConnected, igSelectedPageId, patchChannelConnectionLocally, setPanelSuccess, triggerChannelRefresh, updateRootSettingsKey, syncInstagramStateFromServer]);

useEffect(() => {
  const linked = searchParams.get("linked");
  const ok = searchParams.get("ok");
  const shouldAutoLoad = panel === "instagram" && linked === "instagram" && ok === "1";

  if (!shouldAutoLoad) {
    igAccountsAutoLoadRef.current = false;
    return;
  }

  if (!instagramAccountConnected || instagramConnected || igAccountsLoading || igAccountsAutoLoadRef.current) return;

  igAccountsAutoLoadRef.current = true;
  void loadInstagramAccounts();
}, [
  panel,
  searchParams,
  instagramAccountConnected,
  instagramConnected,
  igAccountsLoading,
  loadInstagramAccounts,
]);

const saveInstagramProfile = useCallback(async () => {
  const picked = igAccounts.find((a) => a.page_id === igSelectedPageId);
  if (!picked?.page_id) return;

  const r = await fetch("/api/integrations/instagram/select-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pageId: picked.page_id }),
  });
  const j = await r.json().catch(() => ({}));
  if (r.ok) {
    setInstagramConnected(true);
    const nextUsername = j?.username ? String(j.username) : String(picked.username || "");
    const nextProfileUrl = j?.profileUrl ? String(j.profileUrl) : (picked.username ? `https://www.instagram.com/${picked.username}/` : "");
    if (nextUsername) setInstagramUsername(nextUsername);
    if (nextProfileUrl) setInstagramUrl(nextProfileUrl);
    patchChannelConnectionLocally("instagram", {
      connected: true,
      accountConnected: true,
      configured: true,
      resourceId: picked.ig_id || picked.page_id,
      resourceLabel: nextUsername || null,
      resourceUrl: nextProfileUrl || null,
    });
    await updateRootSettingsKey("instagram", {
      accountConnected: true,
      connected: true,
      username: nextUsername,
      url: nextProfileUrl,
      pageId: String(picked.page_id || ""),
      igId: String(picked.ig_id || picked.page_id || ""),
    });
    await triggerChannelRefresh("instagram");
    await syncInstagramStateFromServer({ preserveSelection: true });
    setPanelSuccess("instagram", "Compte Instagram enregistré.");
  } else {
    setPanelError("instagram", j?.error, "Impossible d'enregistrer Instagram.");
  }
}, [igAccounts, igSelectedPageId, patchChannelConnectionLocally, triggerChannelRefresh, updateRootSettingsKey, setPanelSuccess, setPanelError, syncInstagramStateFromServer]);

// ===== LinkedIn =====
const connectLinkedinAccount = useCallback(async () => {
  const returnTo = encodeURIComponent("/dashboard?panel=linkedin");
  window.location.href = `/api/integrations/linkedin/start?returnTo=${returnTo}`;
}, []);

const disconnectLinkedinAccount = useCallback(async () => {
  await fetch("/api/integrations/linkedin/disconnect-account", { method: "POST" });
  setLinkedinAccountConnected(false);
  setLinkedinConnected(false);
  setLinkedinDisplayName("");
  setLinkedinUrl("");
  patchChannelConnectionLocally("linkedin", {
    connected: false,
    accountConnected: false,
    configured: false,
    expired: false,
    resourceId: null,
    resourceLabel: null,
    resourceUrl: null,
  }, { clearData: true });
  await updateRootSettingsKey("linkedin", {
    accountConnected: false,
    connected: false,
    displayName: "",
    url: "",
  });
  triggerChannelRefresh("linkedin");
  setPanelSuccess("linkedin", "Compte LinkedIn déconnecté.");
}, [patchChannelConnectionLocally, updateRootSettingsKey, triggerChannelRefresh, setPanelSuccess]);


const saveLinkedinProfileUrl = useCallback(async () => {
  const raw = (linkedinUrl ?? "").trim();

  // Autorise la valeur vide (pour effacer le lien)
  if (raw.length > 0) {
    const ok =
      raw.startsWith("https://www.linkedin.com/in/") ||
      raw.startsWith("https://linkedin.com/in/") ||
      raw.startsWith("https://www.linkedin.com/pub/") ||
      raw.startsWith("https://linkedin.com/pub/");
    if (!ok) {
      setPanelError("linkedin", "Lien LinkedIn invalide.", "Lien LinkedIn invalide. Exemple : https://www.linkedin.com/in/ton-profil", 3600);
      return;
    }
  }

  await updateRootSettingsKey("linkedin", {
    accountConnected: linkedinAccountConnected,
    connected: linkedinConnected,
    displayName: linkedinDisplayName,
    url: raw,
  });

  patchChannelConnectionLocally("linkedin", {
    connected: linkedinConnected,
    accountConnected: linkedinAccountConnected,
    configured: linkedinConnected,
    resourceLabel: linkedinDisplayName || null,
    resourceUrl: raw || null,
  }, { clearData: false });
  triggerChannelRefresh("linkedin");
  setPanelSuccess("linkedin", "Lien LinkedIn enregistré.", 1800);
}, [linkedinUrl, linkedinAccountConnected, linkedinConnected, linkedinDisplayName, patchChannelConnectionLocally, updateRootSettingsKey, triggerChannelRefresh]);


const loadGmbAccountsAndLocations = useCallback(async () => {
  // Only possible once the Google account is OAuth-connected
  if (!gmbAccountConnected) return;
  setGmbLoadingList(true);
  setGmbListError(null);
  try {
    const r = await fetch(`/api/integrations/google-business/locations`, { cache: "no-store" });
    if (!r.ok) throw new Error(await getSimpleFrenchApiError(r, "Impossible de charger les établissements Google Business."));
    const j = await r.json().catch(() => ({}));
    const accounts = Array.isArray(j.accounts) ? j.accounts : [];
    const locations = Array.isArray(j.locations) ? j.locations : [];
    setGmbAccounts(accounts);
    setGmbAccountName(j.accountName || "");
    setGmbLocations(locations);
    if (j.locationsError) setGmbListError(j.locationsError);

    const currentLocationName = (gmbLocationName || "").trim();
    const hasCurrentSelection = Boolean(currentLocationName && locations.some((l: { name: string; title?: string | null }) => l.name === currentLocationName));
    const nextLocationName = hasCurrentSelection ? currentLocationName : String(locations?.[0]?.name || "");
    if (nextLocationName) {
      setGmbLocationName(nextLocationName);
      const matched = locations.find((l: { name: string; title?: string | null }) => l.name === nextLocationName);
      if (matched?.title) setGmbLocationLabel(String(matched.title));
    }

    if (locations.length === 1 && j.accountName) {
      const only = locations[0];
      const autoRes = await fetch("/api/integrations/google-business/select-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountName: j.accountName,
          locationName: only.name,
          locationTitle: only.title || null,
        }),
      });
      const autoJson = await autoRes.json().catch(() => ({}));
      if (!autoRes.ok) throw new Error(autoJson?.error || "Impossible d’enregistrer l’établissement Google Business.");
      setGmbLocationName(String(only.name || ""));
      setGmbLocationLabel(String(only.title || ""));
      setGmbConfigured(true);
      setGmbConnected(true);
      if (autoJson?.url) setGmbUrl(String(autoJson.url));
      patchChannelConnectionLocally("gmb", {
        connected: true,
        accountConnected: true,
        configured: true,
        resourceId: only.name || null,
        resourceLabel: only.title || null,
        resourceUrl: autoJson?.url ? String(autoJson.url) : null,
      });
      await triggerChannelRefresh("gmb");
      setPanelSuccess("gmb", "Établissement Google Business enregistré.");
    }
  } catch (e: any) {
    setGmbListError(getSimpleFrenchErrorMessage(e, "Impossible de charger les établissements Google Business."));
  } finally {
    setGmbLoadingList(false);
  }
}, [gmbAccountConnected, gmbLocationName, patchChannelConnectionLocally, setPanelSuccess, triggerChannelRefresh]);


useEffect(() => {
  const linked = searchParams.get("linked");
  const ok = searchParams.get("ok");
  const shouldAutoLoad = panel === "gmb" && linked === "gmb" && ok === "1";

  if (!shouldAutoLoad) {
    gmbLocationsAutoLoadRef.current = false;
    return;
  }

  if (!gmbAccountConnected || gmbConfigured || gmbLoadingList || gmbLocationsAutoLoadRef.current) return;

  gmbLocationsAutoLoadRef.current = true;
  void loadGmbAccountsAndLocations();
}, [
  panel,
  searchParams,
  gmbAccountConnected,
  gmbConfigured,
  gmbLoadingList,
  loadGmbAccountsAndLocations,
]);

const saveGmbLocation = useCallback(async () => {
  if (!gmbAccountName || !gmbLocationName) return;
  try {
    const picked = gmbLocations.find((l) => l.name === gmbLocationName);
    const res = await fetch("/api/integrations/google-business/select-location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountName: gmbAccountName,
        locationName: gmbLocationName,
        locationTitle: picked?.title || null,
      }),
    });
    const js = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(js?.error || "Impossible d’enregistrer l’établissement");

    setGmbConfigured(true);
    setGmbConnected(true);
    setGmbLocationLabel(String(picked?.title || ""));
    if (js?.url) setGmbUrl(String(js.url));
    patchChannelConnectionLocally("gmb", {
      connected: true,
      accountConnected: true,
      configured: true,
      resourceId: gmbLocationName || null,
      resourceLabel: picked?.title || null,
      resourceUrl: js?.url ? String(js.url) : null,
    });
    triggerChannelRefresh("gmb");
    setPanelSuccess("gmb", "Établissement Google Business enregistré.", 1800);
  } catch (error) {
    setPanelError("gmb", error, "Impossible d'enregistrer l'établissement Google Business.");
  }
}, [gmbAccountName, gmbLocationName, gmbLocations, patchChannelConnectionLocally, triggerChannelRefresh, setPanelError, setPanelSuccess]);


const saveSiteWebSettings = useCallback(async () => {
  let parsed: any;
  try {
    parsed = siteWebSettingsText?.trim() ? JSON.parse(siteWebSettingsText) : {};
  } catch {
    setSiteWebSettingsError("JSON invalide. Vérifie la syntaxe (guillemets, virgules, accolades…).");
    return;
  }

  // Sync url input -> JSON (source de vérité: settings.site_web.url)
  parsed.url = siteWebUrl.trim();

  await updateSiteWebSettings(parsed);
  triggerChannelRefresh("site_web");
  setSiteWebGa4Notice("✅ Enregistrement GA4 validé");
  window.setTimeout(() => setSiteWebGa4Notice(null), 2500);

}, [siteWebSettingsText, siteWebUrl, updateSiteWebSettings, triggerChannelRefresh]);

const attachWebsiteGoogleAnalytics = useCallback(async () => {
  const measurement = siteWebGa4MeasurementId.trim();
  const propertyIdRaw = siteWebGa4PropertyId.trim();
  if (!measurement) {
    setSiteWebSettingsError("Renseigne un ID de mesure GA4 (ex: G-XXXXXXXXXX).");
    return;
  }

  if (!propertyIdRaw || !/^\d+$/.test(propertyIdRaw)) {
    setSiteWebSettingsError("Renseigne un Property ID GA4 (numérique, ex: 123456789).");
    return;
  }

  let parsed: any;
  try {
    parsed = siteWebSettingsText?.trim() ? JSON.parse(siteWebSettingsText) : {};
  } catch {
    setSiteWebSettingsError("JSON invalide. Corrige la configuration avant de rattacher Google Analytics.");
    return;
  }

  parsed.url = siteWebUrl.trim();
  parsed.ga4 = { ...(parsed.ga4 ?? {}), measurement_id: measurement, property_id: propertyIdRaw };

  await updateSiteWebSettings(parsed);
  await triggerChannelRefresh("site_web");
  setSiteWebGa4Notice("✅ Enregistrement GA4 validé");
  window.setTimeout(() => setSiteWebGa4Notice(null), 2500);

}, [siteWebGa4MeasurementId, siteWebGa4PropertyId, siteWebSettingsText, siteWebUrl, triggerChannelRefresh, updateSiteWebSettings]);

const attachWebsiteGoogleSearchConsole = useCallback(async () => {
  const property = siteWebGscProperty.trim();
  if (!property) {
    setSiteWebSettingsError("Renseigne une propriété Search Console (ex: sc-domain:monsite.fr ou https://monsite.fr/).");
    return;
  }

  let parsed: any;
  try {
    parsed = siteWebSettingsText?.trim() ? JSON.parse(siteWebSettingsText) : {};
  } catch {
    setSiteWebSettingsError("JSON invalide. Corrige la configuration avant de rattacher Search Console.");
    return;
  }

  parsed.url = siteWebUrl.trim();
  parsed.gsc = { ...(parsed.gsc ?? {}), property };

  await updateSiteWebSettings(parsed);
  triggerChannelRefresh("site_web");
}, [siteWebGscProperty, siteWebSettingsText, siteWebUrl, updateSiteWebSettings, triggerChannelRefresh]);




const connectSiteWebGa4 = useCallback(() => {
  const siteUrl = siteWebUrl.trim();
  if (!siteUrl) {
    setSiteWebSettingsError("Renseigne le lien du site avant de connecter Google Analytics.");
    return;
  }
  // Connexion GA4 seule : la résolution se fait uniquement pour GA4.
  const qp = new URLSearchParams({
    source: "site_web",
    product: "ga4",
    siteUrl,
  });
  window.location.href = `/api/integrations/google-stats/start?${qp.toString()}`;
}, [siteWebUrl]);

const connectSiteWebGsc = useCallback(() => {
  const siteUrl = siteWebUrl.trim();
  if (!siteUrl) {
    setSiteWebSettingsError("Renseigne le lien du site avant de connecter Search Console.");
    return;
  }
  // Connexion GSC seule : la résolution se fait uniquement pour GSC.
  const qp = new URLSearchParams({
    source: "site_web",
    product: "gsc",
    siteUrl,
  });
  window.location.href = `/api/integrations/google-stats/start?${qp.toString()}`;
}, [siteWebUrl]);


const disconnectSiteWebGa4 = useCallback(() => {
  // Doit fonctionner quel que soit l'état du site iNrCy (rented/sold/none)
  void disconnectGoogleStats("site_web", "ga4");
}, [disconnectGoogleStats]);

const disconnectSiteWebGsc = useCallback(() => {
  void disconnectGoogleStats("site_web", "gsc");
}, [disconnectGoogleStats]);

  // ✅ AJOUT : profil incomplet -> mini pastille + tooltip
  const REQUIRED_PROFILE_FIELDS = [
    "first_name",
    "last_name",
    "phone",
    "contact_email",
    "company_legal_name",
    "hq_address",
    "hq_zip",
    "hq_city",
    "hq_country",
    "siren",
    "rcs_city",
  ] as const;

  const checkProfile = useCallback(async () => {
    const supabase = createClient();

    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "first_name,last_name,phone,contact_email,company_legal_name,hq_address,hq_zip,hq_city,hq_country,siren,rcs_city"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) {
      setProfileIncomplete(true);
      return;
    }

    const incomplete = REQUIRED_PROFILE_FIELDS.some((field) => {
      const v = (profile as any)[field];
      return !v || String(v).trim() === "";
    });

    setProfileIncomplete(incomplete);
  }, []);


const REQUIRED_ACTIVITY_FIELDS = [
  "services",
  "intervention_zones",
  "opening_days",
  "opening_hours",
  "strengths",
] as const;

const checkActivity = useCallback(async () => {
  const supabase = createClient();

  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  if (!user) return;

  const { data: business } = await supabase
    .from("business_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!business) {
    setActivityIncomplete(true);
    return;
  }

  const decodedSector = decodeBusinessSector((business as any)?.sector ?? "");
  const hasSectorCategory = !!decodedSector.sectorCategory;
  const hasProfession = decodedSector.profession.trim().length > 0;

  const incomplete = !hasSectorCategory || !hasProfession || REQUIRED_ACTIVITY_FIELDS.some((field) => {
    const v = (business as any)[field];
    if (Array.isArray(v)) return v.filter(Boolean).length === 0;
    return !v || String(v).trim() === "";
  });

  setActivityIncomplete(incomplete);
}, []);

  useEffect(() => {
    checkProfile();
    checkActivity();
  }, [checkProfile, checkActivity]);



// ✅ Onboarding non-bloquant : on affiche des alertes (badges / dots) mais
// on n'ouvre jamais un panneau automatiquement.
// (Sinon impossible de fermer un modal si le profil est incomplet.)

  useEffect(() => {
    const isTouch =
      typeof window !== "undefined" &&
      ("ontouchstart" in window || navigator.maxTouchPoints > 0);

    document.documentElement.classList.toggle("isTouch", isTouch);
  }, []);

  // Ferme le menu utilisateur (clic dehors / Escape)
  useEffect(() => {
    if (!userMenuOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUserMenuOpen(false);
    };

    const closeIfOutside = (target: EventTarget | null) => {
      if (!userMenuRef.current) return;
      if (!target) return;
      if (!userMenuRef.current.contains(target as Node)) setUserMenuOpen(false);
    };

    const onPointerDownMouse = (e: MouseEvent) => closeIfOutside(e.target);
    const onPointerDownTouch = (e: TouchEvent) => closeIfOutside(e.target);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDownMouse);
    window.addEventListener("touchstart", onPointerDownTouch, { passive: true });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDownMouse);
      window.removeEventListener("touchstart", onPointerDownTouch);
    };
  }, [userMenuOpen]);

  useEffect(() => {
    if (!notificationMenuOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNotificationMenuOpen(false);
    };

    const closeIfOutside = (target: EventTarget | null) => {
      if (!target) return;
      const node = target as Node;
      const inDesktop = !!desktopNotificationMenuRef.current?.contains(node);
      const inMobile = !!mobileNotificationMenuRef.current?.contains(node);
      if (!inDesktop && !inMobile) setNotificationMenuOpen(false);
    };

    const onPointerDownMouse = (e: MouseEvent) => closeIfOutside(e.target);
    const onPointerDownTouch = (e: TouchEvent) => closeIfOutside(e.target);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDownMouse);
    window.addEventListener("touchstart", onPointerDownTouch, { passive: true });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDownMouse);
      window.removeEventListener("touchstart", onPointerDownTouch);
    };
  }, [notificationMenuOpen]);

  const userFirstLetter = (userEmail?.trim()?.[0] ?? "U").toUpperCase();

  // ✅ Menu hamburger (mobile)
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const closeIfOutside = (target: EventTarget | null) => {
      if (!menuRef.current) return;
      if (!target) return;
      if (!menuRef.current.contains(target as Node)) setMenuOpen(false);
    };

    const onPointerDownMouse = (e: MouseEvent) => closeIfOutside(e.target);
    const onPointerDownTouch = (e: TouchEvent) => closeIfOutside(e.target);

    if (menuOpen) {
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("mousedown", onPointerDownMouse);
      window.addEventListener("touchstart", onPointerDownTouch, { passive: true });
    }
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDownMouse);
      window.removeEventListener("touchstart", onPointerDownTouch);
    };
  }, [menuOpen]);

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

        applyBootstrapRefresh(bootstrap);

        if (!bootstrap.ran && !hasFreshGenerator) {
          await syncFromServerCacheIfNeeded(true);
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
  }, [applyBootstrapRefresh, syncFromServerCacheIfNeeded]);

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
    if (!dailyBootReady) return;
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
    void syncFromServerCacheIfNeeded(false);

    const handleFocus = () => {
      void syncFromServerCacheIfNeeded(false);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void syncFromServerCacheIfNeeded(false);
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [dailyBootReady, syncFromServerCacheIfNeeded]);

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

  const fluxBubbleItems = useMemo<DashboardFluxBubbleData[]>(() => fluxModules.map((m) => {
    const channelKey = m.key as DashboardChannelKey;
    const channelBlock = channelBlocks?.[channelKey] ?? null;
    const blockDrivenStatus = getBubbleStatusFromBlock(channelKey, channelBlock as InrstatsChannelBlock);
    const blockDrivenViewHref = getBubbleViewHrefFromBlock(channelKey, channelBlock);

    const viewActionRaw = m.actions.find((a) => a.variant === "view");
    const viewAction =
      (m.key === "site_inrcy" && viewActionRaw)
        ? {
            ...viewActionRaw,
            href: normalizeExternalHref(blockDrivenViewHref || siteInrcySavedUrl) || "#",
          }
        : (m.key === "site_web" && viewActionRaw)
          ? {
              ...viewActionRaw,
              href: normalizeExternalHref(blockDrivenViewHref || siteWebSavedUrl) || "#",
            }
          : (m.key === "instagram" && viewActionRaw)
            ? {
                ...viewActionRaw,
                href: normalizeExternalHref(blockDrivenViewHref || instagramUrl) || "#",
              }
            : (m.key === "linkedin" && viewActionRaw)
              ? {
                  ...viewActionRaw,
                  href: normalizeExternalHref(blockDrivenViewHref || linkedinUrl) || "#",
                }
              : viewActionRaw;

    const { status: bubbleStatus, text: bubbleStatusText } = (m.key === "site_inrcy")
      ? getSiteBubbleProgress("site_inrcy")
      : (m.key === "site_web")
        ? getSiteBubbleProgress("site_web")
        : blockDrivenStatus ?? (() => {

      if (m.key === "instagram") {
        if (instagramConnected) return { status: "connected" as ModuleStatus, text: "Connecté" };
        return { status: "available" as ModuleStatus, text: "A connecter" };
      }

      if (m.key === "linkedin") {
        if (linkedinConnected) return { status: "connected" as ModuleStatus, text: "Connecté" };
        return { status: "available" as ModuleStatus, text: "A connecter" };
      }

      if (m.key === "gmb") {
        if (gmbConnected) return { status: "connected" as ModuleStatus, text: "Connecté" };
        return { status: "available" as ModuleStatus, text: "A connecter" };
      }

      if (m.key === "facebook") {
        if (facebookPageConnected) return { status: "connected" as ModuleStatus, text: "Connecté" };
        return { status: "available" as ModuleStatus, text: "A connecter" };
      }

      return { status: m.status, text: statusLabel(m.status) };
    })();

    const specialViewHref = m.key === "site_inrcy"
      ? (blockDrivenViewHref || normalizeExternalHref(siteInrcySavedUrl) || "#")
      : m.key === "site_web"
        ? (blockDrivenViewHref || normalizeExternalHref(siteWebSavedUrl) || "#")
        : m.key === "instagram"
          ? (blockDrivenViewHref || normalizeExternalHref(instagramUrl) || "#")
          : m.key === "linkedin"
            ? (blockDrivenViewHref || normalizeExternalHref(linkedinUrl) || "#")
            : m.key === "gmb"
              ? (blockDrivenViewHref || normalizeExternalHref(gmbUrl) || "#")
              : m.key === "facebook"
                ? (blockDrivenViewHref || normalizeExternalHref(facebookUrl) || "#")
                : undefined;

    const specialViewLabel = m.key === "site_inrcy"
      ? "Voir le site"
      : m.key === "site_web"
        ? "Voir le site"
        : m.key === "gmb"
          ? "Voir la page"
          : ["instagram", "linkedin", "facebook"].includes(m.key)
            ? "Voir le compte"
            : undefined;

    const canViewSpecial = m.key === "site_inrcy"
      ? Boolean(blockDrivenViewHref || canViewSite)
      : m.key === "site_web"
        ? Boolean(blockDrivenViewHref || savedSiteWebUrlMeta)
        : m.key === "instagram"
          ? Boolean(blockDrivenViewHref || instagramUrl)
          : m.key === "linkedin"
            ? Boolean(blockDrivenViewHref || linkedinUrl)
            : m.key === "gmb"
              ? Boolean(blockDrivenViewHref || gmbUrl)
              : m.key === "facebook"
                ? Boolean(blockDrivenViewHref || facebookUrl)
                : undefined;

    const onConfigure = () => {
      if (m.key === "site_inrcy") {
        if (!canConfigureSite) return;
        openPanel("site_inrcy");
        return;
      }
      if (m.key === "site_web") {
        openPanel("site_web");
        return;
      }
      if (m.key === "instagram") {
        openPanel("instagram");
        return;
      }
      if (m.key === "linkedin") {
        openPanel("linkedin");
        return;
      }
      if (m.key === "gmb") {
        openPanel("gmb");
        return;
      }
      if (m.key === "facebook") {
        openPanel("facebook");
        return;
      }
    };

    return {
      key: m.key,
      name: m.name,
      description: m.description,
      accent: m.accent,
      logoSrc: MODULE_ICONS[m.key]?.src,
      logoAlt: MODULE_ICONS[m.key]?.alt,
      bubbleStatus,
      bubbleStatusText,
      helpKind: m.key === "site_inrcy" ? "site_inrcy" : m.key === "site_web" ? "site_web" : undefined,
      onHelpSiteInrcy: () => setHelpSiteInrcyOpen(true),
      onHelpSiteWeb: () => setHelpSiteWebOpen(true),
      specialViewHref,
      specialViewLabel,
      canViewSpecial,
      viewAction: specialViewHref ? undefined : viewAction,
      onConfigure,
      configureDisabled: m.key === "site_inrcy" ? !canConfigureSite : false,
      configureTitle: m.key === "site_inrcy" && !canConfigureSite
        ? "Disponible uniquement si vous avez un site iNrCy"
        : undefined,
    };
  }), [
    canConfigureSite,
    canViewSite,
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
    siteInrcySavedUrl,
    siteWebSavedUrl,
    channelBlocks,
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


  const siteWebPanelProps = {
    siteWebAllGreen,
    hasSiteWebUrl,
    siteWebUrl,
    setSiteWebUrl,
    saveSiteWebUrl: saveSiteWebUrlFromDrawer,
    deleteSiteWebUrl: deleteSiteWebUrlFromDrawer,
    siteWebUrlBusy: isDrawerMutationPending("site_web:url:save") || isDrawerMutationPending("site_web:url:delete"),
    draftSiteWebUrlMeta,
    siteWebUrlNotice,
    siteWebGa4Connected,
    siteWebGa4MeasurementId,
    siteWebGa4PropertyId,
    disconnectSiteWebGa4: disconnectSiteWebGa4FromDrawer,
    siteWebGa4Busy: isDrawerMutationPending("site_web:ga4:disconnect"),
    connectSiteWebGa4,
    canConnectSiteWebGoogle,
    siteWebGa4Notice,
    siteWebGscConnected,
    siteWebGscProperty,
    disconnectSiteWebGsc: disconnectSiteWebGscFromDrawer,
    siteWebGscBusy: isDrawerMutationPending("site_web:gsc:disconnect"),
    connectSiteWebGsc,
    siteWebGscNotice,
    siteWebActusLayout,
    setSiteWebActusLayout,
    siteWebActusLimit,
    setSiteWebActusLimit,
    siteWebActusFont,
    setSiteWebActusFont,
    siteWebActusTheme,
    setSiteWebActusTheme,
    siteWebSavedUrl,
    widgetTokenSiteWeb,
    showSiteWebWidgetCode,
    setShowSiteWebWidgetCode,
    siteWebSettingsError,
    resetSiteWebAll,
  };

  const gmbPanelProps = {
    gmbConnected,
    gmbAccountConnected,
    gmbAccountEmail,
    connectGmbAccount,
    disconnectGmbAccount: disconnectGmbAccountFromDrawer,
    gmbAccountBusy: isDrawerMutationPending("gmb:account:disconnect"),
    gmbConfigured,
    gmbAccountName,
    gmbAccounts,
    gmbLoadingList,
    loadGmbAccountsAndLocations,
    gmbLocationName,
    gmbLocationLabel,
    setGmbLocationName,
    gmbLocations,
    saveGmbLocation: saveGmbLocationFromDrawer,
    gmbLocationBusy: isDrawerMutationPending("gmb:location:save") || isDrawerMutationPending("gmb:location:disconnect"),
    gmbLocationAction: isDrawerMutationPending("gmb:location:disconnect")
      ? "disconnect"
      : isDrawerMutationPending("gmb:location:save")
        ? "connect"
        : null,
    gmbListError,
    gmbUrl,
    gmbUrlNotice,
    gmbUrlError,
    disconnectGmbBusiness: disconnectGmbBusinessFromDrawer,
  };

  const linkedinPanelProps = {
    linkedinConnected,
    linkedinAccountConnected,
    linkedinDisplayName,
    connectLinkedinAccount,
    disconnectLinkedinAccount: disconnectLinkedinAccountFromDrawer,
    linkedinAccountBusy: isDrawerMutationPending("linkedin:account:disconnect"),
    linkedinUrl,
    setLinkedinUrl,
    saveLinkedinProfileUrl: saveLinkedinProfileUrlFromDrawer,
    linkedinUrlBusy: isDrawerMutationPending("linkedin:url:save"),
    linkedinUrlNotice,
    linkedinUrlError,
    setLinkedinUrlNotice,
  };

  const siteInrcyPanelProps = {
    siteInrcyOwnership,
    siteInrcyAllGreen,
    siteInrcyContactEmail,
    hasSiteInrcyUrl,
    siteInrcyUrl,
    setSiteInrcyUrl,
    saveSiteInrcyUrl: saveSiteInrcyUrlFromDrawer,
    deleteSiteInrcyUrl: deleteSiteInrcyUrlFromDrawer,
    siteInrcyUrlBusy: isDrawerMutationPending("site_inrcy:url:save") || isDrawerMutationPending("site_inrcy:url:delete"),
    draftSiteInrcyUrlMeta,
    siteInrcyUrlNotice,
    siteInrcyGa4Connected,
    ga4MeasurementId,
    ga4PropertyId,
    disconnectSiteInrcyGa4: disconnectSiteInrcyGa4FromDrawer,
    siteInrcyGa4Busy: isDrawerMutationPending("site_inrcy:ga4:disconnect"),
    connectSiteInrcyGa4,
    canConnectSiteInrcyGoogle,
    canConfigureSite,
    siteInrcyGa4Notice,
    siteInrcyGscConnected,
    gscProperty,
    disconnectSiteInrcyGsc: disconnectSiteInrcyGscFromDrawer,
    siteInrcyGscBusy: isDrawerMutationPending("site_inrcy:gsc:disconnect"),
    connectSiteInrcyGsc,
    siteInrcyGscNotice,
    siteInrcyActusLayout,
    setSiteInrcyActusLayout,
    siteInrcyActusLimit,
    setSiteInrcyActusLimit,
    siteInrcyActusFont,
    setSiteInrcyActusFont,
    siteInrcyActusTheme,
    setSiteInrcyActusTheme,
    siteInrcySavedUrl,
    widgetTokenInrcySite,
    showSiteInrcyWidgetCode,
    setShowSiteInrcyWidgetCode,
    siteInrcySettingsError,
    resetSiteInrcyAll,
  };

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
          instagramPanelProps={{
            instagramConnected,
            instagramAccountConnected,
            instagramUsername,
            connectInstagramAccount,
            connectInstagramBusinessAccount,
            disconnectInstagramAccount: disconnectInstagramAccountFromDrawer,
            instagramAccountBusy: isDrawerMutationPending("instagram:account:disconnect"),
            igAccountsLoading,
            loadInstagramAccounts,
            igSelectedPageId,
            setIgSelectedPageId,
            igAccounts,
            saveInstagramProfile: saveInstagramProfileFromDrawer,
            instagramProfileBusy:
              isDrawerMutationPending("instagram:profile:save") ||
              isDrawerMutationPending("instagram:profile:disconnect"),
            instagramProfileAction: isDrawerMutationPending("instagram:profile:disconnect")
              ? "disconnect"
              : isDrawerMutationPending("instagram:profile:save")
                ? "connect"
                : null,
            igAccountsError,
            instagramUrl,
            instagramUrlNotice,
            instagramUrlError,
            disconnectInstagramProfile: disconnectInstagramProfileFromDrawer,
          }}
          linkedinPanelProps={linkedinPanelProps}
          gmbPanelProps={gmbPanelProps}
          facebookPanelProps={{
            facebookPageConnected,
            facebookAccountConnected,
            facebookAccountEmail,
            connectFacebookAccount,
            connectFacebookBusinessAccount,
            disconnectFacebookAccount: disconnectFacebookAccountFromDrawer,
            facebookAccountBusy: isDrawerMutationPending("facebook:account:disconnect"),
            fbPagesLoading,
            loadFacebookPages,
            fbSelectedPageId,
            fbSelectedPageName,
            setFbSelectedPageId,
            fbPages,
            saveFacebookPage: saveFacebookPageFromDrawer,
            facebookPageBusy:
              isDrawerMutationPending("facebook:page:save") ||
              isDrawerMutationPending("facebook:page:disconnect"),
            facebookPageAction: isDrawerMutationPending("facebook:page:disconnect")
              ? "disconnect"
              : isDrawerMutationPending("facebook:page:save")
                ? "connect"
                : null,
            fbPagesError,
            facebookUrl,
            facebookUrlNotice,
            facebookUrlError,
            disconnectFacebookPage: disconnectFacebookPageFromDrawer,
          }}
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

