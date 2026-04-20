"use client";

import styles from "./dashboard.module.css";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo, type TouchEvent as ReactTouchEvent } from "react";
import { getSimpleFrenchApiError, getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import Link from "next/link";
import SettingsDrawer from "./SettingsDrawer";
import HelpButton from "./_components/HelpButton";
import HelpModal from "./_components/HelpModal";
import ConnectionPill from "./_components/ConnectionPill";
import SiteInrcyPanel from "./_components/SiteInrcyPanel";
import SiteWebPanel from "./_components/SiteWebPanel";
import InstagramPanel from "./_components/InstagramPanel";
import LinkedinPanel from "./_components/LinkedinPanel";
import GoogleBusinessPanel from "./_components/GoogleBusinessPanel";
import FacebookPanel from "./_components/FacebookPanel";
import NotificationMenu from "./_components/NotificationMenu";
import UserMenu from "./_components/UserMenu";
import ProfilContent from "./settings/_components/ProfilContent";
import AccountContent from "./settings/_components/AccountContent";
import ActivityContent from "./settings/_components/ActivityContent";
import AbonnementContent from "./settings/_components/AbonnementContent";
import ContactContent from "./settings/_components/ContactContent";
import MailsSettingsContent from "./settings/_components/MailsSettingsContent";
import LegalContent from "./settings/_components/LegalContent";
import RgpdContent from "./settings/_components/RgpdContent";
import InertiaContent from "./settings/_components/InertiaContent";
import BoutiqueContent from "./settings/_components/BoutiqueContent";
import NotificationsSettingsContent from "./settings/_components/NotificationsSettingsContent";


// ✅ IMPORTANT : même client que ta page login
import { createClient } from "@/lib/supabaseClient";
import { purgeAllBrowserAccountCaches, readAccountCacheValue, setActiveBrowserUserId, writeAccountCacheValue } from "@/lib/browserAccountCache";
import { markDailyStatsRefreshBootstrapChecked, markServerCacheSyncChecked, runDailyStatsRefreshBootstrap, wasDailyStatsRefreshBootstrapCheckedRecently, wasServerCacheSyncCheckedRecently } from "@/lib/dailyStatsRefreshClient";
import { hasActiveInrcySite, isManagedInrcySite } from "@/lib/inrcySite";
import { decodeBusinessSector } from "@/lib/activitySectors";
import { computeInertiaSnapshot } from "@/lib/loyalty/inertia";
import { getDefaultSnapshotDate } from "@/lib/stats/snapshotWindow";
import { PROFILE_VERSION_EVENT, type ProfileVersionChangeDetail } from "@/lib/profileVersioning";
import { fluxModules, GOOGLE_SOURCES, MODULE_ICONS } from "./dashboard.constants";
import { getDrawerTitle, isDrawerPanel, statusLabel } from "./dashboard.utils";
import type { ActusFont, ActusTheme, GoogleProduct, GoogleSource, Module, ModuleAction, ModuleStatus, NotificationItem, Ownership } from "./dashboard.types";


const useBrowserLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;


type StatsWarmPeriod = 7 | 14 | 30 | 60;

function statsCubeSessionKey(period: StatsWarmPeriod) {
  return `inrcy_stats_cube_snapshot_v1:${period}`;
}

function statsSummarySessionKey(period: StatsWarmPeriod) {
  return `inrcy_stats_summary_snapshot_v2:${period}`;
}

function readUiCacheValue(key: string): string | null {
  return readAccountCacheValue(key);
}

function writeUiCacheValue(key: string, value: string) {
  writeAccountCacheValue(key, value);
}

function getLastChannelSyncAt() {
  const raw = readUiCacheValue("inrcy_stats_last_channel_sync_v1");
  const n = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(n) ? n : 0;
}

function expectedUiSnapshotDate() {
  return getDefaultSnapshotDate();
}

function getOverviewSnapshotDate(overviews: unknown): string | null {
  if (!overviews || typeof overviews !== "object") return null;
  for (const overview of Object.values(overviews as Record<string, unknown>)) {
    const snapshotDate = typeof (overview as any)?.meta?.snapshotDate === "string"
      ? (overview as any).meta.snapshotDate
      : null;
    if (snapshotDate) return snapshotDate;
  }
  return null;
}

function readGeneratorCache(): { syncedAt: number; payload: any | null; snapshotDate: string | null } | null {
  try {
    const raw = readUiCacheValue("inrcy_generator_kpis_v1");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "payload" in parsed) {
      return {
        syncedAt: Number.isFinite(Number((parsed as any).syncedAt)) ? Number((parsed as any).syncedAt) : 0,
        payload: (parsed as any).payload ?? null,
        snapshotDate: typeof (parsed as any).snapshotDate === "string" ? (parsed as any).snapshotDate : (typeof (parsed as any)?.payload?.meta?.snapshotDate === "string" ? (parsed as any).payload.meta.snapshotDate : null),
      };
    }
    return { syncedAt: 0, payload: parsed, snapshotDate: typeof parsed?.meta?.snapshotDate === "string" ? parsed.meta.snapshotDate : null };
  } catch {
    return null;
  }
}

