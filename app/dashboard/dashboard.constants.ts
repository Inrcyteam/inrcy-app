import type { Module, GoogleSource } from "./dashboard.types";

export const MODULE_ICONS: Record<string, { src: string; alt: string }> = {
  site_inrcy: { src: "/icons/inrcy.png", alt: "iNrCy" },
  site_web: { src: "/icons/site-web.jpg", alt: "Site web" },
  facebook: { src: "/icons/facebook.png", alt: "Facebook" },
  gmb: { src: "/icons/google.jpg", alt: "Google Business" },
  instagram: { src: "/icons/instagram.jpg", alt: "Instagram" },
  linkedin: { src: "/icons/linkedin.png", alt: "LinkedIn" },
  mails: { src: "/icons/mails-inrcy-dashboard-v2.png", alt: "Mails iNrCy" },
  tiktok: { src: "/icons/tiktok.png", alt: "TikTok" },
  youtube_shorts: { src: "/icons/youtube-shorts.png", alt: "YouTube" },
  inr_agent: { src: "/icons/inr-agent.png", alt: "iNr'Agent" },
  inrbadge: { src: "/icons/inrbadge-dashboard.png", alt: "iNr'Badge" },
};

export const fluxModules: Module[] = [
  {
    key: "inrbadge",
    name: "iNr'Badge",
    description: "Mon entreprise en QR Code",
    status: "available",
    accent: "purple",
    actions: [
      { key: "view", label: "Voir mon badge", variant: "view", href: "#" },
      {
        key: "connect",
        label: "Configurer",
        variant: "connect",
        onClick: () => {},
      },
    ],
  },
  {
    key: "mails",
    name: "Mails",
    description: "Diffuse à votre réseau ✉️",
    status: "available",
    accent: "cyan",
    actions: [
      {
        key: "view",
        label: "Ouvrir iNr\'Send",
        variant: "view",
        href: "/dashboard/mails",
      },
      {
        key: "connect",
        label: "Configurer",
        variant: "connect",
        onClick: () => {},
      },
    ],
  },
  {
    key: "site_inrcy",
    name: "Site iNrCy",
    description: "Votre machine à leads ⚡",
    status: "available",
    accent: "purple",
    actions: [
      { key: "view", label: "Voir le site", variant: "view", href: "#" },
      {
        key: "ga4",
        label: "Connecter Google Analytics",
        variant: "connect",
        onClick: () => {},
      },
      {
        key: "gsc",
        label: "Connecter Search Console",
        variant: "connect",
        onClick: () => {},
      },
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
      {
        key: "ga4",
        label: "Connecter Google Analytics",
        variant: "connect",
        onClick: () => {},
      },
      {
        key: "gsc",
        label: "Connecter Search Console",
        variant: "connect",
        onClick: () => {},
      },
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
      {
        key: "connect",
        label: "Configurer",
        variant: "connect",
        onClick: () => {},
      },
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
      {
        key: "connect",
        label: "Connecter Facebook",
        variant: "connect",
        onClick: () => {},
      },
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
      {
        key: "connect",
        label: "Connecter Instagram",
        variant: "connect",
        onClick: () => {},
      },
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
      {
        key: "connect",
        label: "Connecter LinkedIn",
        variant: "connect",
        onClick: () => {},
      },
    ],
  },
  {
    key: "tiktok",
    name: "TikTok",
    description: "Développe votre audience 🎬",
    status: "available",
    accent: "pink",
    actions: [
      { key: "view", label: "Voir le compte", variant: "view", href: "#" },
      {
        key: "connect",
        label: "Configurer",
        variant: "connect",
        onClick: () => {},
      },
    ],
  },
  {
    key: "youtube_shorts",
    name: "YouTube",
    description: "Diffuse en vidéo ▶️",
    status: "available",
    accent: "pink",
    actions: [
      {
        key: "view",
        label: "Voir la chaîne",
        variant: "view",
        href: "#",
      },
      {
        key: "connect",
        label: "Configurer",
        variant: "connect",
        onClick: () => {},
      },
    ],
  },
];

export const DRAWER_TITLES = {
  contact: "Nous contacter",
  compte: "Compte iNrCytizen",
  profil: "Mon profil",
  preferences: "Préférences générales",
  inrbadge: "Réglages iNr'Badge",
  activite: "Mon activité",
  ia: "Configuration IA",
  abonnement: "Mon abonnement",
  legal: "Informations légales",
  rgpd: "Mes données (RGPD)",
  mails: "Réglages Mails",
  agenda: "Réglages iNr’Calendar",
  site_inrcy: "Configuration — Site iNrCy",
  site_web: "Configuration — Site web",
  instagram: "Configuration — Instagram",
  linkedin: "Configuration — LinkedIn",
  gmb: "Configuration — Google Business",
  facebook: "Configuration — Facebook",
  tiktok: "Configuration — TikTok",
  youtube_shorts: "Configuration — YouTube",
  inr_agent: "Configuration — iNr'Agent",
  inertie: "Mon inertie",
  boutique: "Boutique",
  parrainage: "Parrainer avec iNrCy",
  notifications: "Notifications",
  documents: "Réglages par défaut",
} as const satisfies Record<string, string>;

export const DRAWER_PANELS = new Set(Object.keys(DRAWER_TITLES));
export const GOOGLE_SOURCES: readonly GoogleSource[] = [
  "site_inrcy",
  "site_web",
] as const;
