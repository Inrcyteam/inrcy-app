import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import { buildVideoTransformSignature } from "@/lib/boosterVideoTransforms";
import { readSanitizedElementHtml } from "@/lib/sanitizeHtml";
import { confirmInrcy } from "@/lib/inrcyDialog";
import {
  editableHtmlToSiteText,
  stripSiteTextFormatting,
  stripSiteTextFormattingForEditor,
  stripSiteTextFormattingPreserveLayout,
} from "@/lib/boosterFormatting";
import stylesDash from "../../dashboard.module.css";
import { ChannelImageAdapterModal } from "@/app/dashboard/_components/ChannelImageAdapterTool";
import {
  BOOSTER_MAX_IMAGE_COUNT,
  BOOSTER_MAX_VIDEO_BYTES,
  BOOSTER_MAX_VIDEO_MB_LABEL,
  CHANNEL_LABELS,
  CHANNEL_PRESETS,
  STYLE_OPTIONS,
  THEME_OPTIONS,
  buildAutoPrefillPatch,
  buildPreferredCtaPatch,
  buildBoosterVideoGenerationContext,
  buildVideoSettingsByChannel,
  channelSupportsImages,
  channelSupportsTextOnly,
  clampPercent,
  getChannelDefaultCtaLabel,
  getChannelPublicationRequirements,
  getDefaultCtaModeForChannel,
  normalizeBoosterPreferredCta,
  getPublicationMediaLabel,
  getImageFitLabel,
  getOptimizedTransform,
  getRecommendedVideoFormatForSource,
  getVideoFormatLabel,
  VIDEO_ADAPTATION_MODE_LABELS,
  VIDEO_FORMAT_ASPECT_RATIOS,
  extractVideoFramesForAI,
  fileToBoosterAiImagePayload,
  isBoosterVideoFile,
  isSiteDisplayKey,
  normalizeBoosterAiLanguage,
  normalizePost,
  normalizePublicationMediaType,
  normalizeVideoAdaptationMode,
  normalizeVideoFormat,
  parseInstagramHashtagsInput,
  sleep,
  uploadPreparedImages,
  type BoosterCtaDefaults,
  type BoosterPreferredCta,
  type ChannelImageEditorState,
  type ChannelImagePayload,
  type ChannelImageSettingsPayload,
  type ChannelKey,
  type ChannelMediaMode,
  type ChannelPost,
  type VideoAdaptationMode,
  type VideoFormat,
  type DisplayKey,
  type ImageMeta,
  type ImagePayload,
  type PublicationMediaType,
  type StyleKey,
  type ThemeKey,
  type BoosterVideoSourceMetadata,
  type VideoPayload,
} from "./publishModal.shared";
import { pillBtn, pillBtnActive } from "./publishModal.styles";

import PublishAiConfigurationDrawer from "./components/PublishAiConfigurationDrawer";
import PublishChannelSelector from "./components/PublishChannelSelector";
import PublishFinalReviewModal from "./components/PublishFinalReviewModal";
import TiktokPublicationSettingsModal, {
  type TiktokPublicationSettings,
} from "./components/TiktokPublicationSettingsModal";
import PublishFooterActions from "./components/PublishFooterActions";
import PublishScheduleModal, {
  type PublishScheduleSelection,
} from "./components/PublishScheduleModal";
import PublishIntentPanel from "./components/PublishIntentPanel";
import PublishContentEditorPanel from "./components/PublishContentEditorPanel";
import PublishImagesPanel from "./components/PublishImagesPanel";
import PublishPreviewPanel from "./components/PublishPreviewPanel";
import PublishHelpModal from "./components/PublishHelpModal";
import PublishWarningModals from "./components/PublishWarningModals";
import usePublishImageController from "./usePublishImageController";
import usePublishVideoController, {
  normalizeRestoredVideoVariants,
  type VideoVariantPreparationState,
} from "./usePublishVideoController";

import InrcyCameraCaptureModal from "@/app/dashboard/_components/InrcyCameraCaptureModal";
import MediaLibraryPickerModal, {
  type MediaLibraryPickerItem,
} from "@/app/dashboard/_components/MediaLibraryPickerModal";

type ChannelConnectionDetail = {
  type?: string | null;
  label?: string | null;
  href?: string | null;
};

type PinterestBoardOption = {
  id: string;
  name: string;
};

type PendingImmediatePublishAfterSchedule = {
  immediateChannels: ChannelKey[];
  preparedPostsByChannel: Partial<Record<ChannelKey, ChannelPost>>;
  tiktokSettingsForSchedule: TiktokPublicationSettings | null;
};

const EMPTY_CHANNEL_DETAILS: Record<ChannelKey, ChannelConnectionDetail> = {
  inrcy_site: { type: "url", label: null, href: null },
  site_web: { type: "url", label: null, href: null },
  gmb: { type: "location", label: null, href: null },
  facebook: { type: "page", label: null, href: null },
  instagram: { type: "account", label: null, href: null },
  linkedin: { type: "profile", label: null, href: null },
  tiktok: { type: "account", label: null, href: null },
  youtube_shorts: { type: "channel", label: null, href: null },
  pinterest: { type: "board", label: null, href: null },
};

const CHANNEL_KEYS: ChannelKey[] = [
  "inrcy_site",
  "site_web",
  "gmb",
  "facebook",
  "instagram",
  "linkedin",
  "tiktok",
  "youtube_shorts",
  "pinterest",
];

function isChannelKey(value: unknown): value is ChannelKey {
  return CHANNEL_KEYS.includes(String(value || "") as ChannelKey);
}

function isThemeKey(value: unknown): value is ThemeKey {
  const raw = String(value || "");
  return raw === "" || THEME_OPTIONS.some((option) => option.value === raw);
}

function isStyleKey(value: unknown): value is StyleKey {
  const raw = String(value || "");
  return STYLE_OPTIONS.some((option) => option.value === raw);
}

function normalizeExternalHref(input: unknown) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (/^(https?:)?\/\//i.test(raw))
    return raw.startsWith("//") ? `https:${raw}` : raw;
  if (/^www\./i.test(raw)) return `https://${raw}`;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#].*)?$/i.test(raw))
    return `https://${raw}`;
  return raw;
}

