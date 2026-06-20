"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HelpButton from "../_components/HelpButton";
import PublishAiConfigurationDrawer from "../booster/publier/components/PublishAiConfigurationDrawer";
import {
  INR_AGENT_DEFAULT_SETTINGS,
  sanitizeInrAgentSettings,
  type InrAgentAutomationSettings,
  type InrAgentChannel,
  type InrAgentFrequency,
  type InrAgentSettings,
  type InrAgentTheme,
  type InrAgentValidationMode,
} from "@/lib/inrAgentSettings";
import {
  INR_AGENT_ACTION_LABELS,
  INR_AGENT_STATUS_LABELS,
  INR_AGENT_TOOL_LABELS,
  type InrAgentActionStatus,
  type InrAgentActionType,
  type InrAgentTargetTool,
} from "@/lib/inrAgentActions";
import styles from "./agent.module.css";

type AutomationKey = "publish" | "grow" | "loyalty" | "stats";

type ChannelKey =
  | "siteInrcy"
  | "siteWeb"
  | "gmb"
  | "facebook"
  | "instagram"
  | "linkedin"
  | "tiktok"
  | "youtube"
  | "mails";

type Automation = {
  key: AutomationKey;
  title: string;
  shortTitle: string;
  iconLabel: string;
  settingsTitle: string;
  availableThemes: string[];
  availableChannels: ChannelKey[];
};

type AutomationConfig = {
  enabled: boolean;
  frequency: string;
  day: string;
  time: string;
  channels: ChannelKey[];
  themes: string[];
  validation: string;
  source: string;
};

type SelectOption<T extends string> = {
  value: T;
  label: string;
};

type AutomationSettingsOptions = {
  frequency: SelectOption<InrAgentFrequency>[];
  validation: SelectOption<InrAgentValidationMode>[];
};

type LoadState = "idle" | "loading" | "ready" | "error";
type SaveState = "idle" | "saving" | "saved" | "error";
type ActionsLoadState = "idle" | "loading" | "ready" | "error";
type ActionMutationState = "idle" | "saving";
type PrepareActionState = "idle" | "saving";
type StatsProgressState = { label: string; percent: number } | null;

type AgentImageAsset = {
  url?: string;
  src?: string;
  publicUrl?: string;
  path?: string;
  alt?: string;
  title?: string;
  name?: string;
};

type AgentPreparedAction = {
  id: string;
  automationKey: AutomationKey | null;
  actionType: InrAgentActionType;
  targetTool: InrAgentTargetTool;
  title: string;
  summary: string;
  previewText: string;
  targetChannels: string[];
  targetThemes: string[];
  recipients: unknown[];
  imageAssets: unknown[];
  payload: Record<string, unknown>;
  validationRequired: boolean;
  executionPolicy: string;
  status: InrAgentActionStatus;
  scheduledFor: string | null;
  preparedAt: string | null;
  completedAt?: string | null;
  createdAt: string | null;
};

type AgentReportDocument = {
  bucket?: string;
  storagePath?: string;
  filename?: string;
  mimeType?: string;
  bytes?: number;
  createdAt?: string;
  downloadUrl?: string;
};

type AgentStatsReport = {
  id: string;
  title: string;
  summary: string;
  createdAt: string | null;
  completedAt?: string | null;
  document: AgentReportDocument;
  runMode: "automatic" | "manual";
};

type AgentChannelPreview = {
  title: string;
  body: string;
  cta: string;
  hashtags: string[];
};

type AgentActionsResponse = {
  actions?: AgentPreparedAction[];
  tableMissing?: boolean;
  error?: string;
};

const ROBOT_SRC = "/agent/inr-agent-robot-cutout.webp";
const channelOptions: Record<ChannelKey, { name: string; src: string }> = {
  siteInrcy: { name: "Site iNrCy", src: "/icons/inrcy.png" },
  siteWeb: { name: "Site Web", src: "/icons/site-web.jpg" },
  gmb: { name: "Google Business", src: "/icons/google.jpg" },
  facebook: { name: "Facebook", src: "/icons/facebook.png" },
  instagram: { name: "Instagram", src: "/icons/instagram.jpg" },
  linkedin: { name: "LinkedIn", src: "/icons/linkedin.png" },
  tiktok: { name: "TikTok", src: "/icons/tiktok.png" },
  youtube: { name: "YouTube", src: "/icons/youtube-shorts.png" },
  mails: { name: "Mails", src: "/icons/mails-inrcy-dashboard-v2.png" },
};

const statsRubriqueOptions: Record<string, { name: string; src: string; channelKey?: ChannelKey }> = {
  "Vue globale": { name: "Vue globale", src: "/icons/stats-global.svg" },
  iNrBadge: { name: "iNrBadge", src: "/icons/inrbadge-dashboard.png" },
  Mails: { name: "Mails", src: "/icons/mails-inrcy-dashboard-v2.png", channelKey: "mails" },
  "Site iNrCy": { name: "Site iNrCy", src: "/icons/inrcy.png", channelKey: "siteInrcy" },
  "Site Web": { name: "Site Web", src: "/icons/site-web.jpg", channelKey: "siteWeb" },
  "Google Business": { name: "Google Business", src: "/icons/google.jpg", channelKey: "gmb" },
  Facebook: { name: "Facebook", src: "/icons/facebook.png", channelKey: "facebook" },
  Instagram: { name: "Instagram", src: "/icons/instagram.jpg", channelKey: "instagram" },
  LinkedIn: { name: "LinkedIn", src: "/icons/linkedin.png", channelKey: "linkedin" },
  TikTok: { name: "TikTok", src: "/icons/tiktok.png", channelKey: "tiktok" },
  YouTube: { name: "YouTube", src: "/icons/youtube-shorts.png", channelKey: "youtube" },
};



const channelOrder: ChannelKey[] = [
  "siteInrcy",
  "siteWeb",
  "gmb",
  "facebook",
  "instagram",
  "linkedin",
  "tiktok",
  "youtube",
  "mails",
];

const channelOrderRank = Object.fromEntries(
  channelOrder.map((channel, index) => [channel, index]),
) as Record<ChannelKey, number>;

function orderChannels(
  channels: ChannelKey[],
  allowedChannels?: readonly ChannelKey[],
): ChannelKey[] {
  const allowed = allowedChannels ? new Set<ChannelKey>(allowedChannels) : null;
  return Array.from(
    new Set(channels.filter((channel) => !allowed || allowed.has(channel))),
  ).sort(
    (a, b) =>
      (channelOrderRank[a] ?? Number.MAX_SAFE_INTEGER) -
      (channelOrderRank[b] ?? Number.MAX_SAFE_INTEGER),
  );
}

function toggleChannelItem(
  items: ChannelKey[],
  item: ChannelKey,
  allowedChannels: readonly ChannelKey[],
) {
  return orderChannels(toggleItem(items, item), allowedChannels);
}

const apiChannelToUi: Record<string, ChannelKey> = {
  site_inrcy: "siteInrcy",
  siteInrcy: "siteInrcy",
  site_web: "siteWeb",
  siteWeb: "siteWeb",
  gmb: "gmb",
  google_business: "gmb",
  facebook: "facebook",
  instagram: "instagram",
  linkedin: "linkedin",
  tiktok: "tiktok",
  youtube: "youtube",
  youtube_shorts: "youtube",
  mails: "mails",
  mail: "mails",
};

const channelPayloadKeys: Record<ChannelKey, string[]> = {
  siteInrcy: ["inrcy_site", "site_inrcy", "siteInrcy"],
  siteWeb: ["site_web", "siteWeb"],
  gmb: ["gmb", "google_business"],
  facebook: ["facebook"],
  instagram: ["instagram"],
  linkedin: ["linkedin"],
  tiktok: ["tiktok"],
  youtube: ["youtube_shorts", "youtube"],
  mails: ["mails", "mail"],
};

const pendingActionStatuses = new Set<InrAgentActionStatus>([
  "prepared",
  "pending_validation",
  "pending",
  "draft",
]);

const weekDays = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];

const hourOptions = [
  "06:00",
  "06:30",
  "07:00",
  "07:30",
  "08:00",
  "08:30",
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "12:00",
  "12:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
  "17:30",
  "18:00",
  "18:30",
  "19:00",
  "19:30",
  "20:00",
  "20:30",
  "21:00",
];

