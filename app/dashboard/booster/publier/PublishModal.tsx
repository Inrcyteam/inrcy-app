import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import { readSanitizedElementHtml } from "@/lib/sanitizeHtml";
import { confirmInrcy } from "@/lib/inrcyDialog";
import {
  editableHtmlToSiteText,
  stripSiteTextFormatting,
} from "@/lib/boosterFormatting";
import stylesDash from "../../dashboard.module.css";
import {
  ChannelImageAdapterCardsPanel,
  ChannelImageAdapterModal,
  ChannelPublicationPreview,
} from "@/app/dashboard/_components/ChannelImageAdapterTool";
import {
  BOOSTER_MAX_IMAGE_BYTES,
  BOOSTER_MAX_IMAGE_MB_LABEL,
  CHANNEL_LABELS,
  CHANNEL_PRESETS,
  CHANNEL_TEXT_GUIDELINES,
  CTA_MODE_OPTIONS,
  DISPLAY_LABELS,
  STYLE_HELPERS,
  STYLE_OPTIONS,
  THEME_OPTIONS,
  THEME_PLACEHOLDERS,
  buildAutoPrefillPatch,
  buildInstagramPreviewCaption,
  buildBoosterUploadPath,
  clamp,
  clampPercent,
  computePreviewLayout,
  getBackgroundFill,
  getBackgroundMode,
  getChannelDefaultCtaLabel,
  getCtaModeHelp,
  getDefaultTransform,
  getEffectiveTransformZoom,
  getOptimizedTransform,
  fileToBoosterAiImagePayload,
  getWebsiteSourceLabelForChannel,
  getWebsiteUrlForChannel,
  isSiteDisplayKey,
  makeImageKey,
  normalizePost,
  offsetFromDrawPosition,
  parseInstagramHashtagsInput,
  readImageMeta,
  renderChannelImage,
  renderLimitCounter,
  sleep,
  syncChannelImageEditors,
  uploadPreparedImages,
  type BoosterCtaDefaults,
  type BoosterCtaMode,
  type ChannelImageEditorState,
  type ChannelImagePayload,
  type ChannelImageSettingsPayload,
  type ChannelKey,
  type ChannelPost,
  type DisplayKey,
  type ImageMeta,
  type ImagePayload,
  type ImageTransform,
  type StyleKey,
  type ThemeKey,
} from "./publishModal.shared";
import {
  darkOptionStyle,
  darkSelectStyle,
  inputStyle,
  lightFieldStyle,
  pillBtn,
  pillBtnActive,
  textAreaStyle,
} from "./publishModal.styles";

import PublishAiConfigurationDrawer from "./components/PublishAiConfigurationDrawer";
import PublishChannelSelector from "./components/PublishChannelSelector";
import PublishFinalReviewModal from "./components/PublishFinalReviewModal";
import PublishFooterActions from "./components/PublishFooterActions";
import PublishIntentPanel from "./components/PublishIntentPanel";
import PublishContentEditorPanel from "./components/PublishContentEditorPanel";
import PublishImagesPanel from "./components/PublishImagesPanel";
import PublishPreviewPanel from "./components/PublishPreviewPanel";
import PublishHelpModal from "./components/PublishHelpModal";
import PublishWarningModals from "./components/PublishWarningModals";

type ChannelConnectionDetail = {
  type?: string | null;
  label?: string | null;
  href?: string | null;
};

const EMPTY_CHANNEL_DETAILS: Record<ChannelKey, ChannelConnectionDetail> = {
  inrcy_site: { type: "url", label: null, href: null },
  site_web: { type: "url", label: null, href: null },
  gmb: { type: "location", label: null, href: null },
  facebook: { type: "page", label: null, href: null },
  instagram: { type: "account", label: null, href: null },
  linkedin: { type: "profile", label: null, href: null },
};

const CHANNEL_KEYS: ChannelKey[] = ["inrcy_site", "site_web", "gmb", "facebook", "instagram", "linkedin"];

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

function simplifyChannelDetail(value?: string | null) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      const host = url.hostname.replace(/^www\./i, "");
      const path = url.pathname.replace(/\/$/, "");
      return `${host}${path && path !== "/" ? path : ""}`;
    } catch {
      return text.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
    }
  }
  return text;
}

function truncateText(value: string, max = 34) {
  return value.length > max
    ? `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`
    : value;
}