function truncateText(value: unknown, max = 32) {
  const text = String(value || "").trim();
  if (!text || text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function decodeChannelDisplayText(value: unknown) {
  let text = String(value || "").trim();
  if (!text) return "";
  text = text.replace(/\+/g, " ");
  for (let i = 0; i < 2; i += 1) {
    if (!/%[0-9a-f]{2}/i.test(text)) break;
    try {
      const decoded = decodeURIComponent(text);
      if (decoded === text) break;
      text = decoded;
    } catch {
      break;
    }
  }
  return text.replace(/\s+/g, " ").trim();
}

function titleCaseChannelDisplayName(value: string) {
  const text = decodeChannelDisplayText(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  if (/[A-ZÀ-ÖØ-Þ]/.test(text)) return text;
  return text
    .split(" ")
    .map((part) =>
      part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part,
    )
    .join(" ");
}

function normalizeChannelDisplayUrl(input: unknown) {
  const raw = decodeChannelDisplayText(input);
  if (!raw) return null;
  const candidate = /^(https?:)?\/\//i.test(raw)
    ? raw.startsWith("//")
      ? `https:${raw}`
      : raw
    : /^www\./i.test(raw) || /^[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#].*)?$/i.test(raw)
      ? `https://${raw}`
      : "";
  if (!candidate) return null;
  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}

function firstChannelPathPart(url: URL, ignored: string[] = []) {
  const ignoredSet = new Set(ignored.map((part) => part.toLowerCase()));
  const parts = url.pathname
    .split("/")
    .map((part) => decodeChannelDisplayText(part))
    .filter(Boolean)
    .filter((part) => !ignoredSet.has(part.toLowerCase()));
  return parts[parts.length - 1] || "";
}

function looksLikeTechnicalChannelLabel(value: string) {
  const text = decodeChannelDisplayText(value).trim();
  if (!text) return true;
  if (/^urn:/i.test(text)) return true;
  if (/^(accounts\/[^/]+\/)?locations\/\d+$/i.test(text)) return true;
  if (/^\d{6,}$/.test(text)) return true;
  if (/^[a-z]{1,8}_[a-z0-9_-]{18,}$/i.test(text)) return true;
  return false;
}

function cleanChannelBusinessLabel(input: unknown) {
  let text = decodeChannelDisplayText(input);
  if (!text) return "";

  const url = normalizeChannelDisplayUrl(text);
  if (url) {
    const host = url.hostname.replace(/^www\./i, "");
    if (/google\./i.test(host)) {
      text = decodeChannelDisplayText(
        url.searchParams.get("query") ||
          url.searchParams.get("q") ||
          firstChannelPathPart(url),
      );
    } else if (/facebook\.com$/i.test(host)) {
      text = firstChannelPathPart(url, ["pages", "profile.php", "people"]);
    } else if (/linkedin\.com$/i.test(host)) {
      text = firstChannelPathPart(url, ["company", "in", "showcase", "school"]);
    } else if (/youtube\.com$/i.test(host) || /youtu\.be$/i.test(host)) {
      text = firstChannelPathPart(url, ["channel", "c", "user"]);
    } else {
      const hostOnly = host;
      const path = url.pathname.replace(/^\/+|\/+$/g, "");
      return path ? `${hostOnly}/${decodeChannelDisplayText(path)}` : hostOnly;
    }
  }

  text = decodeChannelDisplayText(text)
    .replace(/^accounts\/[^/]+\/locations\//i, "")
    .replace(/^locations\//i, "")
    .replace(/^pages\//i, "")
    .replace(/^company\//i, "")
    .replace(/^in\//i, "")
    .replace(/^@+/, "")
    .trim();

  if (looksLikeTechnicalChannelLabel(text)) return "";
  if (/^https?:\/\//i.test(text)) return "";
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(text))
    return text.replace(/^www\./i, "");

  return titleCaseChannelDisplayName(text);
}

function cleanChannelHandleLabel(input: unknown) {
  let text = decodeChannelDisplayText(input);
  if (!text) return "";
  const url = normalizeChannelDisplayUrl(text);
  if (url) text = firstChannelPathPart(url);
  text = decodeChannelDisplayText(text)
    .replace(/^@+/, "")
    .replace(/^\/+|\/+$/g, "")
    .trim();
  if (!text || looksLikeTechnicalChannelLabel(text) || /\s/.test(text))
    return "";
  return `@${text}`;
}

function simplifyChannelDetail(key: ChannelKey, value: unknown) {
  const raw = decodeChannelDisplayText(value);
  if (!raw) return "";
  if (key === "instagram" || key === "tiktok") {
    return cleanChannelHandleLabel(raw) || cleanChannelBusinessLabel(raw);
  }
  return cleanChannelBusinessLabel(raw);
}

function sanitizePatchForEditor(
  channel: ChannelKey,
  patch: Partial<ChannelPost>,
): Partial<ChannelPost> {
  const next: Partial<ChannelPost> = { ...patch };
  if (!isSiteDisplayKey(channel)) {
    if (typeof next.title === "string")
      next.title = stripSiteTextFormattingForEditor(next.title);
    if (typeof next.content === "string")
      next.content = stripSiteTextFormattingPreserveLayout(next.content);
    if (typeof next.cta === "string")
      next.cta = stripSiteTextFormattingForEditor(next.cta);
  }
  if (next.ctaUrl !== undefined) next.ctaUrl = String(next.ctaUrl || "");
  if (next.ctaPhone !== undefined) next.ctaPhone = String(next.ctaPhone || "");
  if (next.hashtags !== undefined) {
    next.hashtags = Array.isArray(next.hashtags)
      ? next.hashtags
          .map((tag) =>
            String(tag || "")
              .replace(/^#+/, "")
              .trim(),
          )
          .filter(Boolean)
          .slice(0, 20)
      : [];
  }
  return next;
}

function sanitizePostForEditor(
  channel: ChannelKey,
  post?: Partial<ChannelPost> | null,
): ChannelPost {
  return normalizePost(
    sanitizePatchForEditor(
      channel,
      normalizePost(post),
    ) as Partial<ChannelPost>,
  );
}

function sanitizePostsForEditor(
  raw: unknown,
): Partial<Record<ChannelKey, ChannelPost>> {
  const node =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return CHANNEL_KEYS.reduce(
    (acc, channel) => {
      if (node[channel] !== undefined)
        acc[channel] = sanitizePostForEditor(
          channel,
          node[channel] as Partial<ChannelPost>,
        );
      return acc;
    },
    {} as Partial<Record<ChannelKey, ChannelPost>>,
  );
}

function buildVideoFileName(file: Pick<File, "name" | "type">) {
  const rawName =
    String(file?.name || "video-inrcy")
      .split(/[\\/]/)
      .pop() || "video-inrcy";
  if (/\.(mp4|mov|webm|m4v)$/i.test(rawName)) return rawName;
  const type = String(file?.type || "").toLowerCase();
  const extension = type.includes("quicktime")
    ? "mov"
    : type.includes("webm")
      ? "webm"
      : "mp4";
  return `${rawName.replace(/\.[^.]*$/, "")}.${extension}`;
}

function buildVideoRatioLabel(width: number | null, height: number | null) {
  if (!width || !height) return "Ratio inconnu";
  const ratio = width / height;
  const candidates = [
    { label: "9:16", value: 9 / 16 },
    { label: "1:1", value: 1 },
    { label: "4:5", value: 4 / 5 },
    { label: "16:9", value: 16 / 9 },
    { label: "4:3", value: 4 / 3 },
  ];
  let closestLabel = "";
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const item of candidates) {
    const distance = Math.abs(item.value - ratio);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestLabel = item.label;
    }
  }
  return closestDistance <= 0.08 ? closestLabel : `${width}:${height}`;
}

function buildVideoOrientation(
  width: number | null,
  height: number | null,
): BoosterVideoSourceMetadata["orientation"] {
  if (!width || !height) return "unknown";
  const delta = Math.abs(width - height) / Math.max(width, height);
  if (delta <= 0.06) return "square";
  return width > height ? "horizontal" : "vertical";
}

function getVideoOrientationLabel(
  orientation: BoosterVideoSourceMetadata["orientation"],
) {
  if (orientation === "horizontal") return "Horizontale";
  if (orientation === "vertical") return "Verticale";
  if (orientation === "square") return "Carrée";
  return "Orientation inconnue";
}

function readVideoSourceMetadata(
  file: File,
): Promise<BoosterVideoSourceMetadata> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    let timeoutId: number | null = null;

    const cleanup = () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
    };

    const finish = (partial?: Partial<BoosterVideoSourceMetadata>) => {
      if (settled) return;
      settled = true;
      const width = Number(partial?.width ?? video.videoWidth ?? 0) || null;
      const height = Number(partial?.height ?? video.videoHeight ?? 0) || null;
      const rawDuration = Number(partial?.duration ?? video.duration ?? 0);
      const duration =
        Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : null;
      const orientation = buildVideoOrientation(width, height);
      cleanup();
      resolve({
        width,
        height,
        duration,
        size: file.size,
        type: file.type || "video/mp4",
        ratio: width && height ? width / height : null,
        ratioLabel: buildVideoRatioLabel(width, height),
        orientation,
        orientationLabel: getVideoOrientationLabel(orientation),
      });
    };

    video.preload = "metadata";
    video.onloadedmetadata = () => finish();
    video.onerror = () => finish();
    timeoutId = window.setTimeout(() => finish(), 5500);
    video.src = url;
    video.load();
  });
}

type VideoAudioTranscriptCache = {
  key: string;
  text: string;
  rawText: string;
};

const VIDEO_TRANSCRIPTION_TIMEOUT_MS = 55_000;

function makeVideoTranscriptCacheKey(file: File) {
  return `${file.name}__${file.size}__${file.lastModified}`;
}

async function transcribeVideoAudioForAI(
  file: File,
): Promise<Omit<VideoAudioTranscriptCache, "key"> | null> {
  const formData = new FormData();
  formData.append("video", file, buildVideoFileName(file));

  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId =
    controller && typeof window !== "undefined"
      ? window.setTimeout(
          () => controller.abort(),
          VIDEO_TRANSCRIPTION_TIMEOUT_MS,
        )
      : null;

  try {
    const res = await fetch("/api/booster/transcribe", {
      method: "POST",
      body: formData,
      ...(controller ? { signal: controller.signal } : {}),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return null;

    const text = String(json?.text || "").trim();
    if (!text) return null;
    return {
      text,
      rawText: String(json?.raw_text || text).trim() || text,
    };
  } catch {
    return null;
  } finally {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  }
}

export default function PublishModal({
  styles,
  onClose,
  trackEvent,
  onPublishSuccess,
  onOverlayOpenChange,
  onUnsavedChange,
  saveDraftActionRef,
  openHelpActionRef,
  onDraftHeaderStateChange,
  initialConnectedChannels,
}: {
  styles: typeof stylesDash;
  onClose: () => void;
  trackEvent: (type: "publish", payload: Record<string, any>) => Promise<any>;
  onPublishSuccess?: (result?: any) => void;
  onOverlayOpenChange?: (open: boolean) => void;
  onUnsavedChange?: (hasUnsavedChanges: boolean) => void;
  saveDraftActionRef?: MutableRefObject<(() => void) | null>;
  openHelpActionRef?: MutableRefObject<(() => void) | null>;
  onDraftHeaderStateChange?: (state: {
    saving: boolean;
    draftSaving: boolean;
    draftMessage: string;
  }) => void;
  initialConnectedChannels?: Partial<Record<ChannelKey, boolean>>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const publicationDraftIdParam = String(
    searchParams?.get("draftId") || "",
  ).trim();
  const [loadedPublicationDraftId, setLoadedPublicationDraftId] = useState<
    string | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [idea, setIdea] = useState("");
  const [theme, setTheme] = useState<ThemeKey>("");
  const [contentStyle, setContentStyle] = useState<StyleKey>("equilibre");
  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStage, setGenerationStage] = useState("");
  const generationTimersRef = useRef<number[]>([]);
  const generationPulseTimerRef = useRef<number | null>(null);
  const videoAudioTranscriptCacheRef = useRef<VideoAudioTranscriptCache | null>(
    null,
  );
  const [genError, setGenError] = useState("");
  const [publishError, setPublishError] = useState("");
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftMessage, setDraftMessage] = useState("");
  const [lastPublicationDraftSnapshot, setLastPublicationDraftSnapshot] =
    useState<string | null>(null);

  useEffect(() => {
    onDraftHeaderStateChange?.({ saving, draftSaving, draftMessage });
  }, [saving, draftSaving, draftMessage, onDraftHeaderStateChange]);
  const [publishProgress, setPublishProgress] = useState(0);
  const [publishProgressLabel, setPublishProgressLabel] = useState("");
  const [postsByChannel, setPostsByChannel] = useState<
    Partial<Record<ChannelKey, ChannelPost>>
  >({});
  const [activeCard, setActiveCard] = useState<DisplayKey>("inrcy_site");
  const [isMobile, setIsMobile] = useState(false);
  const [drawerViewportHeight, setDrawerViewportHeight] = useState<
    number | null
  >(null);
  const [duplicateFeedback, setDuplicateFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [publishHelpOpen, setPublishHelpOpen] = useState(false);

  useEffect(() => {
    if (!openHelpActionRef) return;
    openHelpActionRef.current = () => setPublishHelpOpen(true);
    return () => {
      openHelpActionRef.current = null;
    };
  }, [openHelpActionRef]);
  const [aiConfigurationOpen, setAiConfigurationOpen] = useState(false);
  const [instagramHashtagsInput, setInstagramHashtagsInput] = useState("");
  const [emptyContentWarningChannels, setEmptyContentWarningChannels] =
    useState<ChannelKey[]>([]);
  const [emptyContentWarningIndex, setEmptyContentWarningIndex] = useState(0);
  const [gmbNoImageWarningOpen, setGmbNoImageWarningOpen] = useState(false);
  const [finalReviewOpen, setFinalReviewOpen] = useState(false);
  const [finalReviewPosts, setFinalReviewPosts] = useState<Partial<
    Record<ChannelKey, ChannelPost>
  > | null>(null);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleReviewPosts, setScheduleReviewPosts] = useState<Partial<
    Record<ChannelKey, ChannelPost>
  > | null>(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [pendingScheduleRequest, setPendingScheduleRequest] = useState<{
    selections: PublishScheduleSelection[];
    immediateChannels: ChannelKey[];
    preparedPostsByChannel: Partial<Record<ChannelKey, ChannelPost>>;
  } | null>(null);
  const [
    pendingImmediatePublishAfterSchedule,
    setPendingImmediatePublishAfterSchedule,
  ] = useState<PendingImmediatePublishAfterSchedule | null>(null);
  const [tiktokSettingsOpen, setTiktokSettingsOpen] = useState(false);
  const [tiktokSettingsFlow, setTiktokSettingsFlow] = useState<
    "publish" | "schedule" | null
  >(null);
  const [tiktokPublicationSettings, setTiktokPublicationSettings] =
    useState<TiktokPublicationSettings | null>(null);
  const [pendingPublishPosts, setPendingPublishPosts] = useState<Partial<
    Record<ChannelKey, ChannelPost>
  > | null>(null);
  const [pinterestBoards, setPinterestBoards] = useState<PinterestBoardOption[]>([]);
  const [pinterestBoardId, setPinterestBoardId] = useState("");
  const [pinterestBoardName, setPinterestBoardName] = useState("");
  const [pinterestBoardsLoading, setPinterestBoardsLoading] = useState(false);
  const [pinterestBoardsError, setPinterestBoardsError] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const gmbFileInputRef = useRef<HTMLInputElement | null>(null);
  const [cameraCaptureOpen, setCameraCaptureOpen] = useState(false);
  const [cameraCaptureTargetChannel, setCameraCaptureTargetChannel] =
    useState<ChannelKey | null>(null);
  const [mediaLibraryPickerOpen, setMediaLibraryPickerOpen] = useState(false);
  const [publicationMediaType, setPublicationMediaType] =
    useState<PublicationMediaType>("images");
  const [channelMediaModes, setChannelMediaModes] = useState<
    Partial<Record<ChannelKey, ChannelMediaMode>>
  >({});
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imgError, setImgError] = useState("");
  const [useImagesForAI, setUseImagesForAI] = useState(true);
  const [imageMetaByKey, setImageMetaByKey] = useState<
    Record<string, ImageMeta>
  >({});
  const [channelImageEditors, setChannelImageEditors] = useState<
    Partial<Record<ChannelKey, ChannelImageEditorState>>
  >({});
  const [activeImageChannel, setActiveImageChannel] =
    useState<ChannelKey>("inrcy_site");
  const [activeImageKeyByChannel, setActiveImageKeyByChannel] = useState<
    Partial<Record<ChannelKey, string>>
  >({});

  const [showPublicationPreview, setShowPublicationPreview] = useState(false);
  const previewStageRef = useRef<HTMLDivElement | null>(null);
  const publishAreaRef = useRef<HTMLDivElement | null>(null);
  const contentTextAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const siteContentEditorRef = useRef<HTMLDivElement | null>(null);
  const publishPulseTimerRef = useRef<number | null>(null);
  const publishPulseProgressRef = useRef(0);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [isImageEditorOpen, setIsImageEditorOpen] = useState(false);
  const publishRootRef = useRef<HTMLDivElement | null>(null);
  const publishScrollSnapshotRef = useRef<{
    element: HTMLElement | null;
    scrollTop: number;
    windowY: number;
  } | null>(null);

  const getInitialConnectedChannels = (): Record<ChannelKey, boolean> => ({
    inrcy_site: !!initialConnectedChannels?.inrcy_site,
    site_web: !!initialConnectedChannels?.site_web,
    gmb: !!initialConnectedChannels?.gmb,
    facebook: !!initialConnectedChannels?.facebook,
    instagram: !!initialConnectedChannels?.instagram,
    linkedin: !!initialConnectedChannels?.linkedin,
    tiktok: !!initialConnectedChannels?.tiktok,
    youtube_shorts: !!initialConnectedChannels?.youtube_shorts,
    pinterest: !!initialConnectedChannels?.pinterest,
  });

  const [channels, setChannels] = useState<Record<ChannelKey, boolean>>(() =>
    getInitialConnectedChannels(),
  );

  const [connected, setConnected] = useState<Record<ChannelKey, boolean>>(() =>
    getInitialConnectedChannels(),
  );
  const [channelDetails, setChannelDetails] = useState<
    Record<ChannelKey, ChannelConnectionDetail>
  >(EMPTY_CHANNEL_DETAILS);
  const [channelInfoOpen, setChannelInfoOpen] = useState<ChannelKey | null>(
    null,
  );
  const [didInitChannels, setDidInitChannels] = useState(
    () => !!initialConnectedChannels,
  );
  const [ctaDefaults, setCtaDefaults] = useState<BoosterCtaDefaults | null>(
    null,
  );
  const preferredCtaDefaultsAppliedRef = useRef(false);
  const didAutoSelectConnectedTikTokRef = useRef(false);
  const didAutoSelectConnectedYoutubeShortsRef = useRef(false);

  const clearGenerationTimers = () => {
    generationTimersRef.current.forEach((timerId) =>
      window.clearTimeout(timerId),
    );
    generationTimersRef.current = [];
    if (generationPulseTimerRef.current) {
      window.clearInterval(generationPulseTimerRef.current);
      generationPulseTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      generationTimersRef.current.forEach((timerId) =>
        window.clearTimeout(timerId),
      );
      generationTimersRef.current = [];
      if (generationPulseTimerRef.current) {
        window.clearInterval(generationPulseTimerRef.current);
        generationPulseTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const nextValue = (
      normalizePost(postsByChannel.instagram).hashtags || []
    ).join(" ");
    setInstagramHashtagsInput((prev) =>
      prev === nextValue ? prev : nextValue,
    );
  }, [postsByChannel.instagram?.hashtags?.join("|") ?? ""]);

  useEffect(() => {
    onOverlayOpenChange?.(isImageEditorOpen || aiConfigurationOpen);
    return () => {
      onOverlayOpenChange?.(false);
    };
  }, [isImageEditorOpen, aiConfigurationOpen, onOverlayOpenChange]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/booster/connected-channels", {
          cache: "no-store" as any,
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!alive) return;
        if (json?.channels) {
          const nextConnected = { ...connected, ...json.channels } as Record<
            ChannelKey,
            boolean
          >;
          setConnected(nextConnected);
          if (json?.channelDetails) {
            setChannelDetails((prev) => ({ ...prev, ...json.channelDetails }));
          }
          setChannels((prev) =>
            didInitChannels
              ? prev
              : ({
                  inrcy_site: !!nextConnected.inrcy_site,
                  site_web: !!nextConnected.site_web,
                  gmb: !!nextConnected.gmb,
                  facebook: !!nextConnected.facebook,
                  instagram: !!nextConnected.instagram,
                  linkedin: !!nextConnected.linkedin,
                  tiktok: !!nextConnected.tiktok,
                  youtube_shorts: !!nextConnected.youtube_shorts,
                  pinterest: !!nextConnected.pinterest,
                } as Record<ChannelKey, boolean>),
          );
          if (!didInitChannels) setDidInitChannels(true);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!initialConnectedChannels || didInitChannels) return;
    const nextConnected: Record<ChannelKey, boolean> = {
      inrcy_site: !!initialConnectedChannels.inrcy_site,
      site_web: !!initialConnectedChannels.site_web,
      gmb: !!initialConnectedChannels.gmb,
      facebook: !!initialConnectedChannels.facebook,
      instagram: !!initialConnectedChannels.instagram,
      linkedin: !!initialConnectedChannels.linkedin,
      tiktok: !!initialConnectedChannels.tiktok,
      youtube_shorts: !!initialConnectedChannels.youtube_shorts,
      pinterest: !!initialConnectedChannels.pinterest,
    };
    setConnected(nextConnected);
    setChannels(nextConnected);
    setDidInitChannels(true);
  }, [initialConnectedChannels, didInitChannels]);

  const loadPinterestBoardsForPublish = useCallback(async () => {
    if (!connected.pinterest) {
      setPinterestBoards([]);
      setPinterestBoardsError("");
      return;
    }

    setPinterestBoardsLoading(true);
    setPinterestBoardsError("");
    try {
      const response = await fetch("/api/integrations/pinterest/status", {
        cache: "no-store" as any,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        throw new Error(String(result?.error || "Impossible de charger les tableaux Pinterest."));
      }

      const rawBoards: unknown[] = Array.isArray(result.boards) ? result.boards : [];
      const boards: PinterestBoardOption[] = rawBoards
        .map((value: unknown): PinterestBoardOption | null => {
          if (!value || typeof value !== "object" || Array.isArray(value)) return null;
          const record = value as Record<string, unknown>;
          const id = String(record.id || "").trim();
          if (!id) return null;
          return { id, name: String(record.name || "Tableau Pinterest").trim() || "Tableau Pinterest" };
        })
        .filter((value: PinterestBoardOption | null): value is PinterestBoardOption => Boolean(value));

      setPinterestBoards(boards);
      setPinterestBoardId((currentId) => {
        const current = String(currentId || "").trim();
        const defaultId = String(result.defaultBoardId || "").trim();
        const nextId = boards.some((board) => board.id === current)
          ? current
          : boards.some((board) => board.id === defaultId)
            ? defaultId
            : "";
        const nextBoard = boards.find((board) => board.id === nextId);
        setPinterestBoardName(nextBoard?.name || "");
        return nextId;
      });
    } catch (error) {
      setPinterestBoardsError(
        getSimpleFrenchErrorMessage(error, "Impossible de charger les tableaux Pinterest."),
      );
    } finally {
      setPinterestBoardsLoading(false);
    }
  }, [connected.pinterest]);

  useEffect(() => {
    if (!connected.pinterest || !channels.pinterest) return;
    void loadPinterestBoardsForPublish();
  }, [connected.pinterest, channels.pinterest, loadPinterestBoardsForPublish]);

  const onPinterestBoardChange = useCallback((boardId: string) => {
    const cleanId = String(boardId || "").trim();
    const selectedBoard = pinterestBoards.find((board) => board.id === cleanId);
    setPinterestBoardId(cleanId);
    setPinterestBoardName(selectedBoard?.name || "");
    setPinterestBoardsError("");
  }, [pinterestBoards]);

  useEffect(() => {
    if (!connected.tiktok) {
      didAutoSelectConnectedTikTokRef.current = false;
      return;
    }
    if (didAutoSelectConnectedTikTokRef.current) return;
    didAutoSelectConnectedTikTokRef.current = true;
    setChannels((prev) =>
      prev.tiktok
        ? prev
        : ({ ...prev, tiktok: true } as Record<ChannelKey, boolean>),
    );
  }, [connected.tiktok]);

  useEffect(() => {
    if (!connected.youtube_shorts) {
      didAutoSelectConnectedYoutubeShortsRef.current = false;
      return;
    }
    if (didAutoSelectConnectedYoutubeShortsRef.current) return;
    didAutoSelectConnectedYoutubeShortsRef.current = true;
    setChannels((prev) =>
      prev.youtube_shorts
        ? prev
        : ({ ...prev, youtube_shorts: true } as Record<ChannelKey, boolean>),
    );
  }, [connected.youtube_shorts]);

  useEffect(() => {
    if (!channelInfoOpen) return;
    const onGlobalPointer = () => setChannelInfoOpen(null);
    window.addEventListener("pointerdown", onGlobalPointer);
    window.addEventListener("scroll", onGlobalPointer, true);
    return () => {
      window.removeEventListener("pointerdown", onGlobalPointer);
      window.removeEventListener("scroll", onGlobalPointer, true);
    };
  }, [channelInfoOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleAiConfigurationUpdated = (event: Event) => {
      const detail =
        (event as CustomEvent<{ aiLanguage?: unknown; preferredCta?: unknown }>)
          .detail || {};
      setCtaDefaults((current) => {
        if (!current) return current;
        return {
          ...current,
          preferredCta: normalizeBoosterPreferredCta(
            detail.preferredCta || current.preferredCta,
          ),
          aiLanguage: normalizeBoosterAiLanguage(
            detail.aiLanguage || current.aiLanguage,
          ),
        };
      });
    };
    window.addEventListener(
      "inrcy:ai-configuration-updated",
      handleAiConfigurationUpdated,
    );
    return () =>
      window.removeEventListener(
        "inrcy:ai-configuration-updated",
        handleAiConfigurationUpdated,
      );
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/booster/cta-defaults", {
          cache: "no-store" as any,
        });
        if (!res.ok) return;
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        setCtaDefaults({
          preferredWebsiteUrl: String(json?.preferredWebsiteUrl || "").trim(),
          preferredWebsiteLabel: String(
            json?.preferredWebsiteLabel || "",
          ).trim(),
          siteWebUrl: String(json?.siteWebUrl || "").trim(),
          inrcySiteUrl: String(json?.inrcySiteUrl || "").trim(),
          phone: String(json?.phone || "").trim(),
          preferredCta: normalizeBoosterPreferredCta(json?.preferredCta),
          aiLanguage: normalizeBoosterAiLanguage(json?.aiLanguage),
        });
      } catch {
        // ignore
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!ctaDefaults) return;
    const shouldApplyPreferredDefaults =
      !preferredCtaDefaultsAppliedRef.current;
    if (shouldApplyPreferredDefaults)
      preferredCtaDefaultsAppliedRef.current = true;

    setPostsByChannel((prev) => {
      let changed = false;
      const next: Partial<Record<ChannelKey, ChannelPost>> = { ...prev };
      const keys: ChannelKey[] = [
        "site_web",
        "inrcy_site",
        "gmb",
        "facebook",
        "instagram",
        "linkedin",
        "tiktok",
        "youtube_shorts",
        "pinterest",
      ];
      for (const key of keys) {
        const current = sanitizePostForEditor(key, prev[key]);
        const hasExistingCta = Boolean(
          String(current.cta || "").trim() ||
          String(current.ctaUrl || "").trim() ||
          String(current.ctaPhone || "").trim(),
        );
        let mode = current.ctaMode || "none";
        const shouldSetPreferredMode =
          shouldApplyPreferredDefaults && mode === "none" && !hasExistingCta;
        const preferredChoice = normalizeBoosterPreferredCta(
          ctaDefaults.preferredCta,
        );
        if (shouldSetPreferredMode)
          mode = getDefaultCtaModeForChannel(key, ctaDefaults);
        if (
          mode !== "website" &&
          mode !== "call" &&
          mode !== "message" &&
          mode !== "custom" &&
          mode !== "none"
        )
          continue;

        const patch = shouldSetPreferredMode
          ? buildPreferredCtaPatch(
              key,
              preferredChoice,
              current,
              ctaDefaults,
              ctaDefaults.aiLanguage,
            )
          : buildAutoPrefillPatch(
              key,
              mode,
              current,
              ctaDefaults,
              ctaDefaults.aiLanguage,
            );
        const hasMeaningfulPatch = Object.entries(patch).some(
          ([patchKey, patchValue]) => {
            if (patchKey === "ctaMode")
              return shouldSetPreferredMode && patchValue !== current.ctaMode;
            return String(patchValue || "").trim();
          },
        );
        if (!hasMeaningfulPatch) continue;
        const merged = sanitizePostForEditor(key, { ...current, ...patch });
        const before = JSON.stringify(current);
        const after = JSON.stringify(merged);
        if (before === after) continue;
        next[key] = merged;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [ctaDefaults, postsByChannel]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateViewport = () => {
      setIsMobile(window.innerWidth <= 768);
      setDrawerViewportHeight(
        Math.round(window.visualViewport?.height || window.innerHeight),
      );
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    window.addEventListener("orientationchange", updateViewport);
    window.visualViewport?.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("scroll", updateViewport);

    return () => {
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
      window.visualViewport?.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("scroll", updateViewport);
    };
  }, []);

  const scrollToPublishArea = (behavior: ScrollBehavior = "smooth") => {
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      publishAreaRef.current?.scrollIntoView({
        behavior,
        block: "end",
        inline: "nearest",
      });
    });
  };

  const getPublishScrollContainer = () => {
    if (typeof document === "undefined") return null;
    const root = publishRootRef.current;
    if (!root) return null;
    const scrollClass = styles.fullscreenModalScroll;
    if (!scrollClass) return null;
    return root.closest<HTMLElement>(`.${scrollClass}`);
  };

  const preservePublishScroll = () => {
    if (typeof window === "undefined") return;
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) activeElement.blur();
    const element = getPublishScrollContainer();
    publishScrollSnapshotRef.current = {
      element,
      scrollTop: element?.scrollTop ?? 0,
      windowY: window.scrollY,
    };
  };

  const restorePublishScroll = () => {
    if (typeof window === "undefined") return;
    const snapshot = publishScrollSnapshotRef.current;
    if (!snapshot) return;
    const restore = () => {
      const element = snapshot.element || getPublishScrollContainer();
      if (element) {
        element.scrollTop = snapshot.scrollTop;
      } else {
        window.scrollTo(window.scrollX, snapshot.windowY);
      }
    };
    window.requestAnimationFrame(() => {
      restore();
      window.setTimeout(restore, 80);
      window.setTimeout(restore, 220);
    });
  };

  useEffect(() => {
    if (!saving) return;
    scrollToPublishArea("smooth");
  }, [saving]);

  useEffect(() => {
    if (!publishError && !imgError) return;
    scrollToPublishArea("smooth");
  }, [publishError, imgError]);

  useEffect(() => {
    return () => {
      if (publishPulseTimerRef.current) {
        window.clearInterval(publishPulseTimerRef.current);
        publishPulseTimerRef.current = null;
      }
    };
  }, []);

  const displayCards = useMemo(() => {
    const ordered: DisplayKey[] = [
      "inrcy_site",
      "site_web",
      "gmb",
      "facebook",
      "instagram",
      "linkedin",
      "tiktok",
      "youtube_shorts",
      "pinterest",
    ];
    return ordered.filter((key) => channels[key] && connected[key]);
  }, [channels, connected]);

  useEffect(() => {
    if (!displayCards.length) {
      setActiveCard("inrcy_site");
      setActiveImageChannel("inrcy_site");
      return;
    }
    if (!displayCards.includes(activeCard)) {
      const fallback = displayCards[0];
      setActiveCard(fallback);
      setActiveImageChannel(fallback);
    }
  }, [displayCards, activeCard]);

  const selectedChannels = useMemo(
    () =>
      Object.entries(channels)
        .filter(([k, v]) => v && connected[k as ChannelKey])
        .map(([k]) => k) as ChannelKey[],
    [channels, connected],
  );

  const {
    videoFormatByChannel,
    setVideoFormatByChannel,
    videoAdaptationModeByChannel,
    setVideoAdaptationModeByChannel,
    videoFile,
    setVideoFile,
    videoPreviewUrl,
    setVideoPreviewUrl,
    videoDurationSeconds,
    setVideoDurationSeconds,
    videoSourceMetadata,
    setVideoSourceMetadata,
    videoStorageContext,
    setVideoStorageContext,
    videoVariantPreparationByChannel,
    setVideoVariantPreparationByChannel,
    videoTransformedVariants,
    setVideoTransformedVariants,
    videoPreviewVariantsPreparing,
    videoSettingsByChannel,
    clearVideoVariantPreparationForChannel,
    clearPreparedVideoVariantsForChannel,
    setVideoFormatForChannel,
    setVideoAdaptationModeForChannel,
    uploadPublicationVideoForPublish,
    buildPublicationDraftVideoPayload,
    buildVideoPreparationStateFromVariants,
    preparePublicationVideoVariants,
    applyVideoFormatsForChannels,
    clearVideoMediaState,
  } = usePublishVideoController({
    allChannels: CHANNEL_KEYS,
    selectedChannels,
    setImgError,
    setPublishProgress,
    setPublishProgressLabel,
  });

  const resolveChannelMediaMode = (channel: ChannelKey): ChannelMediaMode => {
    const explicit = channelMediaModes[channel];
    const hasVideo = Boolean(videoFile || videoPreviewUrl);
    const hasImages = images.length > 0;

    if (channel === "youtube_shorts") return hasVideo ? "video" : "none";
    if (channel === "pinterest") return hasImages ? "images" : "none";

    if (channel === "tiktok") {
      if (explicit === "video" && hasVideo) return "video";
      if (explicit === "images" && hasImages) return "images";
      if (hasImages) return "images";
      if (hasVideo) return "video";
      return "none";
    }

    if (explicit === "video" && hasVideo) return "video";
    if (explicit === "images" && hasImages && channelSupportsImages(channel))
      return "images";
    if (explicit === "none" && channelSupportsTextOnly(channel)) return "none";
    if (hasImages && channelSupportsImages(channel)) return "images";
    if (hasVideo) return "video";
    return "none";
  };

  const setChannelMediaMode = (channel: ChannelKey, mode: ChannelMediaMode) => {
    if (mode === "images" && !channelSupportsImages(channel)) return;
    if (mode === "none" && !channelSupportsTextOnly(channel)) return;
    setChannelMediaModes((prev) => ({ ...prev, [channel]: mode }));
    clearVideoVariantPreparationForChannel(channel);
    clearPreparedVideoVariantsForChannel(channel);
  };

  async function applyVideoFormatForChannel(channel: ChannelKey) {
    const mediaModeByChannel = {
      [channel]: resolveChannelMediaMode(channel),
    } as Partial<Record<ChannelKey, ChannelMediaMode>>;

    await applyVideoFormatsForChannels({
      channels: [channel],
      mediaModeByChannel,
    });
  }

  async function applyVideoFormatToAllChannels(sourceChannel: ChannelKey) {
    const publishMediaModeByChannel = Object.fromEntries(
      selectedChannels.map((channel) => [
        channel,
        resolveChannelMediaMode(channel),
      ]),
    ) as Partial<Record<ChannelKey, ChannelMediaMode>>;
    const videoChannels = selectedChannels.filter(
      (channel) => publishMediaModeByChannel[channel] === "video",
    );
    if (!videoChannels.length) {
      setImgError("Sélectionnez au moins un canal en mode vidéo.");
      return;
    }

    const sourceSettings = videoSettingsByChannel[sourceChannel];
    if (!sourceSettings) {
      setImgError("Choisissez d’abord le format vidéo à appliquer.");
      return;
    }

    const sharedSettingsByChannel = videoChannels.reduce(
      (acc, channel) => {
        acc[channel] = {
          format: normalizeVideoFormat(channel, sourceSettings.format),
          adaptationMode: normalizeVideoAdaptationMode(
            sourceSettings.adaptationMode,
          ),
        };
        return acc;
      },
      {} as Partial<
        Record<
          ChannelKey,
          { format: VideoFormat; adaptationMode: VideoAdaptationMode }
        >
      >,
    );

    setVideoFormatByChannel((prev) => {
      const next = { ...prev };
      videoChannels.forEach((channel) => {
        const settings = sharedSettingsByChannel[channel];
        if (settings) next[channel] = settings.format;
      });
      return next;
    });
    setVideoAdaptationModeByChannel((prev) => {
      const next = { ...prev };
      videoChannels.forEach((channel) => {
        const settings = sharedSettingsByChannel[channel];
        if (settings) next[channel] = settings.adaptationMode;
      });
      return next;
    });

    await applyVideoFormatsForChannels({
      channels: videoChannels,
      mediaModeByChannel: publishMediaModeByChannel,
      settingsByChannel: sharedSettingsByChannel,
    });
  }

  const {
    imageAdapterChannels,
    getImageAdapterLabel,
    imageKeys,
    previewByKey,
    activeEditorImageKey,
    activeEditorTransform,
    activeEditorDecisionLabel,
    activeEditorMeta,
    activeEffectiveZoom,
    activeBackgroundMode,
    activeBackgroundColor,
    previewAspectRatio,
    previewLayout,
    clearImagesMedia,
    onPickImagesClick,
    addImageFiles,
    onImagesChange,
    removeImage,
    getDraftImageSettingsByChannel,
    uploadPublicationDraftImages,
    restorePublicationDraftImages,
    updateChannelTransform,
    setContainMode,
    setCoverMode,
    nudgeZoom,
    handlePreviewWheel,
    handlePreviewPointerDown,
    handlePreviewPointerMove,
    endPreviewDrag,
    toggleChannelImage,
    resetChannelImage,
    resetActiveChannelImages,
    applyCurrentCadrageToActiveChannelImages,
    moveChannelImage,
    applyCurrentImageToSelectedChannels,
    openImageEditor,
    closeImageEditor,
    uploadOriginalImagesForPublication,
    buildChannelImagesPayload,
    getPublishImageKeysForChannel,
  } = usePublishImageController({
    fileInputRef,
    previewStageRef,
    selectedChannels,
    images,
    setImages,
    imagePreviews,
    setImagePreviews,
    useImagesForAI,
    setUseImagesForAI,
    imageMetaByKey,
    setImageMetaByKey,
    channelImageEditors,
    setChannelImageEditors,
    activeImageChannel,
    setActiveImageChannel,
    activeImageKeyByChannel,
    setActiveImageKeyByChannel,
    isImageEditorOpen,
    setIsImageEditorOpen,
    isDraggingImage,
    setIsDraggingImage,
    hasVideoMedia: Boolean(videoFile || videoPreviewUrl),
    setImgError,
    setActiveCard,
    setPublicationMediaType,
    setChannelMediaModes,
    preservePublishScroll,
    restorePublishScroll,
  });

  const selectedForGeneration = useMemo(() => {
    const out = new Set<ChannelKey>();
    if (channels.inrcy_site && connected.inrcy_site) out.add("inrcy_site");
    if (channels.site_web && connected.site_web) out.add("site_web");
    if (channels.gmb && connected.gmb) out.add("gmb");
    if (channels.facebook && connected.facebook) out.add("facebook");
    if (channels.instagram && connected.instagram) out.add("instagram");
    if (channels.linkedin && connected.linkedin) out.add("linkedin");
    if (channels.tiktok && connected.tiktok) out.add("tiktok");
    if (channels.youtube_shorts && connected.youtube_shorts)
      out.add("youtube_shorts");
    if (channels.pinterest && connected.pinterest) out.add("pinterest");
    return Array.from(out);
  }, [channels, connected]);

  const setSynchronizedActiveChannel = (channel: ChannelKey) => {
    setActiveCard(channel);
    setActiveImageChannel(channel);
  };

  useEffect(() => {
    setChannelMediaModes((prev) => {
      const next: Partial<Record<ChannelKey, ChannelMediaMode>> = { ...prev };
      let changed = false;
      for (const channel of selectedChannels) {
        const current = next[channel];
        const hasVideo = Boolean(videoFile || videoPreviewUrl);
        const hasImages = images.length > 0;
        const valid =
          (current === "none" && channelSupportsTextOnly(channel)) ||
          (current === "video" && hasVideo) ||
          (current === "images" && hasImages && channelSupportsImages(channel));
        if (!valid) {
          next[channel] =
            channel === "youtube_shorts"
              ? hasVideo
                ? "video"
                : "none"
              : channel === "tiktok"
                ? hasImages
                  ? "images"
                  : hasVideo
                    ? "video"
                    : "none"
                : hasImages && channelSupportsImages(channel)
                  ? "images"
                  : hasVideo
                    ? "video"
                    : "none";
          changed = true;
        }
      }
      for (const key of Object.keys(next) as ChannelKey[]) {
        if (!selectedChannels.includes(key)) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [
    selectedChannels.join("|"),
    Boolean(videoFile || videoPreviewUrl),
    images.length,
  ]);

  const hasDraftablePublicationContent = useMemo(() => {
    const hasText = !!idea.trim() || !!theme || contentStyle !== "equilibre";
    const hasGeneratedContent = Object.values(postsByChannel).some((post) => {
      const normalized = normalizePost(post);
      return !!(
        normalized.title?.trim() ||
        normalized.content?.trim() ||
        normalized.cta?.trim() ||
        normalized.ctaUrl?.trim() ||
        normalized.ctaPhone?.trim() ||
        normalized.hashtags?.length
      );
    });
    const hasImages =
      images.length > 0 ||
      imagePreviews.length > 0 ||
      Object.keys(channelImageEditors).length > 0;
    const hasVideo = !!videoFile || !!videoPreviewUrl;
    const hasMedia = hasImages || hasVideo;
    const hasLiveHashtags = !!instagramHashtagsInput.trim();
    return hasText || hasGeneratedContent || hasMedia || hasLiveHashtags;
  }, [
    publicationMediaType,
    channelMediaModes,
    videoFormatByChannel,
    videoAdaptationModeByChannel,
    videoSettingsByChannel,
    idea,
    theme,
    contentStyle,
    postsByChannel,
    images.length,
    imagePreviews.length,
    videoFile,
    videoPreviewUrl,
    videoSourceMetadata,
    channelImageEditors,
    instagramHashtagsInput,
  ]);

  const currentPublicationDraftSnapshot = useMemo(() => {
    const imageNames = images.map((file) => ({
      name: file.name,
      type: file.type,
      size: file.size,
    }));
    const videoName = videoFile
      ? {
          name: videoFile.name,
          type: videoFile.type,
          size: videoFile.size,
          duration: videoDurationSeconds,
          sourceMetadata: videoSourceMetadata,
        }
      : null;
    return JSON.stringify({
      mediaType: publicationMediaType,
      channelMediaModes,
      videoFormatByChannel,
      videoAdaptationModeByChannel,
      videoSettingsByChannel,
      idea: idea.trim(),
      theme,
      contentStyle,
      channels: selectedChannels,
      postsByChannel,
      instagramHashtagsInput,
      pinterestBoardId,
      pinterestBoardName,
      imageNames,
      videoName,
      videoTransformedVariants: normalizeRestoredVideoVariants(
        videoTransformedVariants,
      ),
      useImagesForAI,
      imageSettingsByChannel: channelImageEditors,
    });
  }, [
    publicationMediaType,
    channelMediaModes,
    videoFormatByChannel,
    videoAdaptationModeByChannel,
    videoSettingsByChannel,
    idea,
    theme,
    contentStyle,
    selectedChannels,
    postsByChannel,
    instagramHashtagsInput,
    pinterestBoardId,
    pinterestBoardName,
    images,
    videoFile,
    videoDurationSeconds,
    videoSourceMetadata,
    videoTransformedVariants,
    useImagesForAI,
    channelImageEditors,
  ]);

  async function restorePublicationDraftVideo(videoDraft: any): Promise<{
    file: File | null;
    previewUrl: string;
    duration: number | null;
    sourceMetadata: BoosterVideoSourceMetadata | null;
    storage: Pick<VideoPayload, "storagePath" | "publicUrl" | "url"> | null;
    transformedVariants: NonNullable<VideoPayload["transformedVariants"]>;
  }> {
    const source = String(
      videoDraft?.publicUrl || videoDraft?.url || "",
    ).trim();
    if (!source)
      return {
        file: null as File | null,
        previewUrl: "",
        duration: null as number | null,
        sourceMetadata: null as BoosterVideoSourceMetadata | null,
        storage: null as Pick<
          VideoPayload,
          "storagePath" | "publicUrl" | "url"
        > | null,
        transformedVariants: [],
      };

    try {
      const response = await fetch(source);
      if (!response.ok) throw new Error("Vidéo indisponible.");
      const blob = await response.blob();
      const name = String(videoDraft?.name || "video-inrcy.mp4");
      const type = String(videoDraft?.type || blob.type || "video/mp4");
      const lastModified = Number(videoDraft?.lastModified || Date.now());
      const file = new File([blob], name, { type, lastModified });
      const rawDuration = Number(videoDraft?.duration || 0);
      const duration =
        Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : null;
      const sourceMetadata =
        videoDraft?.sourceMetadata &&
        typeof videoDraft.sourceMetadata === "object"
          ? (videoDraft.sourceMetadata as BoosterVideoSourceMetadata)
          : await readVideoSourceMetadata(file);
      const transformedVariants = normalizeRestoredVideoVariants(
        (videoDraft as any)?.transformedVariants,
      );
      return {
        file,
        previewUrl: URL.createObjectURL(file),
        duration: sourceMetadata?.duration ?? duration,
        sourceMetadata,
        storage: {
          storagePath: String(
            videoDraft?.storagePath || videoDraft?.path || "",
          ),
          publicUrl: source,
          url: source,
        },
        transformedVariants,
      };
    } catch {
      return {
        file: null as File | null,
        previewUrl: "",
        duration: null as number | null,
        sourceMetadata: null as BoosterVideoSourceMetadata | null,
        storage: null as Pick<
          VideoPayload,
          "storagePath" | "publicUrl" | "url"
        > | null,
        transformedVariants: normalizeRestoredVideoVariants(
          (videoDraft as any)?.transformedVariants,
        ),
      };
    }
  }

  useEffect(() => {
    if (
      !publicationDraftIdParam ||
      loadedPublicationDraftId === publicationDraftIdParam
    )
      return;
    let cancelled = false;

    const loadPublicationDraft = async () => {
      setDraftMessage("Chargement du brouillon…");
      setPublishError("");
      try {
        const response = await fetch(
          `/api/booster/events?draftId=${encodeURIComponent(publicationDraftIdParam)}`,
          {
            cache: "no-store" as any,
          },
        );
        const result = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(
            String(result?.error || "Brouillon publication introuvable."),
          );
        const payload = (result?.payload || {}) as any;

        const rawChannels = Array.isArray(payload.channels)
          ? payload.channels
          : [];
        const savedChannels = rawChannels
          .map((value: unknown) => String(value || ""))
          .filter(isChannelKey);
        const nextChannels = CHANNEL_KEYS.reduce(
          (acc, key) => {
            acc[key] = savedChannels.length
              ? savedChannels.includes(key)
              : Boolean(channels[key]);
            return acc;
          },
          {} as Record<ChannelKey, boolean>,
        );

        const nextTheme = isThemeKey(payload.theme) ? payload.theme : "";
        const nextContentStyle = isStyleKey(payload.contentStyle)
          ? payload.contentStyle
          : "equilibre";
        const nextPostsByChannel = sanitizePostsForEditor(
          payload.postByChannel && typeof payload.postByChannel === "object"
            ? payload.postByChannel
            : {},
        );
        const nextEditors =
          payload.imageSettingsByChannel &&
          typeof payload.imageSettingsByChannel === "object"
            ? payload.imageSettingsByChannel
            : {};
        const nextUseImagesForAI =
          typeof payload.useImagesForAI === "boolean"
            ? payload.useImagesForAI
            : true;
        const imageDrafts = Array.isArray(payload.imageDrafts)
          ? payload.imageDrafts
          : [];
        const videoDraft =
          payload.videoDraft && typeof payload.videoDraft === "object"
            ? payload.videoDraft
            : null;
        const nextMediaType = normalizePublicationMediaType(payload.mediaType);
        const nextChannelMediaModes =
          payload.channelMediaModes &&
          typeof payload.channelMediaModes === "object"
            ? (payload.channelMediaModes as Partial<
                Record<ChannelKey, ChannelMediaMode>
              >)
            : {};
        const nextVideoFormatByChannel =
          payload.videoFormatByChannel &&
          typeof payload.videoFormatByChannel === "object"
            ? (Object.fromEntries(
                Object.entries(
                  payload.videoFormatByChannel as Record<string, unknown>,
                )
                  .filter(([channel]) => isChannelKey(channel))
                  .map(([channel, value]) => [
                    channel,
                    normalizeVideoFormat(channel as ChannelKey, value),
                  ]),
              ) as Partial<Record<ChannelKey, VideoFormat>>)
            : {};
        const rawVideoSettingsByChannel =
          payload.videoSettingsByChannel &&
          typeof payload.videoSettingsByChannel === "object"
            ? payload.videoSettingsByChannel
            : null;
        const nextVideoAdaptationModeByChannel =
          payload.videoAdaptationModeByChannel &&
          typeof payload.videoAdaptationModeByChannel === "object"
            ? (Object.fromEntries(
                Object.entries(
                  payload.videoAdaptationModeByChannel as Record<
                    string,
                    unknown
                  >,
                )
                  .filter(([channel]) => isChannelKey(channel))
                  .map(([channel, value]) => [
                    channel,
                    normalizeVideoAdaptationMode(value),
                  ]),
              ) as Partial<Record<ChannelKey, VideoAdaptationMode>>)
            : {};
        const nextCanonicalVideoSettingsByChannel = buildVideoSettingsByChannel(
          {
            channels: CHANNEL_KEYS,
            videoSettingsByChannel: rawVideoSettingsByChannel,
            videoFormatByChannel: nextVideoFormatByChannel,
            videoAdaptationModeByChannel: nextVideoAdaptationModeByChannel,
          },
        );
        const nextCanonicalVideoFormatByChannel = Object.fromEntries(
          Object.entries(nextCanonicalVideoSettingsByChannel).map(
            ([channel, settings]) => [channel, settings?.format],
          ),
        ) as Partial<Record<ChannelKey, VideoFormat>>;
        const nextCanonicalVideoAdaptationModeByChannel = Object.fromEntries(
          Object.entries(nextCanonicalVideoSettingsByChannel).map(
            ([channel, settings]) => [channel, settings?.adaptationMode],
          ),
        ) as Partial<Record<ChannelKey, VideoAdaptationMode>>;
        const { restoredFiles, restoredPreviews, restoredMeta } =
          await restorePublicationDraftImages(imageDrafts);
        const restoredVideo = videoDraft
          ? await restorePublicationDraftVideo(videoDraft)
          : {
              file: null as File | null,
              previewUrl: "",
              duration: null as number | null,
              sourceMetadata: null as BoosterVideoSourceMetadata | null,
              storage: null as Pick<
                VideoPayload,
                "storagePath" | "publicUrl" | "url"
              > | null,
              transformedVariants: [] as NonNullable<
                VideoPayload["transformedVariants"]
              >,
            };

        if (cancelled) return;

        const nextIdea = String(payload.idea || "");
        const nextInstagramHashtags =
          String(payload.instagramHashtagsInput || "") ||
          (Array.isArray((nextPostsByChannel as any)?.instagram?.hashtags)
            ? (nextPostsByChannel as any).instagram.hashtags.join(" ")
            : "");
        const nextPinterestBoardId = String(payload.pinterestBoardId || "").trim();
        const nextPinterestBoardName = String(payload.pinterestBoardName || "").trim();

        setIdea(nextIdea);
        setTheme(nextTheme);
        setContentStyle(nextContentStyle);
        setChannels(nextChannels);
        setPostsByChannel(nextPostsByChannel);
        setInstagramHashtagsInput(nextInstagramHashtags);
        setPinterestBoardId(nextPinterestBoardId);
        setPinterestBoardName(nextPinterestBoardName);
        const effectiveMediaType = restoredVideo.file ? "video" : nextMediaType;
        setPublicationMediaType(effectiveMediaType);
        setChannelMediaModes(nextChannelMediaModes);
        setVideoFormatByChannel(nextCanonicalVideoFormatByChannel);
        setVideoAdaptationModeByChannel(
          nextCanonicalVideoAdaptationModeByChannel,
        );
        setImages(restoredFiles);
        setImagePreviews(restoredPreviews);
        setVideoFile(restoredVideo.file);
        setVideoPreviewUrl(restoredVideo.previewUrl);
        setVideoDurationSeconds(restoredVideo.duration);
        setVideoSourceMetadata(restoredVideo.sourceMetadata || null);
        setVideoStorageContext(restoredVideo.storage);
        setVideoTransformedVariants(restoredVideo.transformedVariants);
        const selectedDraftChannels = Object.entries(nextChannels)
          .filter(([, enabled]) => enabled)
          .map(([key]) => key as ChannelKey);
        setVideoVariantPreparationByChannel(
          buildVideoPreparationStateFromVariants({
            channels: selectedDraftChannels,
            mediaModeByChannel: nextChannelMediaModes,
            variants: restoredVideo.transformedVariants,
            settingsByChannel: nextCanonicalVideoSettingsByChannel,
          }),
        );
        setUseImagesForAI(nextUseImagesForAI);
        setImageMetaByKey(restoredMeta);
        setChannelImageEditors(nextEditors);
        setLoadedPublicationDraftId(publicationDraftIdParam);
        setDraftMessage("Brouillon chargé");

        const imageNames = restoredFiles.map((file) => ({
          name: file.name,
          type: file.type,
          size: file.size,
        }));
        const videoName = restoredVideo.file
          ? {
              name: restoredVideo.file.name,
              type: restoredVideo.file.type,
              size: restoredVideo.file.size,
              duration: restoredVideo.duration,
              sourceMetadata: restoredVideo.sourceMetadata || null,
            }
          : null;
        setLastPublicationDraftSnapshot(
          JSON.stringify({
            mediaType: effectiveMediaType,
            channelMediaModes: nextChannelMediaModes,
            videoFormatByChannel: nextCanonicalVideoFormatByChannel,
            videoAdaptationModeByChannel:
              nextCanonicalVideoAdaptationModeByChannel,
            videoSettingsByChannel: nextCanonicalVideoSettingsByChannel,
            idea: nextIdea.trim(),
            theme: nextTheme,
            contentStyle: nextContentStyle,
            channels: selectedDraftChannels,
            postsByChannel: nextPostsByChannel,
            instagramHashtagsInput: nextInstagramHashtags,
            pinterestBoardId: nextPinterestBoardId,
            pinterestBoardName: nextPinterestBoardName,
            imageNames,
            videoName,
            videoTransformedVariants: restoredVideo.transformedVariants,
            useImagesForAI: nextUseImagesForAI,
            imageSettingsByChannel: nextEditors,
          }),
        );
        onUnsavedChange?.(false);
      } catch (error) {
        if (cancelled) return;
        setPublishError(
          getSimpleFrenchErrorMessage(
            error,
            "Impossible de charger ce brouillon publication.",
          ),
        );
        setDraftMessage("");
      }
    };

    void loadPublicationDraft();
    return () => {
      cancelled = true;
    };
  }, [publicationDraftIdParam, loadedPublicationDraftId, onUnsavedChange]);

  useEffect(() => {
    return () => {
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    };
  }, [videoPreviewUrl]);

  const hasUnsavedChanges = useMemo(
    () =>
      hasDraftablePublicationContent &&
      currentPublicationDraftSnapshot !== lastPublicationDraftSnapshot,
    [
      hasDraftablePublicationContent,
      currentPublicationDraftSnapshot,
      lastPublicationDraftSnapshot,
    ],
  );

  useEffect(() => {
    onUnsavedChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onUnsavedChange]);

  useEffect(() => {
    if (!hasUnsavedChanges || saving || draftSaving) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges, saving, draftSaving]);

  const confirmDiscardPublicationWork = async (actionLabel: string) => {
    if (!hasUnsavedChanges) return true;
    return confirmInrcy({
      eyebrow: "Publication en cours",
      title: actionLabel,
      message:
        "Du contenu a déjà été saisi, généré ou retouché. Cette action peut supprimer votre travail en cours.",
      cancelLabel: "Continuer l’édition",
      confirmLabel: "Supprimer",
      variant: "danger",
    });
  };

  const toggle = (key: ChannelKey) => {
    if (!connected[key]) return;
    setChannels((s) => ({ ...s, [key]: !s[key] }));
  };

  const setAllChannelsSelected = (selected: boolean) => {
    setChannels((prev) =>
      CHANNEL_KEYS.reduce(
        (acc, key) => ({
          ...acc,
          [key]: connected[key] ? selected : false,
        }),
        { ...prev } as Record<ChannelKey, boolean>,
      ),
    );
    setChannelInfoOpen(null);
  };

  const getChannelDetailInfo = (key: ChannelKey) => {
    const detail = channelDetails[key] || EMPTY_CHANNEL_DETAILS[key];
    const rawLabel = String(detail?.label || detail?.href || "").trim();
    const simplifiedLabel = simplifyChannelDetail(key, rawLabel);
    if (!simplifiedLabel) return null;
    const desktopLabel = truncateText(simplifiedLabel, 34);
    const mobileLabel = truncateText(simplifiedLabel, 24);
    return {
      href: detail?.href || null,
      desktopLabel,
      mobileLabel,
      fullLabel: simplifiedLabel,
    };
  };

  const onThemeChange = (next: ThemeKey) => {
    setTheme(next);
  };

  const clearVideoMedia = (options?: {
    cleanupStorage?: boolean;
    reason?: string;
  }) => {
    clearVideoMediaState(options);
    videoAudioTranscriptCacheRef.current = null;
  };

  const clearPublicationWork = () => {
    setIdea("");
    setTheme("");
    setContentStyle("equilibre");
    setPostsByChannel({});
    setInstagramHashtagsInput("");
    closeEmptyContentWarnings();
    setGenError("");
    setDuplicateFeedback(null);
    setDraftMessage("");
    setLastPublicationDraftSnapshot(null);
    setFinalReviewOpen(false);
    setFinalReviewPosts(null);
    clearImagesMedia();
    clearVideoMedia({ cleanupStorage: true, reason: "reset-publication" });
    setPublicationMediaType("images");
    setChannelMediaModes({});
    setImgError("");
    setUseImagesForAI(true);
  };

  const onReset = async () => {
    const ok = await confirmDiscardPublicationWork(
      "Réinitialiser la publication ?",
    );
    if (!ok) return;
    clearPublicationWork();
  };

  const onGenerate = async () => {
    if (generating) return;
    setGenError("");

    const trimmed = idea.trim();
    if (!selectedChannels.length) {
      setGenError("Veuillez sélectionner au moins 1 canal avant de générer.");
      return;
    }
    if (!trimmed) {
      setGenError("Écrivez une phrase (ex : chantier terminé...).");
      return;
    }

    const shouldUseImagesForAI = images.length > 0 && useImagesForAI;
    const videoGenerationContext = buildBoosterVideoGenerationContext({
      mediaType: videoFile || videoPreviewUrl ? "video" : "images",
      videoFile,
      duration: videoDurationSeconds,
      storage: videoStorageContext,
    });
    const hasVideoForGeneration = !!videoGenerationContext?.enabled;

    clearGenerationTimers();
    setGenerating(true);
    setGenerationProgress(8);
    setGenerationStage("Préparation");
    setDuplicateFeedback(null);

    const generationSteps = [
      { percent: 16, label: "Préparation du brief", delay: 500 },
      { percent: 26, label: "Analyse de l’intention", delay: 1200 },
      ...(shouldUseImagesForAI
        ? [
            { percent: 36, label: "Préparation des images", delay: 2200 },
            { percent: 48, label: "Analyse des visuels", delay: 3800 },
          ]
        : hasVideoForGeneration
          ? [
              { percent: 34, label: "Préparation de la vidéo", delay: 1800 },
              {
                percent: 42,
                label: "Transcription audio de la vidéo",
                delay: 3200,
              },
              {
                percent: 52,
                label: "Extraction des images de la vidéo",
                delay: 5000,
              },
              {
                percent: 60,
                label: "Analyse audio + images de la vidéo",
                delay: 6800,
              },
            ]
          : [{ percent: 42, label: "Construction du contenu", delay: 2600 }]),
      {
        percent: 62,
        label: hasVideoForGeneration
          ? "Rédaction à partir de votre vidéo"
          : "Rédaction du contenu principal",
        delay: hasVideoForGeneration ? 8200 : 6200,
      },
      { percent: 70, label: "Adaptation par canal", delay: 7600 },
      { percent: 80, label: "Vérification des textes", delay: 10200 },
      { percent: 88, label: "Mise en forme", delay: 13200 },
      { percent: 94, label: "Finalisation", delay: 17000 },
      { percent: 97, label: "Encore quelques secondes...", delay: 23000 },
    ];
    generationTimersRef.current = generationSteps.map((step) =>
      window.setTimeout(() => {
        setGenerationProgress((current) => Math.max(current, step.percent));
        setGenerationStage(step.label);
      }, step.delay),
    );
    generationPulseTimerRef.current = window.setInterval(() => {
      setGenerationProgress((current) => {
        if (current >= 98) return current;
        const step = current < 60 ? 2 : 1;
        return Math.min(98, current + step);
      });
      setGenerationStage((current) => current || "Génération en cours");
    }, 1400);

    let didGenerate = false;
    try {
      const imagePreparationResults = shouldUseImagesForAI
        ? await Promise.allSettled(
            images.map((file) => fileToBoosterAiImagePayload(file)),
          )
        : [];
      const imagesForAI = imagePreparationResults.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      let videoFramesForAI: Awaited<
        ReturnType<typeof extractVideoFramesForAI>
      > = [];
      let videoAudioTranscript = "";
      let videoRawAudioTranscript = "";
      let videoAudioTranscriptStatus: "pending" | "ready" | "unavailable" =
        "pending";

      if (hasVideoForGeneration && videoFile) {
        setGenerationProgress((current) => Math.max(current, 36));
        setGenerationStage("Transcription audio de la vidéo");
        try {
          const cacheKey = makeVideoTranscriptCacheKey(videoFile);
          const cached =
            videoAudioTranscriptCacheRef.current?.key === cacheKey
              ? videoAudioTranscriptCacheRef.current
              : null;
          const transcript =
            cached || (await transcribeVideoAudioForAI(videoFile));

          if (transcript?.text) {
            videoAudioTranscript = transcript.text;
            videoRawAudioTranscript = transcript.rawText || transcript.text;
            videoAudioTranscriptStatus = "ready";
            videoAudioTranscriptCacheRef.current = {
              key: cacheKey,
              text: videoAudioTranscript,
              rawText: videoRawAudioTranscript,
            };
            setGenerationProgress((current) => Math.max(current, 44));
            setGenerationStage("Audio vidéo transcrit");
          } else {
            videoAudioTranscriptStatus = "unavailable";
            setGenerationProgress((current) => Math.max(current, 42));
            setGenerationStage(
              "Pas de parole exploitable, génération maintenue",
            );
          }
        } catch {
          videoAudioTranscriptStatus = "unavailable";
          setGenerationProgress((current) => Math.max(current, 42));
          setGenerationStage("Audio indisponible, génération maintenue");
        }

        setGenerationProgress((current) => Math.max(current, 48));
        setGenerationStage("Extraction des images de la vidéo");
        try {
          videoFramesForAI = await extractVideoFramesForAI(videoFile);
          setGenerationProgress((current) => Math.max(current, 60));
          setGenerationStage(
            videoFramesForAI.length > 0 && videoAudioTranscript
              ? "Analyse audio + images de la vidéo"
              : videoFramesForAI.length > 0
                ? "Analyse des images de la vidéo"
                : videoAudioTranscript
                  ? "Analyse audio de la vidéo"
                  : "Analyse vidéo limitée, génération maintenue",
          );
        } catch {
          videoFramesForAI = [];
          setGenerationProgress((current) => Math.max(current, 52));
          setGenerationStage(
            videoAudioTranscript
              ? "Analyse audio de la vidéo"
              : "Analyse visuelle indisponible, génération maintenue",
          );
        }
      }

      const res = await fetch("/api/booster/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea: trimmed,
          theme,
          style: contentStyle,
          channels: selectedForGeneration,
          mediaType: hasVideoForGeneration ? "video" : "images",
          useImagesForAI: imagesForAI.length > 0,
          imageCount: imagesForAI.length,
          imagesForAI,
          videoForAI:
            hasVideoForGeneration && videoGenerationContext
              ? {
                  ...videoGenerationContext,
                  visualFrames: videoFramesForAI,
                  audioTranscript: videoAudioTranscript,
                  rawAudioTranscript: videoRawAudioTranscript,
                  analysisPlan: {
                    ...videoGenerationContext.analysisPlan,
                    visualFrames:
                      videoFramesForAI.length > 0 ? "ready" : "pending",
                    audioTranscript: videoAudioTranscriptStatus,
                  },
                }
              : null,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGenError(
          getSimpleFrenchErrorMessage(
            json?.user_message || json?.error,
            "La génération n'a pas pu aboutir. Merci de réessayer.",
          ),
        );
        return;
      }

      const versions = json?.versions || {};
      setPostsByChannel(sanitizePostsForEditor(versions));
      didGenerate = true;
    } catch {
      setGenError(
        shouldUseImagesForAI
          ? "Impossible de préparer ou d’analyser les images pour le moment. Merci de réessayer."
          : hasVideoForGeneration
            ? "Impossible de préparer l’analyse vidéo pour le moment. Merci de réessayer."
            : "Connexion impossible pour le moment. Merci de réessayer.",
      );
    } finally {
      clearGenerationTimers();
      if (didGenerate) {
        setGenerationProgress(100);
        setGenerationStage("Terminé");
        window.setTimeout(() => {
          setGenerating(false);
          setGenerationProgress(0);
          setGenerationStage("");
        }, 500);
      } else {
        setGenerating(false);
        setGenerationProgress(0);
        setGenerationStage("");
      }
    }
  };

  const onDuplicateContentToAllChannels = async () => {
    const source = getDisplayPost(activeCard);
    const hasSourceContent = Boolean(
      String(source.title || "").trim() || String(source.content || "").trim(),
    );

    if (!hasSourceContent) {
      setDuplicateFeedback({
        kind: "error",
        message: "Ajoutez au moins un titre ou un contenu avant de dupliquer.",
      });
      return;
    }

    if (displayCards.length < 2) {
      setDuplicateFeedback({
        kind: "error",
        message: "Sélectionnez au moins 2 canaux pour utiliser la duplication.",
      });
      return;
    }

    const confirmed = await confirmInrcy({
      title: "Dupliquer le contenu ?",
      message: "Le titre et le contenu des autres canaux seront remplacés.",
      confirmLabel: "Dupliquer",
      variant: "warning",
    });
    if (!confirmed) return;

    const patch: Pick<ChannelPost, "title" | "content"> = {
      title: source.title,
      content: source.content,
    };
    const plainPatch: Pick<ChannelPost, "title" | "content"> = {
      title: stripSiteTextFormatting(source.title),
      content: stripSiteTextFormattingPreserveLayout(source.content),
    };

    setPostsByChannel((prev) => {
      const next: Partial<Record<ChannelKey, ChannelPost>> = { ...prev };
      for (const key of displayCards) {
        next[key] = {
          ...normalizePost(prev[key]),
          ...(isSiteDisplayKey(key) ? patch : plainPatch),
        };
      }
      return next;
    });

    setDuplicateFeedback({
      kind: "success",
      message: "Titre et contenu dupliqués sur tous les canaux affichés.",
    });
  };

  const onPickVideoClick = () => {
    setImgError("");
    videoInputRef.current?.click();
  };

  const removeVideo = () => {
    setImgError("");
    clearVideoMedia({ cleanupStorage: true, reason: "remove-video" });
    setPublicationMediaType("images");
    setChannelMediaModes((prev) => {
      const next: Partial<Record<ChannelKey, ChannelMediaMode>> = { ...prev };
      for (const key of Object.keys(next) as ChannelKey[]) {
        if (next[key] === "video")
          next[key] = images.length ? "images" : "none";
      }
      return next;
    });
  };

  const addVideoFile = async (file: File | null) => {
    if (!file) return;
    setImgError("");
    setVideoVariantPreparationByChannel({});
    setVideoTransformedVariants([]);

    if (!isBoosterVideoFile(file)) {
      setImgError("Ajoutez une vidéo valide : MP4/M4V, MOV ou WebM.");
      return;
    }

    if (file.size > BOOSTER_MAX_VIDEO_BYTES) {
      setImgError(
        `La vidéo ${file.name} dépasse ${BOOSTER_MAX_VIDEO_MB_LABEL}.`,
      );
      return;
    }

    let sourceMetadata: BoosterVideoSourceMetadata | null = null;
    try {
      sourceMetadata = await readVideoSourceMetadata(file);
    } catch {
      sourceMetadata = null;
    }
    const duration = sourceMetadata?.duration ?? null;

    clearVideoMedia({ cleanupStorage: true, reason: "replace-video" });
    const normalizedFile = new File([file], buildVideoFileName(file), {
      type: file.type || "video/mp4",
      lastModified: file.lastModified || Date.now(),
    });
    setPublicationMediaType("video");
    setVideoFile(normalizedFile);
    setVideoPreviewUrl(URL.createObjectURL(normalizedFile));
    setVideoDurationSeconds(duration);
    setVideoSourceMetadata(sourceMetadata);
    setVideoStorageContext(null);
    setVideoFormatByChannel((prev) => {
      const next: Partial<Record<ChannelKey, VideoFormat>> = { ...prev };
      for (const channel of selectedChannels.length
        ? selectedChannels
        : CHANNEL_KEYS) {
        next[channel] = getRecommendedVideoFormatForSource(
          channel,
          sourceMetadata,
        );
      }
      return next;
    });
    setVideoAdaptationModeByChannel((prev) => {
      const next: Partial<Record<ChannelKey, VideoAdaptationMode>> = {
        ...prev,
      };
      for (const channel of selectedChannels.length
        ? selectedChannels
        : CHANNEL_KEYS) {
        next[channel] = normalizeVideoAdaptationMode(
          next[channel] || "safe_blur",
        );
      }
      return next;
    });
    setUseImagesForAI(true);
    setChannelMediaModes((prev) => {
      const next: Partial<Record<ChannelKey, ChannelMediaMode>> = { ...prev };
      const hadImagesBeforeVideo = images.length > 0;
      for (const channel of selectedChannels) {
        const current = next[channel];
        const channelHasImages =
          channelSupportsImages(channel) &&
          (channelImageEditors[channel]?.imageKeys?.length || 0) > 0;

        if (channel === "youtube_shorts") {
          next[channel] = "video";
          continue;
        }

        if (hadImagesBeforeVideo && current === "images" && channelHasImages) {
          next[channel] = "images";
          continue;
        }

        if (hadImagesBeforeVideo && channelHasImages) {
          next[channel] = "images";
          continue;
        }

        if (
          hadImagesBeforeVideo &&
          current === "none" &&
          channelSupportsTextOnly(channel)
        ) {
          next[channel] = "none";
          continue;
        }

        next[channel] = "video";
      }
      return next;
    });
  };

  const onVideoChange = async (files: FileList | null) => {
    const file = files?.[0] || null;
    await addVideoFile(file);
  };

  async function mediaLibraryItemToFile(item: MediaLibraryPickerItem) {
    const url = String(item.signed_url || "").trim();
    if (!url) {
      throw new Error("Ce média n’a pas d’URL de lecture temporaire.");
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Impossible de lire ${item.title || item.storage_path}.`);
    }
    const blob = await response.blob();
    const fallbackName =
      item.storage_path.split("/").pop() ||
      (item.media_type === "video" ? "video-inrcy.mp4" : "image-inrcy.jpg");
    return new File([blob], item.title || fallbackName, {
      type:
        item.mime_type ||
        blob.type ||
        (item.media_type === "video" ? "video/mp4" : "image/jpeg"),
      lastModified: Date.now(),
    });
  }

  const addMediaLibrarySelection = async (items: MediaLibraryPickerItem[]) => {
    if (!items.length) return;
    setImgError("");
    const videos = items.filter((item) => item.media_type === "video");
    const imagesFromLibrary = items.filter(
      (item) => item.media_type === "image",
    );

    if (videos.length && imagesFromLibrary.length) {
      throw new Error(
        "Choisissez soit des images, soit une vidéo depuis la Médiathèque.",
      );
    }

    if (videos.length) {
      if (videos.length > 1) {
        throw new Error("Une seule vidéo peut être ajoutée à une publication.");
      }
      const file = await mediaLibraryItemToFile(videos[0]);
      await addVideoFile(file);
      return;
    }

    if (imagesFromLibrary.length) {
      const remaining = BOOSTER_MAX_IMAGE_COUNT - images.length;
      if (remaining <= 0) {
        throw new Error(`${BOOSTER_MAX_IMAGE_COUNT} images maximum.`);
      }
      const selectedImages = imagesFromLibrary.slice(0, remaining);
      const files = await Promise.all(
        selectedImages.map((item) => mediaLibraryItemToFile(item)),
      );
      await addImageFiles(files);
      if (imagesFromLibrary.length > selectedImages.length) {
        setImgError(
          `${selectedImages.length} image(s) ajoutée(s). Maximum ${BOOSTER_MAX_IMAGE_COUNT} images par publication.`,
        );
      }
    }
  };

  const onTakePhotoClick = async (targetChannel?: ChannelKey) => {
    setImgError("");
    if (images.length >= BOOSTER_MAX_IMAGE_COUNT) {
      setImgError(`Maximum ${BOOSTER_MAX_IMAGE_COUNT} images.`);
      return;
    }
    preservePublishScroll();
    setCameraCaptureTargetChannel(targetChannel ?? null);
    setCameraCaptureOpen(true);
  };

  const closeCameraCapture = () => {
    setCameraCaptureOpen(false);
    restorePublishScroll();
  };

  const onCameraCapture = async (file: File) => {
    if (isBoosterVideoFile(file) && cameraCaptureTargetChannel === null) {
      await addVideoFile(file);
    } else {
      await addImageFiles([file], cameraCaptureTargetChannel ?? undefined);
    }
    restorePublishScroll();
  };

  const updatePost = (
    channel: ChannelKey,
    patch: Partial<ChannelPost>,
    options?: { sanitize?: boolean },
  ) => {
    setPostsByChannel((prev) => {
      const current = normalizePost(prev[channel]);
      const nextPatch =
        options?.sanitize === false
          ? patch
          : sanitizePatchForEditor(channel, patch);
      const merged = {
        ...current,
        ...nextPatch,
      };

      return {
        ...prev,
        [channel]:
          options?.sanitize === false
            ? normalizePost(merged)
            : sanitizePostForEditor(channel, merged),
      };
    });
  };

  const getDisplayPost = (key: DisplayKey): ChannelPost => {
    return normalizePost(postsByChannel[key]);
  };

  const getPreviewCtaForDisplayKey = (key: DisplayKey, post: ChannelPost) => {
    const mode = post.ctaMode || "none";
    const explicit = String(post.cta || "").trim();
    const phone = String(post.ctaPhone || "").trim();
    if (mode === "none") return "";
    if (mode === "call") {
      const label =
        explicit || getChannelDefaultCtaLabel(key, "call") || "Appeler";
      return phone ? `${label} · ${phone}` : label;
    }
    if (explicit) return explicit;
    if (mode === "website") return getChannelDefaultCtaLabel(key, mode);
    if (mode === "message")
      return key === "instagram" ? "Message privé" : "Envoyer un message";
    return "";
  };

  const getLiveInstagramHashtags = () =>
    parseInstagramHashtagsInput(instagramHashtagsInput);

  const buildPreparedPostsByChannel = (): Partial<
    Record<ChannelKey, ChannelPost>
  > => {
    const prepared: Partial<Record<ChannelKey, ChannelPost>> = {
      ...postsByChannel,
      instagram: normalizePost({
        ...postsByChannel.instagram,
        hashtags: getLiveInstagramHashtags(),
      }),
    };
    for (const key of CHANNEL_KEYS) {
      if (isSiteDisplayKey(key)) continue;
      if (!prepared[key]) continue;
      prepared[key] = normalizePost({
        ...prepared[key],
        title: stripSiteTextFormatting(prepared[key]?.title || ""),
        content: stripSiteTextFormattingPreserveLayout(
          prepared[key]?.content || "",
        ),
        cta: stripSiteTextFormatting(prepared[key]?.cta || ""),
      });
    }

    return prepared;
  };

  const filterPostsForSelectedChannels = (
    preparedPosts: Partial<Record<ChannelKey, ChannelPost>>,
    channelsToKeep: ChannelKey[],
  ): Partial<Record<ChannelKey, ChannelPost>> => {
    return channelsToKeep.reduce(
      (acc, channel) => {
        const post = preparedPosts[channel];
        if (post) acc[channel] = post;
        return acc;
      },
      {} as Partial<Record<ChannelKey, ChannelPost>>,
    );
  };

  const getPreparedDisplayPost = (
    key: DisplayKey,
    preparedPosts: Partial<Record<ChannelKey, ChannelPost>>,
  ): ChannelPost => {
    return normalizePost(preparedPosts[key]);
  };

  const displayKeyForImageChannel = (channel: ChannelKey): DisplayKey =>
    channel;

  const getPublicationVideoPreviewForChannel = (channel: ChannelKey) => {
    const displayKey = displayKeyForImageChannel(channel);
    const post = getDisplayPost(displayKey);
    const selectedVideoFormat = normalizeVideoFormat(
      channel,
      videoFormatByChannel[channel] ||
        getRecommendedVideoFormatForSource(channel, videoSourceMetadata),
    );
    const selectedVideoAdaptation = normalizeVideoAdaptationMode(
      videoAdaptationModeByChannel[channel],
    );
    const signature = buildVideoTransformSignature(
      selectedVideoFormat,
      selectedVideoAdaptation,
    );
    const preparedVariant = videoTransformedVariants.find(
      (variant) => variant.signature === signature,
    );
    const preparedPreviewUrl = String(preparedVariant?.publicUrl || "").trim();
    const finalPreviewUrl = preparedPreviewUrl || videoPreviewUrl;
    return {
      channelKey: channel,
      channelLabel: getImageAdapterLabel(channel),
      mediaType: "video" as const,
      title: post.title,
      content: post.content,
      cta: getPreviewCtaForDisplayKey(displayKey, post),
      hashtags:
        displayKey === "instagram"
          ? getLiveInstagramHashtags()
          : post.hashtags || [],
      imageCount: 0,
      formatLabel: `Vidéo ${getVideoFormatLabel(channel, selectedVideoFormat, videoSourceMetadata)} · ${VIDEO_ADAPTATION_MODE_LABELS[selectedVideoAdaptation]}${preparedPreviewUrl ? " · Aperçu final" : ""}`,
      video: finalPreviewUrl
        ? {
            previewUrl: finalPreviewUrl,
            name: preparedVariant?.key || videoFile?.name || "video-inrcy.mp4",
            type:
              preparedVariant?.contentType || videoFile?.type || "video/mp4",
            size: preparedVariant?.size || videoFile?.size || 0,
            duration: preparedVariant?.duration ?? videoDurationSeconds,
            sourceMetadata: videoSourceMetadata,
            aspectRatio:
              VIDEO_FORMAT_ASPECT_RATIOS[selectedVideoFormat] || "16 / 9",
            fitMode: preparedPreviewUrl
              ? "contain"
              : selectedVideoAdaptation === "cover_crop"
                ? "cover"
                : "contain",
          }
        : null,
      image: null,
      images: [],
    };
  };

  const getPublicationPreviewForChannel = (channel: ChannelKey) => {
    const editor = channelImageEditors[channel] || {
      imageKeys: [],
      transforms: {},
    };
    const selectedKeys = editor.imageKeys || [];
    const firstImageKey = selectedKeys[0] || "";
    const transform = firstImageKey
      ? editor.transforms?.[firstImageKey] ||
        getOptimizedTransform(channel, imageMetaByKey[firstImageKey])
      : undefined;
    const displayKey = displayKeyForImageChannel(channel);
    const post = getDisplayPost(displayKey);
    return {
      channelKey: channel,
      channelLabel: getImageAdapterLabel(channel),
      title: post.title,
      content: post.content,
      cta: getPreviewCtaForDisplayKey(displayKey, post),
      hashtags:
        displayKey === "instagram"
          ? getLiveInstagramHashtags()
          : post.hashtags || [],
      imageCount: selectedKeys.length,
      formatLabel:
        channel === "inrcy_site" || channel === "site_web"
          ? "Rendu site / iframe"
          : channel === "tiktok"
            ? `Image verticale TikTok : ${CHANNEL_PRESETS[channel].width}×${CHANNEL_PRESETS[channel].height}`
            : `Image finale : ${CHANNEL_PRESETS[channel].width}×${CHANNEL_PRESETS[channel].height}`,
      image: firstImageKey
        ? {
            previewUrl: previewByKey[firstImageKey],
            transform,
            preset: CHANNEL_PRESETS[channel],
            imageMeta: imageMetaByKey[firstImageKey],
          }
        : null,
      images: selectedKeys.map((imageKey) => ({
        previewUrl: previewByKey[imageKey],
        transform:
          editor.transforms?.[imageKey] ||
          getOptimizedTransform(channel, imageMetaByKey[imageKey]),
        preset: CHANNEL_PRESETS[channel],
        imageMeta: imageMetaByKey[imageKey],
      })),
    };
  };

  const activePreviewChannel = selectedChannels.includes(activeImageChannel)
    ? activeImageChannel
    : selectedChannels[0] || "inrcy_site";

  const activePublicationPreview = (() => {
    if (!selectedChannels.length) return null;
    const mode = resolveChannelMediaMode(activePreviewChannel);
    if (mode === "video" && videoPreviewUrl)
      return getPublicationVideoPreviewForChannel(activePreviewChannel);
    if (mode === "images" && images.length)
      return getPublicationPreviewForChannel(activePreviewChannel);
    if (mode === "none") {
      const displayKey = displayKeyForImageChannel(activePreviewChannel);
      const post = getDisplayPost(displayKey);
      return {
        channelKey: activePreviewChannel,
        channelLabel: getImageAdapterLabel(activePreviewChannel),
        mediaType: "images" as const,
        title: post.title,
        content: post.content,
        cta: getPreviewCtaForDisplayKey(displayKey, post),
        hashtags:
          displayKey === "instagram"
            ? getLiveInstagramHashtags()
            : post.hashtags || [],
        imageCount: 0,
        formatLabel: "Texte seul",
        image: null,
        images: [],
        video: null,
      };
    }
    return null;
  })();

  const closeEmptyContentWarnings = () => {
    setEmptyContentWarningChannels([]);
    setEmptyContentWarningIndex(0);
  };

  const closeGmbNoImageWarning = () => {
    setGmbNoImageWarningOpen(false);
  };

  const applyPreferredCtaPrefill = (
    displayKey: DisplayKey,
    choice: BoosterPreferredCta,
  ) => {
    const current = getDisplayPost(displayKey);
    const patch = buildPreferredCtaPatch(
      displayKey,
      choice,
      current,
      ctaDefaults,
      ctaDefaults?.aiLanguage,
    );
    updatePost(displayKey, patch);
  };

  const applySiteContentFormat = (kind: "bold" | "italic" | "underline") => {
    if (!isSiteDisplayKey(activeCard) || typeof document === "undefined")
      return;
    const editor = siteContentEditorRef.current;
    if (!editor) return;

    try {
      editor.focus({ preventScroll: true });
    } catch {
      editor.focus();
    }
    const command =
      kind === "bold" ? "bold" : kind === "italic" ? "italic" : "underline";
    document.execCommand(command, false);
    updatePost(activeCard, {
      content: editableHtmlToSiteText(readSanitizedElementHtml(editor)),
    });
  };

  const runPublish = async (options?: {
    skipEmptyContentWarnings?: boolean;
    skipGmbNoImageWarning?: boolean;
    preparedPostsByChannel?: Partial<Record<ChannelKey, ChannelPost>>;
    tiktokPublicationSettings?: TiktokPublicationSettings | null;
    channels?: ChannelKey[];
    closeOnSuccess?: boolean;
    suppressPublishSuccess?: boolean;
    throwOnError?: boolean;
  }) => {
    if (saving || draftSaving) return;
    const preparedPostsByChannel =
      options?.preparedPostsByChannel || buildPreparedPostsByChannel();
    const publishTargetChannels = Array.from(
      new Set(options?.channels?.length ? options.channels : selectedChannels),
    ).filter((channel): channel is ChannelKey => Boolean(channel));

    setPublishError("");
    setDraftMessage("");
    setImgError("");
    setPublishProgress(0);
    setPublishProgressLabel("");
    scrollToPublishArea("smooth");

    if (!publishTargetChannels.length) {
      setPublishError("Sélectionnez au moins 1 canal.");
      return;
    }

    const reviewItems = buildFinalReviewItems(
      preparedPostsByChannel,
      publishTargetChannels,
    );
    const publishableChannels = reviewItems
      .filter((item) => item.blockers.length === 0)
      .map((item) => item.channel);
    const skippedChannels = reviewItems
      .filter((item) => item.blockers.length > 0)
      .map((item) => ({
        channel: item.channel,
        label: item.label,
        blockers: item.blockers,
      }));

    if (!publishableChannels.length) {
      setPublishError(
        "Aucun canal publiable. Corrigez les canaux rouges avant de publier.",
      );
      return;
    }

    const publishMediaModeByChannel = Object.fromEntries(
      publishableChannels.map((channel) => [
        channel,
        resolveChannelMediaMode(channel),
      ]),
    ) as Partial<Record<ChannelKey, ChannelMediaMode>>;
    const hasAnyVideoPublish = publishableChannels.some(
      (channel) => publishMediaModeByChannel[channel] === "video",
    );
    const hasAnyImagePublish = publishableChannels.some(
      (channel) => publishMediaModeByChannel[channel] === "images",
    );

    if (hasAnyVideoPublish && !videoFile) {
      setImgError(
        "Ajoutez une vidéo avant de publier ou choisissez Photos / Aucun média par canal.",
      );
      return;
    }

    const missingContentChannels = publishableChannels.filter(
      (ch) => !String(preparedPostsByChannel[ch]?.content || "").trim(),
    );
    if (missingContentChannels.length && !options?.skipEmptyContentWarnings) {
      setPostsByChannel(preparedPostsByChannel);
      setPendingPublishPosts(preparedPostsByChannel);
      setEmptyContentWarningChannels(missingContentChannels);
      setEmptyContentWarningIndex(0);
      return;
    }

    const gmbImages = channelImageEditors.gmb?.imageKeys || [];
    if (
      publishMediaModeByChannel.gmb === "images" &&
      publishableChannels.includes("gmb") &&
      !gmbImages.length &&
      !options?.skipGmbNoImageWarning
    ) {
      closeEmptyContentWarnings();
      setPostsByChannel(preparedPostsByChannel);
      setPendingPublishPosts(preparedPostsByChannel);
      setGmbNoImageWarningOpen(true);
      return;
    }

    closeEmptyContentWarnings();
    setGmbNoImageWarningOpen(false);
    setPendingPublishPosts(null);
    setPostsByChannel(preparedPostsByChannel);

    if (publishableChannels.includes("instagram")) {
      const instagramMode = publishMediaModeByChannel.instagram || "none";
      const instagramImages = channelImageEditors.instagram?.imageKeys || [];
      if (instagramMode === "none") {
        setImgError("Instagram nécessite une vidéo ou au moins 1 image.");
        return;
      }
      if (instagramMode === "images" && !instagramImages.length) {
        setImgError(
          "Veuillez ajouter au moins 1 image pour publier sur Instagram.",
        );
        return;
      }
      if (instagramMode === "video" && !videoFile) {
        setImgError("Veuillez ajouter une vidéo pour publier sur Instagram.");
        return;
      }
    }

    if (publishableChannels.includes("pinterest")) {
      if (!pinterestBoardId) {
        setPublishError("Choisissez un tableau Pinterest avant de publier.");
        return;
      }
      const pinterestImages = channelImageEditors.pinterest?.imageKeys || [];
      if (
        publishMediaModeByChannel.pinterest !== "images" ||
        !pinterestImages.length
      ) {
        setImgError(
          "Veuillez ajouter au moins 1 image pour publier sur Pinterest.",
        );
        return;
      }
    }

    const isVideoPublication = hasAnyVideoPublish;
    setSaving(true);
    setPublishProgress(5);
    setPublishProgressLabel(
      isVideoPublication
        ? "Préparation de la publication vidéo..."
        : "Préparation de la publication...",
    );

    try {
      const emptyChannelImages = {} as ChannelImagePayload;
      const emptyChannelSettings = {} as ChannelImageSettingsPayload;
      const { channelImages, channelSettings } = !hasAnyImagePublish
        ? {
            channelImages: emptyChannelImages,
            channelSettings: emptyChannelSettings,
          }
        : await buildChannelImagesPayload((current, total) => {
            if (!total) {
              setPublishProgress(25);
              setPublishProgressLabel("Préparation des contenus...");
              return;
            }
            const ratio = current / total;
            setPublishProgress(clampPercent(8 + ratio * 27));
            setPublishProgressLabel(
              `Préparation des images ${clampPercent(ratio * 100)}%`,
            );
          });

      const originalImageByKey: Record<string, ImagePayload> =
        !hasAnyImagePublish
          ? {}
          : await (async () => {
              setPublishProgress((prev) => Math.max(prev, 35));
              setPublishProgressLabel("Upload des images originales...");
              return await uploadOriginalImagesForPublication(
                (current, total) => {
                  if (!total) return;
                  const ratio = current / total;
                  setPublishProgress(clampPercent(35 + ratio * 12));
                  setPublishProgressLabel(
                    `Upload des images originales ${clampPercent(ratio * 100)}%`,
                  );
                },
              );
            })();

      if (hasAnyImagePublish) {
        setPublishProgress((prev) => Math.max(prev, images.length ? 47 : 35));
        setPublishProgressLabel("Upload des images adaptées...");
      }

      const uploadedChannelImages = {} as ChannelImagePayload;
      const uploadTargets = !hasAnyImagePublish
        ? 0
        : publishableChannels.reduce(
            (sum, channel) =>
              sum +
              (channelImages[channel] || []).filter((image) => !!image?.dataUrl)
                .length,
            0,
          );
      let uploadedCount = 0;
      if (hasAnyImagePublish) {
        for (const channel of publishableChannels) {
          if (publishMediaModeByChannel[channel] !== "images") continue;
          const uploadedImages = await uploadPreparedImages(
            channelImages[channel] || [],
            (current, total) => {
              if (!total) return;
              uploadedCount += 1;
              const ratio = uploadTargets ? uploadedCount / uploadTargets : 1;
              setPublishProgress(
                clampPercent(
                  (images.length ? 47 : 35) + ratio * (images.length ? 23 : 35),
                ),
              );
              setPublishProgressLabel(
                `Upload des images adaptées ${clampPercent(ratio * 100)}%`,
              );
            },
          );
          const imageKeysForChannel = channelSettings[channel]?.imageKeys || [];
          uploadedChannelImages[channel] = uploadedImages.map(
            (image, index) => {
              const imageKey = imageKeysForChannel[index] || "";
              const original = imageKey
                ? originalImageByKey[imageKey]
                : undefined;
              const originalUrl = String(
                original?.publicUrl ||
                  original?.originalPublicUrl ||
                  original?.originalUrl ||
                  "",
              ).trim();
              return {
                ...image,
                renderedUrl: image.publicUrl || image.renderedUrl || "",
                imageKey,
                originalUrl,
                originalPublicUrl: originalUrl,
                originalStoragePath:
                  original?.storagePath || original?.originalStoragePath || "",
                originalName: original?.name || image.name,
                originalType: original?.type || image.type,
                transform: imageKey
                  ? channelSettings[channel]?.transforms?.[imageKey]
                  : undefined,
                imageMeta: imageKey ? imageMetaByKey[imageKey] : undefined,
              };
            },
          );
        }
      }

      let publicationVideo: any = null;
      if (hasAnyVideoPublish) {
        setPublishProgress((prev) => Math.max(prev, 35));
        setPublishProgressLabel("Upload de la vidéo...");
        publicationVideo = await uploadPublicationVideoForPublish();
        if (!publicationVideo?.publicUrl && !publicationVideo?.url) {
          throw new Error(
            "La vidéo n’a pas pu être préparée pour la publication.",
          );
        }
        publicationVideo = await preparePublicationVideoVariants(
          publicationVideo,
          publishableChannels,
          publishMediaModeByChannel,
        );
      }

      setPublishProgress((prev) => Math.max(prev, 74));
      publishPulseProgressRef.current = 74;
      setPublishProgressLabel("Création de l’historique iNr’Send...");
      if (publishPulseTimerRef.current)
        window.clearInterval(publishPulseTimerRef.current);

      const publishStartedAt = Date.now();
      const publishChannels = [...publishableChannels];
      const estimatedPublishMs = Math.max(
        9000,
        5500 +
          publishChannels.length * 6500 +
          (uploadTargets ? 2500 : 0) +
          (hasAnyVideoPublish ? 2500 : 0),
      );
      const getPublishPulseLabel = (ratio: number) => {
        if (ratio < 0.08) return "Création de l’historique iNr’Send...";
        if (ratio < 0.78 && publishChannels.length) {
          const channelRatio = Math.max(0, (ratio - 0.08) / 0.7);
          const channelIndex = Math.min(
            publishChannels.length - 1,
            Math.floor(channelRatio * publishChannels.length),
          );
          const channel = publishChannels[channelIndex];
          const label = CHANNEL_LABELS[channel] || channel;
          return publishChannels.length > 1
            ? `Canal ${channelIndex + 1}/${publishChannels.length} — publication sur ${label}...`
            : `Publication sur ${label}...`;
        }
        if (ratio < 0.86) return "Récupération des retours canaux...";
        if (ratio < 0.93) return "Vérification des succès et erreurs...";
        return "Finalisation dans iNr’Send...";
      };

      publishPulseTimerRef.current = window.setInterval(() => {
        const ratio = Math.min(
          1,
          (Date.now() - publishStartedAt) / estimatedPublishMs,
        );
        publishPulseProgressRef.current = clampPercent(74 + ratio * 24, 74, 98);
        setPublishProgressLabel(getPublishPulseLabel(ratio));
        setPublishProgress((prev) =>
          Math.max(prev, publishPulseProgressRef.current),
        );
      }, 500);

      const result = await trackEvent("publish", {
        mediaType: publicationVideo ? "video" : "images",
        mediaModeByChannel: publishMediaModeByChannel,
        videoFormatByChannel,
        videoAdaptationModeByChannel,
        videoSettingsByChannel,
        video: publicationVideo,
        idea: idea.trim(),
        theme,
        channels: publishableChannels,
        postByChannel: filterPostsForSelectedChannels(
          preparedPostsByChannel,
          publishableChannels,
        ),
        // Avoid sending the same images twice (base images + channel images),
        // which can make the JSON body too large and trigger HTTP 413.
        // The API now rebuilds the fallback/base image set from channel images.
        images: [],
        imagesByChannel: uploadedChannelImages,
        imageSettingsByChannel: channelSettings,
        tiktokPublicationSettings: publishableChannels.includes("tiktok")
          ? options?.tiktokPublicationSettings || tiktokPublicationSettings
          : null,
        pinterestPublicationSettings: publishableChannels.includes("pinterest")
          ? { boardId: pinterestBoardId, boardName: pinterestBoardName }
          : null,
      });

      if (publishPulseTimerRef.current) {
        window.clearInterval(publishPulseTimerRef.current);
        publishPulseTimerRef.current = null;
      }
      setPublishProgress(100);
      setPublishProgressLabel(result?.summary?.allFailed ? "Échec" : "Publié");
      await sleep(220);
      onUnsavedChange?.(false);
      const channelLinks = Object.fromEntries(
        publishableChannels.map((channel) => [
          channel,
          normalizeExternalHref(channelDetails[channel]?.href),
        ]),
      );
      if (!options?.suppressPublishSuccess) {
        onPublishSuccess?.({ ...result, channelLinks, skippedChannels });
      }
      if (options?.closeOnSuccess !== false) {
        onClose();
      }
    } catch (e) {
      if (publishPulseTimerRef.current) {
        window.clearInterval(publishPulseTimerRef.current);
        publishPulseTimerRef.current = null;
      }
      setPublishProgress(0);
      setPublishProgressLabel("");
      const message = getSimpleFrenchErrorMessage(
        e,
        "La publication n'a pas pu être envoyée. Merci de réessayer.",
      );
      setPublishError(message);
      if (options?.throwOnError) {
        throw new Error(message);
      }
    } finally {
      setSaving(false);
    }
  };

  const onSavePublicationDraft = async () => {
    if (saving || draftSaving) return;

    setPublishError("");
    setDraftMessage("");

    if (!hasDraftablePublicationContent) {
      setPublishError(
        "Ajoutez un contenu ou un média avant d’enregistrer le brouillon.",
      );
      scrollToPublishArea("smooth");
      return;
    }

    if (!selectedChannels.length) {
      setPublishError(
        "Sélectionnez au moins 1 canal avant d’enregistrer le brouillon.",
      );
      scrollToPublishArea("smooth");
      return;
    }

    const preparedPostsByChannel = filterPostsForSelectedChannels(
      buildPreparedPostsByChannel(),
      selectedChannels,
    );
    const imageNames = images.map((file) => ({
      name: file.name,
      type: file.type,
      size: file.size,
    }));
    const videoName = videoFile
      ? {
          name: videoFile.name,
          type: videoFile.type,
          size: videoFile.size,
          duration: videoDurationSeconds,
        }
      : null;
    const channelLabels = selectedChannels
      .map((channel) => CHANNEL_LABELS[channel] || channel)
      .join(" / ");
    const firstTitle = selectedChannels
      .map((channel) =>
        String(preparedPostsByChannel[channel]?.title || "").trim(),
      )
      .find(Boolean);
    const firstContent = selectedChannels
      .map((channel) =>
        String(preparedPostsByChannel[channel]?.content || "").trim(),
      )
      .find(Boolean);

    setDraftSaving(true);
    try {
      setDraftMessage(videoFile ? "Sauvegarde vidéo…" : "Enregistrement…");
      const imageDrafts = images.length
        ? await uploadPublicationDraftImages()
        : [];
      const videoDraft = await buildPublicationDraftVideoPayload();
      const response = await fetch("/api/booster/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "publish_draft",
          draftId:
            loadedPublicationDraftId || publicationDraftIdParam || undefined,
          payload: {
            status: "draft",
            title: firstTitle || "Brouillon publication",
            preview: firstContent || idea.trim() || channelLabels,
            content: firstContent || "",
            idea: idea.trim(),
            theme,
            contentStyle,
            channel: channelLabels,
            channels: selectedChannels,
            postByChannel: preparedPostsByChannel,
            mediaType: videoFile ? "video" : "images",
            channelMediaModes,
            videoFormatByChannel,
            videoAdaptationModeByChannel,
            videoSettingsByChannel,
            imageNames: imageNames,
            videoName: videoName,
            videoSourceMetadata,
            imageDrafts,
            videoDraft,
            useImagesForAI,
            imageSettingsByChannel: getDraftImageSettingsByChannel(),
            instagramHashtagsInput,
            pinterestBoardId,
            pinterestBoardName,
            saved_at: new Date().toISOString(),
          },
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          String(
            result?.error ||
              "Impossible d’enregistrer le brouillon publication.",
          ),
        );
      }
      const savedDraftId = String(
        result?.id || loadedPublicationDraftId || publicationDraftIdParam || "",
      ).trim();
      if (videoDraft) {
        const draftVariants = normalizeRestoredVideoVariants(
          (videoDraft as any).transformedVariants,
        );
        setVideoStorageContext({
          storagePath: videoDraft.storagePath || "",
          publicUrl: videoDraft.publicUrl || videoDraft.url || "",
          url: videoDraft.url || videoDraft.publicUrl || "",
        });
        if (draftVariants.length) {
          setVideoTransformedVariants(draftVariants);
          setVideoVariantPreparationByChannel((prev) => ({
            ...prev,
            ...buildVideoPreparationStateFromVariants({
              channels: selectedChannels,
              mediaModeByChannel: channelMediaModes,
              variants: draftVariants,
            }),
          }));
        }
      }
      if (savedDraftId) {
        setLoadedPublicationDraftId(savedDraftId);
        router.replace(
          `/dashboard?action=publish&draftId=${encodeURIComponent(savedDraftId)}`,
          { scroll: false },
        );
      }
      setLastPublicationDraftSnapshot(currentPublicationDraftSnapshot);
      onUnsavedChange?.(false);
      setDraftMessage("Brouillon enregistré");
    } catch (e) {
      setPublishError(
        getSimpleFrenchErrorMessage(
          e,
          "Impossible d’enregistrer le brouillon publication.",
        ),
      );
    } finally {
      setDraftSaving(false);
    }
  };

  useEffect(() => {
    if (!saveDraftActionRef) return;
    saveDraftActionRef.current = onSavePublicationDraft;
    return () => {
      if (saveDraftActionRef.current === onSavePublicationDraft) {
        saveDraftActionRef.current = null;
      }
    };
  }, [saveDraftActionRef, onSavePublicationDraft]);

  const openSchedulePublicationModal = () => {
    if (saving || draftSaving || scheduleSaving) return;
    const preparedPostsByChannel = buildPreparedPostsByChannel();
    setPublishError("");
    setScheduleError("");
    setDraftMessage("");
    setImgError("");
    setTiktokPublicationSettings(null);

    if (!selectedChannels.length) {
      setPublishError("Sélectionnez au moins 1 canal à programmer.");
      scrollToPublishArea("smooth");
      return;
    }

    setPostsByChannel(preparedPostsByChannel);
    setScheduleReviewPosts(preparedPostsByChannel);
    setScheduleModalOpen(true);
  };

  const buildChannelRecord = <T,>(
    source: Partial<Record<ChannelKey, T>>,
    channels: ChannelKey[],
  ): Partial<Record<ChannelKey, T>> =>
    Object.fromEntries(
      channels
        .map((channel) => [channel, source[channel]] as const)
        .filter(
          (entry): entry is readonly [ChannelKey, T] => entry[1] !== undefined,
        ),
    ) as Partial<Record<ChannelKey, T>>;

  const buildChannelUnknownRecord = (
    source: Partial<Record<ChannelKey, unknown>>,
    channels: ChannelKey[],
  ): Partial<Record<ChannelKey, unknown>> =>
    Object.fromEntries(
      channels
        .map((channel) => [channel, source[channel]] as const)
        .filter((entry) => entry[1] !== undefined),
    ) as Partial<Record<ChannelKey, unknown>>;

  const performSchedulePublication = async (
    selections: PublishScheduleSelection[],
    preparedPostsByChannel: Partial<Record<ChannelKey, ChannelPost>>,
    tiktokSettingsForSchedule: TiktokPublicationSettings | null,
    immediateChannels: ChannelKey[] = [],
  ): Promise<PendingImmediatePublishAfterSchedule | null | undefined> => {
    if (saving || draftSaving || scheduleSaving) return;

    const channelsToSchedule = Array.from(
      new Set(selections.map((selection) => selection.channel)),
    ).filter((channel): channel is ChannelKey =>
      selectedChannels.includes(channel),
    );

    if (!channelsToSchedule.length) {
      setScheduleError("Sélectionnez au moins un canal à programmer.");
      return;
    }

    const immediateChannelsToPublish = Array.from(new Set(immediateChannels))
      .filter((channel): channel is ChannelKey =>
        selectedChannels.includes(channel),
      )
      .filter((channel) => !channelsToSchedule.includes(channel));

    const reviewItems = buildFinalReviewItems(
      preparedPostsByChannel,
      channelsToSchedule,
    );
    const blocked = reviewItems.filter((item) => item.blockers.length > 0);
    if (blocked.length) {
      setScheduleError(
        `Certains canaux ne sont pas prêts : ${blocked
          .map((item) => item.label)
          .join(" / ")}.`,
      );
      return;
    }

    const publishMediaModeByChannel = Object.fromEntries(
      channelsToSchedule.map((channel) => [
        channel,
        resolveChannelMediaMode(channel),
      ]),
    ) as Partial<Record<ChannelKey, ChannelMediaMode>>;
    const hasAnyVideoPublish = channelsToSchedule.some(
      (channel) => publishMediaModeByChannel[channel] === "video",
    );
    const hasAnyImagePublish = channelsToSchedule.some(
      (channel) => publishMediaModeByChannel[channel] === "images",
    );

    if (hasAnyVideoPublish && !videoFile) {
      setScheduleError("Ajoutez une vidéo avant de programmer ces canaux.");
      return;
    }

    setScheduleSaving(true);
    setPublishError("");
    setScheduleError("");
    setDraftMessage("");
    setImgError("");
    setPublishProgress(5);
    setPublishProgressLabel("Préparation de la programmation...");
    scrollToPublishArea("smooth");

    try {
      const emptyChannelImages = {} as ChannelImagePayload;
      const emptyChannelSettings = {} as ChannelImageSettingsPayload;
      const { channelImages, channelSettings } = !hasAnyImagePublish
        ? {
            channelImages: emptyChannelImages,
            channelSettings: emptyChannelSettings,
          }
        : await buildChannelImagesPayload((current, total) => {
            if (!total) {
              setPublishProgress(20);
              setPublishProgressLabel("Préparation des contenus...");
              return;
            }
            const ratio = current / total;
            setPublishProgress(clampPercent(8 + ratio * 22));
            setPublishProgressLabel(
              `Préparation des images ${clampPercent(ratio * 100)}%`,
            );
          });

      const originalImageByKey: Record<string, ImagePayload> =
        !hasAnyImagePublish
          ? {}
          : await (async () => {
              setPublishProgress(32);
              setPublishProgressLabel("Upload des images originales...");
              return await uploadOriginalImagesForPublication(
                (current, total) => {
                  if (!total) return;
                  const ratio = current / total;
                  setPublishProgress(clampPercent(32 + ratio * 12));
                  setPublishProgressLabel(
                    `Upload des images originales ${clampPercent(ratio * 100)}%`,
                  );
                },
              );
            })();

      const uploadedChannelImages = {} as ChannelImagePayload;
      if (hasAnyImagePublish) {
        setPublishProgress(48);
        setPublishProgressLabel("Upload des images adaptées...");
        let uploadedCount = 0;
        const uploadTargets = channelsToSchedule.reduce(
          (sum, channel) =>
            sum +
            (channelImages[channel] || []).filter((image) => !!image?.dataUrl)
              .length,
          0,
        );
        for (const channel of channelsToSchedule) {
          if (publishMediaModeByChannel[channel] !== "images") continue;
          const uploadedImages = await uploadPreparedImages(
            channelImages[channel] || [],
            () => {
              uploadedCount += 1;
              const ratio = uploadTargets ? uploadedCount / uploadTargets : 1;
              setPublishProgress(clampPercent(48 + ratio * 22));
              setPublishProgressLabel(
                `Upload des images adaptées ${clampPercent(ratio * 100)}%`,
              );
            },
          );
          const imageKeysForChannel = channelSettings[channel]?.imageKeys || [];
          uploadedChannelImages[channel] = uploadedImages.map(
            (image, index) => {
              const imageKey = imageKeysForChannel[index] || "";
              const original = imageKey
                ? originalImageByKey[imageKey]
                : undefined;
              const originalUrl = String(
                original?.publicUrl ||
                  original?.originalPublicUrl ||
                  original?.originalUrl ||
                  "",
              ).trim();
              return {
                ...image,
                renderedUrl: image.publicUrl || image.renderedUrl || "",
                imageKey,
                originalUrl,
                originalPublicUrl: originalUrl,
                originalStoragePath:
                  original?.storagePath || original?.originalStoragePath || "",
                originalName: original?.name || image.name,
                originalType: original?.type || image.type,
                transform: imageKey
                  ? channelSettings[channel]?.transforms?.[imageKey]
                  : undefined,
                imageMeta: imageKey ? imageMetaByKey[imageKey] : undefined,
              };
            },
          );
        }
      }

      let publicationVideo: any = null;
      if (hasAnyVideoPublish) {
        setPublishProgress(48);
        setPublishProgressLabel("Upload de la vidéo...");
        publicationVideo = await uploadPublicationVideoForPublish();
        if (!publicationVideo?.publicUrl && !publicationVideo?.url) {
          throw new Error(
            "La vidéo n’a pas pu être préparée pour la programmation.",
          );
        }
        publicationVideo = await preparePublicationVideoVariants(
          publicationVideo,
          channelsToSchedule,
          publishMediaModeByChannel,
        );
      }

      setPublishProgress(76);
      setPublishProgressLabel("Enregistrement dans iNr’Agent...");

      const selectionByChannel = new Map(
        selections.map((selection) => [
          selection.channel,
          selection.scheduledAt,
        ]),
      );

      const scheduleGroups = Array.from(
        channelsToSchedule.reduce((groups, channel) => {
          const scheduledAt = selectionByChannel.get(channel);
          if (!scheduledAt) return groups;
          const existing = groups.get(scheduledAt) || [];
          existing.push(channel);
          groups.set(scheduledAt, existing);
          return groups;
        }, new Map<string, ChannelKey[]>()),
      );

      for (let index = 0; index < scheduleGroups.length; index += 1) {
        const [scheduledAt, groupChannels] = scheduleGroups[index];
        const labels = groupChannels
          .map((channel) => CHANNEL_LABELS[channel] || channel)
          .join(", ");
        const isMultichannel = groupChannels.length > 1;
        const response = await fetch("/api/agent/scheduled-actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            automationKey: "publish",
            actionType: "publication",
            targetTool: "booster",
            source: "manual",
            title: isMultichannel
              ? `Publication multicanale (${groupChannels.length} canaux)`
              : `Publication ${labels}`,
            summary: isMultichannel
              ? `Publication programmée sur ${labels}`
              : `Publication programmée sur ${labels}`,
            scheduledAt,
            timezone: "Europe/Paris",
            channels: groupChannels,
            payload: {
              origin: {
                source: "booster_scheduled",
                label: "Booster programmé",
                workflowTool: "booster",
                workflowAction: "publier",
              },
              kind: "manual_publish_schedule",
              scheduleGrouping: {
                mode: "multichannel_single_action",
                channelCount: groupChannels.length,
                createdFrom: "booster_publish_schedule",
              },
              publishPayload: {
                source: "booster_scheduled",
                origin: {
                  source: "booster_scheduled",
                  label: "Booster programmé",
                  workflowTool: "booster",
                  workflowAction: "publier",
                },
                mediaType: publicationVideo ? "video" : "images",
                mediaModeByChannel: buildChannelUnknownRecord(
                  publishMediaModeByChannel,
                  groupChannels,
                ),
                videoFormatByChannel: buildChannelUnknownRecord(
                  videoFormatByChannel,
                  groupChannels,
                ),
                videoAdaptationModeByChannel: buildChannelUnknownRecord(
                  videoAdaptationModeByChannel,
                  groupChannels,
                ),
                videoSettingsByChannel: buildChannelUnknownRecord(
                  videoSettingsByChannel as Partial<
                    Record<ChannelKey, unknown>
                  >,
                  groupChannels,
                ),
                video: publicationVideo,
                idea: idea.trim(),
                theme,
                channels: groupChannels,
                postByChannel: filterPostsForSelectedChannels(
                  preparedPostsByChannel,
                  groupChannels,
                ),
                images: [],
                imagesByChannel: buildChannelRecord(
                  uploadedChannelImages,
                  groupChannels,
                ),
                imageSettingsByChannel: buildChannelRecord(
                  channelSettings,
                  groupChannels,
                ),
                tiktokPublicationSettings: groupChannels.includes("tiktok")
                  ? tiktokSettingsForSchedule
                  : null,
                pinterestPublicationSettings: groupChannels.includes("pinterest")
                  ? { boardId: pinterestBoardId, boardName: pinterestBoardName }
                  : null,
              },
            },
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            String(
              result?.error || "Programmation de la publication impossible.",
            ),
          );
        }
        setPublishProgress(
          clampPercent(76 + ((index + 1) / scheduleGroups.length) * 20),
        );
      }

      setChannels((prev) => {
        const next = { ...prev };
        for (const channel of [
          ...channelsToSchedule,
          ...immediateChannelsToPublish,
        ]) {
          next[channel] = false;
        }
        return next;
      });
      setPublishProgress(100);
      setPublishProgressLabel(
        immediateChannelsToPublish.length
          ? "Programmation enregistrée, envoi des autres canaux..."
          : "Publication confiée à iNr’Agent.",
      );
      setDraftMessage(
        channelsToSchedule.length > 1
          ? `Publication multicanale programmée dans iNr’Agent (${channelsToSchedule.length} canaux).`
          : "Publication programmée dans iNr’Agent.",
      );

      const immediatePublishRequest = immediateChannelsToPublish.length
        ? {
            immediateChannels: immediateChannelsToPublish,
            preparedPostsByChannel,
            tiktokSettingsForSchedule: immediateChannelsToPublish.includes(
              "tiktok",
            )
              ? tiktokSettingsForSchedule
              : null,
          }
        : null;
      setPendingImmediatePublishAfterSchedule(immediatePublishRequest);

      setScheduleReviewPosts(null);
      setTiktokPublicationSettings(null);
      setTiktokSettingsFlow(null);
      setPendingScheduleRequest(null);
      onUnsavedChange?.(false);
      return immediatePublishRequest;
    } catch (e) {
      const message = getSimpleFrenchErrorMessage(
        e,
        "Programmation de la publication impossible.",
      );
      setScheduleError(message);
      setPublishError(message);
      throw new Error(message);
    } finally {
      setScheduleSaving(false);
    }
  };

  function publishImmediateChannelsAfterSchedule(
    request: PendingImmediatePublishAfterSchedule,
  ) {
    if (!request.immediateChannels.length) return;
    void runPublish({
      skipEmptyContentWarnings: true,
      skipGmbNoImageWarning: true,
      preparedPostsByChannel: request.preparedPostsByChannel,
      tiktokPublicationSettings: request.tiktokSettingsForSchedule,
      channels: request.immediateChannels,
      closeOnSuccess: false,
      throwOnError: false,
    });
  }

  const confirmSchedulePublication = async (
    selections: PublishScheduleSelection[],
    immediateChannels: ChannelKey[] = [],
  ) => {
    const preparedPostsByChannel =
      scheduleReviewPosts || buildPreparedPostsByChannel();
    const tiktokWillSchedule = selections.some(
      (selection) => selection.channel === "tiktok",
    );
    const tiktokWillPublishNow = immediateChannels.includes("tiktok");
    if (
      (tiktokWillSchedule || tiktokWillPublishNow) &&
      !tiktokPublicationSettings
    ) {
      setPendingScheduleRequest({
        selections,
        immediateChannels,
        preparedPostsByChannel,
      });
      setTiktokSettingsFlow("schedule");
      setScheduleModalOpen(false);
      setTiktokSettingsOpen(true);
      throw new Error("");
    }

    await performSchedulePublication(
      selections,
      preparedPostsByChannel,
      tiktokWillSchedule || tiktokWillPublishNow
        ? tiktokPublicationSettings
        : null,
      immediateChannels,
    );
  };

  const onPublish = async () => {
    if (saving || draftSaving || scheduleSaving) return;
    const preparedPostsByChannel = buildPreparedPostsByChannel();
    setPublishError("");
    setDraftMessage("");
    setImgError("");
    setPublishProgress(0);
    setPublishProgressLabel("");

    if (!selectedChannels.length) {
      setPublishError("Sélectionnez au moins 1 canal.");
      scrollToPublishArea("smooth");
      return;
    }

    closeEmptyContentWarnings();
    closeGmbNoImageWarning();
    setPostsByChannel(preparedPostsByChannel);
    setPendingPublishPosts(preparedPostsByChannel);
    setFinalReviewPosts(preparedPostsByChannel);

    const reviewItems = buildFinalReviewItems(preparedPostsByChannel);
    const tiktokReviewItem = reviewItems.find(
      (item) => item.channel === "tiktok",
    );
    setTiktokPublicationSettings(null);
    if (tiktokReviewItem && tiktokReviewItem.blockers.length === 0) {
      setTiktokSettingsFlow("publish");
      setTiktokSettingsOpen(true);
      return;
    }

    setFinalReviewOpen(true);
  };

  const currentEmptyContentWarningChannel =
    emptyContentWarningChannels[emptyContentWarningIndex] || null;

  const onValidateEmptyContentWarning = async () => {
    if (!currentEmptyContentWarningChannel) return;
    const nextIndex = emptyContentWarningIndex + 1;
    if (nextIndex < emptyContentWarningChannels.length) {
      setEmptyContentWarningIndex(nextIndex);
      return;
    }

    const preparedPostsByChannel =
      pendingPublishPosts || buildPreparedPostsByChannel();
    closeEmptyContentWarnings();
    await runPublish({
      skipEmptyContentWarnings: true,
      preparedPostsByChannel,
    });
  };

  const onContinueWithoutGmbImage = async () => {
    const preparedPostsByChannel =
      pendingPublishPosts || buildPreparedPostsByChannel();
    closeGmbNoImageWarning();
    await runPublish({
      skipEmptyContentWarnings: true,
      skipGmbNoImageWarning: true,
      preparedPostsByChannel,
    });
  };

  const onChooseGmbImage = () => {
    closeGmbNoImageWarning();
    setActiveCard("gmb");
    setActiveImageChannel("gmb");
    setPendingPublishPosts(null);
  };

  const getReviewPostForChannel = (
    channel: ChannelKey,
    preparedPostsByChannel: Partial<Record<ChannelKey, ChannelPost>>,
  ) => {
    return normalizePost(preparedPostsByChannel[channel]);
  };

  const buildFinalReviewItems = (
    preparedPostsByChannel: Partial<Record<ChannelKey, ChannelPost>>,
    channelsToReview: ChannelKey[] = selectedChannels,
  ) => {
    return channelsToReview.map((channel) => {
      const post = getReviewPostForChannel(channel, preparedPostsByChannel);
      const rawImageKeys = channelImageEditors[channel]?.imageKeys || [];
      const imageKeysToPublish = getPublishImageKeysForChannel(channel);
      const hasTitle = !!String(post?.title || "").trim();
      const hasContent = !!String(post?.content || "").trim();
      const hasText = hasTitle || hasContent;
      const hasImage = imageKeysToPublish.length > 0;
      const mode = resolveChannelMediaMode(channel);
      const hasVideo = mode === "video" && !!videoFile;
      const requirements = getChannelPublicationRequirements({
        channel,
        connected: connected[channel],
        mediaMode: mode,
        hasVideo,
        videoDurationSeconds:
          videoDurationSeconds ?? videoSourceMetadata?.duration ?? null,
        videoFileType: videoFile?.type || null,
        videoFileName: videoFile?.name || null,
        hasImage,
        imageCount: imageKeysToPublish.length,
        rawImageCount: rawImageKeys.length,
        hasText,
        hasTitle,
        hasContent,
      });

      const blockers = [
        ...requirements.blockers,
        ...(channel === "pinterest" && !pinterestBoardId
          ? ["Choisissez un tableau Pinterest."]
          : []),
      ];

      return {
        channel,
        label: CHANNEL_LABELS[channel],
        mediaType: mode === "video" ? ("video" as const) : ("images" as const),
        mediaLabel:
          mode === "video"
            ? "1 vidéo"
            : mode === "images"
              ? getPublicationMediaLabel("images", imageKeysToPublish.length)
              : "Texte seul",
        imageCount: imageKeysToPublish.length,
        warnings: requirements.warnings,
        blockers,
        publishable: blockers.length === 0,
        tiktokParametersValidated:
          channel === "tiktok" && Boolean(tiktokPublicationSettings),
        hasContent,
        hasTitle,
        hasText,
        hasImage,
      };
    });
  };

  const finalReviewItems = finalReviewOpen
    ? buildFinalReviewItems(finalReviewPosts || buildPreparedPostsByChannel())
    : [];
  const scheduleModalItems = scheduleModalOpen
    ? buildFinalReviewItems(
        scheduleReviewPosts || buildPreparedPostsByChannel(),
      )
    : [];
  const finalReviewBlockers = finalReviewItems.flatMap((item) => item.blockers);
  const hasFinalReviewBlockers = finalReviewBlockers.length > 0;
  const finalReviewPublishableCount = finalReviewItems.filter(
    (item) => item.blockers.length === 0,
  ).length;
  const finalReviewSiteNotice =
    resolveChannelMediaMode("inrcy_site") === "images" &&
    resolveChannelMediaMode("site_web") === "images" &&
    selectedChannels.includes("inrcy_site") &&
    selectedChannels.includes("site_web")
      ? getPublishImageKeysForChannel("inrcy_site").join("|") !==
        getPublishImageKeysForChannel("site_web").join("|")
      : false;

  const publishReadinessItems = buildFinalReviewItems(
    buildPreparedPostsByChannel(),
  );
  const channelReadiness = publishReadinessItems.reduce(
    (acc, item) => {
      const selectorBlockers = item.blockers.filter(
        (blocker) => blocker !== "Ajoutez au moins du texte ou un média.",
      );
      acc[item.channel] = {
        tone: selectorBlockers.length
          ? ("blocked" as const)
          : ("ready" as const),
        message: selectorBlockers[0] || "Prêt à publier",
        blockers: selectorBlockers,
        warnings: item.warnings,
      };
      return acc;
    },
    {} as Partial<
      Record<
        ChannelKey,
        {
          tone: "ready" | "warning" | "blocked";
          message: string;
          blockers: string[];
          warnings: string[];
        }
      >
    >,
  );
  const imageAdapterTabs = imageAdapterChannels.map((channel) => {
    const reviewItem = publishReadinessItems.find(
      (item) => item.channel === channel,
    );
    const count =
      reviewItem?.imageCount ?? getPublishImageKeysForChannel(channel).length;
    return {
      key: channel,
      label: getImageAdapterLabel(channel),
      count,
      tone: count ? ("ready" as const) : ("warning" as const),
    };
  });

  const previewReadinessTabs = imageAdapterChannels.map((channel) => {
    const reviewItem = publishReadinessItems.find(
      (item) => item.channel === channel,
    );
    const hasText = !!reviewItem?.hasText;
    const mode = resolveChannelMediaMode(channel);
    const hasMedia =
      mode === "video"
        ? !!videoPreviewUrl
        : mode === "images"
          ? !!reviewItem?.hasImage
          : false;
    return {
      key: channel,
      label: getImageAdapterLabel(channel),
      tone: reviewItem?.blockers?.length
        ? ("blocked" as const)
        : hasText && hasMedia
          ? ("ready" as const)
          : hasText || hasMedia
            ? ("warning" as const)
            : ("blocked" as const),
    };
  });

  const closeFinalReview = () => {
    setFinalReviewOpen(false);
    setTiktokPublicationSettings(null);
  };

  const closeTiktokSettingsModal = () => {
    setTiktokSettingsOpen(false);
    setTiktokSettingsFlow(null);
    setPendingScheduleRequest(null);
    setTiktokPublicationSettings(null);
  };

  const validateTiktokSettingsModal = async (
    settings: TiktokPublicationSettings,
  ) => {
    setTiktokPublicationSettings(settings);
    setTiktokSettingsOpen(false);

    if (tiktokSettingsFlow === "schedule" && pendingScheduleRequest) {
      const request = pendingScheduleRequest;
      setPendingScheduleRequest(null);
      setTiktokSettingsFlow(null);
      setScheduleModalOpen(true);
      const immediatePublishRequest = await performSchedulePublication(
        request.selections,
        request.preparedPostsByChannel,
        settings,
        request.immediateChannels,
      );
      setScheduleModalOpen(false);
      if (immediatePublishRequest?.immediateChannels?.length) {
        setPendingImmediatePublishAfterSchedule(null);
        publishImmediateChannelsAfterSchedule(immediatePublishRequest);
        return;
      }
      onClose();
      return;
    }

    setTiktokSettingsFlow(null);
    setFinalReviewOpen(true);
  };

  const aiDrawerHeight = isMobile
    ? drawerViewportHeight
      ? `${drawerViewportHeight}px`
      : "100svh"
    : "100%";
  const publicationImagesPanelVisible = true;

  useEffect(() => {
    const openAiConfiguration = () => setAiConfigurationOpen(true);
    window.addEventListener("inrcy:open-ai-configuration", openAiConfiguration);
    return () =>
      window.removeEventListener(
        "inrcy:open-ai-configuration",
        openAiConfiguration,
      );
  }, []);

  const confirmFinalReview = async () => {
    const preparedPostsByChannel =
      finalReviewPosts || buildPreparedPostsByChannel();
    const items = buildFinalReviewItems(preparedPostsByChannel);
    const publishableItems = items.filter((item) => item.blockers.length === 0);
    if (!publishableItems.length) return;
    const tiktokWillPublish = publishableItems.some(
      (item) => item.channel === "tiktok",
    );
    if (tiktokWillPublish && !tiktokPublicationSettings) {
      setFinalReviewOpen(false);
      setTiktokSettingsFlow("publish");
      setTiktokSettingsOpen(true);
      return;
    }
    const validatedTiktokSettings = tiktokPublicationSettings;
    setFinalReviewOpen(false);
    setFinalReviewPosts(null);
    setTiktokPublicationSettings(null);
    await runPublish({
      skipEmptyContentWarnings: true,
      skipGmbNoImageWarning: true,
      preparedPostsByChannel,
      tiktokPublicationSettings: validatedTiktokSettings,
    });
  };

  const tiktokSettingsMediaMode = resolveChannelMediaMode("tiktok");
  const tiktokSettingsPreview =
    tiktokSettingsMediaMode === "video"
      ? getPublicationVideoPreviewForChannel("tiktok")
      : tiktokSettingsMediaMode === "images"
        ? getPublicationPreviewForChannel("tiktok")
        : null;
  const tiktokSettingsPreviewPost =
    (
      finalReviewPosts ||
      scheduleReviewPosts ||
      pendingPublishPosts ||
      buildPreparedPostsByChannel()
    ).tiktok || null;
  const tiktokSettingsPreviewTitle = String(
    tiktokSettingsPreviewPost?.title || tiktokSettingsPreview?.title || "",
  ).trim();
  const tiktokSettingsPreviewContent = String(
    tiktokSettingsPreviewPost?.content || tiktokSettingsPreview?.content || "",
  ).trim();
  const tiktokSettingsPreviewHashtags =
    tiktokSettingsPreviewPost?.hashtags ||
    tiktokSettingsPreview?.hashtags ||
    [];
  const tiktokSettingsPreviewAny = tiktokSettingsPreview as any;
  const tiktokSettingsPreviewMediaUrl =
    tiktokSettingsMediaMode === "video"
      ? tiktokSettingsPreviewAny?.video?.previewUrl || null
      : tiktokSettingsPreviewAny?.image?.previewUrl || null;
  const tiktokSettingsPreviewMediaName =
    tiktokSettingsMediaMode === "video"
      ? tiktokSettingsPreviewAny?.video?.name || videoFile?.name || ""
      : "";
  const tiktokSettingsPreviewMediaCount =
    tiktokSettingsMediaMode === "video"
      ? 1
      : tiktokSettingsPreviewAny?.imageCount || images.length || 0;

  return (
    <div ref={publishRootRef} style={{ display: "grid", gap: 12, minWidth: 0 }}>
      <PublishHelpModal
        open={publishHelpOpen}
        onClose={() => setPublishHelpOpen(false)}
      />

      <PublishAiConfigurationDrawer
        open={aiConfigurationOpen}
        isMobile={isMobile}
        drawerHeight={aiDrawerHeight}
        onClose={() => setAiConfigurationOpen(false)}
      />

      <TiktokPublicationSettingsModal
        open={tiktokSettingsOpen}
        styles={styles}
        isMobile={isMobile}
        mediaType={tiktokSettingsMediaMode === "video" ? "video" : "images"}
        videoDurationSeconds={
          videoDurationSeconds ?? videoSourceMetadata?.duration ?? null
        }
        previewTitle={tiktokSettingsPreviewTitle}
        previewContent={tiktokSettingsPreviewContent}
        previewHashtags={tiktokSettingsPreviewHashtags}
        previewMediaUrl={tiktokSettingsPreviewMediaUrl}
        previewMediaName={tiktokSettingsPreviewMediaName}
        previewMediaCount={tiktokSettingsPreviewMediaCount}
        onCancel={closeTiktokSettingsModal}
        onValidate={validateTiktokSettingsModal}
      />

      <PublishFinalReviewModal
        open={finalReviewOpen}
        styles={styles}
        items={finalReviewItems}
        showSiteNotice={finalReviewSiteNotice}
        hasBlockers={hasFinalReviewBlockers}
        publishableCount={finalReviewPublishableCount}
        isMobile={isMobile}
        saving={saving}
        onClose={closeFinalReview}
        onConfirm={confirmFinalReview}
      />

      <PublishScheduleModal
        open={scheduleModalOpen}
        styles={styles}
        items={scheduleModalItems}
        isMobile={isMobile}
        saving={scheduleSaving}
        error={scheduleError}
        onClose={() => {
          if (scheduleSaving) return;
          setScheduleModalOpen(false);
        }}
        successMessage="Programmation réussie."
        savingLabel="Envoi en cours…"
        enableImmediateUnselectedWarning
        onConfirm={confirmSchedulePublication}
        onSuccess={() => {
          const immediatePublishRequest = pendingImmediatePublishAfterSchedule;
          setScheduleModalOpen(false);
          setPendingImmediatePublishAfterSchedule(null);
          if (immediatePublishRequest?.immediateChannels.length) {
            publishImmediateChannelsAfterSchedule(immediatePublishRequest);
            return;
          }
          onClose();
        }}
      />

      <PublishWarningModals
        styles={styles}
        emptyContentChannel={currentEmptyContentWarningChannel}
        gmbNoImageWarningOpen={gmbNoImageWarningOpen}
        onCloseEmptyContentWarnings={closeEmptyContentWarnings}
        onValidateEmptyContentWarning={onValidateEmptyContentWarning}
        onChooseGmbImage={onChooseGmbImage}
        onContinueWithoutGmbImage={onContinueWithoutGmbImage}
      />

      <InrcyCameraCaptureModal
        open={cameraCaptureOpen}
        title="Appareil iNrCy"
        onClose={closeCameraCapture}
        onCapture={onCameraCapture}
        allowVideo={
          cameraCaptureTargetChannel === null && !(videoFile || videoPreviewUrl)
        }
        maxVideoBytes={BOOSTER_MAX_VIDEO_BYTES}
      />

      <MediaLibraryPickerModal
        open={mediaLibraryPickerOpen}
        title="Ajouter depuis la Médiathèque"
        subtitle="Choisissez une image ou une vidéo déjà stockée dans iNrCy."
        accept="all"
        multiple
        maxSelection={BOOSTER_MAX_IMAGE_COUNT}
        confirmLabel="Ajouter à la publication"
        onClose={() => setMediaLibraryPickerOpen(false)}
        onConfirm={(items) => addMediaLibrarySelection(items)}
      />

      <PublishChannelSelector
        styles={styles}
        isMobile={isMobile}
        connected={connected}
        channels={channels}
        channelReadiness={channelReadiness}
        channelInfoOpen={channelInfoOpen}
        setChannelInfoOpen={setChannelInfoOpen}
        toggle={toggle}
        setAllChannelsSelected={setAllChannelsSelected}
        getChannelDetailInfo={getChannelDetailInfo}
      />

      <PublishIntentPanel
        styles={styles}
        isMobile={isMobile}
        theme={theme}
        idea={idea}
        setIdea={setIdea}
        fileInputRef={fileInputRef}
        videoInputRef={videoInputRef}
        onImagesChange={onImagesChange}
        onVideoChange={onVideoChange}
        onPickImagesClick={onPickImagesClick}
        onPickVideoClick={onPickVideoClick}
        onTakePhotoClick={() => onTakePhotoClick()}
        onOpenMediaLibrary={() => setMediaLibraryPickerOpen(true)}
        publicationMediaType={publicationMediaType}
        channelMediaModes={channelMediaModes}
        setChannelMediaMode={setChannelMediaMode}
        images={images}
        imagePreviews={imagePreviews}
        videoFile={videoFile}
        videoPreviewUrl={videoPreviewUrl}
        videoDurationSeconds={videoDurationSeconds}
        removeVideo={removeVideo}
        removeImage={removeImage}
        useImagesForAI={useImagesForAI}
        setUseImagesForAI={setUseImagesForAI}
        imgError={imgError}
        genError={genError}
        generating={generating}
        generationStage={generationStage}
        generationProgress={generationProgress}
        onGenerate={onGenerate}
        onReset={onReset}
        onOpenAiConfiguration={() => setAiConfigurationOpen(true)}
      />

      <PublishContentEditorPanel
        styles={styles}
        isMobile={isMobile}
        displayCards={displayCards}
        activeCard={activeCard}
        setSynchronizedActiveChannel={setSynchronizedActiveChannel}
        getDisplayPost={getDisplayPost}
        updatePost={updatePost}
        applySiteContentFormat={applySiteContentFormat}
        siteContentEditorRef={siteContentEditorRef}
        contentTextAreaRef={contentTextAreaRef}
        ctaDefaults={ctaDefaults}
        applyPreferredCtaPrefill={applyPreferredCtaPrefill}
        instagramHashtagsInput={instagramHashtagsInput}
        setInstagramHashtagsInput={setInstagramHashtagsInput}
        getLiveInstagramHashtags={getLiveInstagramHashtags}
        duplicateFeedback={duplicateFeedback}
        onDuplicateContentToAllChannels={onDuplicateContentToAllChannels}
        pinterestBoards={pinterestBoards}
        pinterestBoardId={pinterestBoardId}
        pinterestBoardsLoading={pinterestBoardsLoading}
        pinterestBoardsError={pinterestBoardsError}
        onPinterestBoardChange={onPinterestBoardChange}
        onRefreshPinterestBoards={() => void loadPinterestBoardsForPublish()}
      />

      <PublishImagesPanel
        styles={styles}
        isMobile={isMobile}
        publicationMediaType={publicationMediaType}
        channelMediaModes={channelMediaModes}
        setChannelMediaMode={setChannelMediaMode}
        videoFormatByChannel={videoFormatByChannel}
        setVideoFormatForChannel={setVideoFormatForChannel}
        videoAdaptationModeByChannel={videoAdaptationModeByChannel}
        setVideoAdaptationModeForChannel={setVideoAdaptationModeForChannel}
        images={images}
        videoFile={videoFile}
        videoPreviewUrl={videoPreviewUrl}
        videoDurationSeconds={videoDurationSeconds}
        videoSourceMetadata={videoSourceMetadata}
        videoVariantPreparationByChannel={videoVariantPreparationByChannel}
        videoTransformedVariants={videoTransformedVariants}
        videoPreviewVariantsPreparing={videoPreviewVariantsPreparing}
        onApplyVideoFormatForChannel={applyVideoFormatForChannel}
        onApplyVideoFormatToAllChannels={applyVideoFormatToAllChannels}
        imgError={imgError}
        selectedChannels={selectedChannels}
        activeImageChannel={activeImageChannel}
        imageAdapterTabs={imageAdapterTabs}
        imageKeys={imageKeys}
        channelImageEditors={channelImageEditors}
        imageMetaByKey={imageMetaByKey}
        previewByKey={previewByKey}
        previewAspectRatio={previewAspectRatio}
        getImageAdapterLabel={getImageAdapterLabel}
        setSynchronizedActiveChannel={setSynchronizedActiveChannel}
        onPickImagesClick={onPickImagesClick}
        onPickVideoClick={onPickVideoClick}
        onTakePhotoClick={onTakePhotoClick}
        onImagesChange={onImagesChange}
        gmbFileInputRef={gmbFileInputRef}
        setImgError={setImgError}
        toggleChannelImage={toggleChannelImage}
        openImageEditor={openImageEditor}
        resetChannelImage={resetChannelImage}
        removeImage={removeImage}
        moveChannelImage={moveChannelImage}
      />

      <PublishPreviewPanel
        styles={styles}
        isMobile={isMobile}
        activePublicationPreview={activePublicationPreview}
        previewReadinessTabs={previewReadinessTabs}
        activeImageChannel={activeImageChannel}
        showPublicationPreview={showPublicationPreview}
        setShowPublicationPreview={setShowPublicationPreview}
        setSynchronizedActiveChannel={setSynchronizedActiveChannel}
      />

      <ChannelImageAdapterModal
        open={!!(isImageEditorOpen && activeEditorImageKey)}
        title={`Adapter Image ${(imageKeys.indexOf(activeEditorImageKey || "") || 0) + 1}`}
        subtitle={`${getImageAdapterLabel(activeImageChannel)} • ${activeEditorDecisionLabel}`}
        aspectRatio={previewAspectRatio}
        backgroundMode={activeBackgroundMode}
        backgroundColor={activeBackgroundColor}
        fitLabel={getImageFitLabel(activeEditorTransform)}
        zoomLabel={`zoom ${activeEffectiveZoom.toFixed(2)}×`}
        previewSrc={
          activeEditorImageKey ? previewByKey[activeEditorImageKey] : ""
        }
        previewLayout={previewLayout}
        isDragging={isDraggingImage}
        onClose={closeImageEditor}
        onWheel={handlePreviewWheel}
        onPointerDown={handlePreviewPointerDown}
        onPointerMove={handlePreviewPointerMove}
        onPointerUp={endPreviewDrag}
        onPointerCancel={endPreviewDrag}
        previewRef={previewStageRef}
        buttonClassName={styles.secondaryBtn}
        primaryButtonClassName={styles.primaryBtn}
        onZoomOut={() => nudgeZoom(-0.08)}
        onZoomIn={() => nudgeZoom(0.08)}
        onContain={() =>
          activeEditorImageKey &&
          setContainMode(activeImageChannel, activeEditorImageKey)
        }
        onCover={() =>
          activeEditorImageKey &&
          setCoverMode(activeImageChannel, activeEditorImageKey)
        }
        onReset={() =>
          activeEditorImageKey &&
          resetChannelImage(activeImageChannel, activeEditorImageKey)
        }
        onDoubleClick={() =>
          activeEditorImageKey &&
          updateChannelTransform(activeImageChannel, activeEditorImageKey, {
            offsetX: 0,
            offsetY: 0,
          })
        }
        onSave={closeImageEditor}
        onApplyToChannelImages={
          (channelImageEditors[activeImageChannel]?.imageKeys || []).length > 1
            ? applyCurrentCadrageToActiveChannelImages
            : undefined
        }
        onResetChannel={
          (channelImageEditors[activeImageChannel]?.imageKeys || []).length
            ? resetActiveChannelImages
            : undefined
        }
        isolationNote={`Ce réglage concerne uniquement ${getImageAdapterLabel(activeImageChannel)}. Les autres canaux restent indépendants.${activeImageChannel === "gmb" ? " Fond transparent = export sur fond blanc pour un rendu propre sur Google Business." : ""}`}
        onApplyToSelectedChannels={
          activeImageChannel === "inrcy_site" ||
          activeImageChannel === "site_web"
            ? undefined
            : applyCurrentImageToSelectedChannels
        }
        onBackgroundModeChange={(mode) =>
          activeEditorImageKey &&
          updateChannelTransform(
            activeImageChannel,
            activeEditorImageKey,
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
                    activeEditorTransform.backgroundColor ||
                    (activeImageChannel === "inrcy_site" ||
                    activeImageChannel === "site_web" ||
                    activeImageChannel === "gmb"
                      ? "#ffffff"
                      : "#ffffff"),
                  blurBackground: false,
                  fit: "contain",
                  zoom: 1,
                  offsetX: 0,
                  offsetY: 0,
                },
          )
        }
        onBackgroundColorChange={(color) =>
          activeEditorImageKey &&
          updateChannelTransform(activeImageChannel, activeEditorImageKey, {
            backgroundMode: "color",
            backgroundColor: color,
            blurBackground: false,
            fit: "contain",
            zoom: 1,
            offsetX: 0,
            offsetY: 0,
          })
        }
        pillButtonStyle={pillBtn}
        pillButtonActiveStyle={pillBtnActive}
        sidebarItems={imageKeys.map((key, index) => {
          const included = (
            channelImageEditors[activeImageChannel]?.imageKeys || []
          ).includes(key);
          const transform =
            channelImageEditors[activeImageChannel]?.transforms?.[key] ||
            getOptimizedTransform(activeImageChannel, imageMetaByKey[key]);
          return {
            key,
            previewUrl: previewByKey[key],
            title: `Image ${index + 1}`,
            subtitle: included
              ? "Publiée sur ce canal"
              : "Non envoyée sur ce canal",
            fitLabel: getImageFitLabel(transform),
            active: key === activeEditorImageKey,
            onClick: () =>
              setActiveImageKeyByChannel((prev) => ({
                ...prev,
                [activeImageChannel]: key,
              })),
          };
        })}
      />

      <PublishFooterActions
        styles={styles}
        publishAreaRef={publishAreaRef}
        saving={saving}
        scheduling={scheduleSaving}
        draftSaving={draftSaving}
        publishProgress={publishProgress}
        publishProgressLabel={publishProgressLabel}
        publishError={publishError}
        onPublish={onPublish}
        onSchedule={openSchedulePublicationModal}
      />
    </div>
  );
}
