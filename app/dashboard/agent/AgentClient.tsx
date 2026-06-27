"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { ChannelImageAdapterModal } from "@/app/dashboard/_components/ChannelImageAdapterTool";
import { requestBoosterVideoTransforms } from "@/lib/boosterVideoTransformClient";
import type { BoosterVideoTransformedVariant } from "@/lib/boosterVideoTransforms";
import {
  INR_MEDIA_ALLOWED_IMAGE_MIME_TYPES,
  INR_MEDIA_ALLOWED_VIDEO_MIME_TYPES,
  INR_MEDIA_AGENT_MAX_MEDIA_COUNT,
  INR_MEDIA_IMAGE_MAX_BYTES,
  INR_MEDIA_IMAGE_MAX_MB_LABEL,
  INR_MEDIA_VIDEO_SOURCE_MAX_BYTES,
  INR_MEDIA_VIDEO_SOURCE_MAX_MB_LABEL,
} from "@/lib/mediaRules";
import { makeAttachmentPath } from "@/app/dashboard/mails/_lib/mailboxPhase25";
import HelpButton from "../_components/HelpButton";
import PublishExecutionProgress from "../_components/PublishExecutionProgress";
import PublishExecutionResultModal from "../_components/PublishExecutionResultModal";
import PublishAiConfigurationDrawer from "../booster/publier/components/PublishAiConfigurationDrawer";
import BoosterVideoFormatManager, {
  type BoosterVideoPreparationState,
} from "../booster/publier/components/BoosterVideoFormatManager";
import RichSiteContentEditor from "../booster/publier/components/RichSiteContentEditor";
import MediaLibraryPickerModal, {
  type MediaLibraryPickerItem,
} from "../_components/MediaLibraryPickerModal";
import {
  BOOSTER_PREFERRED_CTA_OPTIONS,
  CHANNEL_PRESETS,
  buildPreferredCtaPatch,
  computePreviewLayout,
  getBackgroundFill,
  getBackgroundMode,
  getCtaModeHelp,
  getDefaultTransform,
  getEffectiveTransformZoom,
  getOptimizedTransform,
  getPreferredCtaChoiceFromPost,
  getVideoFormatLabel,
  getWebsiteSourceLabelForChannel,
  getWebsiteUrlForChannel,
  normalizeBoosterAiLanguage,
  normalizeBoosterPreferredCta,
  normalizeVideoAdaptationMode,
  normalizeVideoFormat,
  readImageMeta,
  renderChannelImage,
  type BoosterCtaDefaults,
  type BoosterCtaMode,
  type BoosterPreferredCta,
  type BoosterVideoSourceMetadata,
  type ChannelKey as BoosterChannelKey,
  type ChannelPost as BoosterChannelPost,
  type DisplayKey as BoosterDisplayKey,
  type ImageMeta,
  type ImageTransform,
  type VideoAdaptationMode,
  type VideoFormat,
} from "../booster/publier/publishModal.shared";
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
import { editableHtmlToSiteText } from "@/lib/boosterFormatting";
import { readSanitizedElementHtml } from "@/lib/sanitizeHtml";
import styles from "./agent.module.css";
import dashboardStyles from "../dashboard.module.css";

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

const AGENT_MEDIA_MAX_IMAGE_BYTES = INR_MEDIA_IMAGE_MAX_BYTES;
const AGENT_MEDIA_MAX_VIDEO_BYTES = INR_MEDIA_VIDEO_SOURCE_MAX_BYTES;
const AGENT_MEDIA_ALLOWED_IMAGE_TYPES = new Set<string>(
  INR_MEDIA_ALLOWED_IMAGE_MIME_TYPES,
);
const AGENT_MEDIA_ALLOWED_VIDEO_TYPES = new Set<string>(
  INR_MEDIA_ALLOWED_VIDEO_MIME_TYPES,
);

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
  scheduleSlots: Array<{ day: string; time: string }>;
  channels: ChannelKey[];
  themes: string[];
  validation: string;
  source: string;
  signatureAutomatic: boolean;
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
type PrepareProgressState = {
  key: Exclude<AutomationKey, "stats">;
  label: string;
  percent: number;
} | null;
type PrepareNowConfirmState = {
  key: Extract<AutomationKey, "grow" | "loyalty">;
  label: string;
  pendingCount: number;
} | null;

type AgentPublishExecutionProgressState = {
  progress: number;
  label: string;
} | null;

type AgentCampaignLaunchNotice = {
  queued: number;
  folder: "propulsions" | "fidelisations" | "mails";
  title: string;
  details: string;
} | null;

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
  recommendations: string[];
  createdAt: string | null;
  completedAt?: string | null;
  document: AgentReportDocument;
  runMode: "automatic" | "manual";
};

type AgentChannelPreview = {
  title: string;
  body: string;
  cta: string;
  ctaMode: BoosterCtaMode;
  ctaUrl: string;
  ctaPhone: string;
  hashtags: string[];
};

type AgentPublishMediaPreview = {
  name: string;
  typeLabel: string;
  statusLabel: string;
  statusTone: "ready" | "blocked" | "warning" | "neutral";
  url: string;
  kind: "image" | "video" | "file" | "none";
  note: string;
};

type AgentMediaAdaptationPreview = {
  strategy: string;
  mediaType: "image" | "video" | "none" | "file";
  note: string;
  userEditable: boolean;
};

type AgentMediaLibraryItem = {
  id: string;
  bucket_name: string | null;
  storage_path: string;
  media_type: "image" | "video";
  mime_type: string | null;
  size_bytes: number | null;
  title: string | null;
  tags: string[] | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  signed_url: string | null;
};

type CampaignAttachmentPreview = {
  bucket?: string;
  path?: string;
  name: string;
  type: string;
  size: string;
  url: string;
};

type CampaignAttachmentRef = {
  bucket: string;
  path: string;
  name: string;
  type?: string | null;
  size?: number | null;
};

type CampaignRecipientPreview = {
  contact_id?: string | null;
  contactId?: string | null;
  id?: string | null;
  display_name?: string | null;
  displayName?: string | null;
  name?: string | null;
  email: string;
  phone?: string | null;
  contact_type?: string | null;
  contactType?: string | null;
  category?: string | null;
  company_name?: string | null;
  companyName?: string | null;
  city?: string | null;
  postal_code?: string | null;
  postalCode?: string | null;
  manual?: boolean | null;
};

type CrmContactForAgent = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  email?: string | null;
  phone?: string | null;
  category?: string | null;
  contact_type?: string | null;
  postal_code?: string | null;
  city?: string | null;
  important?: boolean | null;
};

type AgentMailAccount = {
  id: string;
  provider?: string | null;
  status?: string | null;
  connection_status?: string | null;
  requires_update?: boolean | null;
  display_name?: string | null;
  email_address?: string | null;
  account_email?: string | null;
  email?: string | null;
  resource_label?: string | null;
  label?: string | null;
};

type CampaignMailPreview = {
  subject: string;
  body: string;
  paragraphs: string[];
  mission: string;
  recipientsCount: number;
  mailAccountLabel: string;
  mailAccountProvider: string;
  attachment: CampaignAttachmentPreview | null;
};

type AgentActionsResponse = {
  actions?: AgentPreparedAction[];
  tableMissing?: boolean;
  error?: string;
};

