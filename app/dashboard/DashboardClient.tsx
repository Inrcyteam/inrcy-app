"use client";

import styles from "./dashboard.module.css";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useCallback, type TouchEvent as ReactTouchEvent } from "react";
import Link from "next/link";
import SettingsDrawer from "./SettingsDrawer";
import ProfilContent from "./settings/_components/ProfilContent";
import AccountContent from "./settings/_components/AccountContent";
import ActivityContent from "./settings/_components/ActivityContent";
import AbonnementContent from "./settings/_components/AbonnementContent";
import ContactContent from "./settings/_components/ContactContent";
import MailsSettingsContent from "./settings/_components/MailsSettingsContent";
import LegalContent from "./settings/_components/LegalContent";


// ✅ IMPORTANT : même client que ta page login
import { createClient } from "@/lib/supabaseClient";

type ModuleStatus = "connected" | "available" | "coming";
type Accent = "cyan" | "purple" | "pink" | "orange";
type Ownership = "none" | "rented" | "sold";

type GoogleProduct = "ga4" | "gsc";
type GoogleSource = "site_inrcy" | "site_web";

type ModuleAction = {
  key: string;
  label: string;
  variant: "view" | "connect" | "danger";
  href?: string; // si action "voir"
  onClick?: () => void; // si action "connecter" (plus tard)
  disabled?: boolean;
};

type Module = {
  key: string;
  name: string;
  description: string;
  status: ModuleStatus;
  accent: Accent;
  actions: ModuleAction[];
};

function statusLabel(s: ModuleStatus) {
  if (s === "connected") return "Connecté";
  if (s === "available") return "À connecter";
  return "Bientôt";
}

function statusClass(s: ModuleStatus) {
  if (s === "connected") return styles.badgeOk;
  if (s === "available") return styles.badgeWarn;
  return styles.badgeSoon;
}

function SaveIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7 3h10l3 3v15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M7 3v6h10V3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9 21v-8h6v8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}


const MODULE_ICONS: Record<string, { src: string; alt: string }> = {
  site_inrcy: { src: "/icons/inrcy.png", alt: "iNrCy" },
  site_web: { src: "/icons/site-web.jpg", alt: "Site web" },
  facebook: { src: "/icons/facebook.png", alt: "Facebook" },
  gmb: { src: "/icons/google.jpg", alt: "Google Business" },
  instagram: { src: "/icons/instagram.jpg", alt: "Instagram" },
  linkedin: { src: "/icons/linkedin.png", alt: "LinkedIn" },
};

// ✅ Tes 6 blocs avec tes actions (Voir + Connecter…)
const fluxModules: Module[] = [
  {
    key: "site_inrcy",
    name: "Site iNrCy",
    description: "Votre machine à leads ⚡",
    status: "available",
    accent: "purple",
    actions: [
      { key: "view", label: "Voir le site", variant: "view", href: "#" },
      { key: "ga4", label: "Connecter Analytics", variant: "connect", onClick: () => {} },
      { key: "gsc", label: "Connecter Search Console", variant: "connect", onClick: () => {} },
    ],
  },
  {
    key: "site_web",
    name: "Site web",
    description: "Convertit vos visiteurs 💡",
    status: "available",
    accent: "pink",
    actions: [
      { key: "view", label: "Voir le site", variant: "view", href: "#" },
      { key: "ga4", label: "Connecter Analytics", variant: "connect", onClick: () => {} },
      { key: "gsc", label: "Connecter Search Console", variant: "connect", onClick: () => {} },
    ],
  },
  {
    key: "gmb",
    name: "Google Business",
    description: "Augmente les appels 📞",
    status: "available",
    accent: "orange",
    actions: [
      { key: "view", label: "Voir la page", variant: "view", href: "#" },
      { key: "connect", label: "Connecter Google", variant: "connect", onClick: () => {} },
    ],
  },
  {
    key: "facebook",
    name: "Facebook",
    description: "Crée de la demande 📈",
    status: "available",
    accent: "cyan",
    actions: [
      { key: "view", label: "Voir le compte", variant: "view", href: "#" },
      { key: "connect", label: "Connecter Facebook", variant: "connect", onClick: () => {} },
    ],
  },
  {
  key: "instagram",
  name: "Instagram",
  description: "Développe votre marque 📸",
  status: "available",
  accent: "pink",
  actions: [
    { key: "view", label: "Voir le compte", variant: "view", href: "#" },
    { key: "connect", label: "Connecter Instagram", variant: "connect", onClick: () => {} },
  ],
},
{
  key: "linkedin",
  name: "LinkedIn",
  description: "Crédibilise votre expertise 💼",
  status: "available",
  accent: "cyan",
  actions: [
    { key: "view", label: "Voir le compte", variant: "view", href: "#" },
    { key: "connect", label: "Connecter LinkedIn", variant: "connect", onClick: () => {} },
  ],
},

];

const adminModules: Array<{
  key: string;
  name: string;
  description: string;
  status: ModuleStatus;
  accent: Accent;
}> = [
  { key: "mails", name: "Mails", description: "Relances, notifications, nurturing.", status: "available", accent: "purple" },
  { key: "stats", name: "Stats", description: "ROI, performance et suivi des canaux.", status: "available", accent: "cyan" },
  { key: "agenda", name: "Interventions", description: "Planning d'interventions + agenda classique", status: "available", accent: "purple" },
  { key: "crm", name: "CRM", description: "Fichier clients et propects", status: "available", accent: "cyan" },
];

const quickActions: Array<{ key: string; title: string; sub: string; disabled?: boolean; accent: Accent }> = [
  { key: "facturer", title: "Facturer", sub: "Factures & paiements", disabled: false, accent: "orange" },
  { key: "devis", title: "Faire devis", sub: "Devis en 30 sec", disabled: false, accent: "pink" },
  { key: "booster", title: "Booster", sub: "Visibilité & communication", disabled: false, accent: "purple" },
  { key: "fideliser", title: "Fidéliser", sub: "Informations & suivi client", disabled: false, accent: "cyan" },
];

export default function DashboardClient() {
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
  }, []);

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
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Erreur déconnexion:", error.message);
      return;
    }
    router.replace("/login");
    router.refresh();
  };

  // ✅ Menu utilisateur (desktop)
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

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
// ✅ Site iNrCy (ownership + url + config)
const [siteInrcyOwnership, setSiteInrcyOwnership] = useState<Ownership>("none");
const [siteInrcyUrl, setSiteInrcyUrl] = useState<string>("");
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
  const [linkedinUrlNotice, setLinkedinUrlNotice] = useState<string | null>(null);
  const [gmbUrlNotice, setGmbUrlNotice] = useState<string | null>(null);
  const [facebookUrlNotice, setFacebookUrlNotice] = useState<string | null>(null);

  // ✅ Tokens widget actus (signés + liés au domaine, anti-copie)
  const [widgetTokenInrcySite, setWidgetTokenInrcySite] = useState<string>("");
  const [widgetTokenSiteWeb, setWidgetTokenSiteWeb] = useState<string>("");

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

// OAuth credentials must be stored server-side (env vars), not in the UI.


  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });
  }, []);

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
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  if (!user) return;

  // 1) Profile (source de vérité pour ownership)
  const profileRes = await supabase
    .from("profiles")
    .select("inrcy_site_ownership,inrcy_site_url")
    .eq("user_id", user.id)
    .maybeSingle();

  const profile = profileRes.data as any | null;
  const ownership = (profile?.inrcy_site_ownership ?? "none") as Ownership;
  setSiteInrcyOwnership(ownership);

  // 2) Lecture configs (nouveaux schémas)
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

  const inrcyCfg = (inrcyRes.data as any | null) ?? null;
  const proCfg = (proRes.data as any | null) ?? null;
  const legacyCfg = null;

  // URL iNrCy : profile > inrcy table
  const url = (profile?.inrcy_site_url ?? inrcyCfg?.site_url ?? "") as string;
  setSiteInrcyUrl(url);

  // Contact email iNrCy : inrcy table
  const email = (inrcyCfg?.contact_email ?? "") as string;
  setSiteInrcyContactEmail(email);

  // Settings iNrCy : inrcy table
  const inrcySettingsObj = inrcyCfg?.settings ?? {};
  try {
    setSiteInrcySettingsText(JSON.stringify(inrcySettingsObj, null, 2));
  } catch {
    setSiteInrcySettingsText("{}");
  }
  setSiteInrcySettingsError(null);
  setGa4MeasurementId((inrcySettingsObj as any)?.ga4?.measurement_id ?? "");
  setGa4PropertyId(String((inrcySettingsObj as any)?.ga4?.property_id ?? ""));
  setGscProperty((inrcySettingsObj as any)?.gsc?.property ?? "");

  // Settings pro : pro_tools_configs > legacy.settings