function readCachedOppTotal() {
  try {
    const raw = readUiCacheValue("inrcy_opp30_total_v1");
    const n = raw ? Number(raw) : Number.NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function getInitialGeneratorKpis() {
  const payload = readGeneratorCache()?.payload;
  return payload?.leads ? payload : null;
}

function getInitialOppTotal() {
  const payload = readGeneratorCache()?.payload;
  const oppMonth = Number(payload?.details?.opportunities?.month);
  if (Number.isFinite(oppMonth)) return oppMonth;
  return readCachedOppTotal();
}

function readSnapshotSyncAt(key: string): number {
  try {
    const raw = readUiCacheValue(key);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as any;
    const syncedAt = Number(parsed?.syncedAt);
    return Number.isFinite(syncedAt) ? syncedAt : 0;
  } catch {
    return 0;
  }
}

function readInrStatsPeriodSyncAt(period: StatsWarmPeriod): number {
  return Math.max(
    readSnapshotSyncAt(statsCubeSessionKey(period)),
    readSnapshotSyncAt(statsSummarySessionKey(period)),
  );
}

function hasFreshLocalGeneratorSnapshot() {
  const cached = readGeneratorCache();
  const lastChannelSyncAt = getLastChannelSyncAt();
  return Boolean(
    cached?.payload?.leads &&
    cached.syncedAt >= lastChannelSyncAt &&
    cached.snapshotDate === expectedUiSnapshotDate()
  );
}

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
    const qs = params.toString();
    // ✅ Quand on ferme, on remet le marqueur à zéro.
    // (Sinon un refresh pourrait relancer un panneau si une logique externe remet ?panel=...)
    try {
      sessionStorage.removeItem("inrcy_panel_explicit_open");
    } catch {}
    // ✅ En mobile, on garde la position de scroll (pas de jump en haut)
    try {
      sessionStorage.setItem("inrcy_dashboard_scrollY", String(window.scrollY ?? 0));
    } catch {}
    router.push(qs ? `/dashboard?${qs}` : "/dashboard", { scroll: false });
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
  }>(() => getInitialGeneratorKpis());
  const [oppTotal, setOppTotal] = useState<number | null>(() => getInitialOppTotal());

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
          site_inrcy: Boolean(siteInrcyOwnership !== "none" && siteInrcyGa4Connected && siteInrcyGscConnected),
          site_web: Boolean(siteWebUrl?.trim() && siteWebGa4Connected && siteWebGscConnected),
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
      siteInrcyOwnership,
      siteInrcyGa4Connected,
      siteInrcyGscConnected,
      siteWebUrl,
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

const canViewSite = canAccessSiteInrcy && !!draftSiteInrcyUrlMeta;
const canConfigureSite = canAccessSiteInrcy;

// ✅ UX : Google ne devient connectable qu'une fois un vrai lien enregistré
const hasSiteInrcyUrl = !!savedSiteInrcyUrlMeta;
const hasSiteWebUrl = !!savedSiteWebUrlMeta;
const canConnectSiteInrcyGoogle = canConfigureSite && hasSiteInrcyUrl;
const canConnectSiteWebGoogle = hasSiteWebUrl;

const siteInrcyAllGreen = hasActiveInrcySite(siteInrcyOwnership) && hasSiteInrcyUrl && siteInrcyGa4Connected && siteInrcyGscConnected;
const siteWebAllGreen = hasSiteWebUrl && siteWebGa4Connected && siteWebGscConnected;
const profileCompleted = !profileIncomplete;
const activityCompleted = !activityIncomplete;
const sitePowerConnected = siteInrcyAllGreen || siteWebAllGreen;

const generatorPowerSteps = [
  { key: "profile", label: "Compléter mon profil", shortLabel: "Profil", weight: 15, completed: profileCompleted },
  { key: "activity", label: "Compléter mon activité", shortLabel: "Activité", weight: 15, completed: activityCompleted },
  { key: "site", label: "Connecter le site internet", shortLabel: "Site internet", weight: 20, completed: sitePowerConnected },
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
  }, []);

  const notifyStatsRefresh = useCallback((at?: number) => {
    if (typeof window === "undefined") return;
    const syncAt = Number.isFinite(Number(at)) ? Number(at) : Date.now();
    try {
      writeUiCacheValue("inrcy_stats_last_channel_sync_v1", String(syncAt));
    } catch {
      // ignore
    }
    window.dispatchEvent(new CustomEvent("inrcy:channels-updated", { detail: { at: syncAt } }));
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
        const snapshotDate = typeof json?.meta?.snapshotDate === "string" ? json.meta.snapshotDate : getOverviewSnapshotDate(overviews) || expectedSnapshotDate;

        if (!overviews || typeof overviews !== "object") return;

        try {
          writeUiCacheValue(
            statsCubeSessionKey(days),
            JSON.stringify({ syncedAt: Number.isFinite(Number(syncByPeriod[days])) ? Number(syncByPeriod[days]) : syncAt, snapshotDate, overviews })
          );
        } catch {
          // ignore
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
        const localGeneratorSyncedAt = readGeneratorCache()?.syncedAt || 0;

        const periodSyncs: Partial<Record<StatsWarmPeriod, number>> = {
          7: Number(json?.inrstats?.[7] ?? json?.inrstats?.["7"] ?? 0),
          30: Number(json?.inrstats?.[30] ?? json?.inrstats?.["30"] ?? 0),
        };
        const stalePeriods = ([7, 30] as StatsWarmPeriod[]).filter((days) => {
          const serverTs = Number(periodSyncs[days] ?? 0);
          return serverTs > readInrStatsPeriodSyncAt(days);
        });

        await Promise.allSettled([
          generatorSyncedAt > localGeneratorSyncedAt
            ? refreshKpis({ syncedAt: generatorSyncedAt, silent: true })
            : Promise.resolve(),
          stalePeriods.length
            ? warmInrStatsUi({ targetPeriods: stalePeriods, syncByPeriod: periodSyncs })
            : Promise.resolve(),
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
  }, [refreshKpis, warmInrStatsUi]);

  const triggerGeneratorRefresh = useCallback(async () => {
    const fallbackSync = async () => {
      const syncAt = Date.now();
      lastGeneratorRefreshAtRef.current = syncAt;
      await Promise.allSettled([
        loadSiteInrcy(),
        refreshKpis({ fresh: true, syncedAt: syncAt }),
        warmInrStatsUi({ syncedAt: syncAt, fresh: true }),
      ]);
      notifyStatsRefresh(syncAt);
    };

    clearScheduledGeneratorRefreshes();
    const startedAt = Date.now();
    lastGeneratorRefreshAtRef.current = startedAt;
    setKpisLoading(true);

    try {
      await loadSiteInrcy();

      const bootstrap = await runDailyStatsRefreshBootstrap({ force: true });
      const syncAt = Number.isFinite(Number(bootstrap?.syncAt)) ? Number(bootstrap.syncAt) : Date.now();
      const bootstrapSnapshotDate = typeof bootstrap?.snapshotDate === "string"
        ? bootstrap.snapshotDate
        : expectedUiSnapshotDate();
      markDailyStatsRefreshBootstrapChecked({ snapshotDate: bootstrapSnapshotDate, checkedAt: Date.now(), syncAt });

      if (!bootstrap?.generator) {
        await fallbackSync();
        return;
      }

      const generator = bootstrap.generator;
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

      for (const [periodKey, payload] of Object.entries(bootstrap.inrstats || {})) {
        const days = Number(periodKey) as StatsWarmPeriod;
        if (![7, 30].includes(days)) continue;
        const overviews = payload?.overviews;
        if (!overviews || typeof overviews !== "object") continue;
        const payloadSnapshotDate = typeof payload?.meta?.snapshotDate === "string"
          ? payload.meta.snapshotDate
          : getOverviewSnapshotDate(overviews) || bootstrapSnapshotDate || null;

        try {
          writeUiCacheValue(
            statsCubeSessionKey(days),
            JSON.stringify({ syncedAt: syncAt, snapshotDate: payloadSnapshotDate, overviews })
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
      }

      notifyStatsRefresh(syncAt);
    } catch (error) {
      console.error(error);
      await fallbackSync();
    } finally {
      setKpisLoading(false);
    }
  }, [clearScheduledGeneratorRefreshes, loadSiteInrcy, notifyStatsRefresh, refreshKpis, warmInrStatsUi]);


  const handleSharedGeneratorRefresh = useCallback(async () => {
    if (kpisLoading) return;
    await triggerGeneratorRefresh();
  }, [kpisLoading, triggerGeneratorRefresh]);



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

    const scheduleRefresh = () => {
      if (disposed) return;
      // Évite le "double refresh" juste après une action manuelle
      // (déconnexion/connexion => refresh immédiat déjà lancé côté client).
      if (Date.now() - lastGeneratorRefreshAtRef.current < 2500) return;
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => {
        if (disposed) return;
        void syncFromServerCacheIfNeeded(true);
      }, 500);
    };

    const ch = supabase
      .channel("inrcy-generator-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "integrations" },
        () => scheduleRefresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pro_tools_configs" },
        () => scheduleRefresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inrcy_site_configs" },
        () => scheduleRefresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => scheduleRefresh()
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
  }, [clearScheduledGeneratorRefreshes, syncFromServerCacheIfNeeded]);

  useEffect(() => {
    const linked = searchParams.get("linked");
    const activated = searchParams.get("activated");
    const ok = searchParams.get("ok");
    const shouldRefreshAfterChannelChange = (Boolean(linked) && ok === "1") || activated === "1";
    if (!shouldRefreshAfterChannelChange) return;
    void triggerGeneratorRefresh();
  }, [searchParams, triggerGeneratorRefresh]);


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
      return;
    }
    if (linked === "linkedin") {
      setPanelSuccess("linkedin", "Compte LinkedIn connecté.", 2600);
      return;
    }
    if (linked === "gmb") {
      setPanelSuccess("gmb", "Compte Google connecté. Choisissez maintenant votre établissement.", 3200);
    }
  }, [searchParams, setPanelSuccess]);

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

  // Rafraîchit le générateur sans recharger la page
  triggerGeneratorRefresh();
}, [siteInrcyOwnership, siteInrcyUrl, triggerGeneratorRefresh]);

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

  // Rafraîchit le générateur sans recharger la page
  triggerGeneratorRefresh();
}, [siteInrcyOwnership, triggerGeneratorRefresh]);


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
    }

    triggerGeneratorRefresh();
  },
  [
    removeGoogleProductFromSettings,
    siteInrcySettingsText,
    siteWebSettingsText,
    triggerGeneratorRefresh,
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
  triggerGeneratorRefresh();
  await syncSitePresenceState();
  if (valueToSave) {
    window.setTimeout(() => setSiteInrcyUrlNotice(null), 2500);
  }
}, [normalizeSiteUrl, siteInrcyOwnership, siteInrcySavedUrl, siteInrcyUrl, triggerGeneratorRefresh, syncSitePresenceState]);


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
  triggerGeneratorRefresh();
  await syncSitePresenceState();
  window.setTimeout(() => setSiteInrcyUrlNotice(null), 2500);
}, [disconnectAllGoogleStatsForSource, siteInrcyOwnership, siteInrcySavedUrl, triggerGeneratorRefresh, syncSitePresenceState]);

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
  triggerGeneratorRefresh();
  await syncSitePresenceState();
  setSiteWebUrlNotice(valueToSave ? "✅ Lien du site enregistré" : null);
  if (valueToSave) {
    window.setTimeout(() => setSiteWebUrlNotice(null), 2500);
  }
}, [normalizeSiteUrl, siteWebSavedUrl, siteWebSettingsText, siteWebUrl, triggerGeneratorRefresh, updateSiteWebSettings, syncSitePresenceState]);

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
  triggerGeneratorRefresh();
  await syncSitePresenceState();
  setSiteWebUrlNotice("✅ Lien du site supprimé. GA4 et Search Console ont été déconnectés.");
  window.setTimeout(() => setSiteWebUrlNotice(null), 2500);
}, [disconnectAllGoogleStatsForSource, siteWebSavedUrl, siteWebSettingsText, triggerGeneratorRefresh, updateSiteWebSettings, syncSitePresenceState]);

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
  triggerGeneratorRefresh();
}, [resetGoogleStats, siteInrcyOwnership, triggerGeneratorRefresh, updateSiteInrcySettings]);

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
  triggerGeneratorRefresh();
}, [resetGoogleStats, updateSiteWebSettings, triggerGeneratorRefresh]);

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
  triggerGeneratorRefresh();
  setGmbConfigured(false);
  setGmbAccountEmail("");
  setGmbUrl("");
  setGmbAccounts([]);
  setGmbLocations([]);
  setGmbAccountName("");
  setGmbLocationName("");
  setGmbLocationLabel("");
  await updateRootSettingsKey("gmb", { url: "", connected: false, configured: false, accountEmail: "", accountName: "", locationName: "", locationTitle: "", resource_id: "" });
  setPanelSuccess("gmb", "Compte Google déconnecté.");
}, [updateRootSettingsKey, triggerGeneratorRefresh, setPanelSuccess]);

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
  triggerGeneratorRefresh();
  await updateRootSettingsKey("gmb", { url: "", resource_id: "", locationName: "", locationTitle: "", configured: false, connected: true });
  setPanelSuccess("gmb", "Établissement Google Business déconnecté.");
}, [updateRootSettingsKey, triggerGeneratorRefresh, setPanelError, setPanelSuccess]);


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
	  triggerGeneratorRefresh();
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
	  setFacebookUrl("");
	  setFbPages([]);
	  setFbSelectedPageId("");
	  setFbSelectedPageName("");
	  setPanelSuccess("facebook", "Compte Facebook déconnecté.");
}, [updateRootSettingsKey, triggerGeneratorRefresh, setPanelSuccess]);

const disconnectFacebookPage = useCallback(async () => {
	  await fetch("/api/integrations/facebook/disconnect-page", { method: "POST" });
	  setFacebookPageConnected(false);
	  triggerGeneratorRefresh();
	  await updateRootSettingsKey("facebook", {
	    accountConnected: true,
	    pageConnected: false,
	    url: "",
	    pageId: "",
	    pageName: "",
	  });
	  setFacebookUrl("");
	  setFbSelectedPageId("");
	  setFbSelectedPageName("");
	  setPanelSuccess("facebook", "Page Facebook déconnectée.");
}, [updateRootSettingsKey, triggerGeneratorRefresh, setPanelSuccess]);
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
        await fetch("/api/integrations/facebook/select-page", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pageId: only.id,
            pageName: only.name || null,
          }),
        });
        setFbSelectedPageId(only.id);
        setFbSelectedPageName(String(only.name || ""));
        setFacebookPageConnected(true);
        setFacebookUrl(`https://www.facebook.com/${only.id}`);
      }
    }
  } catch (e: any) {
    setFbPagesError(getSimpleFrenchErrorMessage(e, "Impossible de charger vos pages Facebook."));
  } finally {
    setFbPagesLoading(false);
  }
	}, [facebookAccountConnected, fbSelectedPageId]);

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
    setFacebookUrl(String(j?.pageUrl || `https://www.facebook.com/${picked.id}`));
	    setFacebookPageConnected(true);
	    setFbSelectedPageName(picked.name || "");
    triggerGeneratorRefresh();
    setPanelSuccess("facebook", "Page Facebook enregistrée.");
  } else {
    setPanelError("facebook", j?.error, "Impossible d'enregistrer la page Facebook.");
  }

}, [fbPages, fbSelectedPageId, triggerGeneratorRefresh]);

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
  triggerGeneratorRefresh();
  setInstagramUsername("");
  setInstagramUrl("");
  setIgAccounts([]);
  setIgSelectedPageId("");
  await updateRootSettingsKey("instagram", {
    accountConnected: false,
    connected: false,
    username: "",
    url: "",
    pageId: "",
    igId: "",
  });
  setPanelSuccess("instagram", "Compte Instagram déconnecté.");
}, [updateRootSettingsKey, triggerGeneratorRefresh, setPanelSuccess]);

