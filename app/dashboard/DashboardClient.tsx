"use client";

import styles from "./dashboard.module.css";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useCallback, type TouchEvent as ReactTouchEvent } from "react";
import Link from "next/link";
import SettingsDrawer from "./SettingsDrawer";
import ProfilContent from "./settings/_components/ProfilContent";
import ActivityContent from "./settings/_components/ActivityContent";
import AbonnementContent from "./settings/_components/AbonnementContent";
import ContactContent from "./settings/_components/ContactContent";
import MailsSettingsContent from "./settings/_components/MailsSettingsContent";
import AgendaSettingsContent from "./settings/_components/AgendaSettingsContent";


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
  houzz: { src: "/icons/houzz.png", alt: "Houzz" },
  pages_jaunes: { src: "/icons/pagesjaunes.png", alt: "Pages Jaunes" },
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
    key: "houzz",
    name: "Houzz",
    description: "Livre des projets premium 🔥",
    status: "available",
    accent: "pink",
    actions: [{ key: "view", label: "Voir la page", variant: "view", href: "#" }],
  },
  {
    key: "pages_jaunes",
    name: "Pages Jaunes",
    description: "Capte la recherche locale 📍",
    status: "available",
    accent: "orange",
    actions: [{ key: "view", label: "Voir la page", variant: "view", href: "#" }],
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
  { key: "agenda", name: "Agenda", description: "Rdv, réunion et échéances", status: "available", accent: "purple" },
  { key: "crm", name: "CRM", description: "Fichier clients et propects", status: "available", accent: "cyan" },
];

const quickActions: Array<{ key: string; title: string; sub: string; disabled?: boolean; accent: Accent }> = [
  { key: "facturer", title: "Facturer", sub: "Factures & paiements", disabled: false, accent: "orange" },
  { key: "devis", title: "Faire devis", sub: "Devis en 30 sec", disabled: false, accent: "pink" },
  { key: "booster", title: "Booster", sub: "Visibilité & communication", disabled: false, accent: "purple" },
  { key: "fideliser", title: "Fidéliser", sub: "Informer & suivi client", disabled: false, accent: "cyan" },
];

export default function DashboardClient() {
  const router = useRouter();

  const searchParams = useSearchParams();
  const panel = searchParams.get("panel"); // "contact" | "profil" | "activite" | "abonnement" | "mails" | "agenda" | ... | null

  const openPanel = (
    name:
      | "contact"
      | "profil"
      | "activite"
      | "abonnement"
      | "mails"
      | "agenda"
      | "site_inrcy"
      | "site_web"
      | "houzz"
      | "pages_jaunes"
      | "gmb"
      | "facebook"
  ) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("panel", name);
    router.push(`/dashboard?${params.toString()}`);
  };

  const closePanel = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("panel");
    const qs = params.toString();
    router.push(qs ? `/dashboard?${qs}` : "/dashboard");
  };

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

  const [userEmail, setUserEmail] = useState<string | null>(null);
// ✅ Site iNrCy (ownership + url + config)
const [siteInrcyOwnership, setSiteInrcyOwnership] = useState<Ownership>("none");
const [siteInrcyUrl, setSiteInrcyUrl] = useState<string>("");
const [siteInrcyContactEmail, setSiteInrcyContactEmail] = useState<string>("");
const [siteInrcySettingsText, setSiteInrcySettingsText] = useState<string>("{}");
const [siteInrcySettingsError, setSiteInrcySettingsError] = useState<string | null>(null);
  const [siteInrcyGa4Notice, setSiteInrcyGa4Notice] = useState<string | null>(null);
  const [siteInrcyGscNotice, setSiteInrcyGscNotice] = useState<string | null>(null);
  const [siteInrcyUrlNotice, setSiteInrcyUrlNotice] = useState<string | null>(null);
  const [siteWebGa4Notice, setSiteWebGa4Notice] = useState<string | null>(null);
  const [siteWebGscNotice, setSiteWebGscNotice] = useState<string | null>(null);
  const [siteWebUrlNotice, setSiteWebUrlNotice] = useState<string | null>(null);
  const [houzzUrlNotice, setHouzzUrlNotice] = useState<string | null>(null);
  const [pagesJaunesUrlNotice, setPagesJaunesUrlNotice] = useState<string | null>(null);
  const [gmbUrlNotice, setGmbUrlNotice] = useState<string | null>(null);
  const [facebookUrlNotice, setFacebookUrlNotice] = useState<string | null>(null);

  // ✅ Connexions Google (viennent de stats_integrations, pas des IDs)
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