export default function PublishModal({
  styles,
  onClose,
  trackEvent,
  onPublishSuccess,
  onOverlayOpenChange,
  onUnsavedChange,
  saveDraftActionRef,
  onDraftHeaderStateChange,
}: {
  styles: typeof stylesDash;
  onClose: () => void;
  trackEvent: (type: "publish", payload: Record<string, any>) => Promise<any>;
  onPublishSuccess?: (result?: any) => void;
  onOverlayOpenChange?: (open: boolean) => void;
  onUnsavedChange?: (hasUnsavedChanges: boolean) => void;
  saveDraftActionRef?: MutableRefObject<(() => void) | null>;
  onDraftHeaderStateChange?: (state: { saving: boolean; draftSaving: boolean; draftMessage: string }) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const publicationDraftIdParam = String(searchParams?.get("draftId") || "").trim();
  const [loadedPublicationDraftId, setLoadedPublicationDraftId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [idea, setIdea] = useState("");
  const [theme, setTheme] = useState<ThemeKey>("");
  const [contentStyle, setContentStyle] = useState<StyleKey>("equilibre");
  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStage, setGenerationStage] = useState("");
  const generationTimersRef = useRef<number[]>([]);
  const generationPulseTimerRef = useRef<number | null>(null);
  const [genError, setGenError] = useState("");
  const [publishError, setPublishError] = useState("");
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftMessage, setDraftMessage] = useState("");
  const [lastPublicationDraftSnapshot, setLastPublicationDraftSnapshot] = useState<string | null>(null);

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
  const [drawerViewportHeight, setDrawerViewportHeight] = useState<number | null>(null);
  const [duplicateFeedback, setDuplicateFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [publishHelpOpen, setPublishHelpOpen] = useState(false);
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
  const [pendingPublishPosts, setPendingPublishPosts] = useState<Partial<
    Record<ChannelKey, ChannelPost>
  > | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const gmbFileInputRef = useRef<HTMLInputElement | null>(null);
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
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);
  const [previewStageSize, setPreviewStageSize] = useState({
    width: 0,
    height: 0,
  });
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [isImageEditorOpen, setIsImageEditorOpen] = useState(false);

  const [channels, setChannels] = useState<Record<ChannelKey, boolean>>({
    inrcy_site: true,
    site_web: true,
    gmb: false,
    facebook: false,
    instagram: false,
    linkedin: false,
  });

  const [connected, setConnected] = useState<Record<ChannelKey, boolean>>({
    inrcy_site: true,
    site_web: true,
    gmb: false,
    facebook: false,
    instagram: false,
    linkedin: false,
  });
  const [channelDetails, setChannelDetails] = useState<
    Record<ChannelKey, ChannelConnectionDetail>
  >(EMPTY_CHANNEL_DETAILS);
  const [channelInfoOpen, setChannelInfoOpen] = useState<ChannelKey | null>(
    null,
  );
  const [didInitChannels, setDidInitChannels] = useState(false);
  const [ctaDefaults, setCtaDefaults] = useState<BoosterCtaDefaults | null>(
    null,
  );

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
      ];
      for (const key of keys) {
        const current = normalizePost(prev[key]);
        const mode = current.ctaMode || "none";
        if (mode !== "website" && mode !== "call") continue;
        const patch = buildAutoPrefillPatch(
          key,
          mode,
          current,
          ctaDefaults,
        );
        const hasMeaningfulPatch = Object.entries(patch).some(
          ([patchKey, patchValue]) =>
            patchKey !== "ctaMode" && String(patchValue || "").trim(),
        );
        if (!hasMeaningfulPatch) continue;
        const merged = { ...current, ...patch };
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
      setDrawerViewportHeight(Math.round(window.visualViewport?.height || window.innerHeight));
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

  useEffect(() => {
    const node = previewStageRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;

    const update = () => {
      setPreviewStageSize({
        width: node.clientWidth || 0,
        height: node.clientHeight || 0,
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [
    activeImageChannel,
    activeImageKeyByChannel[activeImageChannel],
    isImageEditorOpen,
    images.length,
  ]);

  useEffect(() => {
    if (!images.length && !useImagesForAI) {
      setUseImagesForAI(true);
    }
  }, [images.length, useImagesForAI]);

  const displayCards = useMemo(() => {
    const ordered: DisplayKey[] = [
      "inrcy_site",
      "site_web",
      "gmb",
      "facebook",
      "instagram",
      "linkedin",
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

  const imageAdapterChannels = useMemo<ChannelKey[]>(() => {
    const adapterChannels: ChannelKey[] = [];
    if (selectedChannels.includes("inrcy_site"))
      adapterChannels.push("inrcy_site");
    if (selectedChannels.includes("site_web")) adapterChannels.push("site_web");
    if (selectedChannels.includes("gmb")) adapterChannels.push("gmb");
    if (selectedChannels.includes("facebook")) adapterChannels.push("facebook");
    if (selectedChannels.includes("instagram"))
      adapterChannels.push("instagram");
    if (selectedChannels.includes("linkedin")) adapterChannels.push("linkedin");
    return adapterChannels;
  }, [selectedChannels]);
  const getImageAdapterLabel = (channel: ChannelKey) => CHANNEL_LABELS[channel];
  const getImpactedImageChannels = (channel: ChannelKey): ChannelKey[] => [
    channel,
  ];

  const selectedForGeneration = useMemo(() => {
    const out = new Set<ChannelKey>();
    if (channels.inrcy_site && connected.inrcy_site) out.add("inrcy_site");
    if (channels.site_web && connected.site_web) out.add("site_web");
    if (channels.gmb && connected.gmb) out.add("gmb");
    if (channels.facebook && connected.facebook) out.add("facebook");
    if (channels.instagram && connected.instagram) out.add("instagram");
    if (channels.linkedin && connected.linkedin) out.add("linkedin");
    return Array.from(out);
  }, [channels, connected]);

  const setSynchronizedActiveChannel = (channel: ChannelKey) => {
    setActiveCard(channel);
    setActiveImageChannel(channel);
  };

  const imageKeys = useMemo(
    () => images.map((file) => makeImageKey(file)),
    [images],
  );
  const imageFileByKey = useMemo(
    () => Object.fromEntries(images.map((file) => [makeImageKey(file), file])),
    [images],
  );
  const previewByKey = useMemo(
    () =>
      Object.fromEntries(
        imageKeys.map((key, index) => [key, imagePreviews[index]]),
      ),
    [imageKeys, imagePreviews],
  );

  useEffect(() => {
    setChannelImageEditors((prev) =>
      syncChannelImageEditors({
        previous: prev,
        imageKeys,
        selectedChannels,
        imageMetaByKey,
      }),
    );
  }, [
    imageKeys.join("|"),
    selectedChannels.join("|"),
    Object.keys(imageMetaByKey)
      .sort()
      .map(
        (key) =>
          `${key}:${imageMetaByKey[key]?.width || 0}x${imageMetaByKey[key]?.height || 0}`,
      )
      .join("|"),
  ]);

  useEffect(() => {
    if (!imageAdapterChannels.length) {
      setActiveImageChannel("inrcy_site");
      setActiveCard("inrcy_site");
      return;
    }
    if (!imageAdapterChannels.includes(activeImageChannel)) {
      const fallback = imageAdapterChannels[0];
      setActiveImageChannel(fallback);
      setActiveCard(fallback);
    }
  }, [imageAdapterChannels, activeImageChannel]);

  useEffect(() => {
    setActiveImageKeyByChannel((prev) => {
      const next = { ...prev };
      for (const channel of selectedChannels) {
        const available = channelImageEditors[channel]?.imageKeys || [];
        if (!available.length) {
          delete next[channel];
          continue;
        }
        if (!next[channel] || !available.includes(next[channel] as string)) {
          next[channel] = available[0];
        }
      }
      for (const key of Object.keys(next) as ChannelKey[]) {
        if (!selectedChannels.includes(key)) delete next[key];
      }
      return next;
    });
  }, [selectedChannels.join("|"), channelImageEditors, imageKeys.join("|")]);

  const activeEditor = channelImageEditors[activeImageChannel];
  const activeEditorImageKey =
    activeImageKeyByChannel[activeImageChannel] ||
    activeEditor?.imageKeys?.[0] ||
    "";
  const activeEditorTransform =
    activeEditor?.transforms?.[activeEditorImageKey] ||
    getOptimizedTransform(
      activeImageChannel,
      imageMetaByKey[activeEditorImageKey],
    );
  const activeEditorMeta = imageMetaByKey[activeEditorImageKey];
  const activeEffectiveZoom = getEffectiveTransformZoom(activeEditorTransform);
  const activeBackgroundMode = getBackgroundMode(activeEditorTransform);
  const activeBackgroundColor = getBackgroundFill(
    activeEditorTransform.backgroundMode || activeBackgroundMode,
    activeEditorTransform.backgroundColor,
  );
  const previewAspectRatio = `${CHANNEL_PRESETS[activeImageChannel].width} / ${CHANNEL_PRESETS[activeImageChannel].height}`;
  const previewLayout = computePreviewLayout({
    containerWidth: previewStageSize.width,
    containerHeight: previewStageSize.height,
    imageWidth: activeEditorMeta?.width || 0,
    imageHeight: activeEditorMeta?.height || 0,
    transform: activeEditorTransform,
  });

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
    const hasLiveHashtags = !!instagramHashtagsInput.trim();
    return hasText || hasGeneratedContent || hasImages || hasLiveHashtags;
  }, [
    idea,
    theme,
    contentStyle,
    postsByChannel,
    images.length,
    imagePreviews.length,
    channelImageEditors,
    instagramHashtagsInput,
  ]);

  const currentPublicationDraftSnapshot = useMemo(() => {
    const imageNames = images.map((file) => ({
      name: file.name,
      type: file.type,
      size: file.size,
    }));
    return JSON.stringify({
      idea: idea.trim(),
      theme,
      contentStyle,
      channels: selectedChannels,
      postsByChannel,
      instagramHashtagsInput,
      imageNames,
      useImagesForAI,
      imageSettingsByChannel: channelImageEditors,
    });
  }, [
    idea,
    theme,
    contentStyle,
    selectedChannels,
    postsByChannel,
    instagramHashtagsInput,
    images,
    useImagesForAI,
    channelImageEditors,
  ]);


  function getSafeDraftImagePath(file: File, index: number) {
    return buildBoosterUploadPath(file.name || `image-${index + 1}.jpg`, "booster-drafts");
  }

  function getDraftImageSettingsByChannel() {
    return selectedChannels.reduce((acc, channel) => {
      const editor = channelImageEditors[channel] || { imageKeys: [], transforms: {} };
      const imageKeysForChannel = (editor.imageKeys || []).filter((key) => imageKeys.includes(key));
      acc[channel] = {
        imageKeys: channel === "gmb" ? imageKeysForChannel.slice(0, 1) : imageKeysForChannel,
        transforms: Object.fromEntries(
          Object.entries(editor.transforms || {})
            .filter(([key]) => imageKeysForChannel.includes(key))
            .map(([key, value]) => [key, { ...(value as ImageTransform) }]),
        ),
      };
      return acc;
    }, {} as Partial<Record<ChannelKey, ChannelImageEditorState>>);
  }

  async function uploadPublicationDraftImages() {
    const uploaded: Array<{ name: string; type?: string; size?: number; lastModified?: number; storagePath?: string; publicUrl?: string }> = [];
    for (let index = 0; index < images.length; index += 1) {
      const file = images[index];
      if (!file) continue;
      const formData = new FormData();
      formData.append("file", file);
      formData.append("path", getSafeDraftImagePath(file, index));
      const response = await fetch("/api/booster/upload-prepared", {
        method: "POST",
        body: formData,
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(json?.error || "Impossible d’enregistrer les images du brouillon."));
      }
      uploaded.push({
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
        storagePath: String(json?.storagePath || ""),
        publicUrl: String(json?.publicUrl || ""),
      });
    }
    return uploaded;
  }

  async function restorePublicationDraftImages(imageDrafts: any[]) {
    const restoredFiles: File[] = [];
    const restoredPreviews: string[] = [];
    const restoredMeta: Record<string, ImageMeta> = {};

    for (const image of imageDrafts) {
      const publicUrl = String(image?.publicUrl || image?.url || "").trim();
      const dataUrl = String(image?.dataUrl || "").trim();
      const source = publicUrl || dataUrl;
      if (!source) continue;
      try {
        const response = await fetch(source);
        if (!response.ok) continue;
        const blob = await response.blob();
        const name = String(image?.name || "image.jpg");
        const type = String(image?.type || blob.type || "image/jpeg");
        const lastModified = Number(image?.lastModified || Date.now());
        const file = new File([blob], name, { type, lastModified });
        const key = makeImageKey(file);
        restoredFiles.push(file);
        restoredPreviews.push(URL.createObjectURL(file));
        restoredMeta[key] = await readImageMeta(file);
      } catch {
        // Une ancienne image de brouillon peut ne plus être disponible : on recharge le reste du brouillon.
      }
    }

    return { restoredFiles, restoredPreviews, restoredMeta };
  }

  useEffect(() => {
    if (!publicationDraftIdParam || loadedPublicationDraftId === publicationDraftIdParam) return;
    let cancelled = false;

    const loadPublicationDraft = async () => {
      setDraftMessage("Chargement du brouillon…");
      setPublishError("");
      try {
        const response = await fetch(`/api/booster/events?draftId=${encodeURIComponent(publicationDraftIdParam)}`, {
          cache: "no-store" as any,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(result?.error || "Brouillon publication introuvable."));
        const payload = (result?.payload || {}) as any;

        const rawChannels = Array.isArray(payload.channels) ? payload.channels : [];
        const savedChannels = rawChannels.map((value: unknown) => String(value || "")).filter(isChannelKey);
        const nextChannels = CHANNEL_KEYS.reduce((acc, key) => {
          acc[key] = savedChannels.length ? savedChannels.includes(key) : Boolean(channels[key]);
          return acc;
        }, {} as Record<ChannelKey, boolean>);

        const nextTheme = isThemeKey(payload.theme) ? payload.theme : "";
        const nextContentStyle = isStyleKey(payload.contentStyle) ? payload.contentStyle : "equilibre";
        const nextPostsByChannel = (payload.postByChannel && typeof payload.postByChannel === "object") ? payload.postByChannel : {};
        const nextEditors = (payload.imageSettingsByChannel && typeof payload.imageSettingsByChannel === "object") ? payload.imageSettingsByChannel : {};
        const nextUseImagesForAI = typeof payload.useImagesForAI === "boolean" ? payload.useImagesForAI : true;
        const imageDrafts = Array.isArray(payload.imageDrafts) ? payload.imageDrafts : [];
        const { restoredFiles, restoredPreviews, restoredMeta } = await restorePublicationDraftImages(imageDrafts);

        if (cancelled) return;

        const nextIdea = String(payload.idea || "");
        const nextInstagramHashtags = String(payload.instagramHashtagsInput || "") || (
          Array.isArray((nextPostsByChannel as any)?.instagram?.hashtags)
            ? (nextPostsByChannel as any).instagram.hashtags.join(" ")
            : ""
        );

        setIdea(nextIdea);
        setTheme(nextTheme);
        setContentStyle(nextContentStyle);
        setChannels(nextChannels);
        setPostsByChannel(nextPostsByChannel);
        setInstagramHashtagsInput(nextInstagramHashtags);
        setImages(restoredFiles);
        setImagePreviews(restoredPreviews);
        setUseImagesForAI(nextUseImagesForAI);
        setImageMetaByKey(restoredMeta);
        setChannelImageEditors(nextEditors);
        setLoadedPublicationDraftId(publicationDraftIdParam);
        setDraftMessage("Brouillon chargé");

        const imageNames = restoredFiles.map((file) => ({ name: file.name, type: file.type, size: file.size }));
        const selectedDraftChannels = Object.entries(nextChannels)
          .filter(([, enabled]) => enabled)
          .map(([key]) => key as ChannelKey);
        setLastPublicationDraftSnapshot(JSON.stringify({
          idea: nextIdea.trim(),
          theme: nextTheme,
          contentStyle: nextContentStyle,
          channels: selectedDraftChannels,
          postsByChannel: nextPostsByChannel,
          instagramHashtagsInput: nextInstagramHashtags,
          imageNames,
          useImagesForAI: nextUseImagesForAI,
          imageSettingsByChannel: nextEditors,
        }));
        onUnsavedChange?.(false);
      } catch (error) {
        if (cancelled) return;
        setPublishError(getSimpleFrenchErrorMessage(error, "Impossible de charger ce brouillon publication."));
        setDraftMessage("");
      }
    };

    void loadPublicationDraft();
    return () => {
      cancelled = true;
    };
  }, [publicationDraftIdParam, loadedPublicationDraftId, onUnsavedChange]);

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

  const getChannelDetailInfo = (key: ChannelKey) => {
    const detail = channelDetails[key] || EMPTY_CHANNEL_DETAILS[key];
    const rawLabel = String(detail?.label || "").trim();
    const simplifiedLabel = simplifyChannelDetail(rawLabel);
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
    imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    setImages([]);
    setImagePreviews([]);
    setImgError("");
    setUseImagesForAI(true);
    setImageMetaByKey({});
    setChannelImageEditors({});
    setActiveImageKeyByChannel({});
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
        : [{ percent: 42, label: "Construction du contenu", delay: 2600 }]),
      { percent: 58, label: "Rédaction du contenu principal", delay: 5200 },
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
      const imagesForAI = shouldUseImagesForAI
        ? await Promise.all(images.map((file) => fileToBoosterAiImagePayload(file)))
        : [];

      const res = await fetch("/api/booster/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea: trimmed,
          theme,
          style: contentStyle,
          channels: selectedForGeneration,
          useImagesForAI: shouldUseImagesForAI,
          imageCount: imagesForAI.length,
          imagesForAI,
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
      setPostsByChannel(
        Object.fromEntries(
          Object.entries(versions).map(([key, value]) => [
            key,
            normalizePost(value as Partial<ChannelPost>),
          ]),
        ) as Partial<Record<ChannelKey, ChannelPost>>,
      );
      didGenerate = true;
    } catch {
      setGenError(
        shouldUseImagesForAI
          ? "Impossible de préparer ou d’analyser les images pour le moment. Merci de réessayer."
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
      content: stripSiteTextFormatting(source.content),
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

  const onPickImagesClick = () => {
    setImgError("");
    if (images.length >= 5) return;
    fileInputRef.current?.click();
  };

  const onImagesChange = async (
    files: FileList | null,
    targetChannel?: ChannelKey,
  ) => {
    if (!files?.length) return;
    setImgError("");

    const incoming = Array.from(files).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (!incoming.length) {
      setImgError("Ajoutez des fichiers image valides.");
      return;
    }

    const existingKeys = new Set(images.map((file) => makeImageKey(file)));
    const deduped = incoming.filter(
      (file) => !existingKeys.has(makeImageKey(file)),
    );
    const allowed = deduped.slice(0, Math.max(0, 5 - images.length));

    if (!allowed.length) {
      setImgError(
        images.length >= 5
          ? "Maximum 5 images."
          : "Ces images sont déjà ajoutées.",
      );
      return;
    }

    if (incoming.length > allowed.length) {
      setImgError(
        images.length + allowed.length >= 5
          ? "Maximum 5 images."
          : "Certaines images étaient déjà présentes.",
      );
    }

    const tooBig = allowed.find((file) => file.size > BOOSTER_MAX_IMAGE_BYTES);
    if (tooBig) {
      setImgError(
        `L'image ${tooBig.name} dépasse ${BOOSTER_MAX_IMAGE_MB_LABEL}.`,
      );
      return;
    }

    const nextFiles = [...images, ...allowed].slice(0, 5);
    const nextPreviews = [
      ...imagePreviews,
      ...allowed.map((file) => URL.createObjectURL(file)),
    ].slice(0, 5);
    const nextMetaEntries = await Promise.all(
      allowed.map(
        async (file) =>
          [makeImageKey(file), await readImageMeta(file)] as const,
      ),
    );
    const nextMetaMap = Object.fromEntries(nextMetaEntries) as Record<
      string,
      ImageMeta
    >;
    const newKeys = allowed.map((file) => makeImageKey(file));

    setImages(nextFiles);
    setImagePreviews(nextPreviews);
    setImageMetaByKey((prev) => ({ ...prev, ...nextMetaMap }));

    if (targetChannel) {
      setChannelImageEditors((prev) => {
        const next = syncChannelImageEditors({
          previous: prev,
          imageKeys: nextFiles.map((file) => makeImageKey(file)),
          selectedChannels,
          imageMetaByKey: { ...imageMetaByKey, ...nextMetaMap },
        });
        const current = next[targetChannel] || {
          imageKeys: [],
          transforms: {},
        };
        next[targetChannel] = {
          imageKeys:
            targetChannel === "gmb"
              ? (current.imageKeys || []).length
                ? [...(current.imageKeys || [])]
                : newKeys.slice(0, 1)
              : Array.from(new Set([...(current.imageKeys || []), ...newKeys])),
          transforms: {
            ...(current.transforms || {}),
            ...Object.fromEntries(
              newKeys.map((key) => [
                key,
                current.transforms?.[key] ||
                  getOptimizedTransform(targetChannel, nextMetaMap[key]),
              ]),
            ),
          },
        };
        return next;
      });
      setSynchronizedActiveChannel(targetChannel);
      setActiveImageKeyByChannel((prev) => ({
        ...prev,
        [targetChannel]: newKeys[0] || prev[targetChannel] || "",
      }));
    }
  };

  const removeImage = (index: number) => {
    setImgError("");
    const removedFile = images[index];
    const removedPreview = imagePreviews[index];
    if (!removedFile) return;

    if (removedPreview) {
      try {
        URL.revokeObjectURL(removedPreview);
      } catch {}
    }

    const removedKey = makeImageKey(removedFile);
    const nextFiles = images.filter((_, idx) => idx !== index);
    const nextPreviews = imagePreviews.filter((_, idx) => idx !== index);
    const remainingKeys = nextFiles.map((file) => makeImageKey(file));

    setImages(nextFiles);
    setImagePreviews(nextPreviews);
    setImageMetaByKey((prev) => {
      const next = { ...prev };
      delete next[removedKey];
      return next;
    });
    setChannelImageEditors((prev) =>
      syncChannelImageEditors({
        previous: prev,
        imageKeys: remainingKeys,
        selectedChannels,
        imageMetaByKey,
      }),
    );
    setActiveImageKeyByChannel((prev) => {
      const next = { ...prev };
      for (const channel of Object.keys(next) as ChannelKey[]) {
        if (next[channel] === removedKey) {
          next[channel] = remainingKeys[0] || "";
        }
      }
      return next;
    });
  };

  const updatePost = (channel: ChannelKey, patch: Partial<ChannelPost>) => {
    setPostsByChannel((prev) => ({
      ...prev,
      [channel]: {
        ...normalizePost(prev[channel]),
        ...patch,
      },
    }));
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
    for (const key of ["gmb", "facebook", "instagram", "linkedin"] as const) {
      if (!prepared[key]) continue;
      prepared[key] = normalizePost({
        ...prepared[key],
        title: stripSiteTextFormatting(prepared[key]?.title || ""),
        content: stripSiteTextFormatting(prepared[key]?.content || ""),
        cta: stripSiteTextFormatting(prepared[key]?.cta || ""),
      });
    }

    return prepared;
  };

  const filterPostsForSelectedChannels = (
    preparedPosts: Partial<Record<ChannelKey, ChannelPost>>,
    channelsToKeep: ChannelKey[],
  ): Partial<Record<ChannelKey, ChannelPost>> => {
    return channelsToKeep.reduce((acc, channel) => {
      const post = preparedPosts[channel];
      if (post) acc[channel] = post;
      return acc;
    }, {} as Partial<Record<ChannelKey, ChannelPost>>);
  };

  const getPreparedDisplayPost = (
    key: DisplayKey,
    preparedPosts: Partial<Record<ChannelKey, ChannelPost>>,
  ): ChannelPost => {
    return normalizePost(preparedPosts[key]);
  };

  const displayKeyForImageChannel = (channel: ChannelKey): DisplayKey => channel;

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

  const activePublicationPreview =
    selectedChannels.length && images.length
      ? getPublicationPreviewForChannel(activeImageChannel)
      : null;

  const closeEmptyContentWarnings = () => {
    setEmptyContentWarningChannels([]);
    setEmptyContentWarningIndex(0);
  };

  const closeGmbNoImageWarning = () => {
    setGmbNoImageWarningOpen(false);
  };

  const applyCtaModePrefill = (
    displayKey: DisplayKey,
    mode: BoosterCtaMode,
  ) => {
    const current = getDisplayPost(displayKey);
    const patch = buildAutoPrefillPatch(displayKey, mode, current, ctaDefaults);
    updatePost(displayKey, patch);
  };

  const applySiteContentFormat = (kind: "bold" | "italic" | "underline") => {
    if (!isSiteDisplayKey(activeCard) || typeof document === "undefined") return;
    const editor = siteContentEditorRef.current;
    if (!editor) return;

    editor.focus();
    const command =
      kind === "bold" ? "bold" : kind === "italic" ? "italic" : "underline";
    document.execCommand(command, false);
    updatePost(activeCard, {
      content: editableHtmlToSiteText(readSanitizedElementHtml(editor)),
    });
  };

  const updateChannelTransform = (
    channel: ChannelKey,
    imageKey: string,
    patch: Partial<ImageTransform>,
  ) => {
    setChannelImageEditors((prev) => {
      const next = { ...prev };
      for (const targetChannel of getImpactedImageChannels(channel)) {
        const current = next[targetChannel] || {
          imageKeys: imageKeys.slice(),
          transforms: {},
        };
        next[targetChannel] = {
          imageKeys: current.imageKeys,
          transforms: {
            ...current.transforms,
            [imageKey]: {
              ...(current.transforms[imageKey] ||
                getOptimizedTransform(targetChannel, imageMetaByKey[imageKey])),
              ...patch,
            },
          },
        };
      }
      return next;
    });
  };

  const setContainMode = (channel: ChannelKey, imageKey: string) => {
    const current =
      channelImageEditors[channel]?.transforms?.[imageKey] ||
      getOptimizedTransform(channel, imageMetaByKey[imageKey]);
    const backgroundMode =
      current.fit === "contain"
        ? getBackgroundMode(current)
        : channel === "inrcy_site" ||
            channel === "site_web" ||
            channel === "gmb"
          ? "color"
          : "white";
    const backgroundColor =
      current.backgroundColor ||
      (channel === "inrcy_site" || channel === "site_web" || channel === "gmb"
        ? "#e8f6ff"
        : "#ffffff");
    updateChannelTransform(channel, imageKey, {
      fit: "contain",
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      backgroundMode:
        backgroundMode === "transparent" ? "transparent" : "color",
      backgroundColor,
      blurBackground: false,
    });
  };

  const setCoverMode = (channel: ChannelKey, imageKey: string) => {
    updateChannelTransform(channel, imageKey, {
      fit: "cover",
      backgroundMode: "black",
      blurBackground: false,
    });
  };

  const nudgeZoom = (delta: number) => {
    if (!activeEditorImageKey) return;
    const maxZoom = activeEditorTransform.fit === "cover" ? 3 : 1;
    const currentZoom = getEffectiveTransformZoom(activeEditorTransform);
    const nextZoom = clamp(currentZoom + delta, 0.4, maxZoom);
    updateChannelTransform(activeImageChannel, activeEditorImageKey, {
      zoom: nextZoom,
    });
  };

  const handlePreviewWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (
      !activeEditorImageKey ||
      !activeEditorMeta?.width ||
      !activeEditorMeta?.height ||
      !previewStageRef.current
    )
      return;
    if (event.cancelable) event.preventDefault();

    const rect = previewStageRef.current.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const maxZoom = activeEditorTransform.fit === "cover" ? 3 : 1;
    const currentZoom = getEffectiveTransformZoom(activeEditorTransform);
    const nextZoom = clamp(
      currentZoom + (event.deltaY < 0 ? 0.08 : -0.08),
      0.4,
      maxZoom,
    );

    const nextLayout = computePreviewLayout({
      containerWidth: rect.width,
      containerHeight: rect.height,
      imageWidth: activeEditorMeta.width,
      imageHeight: activeEditorMeta.height,
      transform: { ...activeEditorTransform, zoom: nextZoom },
    });

    const currentDrawW = previewLayout.drawW || nextLayout.drawW;
    const currentDrawH = previewLayout.drawH || nextLayout.drawH;
    const ux = currentDrawW
      ? (pointerX - previewLayout.dx) / currentDrawW
      : 0.5;
    const uy = currentDrawH
      ? (pointerY - previewLayout.dy) / currentDrawH
      : 0.5;
    const nextDx = pointerX - ux * nextLayout.drawW;
    const nextDy = pointerY - uy * nextLayout.drawH;
    const offsets = offsetFromDrawPosition({
      containerWidth: rect.width,
      containerHeight: rect.height,
      drawW: nextLayout.drawW,
      drawH: nextLayout.drawH,
      dx: nextDx,
      dy: nextDy,
    });

    updateChannelTransform(activeImageChannel, activeEditorImageKey, {
      zoom: nextZoom,
      ...offsets,
    });
  };

  const handlePreviewPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!activeEditorImageKey) return;
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: activeEditorTransform.offsetX,
      startOffsetY: activeEditorTransform.offsetY,
    };
    setIsDraggingImage(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePreviewPointerMove = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !activeEditorImageKey)
      return;
    const nextOffsetX = previewLayout.maxX
      ? clamp(
          drag.startOffsetX -
            ((event.clientX - drag.startX) / previewLayout.maxX) * 100,
          -100,
          100,
        )
      : 0;
    const nextOffsetY = previewLayout.maxY
      ? clamp(
          drag.startOffsetY -
            ((event.clientY - drag.startY) / previewLayout.maxY) * 100,
          -100,
          100,
        )
      : 0;
    updateChannelTransform(activeImageChannel, activeEditorImageKey, {
      offsetX: nextOffsetX,
      offsetY: nextOffsetY,
    });
  };

  const endPreviewDrag = (event?: React.PointerEvent<HTMLDivElement>) => {
    if (event && dragStateRef.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    dragStateRef.current = null;
    setIsDraggingImage(false);
  };

  const toggleChannelImage = (channel: ChannelKey, imageKey: string) => {
    const impactedChannels = getImpactedImageChannels(channel);
    setChannelImageEditors((prev) => {
      const current = prev[channel] || {
        imageKeys: imageKeys.slice(),
        transforms: {},
      };
      const exists = current.imageKeys.includes(imageKey);
      const nextKeys =
        channel === "gmb"
          ? exists
            ? []
            : [imageKey]
          : exists
            ? current.imageKeys.filter((key) => key !== imageKey)
            : [...current.imageKeys, imageKey];
      const next = { ...prev };
      for (const targetChannel of impactedChannels) {
        const currentTarget = next[targetChannel] || {
          imageKeys: imageKeys.slice(),
          transforms: {},
        };
        next[targetChannel] = {
          imageKeys: nextKeys,
          transforms: {
            ...currentTarget.transforms,
            [imageKey]:
              currentTarget.transforms[imageKey] ||
              getOptimizedTransform(targetChannel, imageMetaByKey[imageKey]),
          },
        };
      }
      return next;
    });
    setActiveImageKeyByChannel((prev) => {
      const currentKeys = channelImageEditors[channel]?.imageKeys || [];
      const exists = currentKeys.includes(imageKey);
      if (channel === "gmb") {
        return { ...prev, [channel]: exists ? "" : imageKey };
      }
      if (prev[channel] !== imageKey) return prev;
      const nextKeys = currentKeys.filter((key) => key !== imageKey);
      return {
        ...prev,
        ...Object.fromEntries(
          impactedChannels.map((targetChannel) => [
            targetChannel,
            nextKeys[0] || "",
          ]),
        ),
      };
    });
  };

  const resetChannelImage = async (channel: ChannelKey, imageKey: string) => {
    const ok = await confirmInrcy({
      eyebrow: "Retouche image",
      title: "Réinitialiser le cadrage ?",
      message:
        "Le cadrage actuel de cette image sera remplacé par le cadrage automatique.",
      cancelLabel: "Annuler",
      confirmLabel: "Réinitialiser",
      variant: "warning",
    });
    if (!ok) return;
    updateChannelTransform(
      channel,
      imageKey,
      getOptimizedTransform(channel, imageMetaByKey[imageKey]),
    );
  };

  const resetActiveChannelImages = async () => {
    const imageKeysForChannel =
      channelImageEditors[activeImageChannel]?.imageKeys || [];
    if (!imageKeysForChannel.length) return;
    const ok = await confirmInrcy({
      eyebrow: "Retouche image",
      title: "Réinitialiser tous les cadrages du canal ?",
      message:
        "Tous les cadrages de ce canal seront remplacés par le cadrage automatique.",
      cancelLabel: "Annuler",
      confirmLabel: "Réinitialiser",
      variant: "warning",
    });
    if (!ok) return;
    setChannelImageEditors((prev) => {
      const next = { ...prev };
      const current = next[activeImageChannel] || {
        imageKeys: imageKeysForChannel,
        transforms: {},
      };
      const transforms = { ...current.transforms };
      for (const imageKey of imageKeysForChannel) {
        transforms[imageKey] = getOptimizedTransform(
          activeImageChannel,
          imageMetaByKey[imageKey],
        );
      }
      next[activeImageChannel] = {
        ...current,
        imageKeys: imageKeysForChannel,
        transforms,
      };
      return next;
    });
  };

  const applyCurrentCadrageToActiveChannelImages = () => {
    if (!activeEditorImageKey) return;
    const imageKeysForChannel =
      channelImageEditors[activeImageChannel]?.imageKeys || [];
    if (imageKeysForChannel.length <= 1) return;
    setChannelImageEditors((prev) => {
      const next = { ...prev };
      const current = next[activeImageChannel] || {
        imageKeys: imageKeysForChannel,
        transforms: {},
      };
      const transforms = { ...current.transforms };
      for (const imageKey of imageKeysForChannel) {
        transforms[imageKey] = { ...activeEditorTransform };
      }
      next[activeImageChannel] = {
        ...current,
        imageKeys: imageKeysForChannel,
        transforms,
      };
      return next;
    });
  };

  const moveChannelImage = (
    channel: ChannelKey,
    imageKey: string,
    direction: -1 | 1,
  ) => {
    setChannelImageEditors((prev) => {
      const current = prev[channel] || {
        imageKeys: imageKeys.slice(),
        transforms: {},
      };
      const index = current.imageKeys.indexOf(imageKey);
      const targetIndex = index + direction;
      if (
        index < 0 ||
        targetIndex < 0 ||
        targetIndex >= current.imageKeys.length
      )
        return prev;
      const nextKeys = current.imageKeys.slice();
      const [moved] = nextKeys.splice(index, 1);
      nextKeys.splice(targetIndex, 0, moved);
      return {
        ...prev,
        [channel]: { ...current, imageKeys: nextKeys },
      };
    });
  };

  const applyCurrentImageToSelectedChannels = () => {
    if (!activeEditorImageKey) return;
    setChannelImageEditors((prev) => {
      const next = { ...prev };
      for (const channel of selectedChannels) {
        const current = next[channel] || {
          imageKeys: imageKeys.slice(),
          transforms: {},
        };
        next[channel] = {
          imageKeys:
            channel === "gmb"
              ? [activeEditorImageKey]
              : current.imageKeys.includes(activeEditorImageKey)
                ? current.imageKeys
                : [...current.imageKeys, activeEditorImageKey],
          transforms: {
            ...current.transforms,
            [activeEditorImageKey]: { ...activeEditorTransform },
          },
        };
      }
      return next;
    });
  };

  const openImageEditor = (channel: ChannelKey, imageKey: string) => {
    setSynchronizedActiveChannel(channel);
    setActiveImageKeyByChannel((prev) => ({ ...prev, [channel]: imageKey }));
    setIsImageEditorOpen(true);
  };

  const closeImageEditor = () => {
    dragStateRef.current = null;
    setIsDraggingImage(false);
    setIsImageEditorOpen(false);
  };

  const buildChannelImagesPayload = async (
    onProgress?: (current: number, total: number) => void,
  ): Promise<{
    channelImages: ChannelImagePayload;
    channelSettings: ChannelImageSettingsPayload;
  }> => {
    const channelImages = {} as ChannelImagePayload;
    const channelSettings = {} as ChannelImageSettingsPayload;
    const getEditorForPublish = (channel: ChannelKey) => {
      return channelImageEditors[channel] || { imageKeys: [], transforms: {} };
    };

    const totalRenders = selectedChannels.reduce((sum, channel) => {
      const editor = getEditorForPublish(channel);
      const keys =
        channel === "gmb" ? editor.imageKeys.slice(0, 1) : editor.imageKeys;
      return sum + keys.length;
    }, 0);
    let doneRenders = 0;

    for (const channel of selectedChannels) {
      const editor = getEditorForPublish(channel);
      const renderList: ImagePayload[] = [];
      const imageKeysToRender =
        channel === "gmb" ? editor.imageKeys.slice(0, 1) : editor.imageKeys;
      for (const imageKey of imageKeysToRender) {
        const file = imageFileByKey[imageKey];
        if (!file) continue;
        const transform =
          editor.transforms[imageKey] || getDefaultTransform(channel);
        renderList.push(
          await renderChannelImage({
            file,
            transform,
            preset: CHANNEL_PRESETS[channel],
          }),
        );
        doneRenders += 1;
        onProgress?.(doneRenders, totalRenders);
      }
      channelImages[channel] = renderList;
      channelSettings[channel] = {
        imageKeys: [...imageKeysToRender],
        transforms: Object.fromEntries(
          Object.entries(editor.transforms || {}).map(([key, value]) => [
            key,
            { ...(value as ImageTransform) },
          ]),
        ),
      };
    }

    if (!totalRenders) onProgress?.(0, 0);

    return { channelImages, channelSettings };
  };

  const runPublish = async (options?: {
    skipEmptyContentWarnings?: boolean;
    skipGmbNoImageWarning?: boolean;
    preparedPostsByChannel?: Partial<Record<ChannelKey, ChannelPost>>;
  }) => {
    if (saving || draftSaving) return;
    const preparedPostsByChannel =
      options?.preparedPostsByChannel || buildPreparedPostsByChannel();

    setPublishError("");
    setDraftMessage("");
    setImgError("");
    setPublishProgress(0);
    setPublishProgressLabel("");
    scrollToPublishArea("smooth");

    if (!selectedChannels.length) {
      setPublishError("Sélectionnez au moins 1 canal.");
      return;
    }

    const missingContentChannels = selectedChannels.filter(
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
      selectedChannels.includes("gmb") &&
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

    if (selectedChannels.includes("instagram")) {
      const instagramImages = channelImageEditors.instagram?.imageKeys || [];
      if (!instagramImages.length) {
        setImgError(
          "Veuillez ajouter au moins 1 image pour publier sur Instagram.",
        );
        return;
      }
    }

    setSaving(true);
    setPublishProgress(5);
    setPublishProgressLabel("Préparation de la publication...");

    try {
      const { channelImages, channelSettings } =
        await buildChannelImagesPayload((current, total) => {
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

      setPublishProgress((prev) => Math.max(prev, 35));
      setPublishProgressLabel("Upload des images...");

      const uploadedChannelImages = {} as ChannelImagePayload;
      const uploadTargets = selectedChannels.reduce(
        (sum, channel) =>
          sum +
          (channelImages[channel] || []).filter((image) => !!image?.dataUrl)
            .length,
        0,
      );
      let uploadedCount = 0;
      for (const channel of selectedChannels) {
        uploadedChannelImages[channel] = await uploadPreparedImages(
          channelImages[channel] || [],
          (current, total) => {
            if (!total) return;
            uploadedCount += 1;
            const ratio = uploadTargets ? uploadedCount / uploadTargets : 1;
            setPublishProgress(clampPercent(35 + ratio * 35));
            setPublishProgressLabel(
              `Upload des images ${clampPercent(ratio * 100)}%`,
            );
          },
        );
      }

      setPublishProgress((prev) => Math.max(prev, 74));
      publishPulseProgressRef.current = 74;
      setPublishProgressLabel("Création de l’historique iNr’Send...");
      if (publishPulseTimerRef.current)
        window.clearInterval(publishPulseTimerRef.current);

      const publishStartedAt = Date.now();
      const publishChannels = [...selectedChannels];
      const estimatedPublishMs = Math.max(
        9000,
        5500 + publishChannels.length * 6500 + (uploadTargets ? 2500 : 0),
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
        const ratio = Math.min(1, (Date.now() - publishStartedAt) / estimatedPublishMs);
        publishPulseProgressRef.current = clampPercent(74 + ratio * 24, 74, 98);
        setPublishProgressLabel(getPublishPulseLabel(ratio));
        setPublishProgress((prev) => Math.max(prev, publishPulseProgressRef.current));
      }, 500);

      const result = await trackEvent("publish", {
        idea: idea.trim(),
        theme,
        channels: selectedChannels,
        postByChannel: preparedPostsByChannel,
        // Avoid sending the same images twice (base images + channel images),
        // which can make the JSON body too large and trigger HTTP 413.
        // The API now rebuilds the fallback/base image set from channel images.
        images: [],
        imagesByChannel: uploadedChannelImages,
        imageSettingsByChannel: channelSettings,
      });

      if (publishPulseTimerRef.current) {
        window.clearInterval(publishPulseTimerRef.current);
        publishPulseTimerRef.current = null;
      }
      setPublishProgress(100);
      setPublishProgressLabel("Publié");
      await sleep(220);
      onUnsavedChange?.(false);
      onPublishSuccess?.(result);
      onClose();
    } catch (e) {
      if (publishPulseTimerRef.current) {
        window.clearInterval(publishPulseTimerRef.current);
        publishPulseTimerRef.current = null;
      }
      setPublishProgress(0);
      setPublishProgressLabel("");
      setPublishError(
        getSimpleFrenchErrorMessage(
          e,
          "La publication n'a pas pu être envoyée. Merci de réessayer.",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const onSavePublicationDraft = async () => {
    if (saving || draftSaving) return;

    setPublishError("");
    setDraftMessage("");

    if (!hasDraftablePublicationContent) {
      setPublishError("Ajoutez un contenu ou une image avant d’enregistrer le brouillon.");
      scrollToPublishArea("smooth");
      return;
    }

    if (!selectedChannels.length) {
      setPublishError("Sélectionnez au moins 1 canal avant d’enregistrer le brouillon.");
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
    const channelLabels = selectedChannels
      .map((channel) => CHANNEL_LABELS[channel] || channel)
      .join(" / ");
    const firstTitle = selectedChannels
      .map((channel) => String(preparedPostsByChannel[channel]?.title || "").trim())
      .find(Boolean);
    const firstContent = selectedChannels
      .map((channel) => String(preparedPostsByChannel[channel]?.content || "").trim())
      .find(Boolean);

    setDraftSaving(true);
    try {
      const imageDrafts = await uploadPublicationDraftImages();
      const response = await fetch("/api/booster/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "publish_draft",
          draftId: loadedPublicationDraftId || publicationDraftIdParam || undefined,
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
            imageNames,
            imageDrafts,
            useImagesForAI,
            imageSettingsByChannel: getDraftImageSettingsByChannel(),
            instagramHashtagsInput,
            saved_at: new Date().toISOString(),
          },
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(result?.error || "Impossible d’enregistrer le brouillon publication."));
      }
      const savedDraftId = String(result?.id || loadedPublicationDraftId || publicationDraftIdParam || "").trim();
      if (savedDraftId) {
        setLoadedPublicationDraftId(savedDraftId);
        router.replace(`/dashboard?action=publish&draftId=${encodeURIComponent(savedDraftId)}`, { scroll: false });
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

  const onPublish = async () => {
    if (saving || draftSaving) return;
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
    setSynchronizedActiveChannel("gmb");
    setPendingPublishPosts(null);
  };

  const getPublishImageKeysForChannel = (channel: ChannelKey) => {
    const keys = channelImageEditors[channel]?.imageKeys || [];
    return channel === "gmb" ? keys.slice(0, 1) : keys;
  };

  const getReviewPostForChannel = (
    channel: ChannelKey,
    preparedPostsByChannel: Partial<Record<ChannelKey, ChannelPost>>,
  ) => {
    return normalizePost(preparedPostsByChannel[channel]);
  };

  const buildFinalReviewItems = (
    preparedPostsByChannel: Partial<Record<ChannelKey, ChannelPost>>,
  ) => {
    return selectedChannels.map((channel) => {
      const post = getReviewPostForChannel(channel, preparedPostsByChannel);
      const rawImageKeys = channelImageEditors[channel]?.imageKeys || [];
      const imageKeysToPublish = getPublishImageKeysForChannel(channel);
      const warnings: string[] = [];
      const blockers: string[] = [];
      const hasTitle = !!String(post?.title || "").trim();
      const hasContent = !!String(post?.content || "").trim();
      const hasText = hasTitle || hasContent;
      const hasImage = imageKeysToPublish.length > 0;

      if (!hasContent) warnings.push("Contenu vide");
      if (!hasTitle) warnings.push("Titre vide");
      if (!hasImage) {
        if (channel === "instagram")
          blockers.push("Instagram nécessite au moins 1 image.");
        else if (channel === "gmb")
          warnings.push("Google Business sera publié sans photo.");
        else warnings.push("Aucune image sélectionnée.");
      }
      if (!hasText && !hasImage) {
        blockers.push("Ajoutez au moins du texte ou une image.");
      }
      if (channel === "gmb" && rawImageKeys.length > 1) {
        warnings.push("Google Business publiera uniquement la première photo.");
      }

      return {
        channel,
        label: CHANNEL_LABELS[channel],
        imageCount: imageKeysToPublish.length,
        warnings,
        blockers,
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
  const finalReviewBlockers = finalReviewItems.flatMap((item) => item.blockers);
  const hasFinalReviewBlockers = finalReviewBlockers.length > 0;
  const finalReviewSiteNotice =
    selectedChannels.includes("inrcy_site") &&
    selectedChannels.includes("site_web")
      ? getPublishImageKeysForChannel("inrcy_site").join("|") !==
        getPublishImageKeysForChannel("site_web").join("|")
      : false;

  const publishReadinessItems = buildFinalReviewItems(
    buildPreparedPostsByChannel(),
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
    const hasImage = !!reviewItem?.hasImage;
    return {
      key: channel,
      label: getImageAdapterLabel(channel),
      tone: hasText && hasImage
        ? ("ready" as const)
        : hasText || hasImage
          ? ("warning" as const)
          : ("blocked" as const),
    };
  });

  const closeFinalReview = () => {
    setFinalReviewOpen(false);
  };

  const aiDrawerHeight = isMobile
    ? drawerViewportHeight
      ? `${drawerViewportHeight}px`
      : "100svh"
    : "100%";
  const publicationImagesPanelVisible = true;

  const confirmFinalReview = async () => {
    const preparedPostsByChannel =
      finalReviewPosts || buildPreparedPostsByChannel();
    const items = buildFinalReviewItems(preparedPostsByChannel);
    if (items.some((item) => item.blockers.length)) return;
    setFinalReviewOpen(false);
    setFinalReviewPosts(null);
    await runPublish({
      skipEmptyContentWarnings: true,
      skipGmbNoImageWarning: true,
      preparedPostsByChannel,
    });
  };

  return (
    <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
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


      <PublishFinalReviewModal
        open={finalReviewOpen}
        styles={styles}
        items={finalReviewItems}
        showSiteNotice={finalReviewSiteNotice}
        hasBlockers={hasFinalReviewBlockers}
        isMobile={isMobile}
        saving={saving}
        onClose={closeFinalReview}
        onConfirm={confirmFinalReview}
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

      <PublishChannelSelector
        styles={styles}
        isMobile={isMobile}
        connected={connected}
        channels={channels}
        channelInfoOpen={channelInfoOpen}
        setChannelInfoOpen={setChannelInfoOpen}
        toggle={toggle}
        getChannelDetailInfo={getChannelDetailInfo}
      />

      <PublishIntentPanel
        styles={styles}
        isMobile={isMobile}
        theme={theme}
        idea={idea}
        setIdea={setIdea}
        fileInputRef={fileInputRef}
        onImagesChange={onImagesChange}
        onPickImagesClick={onPickImagesClick}
        images={images}
        imagePreviews={imagePreviews}
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
        applyCtaModePrefill={applyCtaModePrefill}
        instagramHashtagsInput={instagramHashtagsInput}
        setInstagramHashtagsInput={setInstagramHashtagsInput}
        getLiveInstagramHashtags={getLiveInstagramHashtags}
        duplicateFeedback={duplicateFeedback}
        onDuplicateContentToAllChannels={onDuplicateContentToAllChannels}
      />

      <PublishImagesPanel
        styles={styles}
        images={images}
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
        subtitle={`${getImageAdapterLabel(activeImageChannel)} • ${CHANNEL_PRESETS[activeImageChannel].width}×${CHANNEL_PRESETS[activeImageChannel].height}`}
        aspectRatio={previewAspectRatio}
        backgroundMode={activeBackgroundMode}
        backgroundColor={activeBackgroundColor}
        fitLabel={activeEditorTransform.fit === "cover" ? "Remplir" : "Adapter"}
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
        isolationNote={`Ce réglage concerne uniquement ${getImageAdapterLabel(activeImageChannel)}. Les autres canaux restent indépendants.`}
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
                      ? "#e8f6ff"
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
          return {
            key,
            previewUrl: previewByKey[key],
            title: `Image ${index + 1}`,
            subtitle: included
              ? "Publiée sur ce canal"
              : "Non envoyée sur ce canal",
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
        draftSaving={draftSaving}
        publishProgress={publishProgress}
        publishProgressLabel={publishProgressLabel}
        publishError={publishError}
        onOpenHelp={() => setPublishHelpOpen(true)}
        onPublish={onPublish}
      />
    </div>
  );
}