const settingsOptions: Record<AutomationKey, AutomationSettingsOptions> = {
  publish: {
    frequency: [
      { value: "weekly", label: "1 fois par semaine" },
      { value: "twice_weekly", label: "2 fois par semaine" },
      { value: "monthly", label: "1 fois par mois" },
    ],
    validation: [
      {
        value: "validation_required",
        label: "Validation obligatoire avant publication",
      },
      { value: "draft_only", label: "Préparer en brouillon" },
      {
        value: "notify_before_validation",
        label: "Notification avant validation",
      },
    ],
  },
  grow: {
    frequency: [
      { value: "weekly", label: "1 fois par semaine" },
      { value: "biweekly", label: "2 fois par mois" },
      { value: "monthly", label: "1 fois par mois" },
      { value: "one_off", label: "Campagne ponctuelle" },
    ],
    validation: [
      {
        value: "validation_required",
        label: "Validation obligatoire avant envoi",
      },
      { value: "draft_only", label: "Préparer en brouillon" },
      {
        value: "notify_before_validation",
        label: "Notification avant validation",
      },
    ],
  },
  loyalty: {
    frequency: [
      { value: "weekly", label: "1 fois par semaine" },
      { value: "biweekly", label: "2 fois par mois" },
      { value: "monthly", label: "1 fois par mois" },
      { value: "quarterly", label: "Chaque trimestre" },
    ],
    validation: [
      {
        value: "validation_required",
        label: "Validation obligatoire avant envoi",
      },
      { value: "draft_only", label: "Préparer en brouillon" },
      {
        value: "notify_before_validation",
        label: "Notification avant validation",
      },
    ],
  },
  stats: {
    frequency: [
      { value: "weekly", label: "Chaque semaine" },
      { value: "biweekly", label: "Tous les 15 jours" },
      { value: "monthly", label: "Chaque mois" },
      { value: "quarterly", label: "Chaque trimestre" },
    ],
    validation: [
      { value: "automatic_report", label: "Bilan automatique sans validation" },
    ],
  },
};

const automations: Automation[] = [
  {
    key: "publish",
    title: "Publier régulièrement",
    shortTitle: "Publier",
    iconLabel: "Visibilité",
    settingsTitle: "Réglages — Publier régulièrement",
    availableThemes: ["Conseils", "Réalisations", "Offres", "Actualités"],
    availableChannels: [
      "siteInrcy",
      "siteWeb",
      "gmb",
      "facebook",
      "instagram",
      "linkedin",
      "tiktok",
      "youtube",
    ],
  },
  {
    key: "grow",
    title: "Développer l’activité",
    shortTitle: "Développer",
    iconLabel: "Acquisition",
    settingsTitle: "Réglages — Développer l’activité",
    availableThemes: ["Valoriser", "Récolter", "Offrir"],
    availableChannels: ["mails"],
  },
  {
    key: "loyalty",
    title: "Fidéliser les contacts",
    shortTitle: "Fidéliser",
    iconLabel: "Relation",
    settingsTitle: "Réglages — Fidéliser les contacts",
    availableThemes: ["Informer", "Enquêter", "Suivre"],
    availableChannels: ["mails"],
  },
  {
    key: "stats",
    title: "Analyser mes statistiques",
    shortTitle: "Stats",
    iconLabel: "Pilotage",
    settingsTitle: "Réglages — Analyser mes statistiques",
    availableThemes: [
      "Vue globale",
      "iNrBadge",
      "Mails",
      "Site iNrCy",
      "Site Web",
      "Google Business",
      "Facebook",
      "Instagram",
      "LinkedIn",
      "TikTok",
      "YouTube",
    ],
    availableChannels: [],
  },
];

const robotStepsByAutomation: Record<AutomationKey, [string, string, string]> = {
  publish: [
    "J’analyse votre activité",
    "Je prépare une publication",
    "Vous validez avant publication",
  ],
  grow: [
    "J’identifie une opportunité",
    "Je prépare une campagne Propulser",
    "Vous validez avant envoi",
  ],
  loyalty: [
    "J’analyse vos contacts",
    "Je prépare une campagne Fidéliser",
    "Vous validez avant envoi",
  ],
  stats: [
    "J’analyse vos statistiques",
    "Je prépare le bilan PDF",
    "Je vous envoie le rapport",
  ],
};

const defaultConfigs: Record<AutomationKey, AutomationConfig> = {
  publish: {
    enabled: true,
    frequency: "1 fois par semaine",
    day: "Lundi",
    time: "09:00",
    channels: [
      "siteInrcy",
      "siteWeb",
      "gmb",
      "facebook",
      "instagram",
      "linkedin",
      "tiktok",
      "youtube",
    ],
    themes: ["Conseils", "Réalisations", "Offres"],
    validation: "Validation obligatoire avant publication",
    source: "Contenus déjà publiés + canaux Booster / Publier connectés",
  },
  grow: {
    enabled: false,
    frequency: "2 fois par mois",
    day: "Mercredi",
    time: "10:00",
    channels: ["mails"],
    themes: ["Valoriser", "Récolter", "Offrir"],
    validation: "Validation obligatoire avant envoi",
    source: "Publications déjà faites + rubriques Propulser",
  },
  loyalty: {
    enabled: false,
    frequency: "1 fois par mois",
    day: "Vendredi",
    time: "09:30",
    channels: ["mails"],
    themes: ["Informer", "Enquêter", "Suivre"],
    validation: "Validation obligatoire avant envoi",
    source: "Publications déjà faites + rubriques Fidéliser",
  },
  stats: {
    enabled: false,
    frequency: "Chaque semaine",
    day: "Lundi",
    time: "08:30",
    channels: [],
    themes: [
      "Vue globale",
      "Google Business",
      "Facebook",
      "Instagram",
      "LinkedIn",
    ],
    validation: "Bilan automatique",
    source: "Rubriques iNr’Stats connectées",
  },
};

const channelToApi: Record<ChannelKey, InrAgentChannel> = {
  siteInrcy: "site_inrcy",
  siteWeb: "site_web",
  gmb: "gmb",
  facebook: "facebook",
  instagram: "instagram",
  linkedin: "linkedin",
  tiktok: "tiktok",
  youtube: "youtube",
  mails: "mails",
};

const apiToChannel = Object.fromEntries(
  Object.entries(channelToApi).map(([uiKey, apiKey]) => [apiKey, uiKey]),
) as Record<InrAgentChannel, ChannelKey>;

const themeToApi: Record<string, InrAgentTheme> = {
  Conseils: "conseils",
  Réalisations: "realisations",
  Offres: "offres",
  Actualités: "actualites",
  Valoriser: "valoriser",
  Récolter: "recolter",
  Offrir: "offrir",
  Informer: "informer",
  Enquêter: "enqueter",
  Suivre: "suivre",
  "Vue globale": "vue_globale",
  iNrBadge: "inrbadge",
  Mails: "mails",
  "Site iNrCy": "site_inrcy",
  "Site Web": "site_web",
  "Google Business": "gmb",
  Facebook: "facebook",
  Instagram: "instagram",
  LinkedIn: "linkedin",
  TikTok: "tiktok",
  YouTube: "youtube",
};

const apiToTheme = Object.fromEntries(
  Object.entries(themeToApi).map(([label, apiKey]) => [apiKey, label]),
) as Record<InrAgentTheme, string>;

const dayToApi: Record<string, number> = {
  Lundi: 1,
  Mardi: 2,
  Mercredi: 3,
  Jeudi: 4,
  Vendredi: 5,
  Samedi: 6,
  Dimanche: 0,
};

const apiToDay: Record<number, string> = {
  0: "Dimanche",
  1: "Lundi",
  2: "Mardi",
  3: "Mercredi",
  4: "Jeudi",
  5: "Vendredi",
  6: "Samedi",
};

function optionLabel<T extends string>(
  options: SelectOption<T>[],
  value: T,
  fallback: string,
) {
  return options.find((option) => option.value === value)?.label ?? fallback;
}

function optionValue<T extends string>(
  options: SelectOption<T>[],
  label: string,
  fallback: T,
) {
  return options.find((option) => option.label === label)?.value ?? fallback;
}

function settingsToConfigs(
  settings: InrAgentSettings,
): Record<AutomationKey, AutomationConfig> {
  return Object.fromEntries(
    automations.map((automation) => {
      const defaults = defaultConfigs[automation.key];
      const source =
        settings.automations[automation.key] ??
        INR_AGENT_DEFAULT_SETTINGS.automations[automation.key];
      const config: AutomationConfig = {
        ...defaults,
        enabled: source.enabled,
        frequency: optionLabel(
          settingsOptions[automation.key].frequency,
          source.frequency,
          defaults.frequency,
        ),
        day: apiToDay[source.dayOfWeek] ?? defaults.day,
        time: source.time || defaults.time,
        channels: orderChannels(
          source.allowedChannels
            .map((channel) => apiToChannel[channel])
            .filter(
              (channel): channel is ChannelKey =>
                Boolean(channel) &&
                automation.availableChannels.includes(channel),
            ),
          automation.availableChannels,
        ),
        themes: source.allowedThemes
          .map((theme) => apiToTheme[theme])
          .filter(
            (theme): theme is string =>
              Boolean(theme) && automation.availableThemes.includes(theme),
          ),
        validation: optionLabel(
          settingsOptions[automation.key].validation,
          source.validationMode,
          defaults.validation,
        ),
      };

      return [automation.key, config];
    }),
  ) as Record<AutomationKey, AutomationConfig>;
}