// ✅ Houzz & Pages Jaunes (liens uniquement)
const [houzzUrl, setHouzzUrl] = useState<string>("");
const [pagesJaunesUrl, setPagesJaunesUrl] = useState<string>("");

// ✅ Google Business & Facebook (liens + connexion)
const [gmbUrl, setGmbUrl] = useState<string>("");
const [gmbConnected, setGmbConnected] = useState<boolean>(false);
const [facebookUrl, setFacebookUrl] = useState<string>("");
const [facebookConnected, setFacebookConnected] = useState<boolean>(false);

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
// - fallback de transition : site_configs (ancienne table) si une ligne n'existe pas encore
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
  const [inrcyRes, proRes, legacyRes] = await Promise.all([
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
    // fallback (ancienne table) — on ne dépend plus d'elle, mais elle évite de casser si la migration n'a pas encore été faite
    supabase
      .from("site_configs")
      .select("contact_email,settings,site_url")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const inrcyCfg = (inrcyRes.data as any | null) ?? null;
  const proCfg = (proRes.data as any | null) ?? null;
  const legacyCfg = (legacyRes.data as any | null) ?? null;

  // URL iNrCy : profile > inrcy table > legacy
  const url = (profile?.inrcy_site_url ?? inrcyCfg?.site_url ?? legacyCfg?.site_url ?? "") as string;
  setSiteInrcyUrl(url);

  // Contact email iNrCy : inrcy table > legacy
  const email = (inrcyCfg?.contact_email ?? legacyCfg?.contact_email ?? "") as string;
  setSiteInrcyContactEmail(email);

  // Settings iNrCy : inrcy table > legacy
  const inrcySettingsObj = inrcyCfg?.settings ?? legacyCfg?.settings ?? {};
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
  const proSettingsObj = proCfg?.settings ?? legacyCfg?.settings ?? {};

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

  // ✅ Houzz & Pages Jaunes (pro_tools_configs.settings.houzz / pages_jaunes)
  setHouzzUrl(((proSettingsObj as any)?.houzz ?? {})?.url ?? "");
  setPagesJaunesUrl(((proSettingsObj as any)?.pages_jaunes ?? {})?.url ?? "");

  // ✅ Google Business & Facebook (pro_tools_configs.settings.gmb / facebook)
  const gmbObj = ((proSettingsObj as any)?.gmb ?? {}) as any;
  setGmbUrl(gmbObj?.url ?? "");
  setGmbConnected(!!gmbObj?.connected);

  const fbObj = ((proSettingsObj as any)?.facebook ?? {}) as any;
  setFacebookUrl(fbObj?.url ?? "");
  setFacebookConnected(!!fbObj?.connected);

  // ✅ Connexions Google : la source de vérité est stats_integrations
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

  // ✅ Connexions Google Business & Facebook : source de vérité = stats_integrations
  try {
    const [gmbStatus, fbStatus] = await Promise.all([
      fetch("/api/integrations/google-business/status").then((r) => r.json()).catch(() => ({ connected: false })),
      fetch("/api/integrations/facebook/status").then((r) => r.json()).catch(() => ({ connected: false })),
    ]);
    setGmbConnected(!!gmbStatus?.connected);
    setFacebookConnected(!!fbStatus?.connected);
  } catch {
    // fallback : on garde l'état stocké dans settings si l'appel échoue
  }
}, [fetchGoogleConnected]);