const disconnectInstagramProfile = useCallback(async () => {
  await fetch("/api/integrations/instagram/disconnect-profile", { method: "POST" });
  setInstagramConnected(false);
  triggerGeneratorRefresh();
  setInstagramUsername("");
  setInstagramUrl("");
  setIgSelectedPageId("");
  await updateRootSettingsKey("instagram", {
    accountConnected: true,
    connected: false,
    username: "",
    url: "",
    pageId: "",
    igId: "",
  });
  setPanelSuccess("instagram", "Profil Instagram déconnecté.");
}, [updateRootSettingsKey, triggerGeneratorRefresh, setPanelSuccess]);

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
      await fetch("/api/integrations/instagram/select-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: only.page_id }),
      });
      setInstagramConnected(true);
      setInstagramUsername(String(only.username || ""));
      setInstagramUrl(only.username ? `https://www.instagram.com/${only.username}/` : "");
      triggerGeneratorRefresh();
      setPanelSuccess("instagram", "Compte Instagram enregistré.");
    }
  } catch (e: any) {
    setIgAccountsError(getSimpleFrenchErrorMessage(e, "Impossible de charger vos comptes Instagram."));
  } finally {
    setIgAccountsLoading(false);
  }
}, [instagramAccountConnected, igSelectedPageId, triggerGeneratorRefresh]);

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
    if (j?.username) setInstagramUsername(String(j.username));
    if (j?.profileUrl) setInstagramUrl(String(j.profileUrl));
    triggerGeneratorRefresh();
    setPanelSuccess("instagram", "Compte Instagram enregistré.");
  } else {
    setPanelError("instagram", j?.error, "Impossible d'enregistrer Instagram.");
  }
}, [igAccounts, igSelectedPageId, triggerGeneratorRefresh]);

// ===== LinkedIn =====
const connectLinkedinAccount = useCallback(async () => {
  const returnTo = encodeURIComponent("/dashboard?panel=linkedin");
  window.location.href = `/api/integrations/linkedin/start?returnTo=${returnTo}`;
}, []);