type SettingsRow = { settings?: any | null } | null;  
const proSettingsObj =
  (proCfg as SettingsRow)?.settings ?? (legacyCfg as SettingsRow)?.settings ?? {};

  // ✅ Site web (stocké dans pro_tools_configs.settings.site_web)
  const siteWebObj = (proSettingsObj as any)?.site_web ?? {};
  try {
    setSiteWebSettingsText(JSON.stringify(siteWebObj, null, 2));
  } catch {
    setSiteWebSettingsText("{}");
  }
  setSiteWebSettingsError(null);
  setSiteWebUrl((siteWebObj as any)?.url ?? "");
  setSiteWebGa4MeasurementId((siteWebObj as any)?.ga4?.measurement_id ?? "");
  setSiteWebGa4PropertyId(String((siteWebObj as any)?.ga4?.property_id ?? ""));
  setSiteWebGscProperty((siteWebObj as any)?.gsc?.property ?? "");

  // ✅ Instagram & LinkedIn (pro_tools_configs.settings.instagram / linkedin)
  const igObj = (((proSettingsObj as any)?.instagram ?? {}) as any);
  setInstagramUrl(igObj?.url ?? "");
  setInstagramAccountConnected(!!igObj?.accountConnected);
  setInstagramConnected(!!igObj?.connected);
  setInstagramUsername(String(igObj?.username ?? ""));

  const liObj = (((proSettingsObj as any)?.linkedin ?? {}) as any);
  setLinkedinUrl(liObj?.url ?? "");
  setLinkedinAccountConnected(!!liObj?.accountConnected);
  setLinkedinConnected(!!liObj?.connected);
  setLinkedinDisplayName(String(liObj?.displayName ?? ""));

  // ✅ Google Business & Facebook (pro_tools_configs.settings.gmb / facebook)
  const gmbObj = ((proSettingsObj as any)?.gmb ?? {}) as any;
  setGmbUrl(gmbObj?.url ?? "");
  const _gmbAccountConnected = !!gmbObj?.connected;
  const _gmbConfigured = !!gmbObj?.resource_id;
  setGmbAccountConnected(_gmbAccountConnected);
  setGmbConfigured(_gmbConfigured);
  setGmbConnected(_gmbAccountConnected && _gmbConfigured);
  setGmbAccountEmail(gmbObj?.accountEmail ?? "");

  const fbObj = ((proSettingsObj as any)?.facebook ?? {}) as any;
  setFacebookUrl(fbObj?.url ?? "");
	  setFacebookAccountConnected(!!fbObj?.accountConnected);
	  setFacebookPageConnected(!!fbObj?.pageConnected);
	  setFacebookAccountEmail(fbObj?.userEmail ?? "");
  // Also keep the selected page id if present in mirrored settings.
  setFbSelectedPageId(fbObj?.pageId ?? "");
	  setFbSelectedPageName(fbObj?.pageName ?? "");

  // ✅ Connexions Google : la source de vérité est integrations
  const [inrcyGa4, inrcyGsc, webGa4, webGsc] = await Promise.all([
    fetchGoogleConnected("site_inrcy", "ga4"),
    fetchGoogleConnected("site_inrcy", "gsc"),
    fetchGoogleConnected("site_web", "ga4"),
    fetchGoogleConnected("site_web", "gsc"),
  ]);
  setSiteInrcyGa4Connected(inrcyGa4);
  setSiteInrcyGscConnected(inrcyGsc);
  setSiteWebGa4Connected(webGa4);
  setSiteWebGscConnected(webGsc);

  // ✅ Connexions Google Business & Facebook : source de vérité = integrations
  try {
    const [gmbStatus, fbStatus, igStatus, liStatus] = await Promise.all([
      fetch("/api/integrations/google-business/status").then((r) => r.json()).catch(() => ({ connected: false })),
      fetch("/api/integrations/facebook/status").then((r) => r.json()).catch(() => ({ connected: false })),
      fetch("/api/integrations/instagram/status").then((r) => r.json()).catch(() => ({ connected: false })),
      fetch("/api/integrations/linkedin/status").then((r) => r.json()).catch(() => ({ connected: false })),
    ]);
    setGmbConnected(!!gmbStatus?.connected); // true only when a location is selected
    setGmbAccountConnected(!!gmbStatus?.accountConnected);
    setGmbConfigured(!!gmbStatus?.configured);
    if (gmbStatus?.email) setGmbAccountEmail(String(gmbStatus.email));

    setFacebookAccountConnected(!!fbStatus?.accountConnected);
    setFacebookPageConnected(!!fbStatus?.pageConnected);
    if (fbStatus?.user_email) setFacebookAccountEmail(String(fbStatus.user_email));
    if (fbStatus?.resource_id) setFbSelectedPageId(String(fbStatus.resource_id));
    if (fbStatus?.resource_label) setFbSelectedPageName(String(fbStatus.resource_label));
    if (fbStatus?.page_url) setFacebookUrl(String(fbStatus.page_url));

    setInstagramAccountConnected(!!igStatus?.accountConnected);
    setInstagramConnected(!!igStatus?.connected);
    if (igStatus?.username) setInstagramUsername(String(igStatus.username));
    if (igStatus?.profile_url) setInstagramUrl(String(igStatus.profile_url));

    setLinkedinAccountConnected(!!liStatus?.accountConnected);
    setLinkedinConnected(!!liStatus?.connected);
    if (liStatus?.display_name) setLinkedinDisplayName(String(liStatus.display_name));
    if (liStatus?.profile_url) setLinkedinUrl(String(liStatus.profile_url));
  } catch {
    // fallback : on garde l'état stocké dans settings si l'appel échoue
  }
}, [fetchGoogleConnected]);

useEffect(() => {
  loadSiteInrcy();
}, [loadSiteInrcy]);

const canViewSite = siteInrcyOwnership !== "none" && !!siteInrcyUrl;
const canConfigureSite = siteInrcyOwnership === "sold";
// En mode rented : le pro ne configure pas, mais peut déclencher l'activation du suivi (auto)
const canActivateInrcyTracking = siteInrcyOwnership === "rented" && !!siteInrcyUrl?.trim();

// ✅ UX : on grise les boutons de connexion tant que l'URL n'est pas renseignée
const hasSiteInrcyUrl = !!siteInrcyUrl?.trim();
const hasSiteWebUrl = !!siteWebUrl?.trim();
const canConnectSiteInrcyGoogle = canConfigureSite && hasSiteInrcyUrl;
const canConnectSiteWebGoogle = hasSiteWebUrl;

const siteInrcyAllGreen = siteInrcyOwnership !== "none" && !!siteInrcyUrl?.trim() && siteInrcyGa4Connected && siteInrcyGscConnected;
const siteWebAllGreen = !!siteWebUrl?.trim() && siteWebGa4Connected && siteWebGscConnected;

const ConnectionPill = ({ connected }: { connected: boolean }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(15,23,42,0.65)",
                      colorScheme: "dark",
      padding: "6px 10px",
      borderRadius: 999,
      color: "rgba(255,255,255,0.92)",
      fontSize: 12,
      whiteSpace: "nowrap",
    }}
  >
    <span
      aria-hidden
      style={{
        width: 8,
        height: 8,
        borderRadius: 999,
        background: connected ? "rgba(34,197,94,0.95)" : "rgba(59,130,246,0.95)",
      }}
    />
    <strong>{connected ? "Connecté" : "À connecter"}</strong>
  </span>
);

const saveSiteInrcySettings = useCallback(async () => {
  if (siteInrcyOwnership !== "sold") return;

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
    setSiteInrcySettingsError(error.message);
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
    setSiteInrcySettingsError(error.message);
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
    setSiteInrcySettingsError(error.message);
    return;
  }

  setSiteInrcySettingsText(JSON.stringify(parsed, null, 2));
  setSiteInrcyGscNotice("✅ Enregistrement Search Console validé");
  window.setTimeout(() => setSiteInrcyGscNotice(null), 2500);

  setSiteInrcySettingsError(null);
}, [gscProperty, siteInrcySettingsText]);




const connectSiteInrcyGa4 = useCallback(() => {
  if (siteInrcyOwnership !== "sold") {
    setSiteInrcySettingsError("Connexion Google Analytics indisponible : mode rented ou aucun site iNrCy.");
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
    force: "1",
    siteUrl,
  });
  // L'OAuth stats est séparé de l'OAuth Gmail (mails).
  window.location.href = `/api/integrations/google-stats/start?${qp.toString()}`;
}, [siteInrcyOwnership, siteInrcyUrl]);

const connectSiteInrcyGsc = useCallback(() => {
  if (siteInrcyOwnership !== "sold") {
    setSiteInrcySettingsError("Connexion Search Console indisponible : mode rented ou aucun site iNrCy.");
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
    force: "1",
    siteUrl,
  });
  window.location.href = `/api/integrations/google-stats/start?${qp.toString()}`;
}, [siteInrcyOwnership, siteInrcyUrl]);

// ✅ Mode rented : déclenche une activation "serveur" (sans saisie d'IDs)
// - Si un token Google existe déjà côté Supabase, l'API résout GA4 + GSC via le domaine et remplit les settings.
// - Sinon, on bascule sur le flow OAuth "activate".
const refreshKpis = useCallback(async () => {
    setKpisLoading(true);
    try {
      const res = await fetch("/api/generator/kpis", { cache: "no-store" });
      if (!res.ok) throw new Error(`KPIs fetch failed: ${res.status}`);
      const json = await res.json();
      setKpis(json);
    } catch (err) {
      console.error(err);
      setKpis(null);
    } finally {
      setKpisLoading(false);
    }
  }, []);

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
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => {
        if (disposed) return;
        void loadSiteInrcy();
        void refreshKpis();
      }, 350);
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
      try {
        supabase.removeChannel(ch);
      } catch {}
    };
  }, [loadSiteInrcy, refreshKpis]);

const activateSiteInrcyTracking = useCallback(async () => {
  if (siteInrcyOwnership !== "rented") {
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
    setSiteInrcySettingsError("Impossible de joindre le serveur.");
    return;
  }

  const data = await res.json().catch(() => ({} as any));

  // En mode rented, l'activation doit être 100% silencieuse côté client.
  // Si le token admin iNrCy n'est pas configuré, on affiche une erreur explicite.
  if (!res.ok) {
    setSiteInrcyTrackingBusy(false);
    setSiteInrcySettingsError((data as any)?.error || `Erreur d'activation (${res.status}).`);
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
  void refreshKpis();
}, [siteInrcyOwnership, siteInrcyUrl, refreshKpis]);

// ✅ Mode rented : désactive le suivi (GA4+GSC) et nettoie les settings.
const deactivateSiteInrcyTracking = useCallback(async () => {
  if (siteInrcyOwnership !== "rented") {
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
    setSiteInrcySettingsError("Impossible de joindre le serveur.");
    return;
  }

  const data = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    setSiteInrcyTrackingBusy(false);
    setSiteInrcySettingsError((data as any)?.error || `Erreur de désactivation (${res.status}).`);
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
  void refreshKpis();
}, [siteInrcyOwnership, refreshKpis]);


const disconnectGoogleStats = useCallback(
  async (source: "site_inrcy" | "site_web", product: "ga4" | "gsc") => {
    // L'API /api/integrations/google-stats/disconnect est en POST.
    // Avant, on naviguait en GET (window.location.href), ce qui rendait le bouton inactif (405).
    const res = await fetch("/api/integrations/google-stats/disconnect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source, product }),
    }).catch(() => null);

    if (!res || !res.ok) {
      const msg = !res
        ? "Impossible de joindre le serveur."
        : `Erreur de déconnexion (${res.status}).`;
      if (source === "site_inrcy") setSiteInrcySettingsError(msg);
      else setSiteWebSettingsError(msg);
      return;
    }

    // Petites confirmations UX
    if (source === "site_inrcy") {
      setSiteInrcySettingsError(null);
      if (product === "ga4") setSiteInrcyGa4Connected(false);
      else setSiteInrcyGscConnected(false);
      if (product === "ga4") setSiteInrcyGa4Notice("Google Analytics déconnecté.");
      else setSiteInrcyGscNotice("Search Console déconnecté.");
    } else {
      setSiteWebSettingsError(null);
      if (product === "ga4") setSiteWebGa4Connected(false);
      else setSiteWebGscConnected(false);
      if (product === "ga4") setSiteWebGa4Notice("Google Analytics déconnecté.");
      else setSiteWebGscNotice("Search Console déconnecté.");
    }
  },
  []
);

const disconnectSiteInrcyGa4 = useCallback(() => {
  // En mode "rented" : la config iNrCy est grisée (OK), mais on garde le message explicite ici.
  if (siteInrcyOwnership !== "sold") {
    setSiteInrcySettingsError("Déconnexion Google Analytics indisponible : mode rented ou aucun site iNrCy.");
    return;
  }
  void disconnectGoogleStats("site_inrcy", "ga4");
}, [disconnectGoogleStats, siteInrcyOwnership]);

const disconnectSiteInrcyGsc = useCallback(() => {
  if (siteInrcyOwnership !== "sold") {
    setSiteInrcySettingsError("Déconnexion Search Console indisponible : mode rented ou aucun site iNrCy.");
    return;
  }
  void disconnectGoogleStats("site_inrcy", "gsc");
}, [disconnectGoogleStats, siteInrcyOwnership]);