useEffect(() => {
  loadSiteInrcy();
}, [loadSiteInrcy]);

const canViewSite = siteInrcyOwnership !== "none" && !!siteInrcyUrl;
const canConfigureSite = siteInrcyOwnership === "sold";

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
      background: "rgba(255,255,255,0.04)",
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
  const measurement = ga4MeasurementId.trim();
  const propertyIdRaw = ga4PropertyId.trim();
  if (!measurement) {
    setSiteInrcySettingsError("Renseigne un ID de mesure GA4 (ex: G-XXXXXXXXXX) avant de connecter.");
    return;
  }
  if (!propertyIdRaw || !/^\d+$/.test(propertyIdRaw)) {
    setSiteInrcySettingsError("Renseigne le Property ID GA4 (numérique) avant de connecter.");
    return;
  }
  // L'OAuth stats est séparé de l'OAuth Gmail (mails).
  window.location.href =
    "/api/integrations/google-stats/start?source=site_inrcy&product=ga4&force=1";
}, [siteInrcyOwnership, ga4MeasurementId, ga4PropertyId]);

const connectSiteInrcyGsc = useCallback(() => {
  if (siteInrcyOwnership !== "sold") {
    setSiteInrcySettingsError("Connexion Search Console indisponible : mode rented ou aucun site iNrCy.");
    return;
  }
  const property = gscProperty.trim();
  if (!property) {
    setSiteInrcySettingsError("Renseigne une propriété Search Console avant de connecter.");
    return;
  }
  window.location.href =
    "/api/integrations/google-stats/start?source=site_inrcy&product=gsc&force=1";
}, [siteInrcyOwnership, gscProperty]);


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

// ✅ Enregistrer le lien du site iNrCy (site_configs.site_url)
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

  parsed.url = siteWebUrl.trim();
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

// ✅ Houzz / Pages Jaunes (liens uniquement, stockés dans site_configs.settings)
const updateRootSettingsKey = useCallback(
  async (key: "houzz" | "pages_jaunes" | "gmb" | "facebook", nextObj: any) => {
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

const saveHouzzLink = useCallback(async () => {
  const url = houzzUrl.trim();
  await updateRootSettingsKey("houzz", { url });
  setHouzzUrlNotice("Enregistré ✓");
  window.setTimeout(() => setHouzzUrlNotice(null), 2200);
}, [houzzUrl, updateRootSettingsKey]);

const savePagesJaunesLink = useCallback(async () => {
  const url = pagesJaunesUrl.trim();
  await updateRootSettingsKey("pages_jaunes", { url });
  setPagesJaunesUrlNotice("Enregistré ✓");
  window.setTimeout(() => setPagesJaunesUrlNotice(null), 2200);
}, [pagesJaunesUrl, updateRootSettingsKey]);

const saveGmbLink = useCallback(async () => {
  const url = gmbUrl.trim();
  // Do not store OAuth credentials client-side.
  await updateRootSettingsKey("gmb", { url, connected: gmbConnected });
  setGmbUrlNotice("Enregistré ✓");
  window.setTimeout(() => setGmbUrlNotice(null), 2200);
}, [gmbUrl, gmbConnected, updateRootSettingsKey]);

const saveFacebookLink = useCallback(async () => {
  const url = facebookUrl.trim();
  // Do not store OAuth credentials client-side.
  await updateRootSettingsKey("facebook", { url, connected: facebookConnected });
  setFacebookUrlNotice("Enregistré ✓");
  window.setTimeout(() => setFacebookUrlNotice(null), 2200);
}, [facebookUrl, facebookConnected, updateRootSettingsKey]);

const connectGmbAccount = useCallback(async () => {
  // Start OAuth
  const returnTo = encodeURIComponent("/dashboard?panel=gmb");
  window.location.href = `/api/integrations/google-business/start?returnTo=${returnTo}`;
}, [gmbConnected, gmbUrl, updateRootSettingsKey]);

const disconnectGmbAccount = useCallback(async () => {
  await fetch("/api/integrations/google-business/disconnect", { method: "POST" });
  setGmbConnected(false);
  const url = gmbUrl.trim();
  await updateRootSettingsKey("gmb", { url, connected: false });
}, [gmbUrl, updateRootSettingsKey]);


  // Facebook pages (selection)
  const [fbPages, setFbPages] = useState<Array<{ id: string; name?: string; access_token?: string }>>([]);
  const [fbPagesLoading, setFbPagesLoading] = useState(false);
  const [fbSelectedPageId, setFbSelectedPageId] = useState<string>("");

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
}, [facebookConnected, facebookUrl, updateRootSettingsKey]);