function configToAutomationSettings(
  key: AutomationKey,
  config: AutomationConfig,
  existing: InrAgentAutomationSettings,
): InrAgentAutomationSettings {
  const options = settingsOptions[key];

  return {
    ...existing,
    enabled: config.enabled,
    frequency: optionValue(
      options.frequency,
      config.frequency,
      existing.frequency,
    ),
    dayOfWeek: dayToApi[config.day] ?? existing.dayOfWeek,
    time: config.time,
    validationMode: optionValue(
      options.validation,
      config.validation,
      existing.validationMode,
    ),
    allowedChannels: orderChannels(
      config.channels,
      automations.find((automation) => automation.key === key)?.availableChannels,
    ).map((channel) => channelToApi[channel]),
    allowedThemes: config.themes
      .map((theme) => themeToApi[theme])
      .filter((theme): theme is InrAgentTheme => Boolean(theme)),
    useImageBank: key !== "stats",
    imageRequired: key === "publish",
    recipientScope:
      key === "grow" ? "all_crm" : key === "loyalty" ? "clients" : "none",
    sourceStrategy:
      key === "publish"
        ? "published_history"
        : key === "stats"
          ? "stats_snapshot"
          : "templates",
  };
}

function configsToSettings(
  baseSettings: InrAgentSettings,
  configs: Record<AutomationKey, AutomationConfig>,
): InrAgentSettings {
  const automationsByKey = Object.fromEntries(
    automations.map((automation) => {
      const existing =
        baseSettings.automations[automation.key] ??
        INR_AGENT_DEFAULT_SETTINGS.automations[automation.key];
      return [
        automation.key,
        configToAutomationSettings(
          automation.key,
          configs[automation.key],
          existing,
        ),
      ];
    }),
  ) as InrAgentSettings["automations"];
  const automationValues = Object.values(
    automationsByKey,
  ) as InrAgentAutomationSettings[];
  const globalEnabled = automationValues.some(
    (automation) => automation.enabled,
  );

  return sanitizeInrAgentSettings({
    ...baseSettings,
    globalEnabled,
    enabled: globalEnabled,
    automations: automationsByKey,
    frequency: automationsByKey.publish.frequency,
    dayOfWeek: automationsByKey.publish.dayOfWeek,
    time: automationsByKey.publish.time,
    mode: automationsByKey.publish.validationMode,
    allowedChannels: automationsByKey.publish.allowedChannels,
    useMediaLibrary: automationsByKey.publish.useImageBank,
  });
}

function inrSendFolderForAutomation(key: AutomationKey) {
  if (key === "grow") return "propulsions";
  if (key === "loyalty") return "fidelisations";
  if (key === "stats") return "stats";
  return "publications";
}

function AutomationIcon({ type }: { type: AutomationKey }) {
  if (type === "publish") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden>
        <path d="M16 36h-4a6 6 0 0 1 0-12h4" />
        <path d="M18 24 44 14v36L18 40V24Z" />
        <path d="M25 42v7a5 5 0 0 0 5 5h3" />
        <path d="M49 24c3 3 3 13 0 16" />
      </svg>
    );
  }

  if (type === "grow") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden>
        <path d="M34 37 23 26c6-11 16-17 30-16-1 14-7 24-19 27Z" />
        <path d="M25 35 14 46" />
        <path d="M21 43 15 49" />
        <path d="M37 16l11 11" />
        <path d="M20 28H10l9-9" />
        <path d="M36 44v10l9-9" />
      </svg>
    );
  }

  if (type === "loyalty") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden>
        <path d="M32 51S13 39 13 24c0-7 5-12 12-12 4 0 7 2 9 5 2-3 5-5 9-5 7 0 12 5 12 12 0 15-23 27-23 27Z" />
        <path d="M21 37h9l4-8 5 12 4-7h8" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 64" aria-hidden>
      <path d="M14 50V34h9v16h-9Z" />
      <path d="M28 50V22h9v28h-9Z" />
      <path d="M42 50V12h9v38h-9Z" />
    </svg>
  );
}

function AutomationSettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 7.8V12l3 1.9" />
      <path d="M5.2 4.8 3.8 3.4" />
      <path d="M18.8 4.8l1.4-1.4" />
      <path d="M7.2 20.4h9.6" />
      <path d="M4 15.5h3" />
      <path d="M17 15.5h3" />
    </svg>
  );
}

function ImageMetaIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="4" y="5" width="16" height="14" rx="3" />
      <path d="m7 16 4-4 3 3 2-2 3 3" />
      <path d="M8.5 9.5h.1" />
    </svg>
  );
}

function CalendarMetaIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M4 10h16" />
      <path d="M9 14h.1" />
      <path d="M13 14h.1" />
    </svg>
  );
}

function ValidateActionIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="m6.8 12.4 3.2 3.2 7.2-7.4" />
    </svg>
  );
}

function RefuseActionIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="m8 8 8 8" />
      <path d="m16 8-8 8" />
    </svg>
  );
}

function DownloadActionIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 4v10" />
      <path d="m8 11 4 4 4-4" />
      <path d="M5 19h14" />
    </svg>
  );
}


function SparkSettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 3v4" />
      <path d="M12 17v4" />
      <path d="M3 12h4" />
      <path d="M17 12h4" />
      <path d="m5.6 5.6 2.8 2.8" />
      <path d="m15.6 15.6 2.8 2.8" />
      <path d="m18.4 5.6-2.8 2.8" />
      <path d="m8.4 15.6-2.8 2.8" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  );
}

function SendPlaneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M21 3 10 14" />
      <path d="m21 3-7 18-4-7-7-4 18-7Z" />
    </svg>
  );
}

function ShieldLineIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 3 5.5 5.8v5.8c0 4.1 2.7 7.8 6.5 9.4 3.8-1.6 6.5-5.3 6.5-9.4V5.8L12 3Z" />
      <path d="m9.4 11.9 1.9 1.9 3.4-3.7" />
    </svg>
  );
}

function toggleItem<T extends string>(items: T[], item: T) {
  return items.includes(item)
    ? items.filter((current) => current !== item)
    : [...items, item];
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function firstSafeString(...values: unknown[]): string {
  for (const value of values) {
    const candidate = safeString(value);
    if (candidate) return candidate;
  }
  return "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractImageAsset(
  action: AgentPreparedAction,
): AgentImageAsset | null {
  const directAsset = action.imageAssets
    .map((asset) => {
      if (typeof asset === "string") return { url: asset };
      return asRecord(asset) as AgentImageAsset | null;
    })
    .find((asset): asset is AgentImageAsset => Boolean(asset));

  if (directAsset) return directAsset;

  const payload = action.payload || {};
  const candidates = [
    payload.image,
    payload.imageAsset,
    payload.selectedImage,
    payload.visual,
    payload.cover,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string") return { url: candidate };
    const record = asRecord(candidate);
    if (record) return record as AgentImageAsset;
  }

  return null;
}

function imageAssetUrl(asset: AgentImageAsset | null): string {
  if (!asset) return "";
  return firstSafeString(asset.url, asset.publicUrl, asset.src, asset.path);
}

function imageAssetAlt(asset: AgentImageAsset | null): string {
  if (!asset) return "Aperçu du visuel préparé";
  return (
    firstSafeString(asset.alt, asset.title, asset.name) ||
    "Aperçu du visuel préparé"
  );
}

function extractPreviewText(action: AgentPreparedAction): string {
  const payload = action.payload || {};
  const postByChannel = asRecord(payload.postByChannel);
  const firstPost = postByChannel
    ? Object.values(postByChannel)
        .map((value) => {
          if (typeof value === "string") return value;
          const record = asRecord(value);
          return firstSafeString(
            record?.content,
            record?.text,
            record?.caption,
            record?.body,
          );
        })
        .find(Boolean)
    : "";

  return firstSafeString(
    action.previewText,
    payload.previewText,
    payload.content,
    payload.body,
    payload.message,
    payload.campaignBody,
    firstPost,
    action.summary,
  );
}

function extractChannelPreview(
  action: AgentPreparedAction,
  channelKey: ChannelKey | null,
): AgentChannelPreview {
  const payload = action.payload || {};
  const postByChannel = asRecord(payload.postByChannel);

  if (channelKey && postByChannel) {
    for (const key of channelPayloadKeys[channelKey]) {
      const rawPost = postByChannel[key];

      if (typeof rawPost === "string") {
        const body = rawPost.trim();
        if (body) {
          return { title: action.title, body, cta: "", hashtags: [] };
        }
      }

      const post = asRecord(rawPost);
      if (!post) continue;

      const title = firstSafeString(post.title, post.subject, action.title);
      const body = firstSafeString(
        post.content,
        post.text,
        post.caption,
        post.body,
        post.message,
      );
      const cta = firstSafeString(post.cta, post.callToAction);
      const hashtags = Array.isArray(post.hashtags)
        ? post.hashtags
            .map((hashtag) => safeString(hashtag))
            .filter(Boolean)
            .slice(0, 8)
        : [];

      if (title || body || cta || hashtags.length) {
        return { title: title || action.title, body, cta, hashtags };
      }
    }
  }

  const title = firstSafeString(
    payload.campaignSubject,
    payload.subject,
    payload.title,
    action.title,
  );
  const body = firstSafeString(
    payload.campaignBody,
    payload.bodyText,
    payload.body,
    payload.message,
    payload.previewText,
    action.previewText,
    action.summary,
  );

  return { title, body, cta: "", hashtags: [] };
}

function previewParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}|\n-\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function channelsForAction(
  action: AgentPreparedAction,
  fallback: ChannelKey[],
): ChannelKey[] {
  const channels = action.targetChannels
    .map(
      (channel) =>
        apiChannelToUi[channel] ??
        apiChannelToUi[channel.toLowerCase?.() || ""],
    )
    .filter((channel): channel is ChannelKey => Boolean(channel));
  return channels.length > 0 ? Array.from(new Set(channels)) : fallback;
}