// ✅ Enregistrer le lien du site iNrCy (inrcy_site_configs.site_url)
const saveSiteInrcyUrl = useCallback(async () => {
  if (siteInrcyOwnership === "none") return;
  const url = siteInrcyUrl.trim();

  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  if (!user) return;

  const { error } = await supabase
    .from("inrcy_site_configs")
    .upsert({ user_id: user.id, site_url: url }, { onConflict: "user_id" });

  if (error) {
    setSiteInrcySettingsError(error.message);
    return;
  }

  setSiteInrcySettingsError(null);
  setSiteInrcyUrlNotice("✅ Lien du site enregistré");
  window.setTimeout(() => setSiteInrcyUrlNotice(null), 2500);
}, [siteInrcyOwnership, siteInrcyUrl]);

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
      setSiteWebSettingsError(readErr.message);
      return;
    }

    const current = (row as any)?.settings ?? {};
    const merged = { ...(current ?? {}), site_web: nextSiteWeb ?? {} };

    const { error } = await supabase.from("pro_tools_configs").upsert({ user_id: user.id, settings: merged }, { onConflict: "user_id" });
    if (error) {
      setSiteWebSettingsError(error.message);
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

// ✅ Enregistrer uniquement le lien du site web (settings.site_web.url)
const saveSiteWebUrl = useCallback(async () => {
  let parsed: any;
  try {
    parsed = siteWebSettingsText?.trim() ? JSON.parse(siteWebSettingsText) : {};
  } catch {
    setSiteWebSettingsError("JSON invalide. Vérifie la syntaxe (guillemets, virgules, accolades…)." );
    return;
  }

  const url = siteWebUrl.trim();
  parsed.url = url;

  // Store a normalized domain to make the public widget lookup fast.
  // (Used by /api/widgets/actus?domain=...)
  try {
    const withProto = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const host = new URL(withProto).hostname.toLowerCase().replace(/^www\./, "");
    parsed.domain = host;
  } catch {
    // ignore parse errors – url may be partial while typing
  }

  await updateSiteWebSettings(parsed);
  setSiteWebUrlNotice("✅ Lien du site enregistré");
  window.setTimeout(() => setSiteWebUrlNotice(null), 2500);
}, [siteWebSettingsText, siteWebUrl, updateSiteWebSettings]);

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

const resetSiteInrcyAll = useCallback(async () => {
  if (!confirm("Réinitialiser la configuration (lien + GA4 + Search Console) ?")) return;
  if (siteInrcyOwnership === "none") return;

  await resetGoogleStats("site_inrcy");

  // Clear url in DB
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  if (user) {
    await supabase.from("inrcy_site_configs").upsert({ user_id: user.id, site_url: "" }, { onConflict: "user_id" });
  }

  setSiteInrcyUrl("");
  setGa4MeasurementId("");
  setGa4PropertyId("");
  setGscProperty("");
  setSiteInrcyGa4Connected(false);
  setSiteInrcyGscConnected(false);
}, [resetGoogleStats, siteInrcyOwnership]);

const resetSiteWebAll = useCallback(async () => {
  if (!confirm("Réinitialiser la configuration (lien + GA4 + Search Console) ?")) return;

  await resetGoogleStats("site_web");

  // Clear settings.site_web
  await updateSiteWebSettings({});

  setSiteWebUrl("");
  setSiteWebGa4MeasurementId("");
  setSiteWebGa4PropertyId("");
  setSiteWebGscProperty("");
  setSiteWebGa4Connected(false);
  setSiteWebGscConnected(false);
}, [resetGoogleStats, updateSiteWebSettings]);

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
  await updateRootSettingsKey("gmb", { url: "", connected: false, accountEmail: "", resource_id: "" });
}, [updateRootSettingsKey]);

const disconnectGmbBusiness = useCallback(async () => {
  // Disconnect Google Business ONLY (keeps Google account connected)
  await fetch("/api/integrations/google-business/disconnect-location", { method: "POST" });
  setGmbConfigured(false);
  setGmbUrl("");
  await updateRootSettingsKey("gmb", { url: "", resource_id: "" });
}, [updateRootSettingsKey]);


  // Facebook pages (selection)
  const [fbPages, setFbPages] = useState<Array<{ id: string; name?: string; access_token?: string }>>([]);
  const [fbPagesLoading, setFbPagesLoading] = useState(false);
  const [fbSelectedPageId, setFbSelectedPageId] = useState<string>("");
  const [fbSelectedPageName, setFbSelectedPageName] = useState<string>("");
  const [fbPagesError, setFbPagesError] = useState<string | null>(null);

// Instagram accounts (selection via Facebook pages that have an IG Business account)
const [igAccounts, setIgAccounts] = useState<Array<{ page_id: string; page_name?: string; ig_id: string; username?: string; page_access_token?: string }>>([]);
const [igAccountsLoading, setIgAccountsLoading] = useState(false);
const [igSelectedPageId, setIgSelectedPageId] = useState<string>("");
const [igAccountsError, setIgAccountsError] = useState<string | null>(null);



  // Google Business locations (selection)
  const [gmbAccounts, setGmbAccounts] = useState<Array<{ name: string; accountName?: string; type?: string }>>([]);
  const [gmbLocations, setGmbLocations] = useState<Array<{ name: string; title?: string }>>([]);
  const [gmbAccountName, setGmbAccountName] = useState<string>("");
  const [gmbLocationName, setGmbLocationName] = useState<string>("");
  const [gmbLoadingList, setGmbLoadingList] = useState(false);
  const [gmbListError, setGmbListError] = useState<string | null>(null);
const connectFacebookAccount = useCallback(async () => {
  const returnTo = encodeURIComponent("/dashboard?panel=facebook");
  window.location.href = `/api/integrations/facebook/start?returnTo=${returnTo}`;
}, []);

const disconnectFacebookAccount = useCallback(async () => {
	  await fetch("/api/integrations/facebook/disconnect-account", { method: "POST" });
	  setFacebookAccountConnected(false);
	  setFacebookPageConnected(false);
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
}, [updateRootSettingsKey]);

const disconnectFacebookPage = useCallback(async () => {
	  await fetch("/api/integrations/facebook/disconnect-page", { method: "POST" });
	  setFacebookPageConnected(false);
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
}, [updateRootSettingsKey]);
const loadFacebookPages = useCallback(async () => {
	  if (!facebookAccountConnected) return;
  setFbPagesLoading(true);
  setFbPagesError(null);
  try {
    const r = await fetch("/api/integrations/facebook/pages", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || "Erreur");
    setFbPages(j.pages || []);
    // Preselect first if none
    if (!fbSelectedPageId && j.pages?.[0]?.id) setFbSelectedPageId(j.pages[0].id);

    // If there is exactly one page, auto-select & save it server-side (no extra "Enregistrer").
    if ((j.pages || []).length === 1) {
      const only = j.pages[0];
      if (only?.id && only?.access_token) {
        await fetch("/api/integrations/facebook/select-page", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pageId: only.id,
            pageName: only.name || null,
            pageAccessToken: only.access_token,
          }),
        });
        setFbSelectedPageId(only.id);
        setFacebookUrl(`https://www.facebook.com/${only.id}`);
      }
    }
  } catch (e: any) {
    setFbPagesError(e?.message || "Impossible de charger vos pages Facebook.");
  } finally {
    setFbPagesLoading(false);
  }
	}, [facebookAccountConnected, fbSelectedPageId]);

const saveFacebookPage = useCallback(async () => {
  const picked = fbPages.find((p) => p.id === fbSelectedPageId);
  if (!picked?.id || !picked?.access_token) return;

  const r = await fetch("/api/integrations/facebook/select-page", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pageId: picked.id,
      pageName: picked.name || null,
      pageAccessToken: picked.access_token,
    }),
  });

  const j = await r.json().catch(() => ({}));
  if (r.ok) {
    setFacebookUrl(String(j?.pageUrl || `https://www.facebook.com/${picked.id}`));
	    setFacebookPageConnected(true);
	    setFbSelectedPageName(picked.name || "");
    setFacebookUrlNotice("Enregistré ✓");
    window.setTimeout(() => setFacebookUrlNotice(null), 2200);
  } else {
    setFacebookUrlNotice(j?.error || "Impossible d'enregistrer la page.");
    window.setTimeout(() => setFacebookUrlNotice(null), 2500);
  }

}, [fbPages, fbSelectedPageId]);

// ===== Instagram (Meta) =====
const connectInstagramAccount = useCallback(async () => {
  const returnTo = encodeURIComponent("/dashboard?panel=instagram");
  window.location.href = `/api/integrations/instagram/start?returnTo=${returnTo}`;
}, []);

const disconnectInstagramAccount = useCallback(async () => {
  await fetch("/api/integrations/instagram/disconnect-account", { method: "POST" });
  setInstagramAccountConnected(false);
  setInstagramConnected(false);
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
}, [updateRootSettingsKey]);

const disconnectInstagramProfile = useCallback(async () => {
  await fetch("/api/integrations/instagram/disconnect-profile", { method: "POST" });
  setInstagramConnected(false);
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
}, [updateRootSettingsKey]);

const loadInstagramAccounts = useCallback(async () => {
  if (!instagramAccountConnected) return;
  setIgAccountsLoading(true);
  setIgAccountsError(null);
  try {
    const r = await fetch("/api/integrations/instagram/accounts", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || "Erreur");
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
      setInstagramUrlNotice("Enregistré ✓");
      window.setTimeout(() => setInstagramUrlNotice(null), 2200);
    }
  } catch (e: any) {
    setIgAccountsError(e?.message || "Impossible de charger vos comptes Instagram.");
  } finally {
    setIgAccountsLoading(false);
  }
}, [instagramAccountConnected, igSelectedPageId]);

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
    setInstagramUrlNotice("Enregistré ✓");
    window.setTimeout(() => setInstagramUrlNotice(null), 2200);
  } else {
    setInstagramUrlNotice(j?.error || "Impossible d'enregistrer Instagram.");
    window.setTimeout(() => setInstagramUrlNotice(null), 2500);
  }
}, [igAccounts, igSelectedPageId]);

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
  await updateRootSettingsKey("linkedin", {
    accountConnected: false,
    connected: false,
    displayName: "",
    url: "",
  });
}, [updateRootSettingsKey]);


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
      setLinkedinUrlNotice("Lien LinkedIn invalide. Exemple : https://www.linkedin.com/in/ton-profil");
      window.setTimeout(() => setLinkedinUrlNotice(null), 2800);
      return;
    }
  }

  await updateRootSettingsKey("linkedin", {
    accountConnected: linkedinAccountConnected,
    connected: linkedinConnected,
    displayName: linkedinDisplayName,
    url: raw,
  });

  setLinkedinUrlNotice("Lien enregistré ✅");
  window.setTimeout(() => setLinkedinUrlNotice(null), 1800);
}, [linkedinUrl, linkedinAccountConnected, linkedinConnected, linkedinDisplayName, updateRootSettingsKey]);