const disconnectFacebookAccount = useCallback(async () => {
  await fetch("/api/integrations/facebook/disconnect", { method: "POST" });
  setFacebookConnected(false);
  const url = facebookUrl.trim();
  await updateRootSettingsKey("facebook", { url, connected: false });
}, [facebookUrl, updateRootSettingsKey]);
const loadFacebookPages = useCallback(async () => {
  if (!facebookConnected) return;
  setFbPagesLoading(true);
  try {
    const r = await fetch("/api/integrations/facebook/pages", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || "Erreur");
    setFbPages(j.pages || []);
    // preselect first if none
    if (!fbSelectedPageId && j.pages?.[0]?.id) setFbSelectedPageId(j.pages[0].id);
  } catch (e: any) {
    setGmbListError(e?.message || "Impossible de charger les établissements Google Business.");
  } finally {
    setFbPagesLoading(false);
  }
}, [facebookConnected, fbSelectedPageId]);

const saveFacebookPage = useCallback(async () => {
  const picked = fbPages.find((p) => p.id === fbSelectedPageId);
  if (!picked?.id || !picked?.access_token) return;

  await fetch("/api/integrations/facebook/select-page", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pageId: picked.id,
      pageName: picked.name || null,
      pageAccessToken: picked.access_token,
    }),
  });

  // Update local UI (connected stays true)
}, [fbPages, fbSelectedPageId]);