const disconnectLinkedinAccount = useCallback(async () => {
  await fetch("/api/integrations/linkedin/disconnect-account", { method: "POST" });
  setLinkedinAccountConnected(false);
  setLinkedinConnected(false);
  triggerGeneratorRefresh();
  setLinkedinDisplayName("");
  setLinkedinUrl("");
  await updateRootSettingsKey("linkedin", {
    accountConnected: false,
    connected: false,
    displayName: "",
    url: "",
  });
  setPanelSuccess("linkedin", "Compte LinkedIn déconnecté.");
}, [updateRootSettingsKey, triggerGeneratorRefresh, setPanelSuccess]);


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

  triggerGeneratorRefresh();
  setPanelSuccess("linkedin", "Lien LinkedIn enregistré.", 1800);
}, [linkedinUrl, linkedinAccountConnected, linkedinConnected, linkedinDisplayName, updateRootSettingsKey, triggerGeneratorRefresh]);


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
      triggerGeneratorRefresh();
      setPanelSuccess("gmb", "Établissement Google Business enregistré.");
    }
  } catch (e: any) {
    setGmbListError(getSimpleFrenchErrorMessage(e, "Impossible de charger les établissements Google Business."));
  } finally {
    setGmbLoadingList(false);
  }
}, [gmbAccountConnected, gmbLocationName, triggerGeneratorRefresh, setPanelSuccess]);


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
    triggerGeneratorRefresh();
    setPanelSuccess("gmb", "Établissement Google Business enregistré.", 1800);
  } catch (error) {
    setPanelError("gmb", error, "Impossible d'enregistrer l'établissement Google Business.");
  }
}, [gmbAccountName, gmbLocationName, gmbLocations, triggerGeneratorRefresh, setPanelError, setPanelSuccess]);


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
  triggerGeneratorRefresh();
  setSiteWebGa4Notice("✅ Enregistrement GA4 validé");
  window.setTimeout(() => setSiteWebGa4Notice(null), 2500);

}, [siteWebSettingsText, siteWebUrl, updateSiteWebSettings]);

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
  setSiteWebGa4Notice("✅ Enregistrement GA4 validé");
  window.setTimeout(() => setSiteWebGa4Notice(null), 2500);

}, [siteWebGa4MeasurementId, siteWebGa4PropertyId, siteWebSettingsText, siteWebUrl, updateSiteWebSettings, triggerGeneratorRefresh]);

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
  triggerGeneratorRefresh();
}, [siteWebGscProperty, siteWebSettingsText, siteWebUrl, updateSiteWebSettings, triggerGeneratorRefresh]);




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

        const syncAt = Number.isFinite(Number(bootstrap.syncAt)) ? Number(bootstrap.syncAt) : Date.now();
        const bootstrapSnapshotDate = typeof bootstrap.snapshotDate === "string" ? bootstrap.snapshotDate : snapshotDate;
        markDailyStatsRefreshBootstrapChecked({ snapshotDate: bootstrapSnapshotDate, checkedAt: Date.now(), syncAt });

        if (bootstrap.ran) {
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

            try {
              writeUiCacheValue(
                statsCubeSessionKey(days),
                JSON.stringify({ syncedAt: syncAt, snapshotDate: payloadSnapshotDate, overviews })
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
          }

          notifyStatsRefresh(syncAt);
        } else if (!hasFreshGenerator) {
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
  }, [notifyStatsRefresh, syncFromServerCacheIfNeeded]);

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
    void refreshKpis();
  }, [dailyBootReady, refreshKpis]);

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
  const generatorIsActive = inertiaSnapshot.connectedCount > 0;

  const estimatedValue = typeof kpis?.estimatedValue === "number" ? kpis.estimatedValue : null;

  // helper render action
  const renderAction = (a: ModuleAction) => {
    const className =
      a.variant === "connect"
        ? `${styles.actionBtn} ${styles.connectBtn}`
        : a.variant === "danger"
        ? `${styles.actionBtn} ${styles.actionDanger}`
        : `${styles.actionBtn} ${styles.actionView}`;

    if (a.href) {
      // Pour l’instant href="#" (tu replaceras par les vraies URLs)
      return (
        <Link
          key={a.key}
          href={a.href}
          className={className}
          target={a.href.startsWith("http") ? "_blank" : undefined}
          rel={a.href.startsWith("http") ? "noreferrer" : undefined}
        >
          {a.label}
        </Link>
      );
    }

    return (
      <button key={a.key} type="button" className={className} onClick={a.onClick} disabled={a.disabled}>
        {a.label}
      </button>
    );
  };

  // =========================
  // Mobile-only: list vs carousel for the 6 bubbles (Canaux)
  // =========================
  type BubbleViewMode = "list" | "carousel";
  const [bubbleView, setBubbleView] = useState<BubbleViewMode>("list");
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(max-width: 560px)");
    const update = () => setIsMobile(mq.matches);
    update();

    // Safari fallback for older addListener/removeListener
    if (mq.addEventListener) mq.addEventListener("change", update);
    else mq.addListener(update);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", update);
      else mq.removeListener(update);
    };
  }, []);

  // Load saved preference
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("inrcy_bubble_view");
    if (saved === "list" || saved === "carousel") setBubbleView(saved);
  }, []);

  useEffect(() => {
  if (typeof window === "undefined") return;

  // ⛔ tant qu'on ne sait pas encore si c'est mobile, on ne fait rien
  if (isMobile === null) return;

  if (isMobile === false) {
    // desktop: toujours list
    setBubbleView("list");
    return;
  }

  // mobile: on persiste le choix
  window.localStorage.setItem("inrcy_bubble_view", bubbleView);
}, [bubbleView, isMobile]);


  const renderFluxBubble = (m: Module, keyOverride?: string) => {
    const viewActionRaw = m.actions.find((a) => a.variant === "view");
    const viewAction =
      (m.key === "site_inrcy" && viewActionRaw)
        ? {
            ...viewActionRaw,
            href: siteInrcyUrl
              ? (siteInrcyUrl.startsWith("http") ? siteInrcyUrl : `https://${siteInrcyUrl}`)
              : "#",
          }
        : (m.key === "site_web" && viewActionRaw)
        ? {
            ...viewActionRaw,
            href: siteWebUrl
              ? (siteWebUrl.startsWith("http") ? siteWebUrl : `https://${siteWebUrl}`)
              : "#",
          }
                : (m.key === "instagram" && viewActionRaw)
        ? {
            ...viewActionRaw,
            href: instagramUrl
              ? (instagramUrl.startsWith("http") ? instagramUrl : `https://${instagramUrl}`)
              : "#",
          }
        : (m.key === "linkedin" && viewActionRaw)
        ? {
            ...viewActionRaw,
            href: linkedinUrl
              ? (linkedinUrl.startsWith("http") ? linkedinUrl : `https://${linkedinUrl}`)
              : "#",
          }
        : viewActionRaw;

    // ✅ Pastilles (statuts) dynamiques selon tes règles
    const { status: bubbleStatus, text: bubbleStatusText } = (() => {
      if (m.key === "site_inrcy") {
        if (!hasActiveInrcySite(siteInrcyOwnership)) return { status: "coming" as ModuleStatus, text: "Aucun site" };
        const hasUrl = !!siteInrcyUrl?.trim();
        const connectedCount = (hasUrl ? 1 : 0) + (siteInrcyGa4Connected ? 1 : 0) + (siteInrcyGscConnected ? 1 : 0);
        if (connectedCount === 0) return { status: "available" as ModuleStatus, text: "A connecter · 0 / 3" };
        return { status: "connected" as ModuleStatus, text: `Connecté · ${connectedCount} / 3` };
      }

      if (m.key === "site_web") {
        const hasUrl = !!siteWebUrl?.trim();
        const connectedCount = (hasUrl ? 1 : 0) + (siteWebGa4Connected ? 1 : 0) + (siteWebGscConnected ? 1 : 0);
        if (connectedCount === 0) return { status: "available" as ModuleStatus, text: "A connecter · 0 / 3" };
        return { status: "connected" as ModuleStatus, text: `Connecté · ${connectedCount} / 3` };
      }

      if (m.key === "instagram") {
        if (instagramConnected) return { status: "connected" as ModuleStatus, text: "Connecté" };
        return { status: "available" as ModuleStatus, text: "A connecter" };
      }

      if (m.key === "linkedin") {
        if (linkedinConnected) return { status: "connected" as ModuleStatus, text: "Connecté" };
        return { status: "available" as ModuleStatus, text: "A connecter" };
      }

	      // Google Business + Facebook: “Connecté” = établissement/page sélectionné(e)
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


    return (
      <article
        key={keyOverride ?? m.key}
        className={`${styles.moduleCard} ${styles.moduleBubbleCard} ${styles[`accent_${m.accent}`]}`}
      >
        <div className={styles.bubbleStack}>
          <div className={styles.bubbleLogo} aria-hidden>
            <img className={styles.bubbleLogoImg} src={MODULE_ICONS[m.key]?.src} alt={MODULE_ICONS[m.key]?.alt} />
          </div>

          <div className={styles.bubbleTitleRow}>
            <div className={styles.bubbleTitle}>{m.name}</div>
            {m.key === "site_inrcy" ? (
              <HelpButton onClick={() => setHelpSiteInrcyOpen(true)} title="Aide : Site iNrCy" size={22} />
            ) : m.key === "site_web" ? (
              <HelpButton onClick={() => setHelpSiteWebOpen(true)} title="Aide : Site web" size={22} />
            ) : null}
          </div>

          <div className={styles.bubbleStatusCompact}>
            <span
              className={[
                styles.statusDot,
                bubbleStatus === "connected"
                  ? styles.dotConnected
                  : bubbleStatus === "available"
                  ? styles.dotAvailable
                  : styles.dotComing,
              ].join(" ")}
              aria-hidden
            />
            <span className={styles.bubbleStatusText}>{bubbleStatusText}</span>
          </div>

          <div className={styles.bubbleTagline}>{m.description}</div>

          <div className={styles.bubbleActions}>
            {m.key === "site_inrcy" ? (
              <a
                href={canViewSite ? (siteInrcyUrl.startsWith("http") ? siteInrcyUrl : `https://${siteInrcyUrl}`) : "#"}
                className={`${styles.actionBtn} ${styles.actionView}`}
                target={canViewSite ? "_blank" : undefined}
                rel="noreferrer"
                aria-disabled={!canViewSite}
                style={{ opacity: !canViewSite ? 0.5 : 1, pointerEvents: !canViewSite ? "none" : "auto" }}
              >
                Voir le site
              </a>
            ) : m.key === "site_web" ? (
              <a
                href={siteWebUrl ? (siteWebUrl.startsWith("http") ? siteWebUrl : `https://${siteWebUrl}`) : "#"}
                className={`${styles.actionBtn} ${styles.actionView}`}
                target={siteWebUrl ? "_blank" : undefined}
                rel="noreferrer"
                aria-disabled={!siteWebUrl}
                style={{ opacity: !siteWebUrl ? 0.5 : 1, pointerEvents: !siteWebUrl ? "none" : "auto" }}
              >
                Voir le site
              </a>
            ) : m.key === "instagram" ? (
              <a
                href={instagramUrl ? (instagramUrl.startsWith("http") ? instagramUrl : `https://${instagramUrl}`) : "#"}
                className={`${styles.actionBtn} ${styles.actionView}`}
                target={instagramUrl ? "_blank" : undefined}
                rel="noreferrer"
                aria-disabled={!instagramUrl}
                style={{ opacity: !instagramUrl ? 0.5 : 1, pointerEvents: !instagramUrl ? "none" : "auto" }}
              >
                Voir le compte
              </a>
            ) : m.key === "linkedin" ? (
              <a
                href={linkedinUrl ? (linkedinUrl.startsWith("http") ? linkedinUrl : `https://${linkedinUrl}`) : "#"}
                className={`${styles.actionBtn} ${styles.actionView}`}
                target={linkedinUrl ? "_blank" : undefined}
                rel="noreferrer"
                aria-disabled={!linkedinUrl}
                style={{ opacity: !linkedinUrl ? 0.5 : 1, pointerEvents: !linkedinUrl ? "none" : "auto" }}
              >
                Voir le compte
              </a>
            ) : m.key === "gmb" ? (
              <a
                href={gmbUrl ? (gmbUrl.startsWith("http") ? gmbUrl : `https://${gmbUrl}`) : "#"}
                className={`${styles.actionBtn} ${styles.actionView}`}
                target={gmbUrl ? "_blank" : undefined}
                rel="noreferrer"
                aria-disabled={!gmbUrl}
                style={{ opacity: !gmbUrl ? 0.5 : 1, pointerEvents: !gmbUrl ? "none" : "auto" }}
              >
                Voir la page
              </a>
            ) : m.key === "facebook" ? (
              <a
                href={facebookUrl ? (facebookUrl.startsWith("http") ? facebookUrl : `https://${facebookUrl}`) : "#"}
                className={`${styles.actionBtn} ${styles.actionView}`}
                target={facebookUrl ? "_blank" : undefined}
                rel="noreferrer"
                aria-disabled={!facebookUrl}
                style={{ opacity: !facebookUrl ? 0.5 : 1, pointerEvents: !facebookUrl ? "none" : "auto" }}
              >
                Voir le compte
              </a>
            ) : viewAction ? (
              renderAction(viewAction)
            ) : (
              <button className={`${styles.actionBtn} ${styles.actionView}`} type="button">
                Voir
              </button>
            )}

            <button
              className={`${styles.actionBtn} ${styles.connectBtn} ${styles.actionMain}`}
              type="button"
              onClick={() => {
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
              }}
              disabled={
                m.key === "site_inrcy"
                  ? !canConfigureSite
                  : false
              }
              title={
                m.key === "site_inrcy" && !canConfigureSite
                  ? "Disponible uniquement si vous avez un site iNrCy"
                  : undefined
              }
            >
              {"Configurer"}
            </button>
          </div>
        </div>

        <div className={styles.moduleGlow} aria-hidden />
      </article>
    );
  };

  // Carousel state (infinite loop)
  const baseModules = fluxModules;
  const hasCarousel = baseModules.length > 1;

  // clones: [last, ...real, first]
  const carouselItems = hasCarousel
    ? [baseModules[baseModules.length - 1], ...baseModules, baseModules[0]]
    : baseModules;

  const carouselRef = useRef<HTMLDivElement | null>(null);

  // index in carouselItems (includes clones)
  const [carouselIndex, setCarouselIndex] = useState(1);
  const [carouselTransition, setCarouselTransition] = useState(true);

  // prevent swipe spamming / interrupted transitions on mobile
  const isAnimating = useRef(false);

  // drag (track follows finger)
  const touchStartX = useRef<number | null>(null);
  const isDragging = useRef(false);
  const [dragPx, setDragPx] = useState(0);

  const goPrev = useCallback(() => {
    if (!hasCarousel) return;
    if (isAnimating.current) return;
    isAnimating.current = true;
    setCarouselIndex((i) => i - 1);
  }, [hasCarousel]);

  const goNext = useCallback(() => {
    if (!hasCarousel) return;
    if (isAnimating.current) return;
    isAnimating.current = true;
    setCarouselIndex((i) => i + 1);
  }, [hasCarousel]);

  // reset cleanly when switching to carousel (mobile)
  useEffect(() => {
    if (!isMobile) return;
    if (bubbleView !== "carousel") return;

    setCarouselTransition(false);
    setCarouselIndex(1);
    setDragPx(0);

    const id = window.setTimeout(() => setCarouselTransition(true), 0);
    return () => window.clearTimeout(id);
  }, [bubbleView, isMobile]);

  const onCarouselTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (!hasCarousel) return;
    if (isAnimating.current) return;
    touchStartX.current = e.touches[0]?.clientX ?? null;
    isDragging.current = true;

    // during drag: no transition
    setCarouselTransition(false);
    setDragPx(0);
  };

  const onCarouselTouchMove = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (!hasCarousel) return;
    if (!isDragging.current || touchStartX.current == null) return;

    const x = e.touches[0]?.clientX ?? 0;
    setDragPx(x - touchStartX.current);
  };

  const onCarouselTouchEnd = () => {
    if (!hasCarousel) return;

    const dx = dragPx;

    isDragging.current = false;
    touchStartX.current = null;

    const threshold = 60;

    // snap back to slide positions with transition
    setCarouselTransition(true);
    setDragPx(0);

    if (Math.abs(dx) < threshold) return;

    if (dx < 0) goNext();
    else goPrev();
  };

  const onCarouselTransitionEnd = () => {
  if (!hasCarousel) return;
  if (isDragging.current) return;

  const lastReal = baseModules.length;

  // clone -> vrai dernier (boucle arrière)
  if (carouselIndex === 0) {
    setCarouselTransition(false);
    setCarouselIndex(lastReal);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setCarouselTransition(true);
        isAnimating.current = false;
      });
    });
    return;
  }

  // clone -> vrai premier (boucle avant)
  if (carouselIndex === lastReal + 1) {
    setCarouselTransition(false);
    setCarouselIndex(1);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setCarouselTransition(true);
        isAnimating.current = false;
      });
    });
    return;
  }

  // normal slide end
  isAnimating.current = false;
};

  // Safety net: if transitionend doesn't fire (mobile can cancel transitions),
  // keep index within [0, lastReal + 1] so we never drift to huge translateX values.
  useEffect(() => {
    if (!hasCarousel) return;
    const lastReal = baseModules.length;

    if (carouselIndex < 0) {
      setCarouselTransition(false);
      setCarouselIndex(lastReal);
      requestAnimationFrame(() => requestAnimationFrame(() => setCarouselTransition(true)));
      isAnimating.current = false;
    } else if (carouselIndex > lastReal + 1) {
      setCarouselTransition(false);
      setCarouselIndex(1);
      requestAnimationFrame(() => requestAnimationFrame(() => setCarouselTransition(true)));
      isAnimating.current = false;
    }
  }, [carouselIndex, baseModules.length, hasCarousel]);


  const activeDot = hasCarousel
    ? (((carouselIndex - 1) % baseModules.length) + baseModules.length) % baseModules.length
    : 0;


  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <img className={styles.logoImg} src="/logo-inrcy.png" alt="iNrCy" />
          <div className={styles.brandText}>
                       <div className={styles.brandTag}>Générateur de business</div>
          </div>
        </div>

        {/* Desktop actions */}
        <div className={styles.topbarActions}>
          <div className={styles.notificationWrap} ref={desktopNotificationMenuRef}>
            <NotificationMenu
              notificationMenuOpen={notificationMenuOpen}
              setNotificationMenuOpen={setNotificationMenuOpen}
              unreadNotificationsCount={unreadNotificationsCount}
              refreshNotifications={refreshNotifications}
              notificationsLoading={notificationsLoading}
              notifications={notifications}
              notificationsError={notificationsError}
              openPanel={() => openPanel("notifications")}
              markAllNotificationsRead={markAllNotificationsRead}
              markNotificationRead={markNotificationRead}
              deleteNotification={deleteNotification}
              onNavigate={(ctaUrl) => {
                if (ctaUrl.startsWith('/')) {
                  router.push(ctaUrl);
                } else {
                  window.location.href = ctaUrl;
                }
              }}
            />
          </div>

          <button type="button" className={styles.ghostBtn} onClick={() => openPanel("contact")}>
            Nous contacter
          </button>

          {/* ✅ Menu utilisateur (remplace OUT) */}
          <div ref={userMenuRef}>
            <UserMenu
              userEmail={userEmail}
              userFirstLetter={userFirstLetter}
              profileIncomplete={profileIncomplete}
              activityIncomplete={activityIncomplete}
              userMenuOpen={userMenuOpen}
              setUserMenuOpen={setUserMenuOpen}
              openPanel={openPanel}
              goToGps={() => router.push("/dashboard/gps")}
              handleLogout={handleLogout}
            />
          </div>
        </div>

        {/* Mobile notifications */}
        <div className={styles.mobileBellWrap}>
          <div className={styles.notificationWrap} ref={mobileNotificationMenuRef}>
            <NotificationMenu
              notificationMenuOpen={notificationMenuOpen}
              setNotificationMenuOpen={setNotificationMenuOpen}
              unreadNotificationsCount={unreadNotificationsCount}
              refreshNotifications={refreshNotifications}
              notificationsLoading={notificationsLoading}
              notifications={notifications}
              notificationsError={notificationsError}
              openPanel={() => openPanel("notifications")}
              markAllNotificationsRead={markAllNotificationsRead}
              markNotificationRead={markNotificationRead}
              deleteNotification={deleteNotification}
              onNavigate={(ctaUrl) => {
                if (ctaUrl.startsWith('/')) {
                  router.push(ctaUrl);
                } else {
                  window.location.href = ctaUrl;
                }
              }}
              mobile
            />
          </div>
        </div>

        {/* Mobile hamburger */}
        <div className={styles.mobileMenuWrap} ref={menuRef}>
          <button
  type="button"
  className={styles.hamburgerBtn}
  aria-label="Ouvrir le menu"
  aria-expanded={menuOpen}
  onClick={() => setMenuOpen((v) => !v)}