const loadGmbAccountsAndLocations = useCallback(async () => {
  // Only possible once the Google account is OAuth-connected
  if (!gmbAccountConnected) return;
  setGmbLoadingList(true);
  setGmbListError(null);
  try {
    const r = await fetch(`/api/integrations/google-business/locations`, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || "Erreur");
    setGmbAccounts(j.accounts || []);
    setGmbAccountName(j.accountName || "");
    setGmbLocations(j.locations || []);
    if (j.locationsError) setGmbListError(j.locationsError);
    if (!gmbLocationName && j.locations?.[0]?.name) setGmbLocationName(j.locations[0].name);
  } catch (e: any) {
    setGmbListError(e?.message || "Impossible de charger les établissements Google Business.");
  } finally {
    setGmbLoadingList(false);
  }
}, [gmbAccountConnected, gmbLocationName]);

const saveGmbLocation = useCallback(async () => {
  if (!gmbAccountName || !gmbLocationName) return;
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

  if (js?.url) setGmbUrl(String(js.url));
  setGmbUrlNotice("Établissement enregistré ✅");
  window.setTimeout(() => setGmbUrlNotice(null), 1800);
}, [gmbAccountName, gmbLocationName, gmbLocations]);


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

}, [siteWebGa4MeasurementId, siteWebGa4PropertyId, siteWebSettingsText, siteWebUrl, updateSiteWebSettings]);

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
}, [siteWebGscProperty, siteWebSettingsText, siteWebUrl, updateSiteWebSettings]);