function targetThemesLabel(action: AgentPreparedAction): string {
  return action.targetThemes
    .map((theme) => apiToTheme[theme as InrAgentTheme] ?? theme)
    .filter(Boolean)
    .join(" · ");
}

function recipientsCountForAction(action: AgentPreparedAction | null): number {
  if (!action) return 0;
  const payloadCount = Number(action.payload?.recipientCount || 0);
  if (Number.isFinite(payloadCount) && payloadCount > 0) return Math.round(payloadCount);
  return Array.isArray(action.recipients) ? action.recipients.length : 0;
}

function formatActionDate(
  value: string | null,
  fallback: AutomationConfig,
): string {
  if (!value) return `${fallback.day} ${fallback.time}`;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return `${fallback.day} ${fallback.time}`;

  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}


function extractReportDocument(action: AgentPreparedAction): AgentReportDocument | null {
  const payload = action.payload || {};
  const report = asRecord(payload.reportDocument);
  if (!report) return null;

  const storagePath = firstSafeString(
    report.storagePath,
    report.storage_path,
    report.path,
  );
  const downloadUrl = firstSafeString(
    report.downloadUrl,
    report.url,
    report.signedUrl,
  );

  if (!storagePath && !downloadUrl) return null;

  return {
    bucket: firstSafeString(report.bucket),
    storagePath,
    filename: firstSafeString(report.filename) || "bilan-inrstats.pdf",
    mimeType: firstSafeString(report.mimeType, report.mime_type) || "application/pdf",
    bytes: Number(report.bytes || 0) || 0,
    createdAt: firstSafeString(report.createdAt, report.created_at) || action.createdAt || undefined,
    downloadUrl,
  };
}

function reportRunMode(action: AgentPreparedAction): "automatic" | "manual" {
  const payload = action.payload || {};
  const mode = firstSafeString(
    payload.runMode,
    payload.reportRunMode,
    payload.executionMode,
  ).toLowerCase();
  return mode === "manual" ? "manual" : "automatic";
}

function statsReportsFromActions(
  actions: AgentPreparedAction[],
  options: { automaticOnly?: boolean; limit?: number } = {},
): AgentStatsReport[] {
  const limit = options.limit ?? 5;

  return actions
    .filter((action) => {
      if (action.actionType !== "stats_report" || action.status !== "completed") return false;
      if (options.automaticOnly && reportRunMode(action) === "manual") return false;
      return true;
    })
    .map((action): AgentStatsReport | null => {
      const document = extractReportDocument(action);
      if (!document) return null;
      return {
        id: action.id,
        title: action.title,
        summary: action.summary,
        createdAt: action.createdAt,
        completedAt: action.completedAt ?? null,
        document,
        runMode: reportRunMode(action),
      } satisfies AgentStatsReport;
    })
    .filter((report): report is AgentStatsReport => Boolean(report))
    .slice(0, limit);
}

function statsProgressLabel(percent: number) {
  if (percent >= 100) return "Bilan envoyé";
  if (percent >= 80) return "Finalisation + envoi mail";
  if (percent >= 70) return "Stockage du bilan";
  if (percent >= 45) return "Création du PDF";
  if (percent >= 20) return "Analyse iNr’Agent";
  return "Stats";
}

function formatStatsProgress(progress: StatsProgressState) {
  if (!progress) return "";
  const spacer = progress.percent >= 100 ? " · " : "… ";
  return `${progress.label}${spacer}${progress.percent}%`;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatDateTimeLabel(value: string | null | undefined, fallback = "—") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatMiniDateLabel(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function formatReportDateLabel(value: string | null | undefined) {
  if (!value) return { date: "—", time: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "—", time: "" };
  return {
    date: new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date),
    time: new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date),
  };
}

function computeNextOccurrence(config: AutomationConfig): string | null {
  if (!config.enabled) return null;

  const weekdayMap: Record<string, number> = {
    Dimanche: 0,
    Lundi: 1,
    Mardi: 2,
    Mercredi: 3,
    Jeudi: 4,
    Vendredi: 5,
    Samedi: 6,
  };
  const targetDay = weekdayMap[config.day] ?? 1;
  const [hour, minute] = config.time.split(":").map((value) => Number(value || 0));
  const now = new Date();
  const isFirstWeekday = (date: Date) => date.getDay() === targetDay && date.getDate() <= 7;
  const isThirdWeekday = (date: Date) => date.getDay() === targetDay && date.getDate() >= 15 && date.getDate() <= 21;
  const candidateDays = config.frequency === "2 fois par semaine" ? [targetDay, (targetDay + 3) % 7] : [targetDay];

  for (let offset = 0; offset <= 120; offset += 1) {
    const candidate = new Date(now.getTime());
    candidate.setSeconds(0, 0);
    candidate.setDate(candidate.getDate() + offset);
    candidate.setHours(hour, minute, 0, 0);
    if (candidate.getTime() <= now.getTime()) continue;

    const ok =
      config.frequency === "2 fois par semaine"
        ? candidateDays.includes(candidate.getDay())
        : config.frequency === "Tous les 15 jours" || config.frequency === "2 fois par mois"
          ? isFirstWeekday(candidate) || isThirdWeekday(candidate)
          : config.frequency === "Chaque mois" || config.frequency === "1 fois par mois"
            ? isFirstWeekday(candidate)
            : config.frequency === "Chaque trimestre"
              ? [0, 3, 6, 9].includes(candidate.getMonth()) && isFirstWeekday(candidate)
              : candidate.getDay() === targetDay;

    if (ok) return candidate.toISOString();
  }

  return null;
}