const loadGmbAccountsAndLocations = useCallback(async (account?: string) => {
  if (!gmbConnected) return;
  setGmbLoadingList(true);
  setGmbListError(null);
  try {
    const q = account ? `?account=${encodeURIComponent(account)}` : "";
    const r = await fetch(`/api/integrations/google-business/locations${q}`, { cache: "no-store" });
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
}, [gmbConnected, gmbLocationName]);

const saveGmbLocation = useCallback(async () => {
  if (!gmbAccountName || !gmbLocationName) return;
  const picked = gmbLocations.find((l) => l.name === gmbLocationName);
  await fetch("/api/integrations/google-business/select-location", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      accountName: gmbAccountName,
      locationName: gmbLocationName,
      locationTitle: picked?.title || null,
    }),
  });
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

  useEffect(() => {
    checkProfile();
  }, [checkProfile]);

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
  const [kpis, setKpis] = useState<null | {
    leads: { today: number; week: number; month: number };
    estimatedValue: number;
  }>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/generator/kpis", { cache: "no-store" });
        if (!res.ok) throw new Error(`KPIs fetch failed: ${res.status}`);
        const json = await res.json();
        if (!cancelled) setKpis(json);
      } catch (err) {
        console.error(err);
        if (!cancelled) setKpis(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
                : (m.key === "houzz" && viewActionRaw)
        ? {
            ...viewActionRaw,
            href: houzzUrl
              ? (houzzUrl.startsWith("http") ? houzzUrl : `https://${houzzUrl}`)
              : "#",
          }
        : (m.key === "pages_jaunes" && viewActionRaw)
        ? {
            ...viewActionRaw,
            href: pagesJaunesUrl
              ? (pagesJaunesUrl.startsWith("http") ? pagesJaunesUrl : `https://${pagesJaunesUrl}`)
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

      if (m.key === "houzz") {
        if (houzzUrl?.trim()) return { status: "connected" as ModuleStatus, text: "Connecté" };
        return { status: "available" as ModuleStatus, text: "A connecter" };
      }

      if (m.key === "pages_jaunes") {
        if (pagesJaunesUrl?.trim()) return { status: "connected" as ModuleStatus, text: "Connecté" };
        return { status: "available" as ModuleStatus, text: "A connecter" };
      }

      // Google Business + Facebook: the “connected” state should reflect OAuth integration,
      // even if the user hasn't filled the optional public URL yet.
      if (m.key === "gmb") {
        if (gmbConnected) return { status: "connected" as ModuleStatus, text: "Connecté" };
        return { status: "available" as ModuleStatus, text: "A connecter" };
      }

      if (m.key === "facebook") {
        if (facebookConnected) return { status: "connected" as ModuleStatus, text: "Connecté" };
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
            ) : m.key === "houzz" ? (
              <a
                href={houzzUrl ? (houzzUrl.startsWith("http") ? houzzUrl : `https://${houzzUrl}`) : "#"}
                className={`${styles.actionBtn} ${styles.actionView}`}
                target={houzzUrl ? "_blank" : undefined}
                rel="noreferrer"
                aria-disabled={!houzzUrl}
                style={{ opacity: !houzzUrl ? 0.5 : 1, pointerEvents: !houzzUrl ? "none" : "auto" }}
              >
                Voir la page
              </a>
            ) : m.key === "pages_jaunes" ? (
              <a
                href={pagesJaunesUrl ? (pagesJaunesUrl.startsWith("http") ? pagesJaunesUrl : `https://${pagesJaunesUrl}`) : "#"}
                className={`${styles.actionBtn} ${styles.actionView}`}
                target={pagesJaunesUrl ? "_blank" : undefined}
                rel="noreferrer"
                aria-disabled={!pagesJaunesUrl}
                style={{ opacity: !pagesJaunesUrl ? 0.5 : 1, pointerEvents: !pagesJaunesUrl ? "none" : "auto" }}
              >
                Voir la page
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
                if (m.key === "houzz") {
                  openPanel("houzz");
                  return;
                }
                if (m.key === "pages_jaunes") {
                  openPanel("pages_jaunes");
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
              disabled={m.key === "site_inrcy" ? !canConfigureSite : false}
              title={
                m.key === "site_inrcy" && !canConfigureSite
                  ? "Configuration disponible uniquement si le site est vendu"
                  : undefined
              }
            >
              Configurer
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
            <div className={styles.brandTag}>Générateur de contacts</div>
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
            {profileIncomplete && (
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

            {userMenuOpen && (
              <div className={styles.userMenuPanel} role="menu" aria-label="Menu utilisateur">
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

  {profileIncomplete && (
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
        <button className={`${styles.actionBtn} ${styles.connectBtn}`} type="button" onClick={() => router.push("/dashboard/stats")}>
          Voir les stats
        </button>
      </div>
    </div>

    <div className={`${styles.loopNode} ${styles.loopRight} ${styles.loop_purple}`}>
<span className={`${styles.loopBadge} ${styles.badgePurple}`}></span>

     <div className={styles.loopTopRow}>
  <div className={styles.loopTitle}>MAILS</div>
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

      <div className={styles.loopSub}>Toutes vos demandes arrivent ici</div>
      <div className={styles.loopActions}>
        <button
  className={`${styles.actionBtn} ${styles.connectBtn}`}
  type="button"
  onClick={() => router.push("/dashboard/mails")}
>
  Ouvrir iNr'Box
</button>
      </div>
    </div>

    <div className={`${styles.loopNode} ${styles.loopBottom} ${styles.loop_orange}`}>
<span className={`${styles.loopBadge} ${styles.badgeOrange}`}></span>

      <div className={styles.loopTopRow}>
  <div className={styles.loopTitle}>AGENDA</div>
</div>

<button
  className={styles.loopGearBtn}
  type="button"
  aria-label="Réglages Agenda"
  title="Réglages"
  onClick={() => openPanel("agenda")}
>
  <svg className={styles.loopGearSvg} viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
  <path d="M19.4 15a7.9 7.9 0 0 0 .1-1 7.9 7.9 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7.7 7.7 0 0 0-1.7-1l-.4-2.6H10l-.4 2.6a7.7 7.7 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.9 7.9 0 0 0-.1 1 7.9 7.9 0 0 0 .1 1l-2 1.5 2 3.5 2.4-1c.5.4 1.1.7 1.7 1l.4 2.6h4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.4 1 2-3.5-2-1.5Z" />
</svg>
</button>

      <div className={styles.loopSub}>Transformez les contacts en RDV</div>
      <div className={styles.loopActions}>
        <button
  className={`${styles.actionBtn} ${styles.connectBtn}`}
  type="button"
  onClick={() => router.push("/dashboard/agenda")}
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
          onClick={() => router.push("/dashboard/crm")}
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
    onClick={() => router.push("/dashboard/booster")}
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
                  onClick={() => router.push("/dashboard/devis/new")}
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
                  onClick={() => router.push("/dashboard/factures/new")}
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
    onClick={() => router.push("/dashboard/fideliser")}
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
            : panel === "profil"
            ? "Mon profil"
            : panel === "activite"
            ? "Mon activité"
            : panel === "abonnement"
            ? "Mon abonnement"
            : panel === "mails"
            ? "Réglages iNr’Box"
            : panel === "agenda"
            ? "Réglages Agenda"
            : panel === "site_inrcy"
            ? "Configuration — Site iNrCy"
            : panel === "site_web"
            ? "Configuration — Site web"
            : panel === "houzz"
            ? "Configuration — Houzz"
            : panel === "pages_jaunes"
            ? "Configuration — Pages Jaunes"
            : panel === "gmb"
            ? "Configuration — Google Business"
            : panel === "facebook"
            ? "Configuration — Facebook"
            : ""
        }
        isOpen={
          panel === "contact" ||
          panel === "profil" ||
          panel === "activite" ||
          panel === "abonnement" ||
          panel === "mails" ||
          panel === "agenda" ||
          panel === "site_inrcy"
        ||
          panel === "site_web"
        ||
          panel === "houzz"
        ||
          panel === "pages_jaunes"
        ||
          panel === "gmb"
        ||
          panel === "facebook"
        }
        onClose={closePanel}
      >
        {panel === "contact" && <ContactContent mode="drawer" />}
        {panel === "mails" && <MailsSettingsContent />}
        {panel === "agenda" && <AgendaSettingsContent />}

        {panel === "site_inrcy" && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.04)",
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
                    background: "rgba(255,255,255,0.04)",
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
                    background: "rgba(255,255,255,0.04)",
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
                    background: "rgba(255,255,255,0.04)",
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
                    background: "rgba(255,255,255,0.04)",
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
                    background: "rgba(255,255,255,0.04)",
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
                  background: "rgba(255,255,255,0.04)",
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
                    background: "rgba(255,255,255,0.04)",
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
                    background: "rgba(255,255,255,0.04)",
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
                    background: "rgba(255,255,255,0.04)",
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
                    background: "rgba(255,255,255,0.04)",
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
        
{panel === "houzz" && (
  <div style={{ display: "grid", gap: 14 }}>
    <label style={{ display: "grid", gap: 8 }}>
      <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>Lien Houzz (accessible)</span>
      <input
        value={houzzUrl}
        onChange={(e) => setHouzzUrl(e.target.value)}
        placeholder="https://www.houzz.fr/pro/..."
        style={{
          width: "100%",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(255,255,255,0.04)",
          padding: "10px 12px",
          color: "white",
          outline: "none",
        }}
      />
      <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
        Le bouton <strong>Voir la page</strong> ouvrira ce lien dans un nouvel onglet.
      </div>
    </label>

    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", alignItems: "center" }}>
  <button
    type="button"
    className={`${styles.actionBtn} ${styles.iconBtn}`}
    onClick={saveHouzzLink}
    aria-label="Enregistrer"
    title="Enregistrer"
  >
    <SaveIcon />
  </button>

  <button
    type="button"
    className={`${styles.actionBtn} ${styles.connectBtn}`}
    onClick={() => {
      const u = houzzUrl.trim();
      if (u) window.open(u.startsWith("http") ? u : `https://${u}`, "_blank", "noopener,noreferrer");
    }}
    disabled={!houzzUrl.trim()}
    title={!houzzUrl.trim() ? "Ajoute un lien pour pouvoir l\'ouvrir" : undefined}
  >
    Voir la page
  </button>
</div>

    {houzzUrlNotice && <div className={styles.successNote}>{houzzUrlNotice}</div>}
  </div>
)}

{panel === "pages_jaunes" && (
  <div style={{ display: "grid", gap: 14 }}>
    <label style={{ display: "grid", gap: 8 }}>
      <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>Lien Pages Jaunes (accessible)</span>
      <input
        value={pagesJaunesUrl}
        onChange={(e) => setPagesJaunesUrl(e.target.value)}
        placeholder="https://www.pagesjaunes.fr/pros/..."
        style={{
          width: "100%",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(255,255,255,0.04)",
          padding: "10px 12px",
          color: "white",
          outline: "none",
        }}
      />
      <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
        Le bouton <strong>Voir la page</strong> ouvrira ce lien dans un nouvel onglet.
      </div>
    </label>

    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", alignItems: "center" }}>
  <button
    type="button"
    className={`${styles.actionBtn} ${styles.iconBtn}`}
    onClick={savePagesJaunesLink}
    aria-label="Enregistrer"
    title="Enregistrer"
  >
    <SaveIcon />
  </button>

  <button
    type="button"
    className={`${styles.actionBtn} ${styles.connectBtn}`}
    onClick={() => {
      const u = pagesJaunesUrl.trim();
      if (u) window.open(u.startsWith("http") ? u : `https://${u}`, "_blank", "noopener,noreferrer");
    }}
    disabled={!pagesJaunesUrl.trim()}
    title={!pagesJaunesUrl.trim() ? "Ajoute un lien pour pouvoir l\'ouvrir" : undefined}
  >
    Voir la page
  </button>
</div>

    {pagesJaunesUrlNotice && <div className={styles.successNote}>{pagesJaunesUrlNotice}</div>}
  </div>
)}

{panel === "profil" && (
          <ProfilContent mode="drawer" onProfileSaved={checkProfile} onProfileReset={checkProfile} />
        )}

        {panel === "activite" && <ActivityContent mode="drawer" />}

        {panel === "abonnement" && <AbonnementContent mode="drawer" onOpenContact={() => openPanel("contact")} />}
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
                  background: "rgba(255,255,255,0.04)",
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
                Statut : <strong>{gmbConnected ? "Connecté" : "À connecter"}</strong>
              </span>
            </div>

            {/* Lien de la page */}
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
                <ConnectionPill connected={!!gmbUrl?.trim()} />
              </div>
              <div className={styles.blockSub}>Le bouton <strong>Voir la page</strong> de la bulle utilisera ce lien.</div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  value={gmbUrl}
                  onChange={(e) => setGmbUrl(e.target.value)}
                  placeholder="https://..."
                  style={{
                    flex: "1 1 280px",
                    minWidth: 220,
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(255,255,255,0.04)",
                    padding: "10px 12px",
                    color: "white",
                    outline: "none",
                  }}
                />

                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.iconBtn}`}
                  onClick={saveGmbLink}
                  title="Enregistrer le lien"
                  aria-label="Enregistrer le lien"
                >
                  <SaveIcon />
                </button>

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


            {/* Sélection de la page (requis pour publier) */}
            {facebookConnected ? (
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
                  <div className={styles.blockTitle}>Page à publier</div>
                  <ConnectionPill connected={!!fbSelectedPageId} />
                </div>
                <div className={styles.blockSub}>Choisis la page Facebook sur laquelle iNrCy publie.</div>

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
                      background: "rgba(255,255,255,0.04)",
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
                    Enregistrer
                  </button>
                </div>
              </div>
            ) : null}


            {/* Sélection de l'établissement (requis pour publier) */}
            {gmbConnected ? (
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
                    onClick={() => loadGmbAccountsAndLocations(gmbAccountName || undefined)}
                    disabled={gmbLoadingList}
                  >
                    {gmbLoadingList ? "Chargement..." : "Charger mes établissements"}
                  </button>

                  <select
                    value={gmbAccountName}
                    onChange={(e) => {
                      const v = e.target.value;
                      setGmbAccountName(v);
                      loadGmbAccountsAndLocations(v);
                    }}
                    style={{
                      flex: "1 1 260px",
                      minWidth: 220,
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: "rgba(255,255,255,0.04)",
                      padding: "10px 12px",
                      color: "white",
                      outline: "none",
                    }}
                  >
                    <option value="">Compte Google</option>
                    {gmbAccounts.map((a) => (
                      <option key={a.name} value={a.name}>
                        {a.accountName || a.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={gmbLocationName}
                    onChange={(e) => setGmbLocationName(e.target.value)}
                    style={{
                      flex: "1 1 320px",
                      minWidth: 220,
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: "rgba(255,255,255,0.04)",
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
                    Enregistrer
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

            {/* Connexion */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              {!gmbConnected ? (
                <button type="button" className={`${styles.actionBtn} ${styles.connectBtn}`} onClick={connectGmbAccount}>
                  Connecter Google Business
                </button>
              ) : (
                <>
                  <button type="button" className={`${styles.actionBtn} ${styles.disconnectBtn}`} onClick={disconnectGmbAccount}>
                    Déconnecter
                  </button>
                </>
              )}
            </div>
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
                  background: "rgba(255,255,255,0.04)",
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
                    background: facebookConnected ? "rgba(34,197,94,0.95)" : "rgba(148,163,184,0.9)",
                  }}
                />
                Statut : <strong>{facebookConnected ? "Connecté" : "À connecter"}</strong>
              </span>
            </div>

            {/* Lien de la page */}
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
                <ConnectionPill connected={!!facebookUrl?.trim()} />
              </div>
              <div className={styles.blockSub}>Le bouton <strong>Voir la page</strong> de la bulle utilisera ce lien.</div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  value={facebookUrl}
                  onChange={(e) => setFacebookUrl(e.target.value)}
                  placeholder="https://facebook.com/..."
                  style={{
                    flex: "1 1 280px",
                    minWidth: 220,
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(255,255,255,0.04)",
                    padding: "10px 12px",
                    color: "white",
                    outline: "none",
                  }}
                />

                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.iconBtn}`}
                  onClick={saveFacebookLink}
                  title="Enregistrer le lien"
                  aria-label="Enregistrer le lien"
                >
                  <SaveIcon />
                </button>

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
            </div>


            {/* Sélection de la page (requis pour publier) */}
            {facebookConnected ? (
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
                  <div className={styles.blockTitle}>Page à publier</div>
                  <ConnectionPill connected={!!fbSelectedPageId} />
                </div>
                <div className={styles.blockSub}>Choisis la page Facebook sur laquelle iNrCy publie.</div>

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
                      background: "rgba(255,255,255,0.04)",
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
                    Enregistrer
                  </button>
                </div>
              </div>
            ) : null}

            {/* Connexion */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              {!facebookConnected ? (
                <button type="button" className={`${styles.actionBtn} ${styles.connectBtn}`} onClick={connectFacebookAccount}>
                  Connecter Facebook
                </button>
              ) : (
                <button type="button" className={`${styles.actionBtn} ${styles.disconnectBtn}`} onClick={disconnectFacebookAccount}>
                  Déconnecter
                </button>
              )}
            </div>
          </div>
        )}

      </SettingsDrawer>

      <footer className={styles.footer}>
        <div className={styles.footerLeft}>© {new Date().getFullYear()} iNrCy</div>
      </footer>
    </main>
  );
}