const connectSiteWebGa4 = useCallback(() => {
  const siteUrl = siteWebUrl.trim();
  if (!siteUrl) {
    setSiteWebSettingsError("Renseigne le lien du site avant de connecter Google Analytics.");
    return;
  }
  // ✅ UX: si les champs GA4 sont vides, on auto-résout après OAuth à partir du domaine du site.
  const qp = new URLSearchParams({
    source: "site_web",
    product: "ga4",
    force: "1",
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
  // ✅ UX: si la propriété GSC est vide, on auto-résout après OAuth à partir du domaine du site.
  const qp = new URLSearchParams({
    source: "site_web",
    product: "gsc",
    force: "1",
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
  const [profileIncomplete, setProfileIncomplete] = useState(false);
  const [activityIncomplete, setActivityIncomplete] = useState(false);


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
  "sector",
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
    .select("sector,services,intervention_zones,opening_days,opening_hours,strengths")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!business) {
    setActivityIncomplete(true);
    return;
  }

  const incomplete = REQUIRED_ACTIVITY_FIELDS.some((field) => {
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


  // ✅ KPIs Générateur (1 seul endpoint)
  const [kpisLoading, setKpisLoading] = useState(false);
  const [kpis, setKpis] = useState<null | {
    leads: { today: number; week: number; month: number };
    estimatedValue: number;
  }>(null);

  

  useEffect(() => {
    void refreshKpis();
  }, [refreshKpis]);

  const leadsToday = kpis?.leads?.today ?? 0;
  const leadsWeek = kpis?.leads?.week ?? 0;
  const leadsMonth = kpis?.leads?.month ?? 0;

  const estimatedValue = kpis?.estimatedValue ?? 0;

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
        if (siteInrcyOwnership === "none") return { status: "coming" as ModuleStatus, text: "Aucun site" };
        const hasUrl = !!siteInrcyUrl?.trim();
        const connectedCount = (hasUrl ? 1 : 0) + (siteInrcyGa4Connected ? 1 : 0) + (siteInrcyGscConnected ? 1 : 0);
        const allGreen = connectedCount === 3;
        if (!allGreen) return { status: "available" as ModuleStatus, text: `À connecter · ${connectedCount} / 3` };
        return { status: "connected" as ModuleStatus, text: "Connecté · 3 / 3" };
      }

      if (m.key === "site_web") {
        const hasUrl = !!siteWebUrl?.trim();
        const connectedCount = (hasUrl ? 1 : 0) + (siteWebGa4Connected ? 1 : 0) + (siteWebGscConnected ? 1 : 0);
        const allGreen = connectedCount === 3;
        if (!allGreen) return { status: "available" as ModuleStatus, text: `À connecter · ${connectedCount} / 3` };
        return { status: "connected" as ModuleStatus, text: "Connecté · 3 / 3" };
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

          <div className={styles.bubbleTitle}>{m.name}</div>

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
                  if (siteInrcyOwnership === "rented") {
                    if (siteInrcyAllGreen) void deactivateSiteInrcyTracking();
                    else void activateSiteInrcyTracking();
                    return;
                  }
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
                  ? siteInrcyOwnership === "rented"
                    ? siteInrcyAllGreen
                      ? siteInrcyTrackingBusy
                      : !canActivateInrcyTracking || siteInrcyTrackingBusy
                    : !canConfigureSite
                  : false
              }
              title={
                m.key === "site_inrcy"
                  ? siteInrcyOwnership === "rented"
                    ? siteInrcyAllGreen
                      ? "Désactiver (GA4 + Search Console)"
                      : !canActivateInrcyTracking
                        ? "Renseigne le lien du site pour activer le suivi"
                        : "Activer (GA4 + Search Console)"
                    : !canConfigureSite
                      ? "Configuration disponible uniquement si le site est vendu"
                      : undefined
                  : undefined
              }
            >
              {m.key === "site_inrcy" && siteInrcyOwnership === "rented"
                ? siteInrcyTrackingBusy
                  ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span className={styles.miniSpinner} aria-hidden />
                        {siteInrcyAllGreen ? "Déconnexion..." : "Connexion..."}
                      </span>
                    )
                  : siteInrcyAllGreen
                    ? "Désactiver"
                    : "Activer"
                : "Configurer"}
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
          <button type="button" className={styles.ghostBtn} onClick={() => openPanel("contact")}>
            Nous contacter
          </button>

          {/* ✅ Menu utilisateur (remplace OUT) */}
          <div className={styles.userMenuWrap} ref={userMenuRef}>
            <button
              className={styles.userBubbleBtn}
              type="button"
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              onClick={() => setUserMenuOpen((v) => !v)}
              title={userEmail ?? "Utilisateur"}
            >
              <span className={styles.userBubble} aria-hidden>
                {userFirstLetter}
              </span>
            </button>

            {/* ✅ AJOUT : mini pastille + tooltip */}
            {(profileIncomplete || activityIncomplete) && (
              <div className={styles.profileIndicatorWrap} style={{ marginLeft: 6 }}>
                <button
                  type="button"
                  className={styles.profileWarnBtn}
                  aria-label="Profil incomplet"
                  onClick={() => openPanel("profil")}
                >
                  <span className={styles.profileWarnDot} aria-hidden />
                </button>

                <div className={styles.profileTooltip} role="tooltip">
                  <div>
                    ⚠️ <strong>Profil incomplet</strong>
                    <br />
                    Complétez votre profil pour activer pleinement iNrCy.
                  </div>

                  <button
                    type="button"
                    className={styles.profileTooltipBtn}
                    onClick={() => openPanel("profil")}
                  >
                    Compléter mon profil
                  </button>
                </div>
              </div>

            )}

            {activityIncomplete && (
              <div className={styles.profileIndicatorWrap} style={{ marginLeft: 6 }}>
                <button
                  type="button"
                  className={styles.profileWarnBtn}
                  aria-label="Activité incomplète"
                  onClick={() => openPanel("activite")}
                >
                  <span className={styles.profileWarnDot} aria-hidden />
                </button>

                <div className={styles.profileTooltip} role="tooltip">
                  <div>
                    ⚠️ <strong>Activité incomplète</strong>
                    <br />
                    Complétez « Mon activité » pour générer des contenus pertinents.
                  </div>

                  <button
                    type="button"
                    className={styles.profileTooltipBtn}
                    onClick={() => openPanel("activite")}
                  >
                    Compléter mon activité
                  </button>
                </div>
              </div>
            )}

            {userMenuOpen && (
              <div className={styles.userMenuPanel} role="menu" aria-label="Menu utilisateur">
                <button
                  type="button"
                  className={styles.userMenuItem}
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false);
                    openPanel("compte");
                  }}
                >
                  Mon compte
                </button>

                <button
                  type="button"
                  className={styles.userMenuItem}
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false);
                    openPanel("profil");
                  }}
                >
                  Mon profil
                </button>

                <button
                  type="button"
                  className={styles.userMenuItem}
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false);
                    openPanel("activite");
                  }}
                >
                  Mon activité
                </button>

                <button
                  type="button"
                  className={styles.userMenuItem}
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false);
                    openPanel("abonnement");
                  }}
                >
                  Mon abonnement
                </button>

                <button
                  type="button"
                  className={styles.userMenuItem}
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false);
                    openPanel("legal");
                  }}
                >
                  Informations légales
                </button>

                <button
                  type="button"
                  className={styles.userMenuItem}
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false);
                    router.push("/dashboard/gps");
                  }}
                >
                  GPS d’utilisation
                </button>

                <div className={styles.userMenuDivider} />

                <button
                  className={`${styles.userMenuItem} ${styles.userMenuDanger}`}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false);
                    handleLogout();
                  }}
                >
                  Déconnexion
                </button>
              </div>
            )}
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
                  router.push("/dashboard/gps");
                }}
              >
                GPS d’utilisation
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
          <div className={styles.kicker}>
            <span className={styles.kickerText}>Votre cockpit iNrCy</span>
          </div>

          <h1 className={styles.title}>
            <span className={styles.titleAccent}>Le Générateur est lancé&nbsp;!</span>
          </h1>

          <p className={styles.subtitle}>
            Tous vos canaux alimentent maintenant une seule et même machine.
            <br />
            <span className={styles.signatureFlow}>
              <span>Contacts</span>
              <span className={styles.flowArrow}>→</span>
              <span>Devis</span>
              <span className={styles.flowArrow}>→</span>
              <span>Chiffre d'affaires</span>
            </span>
          </p>

          <div className={styles.pills}>
            <span className={styles.pill}>Canaux • Tableau de bord • Boîte de vitesse</span>
            <span className={styles.pillMuted}>Centralisé • Rentable • Automatisé</span>
          </div>
        </div>

        <div className={styles.generatorCard}>
          <div className={styles.generatorFX} aria-hidden />
          <div className={styles.generatorFX2} aria-hidden />
          <div className={styles.generatorFX3} aria-hidden />

          <div className={styles.generatorHeader}>
            <div>
              <div className={styles.generatorTitle}>Générateur iNrCy</div>
              <div className={styles.generatorDesc}>Production de prospects et de clients dès qu’un module est connecté</div>
            </div>

            <div className={styles.generatorHeaderRight}>
              <button
                type="button"
                className={styles.generatorRefreshBtn}
                onClick={() => void refreshKpis()}
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

              <div className={`${styles.generatorStatus} ${leadsMonth > 0 ? styles.statusLive : styles.statusSetup}`}>
                <span className={leadsMonth > 0 ? styles.liveDot : styles.setupDot} aria-hidden />
                {leadsMonth > 0 ? "Actif" : "En attente"}
              </div>
            </div>
          </div>

          <div className={styles.generatorGrid}>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Leads aujourd’hui</div>
              <div className={styles.metricValue}>{leadsToday}</div>
              <div className={styles.metricHint}>Opportunités en temps réel</div>
            </div>

            <div className={styles.generatorCoreCenter} aria-hidden>
              <div className={styles.miniCoreRing} />
              <div className={styles.miniCoreRotor} />
              <div className={styles.miniCoreGlass} />
              <div className={styles.miniCoreGlow} />
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Cette semaine</div>
              <div className={styles.metricValue}>{leadsWeek}</div>
              <div className={styles.metricHint}>Demandes captées</div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Ce mois</div>
              <div className={styles.metricValue}>{leadsMonth}</div>
              <div className={styles.metricHint}>Contacts de CA potentiel</div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>CA GÉNÉRÉ</div>
              <div className={styles.metricValue}>
                {estimatedValue > 0 ? `${estimatedValue.toLocaleString("fr-FR")} €` : "0 €"}
              </div>
              <div className={styles.metricHint}>Montant basé sur votre profil</div>
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
            <h2 className={styles.h2}>Canaux</h2>

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
        title={
          panel === "contact"
            ? "Nous contacter"
            : panel === "compte"
            ? "Mon compte"
            : panel === "profil"
            ? "Mon profil"
            : panel === "activite"
            ? "Mon activité"
            : panel === "abonnement"
            ? "Mon abonnement"
            : panel === "legal"
            ? "Informations légales"
            : panel === "mails"
            ? "Réglages iNr’Send"
            : panel === "site_inrcy"
            ? "Configuration — Site iNrCy"
            : panel === "site_web"
            ? "Configuration — Site web"
            : panel === "instagram"
            ? "Configuration — Instagram"
            : panel === "linkedin"
            ? "Configuration — LinkedIn"
            : panel === "gmb"
            ? "Configuration — Google Business"
            : panel === "facebook"
            ? "Configuration — Facebook"
            : ""
        }
        isOpen={
          panel === "contact" ||
          panel === "compte" ||
          panel === "profil" ||
          panel === "activite" ||
          panel === "abonnement" ||
          panel === "legal" ||
          panel === "mails" ||
          panel === "site_inrcy"
        ||
          panel === "site_web"
        ||
          panel === "instagram"
        ||
          panel === "linkedin"
        ||
          panel === "gmb"
        ||
          panel === "facebook"
        }
        onClose={closePanel}
      >
        {panel === "contact" && <ContactContent mode="drawer" />}
        {panel === "compte" && <AccountContent mode="drawer" />}
        {panel === "profil" && <ProfilContent mode="drawer" />}
        {panel === "activite" && <ActivityContent mode="drawer" />}
        {panel === "abonnement" && <AbonnementContent mode="drawer" />}
        {panel === "legal" && <LegalContent mode="drawer" />}
        {panel === "mails" && <MailsSettingsContent />}


        {panel === "site_inrcy" && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(15,23,42,0.65)",
                      colorScheme: "dark",
                  padding: "8px 10px",
                  borderRadius: 999,
                  color: "rgba(255,255,255,0.92)",
                  fontSize: 13,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background:
                      siteInrcyOwnership === "none"
                        ? "rgba(148,163,184,0.9)"
                        : siteInrcyAllGreen
                        ? "rgba(34,197,94,0.95)"
                        : "rgba(59,130,246,0.95)",
                  }}
                />
                Statut :{" "}
                <strong>
                  {siteInrcyOwnership === "none" ? "Aucun site" : siteInrcyAllGreen ? "Connecté" : "À connecter"}
                </strong>
              </span>

              {!!siteInrcyContactEmail && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(15,23,42,0.65)",
                      colorScheme: "dark",
                    padding: "8px 10px",
                    borderRadius: 999,
                    color: "rgba(255,255,255,0.85)",
                    fontSize: 13,
                  }}
                >
                  Email : <strong style={{ marginLeft: 6 }}>{siteInrcyContactEmail}</strong>
                </span>
              )}
            </div>

            <div
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 14,
                padding: 12,
                display: "grid",
                gap: 10,
              }}
            >
              <div className={styles.blockHeaderRow}>
                <div className={styles.blockTitle}>Lien du site</div>
                <ConnectionPill connected={siteInrcyOwnership !== "none" && !!siteInrcyUrl?.trim()} />
              </div>
              <div className={styles.blockSub}>
                {siteInrcyOwnership === "sold"
                  ? "Renseigne (ou corrige) l'URL du site iNrCy."
                  : "Lien en lecture seule (configuration disponible uniquement si le site est vendu)."}
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  value={siteInrcyUrl}
                  onChange={(e) => setSiteInrcyUrl(e.target.value)}
                  disabled={siteInrcyOwnership !== "sold"}
                  placeholder="https://..."
                  style={{
                    flex: "1 1 280px",
                    minWidth: 220,
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(15,23,42,0.65)",
                      colorScheme: "dark",
                    padding: "10px 12px",
                    color: siteInrcyOwnership !== "sold" ? "rgba(255,255,255,0.75)" : "white",
                    outline: "none",
                  }}
                />

                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.iconBtn}`}
                  onClick={saveSiteInrcyUrl}
                  disabled={siteInrcyOwnership !== "sold"}
                  title={siteInrcyOwnership !== "sold" ? "Disponible uniquement si le site est vendu" : "Enregistrer le lien"}
                  aria-label="Enregistrer le lien"
                >
                  <SaveIcon />
                </button>

                <a
                  href={siteInrcyUrl || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className={`${styles.actionBtn} ${styles.viewBtn}`}
                  style={{ pointerEvents: siteInrcyUrl ? "auto" : "none", opacity: siteInrcyUrl ? 1 : 0.5 }}
                >
                  Voir le site
                </a>
              </div>
              {siteInrcyUrlNotice && <div className={styles.successNote}>{siteInrcyUrlNotice}</div>}
            </div>

            <div
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 14,
                padding: 12,
                display: "grid",
                gap: 10,
              }}
            >
              <div className={styles.blockHeaderRow}>
                <div className={styles.blockTitle}>Widget « Actus »</div>
                <ConnectionPill connected={siteInrcyOwnership !== "none" && !!siteInrcyUrl?.trim()} />
              </div>
              <div className={styles.blockSub}>
                Colle ce code dans ton site iNrCy (Elementor → widget HTML) pour afficher les <strong>5 dernières actus</strong> publiées depuis Booster.
              </div>

              {(() => {
                const url = (siteInrcyUrl || "").trim();
                let domain = "";
                try {
                  const withProto = /^https?:\/\//i.test(url) ? url : url ? `https://${url}` : "";
                  if (withProto) domain = new URL(withProto).hostname.toLowerCase().replace(/^www\./, "");
                } catch {
                  // ignore
                }
                const widgetV = process.env.NEXT_PUBLIC_WIDGET_VERSION || "1";
                const scriptUrl = typeof window !== "undefined" ? `${window.location.origin}/widgets/inrcy-actus.js?v=${widgetV}` : `/widgets/inrcy-actus.js?v=${widgetV}`;
                const snippet = `<div data-inrcy-actus data-domain=\"${domain || "votre-site.fr"}\" data-source=\"inrcy_site\" data-limit=\"5\" data-title=\"Actualités\" data-token=\"${widgetTokenInrcySite}\"></div>
<script async src=\"${scriptUrl}\"></script>`;
                return (
                  <>
                    <textarea
                      readOnly
                      value={snippet}
                      style={{
                        width: "100%",
                        minHeight: 86,
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.14)",
                        background: "rgba(15,23,42,0.65)",
                        colorScheme: "dark",
                        padding: "10px 12px",
                        color: "rgba(255,255,255,0.92)",
                        outline: "none",
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                        fontSize: 12,
                      }}
                    />

                    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => {
                          void navigator.clipboard?.writeText(snippet);
                        }}
                      >
                        Copier le code
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>

            {siteInrcySettingsError && (
              <div style={{ color: "rgba(248,113,113,0.95)", fontSize: 12 }}>{siteInrcySettingsError}</div>
            )}

            <div
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 14,
                padding: 12,
                display: "grid",
                gap: 10,
              }}
            >
              <div className={styles.blockHeaderRow}>
                <div className={styles.blockTitle}>Google Analytics (GA4)</div>
                <ConnectionPill connected={siteInrcyGa4Connected} />
              </div>
              <div className={styles.blockSub}>Rattache le tracking à ton site iNrCy</div>

              <label style={{ display: "grid", gap: 8 }}>
                <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>ID de mesure (ex: G-XXXXXXXXXX)</span>
                <input
                  value={ga4MeasurementId}
                  onChange={(e) => setGa4MeasurementId(e.target.value)}
                  placeholder="G-XXXXXXXXXX"
                  style={{
                    width: "100%",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(15,23,42,0.65)",
                      colorScheme: "dark",
                    padding: "10px 12px",
                    color: "white",
                    outline: "none",
                  }}
                />
              </label>


              <label style={{ display: "grid", gap: 8 }}>
                <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>Property ID (numérique, ex: 123456789)</span>
                <input
                  value={ga4PropertyId}
                  onChange={(e) => setGa4PropertyId(e.target.value)}
                  inputMode="numeric"
                  placeholder="123456789"
                  style={{
                    width: "100%",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(15,23,42,0.65)",
                      colorScheme: "dark",
                    padding: "10px 12px",
                    color: "white",
                    outline: "none",
                  }}
                />
              </label>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.iconBtn}`}
                  onClick={attachGoogleAnalytics}
                  disabled={siteInrcyOwnership !== "sold"}
                  title={siteInrcyOwnership !== "sold" ? siteInrcyOwnership === "rented" ? "En mode rented, la configuration est gérée par iNrCy." : siteInrcyOwnership === "none" ? "Aucun site iNrCy associé" : undefined : "Enregistrer (GA4)"}
                  aria-label="Enregistrer (GA4)"
                >
                  <SaveIcon />
                </button>
                {siteInrcyGa4Connected ? (
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.disconnectBtn}`}
                    onClick={disconnectSiteInrcyGa4}
                    disabled={siteInrcyOwnership !== "sold"}
                    title={
                      siteInrcyOwnership !== "sold"
                        ? siteInrcyOwnership === "rented"
                          ? "En mode rented, la déconnexion est gérée par iNrCy."
                          : siteInrcyOwnership === "none"
                            ? "Aucun site iNrCy associé"
                            : undefined
                        : "Déconnecter (GA4)"
                    }
                  >
                    Déconnecter
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.connectBtn}`}
                    onClick={connectSiteInrcyGa4}
                    disabled={!canConnectSiteInrcyGoogle}
                    title={
                      !canConfigureSite
                        ? siteInrcyOwnership === "rented"
                          ? "En mode rented, la connexion Google est gérée par iNrCy."
                          : siteInrcyOwnership === "none"
                            ? "Aucun site iNrCy associé"
                            : "Disponible uniquement si le site est vendu"
                        : !hasSiteInrcyUrl
                          ? "Renseigne le lien du site iNrCy avant de connecter Google Analytics."
                          : "Connecter Google Analytics"
                    }
                  >
                    Connecter Google Analytics
                  </button>
                )}
              </div>
            </div>
            {siteInrcyGa4Notice && <div className={styles.successNote}>{siteInrcyGa4Notice}</div>}


            <div
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 14,
                padding: 12,
                display: "grid",
                gap: 10,
              }}
            >
              <div className={styles.blockHeaderRow}>
                <div className={styles.blockTitle}>Google Search Console</div>
                <ConnectionPill connected={siteInrcyGscConnected} />
              </div>
              <div className={styles.blockSub}>Active le suivi SEO (requêtes, impressions, clics)</div>

              <label style={{ display: "grid", gap: 8 }}>
                <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>
                  Propriété (ex: <code>sc-domain:monsite.fr</code> ou <code>https://monsite.fr/</code>)
                </span>
                <input
                  value={gscProperty}
                  onChange={(e) => setGscProperty(e.target.value)}
                  placeholder="sc-domain:monsite.fr"
                  style={{
                    width: "100%",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(15,23,42,0.65)",
                      colorScheme: "dark",
                    padding: "10px 12px",
                    color: "white",
                    outline: "none",
                  }}
                />
              </label>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.iconBtn}`}
                  onClick={attachGoogleSearchConsole}
                  disabled={siteInrcyOwnership !== "sold"}
                  title={siteInrcyOwnership !== "sold" ? siteInrcyOwnership === "rented" ? "En mode rented, la configuration est gérée par iNrCy." : siteInrcyOwnership === "none" ? "Aucun site iNrCy associé" : undefined : "Enregistrer (GSC)"}
                  aria-label="Enregistrer (GSC)"
                >
                  <SaveIcon />
                </button>
                {siteInrcyGscConnected ? (
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.disconnectBtn}`}
                    onClick={disconnectSiteInrcyGsc}
                    disabled={siteInrcyOwnership !== "sold"}
                    title={
                      siteInrcyOwnership !== "sold"
                        ? siteInrcyOwnership === "rented"
                          ? "En mode rented, la déconnexion est gérée par iNrCy."
                          : siteInrcyOwnership === "none"
                            ? "Aucun site iNrCy associé"
                            : undefined
                        : "Déconnecter (GSC)"
                    }
                  >
                    Déconnecter
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.connectBtn}`}
                    onClick={connectSiteInrcyGsc}
                    disabled={!canConnectSiteInrcyGoogle}
                    title={
                      !canConfigureSite
                        ? siteInrcyOwnership === "rented"
                          ? "En mode rented, la connexion Google est gérée par iNrCy."
                          : siteInrcyOwnership === "none"
                            ? "Aucun site iNrCy associé"
                            : "Disponible uniquement si le site est vendu"
                        : !hasSiteInrcyUrl
                          ? "Renseigne le lien du site iNrCy avant de connecter Google Search Console."
                          : "Connecter Google Search Console"
                    }
                  >
                    Connecter Google Search Console
                  </button>
                )}
              </div>
            </div>
            {siteInrcyGscNotice && <div className={styles.successNote}>{siteInrcyGscNotice}</div>}



            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button
                type="button"
                className={`${styles.actionBtn} ${styles.resetBtn}`}
                onClick={resetSiteInrcyAll}
                disabled={siteInrcyOwnership === "none"}
                title={siteInrcyOwnership === "none" ? "Aucun site iNrCy" : "Réinitialiser (lien + GA4 + Search Console)"}
              >
                Réinitialiser
              </button>
            </div>
          </div>



                )}