export default function AgentClient() {
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState<AutomationKey>("publish");
  const [settingsKey, setSettingsKey] = useState<AutomationKey | null>(null);
  const [agentSettings, setAgentSettings] = useState<InrAgentSettings>(
    INR_AGENT_DEFAULT_SETTINGS,
  );
  const [configs, setConfigs] = useState<
    Record<AutomationKey, AutomationConfig>
  >(() => settingsToConfigs(INR_AGENT_DEFAULT_SETTINGS));
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [tableMissing, setTableMissing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [aiConfigurationOpen, setAiConfigurationOpen] = useState(false);
  const [isMobileHeader, setIsMobileHeader] = useState(false);
  const [actions, setActions] = useState<AgentPreparedAction[]>([]);
  const [actionsLoadState, setActionsLoadState] =
    useState<ActionsLoadState>("loading");
  const [actionMutationState, setActionMutationState] =
    useState<ActionMutationState>("idle");
  const [prepareActionState, setPrepareActionState] =
    useState<PrepareActionState>("idle");
  const [statsProgress, setStatsProgress] = useState<StatsProgressState>(null);
  const [selectedChannelByAction, setSelectedChannelByAction] = useState<
    Record<string, ChannelKey>
  >({});


  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobileHeader(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadSettings() {
      setLoadState("loading");

      try {
        const response = await fetch("/api/agent/settings", {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as {
          settings?: Partial<InrAgentSettings>;
          error?: string;
          tableMissing?: boolean;
        } | null;

        if (!alive) return;

        if (!response.ok) {
          throw new Error(
            payload?.error || "Réglages iNr’Agent indisponibles.",
          );
        }

        const nextSettings = sanitizeInrAgentSettings(payload?.settings);
        setAgentSettings(nextSettings);
        setConfigs(settingsToConfigs(nextSettings));
        setTableMissing((current) => current || Boolean(payload?.tableMissing));
        setLoadState("ready");
      } catch (error) {
        if (!alive) return;
        setLoadState("error");
        setNotice(
          error instanceof Error
            ? error.message
            : "Réglages iNr’Agent indisponibles.",
        );
        window.setTimeout(() => setNotice(null), 2600);
      }
    }

    loadSettings();

    return () => {
      alive = false;
    };
  }, []);
  async function refreshActions(silent = false) {
    if (!silent) setActionsLoadState("loading");

    try {
      const response = await fetch("/api/agent/actions", {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response
        .json()
        .catch(() => null)) as AgentActionsResponse | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Actions iNr’Agent indisponibles.");
      }

      setActions(Array.isArray(payload?.actions) ? payload.actions : []);
      if (payload?.tableMissing) setTableMissing(true);
      setActionsLoadState("ready");
    } catch (error) {
      setActionsLoadState("error");
      if (!silent) {
        showNotice(
          error instanceof Error
            ? error.message
            : "Actions iNr’Agent indisponibles.",
        );
      }
    }
  }

  useEffect(() => {
    refreshActions();
  }, []);

  const pendingActionsByAutomation = useMemo(() => {
    return actions.reduce<Record<AutomationKey, number>>(
      (acc, action) => {
        if (action.automationKey && pendingActionStatuses.has(action.status)) {
          acc[action.automationKey] += 1;
        }
        return acc;
      },
      { publish: 0, grow: 0, loyalty: 0, stats: 0 },
    );
  }, [actions]);

  const selectedPreparedAction = useMemo(() => {
    return (
      actions.find(
        (action) =>
          action.automationKey === selectedKey &&
          pendingActionStatuses.has(action.status),
      ) ?? null
    );
  }, [actions, selectedKey]);

  const selected = useMemo(
    () =>
      automations.find((automation) => automation.key === selectedKey) ??
      automations[0],
    [selectedKey],
  );

  const settingsAutomation = useMemo(
    () =>
      automations.find((automation) => automation.key === settingsKey) ?? null,
    [settingsKey],
  );

  const selectedConfig = configs[selected.key];
  const selectedRobotSteps = robotStepsByAutomation[selected.key];
  const settingsConfig = settingsKey ? configs[settingsKey] : null;
  const hasPreparedAction = Boolean(selectedPreparedAction);
  const preparedImage = selectedPreparedAction
    ? extractImageAsset(selectedPreparedAction)
    : null;
  const preparedImageUrl = imageAssetUrl(preparedImage);
  const selectedConfigChannels = useMemo(
    () => orderChannels(selectedConfig.channels, selected.availableChannels),
    [selected.availableChannels, selectedConfig.channels],
  );
  const preparedChannels = useMemo(
    () =>
      selectedPreparedAction
        ? orderChannels(
            channelsForAction(selectedPreparedAction, selectedConfigChannels),
            selected.availableChannels,
          )
        : [],
    [selected.availableChannels, selectedPreparedAction, selectedConfigChannels],
  );
  const preparedChannelsKey = preparedChannels.join("|");
  const displayChannels = hasPreparedAction
    ? preparedChannels
    : loadState === "loading"
      ? []
      : selectedConfigChannels;
  const selectedStatsRubriques = selected.key === "stats" && loadState !== "loading"
    ? selectedConfig.themes.filter((theme) => Boolean(statsRubriqueOptions[theme]))
    : [];
  const activePreviewChannel = selectedPreparedAction
    ? preparedChannels.includes(
        selectedChannelByAction[selectedPreparedAction.id] as ChannelKey,
      )
      ? selectedChannelByAction[selectedPreparedAction.id]
      : preparedChannels[0] ?? null
    : null;
  const activePreviewChannelLabel = activePreviewChannel
    ? channelOptions[activePreviewChannel]?.name
    : "Aperçu";
  const preparedChannelPreview = selectedPreparedAction
    ? extractChannelPreview(selectedPreparedAction, activePreviewChannel)
    : null;
  const preparedParagraphs = previewParagraphs(
    preparedChannelPreview?.body || selectedPreparedAction?.summary || "",
  );
  const preparedRecipientsCount = recipientsCountForAction(selectedPreparedAction);
  const selectedAutomationSettings = agentSettings.automations[selected.key];
  const statsReports = useMemo(
    () => statsReportsFromActions(actions, { automaticOnly: true, limit: 5 }),
    [actions],
  );
  const latestStatsReport = useMemo(
    () => statsReportsFromActions(actions, { limit: 1 })[0] ?? null,
    [actions],
  );
  const statsLastReportLabel = latestStatsReport
    ? formatDateTimeLabel(
        latestStatsReport.document.createdAt || latestStatsReport.completedAt || latestStatsReport.createdAt,
      )
    : "Aucun";
  const statsNextRunLabel = formatDateTimeLabel(
    selectedAutomationSettings?.nextRunAt ||
      (selected.key === "stats" ? computeNextOccurrence(selectedConfig) : null),
    "Programmation inactive",
  );
  const statsAutomationLabel = selectedConfig.enabled ? "Activée" : "Désactivée";
  const statsFrequencyLabel = selectedConfig.frequency || "Chaque semaine";
  const statsStoredCountLabel = `${statsReports.length}/5`;
  const footerDateLabel =
    selected.key === "stats"
      ? statsNextRunLabel
      : hasPreparedAction && selectedPreparedAction
        ? formatActionDate(selectedPreparedAction.scheduledFor, selectedConfig)
        : "—";

  useEffect(() => {
    if (!selectedPreparedAction || preparedChannels.length === 0) return;

    setSelectedChannelByAction((current) => {
      const currentChannel = current[selectedPreparedAction.id];
      if (currentChannel && preparedChannels.includes(currentChannel)) {
        return current;
      }
      return { ...current, [selectedPreparedAction.id]: preparedChannels[0] };
    });
  }, [selectedPreparedAction, preparedChannels, preparedChannelsKey]);

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2600);
  }

  function updateConfig(key: AutomationKey, patch: Partial<AutomationConfig>) {
    setConfigs((current) => ({
      ...current,
      [key]: { ...current[key], ...patch },
    }));
    setSaveState("idle");
    setNotice(null);
  }

  async function saveSettings() {
    const nextSettings = configsToSettings(agentSettings, configs);
    setSaveState("saving");
    setNotice(null);

    try {
      const response = await fetch("/api/agent/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: nextSettings }),
      });
      const payload = (await response.json().catch(() => null)) as {
        settings?: Partial<InrAgentSettings>;
        error?: string;
        tableMissing?: boolean;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Enregistrement impossible.");
      }

      const savedSettings = sanitizeInrAgentSettings(
        payload?.settings ?? nextSettings,
      );
      setAgentSettings(savedSettings);
      setConfigs(settingsToConfigs(savedSettings));
      setTableMissing((current) => current || Boolean(payload?.tableMissing));
      setSaveState("saved");
      setSettingsKey(null);
      showNotice("Réglages iNr’Agent enregistrés.");
    } catch (error) {
      setSaveState("error");
      showNotice(
        error instanceof Error ? error.message : "Enregistrement impossible.",
      );
    }
  }

  async function preparePublishAction() {
    if (prepareActionState === "saving") return;

    setPrepareActionState("saving");
    setNotice(null);

    try {
      const response = await fetch("/api/agent/actions/prepare-publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json().catch(() => null)) as {
        action?: AgentPreparedAction;
        error?: string;
        detail?: string;
      } | null;

      if (!response.ok || !payload?.action) {
        throw new Error(
          payload?.error ||
            payload?.detail ||
            "Préparation de la publication impossible.",
        );
      }

      const preparedAction = payload.action;
      setActions((current) => [
        preparedAction,
        ...current.filter((action) => action.id !== preparedAction.id),
      ]);
      setSelectedKey("publish");
      showNotice("Publication Booster préparée par iNr’Agent.");
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Préparation de la publication impossible.",
      );
    } finally {
      setPrepareActionState("idle");
    }
  }

  async function prepareCampaignAction(key: Extract<AutomationKey, "grow" | "loyalty">) {
    if (prepareActionState === "saving") return;

    setPrepareActionState("saving");
    setNotice(null);

    try {
      const response = await fetch("/api/agent/actions/prepare-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ automationKey: key }),
      });
      const payload = (await response.json().catch(() => null)) as {
        action?: AgentPreparedAction;
        error?: string;
        detail?: string;
      } | null;

      if (!response.ok || !payload?.action) {
        throw new Error(
          payload?.error ||
            payload?.detail ||
            "Préparation de la campagne impossible.",
        );
      }

      const preparedAction = payload.action;
      setActions((current) => [
        preparedAction,
        ...current.filter((action) => action.id !== preparedAction.id),
      ]);
      setSelectedKey(key);
      showNotice(
        key === "grow"
          ? "Campagne Propulser préparée par iNr’Agent."
          : "Campagne Fidéliser préparée par iNr’Agent.",
      );
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Préparation de la campagne impossible.",
      );
    } finally {
      setPrepareActionState("idle");
    }
  }

  async function sendStatsReport() {
    if (prepareActionState === "saving") return;

    setPrepareActionState("saving");
    setStatsProgress({ label: "Stats", percent: 3 });
    setNotice(null);

    let progressTimer: number | null = null;

    try {
      progressTimer = window.setInterval(() => {
        setStatsProgress((current) => {
          const currentPercent = current?.percent ?? 3;
          if (currentPercent >= 98) return current;

          const increment =
            currentPercent < 20 ? 4 :
            currentPercent < 45 ? 3 :
            currentPercent < 70 ? 2 :
            1;
          const nextPercent = Math.min(98, currentPercent + increment);
          return {
            label: statsProgressLabel(nextPercent),
            percent: nextPercent,
          };
        });
      }, 420);

      const response = await fetch("/api/agent/actions/send-stats-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json().catch(() => null)) as {
        action?: AgentPreparedAction | null;
        error?: string;
        detail?: string;
        sent?: boolean;
        recipientEmail?: string;
        filename?: string;
      } | null;

      if (!response.ok || !payload?.sent) {
        throw new Error(
          payload?.error ||
            payload?.detail ||
            "Génération ou envoi du bilan iNr’Stats impossible.",
        );
      }

      if (progressTimer) {
        window.clearInterval(progressTimer);
        progressTimer = null;
      }
      setStatsProgress({ label: "Bilan envoyé", percent: 100 });

      await refreshActions(true);
      setSelectedKey("stats");
      showNotice(
        `Bilan iNr’Stats PDF envoyé${payload.recipientEmail ? ` à ${payload.recipientEmail}` : ""}.`,
      );
      await wait(800);
    } catch (error) {
      if (progressTimer) {
        window.clearInterval(progressTimer);
        progressTimer = null;
      }
      setStatsProgress({ label: "Erreur", percent: 100 });
      showNotice(
        error instanceof Error
          ? error.message
          : "Génération ou envoi du bilan iNr’Stats impossible.",
      );
      await wait(900);
    } finally {
      if (progressTimer) window.clearInterval(progressTimer);
      setPrepareActionState("idle");
      setStatsProgress(null);
    }
  }

  async function updateActionStatus(status: "validated" | "refused") {
    if (!selectedPreparedAction || actionMutationState === "saving") return;

    setActionMutationState("saving");
    setNotice(null);

    try {
      const endpoint =
        status === "validated" ? "/api/agent/actions/execute" : "/api/agent/actions";
      const response = await fetch(endpoint, {
        method: status === "validated" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: selectedPreparedAction.id, status }),
      });
      const payload = (await response.json().catch(() => null)) as {
        action?: AgentPreparedAction;
        error?: string;
        tableMissing?: boolean;
        executed?: boolean;
        publishResult?: {
          summary?: {
            successCount?: number;
            failureCount?: number;
          };
        };
        campaignResult?: {
          queued?: number;
          campaignStatus?: string;
        };
      } | null;

      if (!response.ok) {
        if (payload?.action) {
          const failedAction = payload.action;
          setActions((current) =>
            current.map((action) =>
              action.id === failedAction.id ? failedAction : action,
            ),
          );
        }
        throw new Error(
          payload?.error || "Mise à jour de l’action impossible.",
        );
      }

      if (payload?.tableMissing) setTableMissing(true);
      if (payload?.action) {
        const updatedAction = payload.action;
        setActions((current) =>
          current.map((action) =>
            action.id === updatedAction.id ? updatedAction : action,
          ),
        );
      } else {
        setActions((current) =>
          current.map((action) =>
            action.id === selectedPreparedAction.id
              ? { ...action, status }
              : action,
          ),
        );
      }

      if (status === "validated") {
        const campaignQueued = Number(payload?.campaignResult?.queued || 0);
        if (campaignQueued > 0) {
          showNotice(
            `Campagne exécutée : ${campaignQueued} destinataire${campaignQueued > 1 ? "s" : ""} en file d’envoi.`,
          );
        } else {
          const summary = payload?.publishResult?.summary;
          const successCount = Number(summary?.successCount || 0);
          const failureCount = Number(summary?.failureCount || 0);
          showNotice(
            successCount > 0
              ? `Publication exécutée : ${successCount} canal${successCount > 1 ? "aux" : ""} publié${successCount > 1 ? "s" : ""}${failureCount > 0 ? `, ${failureCount} échec${failureCount > 1 ? "s" : ""}` : ""}.`
              : "Action validée et exécutée par iNr’Agent.",
          );
        }
      } else {
        showNotice("Action refusée. Rien ne sera exécuté.");
      }
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Mise à jour de l’action impossible.",
      );
    } finally {
      setActionMutationState("idle");
    }
  }

  return (
    <main className={styles.agentPage}>
      <PublishAiConfigurationDrawer
        open={aiConfigurationOpen}
        isMobile={isMobileHeader}
        drawerHeight="100dvh"
        onClose={() => setAiConfigurationOpen(false)}
      />
      <section
        className={styles.agentCanvas}
        aria-label="iNr’Agent - automatisations"
      >
        <header className={styles.moduleHeader}>
          <div className={styles.moduleTitleBlock}>
            <img
              className={styles.moduleLogo}
              src="/icons/inr-agent-header.png"
              alt="iNr’Agent"
              width={68}
              height={68}
              loading="eager"
              decoding="sync"
            />
            <div className={styles.moduleTitleText}>
              <h1>iNr’Agent</h1>
              <p className={styles.moduleSubtitleDesktop}>Programmateur d’automatisations connecté à vos outils.</p>
            </div>
          </div>

          <p className={styles.moduleSubtitleMobile}>Programmateur d’automatisations connecté à vos outils.</p>

          <div className={styles.moduleHeaderActions}>
            {loadState === "loading" && (
              <span className={styles.headerSyncPill}>Synchronisation...</span>
            )}
            {tableMissing && (
              <span className={styles.headerWarningPill}>
                Tables Supabase à créer
              </span>
            )}
            <HelpButton
              onClick={() => setHelpOpen(true)}
              title="Aide iNr’Agent"
              size={34}
            />
            <button
              type="button"
              className={styles.headerAiButton}
              onClick={() => setAiConfigurationOpen(true)}
              aria-label="Configuration IA"
              title="Configurer le style des contenus générés"
            >
              IA
            </button>
            <button
              type="button"
              className={styles.headerInrSendButton}
              onClick={() => router.push(`/dashboard/mails?folder=${inrSendFolderForAutomation(selected.key)}`)}
              aria-label="Ouvrir iNr'Send"
              title="Voir l’historique des actions réalisées"
            >
              <span className={styles.headerInrSendLabel}>iNr'Send</span>
              <img
                className={styles.headerInrSendLogo}
                src="/inrsend-logo-seul.png"
                alt=""
                aria-hidden
                width={34}
                height={34}
                loading="eager"
                decoding="sync"
              />
            </button>
            <button
              type="button"
              className={styles.headerCloseButton}
              onClick={() => router.push("/dashboard")}
              title="Retour au tableau de bord"
            >
              Fermer
            </button>
          </div>
        </header>

        <nav
          className={styles.automationGrid}
          aria-label="Automatisations iNr’Agent"
        >
          {automations.map((automation) => {
            const selectedCard = automation.key === selectedKey;
            const active = configs[automation.key].enabled;

            return (
              <article
                key={automation.key}
                data-automation={automation.key}
                className={`${styles.automationCard} ${selectedCard ? styles.automationCardActive : ""}`}
              >
                <button
                  type="button"
                  className={styles.automationSelect}
                  onClick={() => setSelectedKey(automation.key)}
                  aria-pressed={selectedCard}
                >
                  <span className={styles.cardIcon} aria-hidden>
                    <AutomationIcon type={automation.key} />
                  </span>
                  <span className={styles.cardTitle}>
                    <span className={styles.cardTitleFull}>{automation.title}</span>
                    <span className={styles.cardTitleShort}>{automation.shortTitle}</span>
                  </span>
                  {pendingActionsByAutomation[automation.key] > 0 && (
                    <span className={styles.cardPendingCount}>
                      {pendingActionsByAutomation[automation.key]} à valider
                    </span>
                  )}
                  {active && (
                    <span
                      className={styles.cardStatus}
                      aria-label="Automatisation activée"
                    />
                  )}
                </button>
                <button
                  type="button"
                  className={styles.settingsButton}
                  onClick={() => setSettingsKey(automation.key)}
                  aria-label={`Programmer — ${automation.title}`}
                  title="Programmer cette automatisation"
                >
                  <AutomationSettingsIcon />
                </button>
              </article>
            );
          })}
        </nav>

        <div className={styles.mainGrid}>
          <aside
            className={styles.robotCard}
            aria-label="Fonctionnement iNr’Agent"
          >
            <div className={styles.robotHalo} aria-hidden>
              <span className={styles.starOne} />
              <span className={styles.starTwo} />
              <span className={styles.starThree} />
              <span className={styles.starFour} />
              <span className={styles.starFive} />
              <span className={styles.starSix} />
              <span className={styles.starSeven} />
              <span className={styles.starEight} />
              <span className={styles.starNine} />
              <img
                src={ROBOT_SRC}
                alt=""
                width={824}
                height={900}
                loading="eager"
                decoding="sync"
                fetchPriority="high"
              />
            </div>

            <ol className={styles.robotSteps}>
              {selectedRobotSteps.map((step, index) => (
                <li key={`${selected.key}-step-${index + 1}`}>
                  <span>{index + 1}</span>
                  <strong>{step}</strong>
                </li>
              ))}
            </ol>
          </aside>

          <div className={styles.workColumn}>
            <section
              className={styles.previewCard}
              aria-label="Aperçu de l’action préparée"
            >
              <div className={styles.previewBody}>
              {selected.key === "stats" ? (
                <div className={styles.statsPreview}>
                  <div className={styles.statsHeadCard}>
                    <span className={styles.statsHeadIcon} aria-hidden>
                      <AutomationIcon type="stats" />
                    </span>
                    <div className={styles.statsHeadCopy}>
                      <h3>Votre bilan iNr’Stats</h3>
                      <p className={styles.statsLead}>
                        iNr’Agent analyse vos données et vous envoie un bilan PDF automatiquement.
                      </p>
                    </div>
                  </div>

                  <div className={styles.statsTopGrid}>
                    <article className={`${styles.statsMiniCard} ${styles.statsMiniCardGreen}`}>
                      <span className={styles.statsMiniIcon} aria-hidden><SparkSettingsIcon /></span>
                      <small>Automatisation</small>
                      <strong>{statsAutomationLabel}</strong>
                    </article>
                    <article className={`${styles.statsMiniCard} ${styles.statsMiniCardBlue}`}>
                      <span className={styles.statsMiniIcon} aria-hidden><CalendarMetaIcon /></span>
                      <small>Fréquence</small>
                      <strong>{statsFrequencyLabel}</strong>
                    </article>
                    <article className={`${styles.statsMiniCard} ${styles.statsMiniCardViolet}`}>
                      <span className={styles.statsMiniIcon} aria-hidden><CalendarMetaIcon /></span>
                      <small>Prochain bilan</small>
                      <strong>{statsNextRunLabel}</strong>
                    </article>
                    <article className={`${styles.statsMiniCard} ${styles.statsMiniCardSky}`}>
                      <span className={styles.statsMiniIcon} aria-hidden><SendPlaneIcon /></span>
                      <small>Dernier bilan</small>
                      <strong>{statsLastReportLabel}</strong>
                    </article>
                    <article className={`${styles.statsMiniCard} ${styles.statsMiniCardPink}`}>
                      <span className={styles.statsMiniIcon} aria-hidden><ShieldLineIcon /></span>
                      <small>Bilans conservés</small>
                      <strong>{statsStoredCountLabel}</strong>
                    </article>
                  </div>

                  <div className={styles.statsActionRow}>
                    <button
                      type="button"
                      className={styles.prepareButton}
                      onClick={() => router.push("/dashboard/stats")}
                      title="Consulter les statistiques et générer un bilan manuel"
                    >
                      <span aria-hidden><AutomationIcon type="stats" /></span>
                      iNr’Stats
                    </button>
                    {latestStatsReport?.document.downloadUrl ? (
                      <a
                        href={latestStatsReport.document.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.statsPrimaryLink}
                      >
                        <span aria-hidden><DownloadActionIcon /></span>
                        Télécharger le dernier bilan
                      </a>
                    ) : (
                      <button type="button" className={styles.statsSecondaryButton} disabled>
                        <span aria-hidden><DownloadActionIcon /></span>
                        Télécharger le dernier bilan
                      </button>
                    )}
                  </div>

                  <div className={styles.statsHistorySection}>
                    <div className={styles.statsHistoryHeader}>
                      <h4>5 derniers bilans auto</h4>
                    </div>
                    <div className={styles.statsHistoryRow}>
                      {Array.from({ length: 5 }).map((_, index) => {
                        const report = statsReports[index];
                        return report ? (
                          <a
                            key={report.id}
                            href={report.document.downloadUrl || "#"}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.statsHistoryItem}
                            aria-label={`Télécharger le bilan du ${formatMiniDateLabel(report.document.createdAt || report.completedAt || report.createdAt)}`}
                          >
                            <span className={styles.statsHistoryIcon} aria-hidden>
                              <DownloadActionIcon />
                            </span>
                            <span className={styles.statsHistoryDate}>
                              <strong>{formatReportDateLabel(report.document.createdAt || report.completedAt || report.createdAt).date}</strong>
                              <small>{formatReportDateLabel(report.document.createdAt || report.completedAt || report.createdAt).time}</small>
                            </span>
                          </a>
                        ) : (
                          <div key={`stats-empty-${index}`} className={`${styles.statsHistoryItem} ${styles.statsHistoryItemEmpty}`}>
                            <span className={styles.statsHistoryIcon} aria-hidden>
                              <DownloadActionIcon />
                            </span>
                            <span className={styles.statsHistoryDate}>—</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : hasPreparedAction && selectedPreparedAction ? (
                <div
                  key={`${selectedPreparedAction.id}-${activePreviewChannel || "global"}`}
                  className={styles.preparedPreview}
                >
                  {preparedImageUrl ? (
                    <div className={styles.previewImageWrap}>
                      <img
                        src={preparedImageUrl}
                        alt={imageAssetAlt(preparedImage)}
                        loading="eager"
                        decoding="sync"
                      />
                    </div>
                  ) : (
                    <div className={styles.previewImageFallback}>
                      <ImageMetaIcon />
                      <span>Aucune image obligatoire pour cette action</span>
                    </div>
                  )}
                  <div className={styles.previewText}>
                    <div className={styles.previewBadgeRow}>
                      <span>Aperçu {activePreviewChannelLabel}</span>
                      <span>
                        {
                          INR_AGENT_ACTION_LABELS[
                            selectedPreparedAction.actionType
                          ]
                        }
                      </span>
                      <span>
                        {
                          INR_AGENT_TOOL_LABELS[
                            selectedPreparedAction.targetTool
                          ]
                        }
                      </span>
                      <span>
                        {INR_AGENT_STATUS_LABELS[selectedPreparedAction.status]}
                      </span>
                    </div>
                    <h3>
                      {preparedChannelPreview?.title || selectedPreparedAction.title}
                    </h3>
                    {preparedParagraphs.length > 0 ? (
                      preparedParagraphs.map((paragraph, index) => (
                        <p
                          key={`${selectedPreparedAction.id}-${activePreviewChannel || "global"}-paragraph-${index}`}
                        >
                          {paragraph}
                        </p>
                      ))
                    ) : (
                      <p>{selectedPreparedAction.summary}</p>
                    )}
                    {preparedChannelPreview?.cta && (
                      <small className={styles.previewCta}>
                        Appel à l’action : {preparedChannelPreview.cta}
                      </small>
                    )}
                    {preparedChannelPreview?.hashtags.length ? (
                      <small className={styles.previewHashtags}>
                        {preparedChannelPreview.hashtags
                          .map((hashtag) => `#${hashtag.replace(/^#+/, "")}`)
                          .join(" ")}
                      </small>
                    ) : null}
                    {targetThemesLabel(selectedPreparedAction) && (
                      <small className={styles.previewTheme}>
                        Thème : {targetThemesLabel(selectedPreparedAction)}
                      </small>
                    )}
                    {preparedRecipientsCount > 0 && (
                      <small className={styles.previewRecipients}>
                        Destinataires proposés : {preparedRecipientsCount} contact{preparedRecipientsCount > 1 ? "s" : ""} CRM
                      </small>
                    )}
                  </div>
                </div>
              ) : (
                <div className={styles.emptyPreview}>
                  <span className={styles.emptyOrb} aria-hidden>
                    <AutomationIcon type={selected.key} />
                  </span>
                  <h3>Aucune action préparée</h3>
                  <p>
                    Quand iNr’Agent aura préparé la prochaine action, l’aperçu
                    s’affichera ici. Sélectionnez ensuite un canal en dessous
                    pour contrôler le contenu prévu canal par canal.
                  </p>
                  <small>
                    {actionsLoadState === "loading"
                      ? "Recherche des actions préparées..."
                      : `Automatisation sélectionnée : ${selected.title}`}
                  </small>
                  {selected.key === "publish" && (
                    <button
                      type="button"
                      className={styles.prepareButton}
                      onClick={preparePublishAction}
                      disabled={
                        prepareActionState === "saving" ||
                        actionsLoadState === "loading" ||
                        loadState === "loading"
                      }
                    >
                      {prepareActionState === "saving"
                        ? "Préparation en cours..."
                        : "Préparer une publication"}
                    </button>
                  )}
                  {(selected.key === "grow" || selected.key === "loyalty") && (
                    <button
                      type="button"
                      className={styles.prepareButton}
                      onClick={() => prepareCampaignAction(selected.key === "grow" ? "grow" : "loyalty")}
                      disabled={
                        prepareActionState === "saving" ||
                        actionsLoadState === "loading" ||
                        loadState === "loading"
                      }
                    >
                      {prepareActionState === "saving"
                        ? "Préparation en cours..."
                        : selected.key === "grow"
                          ? "Préparer une campagne Propulser"
                          : "Préparer une campagne Fidéliser"}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className={`${styles.previewMeta} ${selected.key === "stats" ? styles.previewMetaStats : ""}`}>
              <div className={`${styles.metaItem} ${styles.channelsItem}`}>
                <small>{selected.key === "stats" ? "Sources :" : "Canaux :"}</small>
                <div className={styles.channelScroller}>
                  {selected.key === "stats" && selectedStatsRubriques.length > 0 ? (
                    selectedStatsRubriques.map((theme) => {
                      const rubrique = statsRubriqueOptions[theme];
                      return (
                        <button
                          type="button"
                          key={theme}
                          data-channel={
                            rubrique.channelKey ||
                            (theme === "Vue globale"
                              ? "stats-global"
                              : theme === "iNrBadge"
                                ? "inrbadge"
                                : "stats")
                          }
                          disabled
                          aria-label={rubrique.name}
                          title={rubrique.name}
                        >
                          <img src={rubrique.src} alt="" loading="eager" decoding="sync" aria-hidden />
                        </button>
                      );
                    })
                  ) : displayChannels.length > 0 ? (
                    displayChannels.map((channelKey) => {
                      const channel = channelOptions[channelKey];
                      const activeChannel = channelKey === activePreviewChannel;
                      return (
                        <button
                          type="button"
                          key={channelKey}
                          data-channel={channelKey}
                          className={activeChannel ? styles.channelPillActive : ""}
                          onClick={() => {
                            if (!selectedPreparedAction) return;
                            setSelectedChannelByAction((current) => ({
                              ...current,
                              [selectedPreparedAction.id]: channelKey,
                            }));
                          }}
                          disabled={!selectedPreparedAction}
                          aria-label={`Afficher l’aperçu ${channel.name}`}
                          title={channel.name}
                        >
                          <img src={channel.src} alt="" loading="eager" decoding="sync" aria-hidden />
                        </button>
                      );
                    })
                  ) : (
                    <strong>—</strong>
                  )}
                </div>
              </div>
              <div
                className={`${styles.metaItem} ${styles.dateItem}`}
                title={selected.key === "stats" ? "Prochain bilan automatique" : "Date programmée"}
              >
                <span className={styles.metaIcon} aria-hidden>
                  <CalendarMetaIcon />
                </span>
                <span>
                  <strong>{footerDateLabel}</strong>
                </span>
              </div>
              {selected.key === "stats" ? (
                <div className={styles.statsFooterNote}>
                  <small>Validation non requise</small>
                </div>
              ) : (
                <div className={styles.previewActions}>
                  <button
                    type="button"
                    className={styles.validateButton}
                    disabled={!hasPreparedAction || actionMutationState === "saving"}
                    onClick={() => updateActionStatus("validated")}
                  >
                    <span aria-hidden><ValidateActionIcon /></span>
                    {actionMutationState === "saving" ? "Traitement..." : "Valider"}
                  </button>
                  <button
                    type="button"
                    className={styles.refuseButton}
                    disabled={!hasPreparedAction || actionMutationState === "saving"}
                    onClick={() => updateActionStatus("refused")}
                  >
                    <span aria-hidden><RefuseActionIcon /></span>
                    {actionMutationState === "saving" ? "Traitement..." : "Refuser"}
                  </button>
                </div>
              )}
            </div>

            </section>
          </div>
        </div>
      </section>

      {helpOpen && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setHelpOpen(false)}
        >
          <section
            className={`${styles.settingsModal} ${styles.helpModal}`}
            role="dialog"
            aria-modal="true"
            aria-label="Aide iNr’Agent"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setHelpOpen(false)}
              aria-label="Fermer"
            >
              ×
            </button>
            <p className={styles.modalEyebrow}>Helper</p>
            <h2>Qu’est-ce qu’iNr’Agent&nbsp;?</h2>
            <div className={styles.helpContent}>
              <p>
                iNr’Agent est votre programmateur d’automatisations. Il prépare
                des actions avec vos outils iNrCy, affiche un aperçu clair, puis
                vous gardez la main avec Valider ou Refuser quand une validation
                est nécessaire.
              </p>
              <ul>
                <li>
                  <strong>Publier régulièrement</strong> prépare des
                  publications avec Booster / Publier sur vos canaux connectés.
                  L’aperçu se consulte canal par canal grâce au sélecteur situé
                  sous la zone de prévisualisation.
                </li>
                <li>
                  <strong>Développer l’activité</strong> prépare des campagnes
                  Propulser par mail, basées sur vos contenus et templates.
                </li>
                <li>
                  <strong>Fidéliser les contacts</strong> prépare des campagnes
                  Fidéliser par mail pour garder le lien avec le CRM.
                </li>
                <li>
                  <strong>Analyser mes statistiques</strong> génère un bilan
                  iNr’Stats PDF multi-pages et l’envoie automatiquement au pro
                  selon les réglages.
                </li>
              </ul>
              <p>
                Les roues de réglages permettent de choisir la fréquence, le
                jour, l’horaire, les rubriques et le mode de validation de
                chaque automatisation. Une fois exécutées, les communications
                restent dans l’historique central iNr’Send, avec la pastille
                iNr’Agent quand elles viennent de l’automatisation.
              </p>
            </div>
          </section>
        </div>
      )}

      {settingsAutomation && settingsConfig && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setSettingsKey(null)}
        >
          <section
            className={styles.settingsModal}
            role="dialog"
            aria-modal="true"
            aria-label={settingsAutomation.settingsTitle}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setSettingsKey(null)}
              aria-label="Fermer"
            >
              ×
            </button>
            <p className={styles.modalEyebrow}>Automatisation</p>
            <h2>{settingsAutomation.settingsTitle}</h2>

            <label className={styles.switchLine}>
              <span>
                <strong>Statut</strong>
                <small>
                  {settingsConfig.enabled
                    ? "Le robot peut préparer cette action."
                    : "Cette automatisation est en pause."}
                </small>
              </span>
              <input
                type="checkbox"
                checked={settingsConfig.enabled}
                onChange={(event) =>
                  updateConfig(settingsAutomation.key, {
                    enabled: event.target.checked,
                  })
                }
              />
            </label>

            <div className={styles.modalGrid}>
              <label>
                <span>Fréquence</span>
                <select
                  value={settingsConfig.frequency}
                  onChange={(event) =>
                    updateConfig(settingsAutomation.key, {
                      frequency: event.target.value,
                    })
                  }
                >
                  {settingsOptions[settingsAutomation.key].frequency.map(
                    (frequency) => (
                      <option key={frequency.value} value={frequency.label}>
                        {frequency.label}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                <span>Jour</span>
                <select
                  value={settingsConfig.day}
                  onChange={(event) =>
                    updateConfig(settingsAutomation.key, {
                      day: event.target.value,
                    })
                  }
                >
                  {weekDays.map((day) => (
                    <option key={day}>{day}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Horaire</span>
                <select
                  value={settingsConfig.time}
                  onChange={(event) =>
                    updateConfig(settingsAutomation.key, {
                      time: event.target.value,
                    })
                  }
                >
                  {hourOptions.map((hour) => (
                    <option key={hour}>{hour}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Validation</span>
                <select
                  value={settingsConfig.validation}
                  onChange={(event) =>
                    updateConfig(settingsAutomation.key, {
                      validation: event.target.value,
                    })
                  }
                >
                  {settingsOptions[settingsAutomation.key].validation.map(
                    (validation) => (
                      <option key={validation.value} value={validation.label}>
                        {validation.label}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>

            {settingsAutomation.availableChannels.length > 0 && (
              <div className={styles.modalSection}>
                <span>
                  {settingsAutomation.key === "publish"
                    ? "Canaux Booster / Publier"
                    : "Canal"}
                </span>
                {settingsAutomation.key !== "publish" && (
                  <small className={styles.modalHint}>
                    Propulser et Fidéliser utilisent uniquement Mails.
                  </small>
                )}
                <div className={styles.choiceGrid}>
                  {settingsAutomation.availableChannels.map((channelKey) => {
                    const channel = channelOptions[channelKey];
                    const checked =
                      settingsConfig.channels.includes(channelKey);
                    return (
                      <button
                        type="button"
                        key={channelKey}
                        data-channel={channelKey}
                        className={checked ? styles.choiceActive : ""}
                        onClick={() =>
                          updateConfig(settingsAutomation.key, {
                            channels: toggleChannelItem(
                              settingsConfig.channels,
                              channelKey,
                              settingsAutomation.availableChannels,
                            ),
                          })
                        }
                      >
                        <img src={channel.src} alt="" loading="eager" decoding="async" />
                        {channel.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className={styles.modalSection}>
              <span>
                {settingsAutomation.key === "stats"
                  ? "Rubriques iNr’Stats"
                  : settingsAutomation.key === "grow"
                    ? "Rubriques Propulser"
                    : settingsAutomation.key === "loyalty"
                      ? "Rubriques Fidéliser"
                      : "Thèmes"}
              </span>
              <div className={styles.choiceGrid}>
                {settingsAutomation.availableThemes.map((theme) => {
                  const checked = settingsConfig.themes.includes(theme);
                  return (
                    <button
                      type="button"
                      key={theme}
                      className={checked ? styles.choiceActive : ""}
                      onClick={() =>
                        updateConfig(settingsAutomation.key, {
                          themes: toggleItem(settingsConfig.themes, theme),
                        })
                      }
                    >
                      {theme}
                    </button>
                  );
                })}
              </div>
            </div>

            <p className={styles.modalNote}>
              Source des idées : {settingsConfig.source}
            </p>
            <button
              type="button"
              className={styles.modalAction}
              onClick={saveSettings}
              disabled={saveState === "saving" || loadState === "loading"}
            >
              {saveState === "saving"
                ? "Enregistrement..."
                : "Enregistrer les réglages"}
            </button>
          </section>
        </div>
      )}

      {notice && <div className={styles.notice}>{notice}</div>}
    </main>
  );
}