type AgentScheduledAction = {
  id: string;
  automationKey: AutomationKey | null;
  actionType: string;
  targetTool: string;
  source: "manual" | "automatic";
  title: string;
  summary: string;
  scheduledAt: string | null;
  timezone: string;
  channels: string[];
  payload: Record<string, unknown>;
  status: "scheduled" | "running" | "done" | "failed" | "cancelled";
  attemptCount: number;
  lastError: string | null;
  executedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type ScheduledActionsResponse = {
  scheduledActions?: AgentScheduledAction[];
  tableMissing?: boolean;
  error?: string;
};

type ScheduleListItem = {
  id: string;
  action: string;
  date: string;
  time: string;
  typeLabel: string;
  channelLabel: string;
  originLabel: "Automatique" | "Programmé";
  status: string;
  statusKey?: string;
  automationKey?: AutomationKey | null;
  scheduledActionId?: string | null;
  scheduledAtIso?: string | null;
  editable: boolean;
  removable: boolean;
  source: "automatic" | "manual";
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

const statsRubriqueOptions: Record<
  string,
  { name: string; src: string; channelKey?: ChannelKey }
> = {
  "Vue globale": { name: "Vue globale", src: "/icons/stats-global.svg" },
  iNrBadge: { name: "iNrBadge", src: "/icons/inrbadge-dashboard.png" },
  Mails: {
    name: "Mails",
    src: "/icons/mails-inrcy-dashboard-v2.png",
    channelKey: "mails",
  },
  "Site iNrCy": {
    name: "Site iNrCy",
    src: "/icons/inrcy.png",
    channelKey: "siteInrcy",
  },
  "Site Web": {
    name: "Site Web",
    src: "/icons/site-web.jpg",
    channelKey: "siteWeb",
  },
  "Google Business": {
    name: "Google Business",
    src: "/icons/google.jpg",
    channelKey: "gmb",
  },
  Facebook: {
    name: "Facebook",
    src: "/icons/facebook.png",
    channelKey: "facebook",
  },
  Instagram: {
    name: "Instagram",
    src: "/icons/instagram.jpg",
    channelKey: "instagram",
  },
  LinkedIn: {
    name: "LinkedIn",
    src: "/icons/linkedin.png",
    channelKey: "linkedin",
  },
  TikTok: { name: "TikTok", src: "/icons/tiktok.png", channelKey: "tiktok" },
  YouTube: {
    name: "YouTube",
    src: "/icons/youtube-shorts.png",
    channelKey: "youtube",
  },
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

const agentChannelToBoosterDisplay: Partial<
  Record<ChannelKey, BoosterDisplayKey>
> = {
  siteInrcy: "inrcy_site",
  siteWeb: "site_web",
  gmb: "gmb",
  facebook: "facebook",
  instagram: "instagram",
  linkedin: "linkedin",
  tiktok: "tiktok",
  youtube: "youtube_shorts",
};

function boosterDisplayKeyFromAgentChannel(
  channel: ChannelKey | "" | null | undefined,
): BoosterDisplayKey {
  return agentChannelToBoosterDisplay[channel as ChannelKey] || "inrcy_site";
}

function boosterChannelKeyFromAgentChannel(
  channel: ChannelKey | "" | null | undefined,
): BoosterChannelKey {
  return boosterDisplayKeyFromAgentChannel(channel) as BoosterChannelKey;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function dataUrlToFile(dataUrl: string, fileName: string): File {
  const [header, body] = dataUrl.split(",");
  const mime = /data:([^;]+);base64/i.exec(header || "")?.[1] || "image/jpeg";
  const binary = atob(body || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], fileName, { type: mime });
}

function offsetFromDrawPosition(params: {
  containerWidth: number;
  containerHeight: number;
  drawW: number;
  drawH: number;
  dx: number;
  dy: number;
}) {
  const { containerWidth, containerHeight, drawW, drawH, dx, dy } = params;
  const maxX = Math.abs(drawW - containerWidth) / 2;
  const maxY = Math.abs(drawH - containerHeight) / 2;
  return {
    offsetX: maxX
      ? clampNumber(
          (((containerWidth - drawW) / 2 - dx) / maxX) * 100,
          -100,
          100,
        )
      : 0,
    offsetY: maxY
      ? clampNumber(
          (((containerHeight - drawH) / 2 - dy) / maxY) * 100,
          -100,
          100,
        )
      : 0,
  };
}

async function urlToFile(
  url: string,
  fileName: string,
  fallbackType = "image/jpeg",
) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Impossible de récupérer le média à adapter.");
  }
  const blob = await response.blob();
  return new File([blob], fileName, {
    type: blob.type || fallbackType,
    lastModified: Date.now(),
  });
}

function normalizeAgentCtaMode(value: unknown): BoosterCtaMode {
  const raw = String(value || "").trim();
  if (["none", "website", "call", "message", "custom"].includes(raw))
    return raw as BoosterCtaMode;
  return "none";
}

function inferPreferredCtaChoiceFromLabel(
  label: string,
  fallback: BoosterPreferredCta = "devis",
): BoosterPreferredCta {
  const normalized = label.trim().toLowerCase();
  if (!normalized) return "none";
  if (
    /(devis|quote|presupuesto|preventivo|offerte|angebot|orçamento)/i.test(
      normalized,
    )
  )
    return "devis";
  if (/(appeler|call|llamar|chiama|anrufen|bellen|ligar)/i.test(normalized))
    return "appeler";
  if (/(message|mensaje|messaggio|nachricht|bericht)/i.test(normalized))
    return "message";
  if (/(site|website|web|sitio)/i.test(normalized)) return "site";
  return fallback;
}

const pendingActionStatuses = new Set<InrAgentActionStatus>([
  "prepared",
  "pending_validation",
  "pending",
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
      { value: "twice_weekly", label: "2 fois par semaine" },
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
      { value: "twice_weekly", label: "2 fois par semaine" },
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
      { value: "twice_weekly", label: "2 fois par semaine" },
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
    title: "Publier",
    shortTitle: "Publier",
    iconLabel: "Visibilité",
    settingsTitle: "Réglages — Publier",
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
    title: "Propulser",
    shortTitle: "Propulser",
    iconLabel: "Acquisition",
    settingsTitle: "Réglages — Propulser",
    availableThemes: ["Valoriser", "Récolter", "Offrir"],
    availableChannels: ["mails"],
  },
  {
    key: "loyalty",
    title: "Fidéliser",
    shortTitle: "Fidéliser",
    iconLabel: "Relation",
    settingsTitle: "Réglages — Fidéliser",
    availableThemes: ["Informer", "Enquêter", "Suivre"],
    availableChannels: ["mails"],
  },
  {
    key: "stats",
    title: "Statistiques",
    shortTitle: "Stats",
    iconLabel: "Pilotage",
    settingsTitle: "Réglages — Statistiques",
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

const robotStepsByAutomation: Record<AutomationKey, [string, string, string]> =
  {
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
    scheduleSlots: [
      { day: "Lundi", time: "09:00" },
      { day: "Jeudi", time: "09:00" },
    ],
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
    signatureAutomatic: true,
  },
  grow: {
    enabled: false,
    frequency: "2 fois par mois",
    day: "Mercredi",
    time: "10:00",
    scheduleSlots: [
      { day: "Mercredi", time: "10:00" },
      { day: "Samedi", time: "10:00" },
    ],
    channels: ["mails"],
    themes: ["Valoriser", "Récolter", "Offrir"],
    validation: "Validation obligatoire avant envoi",
    source: "Publications déjà faites + rubriques Propulser",
    signatureAutomatic: true,
  },
  loyalty: {
    enabled: false,
    frequency: "1 fois par mois",
    day: "Vendredi",
    time: "09:30",
    scheduleSlots: [
      { day: "Vendredi", time: "09:30" },
      { day: "Lundi", time: "09:30" },
    ],
    channels: ["mails"],
    themes: ["Informer", "Enquêter", "Suivre"],
    validation: "Validation obligatoire avant envoi",
    source: "Publications déjà faites + rubriques Fidéliser",
    signatureAutomatic: true,
  },
  stats: {
    enabled: false,
    frequency: "Chaque semaine",
    day: "Lundi",
    time: "08:30",
    scheduleSlots: [
      { day: "Lundi", time: "08:30" },
      { day: "Jeudi", time: "08:30" },
    ],
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
    signatureAutomatic: true,
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

const agentPublishChannelToBoosterChannel: Record<string, string> = {
  siteInrcy: "inrcy_site",
  site_inrcy: "inrcy_site",
  siteWeb: "site_web",
  site_web: "site_web",
  gmb: "gmb",
  google_business: "gmb",
  facebook: "facebook",
  instagram: "instagram",
  linkedin: "linkedin",
  tiktok: "tiktok",
  youtube: "youtube_shorts",
  youtube_shorts: "youtube_shorts",
};

function normalizeAgentExternalHref(input: unknown) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (/^(https?:)?\/\//i.test(raw)) return raw.startsWith("//") ? `https:${raw}` : raw;
  if (/^www\./i.test(raw)) return `https://${raw}`;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#].*)?$/i.test(raw)) return `https://${raw}`;
  return raw;
}

type ConnectedChannelMap = Partial<Record<ChannelKey, boolean>>;

function channelMapFromConnectionStates(payload: unknown): ConnectedChannelMap {
  const states = asRecord(payload) || {};
  const isUsable = (key: string) => {
    const state = asRecord(states[key]) || {};
    return Boolean(state.connected) && state.requiresUpdate !== true;
  };

  return {
    siteInrcy: isUsable("site_inrcy"),
    siteWeb: isUsable("site_web"),
    gmb: isUsable("gmb"),
    facebook: isUsable("facebook"),
    instagram: isUsable("instagram"),
    linkedin: isUsable("linkedin"),
    tiktok: isUsable("tiktok"),
    youtube: isUsable("youtube_shorts"),
    mails: isUsable("mails"),
  };
}

function connectedChannelsForAutomation(
  automation: Automation,
  connectedChannels: ConnectedChannelMap | null,
): ChannelKey[] {
  if (!connectedChannels) return automation.availableChannels;
  return orderChannels(
    automation.availableChannels.filter((channel) => Boolean(connectedChannels[channel])),
    automation.availableChannels,
  );
}

function connectedChannelMessage(automation: Automation | null) {
  if (!automation || automation.availableChannels.length === 0) return "";
  if (automation.key === "grow") {
    return "Aucune boîte mail connectée. Connecte une boîte dans iNrSend avant de laisser iNr’Agent travailler dans Propulser.";
  }
  if (automation.key === "loyalty") {
    return "Aucune boîte mail connectée. Connecte une boîte dans iNrSend avant de laisser iNr’Agent travailler dans Fidéliser.";
  }
  if (automation.key === "publish") {
    return "Aucun canal de publication connecté. Connecte au moins un canal dans l’application avant de laisser iNr’Agent publier.";
  }
  return "Aucun canal connecté pour cette automatisation.";
}

function normalizeConfigsForConnectedChannels(
  current: Record<AutomationKey, AutomationConfig>,
  connectedChannels: ConnectedChannelMap,
): Record<AutomationKey, AutomationConfig> {
  let changed = false;
  const next = { ...current };

  for (const automation of automations) {
    if (automation.key === "stats" || automation.availableChannels.length === 0) {
      continue;
    }

    const currentConfig = current[automation.key];
    const availableChannels = connectedChannelsForAutomation(
      automation,
      connectedChannels,
    );
    const channels = orderChannels(currentConfig.channels, availableChannels);
    const enabled = availableChannels.length > 0 ? currentConfig.enabled : false;
    const configChanged =
      enabled !== currentConfig.enabled ||
      channels.join("|") !== currentConfig.channels.join("|");

    if (configChanged) {
      changed = true;
      next[automation.key] = {
        ...currentConfig,
        enabled,
        channels,
      };
    }
  }

  return changed ? next : current;
}

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

function dayOffsetLabel(day: string, offset: number) {
  const current = dayToApi[day] ?? 1;
  return apiToDay[(current + offset) % 7] ?? "Lundi";
}

function normalizeConfigScheduleSlots(
  config: Pick<AutomationConfig, "day" | "time" | "scheduleSlots">,
) {
  const first = config.scheduleSlots?.[0] || {
    day: config.day,
    time: config.time,
  };
  const second = config.scheduleSlots?.[1] || {
    day: dayOffsetLabel(first.day || config.day, 3),
    time: first.time || config.time,
  };
  return [first, second].map((slot, index) => ({
    day: weekDays.includes(slot.day)
      ? slot.day
      : index === 0
        ? config.day
        : dayOffsetLabel(config.day, 3),
    time: hourOptions.includes(slot.time) ? slot.time : config.time,
  }));
}

function scheduleSlotsFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
  fallbackDay: string,
  fallbackTime: string,
) {
  const rawSlots = Array.isArray(metadata?.scheduleSlots)
    ? metadata?.scheduleSlots
    : [];
  const slots = rawSlots
    .map((item) => {
      const source =
        item && typeof item === "object" && !Array.isArray(item)
          ? (item as Record<string, unknown>)
          : {};
      const day =
        typeof source.day === "string"
          ? source.day
          : apiToDay[Number(source.dayOfWeek)] || "";
      const time = typeof source.time === "string" ? source.time : "";
      return {
        day: weekDays.includes(day) ? day : "",
        time: hourOptions.includes(time) ? time : "",
      };
    })
    .filter((slot) => slot.day && slot.time);

  return normalizeConfigScheduleSlots({
    day: slots[0]?.day || fallbackDay,
    time: slots[0]?.time || fallbackTime,
    scheduleSlots:
      slots.length > 0
        ? slots
        : [
            { day: fallbackDay, time: fallbackTime },
            { day: dayOffsetLabel(fallbackDay, 3), time: fallbackTime },
          ],
  });
}

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
        scheduleSlots: scheduleSlotsFromMetadata(
          source.metadata,
          apiToDay[source.dayOfWeek] ?? defaults.day,
          source.time || defaults.time,
        ),
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
        signatureAutomatic:
          typeof source.metadata?.signatureAutomatic === "boolean"
            ? source.metadata.signatureAutomatic
            : true,
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
  const normalizedSlots = normalizeConfigScheduleSlots(config);
  const metadataWithoutScheduleSlots = { ...(existing.metadata || {}) };
  delete metadataWithoutScheduleSlots.scheduleSlots;
  const nextMetadata = {
    ...metadataWithoutScheduleSlots,
    ...(key === "grow" || key === "loyalty"
      ? { signatureAutomatic: config.signatureAutomatic }
      : {}),
    ...(optionValue(options.frequency, config.frequency, existing.frequency) ===
    "twice_weekly"
      ? {
          scheduleSlots: normalizedSlots.slice(0, 2).map((slot) => ({
            day: slot.day,
            dayOfWeek: dayToApi[slot.day] ?? existing.dayOfWeek,
            time: slot.time,
          })),
        }
      : {}),
  };

  return {
    ...existing,
    enabled: config.enabled,
    frequency: optionValue(
      options.frequency,
      config.frequency,
      existing.frequency,
    ),
    dayOfWeek:
      dayToApi[normalizedSlots[0]?.day || config.day] ?? existing.dayOfWeek,
    time: normalizedSlots[0]?.time || config.time,
    validationMode: optionValue(
      options.validation,
      config.validation,
      existing.validationMode,
    ),
    allowedChannels: orderChannels(
      config.channels,
      automations.find((automation) => automation.key === key)
        ?.availableChannels,
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
    metadata: nextMetadata,
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

type HeaderToolLink = {
  label: string;
  compactLabel: string;
  href: string;
  logoSrc?: string;
};

function headerToolLinkForAutomation(key: AutomationKey): HeaderToolLink {
  if (key === "grow") {
    return {
      label: "Propulser",
      compactLabel: "P",
      href: "/dashboard/propulser",
    };
  }
  if (key === "loyalty") {
    return {
      label: "Fidéliser",
      compactLabel: "F",
      href: "/dashboard/fideliser",
    };
  }
  if (key === "stats") {
    return {
      label: "iNr’Stats",
      compactLabel: "S",
      href: "/dashboard/stats",
      logoSrc: "/inrstats-logo-seul.png",
    };
  }
  return {
    label: "Booster",
    compactLabel: "B",
    href: "/dashboard?action=publish",
  };
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
      <path
        fill="currentColor"
        stroke="none"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.33-.02-.64-.06-.94l2.05-1.59c.18-.14.23-.39.11-.6l-2-3.46c-.12-.21-.37-.29-.59-.21l-2.42.97c-.5-.38-1.04-.7-1.63-.95l-.36-2.57a.5.5 0 0 0-.48-.41h-3a.5.5 0 0 0-.48.41l-.36 2.57c-.59.25-1.13.57-1.63.95L5.93 5.2c-.22-.08-.47 0-.59.21l-2 3.46c-.12.21-.07.46.11.6l2.05 1.59c-.04.3-.06.61-.06.94 0 .33.02.64.06.94l-2.05 1.59c-.18.14-.23.39-.11.6l2 3.46c.12.21.37.29.59.21l2.42-.97c.5.38 1.04.7 1.63.95l.36 2.57c.03.24.24.41.48.41h3c.24 0 .45-.17.48-.41l.36-2.57c.59-.25 1.13-.57 1.63-.95l2.42.97c.22.08.47 0 .59-.21l2-3.46c.12-.21.07-.46-.11-.6l-2.05-1.59ZM12 16.05a4.05 4.05 0 1 0 0-8.1 4.05 4.05 0 0 0 0 8.1Z"
      />
      <circle
        cx="12"
        cy="12"
        r="4.95"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <circle
        cx="12"
        cy="12"
        r="2.55"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
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

const AGENT_RICH_TEXT_EDITOR_STYLE: CSSProperties = {
  width: "100%",
  maxHeight: "min(340px, 42vh)",
  overflowY: "auto",
};

function findInlineHtmlClose(
  text: string,
  start: number,
  tag: "strong" | "em" | "u",
) {
  const closePattern =
    tag === "strong"
      ? /<\s*\/\s*(strong|b)\s*>/i
      : tag === "em"
        ? /<\s*\/\s*(em|i)\s*>/i
        : /<\s*\/\s*u\s*>/i;
  const afterOpen = text.slice(start);
  const close = afterOpen.match(closePattern);
  if (!close || typeof close.index !== "number") return null;
  return {
    index: start + close.index,
    length: close[0].length,
  };
}

function renderInlineHtmlTag(
  tag: "strong" | "em" | "u",
  value: string,
  key: string,
): ReactNode {
  const children = renderRichInlineText(value, key);
  if (tag === "strong") return <strong key={key}>{children}</strong>;
  if (tag === "em") return <em key={key}>{children}</em>;
  return <u key={key}>{children}</u>;
}

function renderRichInlineText(text: string, keyPrefix = "rich"): ReactNode[] {
  const nodes: ReactNode[] = [];
  let index = 0;
  let safety = 0;

  while (index < text.length && safety < 1200) {
    safety += 1;
    const rest = text.slice(index);

    const htmlOpen = rest.match(/^<\s*(strong|b|em|i|u)\s*>/i);
    if (htmlOpen) {
      const normalizedTag = htmlOpen[1].toLowerCase();
      const tag =
        normalizedTag === "strong" || normalizedTag === "b"
          ? "strong"
          : normalizedTag === "em" || normalizedTag === "i"
            ? "em"
            : "u";
      const contentStart = index + htmlOpen[0].length;
      const close = findInlineHtmlClose(text, contentStart, tag);
      if (close && close.index > contentStart) {
        const value = text.slice(contentStart, close.index);
        const key = `${keyPrefix}-html-${tag}-${index}`;
        nodes.push(renderInlineHtmlTag(tag, value, key));
        index = close.index + close.length;
        continue;
      }
    }

    if (rest.startsWith("***")) {
      const end = text.indexOf("***", index + 3);
      if (end > index + 3) {
        const value = text.slice(index + 3, end);
        const key = `${keyPrefix}-bi-${index}`;
        nodes.push(
          <strong key={key}>
            <em>{renderRichInlineText(value, key)}</em>
          </strong>,
        );
        index = end + 3;
        continue;
      }
    }

    if (rest.startsWith("___")) {
      const end = text.indexOf("___", index + 3);
      if (end > index + 3) {
        const value = text.slice(index + 3, end);
        const key = `${keyPrefix}-bi2-${index}`;
        nodes.push(
          <strong key={key}>
            <em>{renderRichInlineText(value, key)}</em>
          </strong>,
        );
        index = end + 3;
        continue;
      }
    }

    if (rest.startsWith("**")) {
      const end = text.indexOf("**", index + 2);
      if (end > index + 2) {
        const value = text.slice(index + 2, end);
        nodes.push(
          <strong key={`${keyPrefix}-b-${index}`}>
            {renderRichInlineText(value, `${keyPrefix}-b-${index}`)}
          </strong>,
        );
        index = end + 2;
        continue;
      }
    }

    if (rest.startsWith("__")) {
      const end = text.indexOf("__", index + 2);
      if (end > index + 2) {
        const value = text.slice(index + 2, end);
        nodes.push(
          <strong key={`${keyPrefix}-b2-${index}`}>
            {renderRichInlineText(value, `${keyPrefix}-b2-${index}`)}
          </strong>,
        );
        index = end + 2;
        continue;
      }
    }

    if (rest.startsWith("<u>")) {
      const end = text.indexOf("</u>", index + 3);
      if (end > index + 3) {
        const value = text.slice(index + 3, end);
        nodes.push(
          <u key={`${keyPrefix}-u-${index}`}>
            {renderRichInlineText(value, `${keyPrefix}-u-${index}`)}
          </u>,
        );
        index = end + 4;
        continue;
      }
    }

    if (rest.startsWith("*") && !rest.startsWith("**")) {
      const end = text.indexOf("*", index + 1);
      if (end > index + 1) {
        const value = text.slice(index + 1, end);
        nodes.push(
          <em key={`${keyPrefix}-i-${index}`}>
            {renderRichInlineText(value, `${keyPrefix}-i-${index}`)}
          </em>,
        );
        index = end + 1;
        continue;
      }
    }

    if (rest.startsWith("_") && !rest.startsWith("__")) {
      const end = text.indexOf("_", index + 1);
      if (end > index + 1) {
        const value = text.slice(index + 1, end);
        nodes.push(
          <em key={`${keyPrefix}-i2-${index}`}>
            {renderRichInlineText(value, `${keyPrefix}-i2-${index}`)}
          </em>,
        );
        index = end + 1;
        continue;
      }
    }

    const nextMarkers = [
      text.indexOf("<strong>", index + 1),
      text.indexOf("<b>", index + 1),
      text.indexOf("<em>", index + 1),
      text.indexOf("<i>", index + 1),
      text.indexOf("<u>", index + 1),
      text.indexOf("***", index + 1),
      text.indexOf("___", index + 1),
      text.indexOf("**", index + 1),
      text.indexOf("__", index + 1),
      text.indexOf("*", index + 1),
      text.indexOf("_", index + 1),
    ].filter((position) => position >= 0);
    const next = nextMarkers.length ? Math.min(...nextMarkers) : text.length;
    nodes.push(text.slice(index, next));
    index = next;
  }

  if (index < text.length) nodes.push(text.slice(index));
  return nodes;
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
    payload.video,
    payload.videoAsset,
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
          return {
            title: action.title,
            body,
            cta: "",
            ctaMode: "none",
            ctaUrl: "",
            ctaPhone: "",
            hashtags: [],
          };
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
      const ctaMode = normalizeAgentCtaMode(post.ctaMode || post.cta_mode);
      const ctaUrl = firstSafeString(
        post.ctaUrl,
        post.cta_url,
        post.buttonUrl,
        post.url,
        post.link,
        post.href,
      );
      const ctaPhone = firstSafeString(
        post.ctaPhone,
        post.cta_phone,
        post.phone,
        post.phoneNumber,
      );
      const hashtags = Array.isArray(post.hashtags)
        ? post.hashtags
            .map((hashtag) => safeString(hashtag))
            .filter(Boolean)
            .slice(0, 8)
        : [];

      if (title || body || cta || ctaUrl || ctaPhone || hashtags.length) {
        return {
          title: title || action.title,
          body,
          cta,
          ctaMode:
            ctaMode !== "none" || !cta
              ? ctaMode
              : ctaUrl
                ? "website"
                : ctaPhone
                  ? "call"
                  : "custom",
          ctaUrl,
          ctaPhone,
          hashtags,
        };
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

  return {
    title,
    body,
    cta: "",
    ctaMode: "none",
    ctaUrl: "",
    ctaPhone: "",
    hashtags: [],
  };
}

function isPublishPreparedAction(
  action: AgentPreparedAction | null,
): action is AgentPreparedAction {
  return Boolean(
    action &&
    action.automationKey === "publish" &&
    action.targetTool === "booster" &&
    action.actionType === "publication",
  );
}

function publishPostParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{1,}/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function filenameFromUrl(url: string): string {
  if (!url) return "Pièce jointe";
  const clean = url.split("?")[0]?.split("#")[0] || url;
  try {
    return decodeURIComponent(
      clean.split("/").filter(Boolean).pop() || "Pièce jointe",
    );
  } catch {
    return clean.split("/").filter(Boolean).pop() || "Pièce jointe";
  }
}

function mediaKindFromHints(
  type: string,
  url: string,
): "image" | "video" | "file" {
  const hint = `${type} ${url}`.toLowerCase();
  if (/\.(mp4|mov|m4v|webm|avi)(\?|#|$)/i.test(url) || hint.includes("video/"))
    return "video";
  if (
    /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(url) ||
    hint.includes("image/")
  )
    return "image";
  return "file";
}

function assetFromUnknown(value: unknown): AgentImageAsset | null {
  if (!value) return null;
  if (typeof value === "string")
    return { url: value, name: filenameFromUrl(value) };
  const record = asRecord(value);
  if (!record) return null;
  return record as AgentImageAsset;
}

function firstAttachmentCandidate(value: unknown): unknown {
  if (Array.isArray(value)) return value.find(Boolean) || null;
  return value || null;
}

function channelPostRecord(
  action: AgentPreparedAction,
  channelKey: ChannelKey | null,
): Record<string, unknown> | null {
  if (!channelKey) return null;
  const postByChannel = asRecord(action.payload?.postByChannel);
  if (!postByChannel) return null;

  for (const key of channelPayloadKeys[channelKey]) {
    const raw = postByChannel[key];
    const record = asRecord(raw);
    if (record) return record;
  }

  return null;
}
function channelReadinessRecord(
  action: AgentPreparedAction | null,
  channelKey: ChannelKey | null,
): Record<string, unknown> | null {
  if (!action || !channelKey) return null;
  const readinessByChannel = asRecord(action.payload?.mediaReadinessByChannel);
  if (!readinessByChannel) return null;

  for (const key of channelPayloadKeys[channelKey]) {
    const record = asRecord(readinessByChannel[key]);
    if (record) return record;
  }

  return null;
}

function channelReadinessIsBlocking(record: Record<string, unknown> | null) {
  if (!record) return false;
  const blockers = Array.isArray(record.blockers)
    ? record.blockers.filter(Boolean)
    : [];
  return (
    blockers.length > 0 ||
    record.status === "blocked" ||
    record.ready === false ||
    record.publishable === false
  );
}

function channelReadinessReason(record: Record<string, unknown> | null) {
  if (!record) return "";
  const blockers = Array.isArray(record.blockers)
    ? record.blockers.filter(Boolean)
    : [];
  return firstSafeString(
    blockers[0],
    record.reason,
    record.message,
    record.label,
  );
}

function channelRequiresMedia(channelKey: ChannelKey | null): boolean {
  return (
    channelKey === "instagram" ||
    channelKey === "tiktok" ||
    channelKey === "youtube"
  );
}

function channelRequiresVideo(channelKey: ChannelKey | null): boolean {
  return channelKey === "youtube";
}

function channelSupportsHashtags(channelKey: ChannelKey | null): boolean {
  return Boolean(
    channelKey &&
    ["facebook", "instagram", "linkedin", "tiktok", "youtube"].includes(
      channelKey,
    ),
  );
}

function extractPublishMediaPreview(
  action: AgentPreparedAction | null,
  channelKey: ChannelKey | null,
): AgentPublishMediaPreview {
  if (!action) {
    return {
      name: "Aucune",
      typeLabel: "Texte",
      statusLabel: "—",
      statusTone: "neutral",
      url: "",
      kind: "none",
      note: "Aucune publication préparée.",
    };
  }

  const payload = action.payload || {};
  const post = channelPostRecord(action, channelKey);
  const directCandidates = [
    post?.media,
    post?.mediaAsset,
    post?.image,
    post?.imageAsset,
    post?.imageUrl,
    post?.visual,
    post?.cover,
    post?.video,
    post?.videoAsset,
    post?.file,
    post?.attachment,
    firstAttachmentCandidate(post?.attachments),
    payload.media,
    payload.mediaAsset,
    payload.image,
    payload.imageAsset,
    payload.selectedImage,
    payload.visual,
    payload.cover,
    firstAttachmentCandidate(payload.attachments),
    firstAttachmentCandidate(payload.files),
  ];

  const asset =
    directCandidates.map(assetFromUnknown).find(Boolean) ||
    extractImageAsset(action);
  const url = imageAssetUrl(asset);
  const assetRecord = asRecord(asset);
  const type = firstSafeString(
    assetRecord?.type,
    assetRecord?.mimeType,
    assetRecord?.mime_type,
  );
  const name =
    firstSafeString(asset?.name, asset?.title, asset?.alt) ||
    filenameFromUrl(url);
  const kind = url ? mediaKindFromHints(type, url) : "none";
  const needsVideo = channelRequiresVideo(channelKey);
  const needsMedia = channelRequiresMedia(channelKey);
  const readiness = channelReadinessRecord(action, channelKey);
  const readinessBlocks = channelReadinessIsBlocking(readiness);
  const readinessReason = channelReadinessReason(readiness);

  if (url) {
    const invalidVideo = needsVideo && kind !== "video";
    return {
      name:
        name ||
        (kind === "video"
          ? "Vidéo"
          : kind === "image"
            ? "Image"
            : "Pièce jointe"),
      typeLabel:
        kind === "video" ? "Vidéo" : kind === "image" ? "Image" : "Fichier",
      statusLabel: invalidVideo || readinessBlocks ? "Bloquant" : "Prêt",
      statusTone: invalidVideo || readinessBlocks ? "blocked" : "ready",
      url,
      kind,
      note: invalidVideo
        ? "Ce canal exige une vidéo. Remplacez le média avant validation."
        : readinessBlocks
          ? readinessReason || "Ce canal doit être complété avant publication."
          : kind === "video"
            ? "Vidéo prête pour ce canal."
            : kind === "image"
              ? "Image prête pour ce canal."
              : "Fichier associé à ce canal.",
    };
  }

  if (needsMedia || readinessBlocks) {
    return {
      name: needsVideo ? "Vidéo requise" : "Média manquant",
      typeLabel: needsVideo ? "Vidéo" : "Image / vidéo",
      statusLabel: "Bloquant",
      statusTone: "blocked",
      url: "",
      kind: "none",
      note:
        readinessReason ||
        (needsVideo
          ? "YouTube nécessite une vidéo avant publication."
          : "Ce canal nécessite un média avant publication."),
    };
  }

  return {
    name: "Aucune",
    typeLabel: "Texte seul",
    statusLabel: "Prêt",
    statusTone: "ready",
    url: "",
    kind: "none",
    note: "Publication texte prête pour ce canal.",
  };
}

function getPublishMediaRecord(
  action: AgentPreparedAction | null,
  channelKey: ChannelKey | null,
): Record<string, unknown> | null {
  if (!action) return null;
  const payload = action.payload || {};
  const post = channelPostRecord(action, channelKey);
  const directCandidates = [
    post?.media,
    post?.mediaAsset,
    post?.image,
    post?.imageAsset,
    post?.imageUrl,
    post?.visual,
    post?.cover,
    post?.video,
    post?.videoAsset,
    post?.file,
    post?.attachment,
    firstAttachmentCandidate(post?.attachments),
    payload.media,
    payload.mediaAsset,
    payload.image,
    payload.imageAsset,
    payload.video,
    payload.videoAsset,
    payload.selectedImage,
    payload.visual,
    payload.cover,
    firstAttachmentCandidate(payload.attachments),
    firstAttachmentCandidate(payload.files),
  ];

  for (const candidate of directCandidates) {
    if (!candidate) continue;
    if (typeof candidate === "string") {
      return { url: candidate, name: filenameFromUrl(candidate) };
    }
    const record = asRecord(candidate);
    if (record) return record;
  }

  const asset = action.imageAssets
    .map((item) =>
      typeof item === "string"
        ? ({ url: item, name: filenameFromUrl(item) } as Record<
            string,
            unknown
          >)
        : asRecord(item),
    )
    .find(Boolean);
  return asset || null;
}

function getMediaVideoSettingsRecord(
  media: Record<string, unknown> | null,
  channel: BoosterChannelKey,
) {
  const settingsByChannel = asRecord(media?.videoSettingsByChannel);
  const direct = asRecord(settingsByChannel?.[channel]);
  return direct || asRecord(media?.videoSettings) || null;
}

function extractPublishMediaAdaptationPreview(
  action: AgentPreparedAction | null,
  channelKey: ChannelKey | null,
): AgentMediaAdaptationPreview {
  if (!action || !channelKey) {
    return {
      strategy: "none",
      mediaType: "none",
      note: "Aucune adaptation média à préparer.",
      userEditable: false,
    };
  }

  const adaptationByChannel = asRecord(
    action.payload?.mediaAdaptationByChannel,
  );
  if (adaptationByChannel) {
    for (const key of channelPayloadKeys[channelKey]) {
      const record = asRecord(adaptationByChannel[key]);
      if (record) {
        const mediaTypeRaw = safeString(record.mediaType || record.media_type);
        return {
          strategy: safeString(record.strategy) || "booster_auto",
          mediaType:
            mediaTypeRaw === "video"
              ? "video"
              : mediaTypeRaw === "image"
                ? "image"
                : mediaTypeRaw === "file"
                  ? "file"
                  : "none",
          note:
            safeString(record.note) ||
            "iNrAgent prépare automatiquement une version compatible avec le canal.",
          userEditable: record.userEditable !== false,
        };
      }
    }
  }

  const media = extractPublishMediaPreview(action, channelKey);
  if (media.kind === "video") {
    return {
      strategy: "booster_video_format",
      mediaType: "video",
      note: "La vidéo source sera préparée par Booster selon les spécificités du canal avant publication.",
      userEditable: true,
    };
  }
  if (media.kind === "image") {
    return {
      strategy: "booster_image_adapter",
      mediaType: "image",
      note: "L’image source sera adaptée par Booster selon les dimensions du canal sans modifier l’original.",
      userEditable: true,
    };
  }

  return {
    strategy: "text_only",
    mediaType: "none",
    note: "Aucun média à adapter pour ce canal.",
    userEditable: false,
  };
}

function publishContentKindLabel(args: {
  media: AgentPublishMediaPreview | null;
  hasText: boolean;
}): string {
  const { media, hasText } = args;
  const kind = media?.kind || "none";
  if (kind === "video") return hasText ? "Texte + Vidéo" : "Vidéo seule";
  if (kind === "image")
    return hasText ? "Texte + Photo(s)" : "Photo(s) seule(s)";
  if (kind === "file") return hasText ? "Texte + Média" : "Média seul";
  return hasText ? "Texte seul" : "—";
}

function publishStatusLabel(args: {
  action: AgentPreparedAction | null;
  media: AgentPublishMediaPreview | null;
  hasText: boolean;
}): { label: string; tone: "ready" | "blocked" | "warning" | "neutral" } {
  const { action, media, hasText } = args;
  if (!action) return { label: "—", tone: "neutral" };
  if (media?.statusTone === "blocked")
    return { label: "Bloquant", tone: "blocked" };
  if (media?.statusTone === "warning")
    return { label: media.statusLabel || "À vérifier", tone: "warning" };
  if (!hasText && media?.kind === "none")
    return { label: "Bloquant", tone: "blocked" };
  return { label: "Prêt", tone: "ready" };
}

function extractPublishCtaLine(
  action: AgentPreparedAction | null,
  channelKey: ChannelKey | null,
  preview: AgentChannelPreview | null,
): string {
  if (!action) return "—";
  const payload = action.payload || {};
  const post = channelPostRecord(action, channelKey);
  const ctaLabel = firstSafeString(
    preview?.cta,
    post?.cta,
    post?.callToAction,
    post?.buttonLabel,
    post?.buttonText,
    payload.cta,
    payload.callToAction,
    payload.buttonLabel,
    payload.buttonText,
  );
  const ctaUrl = firstSafeString(
    post?.ctaUrl,
    post?.cta_url,
    post?.buttonUrl,
    post?.url,
    post?.link,
    post?.href,
    payload.ctaUrl,
    payload.cta_url,
    payload.buttonUrl,
    payload.url,
    payload.link,
    payload.href,
  );

  if (ctaLabel && ctaUrl) return `${ctaLabel} — ${ctaUrl}`;
  return ctaLabel || ctaUrl || "—";
}

function previewParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}|\n-\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function mailParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function isCampaignAutomationKey(
  key: AutomationKey,
): key is Extract<AutomationKey, "grow" | "loyalty"> {
  return key === "grow" || key === "loyalty";
}

function isCampaignPreparedAction(
  action: AgentPreparedAction | null,
): action is AgentPreparedAction {
  return Boolean(
    action &&
    isCampaignAutomationKey(action.automationKey as AutomationKey) &&
    (action.targetTool === "propulser" ||
      action.targetTool === "fideliser" ||
      action.targetTool === "mails"),
  );
}

function formatAttachmentSize(value: unknown): string {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${Math.round(bytes)} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} Mo`;
}

function extractCampaignAttachment(
  payload: Record<string, unknown>,
): CampaignAttachmentPreview | null {
  const rawAttachments = Array.isArray(payload.attachments)
    ? payload.attachments
    : Array.isArray(payload.files)
      ? payload.files
      : [];
  const raw = rawAttachments[0] || payload.attachment || payload.file || null;
  const record =
    typeof raw === "string" ? { name: raw, url: raw } : asRecord(raw);
  if (!record) return null;

  const name = firstSafeString(
    record.name,
    record.filename,
    record.fileName,
    record.title,
    "Pièce jointe",
  );
  const url = firstSafeString(
    record.url,
    record.downloadUrl,
    record.publicUrl,
    record.href,
  );
  const type = firstSafeString(
    record.mimeType,
    record.mime_type,
    record.type,
    "Document",
  );
  const size = formatAttachmentSize(
    record.size || record.bytes || record.sizeBytes || record.size_bytes,
  );

  return {
    bucket: firstSafeString(record.bucket),
    path: firstSafeString(record.path, record.storagePath, record.storage_path),
    name,
    type,
    size,
    url,
  };
}

function normalizeCampaignAttachmentRefs(
  value: unknown,
): CampaignAttachmentRef[] {
  if (!Array.isArray(value)) return [];
  const refs: CampaignAttachmentRef[] = [];

  for (const item of value) {
    const record = asRecord(item);
    if (!record) continue;
    const bucket = firstSafeString(record.bucket);
    const path = firstSafeString(
      record.path,
      record.storagePath,
      record.storage_path,
    );
    const name =
      firstSafeString(record.name, record.filename, record.fileName) ||
      path.split("/").pop() ||
      "piece-jointe";
    if (!bucket || !path || !name) continue;
    const size = Number(
      record.size ?? record.bytes ?? record.sizeBytes ?? record.size_bytes ?? 0,
    );
    refs.push({
      bucket,
      path,
      name,
      type:
        firstSafeString(record.type, record.mimeType, record.mime_type) || null,
      size: Number.isFinite(size) && size > 0 ? size : null,
    });
  }

  return refs.slice(0, 10);
}

function normalizeCampaignRecipients(
  value: unknown,
): CampaignRecipientPreview[] {
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const recipients: CampaignRecipientPreview[] = [];

  for (const item of raw) {
    const record = asRecord(item);
    const email = firstSafeString(record?.email, item).toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(email) || seen.has(email))
      continue;
    seen.add(email);
    recipients.push({
      contact_id:
        firstSafeString(record?.contact_id, record?.contactId, record?.id) ||
        null,
      display_name: firstSafeString(
        record?.display_name,
        record?.displayName,
        record?.name,
      ),
      email,
      phone: firstSafeString(record?.phone) || null,
      contact_type:
        firstSafeString(record?.contact_type, record?.contactType) || null,
      category: firstSafeString(record?.category) || null,
      company_name:
        firstSafeString(record?.company_name, record?.companyName) || null,
      city: firstSafeString(record?.city) || null,
      postal_code:
        firstSafeString(record?.postal_code, record?.postalCode) || null,
      manual: Boolean(record?.manual),
    });
  }

  return recipients;
}

function recipientsForAction(
  action: AgentPreparedAction | null,
): CampaignRecipientPreview[] {
  if (!action) return [];
  return normalizeCampaignRecipients(
    action.payload?.recipients || action.recipients,
  );
}

function recipientDisplayName(recipient: CampaignRecipientPreview) {
  return firstSafeString(
    recipient.display_name,
    recipient.displayName,
    recipient.name,
    recipient.company_name,
    recipient.companyName,
    recipient.email,
  );
}

function contactDisplayName(contact: CrmContactForAgent) {
  const person = [contact.first_name, contact.last_name]
    .map((part) => firstSafeString(part))
    .filter(Boolean)
    .join(" ")
    .trim();
  if (person && contact.company_name)
    return `${person} · ${contact.company_name}`;
  return (
    person ||
    firstSafeString(contact.company_name, contact.email, "Contact CRM")
  );
}

function contactToCampaignRecipient(
  contact: CrmContactForAgent,
): CampaignRecipientPreview | null {
  const email = firstSafeString(contact.email).toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(email)) return null;
  return {
    contact_id: contact.id,
    display_name: contactDisplayName(contact),
    email,
    phone: firstSafeString(contact.phone) || null,
    category: firstSafeString(contact.category) || null,
    contact_type: firstSafeString(contact.contact_type) || null,
    company_name: firstSafeString(contact.company_name) || null,
    city: firstSafeString(contact.city) || null,
    postal_code: firstSafeString(contact.postal_code) || null,
  };
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value.trim());
}

function parseRecipientEmails(value: string) {
  const seen = new Set<string>();
  return value
    .split(/[;,\s]+/g)
    .map((item) => item.trim().toLowerCase())
    .filter((email) => {
      if (!email || !isValidEmail(email) || seen.has(email)) return false;
      seen.add(email);
      return true;
    });
}

function sanitizeDepartmentFilter(value: string) {
  return value
    .replace(/[^0-9abAB]/g, "")
    .slice(0, 3)
    .toUpperCase();
}

function contactDepartment(postalCode: string | null | undefined) {
  const cleaned = sanitizeDepartmentFilter(firstSafeString(postalCode));
  if (/^(97|98)\d/.test(cleaned)) return cleaned.slice(0, 3);
  return cleaned.slice(0, 2);
}

function formatRecipientMetaValue(value: string | null | undefined) {
  const cleaned = firstSafeString(value).replace(/[_-]+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned
    .split(/\s+/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function contactMetaLine(contact: CrmContactForAgent) {
  const parts = [
    formatRecipientMetaValue(contact.contact_type),
    formatRecipientMetaValue(contact.category),
    contactDepartment(contact.postal_code),
  ].filter(Boolean);
  return parts.join(" · ") || "Contact CRM";
}

function recipientMetaLine(recipient: CampaignRecipientPreview) {
  const parts = [
    formatRecipientMetaValue(recipient.contact_type),
    formatRecipientMetaValue(recipient.category),
    contactDepartment(recipient.postal_code),
  ].filter(Boolean);
  if (recipient.manual && parts.length === 0) return "Destinataire libre";
  return parts.join(" · ") || "Destinataire";
}

function manualRecipientFromEmail(
  emailValue: string,
): CampaignRecipientPreview | null {
  const email = emailValue.trim().toLowerCase();
  if (!isValidEmail(email)) return null;
  return {
    contact_id: null,
    display_name: email,
    email,
    contact_type: "manuel",
    category: "manuel",
    manual: true,
  };
}

function mailAccountEmail(
  account:
    | Partial<AgentMailAccount>
    | Record<string, unknown>
    | null
    | undefined,
) {
  return firstSafeString(
    account?.email_address,
    account?.account_email,
    account?.email,
    account?.resource_label,
    account?.label,
  );
}

function mailAccountLabel(account: AgentMailAccount) {
  return firstSafeString(
    account.email_address,
    account.account_email,
    account.email,
    account.resource_label,
    account.label,
    account.display_name,
    account.provider,
    "Boîte mail",
  );
}

function mailAccountSecondaryLabel(
  account:
    | Partial<AgentMailAccount>
    | Record<string, unknown>
    | null
    | undefined,
) {
  const provider = firstSafeString(account?.provider, "mail");
  const displayName = firstSafeString(account?.display_name);
  return displayName ? `${provider} · ${displayName}` : provider;
}

function extractCampaignMailPreview(
  action: AgentPreparedAction | null,
): CampaignMailPreview | null {
  if (!isCampaignPreparedAction(action)) return null;
  const payload = action.payload || {};
  const mailAccount = asRecord(payload.mailAccount);
  const subject = firstSafeString(
    payload.campaignSubject,
    payload.subject,
    action.title,
  );
  const body = firstSafeString(
    payload.campaignBody,
    payload.bodyText,
    payload.text,
    action.previewText,
    action.summary,
  );
  const mission = firstSafeString(
    payload.mission,
    targetThemesLabel(action),
    action.automationKey === "loyalty" ? "Fidéliser" : "Propulser",
  );
  const accountLabel = firstSafeString(
    mailAccount?.email_address,
    mailAccount?.account_email,
    mailAccount?.email,
    payload.mailAccountEmail,
    payload.accountEmail,
    mailAccount?.label,
    payload.mailAccountLabel,
    payload.accountLabel,
    mailAccount?.provider,
    "Boîte mail connectée",
  );
  const accountProvider = firstSafeString(
    mailAccount?.provider,
    payload.mailProvider,
    "Mails",
  );

  return {
    subject,
    body,
    paragraphs: mailParagraphs(body),
    mission,
    recipientsCount: recipientsCountForAction(action),
    mailAccountLabel: accountLabel,
    mailAccountProvider: accountProvider,
    attachment: extractCampaignAttachment(payload),
  };
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
  if (Number.isFinite(payloadCount) && payloadCount > 0)
    return Math.round(payloadCount);
  return Array.isArray(action.recipients) ? action.recipients.length : 0;
}

function formatActionDate(
  value: string | null,
  fallback: AutomationConfig,
): string {
  const fallbackLabel = `${fallback.day} ${fallback.time}`.trim();
  if (!value) return fallbackLabel || "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallbackLabel || "—";

  const weekday = new Intl.DateTimeFormat("fr-FR", { weekday: "long" }).format(
    date,
  );
  const time = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${time}`;
}

function extractReportDocument(
  action: AgentPreparedAction,
): AgentReportDocument | null {
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
    mimeType:
      firstSafeString(report.mimeType, report.mime_type) || "application/pdf",
    bytes: Number(report.bytes || 0) || 0,
    createdAt:
      firstSafeString(report.createdAt, report.created_at) ||
      action.createdAt ||
      undefined,
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

function extractStatsReportRecommendations(
  action: AgentPreparedAction,
): string[] {
  const payload = action.payload || {};
  const insights =
    asRecord(payload.insights) ||
    asRecord(payload.reportInsights) ||
    asRecord(payload.aiInsights);
  const rawRecommendations = insights?.recommendations;
  if (!Array.isArray(rawRecommendations)) return [];

  return rawRecommendations
    .map((item) => firstSafeString(item))
    .filter(Boolean)
    .slice(0, 5);
}

function statsReportsFromActions(
  actions: AgentPreparedAction[],
  options: { automaticOnly?: boolean; limit?: number } = {},
): AgentStatsReport[] {
  const limit = options.limit ?? 5;

  return actions
    .filter((action) => {
      if (action.actionType !== "stats_report" || action.status !== "completed")
        return false;
      if (options.automaticOnly && reportRunMode(action) === "manual")
        return false;
      return true;
    })
    .map((action): AgentStatsReport | null => {
      const document = extractReportDocument(action);
      if (!document) return null;
      return {
        id: action.id,
        title: action.title,
        summary: action.summary,
        recommendations: extractStatsReportRecommendations(action),
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

function prepareProgressLabel(
  key: Exclude<AutomationKey, "stats">,
  percent: number,
) {
  if (percent >= 100) return "Publication prête";
  if (percent >= 86) return "Enregistrement dans iNr’Agent";
  if (percent >= 66)
    return key === "publish"
      ? "Adaptation par canal"
      : "Préparation de la campagne";
  if (percent >= 38) return "Génération IA";
  if (percent >= 16) return "Analyse de l’activité";
  return "Initialisation";
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

function scheduleDateParts(
  value: string | null | undefined,
  fallbackDate = "—",
  fallbackTime = "—",
) {
  const formatted = formatReportDateLabel(value);
  return {
    date: formatted.date === "—" ? fallbackDate : formatted.date,
    time: formatted.time || fallbackTime,
  };
}

function scheduledActionStatusLabel(status: AgentScheduledAction["status"]) {
  if (status === "running") return "En cours";
  if (status === "done") return "Exécuté";
  if (status === "failed") return "Échec";
  if (status === "cancelled") return "Annulé";
  return "Programmé";
}

function scheduledActionSortDate(action: AgentScheduledAction) {
  return (
    action.executedAt ||
    action.updatedAt ||
    action.scheduledAt ||
    action.createdAt ||
    ""
  );
}

function scheduleTypeLabelFromAutomation(
  key: AutomationKey | null | undefined,
) {
  if (key === "publish") return "Publication";
  if (key === "grow") return "Propulsion";
  if (key === "loyalty") return "Fidélisation";
  if (key === "stats") return "Statistiques";
  return "Action";
}

function scheduleChannelLabelFromAutomation(
  key: AutomationKey | null | undefined,
  channel?: string | null,
) {
  if (key === "publish")
    return channel
      ? channelOptions[channel as ChannelKey]?.name || channel
      : "Publication";
  if (key === "stats") return "Bilan";
  return "Mails";
}

function scheduledActionTypeLabel(action: AgentScheduledAction) {
  const targetTool = String(action.targetTool || "").toLowerCase();
  const actionType = String(action.actionType || "").toLowerCase();
  const kind = String(
    (action.payload as Record<string, unknown> | undefined)?.kind || "",
  ).toLowerCase();
  const workflow = String(
    (action.payload as Record<string, unknown> | undefined)
      ?.workflowFinalizerKind || "",
  ).toLowerCase();

  if (
    targetTool === "booster" ||
    actionType === "publication" ||
    kind === "manual_publish_schedule"
  )
    return "Publication";
  if (
    targetTool === "propulser" ||
    workflow === "propulser" ||
    action.automationKey === "grow"
  )
    return "Propulsion";
  if (
    targetTool === "fideliser" ||
    workflow === "fideliser" ||
    action.automationKey === "loyalty"
  )
    return "Fidélisation";
  if (
    targetTool === "mails" ||
    actionType === "mailing" ||
    kind === "mail_campaign"
  )
    return "Mail";
  if (action.automationKey)
    return scheduleTypeLabelFromAutomation(action.automationKey);
  return "Action";
}

function channelDisplayName(channel: string | null | undefined) {
  const normalized = String(channel || "").trim();
  const mapped: Record<string, ChannelKey> = {
    inrcy_site: "siteInrcy",
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
  const key = mapped[normalized] || (normalized as ChannelKey);
  return channelOptions[key]?.name || normalized || "—";
}

function scheduledActionChannelLabel(action: AgentScheduledAction) {
  const typeLabel = scheduledActionTypeLabel(action);
  if (typeLabel === "Publication") {
    const channel = action.channels[0];
    return channel ? channelDisplayName(channel) : "Publication";
  }
  if (typeLabel === "Statistiques") return "Bilan";
  return "Mails";
}

function isoToLocalDateInput(value: string | null | undefined) {
  const date = new Date(String(value || ""));
  if (!Number.isFinite(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isoToLocalTimeInput(value: string | null | undefined) {
  const date = new Date(String(value || ""));
  if (!Number.isFinite(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function localInputsToIso(dateValue: string, timeValue: string) {
  const date = new Date(`${dateValue}T${timeValue || "00:00"}:00`);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toISOString();
}

function openNativeDateTimePicker(input: HTMLInputElement | null) {
  if (!input || input.disabled) return;
  try {
    input.focus({ preventScroll: true });
  } catch {
    input.focus();
  }
  const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
  if (typeof pickerInput.showPicker === "function") {
    try {
      pickerInput.showPicker();
      return;
    } catch {
      // Safari et certains navigateurs peuvent refuser showPicker.
    }
  }
  input.click();
}

function CalendarMiniIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 3v3M17 3v3M4.5 9.5h15M6.5 5h11A2.5 2.5 0 0 1 20 7.5v10A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-10A2.5 2.5 0 0 1 6.5 5Z" />
      <path d="M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01" />
    </svg>
  );
}

function ClockMiniIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
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
  const normalizedSlots =
    config.frequency === "2 fois par semaine"
      ? normalizeConfigScheduleSlots(config).slice(0, 2)
      : [{ day: config.day, time: config.time }];
  const now = new Date();
  const isFirstWeekday = (date: Date, targetDay: number) =>
    date.getDay() === targetDay && date.getDate() <= 7;
  const isThirdWeekday = (date: Date, targetDay: number) =>
    date.getDay() === targetDay && date.getDate() >= 15 && date.getDate() <= 21;

  for (let offset = 0; offset <= 120; offset += 1) {
    const candidates = normalizedSlots
      .map((slot) => {
        const targetDay = weekdayMap[slot.day] ?? 1;
        const [hour, minute] = slot.time
          .split(":")
          .map((value) => Number(value || 0));
        const candidate = new Date(now.getTime());
        candidate.setSeconds(0, 0);
        candidate.setDate(candidate.getDate() + offset);
        candidate.setHours(hour, minute, 0, 0);
        if (candidate.getTime() <= now.getTime()) return null;
        const ok =
          config.frequency === "2 fois par semaine"
            ? candidate.getDay() === targetDay
            : config.frequency === "Tous les 15 jours" ||
                config.frequency === "2 fois par mois"
              ? isFirstWeekday(candidate, targetDay) ||
                isThirdWeekday(candidate, targetDay)
              : config.frequency === "Chaque mois" ||
                  config.frequency === "1 fois par mois"
                ? isFirstWeekday(candidate, targetDay)
                : config.frequency === "Chaque trimestre"
                  ? [0, 3, 6, 9].includes(candidate.getMonth()) &&
                    isFirstWeekday(candidate, targetDay)
                  : candidate.getDay() === targetDay;
        return ok ? candidate : null;
      })
      .filter((candidate): candidate is Date => Boolean(candidate))
      .sort((a, b) => a.getTime() - b.getTime());

    if (candidates[0]) return candidates[0].toISOString();
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
  const [agentConnectedChannels, setAgentConnectedChannels] =
    useState<ConnectedChannelMap | null>(null);
  const [connectedChannelsLoadState, setConnectedChannelsLoadState] =
    useState<LoadState>("loading");
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [tableMissing, setTableMissing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [aiConfigurationOpen, setAiConfigurationOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleEditAction, setScheduleEditAction] =
    useState<AgentScheduledAction | null>(null);
  const [scheduleEditDate, setScheduleEditDate] = useState("");
  const [scheduleEditTime, setScheduleEditTime] = useState("");
  const scheduleEditDateInputRef = useRef<HTMLInputElement | null>(null);
  const scheduleEditTimeInputRef = useRef<HTMLInputElement | null>(null);
  const validationScheduleDateInputRef = useRef<HTMLInputElement | null>(null);
  const validationScheduleTimeInputRef = useRef<HTMLInputElement | null>(null);
  const [scheduleMutationState, setScheduleMutationState] = useState<
    "idle" | "saving"
  >("idle");
  const [validationChoiceOpen, setValidationChoiceOpen] = useState(false);
  const [validationScheduleOpen, setValidationScheduleOpen] = useState(false);
  const [validationScheduleDate, setValidationScheduleDate] = useState("");
  const [validationScheduleTime, setValidationScheduleTime] = useState("");
  const [validationScheduleState, setValidationScheduleState] = useState<
    "idle" | "saving"
  >("idle");
  const [isMobileHeader, setIsMobileHeader] = useState(false);
  const [actions, setActions] = useState<AgentPreparedAction[]>([]);
  const [scheduledActions, setScheduledActions] = useState<
    AgentScheduledAction[]
  >([]);
  const [scheduledActionsTableMissing, setScheduledActionsTableMissing] =
    useState(false);
  const [actionsLoadState, setActionsLoadState] =
    useState<ActionsLoadState>("loading");
  const [actionMutationState, setActionMutationState] =
    useState<ActionMutationState>("idle");
  const [agentPublishExecutionProgress, setAgentPublishExecutionProgress] =
    useState<AgentPublishExecutionProgressState>(null);
  const [agentPublishSuccessSummary, setAgentPublishSuccessSummary] =
    useState<any | null>(null);
  const [agentCampaignLaunchNotice, setAgentCampaignLaunchNotice] =
    useState<AgentCampaignLaunchNotice>(null);
  const agentPublishProgressTimerRef = useRef<number | null>(null);
  const [prepareActionState, setPrepareActionState] =
    useState<PrepareActionState>("idle");
  const [prepareProgress, setPrepareProgress] =
    useState<PrepareProgressState>(null);
  const [testNowKey, setTestNowKey] = useState<AutomationKey | null>(null);
  const [prepareNowConfirm, setPrepareNowConfirm] =
    useState<PrepareNowConfirmState>(null);
  const [statsProgress, setStatsProgress] = useState<StatsProgressState>(null);
  const [selectedChannelByAction, setSelectedChannelByAction] = useState<
    Record<string, ChannelKey>
  >({});
  const [selectedChannelByAutomation, setSelectedChannelByAutomation] =
    useState<Partial<Record<AutomationKey, ChannelKey>>>({});
  const [campaignEditOpen, setCampaignEditOpen] = useState(false);
  const [publishEditChoiceOpen, setPublishEditChoiceOpen] = useState(false);
  const [mailTextEditOpen, setMailTextEditOpen] = useState(false);
  const [attachmentPreviewOpen, setAttachmentPreviewOpen] = useState(false);
  const [campaignDraftConfirmOpen, setCampaignDraftConfirmOpen] =
    useState(false);
  const [campaignTextDraft, setCampaignTextDraft] = useState({
    subject: "",
    body: "",
  });
  const [campaignSaveState, setCampaignSaveState] = useState<"idle" | "saving">(
    "idle",
  );
  const [campaignDraftSaveState, setCampaignDraftSaveState] = useState<
    "idle" | "saving"
  >("idle");
  const [recipientsPreviewOpen, setRecipientsPreviewOpen] = useState(false);
  const [recipientsEditOpen, setRecipientsEditOpen] = useState(false);
  const [crmContacts, setCrmContacts] = useState<CrmContactForAgent[]>([]);
  const [crmContactsLoading, setCrmContactsLoading] = useState(false);
  const [crmRecipientSearch, setCrmRecipientSearch] = useState("");
  const [crmRecipientFiltersOpen, setCrmRecipientFiltersOpen] = useState(false);
  const [crmRecipientCategory, setCrmRecipientCategory] = useState("all");
  const [crmRecipientType, setCrmRecipientType] = useState("all");
  const [crmRecipientDepartment, setCrmRecipientDepartment] = useState("");
  const [crmRecipientImportantOnly, setCrmRecipientImportantOnly] =
    useState(false);
  const [manualRecipientsInput, setManualRecipientsInput] = useState("");
  const [selectedRecipientEmails, setSelectedRecipientEmails] = useState<
    string[]
  >([]);
  const [newRecipientOpen, setNewRecipientOpen] = useState(false);
  const [newRecipientDraft, setNewRecipientDraft] = useState({
    name: "",
    email: "",
    phone: "",
  });
  const [newRecipientState, setNewRecipientState] = useState<"idle" | "saving">(
    "idle",
  );
  const [mailAccountEditOpen, setMailAccountEditOpen] = useState(false);
  const [mailAccounts, setMailAccounts] = useState<AgentMailAccount[]>([]);
  const [mailAccountsLoading, setMailAccountsLoading] = useState(false);
  const [selectedMailAccountId, setSelectedMailAccountId] = useState("");
  const [attachmentUploadState, setAttachmentUploadState] = useState<
    "idle" | "saving"
  >("idle");
  const [campaignMediaLibraryPickerOpen, setCampaignMediaLibraryPickerOpen] =
    useState(false);
  const [publishMediaPreviewOpen, setPublishMediaPreviewOpen] = useState(false);
  const [publishMediaLibraryPickerOpen, setPublishMediaLibraryPickerOpen] =
    useState(false);
  const [publishMediaUploadState, setPublishMediaUploadState] = useState<
    "idle" | "saving"
  >("idle");
  const [publishImageAdapterOpen, setPublishImageAdapterOpen] = useState(false);
  const [publishImageAdapterFile, setPublishImageAdapterFile] =
    useState<File | null>(null);
  const [publishImageAdapterPreviewUrl, setPublishImageAdapterPreviewUrl] =
    useState("");
  const [publishImageAdapterMeta, setPublishImageAdapterMeta] =
    useState<ImageMeta | null>(null);
  const [publishImageAdapterTransform, setPublishImageAdapterTransform] =
    useState<ImageTransform | null>(null);
  const [publishImageAdapterSaving, setPublishImageAdapterSaving] =
    useState(false);
  const [publishImageAdapterDragging, setPublishImageAdapterDragging] =
    useState(false);
  const publishImageAdapterStageRef = useRef<HTMLDivElement | null>(null);
  const [publishImageAdapterStageSize, setPublishImageAdapterStageSize] =
    useState({ width: 0, height: 0 });
  const publishImageAdapterDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);
  const [publishVideoAdapterOpen, setPublishVideoAdapterOpen] = useState(false);
  const [publishVideoFormat, setPublishVideoFormat] =
    useState<VideoFormat>("original");
  const [publishVideoAdaptationMode, setPublishVideoAdaptationMode] =
    useState<VideoAdaptationMode>("safe_blur");
  const [publishVideoPreparationState, setPublishVideoPreparationState] =
    useState<BoosterVideoPreparationState | null>(null);
  const [publishVideoAdapterSaving, setPublishVideoAdapterSaving] =
    useState(false);
  const [publishMediaLibraryItems, setPublishMediaLibraryItems] = useState<
    AgentMediaLibraryItem[]
  >([]);
  const [publishMediaLibraryState, setPublishMediaLibraryState] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [publishEditOpen, setPublishEditOpen] = useState(false);
  const [publishTextDraft, setPublishTextDraft] = useState({
    channel: "" as ChannelKey | "",
    title: "",
    body: "",
    cta: "",
    ctaMode: "none" as BoosterCtaMode,
    ctaUrl: "",
    ctaPhone: "",
    hashtags: "",
  });
  const [publishCtaDefaults, setPublishCtaDefaults] =
    useState<BoosterCtaDefaults | null>(null);
  const [publishSaveState, setPublishSaveState] = useState<"idle" | "saving">(
    "idle",
  );
  const publishBodyEditorRef = useRef<HTMLDivElement | null>(null);
  const campaignBodyEditorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobileHeader(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (!publishImageAdapterOpen || !publishImageAdapterStageRef.current)
      return;
    const node = publishImageAdapterStageRef.current;
    const update = () => {
      const rect = node.getBoundingClientRect();
      setPublishImageAdapterStageSize({
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [publishImageAdapterOpen]);

  useEffect(() => {
    return () => {
      if (publishImageAdapterPreviewUrl) {
        URL.revokeObjectURL(publishImageAdapterPreviewUrl);
      }
    };
  }, [publishImageAdapterPreviewUrl]);

  useEffect(() => {
    let alive = true;

    async function loadPublishCtaDefaults() {
      try {
        const response = await fetch("/api/booster/cta-defaults", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = await response.json().catch(() => ({}));
        if (!alive) return;
        setPublishCtaDefaults({
          preferredWebsiteUrl: String(
            payload?.preferredWebsiteUrl || "",
          ).trim(),
          preferredWebsiteLabel: String(
            payload?.preferredWebsiteLabel || "",
          ).trim(),
          siteWebUrl: String(payload?.siteWebUrl || "").trim(),
          inrcySiteUrl: String(payload?.inrcySiteUrl || "").trim(),
          phone: String(payload?.phone || "").trim(),
          preferredCta: normalizeBoosterPreferredCta(payload?.preferredCta),
          aiLanguage: normalizeBoosterAiLanguage(payload?.aiLanguage),
        });
      } catch {
        // La modale reste utilisable sans valeurs par défaut.
      }
    }

    loadPublishCtaDefaults();
    const handleAiConfigurationUpdated = () => loadPublishCtaDefaults();
    window.addEventListener(
      "inrcy:ai-configuration-updated",
      handleAiConfigurationUpdated,
    );
    return () => {
      alive = false;
      window.removeEventListener(
        "inrcy:ai-configuration-updated",
        handleAiConfigurationUpdated,
      );
    };
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

  useEffect(() => {
    let alive = true;

    async function loadConnectedChannels() {
      setConnectedChannelsLoadState("loading");
      try {
        const response = await fetch("/api/integrations/channel-states", {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => null);
        if (!alive) return;
        if (!response.ok) {
          throw new Error("Canaux connectés indisponibles.");
        }

        const nextConnectedChannels = channelMapFromConnectionStates(payload);
        setAgentConnectedChannels(nextConnectedChannels);
        setConnectedChannelsLoadState("ready");
      } catch {
        if (!alive) return;
        setAgentConnectedChannels(null);
        setConnectedChannelsLoadState("error");
      }
    }

    loadConnectedChannels();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!agentConnectedChannels || loadState === "loading") return;
    setConfigs((current) =>
      normalizeConfigsForConnectedChannels(current, agentConnectedChannels),
    );
  }, [agentConnectedChannels, loadState]);
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

  async function refreshScheduledActions(silent = false) {
    try {
      const response = await fetch("/api/agent/scheduled-actions", {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response
        .json()
        .catch(() => null)) as ScheduledActionsResponse | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Actions programmées indisponibles.");
      }

      setScheduledActions(
        Array.isArray(payload?.scheduledActions)
          ? payload.scheduledActions
          : [],
      );
      setScheduledActionsTableMissing(Boolean(payload?.tableMissing));
    } catch (error) {
      if (!silent) {
        showNotice(
          error instanceof Error
            ? error.message
            : "Actions programmées indisponibles.",
        );
      }
    }
  }

  useEffect(() => {
    refreshActions();
    refreshScheduledActions(true);
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

  const selectedHeaderTool = useMemo(
    () => headerToolLinkForAutomation(selected.key),
    [selected.key],
  );

  const upcomingScheduleItems = useMemo<ScheduleListItem[]>(() => {
    const rows: ScheduleListItem[] = [];

    for (const automation of automations) {
      const config = configs[automation.key];
      if (!config?.enabled) continue;
      const nextOccurrence = computeNextOccurrence(config);
      const dateParts = scheduleDateParts(
        nextOccurrence,
        config.day || "—",
        config.time || "—",
      );
      const channels =
        automation.key === "stats"
          ? (["mails"] as ChannelKey[])
          : orderChannels(
              config.channels,
              connectedChannelsForAutomation(automation, agentConnectedChannels),
            );

      if (automation.key !== "stats" && channels.length === 0) continue;

      for (const channel of channels) {
        rows.push({
          id: `automatic-${automation.key}-${channel}`,
          action: automation.title,
          date: dateParts.date,
          time: dateParts.time,
          typeLabel: scheduleTypeLabelFromAutomation(automation.key),
          channelLabel: scheduleChannelLabelFromAutomation(
            automation.key,
            channel,
          ),
          originLabel: "Automatique",
          status: "Automatique",
          statusKey: "scheduled",
          automationKey: automation.key,
          scheduledAtIso: nextOccurrence,
          editable: true,
          removable: true,
          source: "automatic",
        });
      }
    }

    for (const action of scheduledActions) {
      if (
        action.source !== "manual" ||
        !["scheduled", "running", "failed"].includes(action.status)
      )
        continue;
      const dateParts = scheduleDateParts(
        action.scheduledAt || action.createdAt,
      );
      rows.push({
        id: `manual-${action.id}`,
        action: action.title || "Action programmée",
        date: dateParts.date,
        time: dateParts.time,
        typeLabel: scheduledActionTypeLabel(action),
        channelLabel: scheduledActionChannelLabel(action),
        originLabel: "Programmé",
        status: scheduledActionStatusLabel(action.status),
        statusKey: action.status,
        automationKey: action.automationKey,
        scheduledActionId: action.id,
        scheduledAtIso: action.scheduledAt || action.createdAt,
        editable: action.status !== "running",
        removable: true,
        source: "manual",
      });
    }

    return rows.sort((a, b) => {
      if (a.statusKey === "failed" && b.statusKey !== "failed") return -1;
      if (b.statusKey === "failed" && a.statusKey !== "failed") return 1;
      return (
        new Date(a.scheduledAtIso || 0).getTime() -
        new Date(b.scheduledAtIso || 0).getTime()
      );
    });
  }, [agentConnectedChannels, configs, scheduledActions]);

  const manualHistoryItems = useMemo<ScheduleListItem[]>(() => {
    return scheduledActions
      .filter(
        (action) =>
          action.source === "manual" &&
          ["done", "cancelled"].includes(action.status),
      )
      .sort(
        (a, b) =>
          new Date(scheduledActionSortDate(b)).getTime() -
          new Date(scheduledActionSortDate(a)).getTime(),
      )
      .slice(0, 8)
      .map((action) => {
        const dateParts = scheduleDateParts(
          action.executedAt ||
            action.updatedAt ||
            action.scheduledAt ||
            action.createdAt,
        );
        return {
          id: `history-${action.id}`,
          action: action.title || "Action programmée",
          date: dateParts.date,
          time: dateParts.time,
          typeLabel: scheduledActionTypeLabel(action),
          channelLabel: scheduledActionChannelLabel(action),
          originLabel: "Programmé",
          status: scheduledActionStatusLabel(action.status),
          statusKey: action.status,
          automationKey: action.automationKey,
          scheduledActionId: action.id,
          scheduledAtIso:
            action.executedAt ||
            action.updatedAt ||
            action.scheduledAt ||
            action.createdAt,
          editable: false,
          removable: false,
          source: "manual",
        };
      });
  }, [scheduledActions]);

  const selectedConfig = configs[selected.key];
  const selectedAvailableChannels = useMemo(
    () => connectedChannelsForAutomation(selected, agentConnectedChannels),
    [agentConnectedChannels, selected],
  );
  const selectedRobotSteps = robotStepsByAutomation[selected.key];
  const settingsConfig = settingsKey ? configs[settingsKey] : null;
  const settingsAvailableChannels = useMemo(
    () =>
      settingsAutomation
        ? connectedChannelsForAutomation(settingsAutomation, agentConnectedChannels)
        : [],
    [agentConnectedChannels, settingsAutomation],
  );
  const settingsNoConnectedChannelBlock = Boolean(
    settingsAutomation &&
      settingsAutomation.key !== "stats" &&
      settingsAutomation.availableChannels.length > 0 &&
      connectedChannelsLoadState === "ready" &&
      settingsAvailableChannels.length === 0,
  );
  const settingsConnectedChannelMessage = settingsNoConnectedChannelBlock
    ? connectedChannelMessage(settingsAutomation)
    : "";
  const hasPreparedAction = Boolean(selectedPreparedAction);
  const preparedImage = selectedPreparedAction
    ? extractImageAsset(selectedPreparedAction)
    : null;
  const preparedImageUrl = imageAssetUrl(preparedImage);
  const selectedConfigChannels = useMemo(
    () => orderChannels(selectedConfig.channels, selectedAvailableChannels),
    [selectedAvailableChannels, selectedConfig.channels],
  );
  const preparedChannels = useMemo(
    () =>
      selectedPreparedAction
        ? orderChannels(
            channelsForAction(selectedPreparedAction, selectedConfigChannels),
            selectedAvailableChannels,
          )
        : [],
    [
      selectedAvailableChannels,
      selectedPreparedAction,
      selectedConfigChannels,
    ],
  );
  const preparedChannelsKey = preparedChannels.join("|");
  const displayChannels = hasPreparedAction
    ? preparedChannels
    : loadState === "loading"
      ? []
      : selectedConfigChannels;
  const selectedStatsRubriques =
    selected.key === "stats" && loadState !== "loading"
      ? selectedConfig.themes.filter((theme) =>
          Boolean(statsRubriqueOptions[theme]),
        )
      : [];
  const placeholderPreviewChannels = !selectedPreparedAction
    ? displayChannels.length > 0
      ? displayChannels
      : selectedConfigChannels
    : [];
  const selectedAutomationChannel = selectedChannelByAutomation[selected.key];
  const activePreviewChannel = selectedPreparedAction
    ? preparedChannels.includes(
        selectedChannelByAction[selectedPreparedAction.id] as ChannelKey,
      )
      ? selectedChannelByAction[selectedPreparedAction.id]
      : (preparedChannels[0] ?? null)
    : placeholderPreviewChannels.includes(
          selectedAutomationChannel as ChannelKey,
        )
      ? (selectedAutomationChannel as ChannelKey)
      : (placeholderPreviewChannels[0] ?? null);
  const activePreviewChannelLabel = activePreviewChannel
    ? channelOptions[activePreviewChannel]?.name
    : "Aperçu";
  const preparedChannelPreview = selectedPreparedAction
    ? extractChannelPreview(selectedPreparedAction, activePreviewChannel)
    : null;
  const preparedParagraphs = previewParagraphs(
    preparedChannelPreview?.body || selectedPreparedAction?.summary || "",
  );
  const isPublishView = selected.key === "publish";
  const publishMediaPreview = isPublishView
    ? extractPublishMediaPreview(selectedPreparedAction, activePreviewChannel)
    : null;
  const publishMediaAdaptationPreview = isPublishView
    ? extractPublishMediaAdaptationPreview(
        selectedPreparedAction,
        activePreviewChannel,
      )
    : null;
  const publishMediaRetouchLabel =
    publishMediaPreview?.kind === "video"
      ? "Adapter la vidéo"
      : publishMediaPreview?.kind === "image"
        ? "Adapter l’image"
        : "Adapter le média";
  const publishMediaRetouchIcon =
    publishMediaPreview?.kind === "video"
      ? "🎞️"
      : publishMediaPreview?.kind === "image"
        ? "🪄"
        : "✨";
  const publishBoosterChannel =
    boosterChannelKeyFromAgentChannel(activePreviewChannel);
  const publishImageAdapterPreset = CHANNEL_PRESETS[publishBoosterChannel];
  const publishImageAdapterTransformSafe =
    publishImageAdapterTransform || getDefaultTransform(publishBoosterChannel);
  const publishImageAdapterEffectiveZoom = getEffectiveTransformZoom(
    publishImageAdapterTransformSafe,
  );
  const publishImageAdapterBackgroundMode = getBackgroundMode(
    publishImageAdapterTransformSafe,
  );
  const publishImageAdapterBackgroundColor = getBackgroundFill(
    publishImageAdapterTransformSafe.backgroundMode ||
      publishImageAdapterBackgroundMode,
    publishImageAdapterTransformSafe.backgroundColor,
  );
  const publishImageAdapterAspectRatio = `${publishImageAdapterPreset.width} / ${publishImageAdapterPreset.height}`;
  const publishImageAdapterPreviewLayout = computePreviewLayout({
    containerWidth:
      publishImageAdapterStageSize.width || publishImageAdapterPreset.width,
    containerHeight:
      publishImageAdapterStageSize.height || publishImageAdapterPreset.height,
    imageWidth: publishImageAdapterMeta?.width || 0,
    imageHeight: publishImageAdapterMeta?.height || 0,
    transform: publishImageAdapterTransformSafe,
  });
  const currentPublishMediaRecord = getPublishMediaRecord(
    selectedPreparedAction,
    activePreviewChannel,
  );
  const publishParagraphs = isPublishView
    ? publishPostParagraphs(
        preparedChannelPreview?.body || selectedPreparedAction?.summary || "",
      )
    : [];
  const publishHasText = Boolean(
    isPublishView &&
    (preparedChannelPreview?.title ||
      preparedChannelPreview?.body ||
      preparedChannelPreview?.cta ||
      preparedChannelPreview?.hashtags.length ||
      selectedPreparedAction?.summary),
  );
  const publishContentKind = isPublishView
    ? publishContentKindLabel({
        media: publishMediaPreview,
        hasText: publishHasText,
      })
    : "—";
  const publishStatus = isPublishView
    ? publishStatusLabel({
        action: selectedPreparedAction,
        media: publishMediaPreview,
        hasText: publishHasText,
      })
    : { label: "—", tone: "neutral" as const };
  const publishStatusClass =
    publishStatus.tone === "blocked"
      ? styles.publishStatusBlocked
      : publishStatus.tone === "warning"
        ? styles.publishStatusWarning
        : publishStatus.tone === "ready"
          ? styles.publishStatusReady
          : styles.publishStatusNeutral;
  const publishCtaLine = isPublishView
    ? extractPublishCtaLine(
        selectedPreparedAction,
        activePreviewChannel,
        preparedChannelPreview,
      )
    : "—";
  const preparedRecipientsCount = recipientsCountForAction(
    selectedPreparedAction,
  );
  const isCampaignView = isCampaignAutomationKey(selected.key);
  const campaignMailPreview = isCampaignView
    ? extractCampaignMailPreview(selectedPreparedAction)
    : null;
  const hasCampaignPreview = Boolean(
    isCampaignView && selectedPreparedAction && campaignMailPreview,
  );
  const campaignPlaceholderPreview: CampaignMailPreview | null = isCampaignView
    ? {
        subject: "—",
        body: "—",
        paragraphs: ["—"],
        mission: "—",
        recipientsCount: 0,
        mailAccountLabel: "—",
        mailAccountProvider: "Mails",
        attachment: null,
      }
    : null;
  const campaignDisplayPreview =
    campaignMailPreview ?? campaignPlaceholderPreview;
  const campaignRecipients = recipientsForAction(selectedPreparedAction);
  const campaignAttachments = normalizeCampaignAttachmentRefs(
    selectedPreparedAction?.payload?.attachments,
  );
  const filteredCrmContacts = useMemo(() => {
    const q = crmRecipientSearch.trim().toLowerCase();
    const department = sanitizeDepartmentFilter(crmRecipientDepartment);
    return crmContacts.filter((contact) => {
      if (!firstSafeString(contact.email)) return false;
      if (crmRecipientImportantOnly && !contact.important) return false;
      if (
        crmRecipientCategory !== "all" &&
        firstSafeString(contact.category).toLowerCase() !== crmRecipientCategory
      )
        return false;
      if (
        crmRecipientType !== "all" &&
        firstSafeString(contact.contact_type).toLowerCase() !== crmRecipientType
      )
        return false;
      if (
        department &&
        !contactDepartment(contact.postal_code).startsWith(department)
      )
        return false;
      if (!q) return true;
      return [
        contactDisplayName(contact),
        contact.email,
        contact.phone,
        contact.company_name,
        contact.city,
        contact.postal_code,
        contact.contact_type,
        contact.category,
      ]
        .map((value) => firstSafeString(value).toLowerCase())
        .some((value) => value.includes(q));
    });
  }, [
    crmContacts,
    crmRecipientCategory,
    crmRecipientDepartment,
    crmRecipientImportantOnly,
    crmRecipientSearch,
    crmRecipientType,
  ]);
  const crmRecipientsByEmail = useMemo(() => {
    return new Map(
      crmContacts
        .map((contact) => contactToCampaignRecipient(contact))
        .filter((recipient): recipient is CampaignRecipientPreview =>
          Boolean(recipient),
        )
        .map((recipient) => [recipient.email.toLowerCase(), recipient]),
    );
  }, [crmContacts]);
  const manualSelectedRecipientEmails = useMemo(() => {
    return selectedRecipientEmails.filter(
      (email) => !crmRecipientsByEmail.has(email.toLowerCase()),
    );
  }, [crmRecipientsByEmail, selectedRecipientEmails]);
  const filteredCrmRecipientEmails = useMemo(() => {
    return filteredCrmContacts
      .map((contact) =>
        contactToCampaignRecipient(contact)?.email.toLowerCase(),
      )
      .filter((email): email is string => Boolean(email));
  }, [filteredCrmContacts]);
  const filteredCrmSelectedCount = useMemo(() => {
    const selected = new Set(
      selectedRecipientEmails.map((email) => email.toLowerCase()),
    );
    return filteredCrmRecipientEmails.filter((email) => selected.has(email))
      .length;
  }, [filteredCrmRecipientEmails, selectedRecipientEmails]);
  const filteredCrmAllSelected =
    filteredCrmRecipientEmails.length > 0 &&
    filteredCrmSelectedCount === filteredCrmRecipientEmails.length;
  const filteredCrmSelectionLabel = filteredCrmAllSelected ? "Aucun" : "Tout";
  const activeCrmRecipientFiltersCount =
    (crmRecipientCategory !== "all" ? 1 : 0) +
    (crmRecipientType !== "all" ? 1 : 0) +
    (crmRecipientDepartment.trim() ? 1 : 0) +
    (crmRecipientImportantOnly ? 1 : 0);
  const selectedAutomationSettings = agentSettings.automations[selected.key];
  const statsReports = useMemo(
    () => statsReportsFromActions(actions, { automaticOnly: true, limit: 5 }),
    [actions],
  );
  const latestStatsReport = useMemo(
    () => statsReportsFromActions(actions, { limit: 1 })[0] ?? null,
    [actions],
  );
  const latestAutomaticStatsReport = statsReports[0] ?? null;
  const latestStatsRecommendations =
    latestAutomaticStatsReport?.recommendations ?? [];
  const statsLastReportLabel = latestStatsReport
    ? formatDateTimeLabel(
        latestStatsReport.document.createdAt ||
          latestStatsReport.completedAt ||
          latestStatsReport.createdAt,
      )
    : "Aucun";
  const statsNextRunLabel = formatDateTimeLabel(
    selectedAutomationSettings?.nextRunAt ||
      (selected.key === "stats" ? computeNextOccurrence(selectedConfig) : null),
    "Programmation inactive",
  );
  const statsAutomationLabel = selectedConfig.enabled
    ? "Activée"
    : "Désactivée";
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

  function selectPreviewChannel(channelKey: ChannelKey) {
    if (selectedPreparedAction) {
      setSelectedChannelByAction((current) => ({
        ...current,
        [selectedPreparedAction.id]: channelKey,
      }));
      return;
    }

    setSelectedChannelByAutomation((current) => ({
      ...current,
      [selected.key]: channelKey,
    }));
  }

  function movePreviewChannel(direction: -1 | 1) {
    const channels =
      displayChannels.length > 0 ? displayChannels : placeholderPreviewChannels;
    if (channels.length < 2) return;

    const currentIndex = activePreviewChannel
      ? channels.indexOf(activePreviewChannel)
      : -1;
    const fallbackIndex = direction > 0 ? 0 : channels.length - 1;
    const nextIndex =
      currentIndex >= 0
        ? (currentIndex + direction + channels.length) % channels.length
        : fallbackIndex;

    const nextChannel = channels[nextIndex];
    if (nextChannel) selectPreviewChannel(nextChannel);
  }

  function openMailTextEditor() {
    const preview = extractCampaignMailPreview(selectedPreparedAction);
    if (!preview) return;
    setCampaignTextDraft({ subject: preview.subject, body: preview.body });
    setCampaignEditOpen(false);
    setMailTextEditOpen(true);
  }

  async function saveCampaignText() {
    if (!selectedPreparedAction || campaignSaveState === "saving") return;
    const subject = campaignTextDraft.subject.trim();
    const body = campaignTextDraft.body.trim();
    if (!subject || !body) {
      showNotice("L’objet et le corps du mail sont obligatoires.");
      return;
    }

    setCampaignSaveState("saving");
    setNotice(null);

    try {
      const response = await fetch("/api/agent/actions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionId: selectedPreparedAction.id,
          editType: "campaign_text",
          subject,
          bodyText: body,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        action?: AgentPreparedAction;
        error?: string;
      } | null;

      if (!response.ok || !payload?.action) {
        throw new Error(payload?.error || "Modification du mail impossible.");
      }

      const updatedAction = payload.action;
      setActions((current) =>
        current.map((action) =>
          action.id === updatedAction.id ? updatedAction : action,
        ),
      );
      setMailTextEditOpen(false);
      showNotice("Texte de la campagne mis à jour.");
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Modification du mail impossible.",
      );
    } finally {
      setCampaignSaveState("idle");
    }
  }

  function openPublishTextEditor() {
    if (
      !selectedPreparedAction ||
      !isPublishPreparedAction(selectedPreparedAction) ||
      !activePreviewChannel
    ) {
      showNotice("Prépare d’abord une publication.");
      return;
    }
    const preview = extractChannelPreview(
      selectedPreparedAction,
      activePreviewChannel,
    );
    const displayKey = boosterDisplayKeyFromAgentChannel(activePreviewChannel);
    const fallbackChoice = normalizeBoosterPreferredCta(
      publishCtaDefaults?.preferredCta,
    );
    const inferredChoice =
      preview.ctaMode === "none" && preview.cta
        ? inferPreferredCtaChoiceFromLabel(preview.cta, fallbackChoice)
        : fallbackChoice;
    const shouldPrefillCta =
      !preview.cta &&
      !preview.ctaUrl &&
      !preview.ctaPhone &&
      publishCtaDefaults;
    const basePost: BoosterChannelPost = {
      title: preview.title || "",
      content: preview.body || "",
      cta: preview.cta || "",
      ctaMode: preview.ctaMode,
      ctaUrl: preview.ctaUrl || "",
      ctaPhone: preview.ctaPhone || "",
      hashtags: preview.hashtags,
    };
    const ctaPatch = shouldPrefillCta
      ? buildPreferredCtaPatch(
          displayKey,
          fallbackChoice,
          basePost,
          publishCtaDefaults,
          publishCtaDefaults?.aiLanguage,
        )
      : preview.ctaMode === "none" && preview.cta
        ? buildPreferredCtaPatch(
            displayKey,
            inferredChoice,
            basePost,
            publishCtaDefaults,
            publishCtaDefaults?.aiLanguage,
          )
        : {};
    const hydratedPost = { ...basePost, ...ctaPatch };
    setPublishTextDraft({
      channel: activePreviewChannel,
      title: preview.title || "",
      body: preview.body || "",
      cta: String(hydratedPost.cta || ""),
      ctaMode: normalizeAgentCtaMode(hydratedPost.ctaMode),
      ctaUrl: String(hydratedPost.ctaUrl || ""),
      ctaPhone: String(hydratedPost.ctaPhone || ""),
      hashtags: preview.hashtags.join(" "),
    });
    setPublishEditChoiceOpen(false);
    setPublishEditOpen(true);
  }

  function validateAgentPublishMediaFile(file: File) {
    const isImage = AGENT_MEDIA_ALLOWED_IMAGE_TYPES.has(file.type);
    const isVideo = AGENT_MEDIA_ALLOWED_VIDEO_TYPES.has(file.type);
    if (!isImage && !isVideo) {
      throw new Error(
        "Format non autorisé. Utilise JPG, PNG, WebP, MP4, WebM ou MOV.",
      );
    }
    if (isImage && file.size > AGENT_MEDIA_MAX_IMAGE_BYTES) {
      throw new Error("Image trop lourde. Taille maximale : 40 Mo.");
    }
    if (isVideo && file.size > AGENT_MEDIA_MAX_VIDEO_BYTES) {
      throw new Error("Vidéo trop lourde. Taille maximale : 100 Mo.");
    }
    if (activePreviewChannel === "youtube" && !isVideo) {
      throw new Error(
        "YouTube nécessite une vidéo. Choisis une vidéo depuis la Médiathèque ou importe une vidéo.",
      );
    }
    return isVideo ? "video" : "image";
  }

  function readAgentImageFileInfo(
    file: File,
  ): Promise<{ width: number | null; height: number | null }> {
    return new Promise((resolve) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({
          width: img.naturalWidth || img.width || null,
          height: img.naturalHeight || img.height || null,
        });
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({ width: null, height: null });
      };
      img.src = objectUrl;
    });
  }

  function readAgentVideoFileInfo(
    file: File,
  ): Promise<{
    width: number | null;
    height: number | null;
    duration_seconds: number | null;
  }> {
    return new Promise((resolve) => {
      const objectUrl = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({
          width: video.videoWidth || null,
          height: video.videoHeight || null,
          duration_seconds:
            Number.isFinite(video.duration) && video.duration > 0
              ? Math.round(video.duration * 100) / 100
              : null,
        });
      };
      video.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({ width: null, height: null, duration_seconds: null });
      };
      video.src = objectUrl;
    });
  }

  async function readAgentMediaFileInfo(
    file: File,
    mediaKind: "image" | "video",
  ): Promise<{
    width: number | null;
    height: number | null;
    duration_seconds: number | null;
  }> {
    if (mediaKind === "video") return readAgentVideoFileInfo(file);
    const dimensions = await readAgentImageFileInfo(file);
    return { ...dimensions, duration_seconds: null };
  }

  async function readAgentApiJson(response: Response, fallbackMessage: string) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return await response.json().catch(() => ({ error: fallbackMessage }));
    }
    const text = await response.text().catch(() => "");
    return { error: text.trim() || fallbackMessage };
  }

  function mediaPatchFromLibraryItem(
    item: AgentMediaLibraryItem | MediaLibraryPickerItem,
  ) {
    return {
      id: item.id,
      bucket: item.bucket_name || "inrcy-pro-media",
      bucketName: item.bucket_name || "inrcy-pro-media",
      path: item.storage_path,
      storagePath: item.storage_path,
      publicUrl: item.signed_url || "",
      url: item.signed_url || "",
      name:
        item.title ||
        item.storage_path.split("/").pop() ||
        (item.media_type === "video" ? "Vidéo" : "Image"),
      title: item.title || "",
      type:
        item.mime_type ||
        (item.media_type === "video" ? "video/mp4" : "image/jpeg"),
      mimeType:
        item.mime_type ||
        (item.media_type === "video" ? "video/mp4" : "image/jpeg"),
      size: item.size_bytes || 0,
      width: item.width || null,
      height: item.height || null,
      duration: item.duration_seconds || null,
      duration_seconds: item.duration_seconds || null,
      kind: item.media_type,
      mediaType: item.media_type,
      source: "pro_media_library",
    };
  }

  async function loadPublishMediaLibrary() {
    setPublishMediaLibraryState("loading");
    try {
      const response = await fetch(
        "/api/media-library/items?type=all&active=active&limit=24",
        { cache: "no-store" },
      );
      const payload = await readAgentApiJson(
        response,
        "Médiathèque indisponible.",
      );
      if (!response.ok)
        throw new Error(payload?.error || "Médiathèque indisponible.");
      const items = Array.isArray(payload?.items) ? payload.items : [];
      setPublishMediaLibraryItems(
        items.filter(
          (item: AgentMediaLibraryItem) =>
            item?.storage_path && item?.media_type,
        ),
      );
      setPublishMediaLibraryState("idle");
    } catch (error) {
      setPublishMediaLibraryItems([]);
      setPublishMediaLibraryState("error");
    }
  }

  async function selectPublishMediaFromLibrary(
    item: AgentMediaLibraryItem | MediaLibraryPickerItem,
  ) {
    if (!item) return;
    if (activePreviewChannel === "youtube" && item.media_type !== "video") {
      showNotice("YouTube nécessite une vidéo.");
      return;
    }
    setPublishMediaUploadState("saving");
    try {
      await savePublishMediaPatch(mediaPatchFromLibraryItem(item));
      showNotice("Média iNrAgent mis à jour.");
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Modification du média impossible.",
      );
    } finally {
      setPublishMediaUploadState("idle");
    }
  }

  function openPublishMediaEditor() {
    if (
      !selectedPreparedAction ||
      !isPublishPreparedAction(selectedPreparedAction) ||
      !activePreviewChannel
    ) {
      showNotice("Prépare d’abord une publication.");
      return;
    }
    setPublishEditChoiceOpen(false);
    setPublishMediaPreviewOpen(true);
  }

  function updatePublishImageAdapterTransform(patch: Partial<ImageTransform>) {
    setPublishImageAdapterTransform((current) => ({
      ...(current || getDefaultTransform(publishBoosterChannel)),
      ...patch,
    }));
  }

  function closePublishImageAdapter() {
    setPublishImageAdapterOpen(false);
    setPublishImageAdapterFile(null);
    setPublishImageAdapterMeta(null);
    setPublishImageAdapterTransform(null);
    setPublishImageAdapterStageSize({ width: 0, height: 0 });
    setPublishImageAdapterDragging(false);
    publishImageAdapterDragRef.current = null;
    if (publishImageAdapterPreviewUrl) {
      URL.revokeObjectURL(publishImageAdapterPreviewUrl);
      setPublishImageAdapterPreviewUrl("");
    }
  }

  async function openPublishImageAdapterTool() {
    if (!publishMediaPreview?.url) {
      showNotice("Ajoute d’abord une image à adapter.");
      return;
    }
    try {
      setPublishImageAdapterSaving(true);
      const fileName =
        publishMediaPreview.name?.replace(/\.[^.]+$/, "") || "image-inragent";
      const sourceFile = await urlToFile(
        publishMediaPreview.url,
        `${fileName}.jpg`,
        "image/jpeg",
      );
      const meta = await readImageMeta(sourceFile);
      const transform = getOptimizedTransform(publishBoosterChannel, meta);
      const previewUrl = URL.createObjectURL(sourceFile);
      if (publishImageAdapterPreviewUrl) {
        URL.revokeObjectURL(publishImageAdapterPreviewUrl);
      }
      setPublishImageAdapterFile(sourceFile);
      setPublishImageAdapterMeta(meta);
      setPublishImageAdapterTransform(transform);
      setPublishImageAdapterPreviewUrl(previewUrl);
      setPublishImageAdapterOpen(true);
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Adaptation de l’image impossible.",
      );
    } finally {
      setPublishImageAdapterSaving(false);
    }
  }

  function getCurrentVideoSettings() {
    const rawSettings = getMediaVideoSettingsRecord(
      currentPublishMediaRecord,
      publishBoosterChannel,
    );
    return {
      format: normalizeVideoFormat(
        publishBoosterChannel,
        rawSettings?.format || currentPublishMediaRecord?.videoFormat,
      ),
      adaptationMode: normalizeVideoAdaptationMode(
        rawSettings?.adaptationMode ||
          currentPublishMediaRecord?.videoAdaptationMode,
      ),
    };
  }

  function openPublishVideoAdapterTool() {
    if (!publishMediaPreview?.url) {
      showNotice("Ajoute d’abord une vidéo à adapter.");
      return;
    }
    const settings = getCurrentVideoSettings();
    setPublishVideoFormat(settings.format);
    setPublishVideoAdaptationMode(settings.adaptationMode);
    setPublishVideoPreparationState(null);
    setPublishVideoAdapterOpen(true);
  }

  function openPublishMediaAdapterPreview() {
    if (!publishMediaPreview?.url) {
      showNotice("Ajoute d’abord une image ou une vidéo à adapter.");
      return;
    }
    if (publishMediaPreview.kind === "video") {
      openPublishVideoAdapterTool();
      return;
    }
    if (publishMediaPreview.kind === "image") {
      void openPublishImageAdapterTool();
      return;
    }
    showNotice("Ce média ne peut pas être adapté avec les outils Booster.");
  }

  function handlePublishImageAdapterWheel(
    event: ReactWheelEvent<HTMLDivElement>,
  ) {
    if (event.cancelable) event.preventDefault();
    const meta = publishImageAdapterMeta;
    const node = publishImageAdapterStageRef.current;
    if (!meta?.width || !meta?.height || !node) return;
    const rect = node.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const maxZoom = publishImageAdapterTransformSafe.fit === "cover" ? 3 : 1;
    const currentZoom = getEffectiveTransformZoom(
      publishImageAdapterTransformSafe,
    );
    const nextZoom = clampNumber(
      currentZoom + (event.deltaY < 0 ? 0.08 : -0.08),
      0.4,
      maxZoom,
    );
    const nextLayout = computePreviewLayout({
      containerWidth: rect.width,
      containerHeight: rect.height,
      imageWidth: meta.width,
      imageHeight: meta.height,
      transform: { ...publishImageAdapterTransformSafe, zoom: nextZoom },
    });
    const currentDrawW =
      publishImageAdapterPreviewLayout.drawW || nextLayout.drawW;
    const currentDrawH =
      publishImageAdapterPreviewLayout.drawH || nextLayout.drawH;
    const ux = currentDrawW
      ? (pointerX - publishImageAdapterPreviewLayout.dx) / currentDrawW
      : 0.5;
    const uy = currentDrawH
      ? (pointerY - publishImageAdapterPreviewLayout.dy) / currentDrawH
      : 0.5;
    const nextDx = pointerX - ux * nextLayout.drawW;
    const nextDy = pointerY - uy * nextLayout.drawH;
    updatePublishImageAdapterTransform({
      zoom: nextZoom,
      ...offsetFromDrawPosition({
        containerWidth: rect.width,
        containerHeight: rect.height,
        drawW: nextLayout.drawW,
        drawH: nextLayout.drawH,
        dx: nextDx,
        dy: nextDy,
      }),
    });
  }

  function handlePublishImageAdapterPointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    publishImageAdapterDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: publishImageAdapterTransformSafe.offsetX || 0,
      startOffsetY: publishImageAdapterTransformSafe.offsetY || 0,
    };
    setPublishImageAdapterDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePublishImageAdapterPointerMove(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    const drag = publishImageAdapterDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const nextOffsetX = publishImageAdapterPreviewLayout.maxX
      ? clampNumber(
          drag.startOffsetX -
            ((event.clientX - drag.startX) /
              publishImageAdapterPreviewLayout.maxX) *
              100,
          -100,
          100,
        )
      : 0;
    const nextOffsetY = publishImageAdapterPreviewLayout.maxY
      ? clampNumber(
          drag.startOffsetY -
            ((event.clientY - drag.startY) /
              publishImageAdapterPreviewLayout.maxY) *
              100,
          -100,
          100,
        )
      : 0;
    updatePublishImageAdapterTransform({
      offsetX: nextOffsetX,
      offsetY: nextOffsetY,
    });
  }

  function endPublishImageAdapterDrag(
    event?: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (
      event &&
      publishImageAdapterDragRef.current?.pointerId === event.pointerId
    ) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    publishImageAdapterDragRef.current = null;
    setPublishImageAdapterDragging(false);
  }

  async function savePublishImageAdapter() {
    if (!publishImageAdapterFile || !publishImageAdapterTransform) return;
    setPublishImageAdapterSaving(true);
    try {
      const rendered = await renderChannelImage({
        file: publishImageAdapterFile,
        transform: publishImageAdapterTransform,
        preset: publishImageAdapterPreset,
        channel: publishBoosterChannel,
      });
      const safeName =
        rendered.name ||
        `${publishMediaPreview?.name?.replace(/\.[^.]+$/, "") || "image-inragent"}-adaptee.jpg`;
      if (!rendered.dataUrl) {
        throw new Error("Image adaptée introuvable.");
      }
      const renderedFile = dataUrlToFile(rendered.dataUrl, safeName);
      await uploadPublishMedia(renderedFile);
      closePublishImageAdapter();
      showNotice("Image adaptée et enregistrée pour iNrAgent.");
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Enregistrement de l’image adaptée impossible.",
      );
    } finally {
      setPublishImageAdapterSaving(false);
    }
  }

  async function savePublishVideoAdapter() {
    if (!publishMediaPreview?.url || !currentPublishMediaRecord) return;
    setPublishVideoAdapterSaving(true);
    setPublishVideoPreparationState({
      status: "preparing",
      label: "Préparation vidéo en cours...",
    });
    try {
      const nextSettings = {
        format: publishVideoFormat,
        adaptationMode: publishVideoAdaptationMode,
      };
      const existingVariants = Array.isArray(
        currentPublishMediaRecord.transformedVariants,
      )
        ? (currentPublishMediaRecord.transformedVariants as BoosterVideoTransformedVariant[])
        : [];
      const response = await requestBoosterVideoTransforms({
        source: {
          storagePath: String(
            currentPublishMediaRecord.storagePath ||
              currentPublishMediaRecord.storage_path ||
              currentPublishMediaRecord.path ||
              "",
          ),
          publicUrl: publishMediaPreview.url,
          url: publishMediaPreview.url,
          name: publishMediaPreview.name,
          type: String(
            currentPublishMediaRecord.mimeType ||
              currentPublishMediaRecord.mime_type ||
              currentPublishMediaRecord.type ||
              "video/mp4",
          ),
          size: Number(currentPublishMediaRecord.size || 0) || null,
          duration:
            Number(
              currentPublishMediaRecord.duration ||
                currentPublishMediaRecord.duration_seconds ||
                0,
            ) || null,
        },
        variants: [
          {
            channel: publishBoosterChannel,
            format: publishVideoFormat,
            adaptationMode: publishVideoAdaptationMode,
          },
        ],
      });

      const generatedVariants = Array.isArray(response.variants)
        ? response.variants
        : [];
      const transformedVariants = [
        ...existingVariants.filter(
          (variant) =>
            !generatedVariants.some(
              (generated) => generated.signature === variant.signature,
            ),
        ),
        ...generatedVariants,
      ];
      const videoSettingsByChannel = {
        ...(asRecord(currentPublishMediaRecord.videoSettingsByChannel) || {}),
        [publishBoosterChannel]: nextSettings,
      };

      await savePublishMediaPatch({
        ...currentPublishMediaRecord,
        videoSettings: nextSettings,
        videoSettingsByChannel,
        videoFormat: publishVideoFormat,
        videoAdaptationMode: publishVideoAdaptationMode,
        transformedVariants,
      });

      setPublishVideoPreparationState({
        status: generatedVariants.length ? "ready" : "ready",
        label: generatedVariants.length
          ? "Format vidéo appliqué"
          : "Vidéo originale conservée",
        detail: `${getVideoFormatLabel(
          publishBoosterChannel,
          publishVideoFormat,
        )} · ${publishVideoAdaptationMode === "cover_crop" ? "Recadrer plein écran" : "Cadre sobre sécurisé"}`,
      });
      if (response.errors?.length && !generatedVariants.length) {
        showNotice(
          response.errors[0]?.message ||
            "Adaptation automatique indisponible : la vidéo originale sera conservée.",
        );
      } else {
        showNotice("Réglage vidéo enregistré pour iNrAgent.");
      }
    } catch (error) {
      setPublishVideoPreparationState({
        status: "error",
        label: "Adaptation vidéo impossible",
        detail:
          error instanceof Error
            ? error.message
            : "Réessaie ou conserve la vidéo originale.",
      });
      showNotice(
        error instanceof Error ? error.message : "Adaptation vidéo impossible.",
      );
    } finally {
      setPublishVideoAdapterSaving(false);
    }
  }

  async function savePublishMediaPatch(media: Record<string, unknown> | null) {
    if (!selectedPreparedAction || !activePreviewChannel) return;

    const response = await fetch("/api/agent/actions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actionId: selectedPreparedAction.id,
        editType: "publish_channel_media",
        channel: activePreviewChannel,
        media,
        removeMedia: media === null,
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      action?: AgentPreparedAction;
      error?: string;
    } | null;

    if (!response.ok || !payload?.action) {
      throw new Error(payload?.error || "Modification du média impossible.");
    }

    const updatedAction = payload.action;
    setActions((current) =>
      current.map((action) =>
        action.id === updatedAction.id ? updatedAction : action,
      ),
    );
  }

  async function uploadPublishMedia(file: File | null | undefined) {
    if (
      !file ||
      !selectedPreparedAction ||
      !activePreviewChannel ||
      publishMediaUploadState === "saving"
    )
      return;

    let mediaKind: "image" | "video";
    try {
      mediaKind = validateAgentPublishMediaFile(file);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Média invalide.");
      return;
    }

    setPublishMediaUploadState("saving");
    setNotice(null);

    try {
      const clientId = `agent-${Date.now()}-${file.name}-${file.size}`;
      const prepareResponse = await fetch("/api/media-library/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "prepare",
          files: [
            {
              client_id: clientId,
              name: file.name,
              type: file.type,
              size: file.size,
              last_modified: file.lastModified,
            },
          ],
        }),
      });
      const preparePayload = await readAgentApiJson(
        prepareResponse,
        "Préparation du média impossible.",
      );
      if (!prepareResponse.ok)
        throw new Error(
          preparePayload?.error || "Préparation du média impossible.",
        );
      const prepared = Array.isArray(preparePayload?.items)
        ? preparePayload.items[0]
        : null;
      if (!prepared?.token || !prepared?.storage_path)
        throw new Error("Préparation du média impossible.");

      const mediaInfo = await readAgentMediaFileInfo(file, mediaKind);

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(prepared.bucket || "inrcy-pro-media")
        .uploadToSignedUrl(prepared.storage_path, prepared.token, file, {
          contentType:
            prepared.content_type || file.type || "application/octet-stream",
        });
      if (uploadError) throw uploadError;

      const finalizeResponse = await fetch("/api/media-library/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "finalize",
          source: "inr_agent",
          uploads: [
            {
              client_id: clientId,
              original_name: prepared.original_name || file.name,
              storage_path: prepared.storage_path,
              mime_type:
                prepared.content_type ||
                file.type ||
                "application/octet-stream",
              size_bytes: file.size,
              width: mediaInfo.width,
              height: mediaInfo.height,
              duration_seconds: mediaInfo.duration_seconds,
            },
          ],
        }),
      });
      const finalizePayload = await readAgentApiJson(
        finalizeResponse,
        "Finalisation du média impossible.",
      );
      if (!finalizeResponse.ok || !finalizePayload?.ok) {
        throw new Error(
          finalizePayload?.error || "Finalisation du média impossible.",
        );
      }
      const result = Array.isArray(finalizePayload?.results)
        ? finalizePayload.results.find((item: any) => item?.ok)
        : null;
      if (!result?.storage_path) throw new Error("Média finalisé introuvable.");

      await savePublishMediaPatch({
        id: result.id || null,
        bucket: result.bucket_name || prepared.bucket || "inrcy-pro-media",
        bucketName: result.bucket_name || prepared.bucket || "inrcy-pro-media",
        path: result.storage_path,
        storagePath: result.storage_path,
        publicUrl: result.signed_url || "",
        url: result.signed_url || "",
        name:
          result.title ||
          prepared.original_name ||
          file.name ||
          (mediaKind === "video" ? "Vidéo" : "Image"),
        title: result.title || prepared.original_name || file.name || "",
        type:
          result.mime_type ||
          prepared.content_type ||
          file.type ||
          "application/octet-stream",
        mimeType:
          result.mime_type ||
          prepared.content_type ||
          file.type ||
          "application/octet-stream",
        size: result.size_bytes || file.size || 0,
        width: result.width || mediaInfo.width || null,
        height: result.height || mediaInfo.height || null,
        duration: result.duration_seconds || mediaInfo.duration_seconds || null,
        duration_seconds:
          result.duration_seconds || mediaInfo.duration_seconds || null,
        kind: result.media_type || mediaKind,
        mediaType: result.media_type || mediaKind,
        source: "pro_media_library",
      });
      await loadPublishMediaLibrary();
      showNotice(
        mediaKind === "video"
          ? "Vidéo iNrAgent mise à jour."
          : "Image iNrAgent mise à jour.",
      );
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Modification du média impossible.",
      );
    } finally {
      setPublishMediaUploadState("idle");
    }
  }

  const selectPublishMediaFromPicker = async (
    items: MediaLibraryPickerItem[],
  ) => {
    const item = items[0];
    if (!item) return;
    await selectPublishMediaFromLibrary(item);
  };

  async function removePublishMedia() {
    if (!selectedPreparedAction || publishMediaUploadState === "saving") return;
    setPublishMediaUploadState("saving");
    setNotice(null);

    try {
      await savePublishMediaPatch(null);
      showNotice("Média retiré de la publication.");
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Suppression du média impossible.",
      );
    } finally {
      setPublishMediaUploadState("idle");
    }
  }

  function syncCampaignBodyFromEditor(editor: HTMLDivElement) {
    const nextBody = editableHtmlToSiteText(
      readSanitizedElementHtml(editor),
    ).slice(0, 6000);
    setCampaignTextDraft((current) => ({ ...current, body: nextBody }));
  }

  function syncPublishBodyFromEditor(editor: HTMLDivElement) {
    const nextBody = editableHtmlToSiteText(
      readSanitizedElementHtml(editor),
    ).slice(0, 6000);
    setPublishTextDraft((current) => ({ ...current, body: nextBody }));
  }

  function selectionTargetsEditor(editor: HTMLDivElement) {
    if (typeof window === "undefined") return false;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return false;
    const anchor = selection.anchorNode;
    const focus = selection.focusNode;
    return Boolean(
      anchor && focus && editor.contains(anchor) && editor.contains(focus),
    );
  }

  function applyRichEditorFormat(
    editor: HTMLDivElement | null,
    kind: "bold" | "italic" | "underline",
    sync: (editor: HTMLDivElement) => void,
  ) {
    if (!editor || typeof document === "undefined") return;
    try {
      editor.focus({ preventScroll: true });
    } catch {
      editor.focus();
    }

    const command =
      kind === "bold" ? "bold" : kind === "italic" ? "italic" : "underline";
    const selection =
      typeof window !== "undefined" ? window.getSelection() : null;
    const hasSelection = Boolean(
      selection &&
      selection.rangeCount > 0 &&
      !selection.isCollapsed &&
      selectionTargetsEditor(editor),
    );

    if (hasSelection) {
      document.execCommand(command, false);
    } else {
      const placeholderHtml =
        kind === "bold"
          ? "<strong>texte</strong>"
          : kind === "italic"
            ? "<em>texte</em>"
            : "<u>texte</u>";
      document.execCommand("insertHTML", false, placeholderHtml);
    }

    sync(editor);
  }

  function applyCampaignTextFormat(kind: "bold" | "italic" | "underline") {
    applyRichEditorFormat(
      campaignBodyEditorRef.current,
      kind,
      syncCampaignBodyFromEditor,
    );
  }

  function applyPublishTextFormat(kind: "bold" | "italic" | "underline") {
    applyRichEditorFormat(
      publishBodyEditorRef.current,
      kind,
      syncPublishBodyFromEditor,
    );
  }

  function updatePublishCtaDraft(patch: Partial<typeof publishTextDraft>) {
    setPublishTextDraft((current) => ({ ...current, ...patch }));
  }

  function applyPublishPreferredCta(choice: BoosterPreferredCta) {
    const displayKey = boosterDisplayKeyFromAgentChannel(
      publishTextDraft.channel,
    );
    const currentPost: BoosterChannelPost = {
      title: publishTextDraft.title,
      content: publishTextDraft.body,
      cta: publishTextDraft.cta,
      ctaMode: publishTextDraft.ctaMode,
      ctaUrl: publishTextDraft.ctaUrl,
      ctaPhone: publishTextDraft.ctaPhone,
      hashtags: publishTextDraft.hashtags.split(/[\s,;]+/).filter(Boolean),
    };
    const patch = buildPreferredCtaPatch(
      displayKey,
      choice,
      currentPost,
      publishCtaDefaults,
      publishCtaDefaults?.aiLanguage,
    );
    setPublishTextDraft((current) => ({
      ...current,
      cta: String(patch.cta ?? current.cta ?? ""),
      ctaMode: normalizeAgentCtaMode(patch.ctaMode ?? current.ctaMode),
      ctaUrl: String(patch.ctaUrl ?? current.ctaUrl ?? ""),
      ctaPhone: String(patch.ctaPhone ?? current.ctaPhone ?? ""),
    }));
  }

  async function savePublishText() {
    if (!selectedPreparedAction || publishSaveState === "saving") return;
    const channel = publishTextDraft.channel;
    const body = publishTextDraft.body.trim();
    if (!channel || !body) {
      showNotice("Le contenu de la publication est obligatoire.");
      return;
    }

    setPublishSaveState("saving");
    setNotice(null);

    try {
      const response = await fetch("/api/agent/actions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionId: selectedPreparedAction.id,
          editType: "publish_channel_text",
          channel,
          title: publishTextDraft.title.trim(),
          content: body,
          cta: publishTextDraft.cta.trim(),
          ctaMode: publishTextDraft.ctaMode,
          ctaUrl: publishTextDraft.ctaUrl.trim(),
          ctaPhone: publishTextDraft.ctaPhone.trim(),
          hashtags: publishTextDraft.hashtags,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        action?: AgentPreparedAction;
        error?: string;
      } | null;

      if (!response.ok || !payload?.action) {
        throw new Error(
          payload?.error || "Modification de la publication impossible.",
        );
      }

      const updatedAction = payload.action;
      setActions((current) =>
        current.map((action) =>
          action.id === updatedAction.id ? updatedAction : action,
        ),
      );
      setPublishEditOpen(false);
      showNotice("Publication mise à jour.");
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Modification de la publication impossible.",
      );
    } finally {
      setPublishSaveState("idle");
    }
  }

  async function patchCampaignAction(
    body: Record<string, unknown>,
    fallbackError: string,
  ) {
    if (!selectedPreparedAction)
      throw new Error("Action iNr’Agent introuvable.");
    const response = await fetch("/api/agent/actions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actionId: selectedPreparedAction.id,
        ...body,
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      action?: AgentPreparedAction;
      error?: string;
      detail?: string;
    } | null;

    if (!response.ok || !payload?.action) {
      throw new Error(payload?.error || payload?.detail || fallbackError);
    }

    const updatedAction = payload.action;
    setActions((current) =>
      current.map((action) =>
        action.id === updatedAction.id ? updatedAction : action,
      ),
    );
    return updatedAction;
  }

  async function loadCrmContactsForAgent() {
    setCrmContactsLoading(true);
    try {
      const response = await fetch("/api/crm/contacts?all=1&pageSize=500", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as {
        contacts?: CrmContactForAgent[];
        error?: string;
      } | null;
      if (!response.ok)
        throw new Error(payload?.error || "Contacts CRM indisponibles.");
      setCrmContacts(Array.isArray(payload?.contacts) ? payload.contacts : []);
    } catch (error) {
      showNotice(
        error instanceof Error ? error.message : "Contacts CRM indisponibles.",
      );
    } finally {
      setCrmContactsLoading(false);
    }
  }

  async function openRecipientsEditor() {
    const currentRecipients = recipientsForAction(selectedPreparedAction);
    setSelectedRecipientEmails(
      currentRecipients.map((recipient) => recipient.email.toLowerCase()),
    );
    setRecipientsPreviewOpen(false);
    setCampaignEditOpen(false);
    setRecipientsEditOpen(true);
    setCrmRecipientSearch("");
    setManualRecipientsInput("");
    setCrmRecipientFiltersOpen(false);
    await loadCrmContactsForAgent();
  }

  function toggleRecipientSelection(emailValue: string) {
    const email = emailValue.trim().toLowerCase();
    if (!email) return;
    setSelectedRecipientEmails((current) =>
      current.includes(email)
        ? current.filter((item) => item !== email)
        : [...current, email],
    );
  }

  function addManualRecipientsFromInput() {
    const emails = parseRecipientEmails(manualRecipientsInput);
    if (!emails.length) {
      showNotice("Ajoute au moins une adresse mail valide.");
      return;
    }
    setSelectedRecipientEmails((current) => {
      const next = new Set(current.map((email) => email.toLowerCase()));
      for (const email of emails) next.add(email);
      return Array.from(next);
    });
    setManualRecipientsInput("");
    showNotice(
      `${emails.length} destinataire${emails.length > 1 ? "s" : ""} ajouté${emails.length > 1 ? "s" : ""}.`,
    );
  }

  function selectAllFilteredCrmRecipients() {
    const emails = filteredCrmContacts
      .map((contact) =>
        contactToCampaignRecipient(contact)?.email.toLowerCase(),
      )
      .filter((email): email is string => Boolean(email));
    setSelectedRecipientEmails((current) => {
      const next = new Set(current.map((email) => email.toLowerCase()));
      for (const email of emails) next.add(email);
      return Array.from(next);
    });
  }

  function clearFilteredCrmRecipients() {
    const emailsToRemove = new Set(
      filteredCrmContacts
        .map((contact) =>
          contactToCampaignRecipient(contact)?.email.toLowerCase(),
        )
        .filter((email): email is string => Boolean(email)),
    );
    setSelectedRecipientEmails((current) =>
      current.filter((email) => !emailsToRemove.has(email.toLowerCase())),
    );
  }

  function toggleFilteredCrmRecipients() {
    if (filteredCrmAllSelected) {
      clearFilteredCrmRecipients();
      return;
    }
    selectAllFilteredCrmRecipients();
  }

  function removeSelectedRecipient(emailValue: string) {
    const email = emailValue.trim().toLowerCase();
    setSelectedRecipientEmails((current) =>
      current.filter((item) => item.toLowerCase() !== email),
    );
  }

  async function saveCampaignRecipients() {
    if (!selectedPreparedAction || campaignSaveState === "saving") return;
    const previousByEmail = new Map(
      campaignRecipients.map((recipient) => [
        recipient.email.toLowerCase(),
        recipient,
      ]),
    );
    const pendingManualEmails = parseRecipientEmails(manualRecipientsInput);
    const emails = Array.from(
      new Set([
        ...selectedRecipientEmails.map((email) => email.toLowerCase()),
        ...pendingManualEmails,
      ]),
    );
    const recipients = emails
      .map(
        (email) =>
          crmRecipientsByEmail.get(email) ||
          previousByEmail.get(email) ||
          manualRecipientFromEmail(email),
      )
      .filter((recipient): recipient is CampaignRecipientPreview =>
        Boolean(recipient),
      );

    if (!recipients.length) {
      showNotice("Sélectionne au moins un destinataire.");
      return;
    }

    setCampaignSaveState("saving");
    try {
      await patchCampaignAction(
        { editType: "campaign_recipients", recipients },
        "Modification des destinataires impossible.",
      );
      setRecipientsEditOpen(false);
      setManualRecipientsInput("");
      showNotice("Destinataires de la campagne mis à jour.");
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Modification des destinataires impossible.",
      );
    } finally {
      setCampaignSaveState("idle");
    }
  }

  async function addNewRecipientToCrm() {
    if (newRecipientState === "saving") return;
    const email = newRecipientDraft.email.trim().toLowerCase();
    const name = newRecipientDraft.name.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(email)) {
      showNotice("Renseigne un email valide.");
      return;
    }

    setNewRecipientState("saving");
    try {
      const response = await fetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: name || email,
          email,
          phone: newRecipientDraft.phone.trim(),
          category: "professionnel",
          contact_type: selectedKey === "loyalty" ? "client" : "prospect",
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        id?: string;
        error?: string;
      } | null;
      if (!response.ok)
        throw new Error(payload?.error || "Ajout du contact impossible.");
      await loadCrmContactsForAgent();
      setSelectedRecipientEmails((current) =>
        current.includes(email) ? current : [...current, email],
      );
      setNewRecipientDraft({ name: "", email: "", phone: "" });
      setNewRecipientOpen(false);
      showNotice("Contact ajouté au CRM et sélectionné.");
    } catch (error) {
      showNotice(
        error instanceof Error ? error.message : "Ajout du contact impossible.",
      );
    } finally {
      setNewRecipientState("idle");
    }
  }

  async function loadMailAccountsForAgent() {
    setMailAccountsLoading(true);
    try {
      const response = await fetch("/api/integrations/status", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as {
        mailAccounts?: AgentMailAccount[];
        accounts?: AgentMailAccount[];
        error?: string;
      } | null;
      if (!response.ok)
        throw new Error(payload?.error || "Boîtes mail indisponibles.");
      const accounts = Array.isArray(payload?.mailAccounts)
        ? payload.mailAccounts
        : Array.isArray(payload?.accounts)
          ? payload.accounts.filter(
              (account) => (account as any)?.category === "mail",
            )
          : [];
      setMailAccounts(accounts);
    } catch (error) {
      showNotice(
        error instanceof Error ? error.message : "Boîtes mail indisponibles.",
      );
    } finally {
      setMailAccountsLoading(false);
    }
  }

  async function openMailAccountEditor() {
    const current = asRecord(selectedPreparedAction?.payload?.mailAccount);
    setSelectedMailAccountId(
      firstSafeString(selectedPreparedAction?.payload?.accountId, current?.id),
    );
    setCampaignEditOpen(false);
    setMailAccountEditOpen(true);
    await loadMailAccountsForAgent();
  }

  async function saveCampaignMailAccount() {
    if (!selectedPreparedAction || campaignSaveState === "saving") return;
    if (!selectedMailAccountId) {
      showNotice("Sélectionne une boîte d’envoi.");
      return;
    }

    setCampaignSaveState("saving");
    try {
      await patchCampaignAction(
        { editType: "campaign_mail_account", accountId: selectedMailAccountId },
        "Modification de la boîte d’envoi impossible.",
      );
      setMailAccountEditOpen(false);
      showNotice("Boîte d’envoi mise à jour.");
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Modification de la boîte d’envoi impossible.",
      );
    } finally {
      setCampaignSaveState("idle");
    }
  }

  async function saveCampaignAttachments(attachments: CampaignAttachmentRef[]) {
    await patchCampaignAction(
      { editType: "campaign_attachments", attachments },
      "Modification de la pièce jointe impossible.",
    );
  }

  async function uploadCampaignAttachment(filesInput: FileList | null) {
    if (!selectedPreparedAction || attachmentUploadState === "saving") return;
    const files = Array.from(filesInput || []);
    if (!files.length) return;

    setAttachmentUploadState("saving");
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id || null;
      const uploaded: CampaignAttachmentRef[] = [];

      for (const file of files.slice(0, 10)) {
        const path = makeAttachmentPath(file.name || "piece-jointe", userId);
        const { error } = await supabase.storage
          .from("inrbox_attachments")
          .upload(path, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type || "application/octet-stream",
          });
        if (error) throw error;
        uploaded.push({
          bucket: "inrbox_attachments",
          path,
          name: file.name || "piece-jointe",
          type: file.type || "application/octet-stream",
          size: file.size || 0,
        });
      }

      const current = normalizeCampaignAttachmentRefs(
        selectedPreparedAction.payload?.attachments,
      );
      await saveCampaignAttachments([...current, ...uploaded].slice(0, 10));
      showNotice(
        uploaded.length > 1
          ? "Pièces jointes ajoutées."
          : "Pièce jointe ajoutée.",
      );
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Pièce jointe impossible à ajouter.",
      );
    } finally {
      setAttachmentUploadState("idle");
    }
  }

  async function addCampaignAttachmentsFromMediaLibrary(
    items: MediaLibraryPickerItem[],
  ) {
    if (!selectedPreparedAction || attachmentUploadState === "saving") return;
    const picked = items.slice(0, 10).map((item) => ({
      bucket: item.bucket_name || "inrcy-pro-media",
      path: item.storage_path,
      name:
        item.title ||
        item.storage_path.split("/").pop() ||
        (item.media_type === "video" ? "Vidéo iNrCy" : "Image iNrCy"),
      type:
        item.mime_type ||
        (item.media_type === "video" ? "video/mp4" : "image/jpeg"),
      size: item.size_bytes || 0,
    })) as CampaignAttachmentRef[];
    if (!picked.length) return;

    setAttachmentUploadState("saving");
    try {
      const current = normalizeCampaignAttachmentRefs(
        selectedPreparedAction.payload?.attachments,
      );
      await saveCampaignAttachments([...current, ...picked].slice(0, 10));
      showNotice(
        picked.length > 1
          ? "Pièces jointes ajoutées depuis la Médiathèque."
          : "Pièce jointe ajoutée depuis la Médiathèque.",
      );
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Pièce jointe impossible à ajouter.",
      );
    } finally {
      setAttachmentUploadState("idle");
    }
  }

  async function removeCampaignAttachment(path: string) {
    if (!selectedPreparedAction || attachmentUploadState === "saving") return;
    setAttachmentUploadState("saving");
    try {
      const current = normalizeCampaignAttachmentRefs(
        selectedPreparedAction.payload?.attachments,
      );
      await saveCampaignAttachments(
        current.filter((attachment) => attachment.path !== path),
      );
      showNotice("Pièce jointe retirée.");
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Suppression de la pièce jointe impossible.",
      );
    } finally {
      setAttachmentUploadState("idle");
    }
  }

  async function saveCampaignAsDraft() {
    if (!selectedPreparedAction || campaignDraftSaveState === "saving") return;

    setCampaignDraftSaveState("saving");
    setNotice(null);

    try {
      const response = await fetch("/api/agent/actions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionId: selectedPreparedAction.id,
          editType: "save_campaign_draft",
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        action?: AgentPreparedAction;
        draftId?: string | null;
        error?: string;
      } | null;

      if (!response.ok || !payload?.action) {
        throw new Error(
          payload?.error || "Enregistrement du brouillon impossible.",
        );
      }

      const updatedAction = payload.action;
      setActions((current) =>
        current.map((action) =>
          action.id === updatedAction.id ? updatedAction : action,
        ),
      );
      setCampaignDraftConfirmOpen(false);
      showNotice("Campagne enregistrée en brouillon dans iNrSend.");
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Enregistrement du brouillon impossible.",
      );
    } finally {
      setCampaignDraftSaveState("idle");
    }
  }


  async function savePublishAsDraft() {
    if (!selectedPreparedAction || campaignDraftSaveState === "saving") return;

    setCampaignDraftSaveState("saving");
    setNotice(null);

    try {
      const response = await fetch("/api/agent/actions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionId: selectedPreparedAction.id,
          editType: "save_publish_draft",
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        action?: AgentPreparedAction;
        draftId?: string | null;
        error?: string;
      } | null;

      if (!response.ok || !payload?.action) {
        throw new Error(
          payload?.error || "Enregistrement du brouillon impossible.",
        );
      }

      const updatedAction = payload.action;
      setActions((current) =>
        current.map((action) =>
          action.id === updatedAction.id ? updatedAction : action,
        ),
      );
      setCampaignDraftConfirmOpen(false);
      showNotice("Publication enregistrée en brouillon dans iNrSend.");
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Enregistrement du brouillon impossible.",
      );
    } finally {
      setCampaignDraftSaveState("idle");
    }
  }

  function updateConfig(key: AutomationKey, patch: Partial<AutomationConfig>) {
    setConfigs((current) => ({
      ...current,
      [key]: { ...current[key], ...patch },
    }));
    setSaveState("idle");
    setNotice(null);
  }

  function updateConfigFrequency(key: AutomationKey, frequency: string) {
    setConfigs((current) => {
      const currentConfig = current[key];
      const normalizedSlots = normalizeConfigScheduleSlots(currentConfig);
      return {
        ...current,
        [key]: {
          ...currentConfig,
          frequency,
          scheduleSlots: normalizedSlots,
          day: normalizedSlots[0].day,
          time: normalizedSlots[0].time,
        },
      };
    });
    setSaveState("idle");
    setNotice(null);
  }

  function updateConfigScheduleSlot(
    key: AutomationKey,
    index: number,
    patch: Partial<{ day: string; time: string }>,
  ) {
    setConfigs((current) => {
      const currentConfig = current[key];
      const slots = normalizeConfigScheduleSlots(currentConfig);
      slots[index] = { ...slots[index], ...patch };
      return {
        ...current,
        [key]: {
          ...currentConfig,
          scheduleSlots: slots,
          ...(index === 0 ? { day: slots[0].day, time: slots[0].time } : {}),
        },
      };
    });
    setSaveState("idle");
    setNotice(null);
  }

  async function persistSettings(
    options: { closeModal?: boolean; showSuccess?: boolean } = {},
  ) {
    const { closeModal = true, showSuccess = true } = options;
    const safeConfigs = agentConnectedChannels
      ? normalizeConfigsForConnectedChannels(configs, agentConnectedChannels)
      : configs;
    const nextSettings = configsToSettings(agentSettings, safeConfigs);
    setConfigs(safeConfigs);
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
      if (closeModal) setSettingsKey(null);
      if (showSuccess) showNotice("Réglages iNr’Agent enregistrés.");
      return true;
    } catch (error) {
      setSaveState("error");
      showNotice(
        error instanceof Error ? error.message : "Enregistrement impossible.",
      );
      return false;
    }
  }

  async function saveSettings() {
    await persistSettings();
  }

  async function runAutomationNow(key: AutomationKey) {
    if (testNowKey || prepareActionState === "saving" || saveState === "saving")
      return;

    const progressKey = key === "stats" ? null : key;
    let progressTimer: number | null = null;

    setTestNowKey(key);

    if (progressKey) {
      setPrepareProgress({
        key: progressKey,
        label: prepareProgressLabel(progressKey, 6),
        percent: 6,
      });
      progressTimer = window.setInterval(() => {
        setPrepareProgress((current) => {
          if (!current || current.key !== progressKey || current.percent >= 97)
            return current;
          const increment =
            current.percent < 22
              ? 7
              : current.percent < 52
                ? 5
                : current.percent < 78
                  ? 3
                  : 1;
          const nextPercent = Math.min(97, current.percent + increment);
          return {
            key: progressKey,
            label: prepareProgressLabel(progressKey, nextPercent),
            percent: nextPercent,
          };
        });
      }, 520);
    }

    let completed = false;

    try {
      const saved = await persistSettings({
        closeModal: false,
        showSuccess: false,
      });
      if (!saved) return;

      if (key === "publish") {
        completed = await preparePublishAction();
      } else if (key === "grow" || key === "loyalty") {
        completed = await prepareCampaignAction(key);
      } else {
        await sendStatsReport();
        completed = true;
      }

      if (completed) setSettingsKey(null);
    } finally {
      if (progressTimer) window.clearInterval(progressTimer);
      if (progressKey) {
        setPrepareProgress((current) =>
          current?.key === progressKey
            ? {
                key: progressKey,
                label: completed ? "Finalisation" : "Préparation arrêtée",
                percent: 100,
              }
            : current,
        );
        await wait(completed ? 520 : 850);
        setPrepareProgress((current) =>
          current?.key === progressKey ? null : current,
        );
      }
      setTestNowKey(null);
    }
  }

  function testAutomationNow(key: AutomationKey) {
    if (testNowKey || prepareActionState === "saving" || saveState === "saving")
      return;

    const automation = automations.find((item) => item.key === key) ?? null;
    if (
      automation &&
      key !== "stats" &&
      connectedChannelsLoadState === "ready" &&
      connectedChannelsForAutomation(automation, agentConnectedChannels).length === 0
    ) {
      showNotice(connectedChannelMessage(automation));
      return;
    }

    if (
      (key === "grow" || key === "loyalty") &&
      pendingActionsByAutomation[key] > 0
    ) {
      setPrepareNowConfirm({
        key,
        label: key === "grow" ? "Propulser" : "Fidéliser",
        pendingCount: pendingActionsByAutomation[key],
      });
      return;
    }

    void runAutomationNow(key);
  }

  async function confirmPrepareNowReplacement() {
    const confirm = prepareNowConfirm;
    if (!confirm) return;
    setPrepareNowConfirm(null);
    await runAutomationNow(confirm.key);
  }

  async function preparePublishAction() {
    if (prepareActionState === "saving") return false;

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
      return true;
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Préparation de la publication impossible.",
      );
      return false;
    } finally {
      setPrepareActionState("idle");
    }
  }

  async function prepareCampaignAction(
    key: Extract<AutomationKey, "grow" | "loyalty">,
  ) {
    if (prepareActionState === "saving") return false;

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
        movedDrafts?: Array<{
          actionId?: string | null;
          draftId?: string | null;
        }>;
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
      const movedActionIds = new Set(
        (payload.movedDrafts ?? [])
          .map((draft) => String(draft.actionId || "").trim())
          .filter(Boolean),
      );
      setActions((current) => [
        preparedAction,
        ...current.filter(
          (action) =>
            action.id !== preparedAction.id &&
            !movedActionIds.has(action.id) &&
            !(
              action.automationKey === key &&
              pendingActionStatuses.has(action.status)
            ),
        ),
      ]);
      void refreshActions(true);
      setSelectedKey(key);
      showNotice(
        key === "grow"
          ? "Campagne Propulser préparée par iNr’Agent."
          : "Campagne Fidéliser préparée par iNr’Agent.",
      );
      return true;
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Préparation de la campagne impossible.",
      );
      return false;
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
            currentPercent < 20
              ? 4
              : currentPercent < 45
                ? 3
                : currentPercent < 70
                  ? 2
                  : 1;
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

  function openScheduleEdit(actionId: string | null | undefined) {
    if (!actionId) return;
    const action = scheduledActions.find((item) => item.id === actionId);
    if (!action) return;
    setScheduleEditAction(action);
    setScheduleEditDate(isoToLocalDateInput(action.scheduledAt));
    setScheduleEditTime(isoToLocalTimeInput(action.scheduledAt));
  }

  async function confirmScheduleEdit() {
    if (!scheduleEditAction || scheduleMutationState === "saving") return;
    const nextIso = localInputsToIso(scheduleEditDate, scheduleEditTime);
    if (!nextIso || new Date(nextIso).getTime() <= Date.now() + 30_000) {
      showNotice("Choisissez une date et une heure dans le futur.");
      return;
    }

    setScheduleMutationState("saving");
    try {
      const response = await fetch(
        `/api/agent/scheduled-actions/${scheduleEditAction.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduledAt: nextIso }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok)
        throw new Error(
          payload?.error || "Modification de l’action programmée impossible.",
        );
      setScheduleEditAction(null);
      showNotice("Action programmée modifiée.");
      await refreshScheduledActions(true);
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Modification de l’action programmée impossible.",
      );
    } finally {
      setScheduleMutationState("idle");
    }
  }

  async function cancelScheduledAction(actionId: string | null | undefined) {
    if (!actionId || scheduleMutationState === "saving") return;
    const ok = window.confirm("Supprimer cette action programmée ?");
    if (!ok) return;

    setScheduleMutationState("saving");
    try {
      const response = await fetch(`/api/agent/scheduled-actions/${actionId}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok)
        throw new Error(
          payload?.error || "Suppression de l’action programmée impossible.",
        );
      showNotice("Action programmée supprimée.");
      await refreshScheduledActions(true);
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Suppression de l’action programmée impossible.",
      );
    } finally {
      setScheduleMutationState("idle");
    }
  }

  async function disableAutomationFromSchedule(
    key: AutomationKey | null | undefined,
  ) {
    if (!key || scheduleMutationState === "saving") return;
    const automation = automations.find((item) => item.key === key);
    const ok = window.confirm(
      `Désactiver l’automatisation ${automation?.title || "iNrAgent"} ?`,
    );
    if (!ok) return;

    const nextConfigs = {
      ...configs,
      [key]: { ...configs[key], enabled: false },
    };
    const nextSettings = configsToSettings(agentSettings, nextConfigs);
    setScheduleMutationState("saving");
    try {
      const response = await fetch("/api/agent/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: nextSettings }),
      });
      const payload = (await response.json().catch(() => null)) as {
        settings?: Partial<InrAgentSettings>;
        error?: string;
      } | null;
      if (!response.ok)
        throw new Error(payload?.error || "Désactivation impossible.");
      const savedSettings = sanitizeInrAgentSettings(
        payload?.settings ?? nextSettings,
      );
      setAgentSettings(savedSettings);
      setConfigs(settingsToConfigs(savedSettings));
      showNotice("Automatisation désactivée.");
    } catch (error) {
      showNotice(
        error instanceof Error ? error.message : "Désactivation impossible.",
      );
    } finally {
      setScheduleMutationState("idle");
    }
  }

  async function handleScheduleRowModify(item: ScheduleListItem) {
    if (item.source === "manual") {
      openScheduleEdit(item.scheduledActionId);
      return;
    }
    if (item.automationKey) {
      setScheduleOpen(false);
      setSettingsKey(item.automationKey);
    }
  }

  async function handleScheduleRowDelete(item: ScheduleListItem) {
    if (item.source === "manual") {
      await cancelScheduledAction(item.scheduledActionId);
      return;
    }
    await disableAutomationFromSchedule(item.automationKey);
  }

  function canSchedulePreparedAction(
    action: AgentPreparedAction | null | undefined,
  ) {
    if (!action) return false;
    if (
      action.automationKey === "publish" &&
      action.targetTool === "booster" &&
      action.actionType === "publication"
    )
      return true;
    if (
      (action.automationKey === "grow" || action.automationKey === "loyalty") &&
      ["propulser", "fideliser", "mails"].includes(action.targetTool)
    )
      return true;
    return false;
  }

  function openValidationScheduleModal() {
    const fallback = new Date(Date.now() + 30 * 60 * 1000);
    fallback.setSeconds(0, 0);
    setValidationScheduleDate(isoToLocalDateInput(fallback.toISOString()));
    setValidationScheduleTime(isoToLocalTimeInput(fallback.toISOString()));
    setValidationChoiceOpen(false);
    setValidationScheduleOpen(true);
  }

  async function scheduleValidatedAction() {
    if (!selectedPreparedAction || validationScheduleState === "saving") return;
    const nextIso = localInputsToIso(
      validationScheduleDate,
      validationScheduleTime,
    );
    if (!nextIso || new Date(nextIso).getTime() <= Date.now() + 30_000) {
      showNotice("Choisissez une date et une heure dans le futur.");
      return;
    }

    setValidationScheduleState("saving");
    setNotice(null);
    try {
      const response = await fetch("/api/agent/actions/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionId: selectedPreparedAction.id,
          scheduledAt: nextIso,
          timezone: agentSettings.timezone || "Europe/Paris",
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        action?: AgentPreparedAction;
        scheduledAction?: AgentScheduledAction | null;
        scheduledActions?: AgentScheduledAction[];
        error?: string;
        tableMissing?: boolean;
      } | null;

      if (!response.ok) {
        if (payload?.tableMissing) setScheduledActionsTableMissing(true);
        throw new Error(
          payload?.error || "Programmation de l’action impossible.",
        );
      }

      if (payload?.action) {
        const updatedAction = payload.action;
        setActions((current) =>
          current.map((action) =>
            action.id === updatedAction.id ? updatedAction : action,
          ),
        );
      }
      const newScheduledActions = Array.isArray(payload?.scheduledActions)
        ? payload.scheduledActions
        : payload?.scheduledAction
          ? [payload.scheduledAction]
          : [];
      if (newScheduledActions.length) {
        const newIds = new Set(newScheduledActions.map((item) => item.id));
        setScheduledActions((current) => [
          ...newScheduledActions,
          ...current.filter((item) => !newIds.has(item.id)),
        ]);
      }

      setValidationScheduleOpen(false);
      showNotice("Action validée et programmée dans iNr’Agent.");
      await refreshActions(true);
      await refreshScheduledActions(true);
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Programmation de l’action impossible.",
      );
    } finally {
      setValidationScheduleState("idle");
    }
  }

  useEffect(() => {
    return () => {
      if (agentPublishProgressTimerRef.current) {
        window.clearInterval(agentPublishProgressTimerRef.current);
        agentPublishProgressTimerRef.current = null;
      }
    };
  }, []);

  function stopAgentPublishProgressTimer() {
    if (agentPublishProgressTimerRef.current) {
      window.clearInterval(agentPublishProgressTimerRef.current);
      agentPublishProgressTimerRef.current = null;
    }
  }

  function startAgentPublishProgress(action: AgentPreparedAction) {
    stopAgentPublishProgressTimer();
    const channels = Array.isArray(action.targetChannels)
      ? action.targetChannels
          .map((channel) => agentPublishChannelToBoosterChannel[String(channel || "").trim()] || String(channel || "").trim())
          .filter(Boolean)
      : [];
    const selectedChannels = channels.length ? channels : ["publication"];
    const startedAt = Date.now();
    const estimatedMs = Math.max(8500, 4200 + selectedChannels.length * 5200);

    setAgentPublishExecutionProgress({
      progress: 6,
      label: "Préparation de la publication iNr’Agent...",
    });

    agentPublishProgressTimerRef.current = window.setInterval(() => {
      const ratio = Math.min(1, (Date.now() - startedAt) / estimatedMs);
      const progress = Math.max(6, Math.min(96, Math.round(6 + ratio * 90)));
      let label = "Préparation de la publication iNr’Agent...";
      if (ratio >= 0.12 && ratio < 0.72) {
        const channelRatio = Math.max(0, (ratio - 0.12) / 0.6);
        const channelIndex = Math.min(
          selectedChannels.length - 1,
          Math.floor(channelRatio * selectedChannels.length),
        );
        const channel = selectedChannels[channelIndex];
        const boosterChannel = agentPublishChannelToBoosterChannel[channel] || channel;
        const labelName = channelDisplayName(boosterChannel || channel);
        label = selectedChannels.length > 1
          ? `Canal ${channelIndex + 1}/${selectedChannels.length} — publication sur ${labelName}...`
          : `Publication sur ${labelName}...`;
      } else if (ratio >= 0.72 && ratio < 0.88) {
        label = "Récupération des retours canaux...";
      } else if (ratio >= 0.88) {
        label = "Finalisation dans iNr’Send...";
      }
      setAgentPublishExecutionProgress((current) =>
        current ? { progress: Math.max(current.progress, progress), label } : current,
      );
    }, 450);
  }

  async function loadAgentPublishChannelLinks() {
    try {
      const response = await fetch("/api/booster/connected-channels", {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.channelDetails) return {};
      const details = asRecord(payload.channelDetails) || {};
      const links: Record<string, string> = {};
      for (const [channel, value] of Object.entries(details)) {
        const href = normalizeAgentExternalHref(asRecord(value)?.href);
        if (href) links[channel] = href;
      }
      return links;
    } catch {
      return {};
    }
  }

  function completeAgentPublishProgress(label: string) {
    stopAgentPublishProgressTimer();
    setAgentPublishExecutionProgress((current) =>
      current ? { progress: 100, label } : current,
    );
  }

  function buildAgentCampaignLaunchNotice(payload: {
    campaignResult?: Record<string, unknown> | null;
    action: AgentPreparedAction;
  }): AgentCampaignLaunchNotice {
    const campaignResult = payload.campaignResult || {};
    const folderRaw = String(
      campaignResult.folder || payload.action.payload?.folder || "",
    ).trim();
    const fallbackFolder = payload.action.automationKey === "loyalty" ? "fidelisations" : "propulsions";
    const folder = (["propulsions", "fidelisations", "mails"].includes(folderRaw)
      ? folderRaw
      : fallbackFolder) as "propulsions" | "fidelisations" | "mails";
    const queued = Math.max(
      0,
      Number(campaignResult.queued || payload.action.recipients?.length || 0),
    );
    return {
      queued,
      folder,
      title: "Campagne lancée",
      details: queued > 0
        ? `${queued} email${queued > 1 ? "s" : ""} en file d’envoi. Le bilan final sera envoyé par mail au pro.`
        : "La campagne a été confiée à iNr’Agent. Le bilan final sera envoyé par mail au pro.",
    };
  }

  async function updateActionStatus(status: "validated" | "refused") {
    const actionToExecute = selectedPreparedAction;
    if (!actionToExecute || actionMutationState === "saving") return;

    const isImmediatePublishExecution =
      status === "validated" &&
      actionToExecute.automationKey === "publish" &&
      actionToExecute.targetTool === "booster" &&
      actionToExecute.actionType === "publication";
    const isImmediateCampaignExecution =
      status === "validated" &&
      (actionToExecute.automationKey === "grow" ||
        actionToExecute.automationKey === "loyalty" ||
        actionToExecute.targetTool === "mails" ||
        actionToExecute.actionType === "mailing" ||
        actionToExecute.actionType === "campaign");

    setActionMutationState("saving");
    setNotice(null);
    setAgentCampaignLaunchNotice(null);
    if (isImmediatePublishExecution) {
      setValidationChoiceOpen(false);
      setValidationScheduleOpen(false);
      setAgentPublishSuccessSummary(null);
      startAgentPublishProgress(actionToExecute);
    }

    try {
      const endpoint =
        status === "validated"
          ? "/api/agent/actions/execute"
          : "/api/agent/actions";
      const response = await fetch(endpoint, {
        method: status === "validated" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: actionToExecute.id, status }),
      });
      const payload = (await response.json().catch(() => null)) as {
        action?: AgentPreparedAction;
        error?: string;
        tableMissing?: boolean;
        executed?: boolean;
        publishResult?: Record<string, unknown> | null;
        campaignResult?: Record<string, unknown> | null;
      } | null;

      const applyReturnedAction = (nextAction: AgentPreparedAction) => {
        setActions((current) =>
          current.map((action) =>
            action.id === nextAction.id ? nextAction : action,
          ),
        );
      };

      if (!response.ok) {
        if (payload?.action) applyReturnedAction(payload.action);

        const failedPublishSummary = asRecord(payload?.publishResult)?.summary;
        if (isImmediatePublishExecution && failedPublishSummary) {
          completeAgentPublishProgress("Échec");
          await new Promise((resolve) => window.setTimeout(resolve, 220));
          const channelLinks = await loadAgentPublishChannelLinks();
          setAgentPublishExecutionProgress(null);
          setAgentPublishSuccessSummary({
            ...(asRecord(failedPublishSummary) || {}),
            channelLinks,
          });
          return;
        }

        throw new Error(
          payload?.error || "Mise à jour de l’action impossible.",
        );
      }

      if (payload?.tableMissing) setTableMissing(true);
      if (payload?.action) {
        applyReturnedAction(payload.action);
      } else {
        setActions((current) =>
          current.map((action) =>
            action.id === actionToExecute.id ? { ...action, status } : action,
          ),
        );
      }

      if (status === "validated") {
        setValidationChoiceOpen(false);
        setValidationScheduleOpen(false);

        if (isImmediatePublishExecution) {
          const publishSummary = asRecord(payload?.publishResult)?.summary;
          completeAgentPublishProgress(
            asRecord(publishSummary)?.allFailed ? "Échec" : "Publié",
          );
          await new Promise((resolve) => window.setTimeout(resolve, 220));
          const channelLinks = await loadAgentPublishChannelLinks();
          setAgentPublishExecutionProgress(null);
          setAgentPublishSuccessSummary({
            ...(asRecord(publishSummary) || {}),
            channelLinks,
          });
          return;
        }

        if (isImmediateCampaignExecution && payload?.campaignResult) {
          setAgentCampaignLaunchNotice(
            buildAgentCampaignLaunchNotice({
              campaignResult: payload.campaignResult,
              action: payload.action || actionToExecute,
            }),
          );
          return;
        }

        showNotice("Action validée et exécutée par iNr’Agent.");
      } else {
        showNotice("Action refusée. Rien ne sera exécuté.");
      }
    } catch (error) {
      if (isImmediatePublishExecution) {
        stopAgentPublishProgressTimer();
        setAgentPublishExecutionProgress(null);
      }
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
      {agentPublishExecutionProgress ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 130,
            display: "grid",
            placeItems: "center",
            padding: 16,
            background: "rgba(3, 8, 20, 0.52)",
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Publication en cours"
        >
          <div
            className={dashboardStyles.blockCard}
            style={{
              width: "min(520px, 100%)",
              boxShadow: "0 30px 80px rgba(0,0,0,0.40)",
              background:
                "linear-gradient(180deg, rgba(12,18,32,0.98), rgba(10,14,24,0.98))",
            }}
          >
            <PublishExecutionProgress
              styles={dashboardStyles}
              publishProgress={agentPublishExecutionProgress.progress}
              publishProgressLabel={agentPublishExecutionProgress.label}
            />
          </div>
        </div>
      ) : null}

      {agentPublishSuccessSummary ? (
        <PublishExecutionResultModal
          styles={dashboardStyles}
          summary={agentPublishSuccessSummary}
          onClose={() => setAgentPublishSuccessSummary(null)}
          onOpenInrSend={() => {
            setAgentPublishSuccessSummary(null);
            router.push("/dashboard/mails?folder=publications");
          }}
        />
      ) : null}

      {agentCampaignLaunchNotice ? (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setAgentCampaignLaunchNotice(null)}
        >
          <section
            className={`${styles.settingsModal} ${styles.validationChoiceModal}`}
            role="dialog"
            aria-modal="true"
            aria-label="Campagne lancée"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setAgentCampaignLaunchNotice(null)}
              aria-label="Fermer"
            >
              ×
            </button>
            <p className={styles.modalEyebrow}>iNr’Agent</p>
            <h2>{agentCampaignLaunchNotice.title}</h2>
            <p className={styles.modalHint}>{agentCampaignLaunchNotice.details}</p>
            <div className={styles.modalActionButtonRow}>
              <button
                type="button"
                className={styles.modalActionSecondaryButton}
                onClick={() => setAgentCampaignLaunchNotice(null)}
              >
                Fermer
              </button>
              <button
                type="button"
                className={styles.modalActionButton}
                onClick={() => {
                  const folder = agentCampaignLaunchNotice.folder;
                  setAgentCampaignLaunchNotice(null);
                  router.push(`/dashboard/mails?folder=${folder}`);
                }}
              >
                Voir dans iNr’Send
              </button>
            </div>
          </section>
        </div>
      ) : null}

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
              <p className={styles.moduleSubtitleDesktop}>
                Programmateur d’automatisations connecté à vos outils.
              </p>
            </div>
          </div>

          <p className={styles.moduleSubtitleMobile}>
            Programmateur d’automatisations connecté à vos outils.
          </p>

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
              size={isMobileHeader ? 26 : 34}
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
              className={styles.headerScheduleButton}
              onClick={() => {
                setScheduleOpen(true);
                void refreshScheduledActions(true);
              }}
              aria-label="Voir les actions programmées"
              title="Programmation"
            >
              <span className={styles.headerScheduleIcon} aria-hidden>
                <CalendarMetaIcon />
              </span>
              <span className={styles.headerScheduleLabel}>Planning</span>
            </button>
            <button
              type="button"
              className={styles.headerToolButton}
              data-automation={selected.key}
              onClick={() => router.push(selectedHeaderTool.href)}
              aria-label={`Ouvrir ${selectedHeaderTool.label}`}
              title={`Ouvrir ${selectedHeaderTool.label}`}
            >
              {selectedHeaderTool.logoSrc ? (
                <img
                  className={styles.headerToolLogo}
                  src={selectedHeaderTool.logoSrc}
                  alt=""
                  aria-hidden
                  width={34}
                  height={34}
                  loading="eager"
                  decoding="sync"
                  onError={(event) => {
                    event.currentTarget.src = "/inrstats-logo.png";
                  }}
                />
              ) : (
                <span className={styles.headerToolLetter} aria-hidden>
                  {selectedHeaderTool.compactLabel}
                </span>
              )}
              <span className={styles.headerToolLabel}>
                {selectedHeaderTool.label}
              </span>
            </button>
            <button
              type="button"
              className={styles.headerInrSendButton}
              onClick={() =>
                router.push(
                  `/dashboard/mails?folder=${inrSendFolderForAutomation(selected.key)}`,
                )
              }
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
              aria-label="Retour au tableau de bord"
              title="Retour au tableau de bord"
            >
              <span className={styles.headerCloseLabel}>Fermer</span>
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
                    <span className={styles.cardTitleFull}>
                      {automation.title}
                    </span>
                    <span className={styles.cardTitleShort}>
                      {automation.shortTitle}
                    </span>
                  </span>
                  {pendingActionsByAutomation[automation.key] > 0 && (
                    <span
                      className={styles.cardPendingCount}
                      data-count={pendingActionsByAutomation[automation.key]}
                      aria-label={`${pendingActionsByAutomation[automation.key]} action à valider`}
                    >
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
              className={`${styles.previewCard} ${selected.key === "stats" || isCampaignView || isPublishView ? styles.previewCardNoFrame : ""}`}
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
                          iNr’Agent analyse vos données et vous envoie un bilan
                          PDF automatiquement.
                        </p>
                      </div>
                    </div>

                    <div className={styles.statsTopGrid}>
                      <article
                        className={`${styles.statsMiniCard} ${styles.statsMiniCardGreen}`}
                      >
                        <div className={styles.statsMiniHead}>
                          <span className={styles.statsMiniIcon} aria-hidden>
                            <SparkSettingsIcon />
                          </span>
                          <small>Automatisation</small>
                        </div>
                        <strong>{statsAutomationLabel}</strong>
                      </article>
                      <article
                        className={`${styles.statsMiniCard} ${styles.statsMiniCardBlue}`}
                      >
                        <div className={styles.statsMiniHead}>
                          <span className={styles.statsMiniIcon} aria-hidden>
                            <CalendarMetaIcon />
                          </span>
                          <small>Fréquence</small>
                        </div>
                        <strong>{statsFrequencyLabel}</strong>
                      </article>
                      <article
                        className={`${styles.statsMiniCard} ${styles.statsMiniCardViolet}`}
                      >
                        <div className={styles.statsMiniHead}>
                          <span className={styles.statsMiniIcon} aria-hidden>
                            <CalendarMetaIcon />
                          </span>
                          <small>Prochain bilan</small>
                        </div>
                        <strong>{statsNextRunLabel}</strong>
                      </article>
                      <article
                        className={`${styles.statsMiniCard} ${styles.statsMiniCardSky}`}
                      >
                        <div className={styles.statsMiniHead}>
                          <span className={styles.statsMiniIcon} aria-hidden>
                            <SendPlaneIcon />
                          </span>
                          <small>Dernier bilan</small>
                        </div>
                        <strong>{statsLastReportLabel}</strong>
                      </article>
                      <article
                        className={`${styles.statsMiniCard} ${styles.statsMiniCardPink}`}
                      >
                        <div className={styles.statsMiniHead}>
                          <span className={styles.statsMiniIcon} aria-hidden>
                            <ShieldLineIcon />
                          </span>
                          <small>Bilans conservés</small>
                        </div>
                        <strong>{statsStoredCountLabel}</strong>
                      </article>
                    </div>

                    <section
                      className={styles.statsInsightCard}
                      aria-label="Dernières recommandations iNrAgent"
                    >
                      <div className={styles.statsInsightHeader}>
                        <span className={styles.statsInsightIcon} aria-hidden>
                          <SparkSettingsIcon />
                        </span>
                        <div className={styles.statsInsightCopy}>
                          <strong>Dernières recommandations iNr’Agent</strong>
                        </div>
                      </div>
                      {latestStatsRecommendations.length > 0 ? (
                        <ol className={styles.statsRecommendationList}>
                          {latestStatsRecommendations.map(
                            (recommendation, index) => (
                              <li key={`stats-recommendation-${index}`}>
                                <span>{index + 1}</span>
                                <p>{recommendation}</p>
                              </li>
                            ),
                          )}
                        </ol>
                      ) : (
                        <p className={styles.statsRecommendationEmpty}>
                          Le prochain bilan automatique affichera ici les
                          recommandations de la dernière page du PDF.
                        </p>
                      )}
                    </section>

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
                              <span
                                className={styles.statsHistoryIcon}
                                aria-hidden
                              >
                                <DownloadActionIcon />
                              </span>
                              <span className={styles.statsHistoryDate}>
                                <strong>
                                  {
                                    formatReportDateLabel(
                                      report.document.createdAt ||
                                        report.completedAt ||
                                        report.createdAt,
                                    ).date
                                  }
                                </strong>
                                <small>
                                  {
                                    formatReportDateLabel(
                                      report.document.createdAt ||
                                        report.completedAt ||
                                        report.createdAt,
                                    ).time
                                  }
                                </small>
                              </span>
                            </a>
                          ) : (
                            <div
                              key={`stats-empty-${index}`}
                              className={`${styles.statsHistoryItem} ${styles.statsHistoryItemEmpty}`}
                            >
                              <span
                                className={styles.statsHistoryIcon}
                                aria-hidden
                              >
                                <DownloadActionIcon />
                              </span>
                              <span className={styles.statsHistoryDate}>—</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : isCampaignView && campaignDisplayPreview ? (
                  <div
                    key={`${selectedPreparedAction?.id || selected.key}-campaign`}
                    className={`${styles.campaignPreview} ${!hasCampaignPreview ? styles.campaignPreviewEmpty : ""}`}
                  >
                    <div className={styles.campaignInfoGrid}>
                      <article
                        className={`${styles.campaignInfoCard} ${styles.campaignInfoTheme}`}
                      >
                        <span className={styles.campaignInfoIcon} aria-hidden>
                          <AutomationIcon type={selected.key} />
                        </span>
                        <span>
                          <small>Rubrique</small>
                          <strong>{campaignDisplayPreview.mission}</strong>
                        </span>
                      </article>
                      <button
                        type="button"
                        className={`${styles.campaignInfoCard} ${styles.campaignInfoRecipients}`}
                        onClick={() => setRecipientsPreviewOpen(true)}
                        disabled={
                          !hasCampaignPreview ||
                          campaignDisplayPreview.recipientsCount <= 0
                        }
                        title={
                          hasCampaignPreview
                            ? "Voir les destinataires"
                            : "Aucune campagne préparée"
                        }
                      >
                        <span className={styles.campaignInfoIcon} aria-hidden>
                          <SparkSettingsIcon />
                        </span>
                        <span>
                          <small>Destinataires</small>
                          <strong>
                            {hasCampaignPreview
                              ? `${campaignDisplayPreview.recipientsCount} contact${campaignDisplayPreview.recipientsCount > 1 ? "s" : ""}`
                              : "—"}
                          </strong>
                        </span>
                        <span className={styles.campaignInfoEye} aria-hidden>
                          👁
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`${styles.campaignInfoCard} ${styles.campaignInfoMail}`}
                        onClick={openMailAccountEditor}
                        disabled={!hasCampaignPreview}
                        title={
                          hasCampaignPreview
                            ? "Modifier la boîte d’envoi"
                            : "Aucune campagne préparée"
                        }
                      >
                        <span className={styles.campaignInfoIcon} aria-hidden>
                          <SendPlaneIcon />
                        </span>
                        <span className={styles.campaignInfoText}>
                          <small>Boîte d’envoi</small>
                          <strong className={styles.campaignInfoMailLabel}>
                            {campaignDisplayPreview.mailAccountLabel}
                          </strong>
                        </span>
                        <span className={styles.campaignInfoEye} aria-hidden>
                          👁
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`${styles.campaignInfoCard} ${styles.campaignInfoAttachment}`}
                        onClick={() => setAttachmentPreviewOpen(true)}
                        disabled={!hasCampaignPreview}
                        title={
                          hasCampaignPreview
                            ? "Voir la pièce jointe"
                            : "Aucune campagne préparée"
                        }
                      >
                        <span className={styles.campaignInfoIcon} aria-hidden>
                          <ImageMetaIcon />
                        </span>
                        <span>
                          <small>Pièce jointe</small>
                          <strong>
                            {hasCampaignPreview
                              ? campaignAttachments.length > 0
                                ? campaignAttachments.length === 1
                                  ? campaignAttachments[0].name
                                  : `${campaignAttachments.length} fichiers`
                                : "Aucune"
                              : "—"}
                          </strong>
                        </span>
                        <span className={styles.campaignInfoEye} aria-hidden>
                          👁
                        </span>
                      </button>
                    </div>

                    <article className={styles.campaignMailCard}>
                      <div className={styles.campaignMailSubject}>
                        <span>Objet :</span>
                        <strong>{campaignDisplayPreview.subject}</strong>
                      </div>
                      <div className={styles.campaignMailContent}>
                        {campaignDisplayPreview.paragraphs.map(
                          (paragraph, index) => (
                            <p
                              key={`${selectedPreparedAction?.id || selected.key}-mail-paragraph-${index}`}
                            >
                              {renderRichInlineText(
                                paragraph,
                                `${selectedPreparedAction?.id || selected.key}-mail-paragraph-${index}`,
                              )}
                            </p>
                          ),
                        )}
                        {!hasCampaignPreview && (
                          <div className={styles.campaignEmptyHint}>
                            <span>
                              {actionsLoadState === "loading"
                                ? "Recherche des actions préparées..."
                                : "Aucune campagne automatique préparée pour le moment."}
                            </span>
                          </div>
                        )}
                      </div>
                    </article>
                  </div>
                ) : isPublishView ? (
                  <div
                    key={`${selectedPreparedAction?.id || selected.key}-${activePreviewChannel || "global"}-publish`}
                    className={`${styles.publishPreview} ${!selectedPreparedAction ? styles.publishPreviewEmpty : ""}`}
                  >
                    <div className={styles.publishInfoGrid}>
                      <article
                        className={`${styles.campaignInfoCard} ${styles.publishInfoChannel}`}
                      >
                        <span className={styles.campaignInfoIcon} aria-hidden>
                          <AutomationIcon type="publish" />
                        </span>
                        <span>
                          <small>Canal</small>
                          <strong>{activePreviewChannelLabel}</strong>
                        </span>
                      </article>
                      <button
                        type="button"
                        className={`${styles.campaignInfoCard} ${styles.publishInfoFormat}`}
                        onClick={openPublishTextEditor}
                        disabled={
                          !selectedPreparedAction ||
                          actionMutationState === "saving"
                        }
                        title={
                          selectedPreparedAction
                            ? "Modifier le contenu"
                            : "Aucune publication préparée"
                        }
                      >
                        <span className={styles.campaignInfoIcon} aria-hidden>
                          <ImageMetaIcon />
                        </span>
                        <span>
                          <small>Contenu</small>
                          <strong>{publishContentKind}</strong>
                        </span>
                        <span className={styles.campaignInfoEye} aria-hidden>
                          👁
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`${styles.campaignInfoCard} ${styles.publishInfoAttachment}`}
                        onClick={openPublishMediaEditor}
                        disabled={
                          !selectedPreparedAction ||
                          actionMutationState === "saving"
                        }
                        title={
                          selectedPreparedAction
                            ? "Gérer le média"
                            : "Aucune publication préparée"
                        }
                      >
                        <span className={styles.campaignInfoIcon} aria-hidden>
                          <ImageMetaIcon />
                        </span>
                        <span>
                          <small>Média</small>
                          <strong>
                            {publishMediaPreview?.name || "Aucun"}
                          </strong>
                        </span>
                        <span className={styles.campaignInfoEye} aria-hidden>
                          👁
                        </span>
                      </button>
                      <article
                        className={`${styles.campaignInfoCard} ${styles.publishInfoStatus}`}
                      >
                        <span className={styles.campaignInfoIcon} aria-hidden>
                          <ShieldLineIcon />
                        </span>
                        <span>
                          <small>Statut</small>
                          <strong className={publishStatusClass}>
                            {publishStatus.label}
                          </strong>
                        </span>
                      </article>
                    </div>

                    <article className={styles.publishPostCard}>
                      <div className={styles.publishPostText}>
                        <div className={styles.publishTitleLine}>
                          <span>Titre :</span>
                          <strong>
                            {preparedChannelPreview?.title ||
                              selectedPreparedAction?.title ||
                              "—"}
                          </strong>
                        </div>
                        <div className={styles.publishPostContent}>
                          {publishParagraphs.length > 0 ? (
                            publishParagraphs.map((paragraph, index) => (
                              <p
                                key={`${selectedPreparedAction?.id || selected.key}-${activePreviewChannel || "global"}-publish-paragraph-${index}`}
                              >
                                {renderRichInlineText(
                                  paragraph,
                                  `${selectedPreparedAction?.id || selected.key}-${activePreviewChannel || "global"}-publish-paragraph-${index}`,
                                )}
                              </p>
                            ))
                          ) : selectedPreparedAction ? (
                            <p>
                              {renderRichInlineText(
                                selectedPreparedAction.summary,
                                `${selectedPreparedAction.id}-publish-summary`,
                              )}
                            </p>
                          ) : (
                            <div className={styles.publishEmptyHint}>
                              <strong>
                                Aucune publication automatique préparée pour le
                                moment.
                              </strong>
                              <span>
                                Le futur contenu du canal sélectionné
                                s’affichera ici dès qu’iNr’Agent aura préparé
                                une publication.
                              </span>
                            </div>
                          )}
                          {preparedChannelPreview?.hashtags.length ? (
                            <small className={styles.previewHashtags}>
                              {preparedChannelPreview.hashtags
                                .map(
                                  (hashtag) => `#${hashtag.replace(/^#+/, "")}`,
                                )
                                .join(" ")}
                            </small>
                          ) : null}
                        </div>
                        <div className={styles.publishCtaLine}>
                          <span>CTA :</span>
                          <strong>{publishCtaLine}</strong>
                        </div>
                      </div>
                    </article>
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
                          {
                            INR_AGENT_STATUS_LABELS[
                              selectedPreparedAction.status
                            ]
                          }
                        </span>
                      </div>
                      <h3>
                        {preparedChannelPreview?.title ||
                          selectedPreparedAction.title}
                      </h3>
                      {preparedParagraphs.length > 0 ? (
                        preparedParagraphs.map((paragraph, index) => (
                          <p
                            key={`${selectedPreparedAction.id}-${activePreviewChannel || "global"}-paragraph-${index}`}
                          >
                            {renderRichInlineText(
                              paragraph,
                              `${selectedPreparedAction.id}-${activePreviewChannel || "global"}-paragraph-${index}`,
                            )}
                          </p>
                        ))
                      ) : (
                        <p>
                          {renderRichInlineText(
                            selectedPreparedAction.summary,
                            `${selectedPreparedAction.id}-summary`,
                          )}
                        </p>
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
                          Destinataires proposés : {preparedRecipientsCount}{" "}
                          contact{preparedRecipientsCount > 1 ? "s" : ""} CRM
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
                  </div>
                )}
              </div>

              <div
                className={`${styles.previewMeta} ${selected.key === "stats" ? styles.previewMetaStats : ""} ${isCampaignView ? styles.previewMetaCampaign : ""} ${isPublishView ? styles.previewMetaPublish : ""}`}
              >
                <div className={`${styles.metaItem} ${styles.channelsItem}`}>
                  <small>
                    {selected.key === "stats"
                      ? "Sources :"
                      : isCampaignView
                        ? "Canal"
                        : "Canaux :"}
                  </small>
                  <div
                    className={`${styles.channelScrollerWrap} ${isPublishView ? styles.channelScrollerWrapPublish : ""}`}
                  >
                    {isPublishView && displayChannels.length > 1 && (
                      <button
                        type="button"
                        className={styles.channelNavArrow}
                        onClick={() => movePreviewChannel(-1)}
                        aria-label="Afficher le canal précédent"
                        title="Canal précédent"
                      >
                        ‹
                      </button>
                    )}
                    <div className={styles.channelScroller}>
                      {selected.key === "stats" &&
                      selectedStatsRubriques.length > 0 ? (
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
                              <img
                                src={rubrique.src}
                                alt=""
                                loading="eager"
                                decoding="sync"
                                aria-hidden
                              />
                            </button>
                          );
                        })
                      ) : isCampaignView ? (
                        <span
                          className={styles.campaignMailPill}
                          title="Mails"
                          aria-label="Canal Mails"
                        >
                          <img
                            src={channelOptions.mails.src}
                            alt=""
                            loading="eager"
                            decoding="sync"
                            aria-hidden
                          />
                        </span>
                      ) : displayChannels.length > 0 ? (
                        displayChannels.map((channelKey) => {
                          const channel = channelOptions[channelKey];
                          const activeChannel =
                            channelKey === activePreviewChannel;
                          return (
                            <button
                              type="button"
                              key={channelKey}
                              data-channel={channelKey}
                              className={
                                activeChannel ? styles.channelPillActive : ""
                              }
                              onClick={() => selectPreviewChannel(channelKey)}
                              aria-label={`Afficher l’aperçu ${channel.name}`}
                              title={channel.name}
                            >
                              <img
                                src={channel.src}
                                alt=""
                                loading="eager"
                                decoding="sync"
                                aria-hidden
                              />
                            </button>
                          );
                        })
                      ) : (
                        <strong>—</strong>
                      )}
                    </div>
                    {isPublishView && displayChannels.length > 1 && (
                      <button
                        type="button"
                        className={styles.channelNavArrow}
                        onClick={() => movePreviewChannel(1)}
                        aria-label="Afficher le canal suivant"
                        title="Canal suivant"
                      >
                        ›
                      </button>
                    )}
                  </div>
                </div>
                <div
                  className={`${styles.metaItem} ${styles.dateItem}`}
                  title={
                    selected.key === "stats"
                      ? "Prochain bilan automatique"
                      : "Date programmée"
                  }
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
                  <>
                    {(isCampaignView || isPublishView) && (
                      <button
                        type="button"
                        className={styles.saveCampaignDraftButton}
                        aria-label={
                          isPublishView
                            ? "Enregistrer la publication en brouillon"
                            : "Enregistrer la campagne en brouillon"
                        }
                        title={
                          isPublishView
                            ? "Enregistrer"
                            : "Enregistrer la campagne"
                        }
                        data-tooltip={
                          isPublishView
                            ? "Enregistrer"
                            : "Enregistrer la campagne"
                        }
                        disabled={
                          !hasPreparedAction ||
                          actionMutationState === "saving" ||
                          campaignDraftSaveState === "saving"
                        }
                        onClick={() => {
                          setCampaignDraftConfirmOpen(true);
                        }}
                      >
                        <span aria-hidden>💾</span>
                        Enregistrer
                      </button>
                    )}
                    {(isCampaignView || isPublishView) && (
                      <button
                        type="button"
                        className={styles.modifyCampaignButton}
                        aria-label={
                          isPublishView
                            ? "Modifier la publication"
                            : "Modifier la campagne"
                        }
                        title={
                          isPublishView ? "Modifier" : "Modifier la campagne"
                        }
                        data-tooltip={
                          isPublishView ? "Modifier" : "Modifier la campagne"
                        }
                        disabled={
                          !hasPreparedAction || actionMutationState === "saving"
                        }
                        onClick={() => {
                          if (isCampaignView) {
                            setCampaignEditOpen(true);
                            return;
                          }
                          setPublishEditChoiceOpen(true);
                        }}
                      >
                        <span aria-hidden>✎</span>
                        Modifier
                      </button>
                    )}
                    <div className={styles.previewActions}>
                      <button
                        type="button"
                        className={styles.validateButton}
                        disabled={
                          !hasPreparedAction || actionMutationState === "saving"
                        }
                        onClick={() => {
                          if (
                            canSchedulePreparedAction(selectedPreparedAction)
                          ) {
                            setValidationChoiceOpen(true);
                          } else {
                            void updateActionStatus("validated");
                          }
                        }}
                      >
                        <span aria-hidden>
                          <ValidateActionIcon />
                        </span>
                        {actionMutationState === "saving"
                          ? "Traitement..."
                          : "Valider"}
                      </button>
                      <button
                        type="button"
                        className={styles.refuseButton}
                        disabled={
                          !hasPreparedAction || actionMutationState === "saving"
                        }
                        onClick={() => updateActionStatus("refused")}
                      >
                        <span aria-hidden>
                          <RefuseActionIcon />
                        </span>
                        {actionMutationState === "saving"
                          ? "Traitement..."
                          : "Refuser"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>
        </div>
      </section>

      {publishEditChoiceOpen && isPublishView && selectedPreparedAction && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setPublishEditChoiceOpen(false)}
        >
          <section
            className={`${styles.settingsModal} ${styles.campaignEditModal}`}
            role="dialog"
            aria-modal="true"
            aria-label="Modifier la publication"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setPublishEditChoiceOpen(false)}
              aria-label="Fermer"
            >
              ×
            </button>
            <p className={styles.modalEyebrow}>Publication iNr’Agent</p>
            <h2>Modifier la publication</h2>
            <div className={styles.campaignEditGrid}>
              <button type="button" onClick={openPublishTextEditor}>
                <strong>Contenu</strong>
                <small>Modifier le titre, le texte, le CTA et les hashtags.</small>
              </button>
              <button type="button" onClick={openPublishMediaEditor}>
                <strong>Média</strong>
                <small>
                  {publishMediaPreview?.name
                    ? `Média actuel : ${publishMediaPreview.name}`
                    : "Ajouter, remplacer ou adapter l’image / la vidéo."}
                </small>
              </button>
            </div>
          </section>
        </div>
      )}

      {publishEditOpen && selectedPreparedAction && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => {
            if (publishSaveState !== "saving") setPublishEditOpen(false);
          }}
        >
          <section
            className={`${styles.settingsModal} ${styles.publishTextModal}`}
            role="dialog"
            aria-modal="true"
            aria-label="Modifier la publication"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setPublishEditOpen(false)}
              aria-label="Fermer"
              disabled={publishSaveState === "saving"}
            >
              ×
            </button>
            <p className={styles.modalEyebrow}>Publication iNr’Agent</p>
            <h2>
              Modifier{" "}
              {publishTextDraft.channel
                ? channelOptions[publishTextDraft.channel]?.name
                : "le canal"}
            </h2>
            <label className={styles.mailTextField}>
              <span>Titre</span>
              <input
                value={publishTextDraft.title}
                onChange={(event) =>
                  setPublishTextDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                maxLength={180}
                placeholder="Titre de la publication"
              />
            </label>
            <label className={styles.mailTextField}>
              <span>Contenu</span>
              <div
                className={styles.richTextToolbar}
                aria-label="Mise en forme du contenu"
              >
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyPublishTextFormat("bold")}
                  title="Gras"
                >
                  <strong>B</strong>
                </button>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyPublishTextFormat("italic")}
                  title="Italique"
                >
                  <em>I</em>
                </button>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyPublishTextFormat("underline")}
                  title="Souligné"
                >
                  <span className={styles.underlineToolbarLabel}>U</span>
                </button>
              </div>
              <RichSiteContentEditor
                value={publishTextDraft.body}
                onChange={(value) =>
                  setPublishTextDraft((current) => ({
                    ...current,
                    body: value.slice(0, 6000),
                  }))
                }
                minHeight={260}
                editorRef={publishBodyEditorRef}
                className={styles.richTextEditorSurface}
                style={AGENT_RICH_TEXT_EDITOR_STYLE}
              />
            </label>
            <div
              className={`${styles.mailTextField} ${styles.publishCtaEditor}`}
            >
              <span>CTA</span>
              {(() => {
                const displayKey = boosterDisplayKeyFromAgentChannel(
                  publishTextDraft.channel,
                );
                const currentPost: BoosterChannelPost = {
                  title: publishTextDraft.title,
                  content: publishTextDraft.body,
                  cta: publishTextDraft.cta,
                  ctaMode: publishTextDraft.ctaMode,
                  ctaUrl: publishTextDraft.ctaUrl,
                  ctaPhone: publishTextDraft.ctaPhone,
                  hashtags: publishTextDraft.hashtags
                    .split(/[\s,;]+/)
                    .filter(Boolean),
                };
                const ctaChoice = getPreferredCtaChoiceFromPost(
                  displayKey,
                  currentPost,
                );
                const activeWebsiteUrl = getWebsiteUrlForChannel(
                  displayKey,
                  publishCtaDefaults,
                );
                const activeWebsiteSourceLabel =
                  getWebsiteSourceLabelForChannel(
                    displayKey,
                    publishCtaDefaults,
                  );
                const websiteChoices = [
                  publishCtaDefaults?.inrcySiteUrl
                    ? {
                        label: "Site iNrCy",
                        url: publishCtaDefaults.inrcySiteUrl,
                      }
                    : null,
                  publishCtaDefaults?.siteWebUrl
                    ? { label: "Site web", url: publishCtaDefaults.siteWebUrl }
                    : null,
                ].filter(Boolean) as Array<{ label: string; url: string }>;
                const ctaMode = publishTextDraft.ctaMode || "none";
                return (
                  <>
                    <div className={styles.publishCtaGrid} data-mode={ctaMode}>
                      <label>
                        <span>Bouton</span>
                        <select
                          value={ctaChoice}
                          onChange={(event) =>
                            applyPublishPreferredCta(
                              event.target.value as BoosterPreferredCta,
                            )
                          }
                        >
                          {BOOSTER_PREFERRED_CTA_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      {(ctaMode === "website" || ctaMode === "custom") && (
                        <label>
                          <span>URL de destination</span>
                          <input
                            value={publishTextDraft.ctaUrl}
                            onChange={(event) =>
                              updatePublishCtaDraft({
                                ctaUrl: event.target.value,
                              })
                            }
                            maxLength={320}
                            placeholder={
                              activeWebsiteUrl
                                ? `URL du site préremplie (${activeWebsiteSourceLabel})`
                                : websiteChoices.length > 1
                                  ? "Choisissez Site iNrCy ou Site web"
                                  : "URL du site (optionnel)"
                            }
                          />
                          {ctaMode === "website" &&
                            websiteChoices.length > 0 && (
                              <div className={styles.publishCtaQuickChoices}>
                                {websiteChoices.map((choice) => (
                                  <button
                                    key={choice.label}
                                    type="button"
                                    onClick={() =>
                                      updatePublishCtaDraft({
                                        ctaUrl: choice.url,
                                      })
                                    }
                                    className={
                                      publishTextDraft.ctaUrl === choice.url
                                        ? styles.publishCtaQuickChoiceActive
                                        : ""
                                    }
                                  >
                                    {choice.label}
                                  </button>
                                ))}
                              </div>
                            )}
                        </label>
                      )}

                      {(ctaMode === "website" || ctaMode === "custom") && (
                        <label>
                          <span>Texte du bouton</span>
                          <input
                            value={publishTextDraft.cta}
                            onChange={(event) =>
                              updatePublishCtaDraft({ cta: event.target.value })
                            }
                            maxLength={180}
                            placeholder={
                              ctaMode === "custom"
                                ? "Ex : En savoir plus"
                                : "Ex : Demander un devis"
                            }
                          />
                        </label>
                      )}

                      {ctaMode === "call" && (
                        <label>
                          <span>Téléphone</span>
                          <input
                            value={publishTextDraft.ctaPhone}
                            onChange={(event) =>
                              updatePublishCtaDraft({
                                ctaPhone: event.target.value,
                              })
                            }
                            maxLength={40}
                            placeholder={
                              publishCtaDefaults?.phone
                                ? "Téléphone prérempli depuis Mon profil"
                                : "Téléphone"
                            }
                          />
                        </label>
                      )}
                    </div>
                    <small className={styles.publishCtaHelp}>
                      {getCtaModeHelp(displayKey, ctaMode)}
                    </small>
                    {ctaMode === "website" && activeWebsiteUrl && (
                      <small className={styles.publishCtaHelp}>
                        Valeur par défaut disponible depuis{" "}
                        {activeWebsiteSourceLabel.toLowerCase()} :{" "}
                        {activeWebsiteUrl}
                      </small>
                    )}
                    {ctaMode === "call" && publishCtaDefaults?.phone && (
                      <small className={styles.publishCtaHelp}>
                        Valeur par défaut disponible depuis Mon profil :{" "}
                        {publishCtaDefaults.phone}
                      </small>
                    )}
                  </>
                );
              })()}
            </div>
            {channelSupportsHashtags(publishTextDraft.channel || null) && (
              <label className={styles.mailTextField}>
                <span>Hashtags</span>
                <input
                  value={publishTextDraft.hashtags}
                  onChange={(event) =>
                    setPublishTextDraft((current) => ({
                      ...current,
                      hashtags: event.target.value,
                    }))
                  }
                  maxLength={280}
                  placeholder="#communication #local"
                />
              </label>
            )}
            <p className={styles.campaignEditHint}>
              La modification s’applique uniquement au canal sélectionné dans
              iNr’Agent.
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                onClick={() => setPublishEditOpen(false)}
                disabled={publishSaveState === "saving"}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={savePublishText}
                disabled={publishSaveState === "saving"}
              >
                {publishSaveState === "saving"
                  ? "Enregistrement..."
                  : "Enregistrer"}
              </button>
            </div>
          </section>
        </div>
      )}

      {campaignDraftConfirmOpen && (campaignMailPreview || isPublishView) && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => {
            if (campaignDraftSaveState !== "saving")
              setCampaignDraftConfirmOpen(false);
          }}
        >
          <section
            className={`${styles.settingsModal} ${styles.campaignDraftModal}`}
            role="dialog"
            aria-modal="true"
            aria-label={isPublishView ? "Enregistrer la publication en brouillon" : "Enregistrer la campagne en brouillon"}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setCampaignDraftConfirmOpen(false)}
              aria-label="Fermer"
              disabled={campaignDraftSaveState === "saving"}
            >
              ×
            </button>
            <p className={styles.modalEyebrow}>Brouillon iNrSend</p>
            <h2>{isPublishView ? "Enregistrer cette publication ?" : "Enregistrer cette campagne ?"}</h2>
            <div className={styles.campaignDraftNotice}>
              <span aria-hidden>💾</span>
              <div>
                <strong>
                  {isPublishView
                    ? "La publication va être enregistrée en brouillon dans iNrSend."
                    : "La campagne va être enregistrée en brouillon dans iNrSend."}
                </strong>
                <p>
                  {isPublishView
                    ? "Vous pourrez la retrouver plus tard dans iNrSend, puis la réouvrir dans Publier pour la modifier ou la publier. Elle ne sera pas publiée maintenant."
                    : `Vous pourrez la retrouver plus tard, puis la rééditer directement dans${selected.key === "loyalty" ? " Fidéliser" : " Propulser"}. Elle ne sera pas envoyée maintenant.`}
                </p>
              </div>
            </div>
            <div className={styles.campaignDraftSummary}>
              {isPublishView ? (
                <>
                  <small>Canaux</small>
                  <strong>
                    {(displayChannels.length ? displayChannels : selectedConfigChannels)
                      .map((channel) => channelOptions[channel]?.name || channel)
                      .join(" / ") || "—"}
                  </strong>
                  <small>Contenu</small>
                  <strong>{publishContentKind || "Publication"}</strong>
                </>
              ) : (
                <>
                  <small>Objet</small>
                  <strong>{campaignMailPreview?.subject || "—"}</strong>
                  <small>Destinataires prévus</small>
                  <strong>
                    {campaignMailPreview?.recipientsCount || 0} contact
                    {(campaignMailPreview?.recipientsCount || 0) > 1 ? "s" : ""}
                  </strong>
                </>
              )}
            </div>
            <div className={styles.modalActions}>
              <button
                type="button"
                onClick={() => setCampaignDraftConfirmOpen(false)}
                disabled={campaignDraftSaveState === "saving"}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={isPublishView ? savePublishAsDraft : saveCampaignAsDraft}
                disabled={campaignDraftSaveState === "saving"}
              >
                {campaignDraftSaveState === "saving"
                  ? "Enregistrement..."
                  : "Enregistrer en brouillon"}
              </button>
            </div>
          </section>
        </div>
      )}

      {campaignEditOpen && campaignMailPreview && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setCampaignEditOpen(false)}
        >
          <section
            className={`${styles.settingsModal} ${styles.campaignEditModal}`}
            role="dialog"
            aria-modal="true"
            aria-label="Modifier la campagne"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setCampaignEditOpen(false)}
              aria-label="Fermer"
            >
              ×
            </button>
            <p className={styles.modalEyebrow}>Campagne iNr’Agent</p>
            <h2>Modifier la campagne</h2>
            <div className={styles.campaignEditGrid}>
              <button type="button" onClick={openMailTextEditor}>
                <strong>Texte du mail</strong>
                <small>Modifier l’objet et le corps du message.</small>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCampaignEditOpen(false);
                  setAttachmentPreviewOpen(true);
                }}
              >
                <strong>Pièce jointe</strong>
                <small>
                  {campaignAttachments.length > 0
                    ? `${campaignAttachments.length} fichier${campaignAttachments.length > 1 ? "s" : ""}`
                    : "Ajouter ou remplacer un fichier."}
                </small>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCampaignEditOpen(false);
                  setRecipientsPreviewOpen(true);
                }}
              >
                <strong>Destinataires CRM</strong>
                <small>
                  {campaignMailPreview.recipientsCount} contact
                  {campaignMailPreview.recipientsCount > 1 ? "s" : ""} prévu
                  {campaignMailPreview.recipientsCount > 1 ? "s" : ""}. Voir la
                  liste.
                </small>
              </button>
              <button type="button" onClick={openMailAccountEditor}>
                <strong>Boîte d’envoi</strong>
                <small>{campaignMailPreview.mailAccountLabel}</small>
              </button>
            </div>
          </section>
        </div>
      )}

      {mailTextEditOpen && campaignMailPreview && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setMailTextEditOpen(false)}
        >
          <section
            className={`${styles.settingsModal} ${styles.mailTextModal}`}
            role="dialog"
            aria-modal="true"
            aria-label="Modifier le texte du mail"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setMailTextEditOpen(false)}
              aria-label="Fermer"
            >
              ×
            </button>
            <p className={styles.modalEyebrow}>Aperçu du mail</p>
            <h2>Modifier le texte</h2>
            <label className={styles.mailTextField}>
              <span>Objet</span>
              <input
                value={campaignTextDraft.subject}
                onChange={(event) =>
                  setCampaignTextDraft((current) => ({
                    ...current,
                    subject: event.target.value,
                  }))
                }
                maxLength={220}
              />
            </label>
            <label className={styles.mailTextField}>
              <span>Corps du mail</span>
              <div
                className={styles.richTextToolbar}
                aria-label="Mise en forme du corps du mail"
              >
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyCampaignTextFormat("bold")}
                  title="Gras"
                >
                  <strong>B</strong>
                </button>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyCampaignTextFormat("italic")}
                  title="Italique"
                >
                  <em>I</em>
                </button>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyCampaignTextFormat("underline")}
                  title="Souligné"
                >
                  <span className={styles.underlineToolbarLabel}>U</span>
                </button>
              </div>
              <RichSiteContentEditor
                value={campaignTextDraft.body}
                onChange={(value) =>
                  setCampaignTextDraft((current) => ({
                    ...current,
                    body: value.slice(0, 6000),
                  }))
                }
                minHeight={250}
                editorRef={campaignBodyEditorRef}
                className={styles.richTextEditorSurface}
                style={AGENT_RICH_TEXT_EDITOR_STYLE}
              />
            </label>
            <div className={styles.modalActions}>
              <button type="button" onClick={() => setMailTextEditOpen(false)}>
                Annuler
              </button>
              <button
                type="button"
                onClick={saveCampaignText}
                disabled={campaignSaveState === "saving"}
              >
                {campaignSaveState === "saving"
                  ? "Enregistrement..."
                  : "Enregistrer"}
              </button>
            </div>
          </section>
        </div>
      )}

      {recipientsPreviewOpen && campaignMailPreview && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setRecipientsPreviewOpen(false)}
        >
          <section
            className={`${styles.settingsModal} ${styles.agentListModal}`}
            role="dialog"
            aria-modal="true"
            aria-label="Destinataires prévus"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setRecipientsPreviewOpen(false)}
              aria-label="Fermer"
            >
              ×
            </button>
            <p className={styles.modalEyebrow}>Destinataires</p>
            <h2>
              {campaignRecipients.length} contact
              {campaignRecipients.length > 1 ? "s" : ""} prévu
              {campaignRecipients.length > 1 ? "s" : ""}
            </h2>
            <div className={styles.agentListScroll}>
              {campaignRecipients.length > 0 ? (
                campaignRecipients.map((recipient) => (
                  <article
                    key={recipient.email}
                    className={`${styles.agentListRow} ${styles.agentRecipientRow}`}
                  >
                    <span className={styles.agentListContent}>
                      <strong className={styles.agentRecipientMain}>
                        <span>{recipientDisplayName(recipient)}</span>
                        <em>— {recipient.email}</em>
                      </strong>
                      <small>{recipientMetaLine(recipient)}</small>
                    </span>
                  </article>
                ))
              ) : (
                <p className={styles.campaignEditHint}>
                  Aucun destinataire n’est prévu pour cette campagne.
                </p>
              )}
            </div>
            <div className={styles.modalActions}>
              <button
                type="button"
                onClick={() => setRecipientsPreviewOpen(false)}
              >
                Fermer
              </button>
              <button type="button" onClick={openRecipientsEditor}>
                Modifier les destinataires
              </button>
            </div>
          </section>
        </div>
      )}

      {recipientsEditOpen && campaignMailPreview && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setRecipientsEditOpen(false)}
        >
          <section
            className={`${styles.settingsModal} ${styles.agentListModal} ${styles.recipientsPickerModal}`}
            role="dialog"
            aria-modal="true"
            aria-label="Modifier les destinataires"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setRecipientsEditOpen(false)}
              aria-label="Fermer"
            >
              ×
            </button>
            <h2>Choisir les destinataires</h2>

            <div className={styles.manualRecipientBox}>
              <div>
                <strong>Destinataires libres</strong>
                <small>
                  Saisissez une ou plusieurs adresses, séparées par un
                  point-virgule.
                </small>
              </div>
              <div className={styles.manualRecipientRow}>
                <input
                  value={manualRecipientsInput}
                  onChange={(event) =>
                    setManualRecipientsInput(event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addManualRecipientsFromInput();
                    }
                  }}
                  placeholder="email@exemple.fr; autre@exemple.fr"
                />
                <button type="button" onClick={addManualRecipientsFromInput}>
                  Ajouter
                </button>
              </div>
              {manualSelectedRecipientEmails.length > 0 && (
                <div className={styles.manualRecipientChips}>
                  {manualSelectedRecipientEmails.map((email) => (
                    <button
                      key={email}
                      type="button"
                      onClick={() => removeSelectedRecipient(email)}
                      title="Retirer ce destinataire"
                    >
                      {email} <span aria-hidden>×</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.agentPickerToolbar}>
              <input
                value={crmRecipientSearch}
                onChange={(event) => setCrmRecipientSearch(event.target.value)}
                placeholder="Rechercher un contact CRM..."
              />
              <button
                type="button"
                className={`${styles.agentToolbarButton} ${activeCrmRecipientFiltersCount > 0 ? styles.agentToolbarActiveButton : ""}`}
                onClick={() =>
                  setCrmRecipientFiltersOpen((current) => !current)
                }
              >
                Filtres
                {activeCrmRecipientFiltersCount > 0
                  ? ` (${activeCrmRecipientFiltersCount})`
                  : ""}
              </button>
              <button
                type="button"
                className={styles.agentToolbarButton}
                onClick={toggleFilteredCrmRecipients}
                disabled={
                  crmContactsLoading || filteredCrmContacts.length === 0
                }
                title={
                  filteredCrmAllSelected
                    ? "Désélectionner les contacts filtrés"
                    : "Sélectionner les contacts filtrés"
                }
              >
                {filteredCrmSelectionLabel}
              </button>
              <button
                type="button"
                className={styles.agentToolbarButton}
                onClick={() => setNewRecipientOpen((current) => !current)}
              >
                + Contact
              </button>
              <span className={styles.agentToolbarCount}>
                {filteredCrmContacts.length} contact
                {filteredCrmContacts.length > 1 ? "s" : ""}
              </span>
            </div>

            {crmRecipientFiltersOpen && (
              <div className={styles.agentFiltersPanel}>
                <label>
                  <span>Catégorie</span>
                  <select
                    value={crmRecipientCategory}
                    onChange={(event) =>
                      setCrmRecipientCategory(event.target.value)
                    }
                  >
                    <option value="all">Toutes</option>
                    <option value="particulier">Particuliers</option>
                    <option value="professionnel">Professionnels</option>
                    <option value="institution">Institutions</option>
                    <option value="collectivite_publique">Collectivités</option>
                  </select>
                </label>
                <label>
                  <span>Type</span>
                  <select
                    value={crmRecipientType}
                    onChange={(event) =>
                      setCrmRecipientType(event.target.value)
                    }
                  >
                    <option value="all">Tous</option>
                    <option value="client">Clients</option>
                    <option value="prospect">Prospects</option>
                    <option value="fournisseur">Fournisseurs</option>
                    <option value="partenaire">Partenaires</option>
                    <option value="autre">Autres</option>
                  </select>
                </label>
                <label>
                  <span>Département</span>
                  <input
                    value={crmRecipientDepartment}
                    onChange={(event) =>
                      setCrmRecipientDepartment(
                        sanitizeDepartmentFilter(event.target.value),
                      )
                    }
                    placeholder="62"
                    inputMode="text"
                    maxLength={3}
                  />
                </label>
                <button
                  type="button"
                  className={`${styles.agentImportantToggle} ${crmRecipientImportantOnly ? styles.agentImportantToggleActive : ""}`}
                  onClick={() =>
                    setCrmRecipientImportantOnly((current) => !current)
                  }
                  aria-pressed={crmRecipientImportantOnly}
                >
                  <span aria-hidden>
                    {crmRecipientImportantOnly ? "★" : "☆"}
                  </span>{" "}
                  Important uniquement
                </button>
              </div>
            )}

            {newRecipientOpen && (
              <div className={styles.newRecipientBox}>
                <input
                  value={newRecipientDraft.name}
                  onChange={(event) =>
                    setNewRecipientDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Nom / société"
                />
                <input
                  value={newRecipientDraft.email}
                  onChange={(event) =>
                    setNewRecipientDraft((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  placeholder="email@exemple.fr"
                />
                <button
                  type="button"
                  onClick={addNewRecipientToCrm}
                  disabled={newRecipientState === "saving"}
                >
                  {newRecipientState === "saving"
                    ? "Ajout..."
                    : "Ajouter au CRM"}
                </button>
              </div>
            )}

            <div className={styles.agentListScroll}>
              {crmContactsLoading ? (
                <p className={styles.campaignEditHint}>
                  Chargement des contacts CRM...
                </p>
              ) : filteredCrmContacts.length > 0 ? (
                filteredCrmContacts.map((contact) => {
                  const recipient = contactToCampaignRecipient(contact);
                  if (!recipient) return null;
                  const checked = selectedRecipientEmails.includes(
                    recipient.email.toLowerCase(),
                  );
                  return (
                    <label
                      key={contact.id}
                      className={`${styles.agentListRow} ${styles.agentSelectableRow} ${styles.agentRecipientRow} ${checked ? styles.agentSelectedRow : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          toggleRecipientSelection(recipient.email)
                        }
                      />
                      <span className={styles.agentListContent}>
                        <strong className={styles.agentRecipientMain}>
                          <span>
                            {contactDisplayName(contact)}
                            {contact.important ? (
                              <span className={styles.agentImportantMark}>
                                ★
                              </span>
                            ) : null}
                          </span>
                          <em>— {recipient.email}</em>
                        </strong>
                        <small>{contactMetaLine(contact)}</small>
                      </span>
                    </label>
                  );
                })
              ) : (
                <p className={styles.campaignEditHint}>
                  Aucun contact CRM avec email ne correspond à cette recherche.
                </p>
              )}
            </div>
            <div className={styles.modalActions}>
              <button
                type="button"
                onClick={() => setRecipientsEditOpen(false)}
                disabled={campaignSaveState === "saving"}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={saveCampaignRecipients}
                disabled={campaignSaveState === "saving"}
              >
                {campaignSaveState === "saving"
                  ? "Enregistrement..."
                  : `Valider ${selectedRecipientEmails.length + parseRecipientEmails(manualRecipientsInput).filter((email) => !selectedRecipientEmails.includes(email)).length} contact${selectedRecipientEmails.length + parseRecipientEmails(manualRecipientsInput).filter((email) => !selectedRecipientEmails.includes(email)).length > 1 ? "s" : ""}`}
              </button>
            </div>
          </section>
        </div>
      )}

      {mailAccountEditOpen && campaignMailPreview && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setMailAccountEditOpen(false)}
        >
          <section
            className={`${styles.settingsModal} ${styles.agentListModal}`}
            role="dialog"
            aria-modal="true"
            aria-label="Modifier la boîte d’envoi"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setMailAccountEditOpen(false)}
              aria-label="Fermer"
            >
              ×
            </button>
            <p className={styles.modalEyebrow}>Boîte d’envoi</p>
            <h2>Choisir la boîte mail</h2>
            <div className={styles.agentListScroll}>
              {mailAccountsLoading ? (
                <p className={styles.campaignEditHint}>
                  Chargement des boîtes connectées...
                </p>
              ) : mailAccounts.length > 0 ? (
                mailAccounts.map((account) => {
                  const usable =
                    account.status === "connected" &&
                    account.connection_status !== "needs_update" &&
                    !account.requires_update;
                  return (
                    <label
                      key={account.id}
                      className={`${styles.agentListRow} ${styles.agentSelectableRow} ${!usable ? styles.agentDisabledRow : ""}`}
                    >
                      <input
                        type="radio"
                        name="agent-mail-account"
                        checked={selectedMailAccountId === account.id}
                        disabled={!usable}
                        onChange={() => setSelectedMailAccountId(account.id)}
                      />
                      <span className={styles.agentListAvatar} aria-hidden>
                        ✉
                      </span>
                      <span className={styles.agentListContent}>
                        <strong>{mailAccountLabel(account)}</strong>
                        <small>
                          {mailAccountSecondaryLabel(account)}
                          {usable ? " · connectée" : " · à reconnecter"}
                        </small>
                      </span>
                      <span className={styles.agentListTag}>
                        {usable ? "OK" : "À corriger"}
                      </span>
                    </label>
                  );
                })
              ) : (
                <p className={styles.campaignEditHint}>
                  Aucune boîte mail connectée. Connecte une boîte dans iNrSend
                  avant validation.
                </p>
              )}
            </div>
            <div className={styles.modalActions}>
              <button
                type="button"
                onClick={() => setMailAccountEditOpen(false)}
                disabled={campaignSaveState === "saving"}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={saveCampaignMailAccount}
                disabled={
                  campaignSaveState === "saving" || !selectedMailAccountId
                }
              >
                {campaignSaveState === "saving"
                  ? "Enregistrement..."
                  : "Utiliser cette boîte"}
              </button>
            </div>
          </section>
        </div>
      )}

      {attachmentPreviewOpen && campaignMailPreview && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setAttachmentPreviewOpen(false)}
        >
          <section
            className={`${styles.settingsModal} ${styles.attachmentModal}`}
            role="dialog"
            aria-modal="true"
            aria-label="Pièce jointe"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setAttachmentPreviewOpen(false)}
              aria-label="Fermer"
            >
              ×
            </button>
            <p className={styles.modalEyebrow}>Pièce jointe</p>
            <h2>
              {campaignAttachments.length > 0
                ? "Pièces jointes"
                : "Ajouter une pièce jointe"}
            </h2>
            <div className={styles.attachmentUploadBox}>
              <input
                id="agent-campaign-attachment"
                type="file"
                multiple
                onChange={(event) => {
                  void uploadCampaignAttachment(event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
                disabled={attachmentUploadState === "saving"}
              />
              <div className={styles.campaignAttachmentActionButtons}>
                <label htmlFor="agent-campaign-attachment">
                  <span aria-hidden>📎</span>
                  {attachmentUploadState === "saving"
                    ? "Préparation..."
                    : "Joindre"}
                </label>
                <button
                  type="button"
                  onClick={() => setCampaignMediaLibraryPickerOpen(true)}
                  disabled={attachmentUploadState === "saving"}
                >
                  <span aria-hidden>🖼️</span>
                  Médiathèque
                </button>
              </div>
              <small>
                Les fichiers seront joints à la campagne au moment de la
                validation.
              </small>
            </div>

            <MediaLibraryPickerModal
              open={campaignMediaLibraryPickerOpen}
              title="Joindre depuis la Médiathèque"
              subtitle="Ajouter un média"
              accept="all"
              multiple
              maxSelection={10}
              confirmLabel="Joindre"
              selectedHint="Choisissez les médias à joindre à la campagne."
              onClose={() => setCampaignMediaLibraryPickerOpen(false)}
              onConfirm={(items) =>
                addCampaignAttachmentsFromMediaLibrary(items)
              }
            />
            {campaignAttachments.length > 0 ? (
              <div className={styles.attachmentList}>
                {campaignAttachments.map((attachment) => (
                  <div
                    key={`${attachment.bucket}-${attachment.path}`}
                    className={styles.attachmentListRow}
                  >
                    <span aria-hidden>📄</span>
                    <strong>{attachment.name}</strong>
                    <small>
                      {attachment.type || "Document"}
                      {attachment.size
                        ? ` · ${formatAttachmentSize(attachment.size)}`
                        : ""}
                    </small>
                    <button
                      type="button"
                      onClick={() => removeCampaignAttachment(attachment.path)}
                      disabled={attachmentUploadState === "saving"}
                    >
                      Supprimer
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.campaignEditHint}>
                Aucune pièce jointe n’est prévue pour cette campagne.
              </p>
            )}
          </section>
        </div>
      )}

      {publishMediaPreviewOpen && isPublishView && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => {
            if (publishMediaUploadState !== "saving")
              setPublishMediaPreviewOpen(false);
          }}
        >
          <section
            className={`${styles.settingsModal} ${styles.publishMediaModal}`}
            role="dialog"
            aria-modal="true"
            aria-label="Média de la publication"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setPublishMediaPreviewOpen(false)}
              aria-label="Fermer"
              disabled={publishMediaUploadState === "saving"}
            >
              ×
            </button>
            <div className={styles.publishMediaModalHeader}>
              <div>
                <p className={styles.modalEyebrow}>Média iNr’Agent</p>
                <h2>Gérer le média {activePreviewChannelLabel}</h2>
                <span>
                  Choisissez, remplacez ou préparez le média avant validation.
                </span>
              </div>
              <div
                className={`${styles.publishMediaStatusPill} ${
                  publishMediaPreview?.statusTone === "blocked"
                    ? styles.publishMediaStatusBlocked
                    : publishMediaPreview?.statusTone === "warning"
                      ? styles.publishMediaStatusWarning
                      : publishMediaPreview?.statusTone === "ready"
                        ? styles.publishMediaStatusReady
                        : ""
                }`}
              >
                {publishMediaPreview?.statusLabel || "—"}
              </div>
            </div>

            <div className={styles.publishMediaHero}>
              <div className={styles.publishMediaVisual}>
                {publishMediaPreview?.url ? (
                  publishMediaPreview.kind === "video" ? (
                    <video
                      src={publishMediaPreview.url}
                      controls
                      preload="metadata"
                    />
                  ) : (
                    <img
                      src={publishMediaPreview.url}
                      alt={publishMediaPreview.name || "Média de publication"}
                    />
                  )
                ) : (
                  <div className={styles.publishMediaEmpty}>
                    <span aria-hidden>🖼️</span>
                    <strong>Aucun média sélectionné</strong>
                  </div>
                )}
              </div>
              <div className={styles.publishMediaCurrentText}>
                <span className={styles.publishMediaTypeChip}>
                  {publishMediaPreview?.typeLabel || "Média"}
                </span>
                <strong>{publishMediaPreview?.name || "Aucun média"}</strong>
                <small>
                  {publishMediaPreview?.note ||
                    "Ajoutez une image ou une vidéo depuis la Médiathèque."}
                </small>
                {publishMediaAdaptationPreview?.userEditable &&
                publishMediaPreview?.url ? (
                  <button
                    type="button"
                    className={styles.publishMediaRetouchButton}
                    onClick={openPublishMediaAdapterPreview}
                    disabled={publishMediaUploadState === "saving"}
                  >
                    <span aria-hidden>{publishMediaRetouchIcon}</span>
                    {publishMediaRetouchLabel}
                  </button>
                ) : (
                  <div className={styles.publishMediaRetouchHint}>
                    <span aria-hidden>✨</span>
                    Ajoutez un média pour pouvoir l’adapter.
                  </div>
                )}
              </div>
            </div>

            <div className={styles.publishMediaAdaptationBox}>
              <div>
                <strong>Adaptation du canal</strong>
                <span>
                  {publishMediaAdaptationPreview?.note ||
                    "iNrAgent préparera le média selon les règles du canal."}
                </span>
              </div>
              <small>
                Utilisez l’outil d’adaptation iNrCy pour ajuster ce média au
                canal sélectionné, sans recréer de nouveau système.
              </small>
            </div>

            <div className={styles.publishMediaSourcePanel}>
              <div className={styles.publishMediaSourceHeader}>
                <strong>Ajouter ou remplacer</strong>
                <span>1 média utilisé pour toute la publication iNrAgent.</span>
              </div>
              <input
                id="agent-publish-media-image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  void uploadPublishMedia(event.currentTarget.files?.[0]);
                  event.currentTarget.value = "";
                }}
                disabled={publishMediaUploadState === "saving"}
              />
              <input
                id="agent-publish-media-video"
                type="file"
                accept="video/mp4,video/webm,video/quicktime,video/x-m4v"
                onChange={(event) => {
                  void uploadPublishMedia(event.currentTarget.files?.[0]);
                  event.currentTarget.value = "";
                }}
                disabled={publishMediaUploadState === "saving"}
              />
              <input
                id="agent-publish-media-camera"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => {
                  void uploadPublishMedia(event.currentTarget.files?.[0]);
                  event.currentTarget.value = "";
                }}
                disabled={!isMobileHeader || publishMediaUploadState === "saving"}
              />
              <div className={styles.publishMediaActionButtons}>
                <label htmlFor="agent-publish-media-image">
                  <span aria-hidden>🖼️</span>
                  <strong>Ajouter une image</strong>
                  <small>JPG, PNG ou WebP</small>
                </label>
                <label htmlFor="agent-publish-media-video">
                  <span aria-hidden>🎬</span>
                  <strong>Ajouter une vidéo</strong>
                  <small>MP4, WebM ou MOV</small>
                </label>
                <button
                  type="button"
                  onClick={() => setPublishMediaLibraryPickerOpen(true)}
                  disabled={publishMediaUploadState === "saving"}
                >
                  <span aria-hidden>🗂️</span>
                  <strong>Médiathèque</strong>
                  <small>Choisir un média existant</small>
                </button>
                <label
                  htmlFor={isMobileHeader ? "agent-publish-media-camera" : undefined}
                  aria-disabled={!isMobileHeader || publishMediaUploadState === "saving"}
                  title={isMobileHeader ? "Prendre une photo dans iNrCy" : "Disponible sur mobile"}
                  onClick={(event) => {
                    if (!isMobileHeader) event.preventDefault();
                  }}
                >
                  <span aria-hidden>📷</span>
                  <strong>Prendre une photo</strong>
                  <small>{isMobileHeader ? "Depuis mobile" : "Disponible sur mobile"}</small>
                </label>
              </div>
              <small className={styles.publishMediaSourceNote}>
                Image jusqu’à {INR_MEDIA_IMAGE_MAX_MB_LABEL} ou vidéo jusqu’à{" "}
                {INR_MEDIA_VIDEO_SOURCE_MAX_MB_LABEL}.
              </small>
            </div>

            <MediaLibraryPickerModal
              open={publishMediaLibraryPickerOpen}
              title="Ajouter depuis la Médiathèque"
              subtitle="Ajouter un média"
              accept={activePreviewChannel === "youtube" ? "video" : "all"}
              multiple={false}
              maxSelection={1}
              confirmLabel="Utiliser ce média"
              selectedHint="Choisissez un média pour iNrAgent."
              onClose={() => setPublishMediaLibraryPickerOpen(false)}
              onConfirm={(items) => selectPublishMediaFromPicker(items)}
            />

            <div className={styles.modalActions}>
              <button
                type="button"
                onClick={() => setPublishMediaPreviewOpen(false)}
                disabled={publishMediaUploadState === "saving"}
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={removePublishMedia}
                disabled={
                  publishMediaUploadState === "saving" ||
                  !publishMediaPreview?.url
                }
              >
                Supprimer le média
              </button>
            </div>
          </section>
        </div>
      )}

      {publishImageAdapterOpen && (
        <ChannelImageAdapterModal
          open={publishImageAdapterOpen}
          title={`Adapter le média ${activePreviewChannelLabel}`}
          subtitle={`${activePreviewChannelLabel} • ${publishImageAdapterPreset.width}×${publishImageAdapterPreset.height}`}
          aspectRatio={publishImageAdapterAspectRatio}
          backgroundMode={publishImageAdapterBackgroundMode}
          backgroundColor={publishImageAdapterBackgroundColor}
          fitLabel={
            publishImageAdapterTransformSafe.fit === "cover"
              ? "Remplir"
              : "Adapter"
          }
          zoomLabel={`zoom ${publishImageAdapterEffectiveZoom.toFixed(2)}×`}
          previewSrc={publishImageAdapterPreviewUrl}
          previewLayout={publishImageAdapterPreviewLayout}
          isDragging={publishImageAdapterDragging}
          onClose={closePublishImageAdapter}
          onWheel={handlePublishImageAdapterWheel}
          onPointerDown={handlePublishImageAdapterPointerDown}
          onPointerMove={handlePublishImageAdapterPointerMove}
          onPointerUp={endPublishImageAdapterDrag}
          onPointerCancel={endPublishImageAdapterDrag}
          onDoubleClick={() =>
            updatePublishImageAdapterTransform({ offsetX: 0, offsetY: 0 })
          }
          previewRef={publishImageAdapterStageRef}
          buttonClassName=""
          primaryButtonClassName=""
          onZoomOut={() =>
            updatePublishImageAdapterTransform({
              zoom: clampNumber(
                publishImageAdapterEffectiveZoom - 0.08,
                0.4,
                publishImageAdapterTransformSafe.fit === "cover" ? 3 : 1,
              ),
            })
          }
          onZoomIn={() =>
            updatePublishImageAdapterTransform({
              zoom: clampNumber(
                publishImageAdapterEffectiveZoom + 0.08,
                0.4,
                publishImageAdapterTransformSafe.fit === "cover" ? 3 : 1,
              ),
            })
          }
          onContain={() =>
            updatePublishImageAdapterTransform({
              fit: "contain",
              zoom: 1,
              offsetX: 0,
              offsetY: 0,
              backgroundMode: "color",
              backgroundColor: "#ffffff",
              blurBackground: false,
            })
          }
          onCover={() =>
            updatePublishImageAdapterTransform({
              fit: "cover",
              backgroundMode: "black",
              blurBackground: false,
            })
          }
          onReset={() => {
            const nextTransform = getOptimizedTransform(
              publishBoosterChannel,
              publishImageAdapterMeta || undefined,
            );
            setPublishImageAdapterTransform(nextTransform);
          }}
          onSave={savePublishImageAdapter}
          isolationNote="Ce réglage utilise l’outil Adapter image existant de Booster et remplacera le média iNrAgent par la version adaptée."
          onBackgroundModeChange={(mode) =>
            updatePublishImageAdapterTransform(
              mode === "transparent"
                ? {
                    backgroundMode: "transparent",
                    blurBackground: false,
                    fit: "contain",
                    zoom: 1,
                    offsetX: 0,
                    offsetY: 0,
                  }
                : {
                    backgroundMode: "color",
                    backgroundColor:
                      publishImageAdapterTransformSafe.backgroundColor ||
                      "#ffffff",
                    blurBackground: false,
                    fit: "contain",
                    zoom: 1,
                    offsetX: 0,
                    offsetY: 0,
                  },
            )
          }
          onBackgroundColorChange={(color) =>
            updatePublishImageAdapterTransform({
              backgroundMode: "color",
              backgroundColor: color,
              blurBackground: false,
              fit: "contain",
              zoom: 1,
              offsetX: 0,
              offsetY: 0,
            })
          }
          pillButtonStyle={{}}
          pillButtonActiveStyle={{}}
        />
      )}

      {publishVideoAdapterOpen && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => {
            if (!publishVideoAdapterSaving) setPublishVideoAdapterOpen(false);
          }}
        >
          <section
            className={`${styles.settingsModal} ${styles.publishVideoAdapterModal}`}
            role="dialog"
            aria-modal="true"
            aria-label="Adapter la vidéo iNrAgent"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setPublishVideoAdapterOpen(false)}
              aria-label="Fermer"
              disabled={publishVideoAdapterSaving}
            >
              ×
            </button>
            <div className={styles.publishMediaModalHeader}>
              <div>
                <p className={styles.modalEyebrow}>Adapter vidéo</p>
                <h2>{activePreviewChannelLabel}</h2>
                <span>
                  Outil Booster existant : choisissez le format puis
                  appliquez-le au média iNrAgent.
                </span>
              </div>
            </div>
            <BoosterVideoFormatManager
              isMobile={isMobileHeader}
              channel={publishBoosterChannel}
              videoName={publishMediaPreview?.name || "Vidéo iNrAgent"}
              videoDisplayUrl={publishMediaPreview?.url || ""}
              videoSize={Number(currentPublishMediaRecord?.size || 0) || null}
              videoDurationSeconds={
                Number(
                  currentPublishMediaRecord?.duration ||
                    currentPublishMediaRecord?.duration_seconds ||
                    0,
                ) || null
              }
              videoSourceMetadata={
                (asRecord(currentPublishMediaRecord?.sourceMetadata) ||
                  null) as BoosterVideoSourceMetadata | null
              }
              currentFormat={publishVideoFormat}
              adaptationMode={publishVideoAdaptationMode}
              videoTransformedVariants={
                Array.isArray(currentPublishMediaRecord?.transformedVariants)
                  ? (currentPublishMediaRecord?.transformedVariants as BoosterVideoTransformedVariant[])
                  : []
              }
              preparationState={publishVideoPreparationState}
              preparing={publishVideoAdapterSaving}
              onFormatChange={(format) => setPublishVideoFormat(format)}
              onAdaptationModeChange={(mode) =>
                setPublishVideoAdaptationMode(mode)
              }
              onApplyFormat={savePublishVideoAdapter}
              showApplyAll={false}
              buttonClassName={styles.agentToolbarButton}
              compact
            />
            <div className={styles.modalActions}>
              <button
                type="button"
                onClick={() => setPublishVideoAdapterOpen(false)}
                disabled={publishVideoAdapterSaving}
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={savePublishVideoAdapter}
                disabled={
                  publishVideoAdapterSaving || !publishMediaPreview?.url
                }
              >
                Enregistrer l’adaptation
              </button>
            </div>
          </section>
        </div>
      )}

      {scheduleOpen && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setScheduleOpen(false)}
        >
          <section
            className={`${styles.settingsModal} ${styles.scheduleModal}`}
            role="dialog"
            aria-modal="true"
            aria-label="Actions programmées"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.scheduleModalHeader}>
              <div className={styles.scheduleModalTitle}>
                <p className={styles.modalEyebrow}>Programmation</p>
                <h2>Actions programmées</h2>
              </div>
              <div className={styles.scheduleModalHeaderActions}>
                <div
                  className={styles.scheduleSummaryPill}
                  aria-label={`${upcomingScheduleItems.length} actions à venir`}
                >
                  <strong>{upcomingScheduleItems.length}</strong>
                  <span>actions à venir</span>
                </div>
                <button
                  type="button"
                  className={styles.scheduleCloseButton}
                  onClick={() => setScheduleOpen(false)}
                >
                  Fermer
                </button>
              </div>
            </div>

            <section className={styles.scheduleSection}>
              <div className={styles.scheduleSectionHeader}>
                <strong>Actions à venir</strong>
                <span>Ordre chronologique</span>
              </div>
              {upcomingScheduleItems.length > 0 ? (
                <div
                  className={styles.scheduleTable}
                  role="table"
                  aria-label="Actions programmées à venir"
                >
                  <div className={styles.scheduleTableHeader} role="row">
                    <span>Date</span>
                    <span>Heure</span>
                    <span>Action</span>
                    <span>Type</span>
                    <span>Canal</span>
                    <span>Origine</span>
                    <span>Actions</span>
                  </div>
                  {upcomingScheduleItems.map((item) => (
                    <div
                      key={item.id}
                      className={styles.scheduleTableRow}
                      data-status={item.statusKey}
                      role="row"
                    >
                      <span>{item.date}</span>
                      <span>{item.time}</span>
                      <span
                        className={styles.scheduleActionCell}
                        title={item.action}
                      >
                        {item.action}
                      </span>
                      <span>{item.typeLabel}</span>
                      <span>{item.channelLabel}</span>
                      <span>{item.originLabel}</span>
                      <span className={styles.scheduleActionsCell}>
                        <button
                          type="button"
                          className={styles.scheduleIconButton}
                          onClick={() => void handleScheduleRowModify(item)}
                          disabled={
                            !item.editable || scheduleMutationState === "saving"
                          }
                          aria-label="Modifier"
                          title="Modifier"
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className={`${styles.scheduleIconButton} ${styles.scheduleIconDanger}`}
                          onClick={() => void handleScheduleRowDelete(item)}
                          disabled={
                            !item.removable ||
                            scheduleMutationState === "saving"
                          }
                          aria-label="Supprimer"
                          title="Supprimer"
                        >
                          🗑
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.scheduleEmpty}>
                  Aucune action programmée à venir.
                </p>
              )}
            </section>
          </section>
        </div>
      )}

      {scheduleEditAction && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() =>
            scheduleMutationState !== "saving" && setScheduleEditAction(null)
          }
        >
          <section
            className={`${styles.settingsModal} ${styles.scheduleEditModal}`}
            role="dialog"
            aria-modal="true"
            aria-label="Modifier l’action programmée"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setScheduleEditAction(null)}
              disabled={scheduleMutationState === "saving"}
              aria-label="Fermer"
            >
              ×
            </button>
            <p className={styles.modalEyebrow}>Programmation</p>
            <h2>Modifier l’action</h2>
            <p className={styles.modalHint}>
              Changez uniquement la date et l’heure. iNr’Agent exécutera
              l’action au nouveau créneau.
            </p>
            <div className={styles.modalGrid}>
              <label>
                <span>Date</span>
                <div
                  className={styles.nativeDateTimeField}
                  data-disabled={scheduleMutationState === "saving" ? "true" : "false"}
                  onClick={() =>
                    openNativeDateTimePicker(scheduleEditDateInputRef.current)
                  }
                >
                  <input
                    ref={scheduleEditDateInputRef}
                    className={styles.nativeDateTimeInput}
                    type="date"
                    value={scheduleEditDate}
                    disabled={scheduleMutationState === "saving"}
                    onChange={(event) => setScheduleEditDate(event.target.value)}
                  />
                  <button
                    type="button"
                    className={styles.nativeDateTimePickerButton}
                    onClick={(event) => {
                      event.stopPropagation();
                      openNativeDateTimePicker(scheduleEditDateInputRef.current);
                    }}
                    disabled={scheduleMutationState === "saving"}
                    aria-label="Ouvrir le calendrier"
                  >
                    <CalendarMiniIcon />
                  </button>
                </div>
              </label>
              <label>
                <span>Heure</span>
                <div
                  className={styles.nativeDateTimeField}
                  data-disabled={scheduleMutationState === "saving" ? "true" : "false"}
                  onClick={() =>
                    openNativeDateTimePicker(scheduleEditTimeInputRef.current)
                  }
                >
                  <input
                    ref={scheduleEditTimeInputRef}
                    className={styles.nativeDateTimeInput}
                    type="time"
                    value={scheduleEditTime}
                    disabled={scheduleMutationState === "saving"}
                    onChange={(event) => setScheduleEditTime(event.target.value)}
                  />
                  <button
                    type="button"
                    className={styles.nativeDateTimePickerButton}
                    onClick={(event) => {
                      event.stopPropagation();
                      openNativeDateTimePicker(scheduleEditTimeInputRef.current);
                    }}
                    disabled={scheduleMutationState === "saving"}
                    aria-label="Ouvrir le choix de l’heure"
                  >
                    <ClockMiniIcon />
                  </button>
                </div>
              </label>
            </div>
            <div className={styles.modalActionButtonRow}>
              <button
                type="button"
                className={styles.modalActionSecondaryButton}
                onClick={() => setScheduleEditAction(null)}
                disabled={scheduleMutationState === "saving"}
              >
                Annuler
              </button>
              <button
                type="button"
                className={styles.modalActionButton}
                onClick={() => void confirmScheduleEdit()}
                disabled={scheduleMutationState === "saving"}
              >
                {scheduleMutationState === "saving"
                  ? "Enregistrement..."
                  : "Enregistrer"}
              </button>
            </div>
          </section>
        </div>
      )}

      {validationChoiceOpen && selectedPreparedAction && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() =>
            actionMutationState !== "saving" && setValidationChoiceOpen(false)
          }
        >
          <section
            className={`${styles.settingsModal} ${styles.validationChoiceModal}`}
            role="dialog"
            aria-modal="true"
            aria-label="Valider l’action iNr’Agent"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setValidationChoiceOpen(false)}
              disabled={actionMutationState === "saving"}
              aria-label="Fermer"
            >
              ×
            </button>
            <p className={styles.modalEyebrow}>Validation</p>
            <h2>
              {selectedPreparedAction.automationKey === "publish"
                ? "Publier cette action ?"
                : "Envoyer cette campagne ?"}
            </h2>
            <p className={styles.modalHint}>
              L’action est prête. Vous pouvez la lancer maintenant ou la
              programmer pour qu’iNr’Agent s’en occupe plus tard.
            </p>
            <div className={styles.validationChoiceGrid}>
              <button
                type="button"
                className={styles.validationChoiceCard}
                onClick={() => void updateActionStatus("validated")}
                disabled={actionMutationState === "saving"}
              >
                <span aria-hidden>⚡</span>
                <strong>
                  {selectedPreparedAction.automationKey === "publish"
                    ? "Publier maintenant"
                    : "Envoyer maintenant"}
                </strong>
                <small>iNr’Agent exécute l’action immédiatement.</small>
              </button>
              <button
                type="button"
                className={styles.validationChoiceCard}
                onClick={openValidationScheduleModal}
                disabled={actionMutationState === "saving"}
              >
                <span aria-hidden>🕒</span>
                <strong>
                  {selectedPreparedAction.automationKey === "publish"
                    ? "Programmer la publication"
                    : "Programmer l’envoi"}
                </strong>
                <small>Choisissez une date et une heure d’exécution.</small>
              </button>
            </div>
          </section>
        </div>
      )}

      {validationScheduleOpen && selectedPreparedAction && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() =>
            validationScheduleState !== "saving" &&
            setValidationScheduleOpen(false)
          }
        >
          <section
            className={`${styles.settingsModal} ${styles.scheduleEditModal}`}
            role="dialog"
            aria-modal="true"
            aria-label="Programmer l’action iNr’Agent"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setValidationScheduleOpen(false)}
              disabled={validationScheduleState === "saving"}
              aria-label="Fermer"
            >
              ×
            </button>
            <p className={styles.modalEyebrow}>Programmation</p>
            <h2>
              {selectedPreparedAction.automationKey === "publish"
                ? "Programmer la publication"
                : "Programmer l’envoi"}
            </h2>
            <p className={styles.modalHint}>
              iNr’Agent exécutera cette action automatiquement au créneau
              choisi.
            </p>
            <div className={styles.modalGrid}>
              <label>
                <span>Date</span>
                <div
                  className={styles.nativeDateTimeField}
                  data-disabled={validationScheduleState === "saving" ? "true" : "false"}
                  onClick={() =>
                    openNativeDateTimePicker(
                      validationScheduleDateInputRef.current,
                    )
                  }
                >
                  <input
                    ref={validationScheduleDateInputRef}
                    className={styles.nativeDateTimeInput}
                    type="date"
                    value={validationScheduleDate}
                    disabled={validationScheduleState === "saving"}
                    onChange={(event) =>
                      setValidationScheduleDate(event.target.value)
                    }
                  />
                  <button
                    type="button"
                    className={styles.nativeDateTimePickerButton}
                    onClick={(event) => {
                      event.stopPropagation();
                      openNativeDateTimePicker(
                        validationScheduleDateInputRef.current,
                      );
                    }}
                    disabled={validationScheduleState === "saving"}
                    aria-label="Ouvrir le calendrier"
                  >
                    <CalendarMiniIcon />
                  </button>
                </div>
              </label>
              <label>
                <span>Heure</span>
                <div
                  className={styles.nativeDateTimeField}
                  data-disabled={validationScheduleState === "saving" ? "true" : "false"}
                  onClick={() =>
                    openNativeDateTimePicker(
                      validationScheduleTimeInputRef.current,
                    )
                  }
                >
                  <input
                    ref={validationScheduleTimeInputRef}
                    className={styles.nativeDateTimeInput}
                    type="time"
                    value={validationScheduleTime}
                    disabled={validationScheduleState === "saving"}
                    onChange={(event) =>
                      setValidationScheduleTime(event.target.value)
                    }
                  />
                  <button
                    type="button"
                    className={styles.nativeDateTimePickerButton}
                    onClick={(event) => {
                      event.stopPropagation();
                      openNativeDateTimePicker(
                        validationScheduleTimeInputRef.current,
                      );
                    }}
                    disabled={validationScheduleState === "saving"}
                    aria-label="Ouvrir le choix de l’heure"
                  >
                    <ClockMiniIcon />
                  </button>
                </div>
              </label>
            </div>
            <div className={styles.modalActionButtonRow}>
              <button
                type="button"
                className={styles.modalActionSecondaryButton}
                onClick={() => setValidationScheduleOpen(false)}
                disabled={validationScheduleState === "saving"}
              >
                Annuler
              </button>
              <button
                type="button"
                className={styles.modalActionButton}
                onClick={() => void scheduleValidatedAction()}
                disabled={validationScheduleState === "saving"}
              >
                {validationScheduleState === "saving"
                  ? "Programmation..."
                  : "Confier à iNr’Agent"}
              </button>
            </div>
          </section>
        </div>
      )}

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
                  <strong>Publier</strong> prépare des publications avec Booster
                  / Publier sur vos canaux connectés. L’aperçu se consulte canal
                  par canal grâce au sélecteur situé sous la zone de
                  prévisualisation.
                </li>
                <li>
                  <strong>Propulser</strong> prépare des campagnes Propulser par
                  mail, basées sur vos contenus et templates.
                </li>
                <li>
                  <strong>Fidéliser</strong> prépare des campagnes Fidéliser par
                  mail pour garder le lien avec le CRM.
                </li>
                <li>
                  <strong>Statistiques</strong> génère un bilan iNr’Stats PDF
                  multi-pages et l’envoie automatiquement au pro selon les
                  réglages.
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
                  {settingsConnectedChannelMessage ||
                    (settingsConfig.enabled
                      ? "Le robot peut préparer cette action."
                      : "Cette automatisation est en pause.")}
                </small>
              </span>
              <input
                type="checkbox"
                checked={settingsConfig.enabled}
                disabled={settingsNoConnectedChannelBlock}
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
                    updateConfigFrequency(
                      settingsAutomation.key,
                      event.target.value,
                    )
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
              {settingsConfig.frequency === "2 fois par semaine" ? (
                normalizeConfigScheduleSlots(settingsConfig)
                  .slice(0, 2)
                  .map((slot, index) => (
                    <div
                      className={styles.scheduleSlotPair}
                      key={`${settingsAutomation.key}-slot-${index}`}
                    >
                      <label>
                        <span>Jour {index + 1}</span>
                        <select
                          value={slot.day}
                          onChange={(event) =>
                            updateConfigScheduleSlot(
                              settingsAutomation.key,
                              index,
                              {
                                day: event.target.value,
                              },
                            )
                          }
                        >
                          {weekDays.map((day) => (
                            <option key={day}>{day}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Horaire {index + 1}</span>
                        <select
                          value={slot.time}
                          onChange={(event) =>
                            updateConfigScheduleSlot(
                              settingsAutomation.key,
                              index,
                              {
                                time: event.target.value,
                              },
                            )
                          }
                        >
                          {hourOptions.map((hour) => (
                            <option key={hour}>{hour}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ))
              ) : (
                <>
                  <label>
                    <span>Jour</span>
                    <select
                      value={settingsConfig.day}
                      onChange={(event) =>
                        updateConfig(settingsAutomation.key, {
                          day: event.target.value,
                          scheduleSlots: [
                            {
                              day: event.target.value,
                              time: settingsConfig.time,
                            },
                            {
                              day: dayOffsetLabel(event.target.value, 3),
                              time: settingsConfig.time,
                            },
                          ],
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
                          scheduleSlots: [
                            {
                              day: settingsConfig.day,
                              time: event.target.value,
                            },
                            {
                              day: dayOffsetLabel(settingsConfig.day, 3),
                              time: event.target.value,
                            },
                          ],
                        })
                      }
                    >
                      {hourOptions.map((hour) => (
                        <option key={hour}>{hour}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
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

            {isCampaignAutomationKey(settingsAutomation.key) ? (
              <>
                <div className={styles.campaignSettingsPair}>
                  <div className={styles.modalSection}>
                    <span>Canal</span>
                    {settingsAvailableChannels.length > 0 ? (
                      <div className={styles.choiceGrid}>
                        {settingsAvailableChannels.map((channelKey) => {
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
                                    settingsAvailableChannels,
                                  ),
                                })
                              }
                            >
                              <img
                                src={channel.src}
                                alt=""
                                loading="eager"
                                decoding="async"
                              />
                              {channel.name}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className={styles.campaignEditHint}>
                        {connectedChannelsLoadState === "loading"
                          ? "Chargement des canaux connectés..."
                          : connectedChannelMessage(settingsAutomation)}
                      </p>
                    )}
                  </div>

                  <div className={styles.modalSection}>
                    <span>
                      {settingsAutomation.key === "grow"
                        ? "Rubriques Propulser"
                        : "Rubriques Fidéliser"}
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
                                themes: toggleItem(
                                  settingsConfig.themes,
                                  theme,
                                ),
                              })
                            }
                          >
                            {theme}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <label className={styles.signatureSwitchLine}>
                  <span>
                    <strong>Signature automatique</strong>
                    <small>
                      Activée par défaut pour ajouter la signature configurée au
                      moment de l’envoi.
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    checked={settingsConfig.signatureAutomatic}
                    onChange={(event) =>
                      updateConfig(settingsAutomation.key, {
                        signatureAutomatic: event.target.checked,
                      })
                    }
                  />
                </label>
              </>
            ) : (
              <>
                {settingsAutomation.availableChannels.length > 0 && (
                  <div className={styles.modalSection}>
                    <span>
                      {settingsAutomation.key === "publish"
                        ? "Canaux Booster / Publier"
                        : "Canal"}
                    </span>
                    {settingsAvailableChannels.length > 0 ? (
                      <div className={styles.choiceGrid}>
                        {settingsAvailableChannels.map((channelKey) => {
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
                                    settingsAvailableChannels,
                                  ),
                                })
                              }
                            >
                              <img
                                src={channel.src}
                                alt=""
                                loading="eager"
                                decoding="async"
                              />
                              {channel.name}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className={styles.campaignEditHint}>
                        {connectedChannelsLoadState === "loading"
                          ? "Chargement des canaux connectés..."
                          : connectedChannelMessage(settingsAutomation)}
                      </p>
                    )}
                  </div>
                )}

                <div className={styles.modalSection}>
                  <span>
                    {settingsAutomation.key === "stats"
                      ? "Rubriques iNr’Stats"
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
              </>
            )}

            <p className={styles.modalNote}>
              Source des idées : {settingsConfig.source}
            </p>
            {prepareProgress?.key === settingsAutomation.key && (
              <div
                className={styles.prepareProgressCard}
                role="status"
                aria-live="polite"
              >
                <div>
                  <strong>Préparation en cours</strong>
                  <span>{prepareProgress.label}</span>
                </div>
                <b>{prepareProgress.percent}%</b>
              </div>
            )}
            <div className={styles.modalActionRow}>
              <button
                type="button"
                className={styles.modalAction}
                onClick={saveSettings}
                disabled={
                  saveState === "saving" ||
                  loadState === "loading" ||
                  Boolean(testNowKey) ||
                  (settingsNoConnectedChannelBlock && settingsConfig.enabled)
                }
              >
                {saveState === "saving"
                  ? "Enregistrement..."
                  : "Enregistrer les réglages"}
              </button>
              <button
                type="button"
                className={`${styles.modalAction} ${styles.modalSecondaryAction}`}
                onClick={() => testAutomationNow(settingsAutomation.key)}
                disabled={
                  saveState === "saving" ||
                  loadState === "loading" ||
                  prepareActionState === "saving" ||
                  Boolean(testNowKey) ||
                  settingsNoConnectedChannelBlock
                }
              >
                {testNowKey === settingsAutomation.key ||
                prepareActionState === "saving"
                  ? settingsAutomation.key === "stats"
                    ? "Envoi du bilan..."
                    : prepareProgress?.key === settingsAutomation.key
                      ? "Préparation..."
                      : "Préparation..."
                  : settingsAutomation.key === "stats"
                    ? "Envoyer un bilan"
                    : "Préparer maintenant"}
              </button>
            </div>
          </section>
        </div>
      )}

      {prepareNowConfirm && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => {
            if (!testNowKey && prepareActionState !== "saving")
              setPrepareNowConfirm(null);
          }}
        >
          <section
            className={`${styles.settingsModal} ${styles.campaignDraftModal}`}
            role="dialog"
            aria-modal="true"
            aria-label="Préparer une nouvelle campagne"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setPrepareNowConfirm(null)}
              aria-label="Fermer"
              disabled={Boolean(testNowKey) || prepareActionState === "saving"}
            >
              ×
            </button>
            <p className={styles.modalEyebrow}>Campagne iNr’Agent</p>
            <h2>Préparer une nouvelle campagne ?</h2>
            <div className={styles.campaignDraftNotice}>
              <span aria-hidden>⚠️</span>
              <div>
                <strong>
                  Une campagne {prepareNowConfirm.label} est déjà en attente de
                  validation.
                </strong>
                <p>
                  Si vous continuez, la campagne actuelle sera automatiquement
                  enregistrée en brouillon dans iNrSend, puis une nouvelle
                  campagne sera préparée à sa place dans iNrAgent.
                </p>
              </div>
            </div>
            <div className={styles.campaignDraftSummary}>
              <small>Action</small>
              <strong>{prepareNowConfirm.label}</strong>
              <small>Campagne en cours</small>
              <strong>
                {prepareNowConfirm.pendingCount} campagne
                {prepareNowConfirm.pendingCount > 1 ? "s" : ""} à enregistrer en
                brouillon
              </strong>
            </div>
            <div className={styles.modalActions}>
              <button
                type="button"
                onClick={() => setPrepareNowConfirm(null)}
                disabled={
                  Boolean(testNowKey) || prepareActionState === "saving"
                }
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmPrepareNowReplacement}
                disabled={
                  Boolean(testNowKey) || prepareActionState === "saving"
                }
              >
                {testNowKey === prepareNowConfirm.key ||
                prepareActionState === "saving"
                  ? prepareProgress?.key === prepareNowConfirm.key
                    ? "Préparation..."
                    : "Préparation..."
                  : "Préparer maintenant"}
              </button>
            </div>
          </section>
        </div>
      )}

      {notice && <div className={styles.notice}>{notice}</div>}
    </main>
  );
}