{panel === "site_web" && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(15,23,42,0.65)",
                      colorScheme: "dark",
                  padding: "8px 10px",
                  borderRadius: 999,
                  color: "rgba(255,255,255,0.92)",
                  fontSize: 13,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: siteWebAllGreen
                      ? "rgba(34,197,94,0.95)"
                      : siteWebUrl?.trim()
                      ? "rgba(59,130,246,0.95)"
                      : "rgba(148,163,184,0.9)",
                  }}
                />
                Statut : <strong>{siteWebUrl?.trim() ? (siteWebAllGreen ? "Connecté" : "À connecter") : "À configurer"}</strong>
              </span>
            </div>

            <div
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 14,
                padding: 12,
                display: "grid",
                gap: 10,
              }}
            >
              <div className={styles.blockHeaderRow}>
                <div className={styles.blockTitle}>Lien du site</div>
                <ConnectionPill connected={!!siteWebUrl?.trim()} />
              </div>
              <div className={styles.blockSub}>
                Le bouton <strong>Voir le site</strong> de la bulle utilisera ce lien.
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  value={siteWebUrl}
                  onChange={(e) => setSiteWebUrl(e.target.value)}
                  placeholder="https://votre-site.fr"
                  style={{
                    flex: "1 1 280px",
                    minWidth: 220,
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(15,23,42,0.65)",
                      colorScheme: "dark",
                    padding: "10px 12px",
                    color: "white",
                    outline: "none",
                  }}
                />

                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.iconBtn}`}
                  onClick={saveSiteWebUrl}
                  title="Enregistrer le lien"
                  aria-label="Enregistrer le lien"
                >
                  <SaveIcon />
                </button>

                <a
                  href={siteWebUrl || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className={`${styles.actionBtn} ${styles.viewBtn}`}
                  style={{ pointerEvents: siteWebUrl ? "auto" : "none", opacity: siteWebUrl ? 1 : 0.5 }}
                >
                  Voir le site
                </a>
              </div>
              {siteWebUrlNotice && <div className={styles.successNote}>{siteWebUrlNotice}</div>}
            </div>

            {/* ✅ Widget actus (pour afficher les 5 dernières publications Booster sur le site du client) */}
            <div
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 14,
                padding: 12,
                display: "grid",
                gap: 10,
              }}
            >
              <div className={styles.blockHeaderRow}>
                <div className={styles.blockTitle}>Widget « Actus »</div>
                <ConnectionPill connected={!!siteWebUrl?.trim()} />
              </div>
              <div className={styles.blockSub}>
                Colle ce code dans ton site (WordPress, Wix, Webflow, HTML…) pour afficher les <strong>5 dernières actus</strong> publiées depuis Booster.
              </div>

              {(() => {
                const url = (siteWebUrl || "").trim();
                let domain = "";
                try {
                  const withProto = /^https?:\/\//i.test(url) ? url : url ? `https://${url}` : "";
                  if (withProto) domain = new URL(withProto).hostname.toLowerCase().replace(/^www\./, "");
                } catch {
                  // ignore
                }
                const widgetV = process.env.NEXT_PUBLIC_WIDGET_VERSION || "1";
                const scriptUrl = typeof window !== "undefined" ? `${window.location.origin}/widgets/inrcy-actus.js?v=${widgetV}` : `/widgets/inrcy-actus.js?v=${widgetV}`;
                const snippet = `<div data-inrcy-actus data-domain=\"${domain || "votre-site.fr"}\" data-source=\"site_web\" data-limit=\"5\" data-title=\"Actualités\" data-token=\"${widgetTokenSiteWeb}\"></div>
<script async src=\"${scriptUrl}\"></script>`;
                return (
                  <>
                    <textarea
                      readOnly
                      value={snippet}
                      style={{
                        width: "100%",
                        minHeight: 86,
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.14)",
                        background: "rgba(15,23,42,0.65)",
                        colorScheme: "dark",
                        padding: "10px 12px",
                        color: "rgba(255,255,255,0.92)",
                        outline: "none",
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                        fontSize: 12,
                      }}
                    />

                    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => {
                          void navigator.clipboard?.writeText(snippet);
                        }}
                      >
                        Copier le code
                      </button>
                    </div>
                    <div className={styles.blockSub}>
                      <strong>Où le coller ?</strong> Sur WordPress : un bloc <em>HTML personnalisé</em> (Elementor → widget HTML). Sur Wix : <em>Embed Code</em>. Sur Webflow : <em>Embed</em>.
                    </div>
                  </>
                );
              })()}
            </div>

            {siteWebSettingsError && (
              <div style={{ color: "rgba(248,113,113,0.95)", fontSize: 12 }}>{siteWebSettingsError}</div>
            )}

            <div
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 14,
                padding: 12,
                display: "grid",
                gap: 10,
              }}
            >
              <div className={styles.blockHeaderRow}>
                <div className={styles.blockTitle}>Google Analytics (GA4)</div>
                <ConnectionPill connected={siteWebGa4Connected} />
              </div>
              <div className={styles.blockSub}>Rattache le tracking à ton site web</div>

              <label style={{ display: "grid", gap: 8 }}>
                <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>ID de mesure (ex: G-XXXXXXXXXX)</span>
                <input
                  value={siteWebGa4MeasurementId}
                  onChange={(e) => setSiteWebGa4MeasurementId(e.target.value)}
                  placeholder="G-XXXXXXXXXX"
                  style={{
                    width: "100%",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(15,23,42,0.65)",
                      colorScheme: "dark",
                    padding: "10px 12px",
                    color: "white",
                    outline: "none",
                  }}
                />
              </label>


              <label style={{ display: "grid", gap: 8 }}>
                <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>Property ID (numérique, ex: 123456789)</span>
                <input
                  value={siteWebGa4PropertyId}
                  onChange={(e) => setSiteWebGa4PropertyId(e.target.value)}
                  inputMode="numeric"
                  placeholder="123456789"
                  style={{
                    width: "100%",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(15,23,42,0.65)",
                      colorScheme: "dark",
                    padding: "10px 12px",
                    color: "white",
                    outline: "none",
                  }}
                />
              </label>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.iconBtn}`}
                  onClick={attachWebsiteGoogleAnalytics}
                  title="Enregistrer (GA4)"
                  aria-label="Enregistrer (GA4)"
                >
                  <SaveIcon />
                </button>
                {siteWebGa4Connected ? (
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.disconnectBtn}`}
                    onClick={disconnectSiteWebGa4}
                    title="Déconnecter (GA4)"
                  >
                    Déconnecter
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.connectBtn}`}
                    onClick={connectSiteWebGa4}
                    disabled={!canConnectSiteWebGoogle}
                    title={!hasSiteWebUrl ? "Renseigne le lien du site web avant de connecter Google Analytics." : "Connecter Google Analytics"}
                  >
                    Connecter Google Analytics
                  </button>
                )}
              </div>
            </div>
            {siteWebGa4Notice && <div className={styles.successNote}>{siteWebGa4Notice}</div>}


            <div
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 14,
                padding: 12,
                display: "grid",
                gap: 10,
              }}
            >
              <div className={styles.blockHeaderRow}>
                <div className={styles.blockTitle}>Google Search Console</div>
                <ConnectionPill connected={siteWebGscConnected} />
              </div>
              <div className={styles.blockSub}>Active le suivi SEO (requêtes, impressions, clics)</div>

              <label style={{ display: "grid", gap: 8 }}>
                <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>
                  Propriété (ex: <code>sc-domain:monsite.fr</code> ou <code>https://monsite.fr/</code>)
                </span>
                <input
                  value={siteWebGscProperty}
                  onChange={(e) => setSiteWebGscProperty(e.target.value)}
                  placeholder="sc-domain:monsite.fr"
                  style={{
                    width: "100%",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(15,23,42,0.65)",
                      colorScheme: "dark",
                    padding: "10px 12px",
                    color: "white",
                    outline: "none",
                  }}
                />
              </label>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.iconBtn}`}
                  onClick={attachWebsiteGoogleSearchConsole}
                  title="Enregistrer (GSC)"
                  aria-label="Enregistrer (GSC)"
                >
                  <SaveIcon />
                </button>
                {siteWebGscConnected ? (
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.disconnectBtn}`}
                    onClick={disconnectSiteWebGsc}
                    title="Déconnecter (GSC)"
                  >
                    Déconnecter
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.connectBtn}`}
                    onClick={connectSiteWebGsc}
                    disabled={!canConnectSiteWebGoogle}
                    title={!hasSiteWebUrl ? "Renseigne le lien du site web avant de connecter Google Search Console." : "Connecter Google Search Console"}
                  >
                    Connecter Google Search Console
                  </button>
                )}
              </div>
            </div>
            {siteWebGscNotice && <div className={styles.successNote}>{siteWebGscNotice}</div>}


            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button
                type="button"
                className={`${styles.actionBtn} ${styles.resetBtn}`}
                onClick={resetSiteWebAll}
                title="Réinitialiser (lien + GA4 + Search Console)"
              >
                Réinitialiser
              </button>
            </div>
          </div>
        )}

              {/* ✅ AJOUT : callbacks pour mise à jour immédiate de la pastille */}
        