>
  <span className={styles.hamburgerIcon} aria-hidden />

  {(profileIncomplete || activityIncomplete) && (
    <span
      className={styles.hamburgerWarnDot}
      aria-hidden
    />
  )}
</button>

          {menuOpen && (
            <div className={styles.mobileMenuPanel} role="menu" aria-label="Menu">

{profileIncomplete && (
  <button
    className={styles.mobileMenuItem}
    type="button"
    role="menuitem"
    onClick={() => {
      setMenuOpen(false);
      openPanel("profil");
    }}
  >
    ⚠️ Profil incomplet — compléter
  </button>
)}

{activityIncomplete && (
  <button
    className={styles.mobileMenuItem}
    type="button"
    role="menuitem"
    onClick={() => {
      setMenuOpen(false);
      openPanel("activite");
    }}
  >
    ⚠️ Activité incomplète — compléter
  </button>
)}

              <button
                className={styles.mobileMenuItem}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  openPanel("contact");
                }}
              >
                Nous contacter
              </button>

              <button
                className={styles.mobileMenuItem}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  openPanel("compte");
                }}
              >
                Mon compte
              </button>

              <button
                className={styles.mobileMenuItem}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  openPanel("profil");
                }}
              >
                Mon profil
              </button>

              <button
                className={styles.mobileMenuItem}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  openPanel("activite");
                }}
              >
                Mon activité
              </button>

              <button
                className={styles.mobileMenuItem}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  openPanel("notifications");
                }}
              >
                Notifications
              </button>

              <button
                className={styles.mobileMenuItem}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  openPanel("abonnement");
                }}
              >
                Mon abonnement
              </button>

              <button
                className={styles.mobileMenuItem}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  openPanel("inertie");
                }}
              >
                Mon inertie
              </button>
              <button
                className={styles.mobileMenuItem}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  openPanel("boutique");
                }}
              >
                Boutique
              </button>

              <button
                className={styles.mobileMenuItem}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  openPanel("parrainage");
                }}
              >
                Parrainer avec iNrCy
              </button>

              <button
                className={styles.mobileMenuItem}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  router.push("/dashboard/gps");
                }}
              >
                GPS d’utilisation
              </button>

              <button
                className={styles.mobileMenuItem}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  openPanel("legal");
                }}
              >
                Informations légales
              </button>

              <button
                className={styles.mobileMenuItem}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  openPanel("rgpd");
                }}
              >
                Mes données (RGPD)
              </button>

              <div className={styles.mobileMenuDivider} />

              <button
                className={`${styles.mobileMenuItem} ${styles.mobileMenuDanger}`}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  handleLogout();
                }}
              >
                Déconnexion
              </button>
            </div>
          )}
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroLeft}>
          <div className={styles.heroTop}>
            <div className={styles.kicker}>
              <span className={styles.kickerText}>Votre cockpit iNrCy</span>
            </div>

            <h1 className={styles.title}>
              <span className={styles.titleAccent}>Le Générateur est lancé&nbsp;!</span>
            </h1>

            <p className={styles.subtitle}>
              Tous vos canaux alimentent maintenant une seule et même machine.
            </p>

            <div className={styles.signatureFlow}>
              <span>Contacts</span>
              <span className={styles.flowArrow}>→</span>
              <span>Devis</span>
              <span className={styles.flowArrow}>→</span>
              <span>Chiffre d'affaires</span>
            </div>
          </div>

          <div className={styles.powerBlock}>
            <div className={styles.powerHeader}>
              <div className={styles.powerInlineTitle}>
                Puissance du générateur : <span className={styles.powerInlineValue}>{generatorPower}%</span>
              </div>
              <div className={styles.powerMeta}>
                {remainingGeneratorPowerSteps === 0
                  ? "Pleine puissance"
                  : `${remainingGeneratorPowerSteps} étape${remainingGeneratorPowerSteps > 1 ? "s" : ""} restante${remainingGeneratorPowerSteps > 1 ? "s" : ""}`}
              </div>
            </div>

            <div
              className={styles.powerBar}
              role="progressbar"
              aria-label="Puissance du générateur"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={generatorPower}
            >
              <div className={styles.powerBarFill} style={{ width: `${generatorPower}%` }} />
            </div>

            <div className={styles.powerFooter}>
              {nextGeneratorPowerStep ? (
                <span className={styles.powerHint}>
                  Prochaine montée : {nextGeneratorPowerStep.label} <strong>(+{nextGeneratorPowerStep.weight}%)</strong>
                </span>
              ) : (
                <span className={styles.powerHintComplete}>Tous vos leviers alimentent la machine à pleine puissance.</span>
              )}
            </div>
          </div>
        </div>

        <div className={styles.generatorCard}>
          <div className={styles.generatorFX} aria-hidden />
          <div className={styles.generatorFX2} aria-hidden />
          <div className={styles.generatorFX3} aria-hidden />

          <div className={styles.generatorHeader}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className={styles.generatorTitle}>Générateur iNrCy</div>
                <HelpButton onClick={() => setHelpGeneratorOpen(true)} title="Aide : Générateur iNrCy" />
              </div>
              <div className={styles.generatorDesc}>Production de prospects et de clients dès qu’un module est connecté</div>
            </div>

            <div className={styles.generatorHeaderRight}>
              <button
                type="button"
                className={styles.generatorRefreshBtn}
                onClick={() => {
                  void handleSharedGeneratorRefresh();
                }}
                disabled={kpisLoading}
                aria-label="Actualiser le générateur"
                title="Actualiser"
              >
                {kpisLoading ? (
                  <span className={styles.miniSpinner} aria-hidden />
                ) : (
                  <svg
                    className={styles.refreshIcon}
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden
                  >
                    <path
                      d="M20 12a8 8 0 1 1-2.343-5.657"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M20 4v6h-6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>

              <div className={`${styles.generatorStatus} ${generatorIsActive ? styles.statusLive : styles.statusSetup}`}>
                <span className={generatorIsActive ? styles.liveDot : styles.setupDot} aria-hidden />
                {generatorIsActive ? "Actif" : "En attente"}
              </div>
            </div>
          </div>

          <div className={styles.generatorGrid}>
            <div className={`${styles.metricCard} ${styles.metricInertia}`}>
              <div className={styles.metricLabel}>Unités d&apos;Inertie</div>
              <div className={styles.metricValue}>{uiBalance}</div>
              <div className={styles.metricHint}>
                Turbo UI ×{inertiaSnapshot.multiplier} — {inertiaSnapshot.connectedCount}/{inertiaSnapshot.totalChannels} canaux
              </div>
            </div>


            <div className={styles.generatorCoreCenter} aria-hidden>
              <div className={styles.miniCoreRing} />
              <div className={styles.miniCoreRotor} />
              <div className={styles.miniCoreGlass} />
              <div className={styles.miniCoreGlow} />
            </div>

            <div className={`${styles.metricCard} ${styles.metricCa}`}>
              <div className={styles.metricLabel}>CA POTENTIEL 30 jours</div>
              <div className={styles.metricValue}>
                {estimatedValue === null ? "—" : `${estimatedValue.toLocaleString("fr-FR")} €`}
              </div>
              <div className={styles.metricHint}>Basé sur profil + opportunités</div>
            </div>

            {/* ✅ Carte libérée : Opportunités activables (futur possible) */}
            <div className={`${styles.metricCard} ${styles.metricOpportunities}`}>
              <div className={styles.metricLabel}>Opportunités activables</div>

              {/* ✅ Responsive : GO sur la même ligne que la valeur (via CSS). Desktop inchangé (bouton en corner). */}
              <div className={styles.metricValueRow}>
                <div className={styles.metricValue}>
                  <span>{oppTotal === null ? "—" : `+${oppTotal}`}</span>
                </div>

                <button
                  type="button"
                  className={styles.generatorGoBtnCorner}
                  onClick={() => router.push("/dashboard/stats")}
                  aria-label="Voir iNrStats"
                  title="Voir iNrStats"
                >
                  <span className={styles.generatorGoBtnLabel}>GO</span>
                </button>
              </div>

              <div className={styles.metricHint}>Projection 30 jours</div>
            </div>

            {/* ✅ Fusion 7j + 30j dans une seule carte (lecture plus simple) */}
            <div className={`${styles.metricCard} ${styles.metricDemandes}`}>
              <div className={styles.metricLabel}>Demandes captées</div>
              <div className={styles.metricSplit}>
                <div className={styles.metricSplitItem}>
                  <div className={styles.metricSplitValue}>{leadsWeek === null ? "—" : leadsWeek}</div>
                  <div className={styles.metricSplitLabel}>7 derniers jours</div>
                </div>
                <div className={styles.metricSplitItem}>
                  <div className={styles.metricSplitValue}>{leadsMonth === null ? "—" : leadsMonth}</div>
                  <div className={styles.metricSplitLabel}>30 derniers jours</div>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.generatorFooter}>
            {/* ✅ On enlève le bouton "Connecter un outil" si tu veux éviter "connecter un module" partout */}
            {/* <button className={`${styles.primaryBtn} ${styles.connectBtn}`} type="button">
              Connecter un outil
            </button> */}
          </div>

          <div className={styles.generatorGlow} aria-hidden />
        </div>
      </section>

      <section className={styles.contentFull}>
        <div className={styles.sectionHead}>
          <div className={styles.sectionHeadTop}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h2 className={styles.h2} style={{ margin: 0 }}>Canaux</h2>
              <HelpButton onClick={() => setHelpCanauxOpen(true)} title="Aide : Canaux" />
            </div>

            {/* Mobile only: choix Liste / Carrousel */}
            <div className={styles.mobileViewToggle} aria-label="Affichage des canaux">
              <button
                type="button"
                className={`${styles.viewToggleBtn} ${bubbleView === "list" ? styles.viewToggleActive : ""}`}
                onClick={() => setBubbleView("list")}
              >
                Liste
              </button>
              <button
                type="button"
                className={`${styles.viewToggleBtn} ${bubbleView === "carousel" ? styles.viewToggleActive : ""}`}
                onClick={() => setBubbleView("carousel")}
              >
                Carrousel
              </button>
            </div>
          </div>

          <p className={styles.h2Sub}>Votre autoroute de contacts entrants</p>
        </div>

        {/* ✅ Mobile: carrousel infini / Desktop: liste */}
        {isMobile && bubbleView === "carousel" ? (
          <>
            <div
              className={styles.mobileCarousel}
              ref={carouselRef}
              onTouchStart={onCarouselTouchStart}
              onTouchMove={onCarouselTouchMove}
              onTouchEnd={onCarouselTouchEnd}
            >
              <div
                className={styles.carouselTrack}
                style={{
                  transform: `translateX(calc(-${carouselIndex * 100}% + ${dragPx}px))`,
                  transition: carouselTransition ? "transform 260ms ease" : "none",
                }}
                onTransitionEnd={onCarouselTransitionEnd}
              >
                {carouselItems.map((m, idx) => (
                  <div className={styles.carouselSlide} key={`${m.key}_${idx}`}>
                    {renderFluxBubble(m, `${m.key}_${idx}`)}
                  </div>
                ))}
              </div>
            </div>

            {hasCarousel && (
              <div className={styles.carouselDots} aria-label="Position dans le carrousel">
                {baseModules.map((_, i) => (
                  <span
                    key={i}
                    className={`${styles.carouselDot} ${i === activeDot ? styles.carouselDotActive : ""}`}
                    aria-hidden="true"
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className={styles.moduleGrid}>{fluxModules.map((m) => renderFluxBubble(m))}</div>
        )}


        <div className={styles.lowerRow}>
          <div className={styles.blockCard}>
            <div className={styles.blockHead}>
              <h3 className={styles.h3}>Tableau de bord</h3>
              <span className={styles.smallMuted}>Pilotage</span>
            </div>

            <div className={styles.loopWrap}>
              {/* ✅ TON CONTENU PILOTAGE (inchangé) */}
              {/* (tout ton SVG + loopGrid est conservé tel quel) */}
              {/* --- START --- */}
              <svg className={styles.loopWheel} viewBox="0 0 300 300" aria-hidden="true">
                <defs>
                  <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2.4" result="b" />
                    <feMerge>
                      <feMergeNode in="b" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>

                  <radialGradient id="rimGrad" cx="50%" cy="45%" r="65%">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.28)" />
                    <stop offset="55%" stopColor="rgba(255,255,255,0.10)" />
                    <stop offset="100%" stopColor="rgba(255,255,255,0.04)" />
                  </radialGradient>

                  <radialGradient id="rimInner" cx="50%" cy="50%" r="60%">
                    <stop offset="0%" stopColor="rgba(56,189,248,0.18)" />
                    <stop offset="70%" stopColor="rgba(255,255,255,0.06)" />
                    <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
                  </radialGradient>

                  <marker id="chev" markerWidth="10" markerHeight="10" refX="6.5" refY="5" orient="auto">
                    <path
                      d="M1,1 L7,5 L1,9"
                      fill="none"
                      stroke="rgba(255,255,255,0.70)"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </marker>
                </defs>

                <circle cx="150" cy="150" r="92" fill="none" stroke="url(#rimGrad)" strokeWidth="10" filter="url(#softGlow)" />
                <circle cx="150" cy="150" r="84" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="2" />

                <circle cx="150" cy="150" r="70" fill="none" stroke="url(#rimInner)" strokeWidth="18" opacity="0.55" />

                <g filter="url(#softGlow)">
                  <path d="M150 150 L150 78" stroke="rgba(255,255,255,0.18)" strokeWidth="6" strokeLinecap="round" />
                  <path d="M150 150 L222 150" stroke="rgba(255,255,255,0.18)" strokeWidth="6" strokeLinecap="round" />
                  <path d="M150 150 L150 222" stroke="rgba(255,255,255,0.18)" strokeWidth="6" strokeLinecap="round" />
                  <path d="M150 150 L78 150" stroke="rgba(255,255,255,0.18)" strokeWidth="6" strokeLinecap="round" />
                </g>

                <g>
                  <path d="M150 150 L150 78" stroke="rgba(255,255,255,0.55)" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="M150 150 L222 150" stroke="rgba(255,255,255,0.55)" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="M150 150 L150 222" stroke="rgba(255,255,255,0.55)" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="M150 150 L78 150" stroke="rgba(255,255,255,0.55)" strokeWidth="1.6" strokeLinecap="round" />
                </g>

                <g filter="url(#softGlow)">
                  <circle cx="150" cy="150" r="18" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" />
                  <circle cx="150" cy="150" r="8" fill="rgba(56,189,248,0.20)" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
                </g>
              </svg>

              <div className={styles.loopGrid}>
    <div className={`${styles.loopNode} ${styles.loopTop} ${styles.loop_cyan}`}>
<span className={`${styles.loopBadge} ${styles.badgeCyan}`}></span>

      <div className={styles.loopTopRow}>
        <div className={styles.loopTitle}>STATS</div>
      </div>
      <div className={styles.loopSub}>Tous vos leads, enfin visibles</div>
      <div className={styles.loopActions}>
        <button className={`${styles.actionBtn} ${styles.connectBtn}`} type="button" onClick={() => goToModule("/dashboard/stats")}>
          Voir les stats
        </button>
      </div>
    </div>

    <div className={`${styles.loopNode} ${styles.loopRight} ${styles.loop_purple}`}>
<span className={`${styles.loopBadge} ${styles.badgePurple}`}></span>

     <div className={styles.loopTopRow}>
  <div className={styles.loopTitle}>COMS</div>
</div>

<button
  className={styles.loopGearBtn}
  type="button"
  aria-label="Réglages Mails"
  title="Réglages"
  onClick={() => openPanel("mails")}
>
  <svg className={styles.loopGearSvg} viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
  <path d="M19.4 15a7.9 7.9 0 0 0 .1-1 7.9 7.9 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7.7 7.7 0 0 0-1.7-1l-.4-2.6H10l-.4 2.6a7.7 7.7 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.9 7.9 0 0 0-.1 1 7.9 7.9 0 0 0 .1 1l-2 1.5 2 3.5 2.4-1c.5.4 1.1.7 1.7 1l.4 2.6h4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.4 1 2-3.5-2-1.5Z" />
</svg>
</button>

      <div className={styles.loopSub}>Tous vos messages partent d'ici</div>
      <div className={styles.loopActions}>
        <button
  className={`${styles.actionBtn} ${styles.connectBtn}`}
  type="button"
  onClick={() => goToModule("/dashboard/mails")}
>
  Ouvrir iNr'Send
</button>
      </div>
    </div>

    <div className={`${styles.loopNode} ${styles.loopBottom} ${styles.loop_orange}`}>
<span className={`${styles.loopBadge} ${styles.badgeOrange}`}></span>

      <div className={styles.loopTopRow}>
  <div className={styles.loopTitle}>AGENDA</div>
</div>



      <div className={styles.loopSub}>Transformez les contacts en RDV</div>
      <div className={styles.loopActions}>
        <button
  className={`${styles.actionBtn} ${styles.connectBtn}`}
  type="button"
  onClick={() => goToModule("/dashboard/agenda")}
>
  Voir l’agenda
</button>
      </div>
    </div>

    <div className={`${styles.loopNode} ${styles.loopLeft} ${styles.loop_pink}`}>
<span className={`${styles.loopBadge} ${styles.badgePink}`}></span>

      <div className={styles.loopTopRow}>
        <div className={styles.loopTitle}>CRM</div>
      </div>
      <div className={styles.loopSub}>Vos prospects et clients centralisés</div>
      <div className={styles.loopActions}>
        <button
          className={`${styles.actionBtn} ${styles.connectBtn}`}
          type="button"
          onClick={() => goToModule("/dashboard/crm")}
        >
          Ouvrir le CRM
        </button>
      </div>
    </div>

    <div className={styles.signalHub} aria-hidden="true">
      <span className={styles.signalCore} />
      <span className={`${styles.signalWave} ${styles.wave1}`} />
      <span className={`${styles.signalWave} ${styles.wave2}`} />
      <span className={`${styles.signalWave} ${styles.wave3}`} />
      <span className={`${styles.signalWave} ${styles.wave4}`} />
    </div>
  </div>
</div>

          </div>

          <div className={styles.blockCard}>
            <div className={styles.blockHead}>
              <h3 className={styles.h3}>Boîte de vitesse</h3>
              <span className={styles.smallMuted}>Conversion</span>
            </div>

            <div className={styles.gearWrap}>
              {/* ✅ TON CONTENU BOÎTE DE VITESSE (inchangé) */}
              {/* --- START --- */}
              <div className={styles.gearRail} aria-hidden />

              <div className={styles.gearGrid}>
                <button
    type="button"
    className={`${styles.gearCapsule} ${styles.gear_cyan}`}
    onClick={() => goToModule("/dashboard/booster")}
  >
    <div className={styles.gearInner}>
      <div className={styles.gearTitle}>Booster</div>
      <div className={styles.gearSub}>Active tous vos canaux</div>
      <div className={styles.gearBtn}>Agir maintenant</div>
    </div>
  </button>

                <button
                  className={`${styles.gearCapsule} ${styles.gear_purple}`}
                  type="button"
                  onClick={() => goToModule("/dashboard/devis/new")}
                >
                  <div className={styles.gearInner}>
                    <div className={styles.gearTitle}>Devis</div>
                    <div className={styles.gearSub}>Déclenche des opportunités</div>
                    <div className={styles.gearBtn}>Créer un devis</div>
                  </div>
                </button>

                <button
                  className={`${styles.gearCapsule} ${styles.gear_pink}`}
                  type="button"
                  onClick={() => goToModule("/dashboard/factures/new")}
                >
                  <div className={styles.gearInner}>
                    <div className={styles.gearTitle}>Facturer</div>
                    <div className={styles.gearSub}>Transforme en CA</div>
                    <div className={styles.gearBtn}>Créer une facture</div>
                  </div>
                </button>

                <button
    type="button"
    className={`${styles.gearCapsule} ${styles.gear_purple}`}
    onClick={() => goToModule("/dashboard/fideliser")}
  >
    <div className={styles.gearInner}>
      <div className={styles.gearTitle}>Fidéliser</div>
      <div className={styles.gearSub}>Pérennise votre activité</div>
      <div className={styles.gearBtn}>Communiquer</div>
    </div>
  </button>
              </div>
              {/* --- END --- */}
            </div>
          </div>
        </div>
      </section>

      <SettingsDrawer
        title={getDrawerTitle(panel)}
        isOpen={isDrawerPanel(panel)}
        onClose={closePanel}
        headerActions={
          panel === "inertie" ? <HelpButton onClick={() => setHelpInertieOpen(true)} title="Aide : Mon inertie" /> : null
        }
      >
        {panel === "contact" && <ContactContent mode="drawer" />}
        {panel === "compte" && <AccountContent mode="drawer" />}
        {panel === "profil" && <ProfilContent mode="drawer" onProfileSaved={checkProfile} onProfileReset={checkProfile} />}
        {panel === "activite" && <ActivityContent mode="drawer" onActivitySaved={checkActivity} onActivityReset={checkActivity} />}
        {panel === "abonnement" && <AbonnementContent mode="drawer" />}
        {panel === "legal" && <LegalContent mode="drawer" />}
        {panel === "rgpd" && <RgpdContent mode="drawer" />}
        {panel === "mails" && <MailsSettingsContent />}
        {panel === "inertie" && (
          <InertiaContent
            mode="drawer"
            snapshot={inertiaSnapshot}
            onOpenBoutique={() => openPanel("boutique")}
          />
        )}


{panel === "boutique" && (
  <BoutiqueContent
    mode="drawer"
    onOpenInertia={() => openPanel("inertie")}
  />
)}

{panel === "parrainage" && (
  <div style={{ display: "grid", gap: 14 }}>
    <div
      style={{
        border: "1px solid rgba(96,165,250,0.22)",
        background:
          "linear-gradient(135deg, rgba(14,25,56,0.96) 0%, rgba(33,16,66,0.92) 52%, rgba(10,21,53,0.96) 100%)",
        borderRadius: 20,
        padding: 18,
        display: "grid",
        gap: 16,
        boxShadow: "0 20px 60px rgba(2,6,23,0.32), inset 0 1px 0 rgba(255,255,255,0.06)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          right: -36,
          top: -36,
          width: 140,
          height: 140,
          borderRadius: 999,
          background: "radial-gradient(circle, rgba(236,72,153,0.26) 0%, rgba(236,72,153,0.04) 55%, transparent 72%)",
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: -50,
          bottom: -56,
          width: 170,
          height: 170,
          borderRadius: 999,
          background: "radial-gradient(circle, rgba(59,130,246,0.24) 0%, rgba(59,130,246,0.04) 58%, transparent 76%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", position: "relative", zIndex: 1 }}>
        <div style={{ display: "grid", gap: 8, maxWidth: 560 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              width: "fit-content",
              padding: "8px 12px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.06)",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.3,
              color: "rgba(255,255,255,0.92)",
            }}
          >
            🎁 Programme de parrainage iNrCy
          </div>
          <div style={{ fontSize: 26, lineHeight: 1.08, fontWeight: 800, color: "white" }}>
            Recommandez un professionnel et débloquez <span style={{ color: "#f9a8d4" }}>50 €</span> de chèque cadeau.
          </div>
          <div style={{ color: "rgba(226,232,240,0.9)", fontSize: 14, lineHeight: 1.65 }}>
            Dès qu’un client recommandé rejoint iNrCy et reste engagé au minimum <strong>6 mois</strong>,
            nous validons votre récompense. Remplissez le formulaire ci-dessous : l’équipe contacte directement votre recommandation.
          </div>
        </div>

        <div
          style={{
            minWidth: 220,
            flex: "0 1 250px",
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.06)",
            borderRadius: 18,
            padding: 14,
            display: "grid",
            gap: 10,
            alignSelf: "start",
          }}
        >
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.68)", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Conditions
          </div>
          <div style={{ display: "grid", gap: 8, color: "white", fontSize: 14, lineHeight: 1.45 }}>
            <div>• 1 contact recommandé qualifié</div>
            <div>• 50 € de chèque cadeau après validation</div>
            <div>• Client engagé au minimum 6 mois</div>
            <div>• Envoi direct à l’équipe iNrCy</div>
          </div>
        </div>
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 1,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(8,15,32,0.48)",
          borderRadius: 18,
          padding: 16,
          display: "grid",
          gap: 14,
        }}
      >
        <div style={{ display: "grid", gap: 6 }}>
          <div className={styles.blockTitle}>Coordonnées à transmettre</div>
          <div className={styles.blockSub}>Les informations seront envoyées automatiquement à <strong>parrainage@inrcy.com</strong>.</div>
        </div>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
          <input
            value={referralName}
            onChange={(e) => setReferralName(e.target.value)}
            placeholder="Nom Prénom ou raison sociale"
            style={{
              width: "100%",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(15,23,42,0.72)",
              colorScheme: "dark",
              padding: "12px 14px",
              color: "white",
              outline: "none",
            }}
          />

          <input
            value={referralPhone}
            onChange={(e) => setReferralPhone(e.target.value)}
            placeholder="Téléphone"
            inputMode="tel"
            style={{
              width: "100%",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(15,23,42,0.72)",
              colorScheme: "dark",
              padding: "12px 14px",
              color: "white",
              outline: "none",
            }}
          />

          <input
            value={referralEmail}
            onChange={(e) => setReferralEmail(e.target.value)}
            placeholder="Mail"
            inputMode="email"
            style={{
              width: "100%",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(15,23,42,0.72)",
              colorScheme: "dark",
              padding: "12px 14px",
              color: "white",
              outline: "none",
            }}
          />

          <input
            value={referralFrom}
            onChange={(e) => setReferralFrom(e.target.value)}
            placeholder="Parrain / de la part de"
            style={{
              width: "100%",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(15,23,42,0.72)",
              colorScheme: "dark",
              padding: "12px 14px",
              color: "white",
              outline: "none",
            }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ color: "rgba(255,255,255,0.66)", fontSize: 12, lineHeight: 1.5 }}>
            Votre recommandation est transmise à l’équipe iNrCy pour prise de contact manuelle.
          </div>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.connectBtn}`}
            onClick={submitReferral}
            disabled={referralSubmitting}
          >
            {referralSubmitting ? "Envoi..." : "Envoyer la recommandation"}
          </button>
        </div>

        {referralNotice && <div className={styles.successNote}>{referralNotice}</div>}
        {referralError && <div style={{ color: "rgba(248,113,113,0.95)", fontSize: 13 }}>{referralError}</div>}
      </div>
    </div>
  </div>
)}

{panel === "notifications" && <NotificationsSettingsContent />}


        {panel === "site_inrcy" && (
          <SiteInrcyPanel
            siteInrcyOwnership={siteInrcyOwnership}
            siteInrcyAllGreen={siteInrcyAllGreen}
            siteInrcyContactEmail={siteInrcyContactEmail}
            hasSiteInrcyUrl={hasSiteInrcyUrl}
            siteInrcyUrl={siteInrcyUrl}
            setSiteInrcyUrl={setSiteInrcyUrl}
            saveSiteInrcyUrl={saveSiteInrcyUrl}
            deleteSiteInrcyUrl={deleteSiteInrcyUrl}
            draftSiteInrcyUrlMeta={draftSiteInrcyUrlMeta}
            siteInrcyUrlNotice={siteInrcyUrlNotice}
            siteInrcyGa4Connected={siteInrcyGa4Connected}
            ga4MeasurementId={ga4MeasurementId}
            ga4PropertyId={ga4PropertyId}
            disconnectSiteInrcyGa4={disconnectSiteInrcyGa4}
            connectSiteInrcyGa4={connectSiteInrcyGa4}
            canConnectSiteInrcyGoogle={canConnectSiteInrcyGoogle}
            canConfigureSite={canConfigureSite}
            siteInrcyGa4Notice={siteInrcyGa4Notice}
            siteInrcyGscConnected={siteInrcyGscConnected}
            gscProperty={gscProperty}
            disconnectSiteInrcyGsc={disconnectSiteInrcyGsc}
            connectSiteInrcyGsc={connectSiteInrcyGsc}
            siteInrcyGscNotice={siteInrcyGscNotice}
            siteInrcyActusLayout={siteInrcyActusLayout}
            setSiteInrcyActusLayout={setSiteInrcyActusLayout}
            siteInrcyActusLimit={siteInrcyActusLimit}
            setSiteInrcyActusLimit={setSiteInrcyActusLimit}
            siteInrcyActusFont={siteInrcyActusFont}
            setSiteInrcyActusFont={setSiteInrcyActusFont}
            siteInrcyActusTheme={siteInrcyActusTheme}
            setSiteInrcyActusTheme={setSiteInrcyActusTheme}
            siteInrcySavedUrl={siteInrcySavedUrl}
            widgetTokenInrcySite={widgetTokenInrcySite}
            showSiteInrcyWidgetCode={showSiteInrcyWidgetCode}
            setShowSiteInrcyWidgetCode={setShowSiteInrcyWidgetCode}
            siteInrcySettingsError={siteInrcySettingsError}
            resetSiteInrcyAll={resetSiteInrcyAll}
          />
        )}

{panel === "site_web" && (
          <SiteWebPanel
            siteWebAllGreen={siteWebAllGreen}
            hasSiteWebUrl={hasSiteWebUrl}
            siteWebUrl={siteWebUrl}
            setSiteWebUrl={setSiteWebUrl}
            saveSiteWebUrl={saveSiteWebUrl}
            deleteSiteWebUrl={deleteSiteWebUrl}
            draftSiteWebUrlMeta={draftSiteWebUrlMeta}
            siteWebUrlNotice={siteWebUrlNotice}
            siteWebGa4Connected={siteWebGa4Connected}
            siteWebGa4MeasurementId={siteWebGa4MeasurementId}
            siteWebGa4PropertyId={siteWebGa4PropertyId}
            disconnectSiteWebGa4={disconnectSiteWebGa4}
            connectSiteWebGa4={connectSiteWebGa4}
            canConnectSiteWebGoogle={canConnectSiteWebGoogle}
            siteWebGa4Notice={siteWebGa4Notice}
            siteWebGscConnected={siteWebGscConnected}
            siteWebGscProperty={siteWebGscProperty}
            disconnectSiteWebGsc={disconnectSiteWebGsc}
            connectSiteWebGsc={connectSiteWebGsc}
            siteWebGscNotice={siteWebGscNotice}
            siteWebActusLayout={siteWebActusLayout}
            setSiteWebActusLayout={setSiteWebActusLayout}
            siteWebActusLimit={siteWebActusLimit}
            setSiteWebActusLimit={setSiteWebActusLimit}
            siteWebActusFont={siteWebActusFont}
            setSiteWebActusFont={setSiteWebActusFont}
            siteWebActusTheme={siteWebActusTheme}
            setSiteWebActusTheme={setSiteWebActusTheme}
            siteWebSavedUrl={siteWebSavedUrl}
            widgetTokenSiteWeb={widgetTokenSiteWeb}
            showSiteWebWidgetCode={showSiteWebWidgetCode}
            setShowSiteWebWidgetCode={setShowSiteWebWidgetCode}
            siteWebSettingsError={siteWebSettingsError}
            resetSiteWebAll={resetSiteWebAll}
          />
        )}

              {/* ✅ AJOUT : callbacks pour mise à jour immédiate de la pastille */}
        
{panel === "instagram" && (
          <InstagramPanel
            instagramConnected={instagramConnected}
            instagramAccountConnected={instagramAccountConnected}
            instagramUsername={instagramUsername}
            connectInstagramAccount={connectInstagramAccount}
            connectInstagramBusinessAccount={connectInstagramBusinessAccount}
            disconnectInstagramAccount={disconnectInstagramAccount}
            igAccountsLoading={igAccountsLoading}
            loadInstagramAccounts={loadInstagramAccounts}
            igSelectedPageId={igSelectedPageId}
            setIgSelectedPageId={setIgSelectedPageId}
            igAccounts={igAccounts}
            saveInstagramProfile={saveInstagramProfile}
            igAccountsError={igAccountsError}
            instagramUrl={instagramUrl}
            instagramUrlNotice={instagramUrlNotice}
            instagramUrlError={instagramUrlError}
            disconnectInstagramProfile={disconnectInstagramProfile}
          />
        )}



{panel === "linkedin" && (
          <LinkedinPanel
            linkedinConnected={linkedinConnected}
            linkedinAccountConnected={linkedinAccountConnected}
            linkedinDisplayName={linkedinDisplayName}
            connectLinkedinAccount={connectLinkedinAccount}
            disconnectLinkedinAccount={disconnectLinkedinAccount}
            linkedinUrl={linkedinUrl}
            setLinkedinUrl={setLinkedinUrl}
            saveLinkedinProfileUrl={saveLinkedinProfileUrl}
            linkedinUrlNotice={linkedinUrlNotice}
            linkedinUrlError={linkedinUrlError}
            setLinkedinUrlNotice={setLinkedinUrlNotice}
          />
        )}



{panel === "gmb" && (
          <GoogleBusinessPanel
            gmbConnected={gmbConnected}
            gmbAccountConnected={gmbAccountConnected}
            gmbAccountEmail={gmbAccountEmail}
            connectGmbAccount={connectGmbAccount}
            disconnectGmbAccount={disconnectGmbAccount}
            gmbConfigured={gmbConfigured}
            gmbAccountName={gmbAccountName}
            gmbAccounts={gmbAccounts}
            gmbLoadingList={gmbLoadingList}
            loadGmbAccountsAndLocations={loadGmbAccountsAndLocations}
            gmbLocationName={gmbLocationName}
            gmbLocationLabel={gmbLocationLabel}
            setGmbLocationName={setGmbLocationName}
            gmbLocations={gmbLocations}
            saveGmbLocation={saveGmbLocation}
            gmbListError={gmbListError}
            gmbUrl={gmbUrl}
            gmbUrlNotice={gmbUrlNotice}
            gmbUrlError={gmbUrlError}
            disconnectGmbBusiness={disconnectGmbBusiness}
          />
        )}



        {panel === "facebook" && (
          <FacebookPanel
            facebookPageConnected={facebookPageConnected}
            facebookAccountConnected={facebookAccountConnected}
            facebookAccountEmail={facebookAccountEmail}
            connectFacebookAccount={connectFacebookAccount}
            connectFacebookBusinessAccount={connectFacebookBusinessAccount}
            disconnectFacebookAccount={disconnectFacebookAccount}
            fbPagesLoading={fbPagesLoading}
            loadFacebookPages={loadFacebookPages}
            fbSelectedPageId={fbSelectedPageId}
            fbSelectedPageName={fbSelectedPageName}
            setFbSelectedPageId={setFbSelectedPageId}
            fbPages={fbPages}
            saveFacebookPage={saveFacebookPage}
            fbPagesError={fbPagesError}
            facebookUrl={facebookUrl}
            facebookUrlNotice={facebookUrlNotice}
            facebookUrlError={facebookUrlError}
            disconnectFacebookPage={disconnectFacebookPage}
          />
        )}



      </SettingsDrawer>

      {/* ✅ Bulles d'aide globales (toujours au-dessus grâce à HelpModal) */}
      <HelpModal open={helpGeneratorOpen} title="Générateur iNrCy" onClose={() => setHelpGeneratorOpen(false)}>
        <p style={{ marginTop: 0 }}>
          Le Générateur iNrCy est le moteur de votre activité. Il connecte vos canaux pour capter des prospects et générer des
          opportunités.
        </p>
        <ol style={{ margin: 0, paddingLeft: 18 }}>
          <li>Connectez vos canaux</li>
          <li>Activez des actions (Booster / Fidéliser)</li>
          <li>Suivez vos opportunités et vos contacts</li>
        </ol>
      </HelpModal>

      <HelpModal open={helpCanauxOpen} title="Canaux" onClose={() => setHelpCanauxOpen(false)}>
        <p style={{ marginTop: 0 }}>
          Connectez chaque canal pour créer une synergie entre tous vos outils de communication et capter davantage de prospects
          et de clients.
        </p>
        <p style={{ marginBottom: 0 }}>
          Pour connecter un canal : ouvrez le panneau <strong>Configurer</strong>, cliquez sur les boutons indiqués, puis suivez les étapes
          demandées.
        </p>
      </HelpModal>

      <HelpModal open={helpSiteInrcyOpen} title="Site iNrCy" onClose={() => setHelpSiteInrcyOpen(false)}>
        <p style={{ marginTop: 0 }}>
          La bulle <strong>Site iNrCy</strong> est accessible uniquement si vous êtes détenteur d'un site internet chez nous.
        </p>
        <p>
          Si c'est le cas, nous nous occupons directement de la performance du site et vous pouvez activer et désactiver le suivi des résultats. Vos publications via l'outil Booster remontent automatiquement sur le site en page d'accueil.
        </p>
              </HelpModal>

      <HelpModal open={helpSiteWebOpen} title="Site web" onClose={() => setHelpSiteWebOpen(false)}>
        <p style={{ marginTop: 0 }}>
          La bulle <strong>Site web</strong> correspond à votre site existant. Une fois relié, il devient un canal supplémentaire dans votre générateur
          iNrCy.
        </p>
        <p>
          Cette connexion permet de centraliser vos informations et de vérifier que votre site travaille bien avec vos autres outils.
        </p>
        <ol style={{ margin: 0, paddingLeft: 18 }}>
          <li>Ajoutez l&apos;URL de votre site web.</li>
          <li>Cliquez sur les boutons de connexion pour relier automatiquement Google Analytics et Search Console pour remonter les statistiques. Ces outils doivent évidemment être enregistrés sur votre compte Google.</li>
          <li>Ajouter le code du "widget iNrCy" fourni n'importe où sur votre site internet pour que les publications de l'outil Booster arrivent automatiquement dessus.</li>
        </ol>
      </HelpModal>

      <HelpModal open={helpInertieOpen} title="Mon inertie — Tableau des gains UI" onClose={() => setHelpInertieOpen(false)}>
        <p style={{ marginTop: 0 }}>
          Voici les actions qui rapportent des <strong>UI</strong> (Unités d’Inertie).
        </p>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "10px 10px", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>Action</th>
                <th style={{ textAlign: "left", padding: "10px 10px", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>Gain</th>
                <th style={{ textAlign: "left", padding: "10px 10px", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>Fréquence</th>
              </tr>
            </thead>
            <tbody>
              {[
                { a: "Ouverture du compte", g: "+50 UI", f: "1 fois" },
                { a: "Compléter Mon profil", g: "+100 UI", f: "1 fois" },
                { a: "Compléter Mon activité", g: "+100 UI", f: "1 fois" },
                { a: "Créer une actu", g: "+10 UI", f: "1 fois / semaine" },
                { a: "Utiliser Booster / Fidéliser", g: "+10 UI", f: "1 fois / semaine" },
                { a: "Ancienneté", g: "+50 UI", f: "1re fois au 30e jour, puis tous les 30 jours" },
              ].map((r) => (
                <tr key={r.a}>
                  <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{r.a}</td>
                  <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{r.g}</td>
                  <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{r.f}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={{ marginBottom: 0, marginTop: 12, opacity: 0.9 }}>
          Le Turbo UI multiplie certaines actions selon vos canaux connectés. Tout est visible dans l’Historique de Mon inertie.
        </p>
      </HelpModal>

      <footer className={styles.footer}>
        <div className={styles.footerLeft}>© 2026 iNrCy</div>
      </footer>
    </main>
  );
}