{panel === "instagram" && (
  <div style={{ display: "grid", gap: 14 }}>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(15,23,42,0.65)",
          colorScheme: "dark",
          padding: "8px 10px",
          borderRadius: 999,
          color: "rgba(255,255,255,0.92)",
          fontSize: 13,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: instagramConnected
              ? "rgba(34,197,94,0.95)"
              : instagramAccountConnected
                ? "rgba(59,130,246,0.95)"
                : "rgba(148,163,184,0.9)",
          }}
        />
        Statut : <strong>{instagramConnected ? "Connecté" : instagramAccountConnected ? "Compte connecté" : "À connecter"}</strong>
      </span>
    </div>

    {/* Compte (OAuth Meta) */}
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.03)",
        borderRadius: 14,
        padding: 12,
        display: "grid",
        gap: 10,
      }}
    >
      <div className={styles.blockHeaderRow}>
        <div className={styles.blockTitle}>Compte connecté</div>
        <ConnectionPill connected={instagramAccountConnected} />
      </div>
      <div className={styles.blockSub}>
        Instagram nécessite un compte <strong>Business / Creator</strong> relié à une Page Facebook.
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={instagramUsername}
          readOnly
          placeholder={instagramAccountConnected ? "Compte connecté" : "Aucun compte connecté"}
          style={{
            flex: "1 1 280px",
            minWidth: 220,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(15,23,42,0.65)",
            colorScheme: "dark",
            padding: "10px 12px",
            color: "white",
            outline: "none",
            opacity: instagramAccountConnected ? 1 : 0.8,
          }}
        />

        {!instagramAccountConnected ? (
          <button type="button" className={`${styles.actionBtn} ${styles.connectBtn}`} onClick={connectInstagramAccount}>
            Connecter Instagram
          </button>
        ) : (
          <button type="button" className={`${styles.actionBtn} ${styles.disconnectBtn}`} onClick={disconnectInstagramAccount}>
            Déconnecter Instagram
          </button>
        )}
      </div>
    </div>

    {/* Choix du compte Instagram (via Pages Meta) */}
    {instagramAccountConnected ? (
      <div
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.03)",
          borderRadius: 14,
          padding: 12,
          display: "grid",
          gap: 10,
        }}
      >
        <div className={styles.blockHeaderRow}>
          <div className={styles.blockTitle}>Compte Instagram à connecter</div>
          <ConnectionPill connected={instagramConnected} />
        </div>
        <div className={styles.blockSub}>On liste les Pages Facebook qui possèdent un Instagram Business/Creator.</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.secondaryBtn}`}
            onClick={() => loadInstagramAccounts()}
            disabled={igAccountsLoading}
          >
            {igAccountsLoading ? "Chargement..." : "Charger mes comptes"}
          </button>

          <select
            value={igSelectedPageId}
            onChange={(e) => setIgSelectedPageId(e.target.value)}
            style={{
              flex: "1 1 260px",
              minWidth: 220,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(15,23,42,0.65)",
              colorScheme: "dark",
              padding: "10px 12px",
              color: "white",
              outline: "none",
            }}
          >
            <option value="">Sélectionner un compte</option>
            {igAccounts.map((a) => (
              <option key={a.page_id} value={a.page_id}>
                @{a.username || "instagram"} — {a.page_name || a.page_id}
              </option>
            ))}
          </select>

          <button
            type="button"
            className={`${styles.actionBtn} ${styles.connectBtn}`}
            onClick={saveInstagramProfile}
            disabled={!igSelectedPageId}
          >
            Connecter
          </button>
        </div>
        {igAccountsError && <div className={styles.errNote}>{igAccountsError}</div>}
      </div>
    ) : null}

    {/* Lien + déconnexion */}
    {instagramAccountConnected ? (
      <div
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.03)",
          borderRadius: 14,
          padding: 12,
          display: "grid",
          gap: 10,
        }}
      >
        <div className={styles.blockHeaderRow}>
          <div className={styles.blockTitle}>Lien du compte</div>
          <ConnectionPill connected={instagramConnected && !!instagramUrl?.trim()} />
        </div>
        <div className={styles.blockSub}>Se remplit automatiquement après sélection.</div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={instagramUrl}
            readOnly
            placeholder={instagramConnected ? "Lien récupéré automatiquement" : "Sélectionne un compte pour générer le lien"}
            style={{
              flex: "1 1 280px",
              minWidth: 220,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(15,23,42,0.65)",
              colorScheme: "dark",
              padding: "10px 12px",
              color: "white",
              outline: "none",
              opacity: instagramUrl ? 1 : 0.8,
            }}
          />

          <a
            href={instagramUrl || "#"}
            target="_blank"
            rel="noreferrer"
            className={`${styles.actionBtn} ${styles.viewBtn}`}
            style={{ pointerEvents: instagramUrl ? "auto" : "none", opacity: instagramUrl ? 1 : 0.5 }}
          >
            Voir le compte
          </a>
        </div>

        {instagramUrlNotice && <div className={styles.successNote}>{instagramUrlNotice}</div>}

        {instagramConnected ? (
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button type="button" className={`${styles.actionBtn} ${styles.disconnectBtn}`} onClick={disconnectInstagramProfile}>
              Déconnecter le compte
            </button>
          </div>
        ) : null}
      </div>
    ) : null}
  </div>
)}

{panel === "linkedin" && (
  <div style={{ display: "grid", gap: 14 }}>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(15,23,42,0.65)",
          colorScheme: "dark",
          padding: "8px 10px",
          borderRadius: 999,
          color: "rgba(255,255,255,0.92)",
          fontSize: 13,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: linkedinConnected
              ? "rgba(34,197,94,0.95)"
              : linkedinAccountConnected
                ? "rgba(59,130,246,0.95)"
                : "rgba(148,163,184,0.9)",
          }}
        />
        Statut : <strong>{linkedinConnected ? "Connecté" : linkedinAccountConnected ? "Compte connecté" : "À connecter"}</strong>
      </span>
    </div>

    {/* Compte LinkedIn */}
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.03)",
        borderRadius: 14,
        padding: 12,
        display: "grid",
        gap: 10,
      }}
    >
      <div className={styles.blockHeaderRow}>
        <div className={styles.blockTitle}>Compte connecté</div>
        <ConnectionPill connected={linkedinAccountConnected} />
      </div>
      <div className={styles.blockSub}>Connexion OAuth LinkedIn.</div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={linkedinDisplayName}
          readOnly
          placeholder={linkedinAccountConnected ? "Compte connecté" : "Aucun compte connecté"}
          style={{
            flex: "1 1 280px",
            minWidth: 220,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(15,23,42,0.65)",
            colorScheme: "dark",
            padding: "10px 12px",
            color: "white",
            outline: "none",
            opacity: linkedinAccountConnected ? 1 : 0.8,
          }}
        />

        {!linkedinAccountConnected ? (
          <button type="button" className={`${styles.actionBtn} ${styles.connectBtn}`} onClick={connectLinkedinAccount}>
            Connecter LinkedIn
          </button>
        ) : (
          <button type="button" className={`${styles.actionBtn} ${styles.disconnectBtn}`} onClick={disconnectLinkedinAccount}>
            Déconnecter LinkedIn
          </button>
        )}
      </div>
    </div>

    
    {/* Lien */}
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.03)",
        borderRadius: 14,
        padding: 12,
        display: "grid",
        gap: 10,
      }}
    >
      <div className={styles.blockHeaderRow}>
        <div className={styles.blockTitle}>Lien du profil</div>
        <ConnectionPill connected={!!linkedinUrl?.trim()} />
      </div>
      <div className={styles.blockSub}>Se remplit si LinkedIn fournit un lien public. Sinon laisse vide.</div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={linkedinUrl}
          onChange={(e) => {
            setLinkedinUrlNotice(null);
            setLinkedinUrl(e.target.value);
          }}
          placeholder="Lien LinkedIn (optionnel)"
          style={{
            flex: "1 1 280px",
            minWidth: 220,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(15,23,42,0.65)",
            colorScheme: "dark",
            padding: "10px 12px",
            color: "white",
            outline: "none",
            opacity: linkedinUrl ? 1 : 0.8,
          }}
        />

        

<button
  type="button"
  className={`${styles.actionBtn} ${styles.connectBtn}`}
  onClick={saveLinkedinProfileUrl}
>
  Enregistrer
</button>

        <a
          href={linkedinUrl || "#"}
          target="_blank"
          rel="noreferrer"
          className={`${styles.actionBtn} ${styles.viewBtn}`}
          style={{ pointerEvents: linkedinUrl ? "auto" : "none", opacity: linkedinUrl ? 1 : 0.5 }}
        >
          Voir
        </a>
      </div>

      {linkedinUrlNotice && <div className={styles.successNote}>{linkedinUrlNotice}</div>}
    </div>
  </div>
)}

{panel === "gmb" && (
          <div style={{ display: "grid", gap: 14 }}>
            {/* Statut */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(15,23,42,0.65)",
                      colorScheme: "dark",
                  padding: "8px 10px",
                  borderRadius: 999,
                  color: "rgba(255,255,255,0.92)",
                  fontSize: 13,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: gmbConnected ? "rgba(34,197,94,0.95)" : "rgba(148,163,184,0.9)",
                  }}
                />
                Statut : <strong>{!gmbAccountConnected ? "À connecter" : gmbConfigured ? "Google Business connecté" : "Compte connecté"}</strong>
              </span>
            </div>

            {/* Compte Google connecté */}
            <div
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 14,
                padding: 12,
                display: "grid",
                gap: 10,
              }}
            >
              <div className={styles.blockHeaderRow}>
                <div className={styles.blockTitle}>Compte connecté</div>
                  <ConnectionPill connected={gmbAccountConnected} />
              </div>
              <div className={styles.blockSub}>Ce compte Google sert à accéder à vos établissements Google Business.</div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  value={gmbAccountEmail || (gmbAccountConnected ? "Compte connecté" : "")}
                  readOnly
                  placeholder="(aucun compte connecté)"
                  style={{
                    flex: "1 1 280px",
                    minWidth: 220,
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(15,23,42,0.65)",
                    colorScheme: "dark",
                    padding: "10px 12px",
                    color: "white",
                    outline: "none",
                    opacity: gmbAccountConnected ? 1 : 0.7,
                  }}
                />

                {!gmbAccountConnected ? (
                  <button type="button" className={`${styles.actionBtn} ${styles.connectBtn}`} onClick={connectGmbAccount}>
                    Connecter Google
                  </button>
                ) : (
                  <button type="button" className={`${styles.actionBtn} ${styles.disconnectBtn}`} onClick={disconnectGmbAccount}>
                    Déconnecter Google
                  </button>
                )}
              </div>
            </div>


            {/* Sélection de l'établissement (requis pour publier) */}
            {gmbAccountConnected ? (
              <div
                style={{
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: 14,
                  padding: 12,
                  display: "grid",
                  gap: 10,
                }}
              >
                <div className={styles.blockHeaderRow}>
                  <div className={styles.blockTitle}>Établissement à publier</div>
                  <ConnectionPill connected={!!gmbLocationName} />
                </div>
                <div className={styles.blockSub}>Choisis la fiche Google Business sur laquelle iNrCy publie.</div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.secondaryBtn}`}
                    onClick={() => loadGmbAccountsAndLocations()}
                    disabled={gmbLoadingList}
                  >
                    {gmbLoadingList ? "Chargement..." : "Charger mes établissements"}
                  </button>

                  {/*
                    Le compte Google est déjà identifié au-dessus (bloc "Compte connecté").
                    Ici on ne garde que le choix de la fiche (location).
                    Si plusieurs comptes sont disponibles, l'API renvoie un compte par défaut (souvent le premier).
                  */}
                  {gmbAccounts?.length > 1 ? (
                    <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, marginLeft: 2 }}>
                      Plusieurs comptes détectés : iNrCy utilise par défaut <strong>{gmbAccountName || "(non défini)"}</strong>.
                    </div>
                  ) : null}

                  <select
                    value={gmbLocationName}
                    onChange={(e) => setGmbLocationName(e.target.value)}
                    style={{
                      flex: "1 1 320px",
                      minWidth: 220,
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: "rgba(15,23,42,0.65)",
                      colorScheme: "dark",
                      padding: "10px 12px",
                      color: "white",
                      outline: "none",
                    }}
                  >
                    <option value="">Fiche (location)</option>
                    {gmbLocations.map((l) => (
                      <option key={l.name} value={l.name}>
                        {l.title || l.name}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.connectBtn}`}
                    onClick={saveGmbLocation}
                    disabled={!gmbAccountName || !gmbLocationName}
                  >
                    Connecter Google Business
                  </button>
                </div>
                {gmbListError && (
                  <div style={{ color: "rgba(248,113,113,0.95)", fontSize: 13, lineHeight: 1.3 }}>
                    {gmbListError}
                    <div style={{ marginTop: 6, color: "rgba(255,255,255,0.65)" }}>
                      Astuce : si le message parle d’API non activée, active <strong>Business Profile Business Information API</strong> dans Google Cloud.
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {/* Lien de la page (auto) */}
            {gmbAccountConnected ? (
              <div
                style={{
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: 14,
                  padding: 12,
                  display: "grid",
                  gap: 10,
                }}
              >
                <div className={styles.blockHeaderRow}>
                  <div className={styles.blockTitle}>Lien de la page</div>
                  <ConnectionPill connected={!!gmbUrl?.trim() && gmbConfigured} />
                </div>
                <div className={styles.blockSub}>
                  Se remplit automatiquement une fois l’<strong>établissement</strong> choisi.
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    value={gmbUrl}
                    readOnly
                    placeholder="(sélectionne une fiche pour générer le lien)"
                    style={{
                      flex: "1 1 280px",
                      minWidth: 220,
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: "rgba(15,23,42,0.65)",
                      colorScheme: "dark",
                      padding: "10px 12px",
                      color: "white",
                      outline: "none",
                      opacity: gmbUrl ? 1 : 0.75,
                    }}
                  />

                  <a
                    href={gmbUrl || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className={`${styles.actionBtn} ${styles.viewBtn}`}
                    style={{ pointerEvents: gmbUrl ? "auto" : "none", opacity: gmbUrl ? 1 : 0.5 }}
                  >
                    Voir la page
                  </a>
                </div>

                {gmbUrlNotice && <div className={styles.successNote}>{gmbUrlNotice}</div>}
              </div>
            ) : null}

            {/* Bloc 3 — Déconnexion Google Business (ne déconnecte pas le compte Google) */}
            {gmbAccountConnected && gmbConfigured ? (
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button type="button" className={`${styles.actionBtn} ${styles.disconnectBtn}`} onClick={disconnectGmbBusiness}>
                  Déconnecter Google Business
                </button>
              </div>
            ) : null}
          </div>
        )}

        {panel === "facebook" && (
          <div style={{ display: "grid", gap: 14 }}>
            {/* Statut */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(15,23,42,0.65)",
                      colorScheme: "dark",
                  padding: "8px 10px",
                  borderRadius: 999,
                  color: "rgba(255,255,255,0.92)",
                  fontSize: 13,
                }}
              >
	                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
	                    background: facebookPageConnected
	                      ? "rgba(34,197,94,0.95)"
	                      : facebookAccountConnected
	                        ? "rgba(59,130,246,0.95)"
	                        : "rgba(148,163,184,0.9)",
                  }}
                />
	                Statut :{" "}
	                <strong>
	                  {facebookPageConnected ? "Connecté" : facebookAccountConnected ? "Compte connecté" : "À connecter"}
	                </strong>
              </span>
            </div>

	            {/* Bloc 1 — Compte Facebook (OAuth) */}
	            <div
	              style={{
	                border: "1px solid rgba(255,255,255,0.12)",
	                background: "rgba(255,255,255,0.03)",
	                borderRadius: 14,
	                padding: 12,
	                display: "grid",
	                gap: 10,
	              }}
	            >
	              <div className={styles.blockHeaderRow}>
	                <div className={styles.blockTitle}>Compte connecté</div>
	                <ConnectionPill connected={facebookAccountConnected} />
	              </div>
	              <div className={styles.blockSub}>Ce compte Facebook sert à accéder à vos pages.</div>
	
	              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
	                <input
	                  value={facebookAccountEmail}
	                  readOnly
	                  placeholder={facebookAccountConnected ? "Compte connecté" : "Aucun compte connecté"}
	                  style={{
	                    flex: "1 1 280px",
	                    minWidth: 220,
	                    borderRadius: 12,
	                    border: "1px solid rgba(255,255,255,0.14)",
	                    background: "rgba(15,23,42,0.65)",
	                    colorScheme: "dark",
	                    padding: "10px 12px",
	                    color: "white",
	                    outline: "none",
	                    opacity: facebookAccountConnected ? 1 : 0.8,
	                  }}
	                />

	                {!facebookAccountConnected ? (
	                  <button type="button" className={`${styles.actionBtn} ${styles.connectBtn}`} onClick={connectFacebookAccount}>
	                    Connecter Facebook
	                  </button>
	                ) : (
	                  <button type="button" className={`${styles.actionBtn} ${styles.disconnectBtn}`} onClick={disconnectFacebookAccount}>
	                    Déconnecter Facebook
	                  </button>
	                )}
	              </div>
	            </div>

	            {/* Bloc 2 — Choix de la page */}
	            {facebookAccountConnected ? (
              <div
                style={{
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: 14,
                  padding: 12,
                  display: "grid",
                  gap: 10,
                }}
              >
                <div className={styles.blockHeaderRow}>
	                  <div className={styles.blockTitle}>Page à connecter</div>
	                  <ConnectionPill connected={facebookPageConnected} />
                </div>
	                <div className={styles.blockSub}>Choisis la page Facebook à analyser (et éventuellement publier).</div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.secondaryBtn}`}
                    onClick={() => loadFacebookPages()}
                    disabled={fbPagesLoading}
                  >
                    {fbPagesLoading ? "Chargement..." : "Charger mes pages"}
                  </button>

                  <select
                    value={fbSelectedPageId}
                    onChange={(e) => setFbSelectedPageId(e.target.value)}
                    style={{
                      flex: "1 1 260px",
                      minWidth: 220,
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: "rgba(15,23,42,0.65)",
                      colorScheme: "dark",
                      padding: "10px 12px",
                      color: "white",
                      outline: "none",
                    }}
                  >
                    <option value="">Sélectionner une page</option>
                    {fbPages.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name || p.id}
                      </option>
                    ))}
                  </select>

	                  <button
	                    type="button"
	                    className={`${styles.actionBtn} ${styles.connectBtn}`}
	                    onClick={saveFacebookPage}
	                    disabled={!fbSelectedPageId}
	                  >
	                    Connecter la page
	                  </button>
                </div>
                {fbPagesError && <div className={styles.errNote}>{fbPagesError}</div>}
              </div>
            ) : null}

	            {/* Bloc 3 — Lien de la page + Déconnexion page */}
	            {facebookAccountConnected ? (
	              <div
	                style={{
	                  border: "1px solid rgba(255,255,255,0.12)",
	                  background: "rgba(255,255,255,0.03)",
	                  borderRadius: 14,
	                  padding: 12,
	                  display: "grid",
	                  gap: 10,
	                }}
	              >
	                <div className={styles.blockHeaderRow}>
	                  <div className={styles.blockTitle}>Lien de la page</div>
	                  <ConnectionPill connected={facebookPageConnected && !!facebookUrl?.trim()} />
	                </div>
	                <div className={styles.blockSub}>Se remplit automatiquement une fois la page choisie.</div>
	
	                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
	                  <input
	                    value={facebookUrl}
	                    readOnly
	                    placeholder={facebookPageConnected ? "Lien récupéré automatiquement" : "Sélectionne une page pour générer le lien"}
	                    style={{
	                      flex: "1 1 280px",
	                      minWidth: 220,
	                      borderRadius: 12,
	                      border: "1px solid rgba(255,255,255,0.14)",
	                      background: "rgba(15,23,42,0.65)",
	                      colorScheme: "dark",
	                      padding: "10px 12px",
	                      color: "white",
	                      outline: "none",
	                      opacity: facebookUrl ? 1 : 0.8,
	                    }}
	                  />

	                  <a
	                    href={facebookUrl || "#"}
	                    target="_blank"
	                    rel="noreferrer"
	                    className={`${styles.actionBtn} ${styles.viewBtn}`}
	                    style={{ pointerEvents: facebookUrl ? "auto" : "none", opacity: facebookUrl ? 1 : 0.5 }}
	                  >
	                    Voir la page
	                  </a>
	                </div>
	                {facebookUrlNotice && <div className={styles.successNote}>{facebookUrlNotice}</div>}

	                {facebookPageConnected ? (
	                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
	                    <button type="button" className={`${styles.actionBtn} ${styles.disconnectBtn}`} onClick={disconnectFacebookPage}>
	                      Déconnecter la page
	                    </button>
	                  </div>
	                ) : null}
	              </div>
	            ) : null}
          </div>
        )}

      </SettingsDrawer>

      <footer className={styles.footer}>
        <div className={styles.footerLeft}>© {new Date().getFullYear()} iNrCy</div>
      </footer>
    </main>
  );
}

