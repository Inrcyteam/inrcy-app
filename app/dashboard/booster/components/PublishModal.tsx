import HelpButton from "../../_components/HelpButton";
import HelpModal from "../../_components/HelpModal";
import StatusMessage from "../../_components/StatusMessage";
import AiConfigurationContent from "../../settings/_components/AiConfigurationContent";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import {
  readSanitizedElementHtml,
  syncSanitizedElementHtml,
} from "@/lib/sanitizeHtml";
import { confirmInrcy } from "@/lib/inrcyDialog";
import {
  editableHtmlToSiteText,
  siteTextToEditableHtml,
  stripSiteTextFormatting,
} from "@/lib/boosterFormatting";
import stylesDash from "../../dashboard/dashboard.module.css";
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
  channelBtn,
  channelBtnDisabled,
  darkOptionStyle,
  darkSelectStyle,
  inputStyle,
  lightFieldStyle,
  pillBtn,
  pillBtnActive,
  textAreaStyle,
} from "./publishModal.styles";

function RichSiteContentEditor({
  value,
  onChange,
  minHeight,
  editorRef,
  style,
}: {
  value: string;
  onChange: (value: string) => void;
  minHeight: number;
  editorRef: { current: HTMLDivElement | null };
  style: Record<string, any>;
}) {
  const localRef = useRef<HTMLDivElement | null>(null);
  const lastSyncedValueRef = useRef<string>("");

  useEffect(() => {
    const node = localRef.current;
    if (!node) return;
    editorRef.current = node;
    return () => {
      if (editorRef.current === node) editorRef.current = null;
    };
  }, [editorRef]);

  useEffect(() => {
    const node = localRef.current;
    if (!node) return;

    const currentValue = editableHtmlToSiteText(readSanitizedElementHtml(node));
    if (document.activeElement === node && currentValue === value) {
      lastSyncedValueRef.current = value;
      return;
    }

    if (lastSyncedValueRef.current === value && currentValue === value) return;

    syncSanitizedElementHtml(node, siteTextToEditableHtml(value));
    lastSyncedValueRef.current = value;
  }, [value]);

  const sync = () => {
    const node = localRef.current;
    if (!node) return;
    const nextValue = editableHtmlToSiteText(readSanitizedElementHtml(node));
    lastSyncedValueRef.current = nextValue;
    onChange(nextValue);
  };

  return (
    <div
      ref={localRef}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      onInput={sync}
      onBlur={sync}
      onPaste={(event) => {
        if (event.cancelable) event.preventDefault();
        const text = event.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, text);
        sync();
      }}
      style={{
        ...style,
        minHeight,
        height: "auto",
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        outline: "none",
      }}
    />
  );
}

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
}: {
  styles: typeof stylesDash;
  onClose: () => void;
  trackEvent: (type: "publish", payload: Record<string, any>) => Promise<any>;
  onPublishSuccess?: (result?: any) => void;
  onOverlayOpenChange?: (open: boolean) => void;
  onUnsavedChange?: (hasUnsavedChanges: boolean) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [idea, setIdea] = useState("");
  const [theme, setTheme] = useState<ThemeKey>("");
  const [contentStyle, setContentStyle] = useState<StyleKey>("equilibre");
  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStage, setGenerationStage] = useState("");
  const generationTimersRef = useRef<number[]>([]);
  const [genError, setGenError] = useState("");
  const [publishError, setPublishError] = useState("");
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
  };

  useEffect(() => {
    return () => {
      generationTimersRef.current.forEach((timerId) =>
        window.clearTimeout(timerId),
      );
      generationTimersRef.current = [];
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

  const hasUnsavedChanges = useMemo(() => {
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

  useEffect(() => {
    onUnsavedChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onUnsavedChange]);

  useEffect(() => {
    if (!hasUnsavedChanges || saving) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges, saving]);

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
    setFinalReviewOpen(false);
    setFinalReviewPosts(null);
    imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    setImages([]);
    setImagePreviews([]);
    setImgError("");
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

    clearGenerationTimers();
    setGenerating(true);
    setGenerationProgress(10);
    setGenerationStage("Préparation");
    setDuplicateFeedback(null);

    const generationSteps = [
      { percent: 25, label: "Analyse de l’intention", delay: 650 },
      { percent: 45, label: "Génération des contenus", delay: 1500 },
      { percent: 70, label: "Adaptation par canal", delay: 2800 },
      { percent: 90, label: "Finalisation", delay: 4200 },
    ];
    generationTimersRef.current = generationSteps.map((step) =>
      window.setTimeout(() => {
        setGenerationProgress((current) => Math.max(current, step.percent));
        setGenerationStage(step.label);
      }, step.delay),
    );

    let didGenerate = false;
    try {
      const res = await fetch("/api/booster/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea: trimmed,
          theme,
          style: contentStyle,
          channels: selectedForGeneration,
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
      setGenError("Connexion impossible pour le moment. Merci de réessayer.");
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
            { ...value },
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
    if (saving) return;
    const preparedPostsByChannel =
      options?.preparedPostsByChannel || buildPreparedPostsByChannel();

    setPublishError("");
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
      setPublishProgressLabel("Envoi aux canaux...");
      if (publishPulseTimerRef.current)
        window.clearInterval(publishPulseTimerRef.current);
      publishPulseTimerRef.current = window.setInterval(() => {
        setPublishProgress((prev) => (prev >= 94 ? prev : prev + 1));
      }, 220);

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

  const onPublish = async () => {
    if (saving) return;
    const preparedPostsByChannel = buildPreparedPostsByChannel();
    setPublishError("");
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

      if (!hasContent) warnings.push("Contenu vide");
      if (!hasTitle) warnings.push("Titre vide");
      if (!imageKeysToPublish.length) {
        if (channel === "instagram")
          blockers.push("Instagram nécessite au moins 1 image.");
        else if (channel === "gmb")
          warnings.push("Google Business sera publié sans photo.");
        else warnings.push("Aucune image sélectionnée.");
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
    const blockerCount = reviewItem?.blockers.length || 0;
    const warningCount = reviewItem?.warnings.length || 0;
    const count =
      reviewItem?.imageCount ?? getPublishImageKeysForChannel(channel).length;
    return {
      key: channel,
      label: getImageAdapterLabel(channel),
      count,
      tone: blockerCount
        ? ("blocked" as const)
        : warningCount
          ? ("warning" as const)
          : count
            ? ("ready" as const)
            : ("empty" as const),
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
      <HelpModal
        open={publishHelpOpen}
        title="Publication et iNr'Send"
        onClose={() => setPublishHelpOpen(false)}
      >
        <div style={{ display: "grid", gap: 12, lineHeight: 1.6 }}>
          <p style={{ margin: 0 }}>
            Après publication, retrouvez cette communication dans{" "}
            <strong>iNr'Send / Publications</strong>.
          </p>
          <p style={{ margin: 0 }}>
            Vous pourrez la consulter, la modifier ou la supprimer depuis
            l'outil.
          </p>
        </div>
      </HelpModal>

      {aiConfigurationOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Configuration IA"
          onClick={() => setAiConfigurationOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10020,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            justifyContent: isMobile ? "stretch" : "flex-end",
            overflow: "hidden",
            padding: isMobile ? 0 : undefined,
          }}
        >
          <aside
            onClick={(event) => event.stopPropagation()}
            style={{
              width: isMobile ? "100vw" : "min(560px, 92vw)",
              maxWidth: "100vw",
              height: aiDrawerHeight,
              maxHeight: aiDrawerHeight,
              boxSizing: "border-box",
              background: "rgba(16,16,16,0.98)",
              borderLeft: isMobile ? 0 : "1px solid rgba(255,255,255,0.08)",
              padding: isMobile
                ? "max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))"
                : 16,
              overflowY: "auto",
              overflowX: "hidden",
              overscrollBehavior: "contain",
              WebkitOverflowScrolling: "touch",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                alignItems: "center",
                gap: 12,
                minWidth: 0,
                width: "100%",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: "clamp(16px, 4.3vw, 18px)",
                  fontWeight: 800,
                  minWidth: 0,
                  maxWidth: "100%",
                  overflowWrap: "break-word",
                  wordBreak: "normal",
                  hyphens: "auto",
                  lineHeight: 1.25,
                  color: "white",
                }}
              >
                Configuration IA
              </h2>
              <button
                type="button"
                onClick={() => setAiConfigurationOpen(false)}
                style={{
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "transparent",
                  color: "white",
                  borderRadius: 10,
                  padding: "8px 10px",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                Fermer
              </button>
            </div>
            <div style={{ marginTop: 12, minWidth: 0, maxWidth: "100%", overflowX: "hidden" }}>
              <AiConfigurationContent mode="drawer" />
            </div>
          </aside>
        </div>
      ) : null}


      {finalReviewOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10012,
            background: "rgba(4, 8, 18, 0.74)",
            backdropFilter: "blur(8px)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            overflowY: "auto",
            overscrollBehavior: "contain",
          }}
        >
          <div
            className={styles.blockCard}
            style={{
              width: "min(760px, 100%)",
              maxHeight: "calc(100vh - 32px)",
              overflowY: "auto",
              display: "grid",
              gap: 16,
              background: "#111827",
              backgroundImage: "none",
              border: "1px solid rgba(148, 163, 184, 0.28)",
              boxShadow: "0 30px 90px rgba(0,0,0,0.62)",
              backdropFilter: "none",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "flex-start",
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 22 }}>✅</div>
                <div className={styles.blockTitle} style={{ marginBottom: 0 }}>
                  Vérification avant publication
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "rgba(255,255,255,0.72)",
                    lineHeight: 1.5,
                  }}
                >
                  Contrôlez les canaux, les images et les alertes avant l’envoi
                  final.
                </div>
              </div>
              <div
                style={{
                  fontSize: 12,
                  padding: "7px 10px",
                  borderRadius: 999,
                  background: "rgba(76,195,255,0.10)",
                  border: "1px solid rgba(76,195,255,0.22)",
                  color: "rgba(255,255,255,0.86)",
                }}
              >
                {finalReviewItems.length} canal(aux) sélectionné(s)
              </div>
            </div>

            {finalReviewSiteNotice ? (
              <div
                style={{
                  borderRadius: 14,
                  padding: 12,
                  background: "rgba(76,195,255,0.08)",
                  border: "1px solid rgba(76,195,255,0.18)",
                  color: "rgba(255,255,255,0.82)",
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                Site iNrCy et Site web ont des images ou un ordre différent :
                c’est normal, les deux canaux sont indépendants.
              </div>
            ) : null}

            <div style={{ display: "grid", gap: 10 }}>
              {finalReviewItems.map((item) => {
                const hasAlerts = item.warnings.length || item.blockers.length;
                return (
                  <div
                    key={item.channel}
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile
                        ? "1fr"
                        : "minmax(140px, 0.8fr) minmax(120px, 0.55fr) minmax(0, 1.4fr)",
                      gap: 10,
                      alignItems: "center",
                      borderRadius: 16,
                      padding: 12,
                      background: "rgba(255,255,255,0.04)",
                      border: item.blockers.length
                        ? "1px solid rgba(248,113,113,0.34)"
                        : hasAlerts
                          ? "1px solid rgba(251,191,36,0.26)"
                          : "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div style={{ minWidth: 0, display: "grid", gap: 5 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ fontWeight: 900, color: "#fff" }}>
                          {item.label}
                        </div>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 900,
                            padding: "4px 7px",
                            borderRadius: 999,
                            background: item.blockers.length
                              ? "rgba(248,113,113,0.14)"
                              : item.warnings.length
                                ? "rgba(251,191,36,0.14)"
                                : "rgba(34,197,94,0.14)",
                            color: item.blockers.length
                              ? "#fecaca"
                              : item.warnings.length
                                ? "#fde68a"
                                : "#bbf7d0",
                            border: item.blockers.length
                              ? "1px solid rgba(248,113,113,0.25)"
                              : item.warnings.length
                                ? "1px solid rgba(251,191,36,0.25)"
                                : "1px solid rgba(34,197,94,0.25)",
                          }}
                        >
                          {item.blockers.length
                            ? "Bloquant"
                            : item.warnings.length
                              ? "À vérifier"
                              : "Prêt"}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "rgba(255,255,255,0.58)",
                        }}
                      >
                        Canal sélectionné
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span
                        style={{
                          fontSize: 12,
                          padding: "6px 9px",
                          borderRadius: 999,
                          background: "rgba(255,255,255,0.07)",
                          color: "rgba(255,255,255,0.84)",
                        }}
                      >
                        {item.imageCount
                          ? `${item.imageCount} image${item.imageCount > 1 ? "s" : ""}`
                          : "Aucune image"}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          padding: "6px 9px",
                          borderRadius: 999,
                          background: item.hasContent
                            ? "rgba(34,197,94,0.12)"
                            : "rgba(251,191,36,0.12)",
                          color: item.hasContent ? "#bbf7d0" : "#fde68a",
                        }}
                      >
                        {item.hasContent ? "Texte OK" : "Texte vide"}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gap: 6,
                        fontSize: 12,
                        lineHeight: 1.45,
                      }}
                    >
                      {!hasAlerts ? (
                        <span style={{ color: "#bbf7d0" }}>
                          Prêt à publier.
                        </span>
                      ) : null}
                      {item.warnings.map((warning) => (
                        <span key={warning} style={{ color: "#fde68a" }}>
                          ⚠️ {warning}
                        </span>
                      ))}
                      {item.blockers.map((blocker) => (
                        <span key={blocker} style={{ color: "#fecaca" }}>
                          ⛔ {blocker}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {hasFinalReviewBlockers ? (
              <div
                style={{
                  borderRadius: 14,
                  padding: 12,
                  background: "rgba(248,113,113,0.10)",
                  border: "1px solid rgba(248,113,113,0.24)",
                  color: "#fecaca",
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                Corrigez les points bloquants avant de publier.
              </div>
            ) : null}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                flexWrap: "wrap",
                position: "sticky",
                bottom: -1,
                paddingTop: 4,
                background: "#111827",
              }}
            >
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={closeFinalReview}
              >
                Retour modifier
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={confirmFinalReview}
                disabled={hasFinalReviewBlockers || saving}
                style={{ opacity: hasFinalReviewBlockers || saving ? 0.58 : 1 }}
              >
                {saving
                  ? "Publication en cours..."
                  : "Confirmer la publication"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {currentEmptyContentWarningChannel ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10010,
            background: "rgba(4, 8, 18, 0.72)",
            backdropFilter: "blur(8px)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <div
            className={styles.blockCard}
            style={{
              width: "min(520px, 100%)",
              display: "grid",
              gap: 14,
              background: "#111827",
              backgroundImage: "none",
              border: "1px solid rgba(148, 163, 184, 0.28)",
              boxShadow: "0 30px 90px rgba(0,0,0,0.62)",
              backdropFilter: "none",
            }}
          >
            <div style={{ fontSize: 22 }}>⚠️</div>
            <div style={{ display: "grid", gap: 8 }}>
              <div className={styles.blockTitle} style={{ marginBottom: 0 }}>
                Avertissement
              </div>
              <div
                style={{
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: "rgba(255,255,255,0.82)",
                }}
              >
                Le contenu est vide pour{" "}
                <strong>
                  {CHANNEL_LABELS[currentEmptyContentWarningChannel]}
                </strong>
                . Voulez-vous continuer ?
              </div>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={closeEmptyContentWarnings}
              >
                Annuler
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={onValidateEmptyContentWarning}
              >
                Valider
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {gmbNoImageWarningOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10010,
            background: "rgba(4, 8, 18, 0.72)",
            backdropFilter: "blur(8px)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <div
            className={styles.blockCard}
            style={{
              width: "min(520px, 100%)",
              display: "grid",
              gap: 14,
              background: "#111827",
              backgroundImage: "none",
              border: "1px solid rgba(148, 163, 184, 0.28)",
              boxShadow: "0 30px 90px rgba(0,0,0,0.62)",
              backdropFilter: "none",
            }}
          >
            <div style={{ fontSize: 22 }}>📷</div>
            <div style={{ display: "grid", gap: 8 }}>
              <div className={styles.blockTitle} style={{ marginBottom: 0 }}>
                Aucune photo Google Business
              </div>
              <div
                style={{
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: "rgba(255,255,255,0.82)",
                }}
              >
                Aucune photo n’est sélectionnée pour{" "}
                <strong>Google Business</strong>. Le post sera publié en texte
                seul. Souhaitez-vous continuer ?
              </div>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={onChooseGmbImage}
              >
                Retour / choisir une photo
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={onContinueWithoutGmbImage}
              >
                Continuer sans photo
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div
        className={styles.blockCard}
        style={{ minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}
      >
        <div className={styles.blockTitle} style={{ marginBottom: 8 }}>
          Canaux
        </div>
        <div className={styles.subtitle} style={{ marginBottom: 10 }}>
          iNrCy diffuse une version adaptée sur chaque canal sélectionné !
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
            gap: 10,
          }}
        >
          {(Object.keys(CHANNEL_LABELS) as ChannelKey[]).map((key) => {
            const info = getChannelDetailInfo(key);
            const isConnected = connected[key];
            const isSelected = channels[key] && isConnected;
            const isInfoVisible = channelInfoOpen === key && !!info;
            return (
              <div
                key={key}
                onClick={() => toggle(key)}
                role="button"
                tabIndex={isConnected ? 0 : -1}
                aria-disabled={!isConnected}
                onKeyDown={(event) => {
                  if (!isConnected) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggle(key);
                  }
                }}
                style={{
                  ...channelBtn,
                  ...(!isConnected ? channelBtnDisabled : {}),
                  minHeight: isMobile ? 58 : 62,
                  padding: isMobile ? "10px 12px" : "10px 12px",
                  position: "relative",
                  overflow: "visible",
                  borderColor: isSelected
                    ? "rgba(76,195,255,0.45)"
                    : "rgba(255,255,255,0.10)",
                  boxShadow: isSelected
                    ? "0 0 0 1px rgba(76,195,255,0.18) inset, 0 10px 24px rgba(8,18,34,0.18)"
                    : "none",
                  background: isSelected
                    ? "rgba(76,195,255,0.08)"
                    : "rgba(255,255,255,0.03)",
                  cursor: isConnected ? "pointer" : "not-allowed",
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!channels[key]}
                    onChange={() => toggle(key)}
                    disabled={!isConnected}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: 18,
                      height: 18,
                      accentColor: "#4cc3ff",
                      cursor: isConnected ? "pointer" : "not-allowed",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      background: isConnected ? "#43d17d" : "#ff6b7d",
                      boxShadow: isConnected
                        ? "0 0 12px rgba(67,209,125,0.35)"
                        : "0 0 12px rgba(255,107,125,0.25)",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      minWidth: 0,
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      textAlign: "left",
                      overflow: "hidden",
                    }}
                  >
                    <span
                      style={{
                        minWidth: 0,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        fontWeight: 800,
                        flexShrink: 0,
                      }}
                    >
                      {CHANNEL_LABELS[key]}
                    </span>
                    {!isMobile && info ? (
                      <>
                        <span
                          style={{
                            width: 4,
                            height: 4,
                            borderRadius: 999,
                            background: "rgba(255,255,255,0.3)",
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            minWidth: 0,
                            fontSize: 12,
                            lineHeight: 1.35,
                            color: "rgba(255,255,255,0.68)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {info.desktopLabel}
                        </span>
                      </>
                    ) : null}
                  </span>
                </span>
                {info ? (
                  <>
                    <button
                      type="button"
                      aria-label={`Voir les détails de ${CHANNEL_LABELS[key]}`}
                      title={
                        isMobile
                          ? `Voir les détails de ${CHANNEL_LABELS[key]}`
                          : info.fullLabel
                      }
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        setChannelInfoOpen((prev) =>
                          prev === key ? null : key,
                        );
                      }}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,0.14)",
                        background: isInfoVisible
                          ? "rgba(76,195,255,0.14)"
                          : "rgba(255,255,255,0.06)",
                        color: "rgba(255,255,255,0.88)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        cursor: "pointer",
                        boxShadow: isInfoVisible
                          ? "0 0 0 1px rgba(76,195,255,0.16) inset"
                          : "none",
                      }}
                    >
                      🔗
                    </button>
                    {isInfoVisible ? (
                      <div
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => event.stopPropagation()}
                        style={{
                          position: "absolute",
                          top: "50%",
                          right: 50,
                          transform: "translateY(-50%)",
                          zIndex: 20,
                          maxWidth: isMobile
                            ? "min(200px, calc(100% - 70px))"
                            : 240,
                          borderRadius: 999,
                          padding: isMobile ? "8px 12px" : "10px 14px",
                          background: "rgba(9,16,31,0.96)",
                          border: "1px solid rgba(148,163,184,0.22)",
                          boxShadow: "0 18px 40px rgba(0,0,0,0.34)",
                          textAlign: "left",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            lineHeight: 1.35,
                            color: "rgba(255,255,255,0.92)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {info.mobileLabel}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div
        className={styles.blockCard}
        style={{ minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 8,
            flexWrap: "wrap",
          }}
        >
          <div className={styles.blockTitle}>Votre intention</div>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => setAiConfigurationOpen(true)}
            style={{
              minHeight: 34,
              padding: "7px 12px",
              fontSize: 12,
              fontWeight: 900,
              whiteSpace: "nowrap",
            }}
          >
            ⚙️ Configuration IA
          </button>
        </div>
        <div
          className={styles.subtitle}
          style={{ marginBottom: 10, maxWidth: "none", whiteSpace: "normal" }}
        >
Expliquez votre idée : iNrCy la transforme en contenu efficace et adapté à chaque canal. Plus votre phrase est détaillée, meilleur sera le résultat.
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>
              Phrase libre
            </div>
            <textarea
              placeholder={THEME_PLACEHOLDERS[theme] || THEME_PLACEHOLDERS[""]}
              style={textAreaStyle}
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
            />
          </div>
          {genError ? (
            <div style={{ fontSize: 13, color: "#ffb4b4" }}>{genError}</div>
          ) : null}
          <div style={{ display: "grid", gap: 6, justifyItems: "start" }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={onGenerate}
                disabled={generating}
              >
                {generating
                  ? `${generationStage || "Génération"} ${generationProgress}%`
                  : "Générer avec iNrCy"}
              </button>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={onReset}
              >
                Réinitialiser
              </button>
            </div>
            {generating ? (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)" }}>
                iNrCy prépare les variantes adaptées à chaque canal.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className={styles.blockCard}
        style={{ minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}
      >
        <div className={styles.blockTitle} style={{ marginBottom: 8 }}>
          Contenus par canal
        </div>
        <div
          className={styles.subtitle}
          style={{ marginBottom: 10, maxWidth: "none", whiteSpace: "normal" }}
        >
          Vérifiez chaque contenu et adaptez le si besoin.
        </div>
        {displayCards.length ? (
          <>
            <div
              style={{
                display: isMobile ? "grid" : "flex",
                gridTemplateColumns: isMobile
                  ? "repeat(2, minmax(0, 1fr))"
                  : undefined,
                gap: 8,
                flexWrap: isMobile ? undefined : "wrap",
                marginBottom: 12,
                overflowX: "hidden",
              }}
            >
              {displayCards.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSynchronizedActiveChannel(key)}
                  style={{
                    ...pillBtn,
                    ...(activeCard === key ? pillBtnActive : {}),
                    ...(isMobile
                      ? {
                          width: "100%",
                          minWidth: 0,
                          minHeight: 36,
                          padding: "0 8px",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 13,
                        }
                      : {}),
                  }}
                >
                  {DISPLAY_LABELS[key]}
                </button>
              ))}
            </div>
            <div
              style={{
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 16,
                padding: 12,
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 10 }}>
                {DISPLAY_LABELS[activeCard]}
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>
                    Titre
                  </div>
                  <input
                    value={getDisplayPost(activeCard).title}
                    onChange={(e) =>
                      updatePost(activeCard, { title: e.target.value })
                    }
                    style={inputStyle}
                    placeholder="Titre"
                  />
                  {renderLimitCounter(
                    "Titre",
                    getDisplayPost(activeCard).title.length,
                    CHANNEL_TEXT_GUIDELINES[activeCard].title,
                  )}
                </div>
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      marginBottom: 6,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontSize: 12, opacity: 0.85 }}>Contenu</div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        flexWrap: "wrap",
                      }}
                    >
                      {!isSiteDisplayKey(activeCard) ? (
                        <span
                          style={{
                            fontSize: 11,
                            color: "rgba(255,255,255,0.48)",
                            marginRight: 2,
                          }}
                        >
                          Formatage réservé au site internet
                        </span>
                      ) : null}
                      {(
                        [
                          ["bold", "B", "Gras"],
                          ["italic", "I", "Italique"],
                          ["underline", "U", "Souligné"],
                        ] as const
                      ).map(([kind, label, title]) => (
                        <button
                          key={kind}
                          type="button"
                          title={
                            isSiteDisplayKey(activeCard)
                              ? title
                              : "Disponible uniquement pour Site internet"
                          }
                          aria-label={title}
                          disabled={!isSiteDisplayKey(activeCard)}
                          onMouseDown={(event) => {
                            if (event.cancelable) event.preventDefault();
                            applySiteContentFormat(kind);
                          }}
                          style={{
                            minWidth: 32,
                            height: 30,
                            borderRadius: 9,
                            border:
                              isSiteDisplayKey(activeCard)
                                ? "1px solid rgba(76,195,255,0.35)"
                                : "1px solid rgba(255,255,255,0.10)",
                            background:
                              isSiteDisplayKey(activeCard)
                                ? "rgba(76,195,255,0.12)"
                                : "rgba(255,255,255,0.04)",
                            color:
                              isSiteDisplayKey(activeCard)
                                ? "#eaf7ff"
                                : "rgba(255,255,255,0.32)",
                            fontWeight: 900,
                            fontStyle: kind === "italic" ? "italic" : "normal",
                            textDecoration:
                              kind === "underline" ? "underline" : "none",
                            cursor:
                              isSiteDisplayKey(activeCard) ? "pointer" : "not-allowed",
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {isSiteDisplayKey(activeCard) ? (
                    <RichSiteContentEditor
                      value={getDisplayPost(activeCard).content}
                      onChange={(content) =>
                        updatePost(activeCard, { content })
                      }
                      minHeight={280}
                      editorRef={siteContentEditorRef}
                      style={textAreaStyle}
                    />
                  ) : (
                    <textarea
                      ref={contentTextAreaRef}
                      value={getDisplayPost(activeCard).content}
                      onChange={(e) =>
                        updatePost(activeCard, { content: e.target.value })
                      }
                      style={{ ...textAreaStyle, minHeight: 160 }}
                      placeholder="Contenu"
                    />
                  )}
                  {renderLimitCounter(
                    "Contenu",
                    isSiteDisplayKey(activeCard)
                      ? stripSiteTextFormatting(
                          getDisplayPost(activeCard).content,
                        ).length
                      : getDisplayPost(activeCard).content.length,
                    CHANNEL_TEXT_GUIDELINES[activeCard].content,
                  )}
                </div>
                <div>
                  {(() => {
                    const currentPost = getDisplayPost(activeCard);
                    const ctaMode = currentPost.ctaMode || "none";
                    const updateTarget = activeCard;
                    const activeWebsiteUrl = getWebsiteUrlForChannel(activeCard, ctaDefaults);
                    const activeWebsiteSourceLabel = getWebsiteSourceLabelForChannel(activeCard, ctaDefaults);
                    const websiteChoices = [
                      ctaDefaults?.inrcySiteUrl
                        ? { label: "Site iNrCy", url: ctaDefaults.inrcySiteUrl }
                        : null,
                      ctaDefaults?.siteWebUrl
                        ? { label: "Site web", url: ctaDefaults.siteWebUrl }
                        : null,
                    ].filter(Boolean) as Array<{ label: string; url: string }>;
                    const ctaGridColumns = isMobile
                      ? "1fr"
                      : ctaMode === "website"
                        ? "minmax(0, 0.8fr) minmax(0, 1.1fr) minmax(0, 1fr)"
                        : ctaMode === "call" || ctaMode === "custom"
                          ? "minmax(0, 0.9fr) minmax(0, 1.1fr)"
                          : "minmax(0, 0.9fr)";

                    return (
                      <>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: ctaGridColumns,
                            gap: 10,
                            alignItems: "start",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontSize: 12,
                                opacity: 0.85,
                                marginBottom: 6,
                              }}
                            >
                              CTA
                            </div>
                            <select
                              value={ctaMode}
                              onChange={(e) =>
                                applyCtaModePrefill(
                                  activeCard,
                                  e.target.value as BoosterCtaMode,
                                )
                              }
                              style={darkSelectStyle}
                            >
                              {CTA_MODE_OPTIONS[activeCard].map((option) => (
                                <option
                                  key={option.value}
                                  value={option.value}
                                  style={darkOptionStyle}
                                >
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          {ctaMode === "website" ? (
                            <>
                              <div>
                                <div
                                  style={{
                                    fontSize: 12,
                                    opacity: 0.85,
                                    marginBottom: 6,
                                  }}
                                >
                                  Lien du CTA
                                </div>
                                <input
                                  value={currentPost.ctaUrl || ""}
                                  onChange={(e) =>
                                    updatePost(updateTarget, {
                                      ctaUrl: e.target.value,
                                    })
                                  }
                                  style={lightFieldStyle}
                                  placeholder={
                                    activeWebsiteUrl
                                      ? `URL du site préremplie (${activeWebsiteSourceLabel})`
                                      : websiteChoices.length > 1
                                        ? "Choisissez Site iNrCy ou Site web"
                                        : "URL du site (optionnel)"
                                  }
                                />
                                {websiteChoices.length ? (
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: 6,
                                      flexWrap: "wrap",
                                      marginTop: 7,
                                    }}
                                  >
                                    {websiteChoices.map((choice) => (
                                      <button
                                        key={choice.label}
                                        type="button"
                                        onClick={() =>
                                          updatePost(updateTarget, {
                                            ctaUrl: choice.url,
                                          })
                                        }
                                        style={{
                                          border: currentPost.ctaUrl === choice.url
                                            ? "1px solid rgba(76,195,255,0.55)"
                                            : "1px solid rgba(255,255,255,0.14)",
                                          background: currentPost.ctaUrl === choice.url
                                            ? "rgba(76,195,255,0.14)"
                                            : "rgba(255,255,255,0.06)",
                                          color: "rgba(255,255,255,0.86)",
                                          borderRadius: 999,
                                          padding: "5px 9px",
                                          fontSize: 11,
                                          fontWeight: 800,
                                          cursor: "pointer",
                                        }}
                                      >
                                        {choice.label}
                                      </button>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                              <div>
                                <div
                                  style={{
                                    fontSize: 12,
                                    opacity: 0.85,
                                    marginBottom: 6,
                                  }}
                                >
                                  Libellé du lien
                                </div>
                                <input
                                  value={currentPost.cta}
                                  onChange={(e) =>
                                    updatePost(updateTarget, {
                                      cta: e.target.value,
                                    })
                                  }
                                  style={lightFieldStyle}
                                  placeholder={`Libellé du lien (ex : ${getChannelDefaultCtaLabel(activeCard, "website") || "Demander un devis"})`}
                                />
                              </div>
                            </>
                          ) : null}
                          {ctaMode === "call" ? (
                            <div>
                              <div
                                style={{
                                  fontSize: 12,
                                  opacity: 0.85,
                                  marginBottom: 6,
                                }}
                              >
                                Téléphone
                              </div>
                              <input
                                value={currentPost.ctaPhone || ""}
                                onChange={(e) =>
                                  updatePost(updateTarget, {
                                    ctaPhone: e.target.value,
                                  })
                                }
                                style={lightFieldStyle}
                                placeholder={
                                  ctaDefaults?.phone
                                    ? "Téléphone prérempli depuis Mon profil"
                                    : "Téléphone (optionnel)"
                                }
                              />
                            </div>
                          ) : null}
                          {ctaMode === "custom" ? (
                            <div>
                              <div
                                style={{
                                  fontSize: 12,
                                  opacity: 0.85,
                                  marginBottom: 6,
                                }}
                              >
                                Libellé du CTA
                              </div>
                              <input
                                value={currentPost.cta}
                                onChange={(e) =>
                                  updatePost(updateTarget, {
                                    cta: e.target.value,
                                  })
                                }
                                style={lightFieldStyle}
                                placeholder={
                                  activeCard === "gmb"
                                    ? "Ex : En savoir plus"
                                    : "Ex : Contactez-nous"
                                }
                              />
                            </div>
                          ) : null}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            marginTop: 6,
                            color: "rgba(255,255,255,0.62)",
                            lineHeight: 1.45,
                          }}
                        >
                          {getCtaModeHelp(activeCard, ctaMode)}
                        </div>
                        {ctaMode === "website" && activeWebsiteUrl ? (
                          <div
                            style={{
                              fontSize: 11,
                              marginTop: 8,
                              color: "rgba(255,255,255,0.62)",
                              lineHeight: 1.45,
                            }}
                          >
                            Valeur par défaut disponible depuis{" "}
                            {activeWebsiteSourceLabel.toLowerCase()} : {activeWebsiteUrl}
                          </div>
                        ) : ctaMode === "website" && websiteChoices.length > 1 ? (
                          <div
                            style={{
                              fontSize: 11,
                              marginTop: 8,
                              color: "rgba(255,255,255,0.62)",
                              lineHeight: 1.45,
                            }}
                          >
                            Deux sites sont connectés : choisissez le lien à utiliser avec les boutons ci-dessus.
                          </div>
                        ) : null}
                        {ctaMode === "call" && ctaDefaults?.phone ? (
                          <div
                            style={{
                              fontSize: 11,
                              marginTop: 8,
                              color: "rgba(255,255,255,0.62)",
                              lineHeight: 1.45,
                            }}
                          >
                            Valeur par défaut disponible depuis Mon profil :{" "}
                            {ctaDefaults.phone}
                          </div>
                        ) : null}
                        {ctaMode === "website" || ctaMode === "custom"
                          ? renderLimitCounter(
                              "CTA",
                              currentPost.cta.length,
                              CHANNEL_TEXT_GUIDELINES[activeCard].cta,
                            )
                          : null}
                      </>
                    );
                  })()}
                </div>
                {activeCard === "instagram" ? (
                  <div>
                    <div
                      style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}
                    >
                      Hashtags
                    </div>
                    <input
                      value={instagramHashtagsInput}
                      onChange={(e) =>
                        setInstagramHashtagsInput(e.target.value)
                      }
                      onBlur={() =>
                        updatePost("instagram", {
                          hashtags: getLiveInstagramHashtags(),
                        })
                      }
                      style={inputStyle}
                      placeholder="#local #metier"
                    />
                    {renderLimitCounter(
                      "Hashtags",
                      getLiveInstagramHashtags().length,
                      CHANNEL_TEXT_GUIDELINES.instagram.hashtags || 20,
                    )}
                  </div>
                ) : null}
                {CHANNEL_TEXT_GUIDELINES[activeCard].totalLabel &&
                CHANNEL_TEXT_GUIDELINES[activeCard].totalMax &&
                CHANNEL_TEXT_GUIDELINES[activeCard].totalValue ? (
                  <div style={{ marginTop: 2 }}>
                    {renderLimitCounter(
                      CHANNEL_TEXT_GUIDELINES[activeCard].totalLabel!,
                      CHANNEL_TEXT_GUIDELINES[activeCard].totalValue!(
                        activeCard === "instagram"
                          ? {
                              ...getDisplayPost(activeCard),
                              hashtags: getLiveInstagramHashtags(),
                            }
                          : getDisplayPost(activeCard),
                      ),
                      CHANNEL_TEXT_GUIDELINES[activeCard].totalMax!,
                    )}
                  </div>
                ) : null}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                marginTop: 12,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color:
                    duplicateFeedback?.kind === "error"
                      ? "#ffb4b4"
                      : "rgba(255,255,255,0.72)",
                }}
              >
                {duplicateFeedback?.message ||
                  "Dupliquez le titre et le contenu du canal ouvert vers les autres canaux affichés."}
              </div>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={onDuplicateContentToAllChannels}
                disabled={displayCards.length < 2}
                style={{ marginLeft: "auto" }}
              >
                Dupliquer ce contenu sur tous les canaux
              </button>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, opacity: 0.75 }}>
            Sélectionnez d’abord vos canaux.
          </div>
        )}
      </div>

      <div
        className={styles.blockCard}
        style={{ minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}
      >
        <div className={styles.blockTitle} style={{ marginBottom: 8 }}>
          Images de la publication
        </div>
        <div
          className={styles.subtitle}
          style={{ marginBottom: 12, maxWidth: "none", whiteSpace: "normal" }}
        >
          Ajoutez vos images, puis gérez directement leur rendu par canal. Les
          images sont cochées par défaut sur tous les canaux, sauf Google
          Business limité à une photo.
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            onImagesChange(e.target.files);
            e.currentTarget.value = "";
          }}
        />
        <input
          ref={gmbFileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            onImagesChange(e.target.files, "gmb");
            e.currentTarget.value = "";
          }}
        />
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={onPickImagesClick}
          >
            + Ajouter des images
          </button>
          {images.length ? (
            <div style={{ fontSize: 12, opacity: 0.85 }}>
              {images.length} image(s) ajoutée(s)
            </div>
          ) : (
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Aucune image ajoutée
            </div>
          )}
        </div>
        {imgError ? (
          <div style={{ marginBottom: 10, fontSize: 13, color: "#ffb4b4" }}>
            {imgError}
          </div>
        ) : null}
        {!selectedChannels.length ? (
          <div style={{ fontSize: 13, opacity: 0.75 }}>
            Sélectionnez d’abord vos canaux.
          </div>
        ) : !images.length ? (
          <div style={{ fontSize: 13, opacity: 0.75 }}>
            Ajoutez une ou plusieurs images. Elles apparaîtront directement dans
            les onglets des canaux.
          </div>
        ) : (
          <>
            {activeImageChannel === "gmb" ? (
              <div
                style={{
                  marginBottom: 12,
                  borderRadius: 14,
                  padding: "12px 14px",
                  border: "1px solid rgba(251,191,36,0.26)",
                  background: "rgba(251,191,36,0.10)",
                  display: "grid",
                  gap: 10,
                }}
              >
                <div
                  style={{ fontSize: 13, lineHeight: 1.5, color: "#fde68a" }}
                >
                  <strong>
                    Google Business : 1 seule photo par publication.
                  </strong>{" "}
                  Les autres images restent disponibles sur les autres canaux.
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() => gmbFileInputRef.current?.click()}
                  >
                    + Ajouter une image spécifique Google Business
                  </button>
                </div>
              </div>
            ) : null}
            <ChannelImageAdapterCardsPanel
              tabs={imageAdapterTabs}
              activeChannel={activeImageChannel}
              onActiveChannelChange={(key) =>
                setSynchronizedActiveChannel(key as ChannelKey)
              }
              channelTitle={getImageAdapterLabel(activeImageChannel)}
              formatLabel={
                activeImageChannel === "inrcy_site" ||
                activeImageChannel === "site_web"
                  ? "Rendu site / iframe"
                  : `Format final : ${CHANNEL_PRESETS[activeImageChannel].width}×${CHANNEL_PRESETS[activeImageChannel].height}`
              }
              aspectRatio={previewAspectRatio}
              items={imageKeys.map((key, index) => {
                const selectedKeysForActiveChannel =
                  channelImageEditors[activeImageChannel]?.imageKeys || [];
                const included = selectedKeysForActiveChannel.includes(key);
                const usedChannelCount = selectedChannels.filter((channel) =>
                  (channelImageEditors[channel]?.imageKeys || []).includes(key),
                ).length;
                const disabledByGoogleBusinessLimit =
                  activeImageChannel === "gmb" &&
                  selectedKeysForActiveChannel.length >= 1 &&
                  !included;
                const transform =
                  channelImageEditors[activeImageChannel]?.transforms?.[key] ||
                  getOptimizedTransform(
                    activeImageChannel,
                    imageMetaByKey[key],
                  );
                const bgMode = getBackgroundMode(transform);
                return {
                  key,
                  previewUrl: previewByKey[key],
                  included,
                  disabled: disabledByGoogleBusinessLimit,
                  title: `Image ${index + 1}`,
                  subtitle: disabledByGoogleBusinessLimit
                    ? "Une seule photo par publication Google Business"
                    : included
                      ? `Publiée sur ce canal · utilisée sur ${usedChannelCount} canal${usedChannelCount > 1 ? "aux" : ""}`
                      : `Retirée de ce canal · utilisée sur ${usedChannelCount} canal${usedChannelCount > 1 ? "aux" : ""}`,
                  fitLabel: transform.fit === "cover" ? "Remplir" : "Adapter",
                  backgroundMode: bgMode,
                  backgroundColor: transform.backgroundColor,
                  transform,
                  preset: CHANNEL_PRESETS[activeImageChannel],
                  imageMeta: imageMetaByKey[key],
                  onToggle: () => toggleChannelImage(activeImageChannel, key),
                  onAdapt: () => openImageEditor(activeImageChannel, key),
                  onReset: () => resetChannelImage(activeImageChannel, key),
                  onRemove: included
                    ? () => toggleChannelImage(activeImageChannel, key)
                    : undefined,
                  onRemoveEverywhere: () => removeImage(index),
                  onMovePrevious:
                    included && selectedKeysForActiveChannel.indexOf(key) > 0
                      ? () => moveChannelImage(activeImageChannel, key, -1)
                      : undefined,
                  onMoveNext:
                    included &&
                    selectedKeysForActiveChannel.indexOf(key) >= 0 &&
                    selectedKeysForActiveChannel.indexOf(key) <
                      selectedKeysForActiveChannel.length - 1
                      ? () => moveChannelImage(activeImageChannel, key, 1)
                      : undefined,
                };
              })}
              buttonClassName={styles.secondaryBtn}
              pillButtonStyle={pillBtn}
              pillButtonActiveStyle={pillBtnActive}
            />
          </>
        )}
      </div>

      {activePublicationPreview ? (
        <div
          className={styles.blockCard}
          style={{
            minWidth: 0,
            maxWidth: "100%",
            boxSizing: "border-box",
            display: "grid",
            gap: showPublicationPreview ? 12 : 0,
          }}
        >
          <div
            style={{
              display: isMobile ? "grid" : "flex",
              gridTemplateColumns: isMobile ? "1fr" : undefined,
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: isMobile ? undefined : "wrap",
            }}
          >
            <div style={{ minWidth: 0, width: isMobile ? "100%" : undefined }}>
              <div className={styles.blockTitle} style={{ marginBottom: 4 }}>
                Aperçu
              </div>
              <div
                className={styles.subtitle}
                style={{
                  display: isMobile ? "grid" : "flex",
                  gridTemplateColumns: isMobile
                    ? "repeat(2, minmax(0, 1fr))"
                    : undefined,
                  gap: 6,
                  flexWrap: isMobile ? undefined : "wrap",
                  overflowX: "hidden",
                  width: "100%",
                  maxWidth: "100%",
                  paddingBottom: 2,
                  marginBottom: 0,
                }}
              >
                {imageAdapterTabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setSynchronizedActiveChannel(tab.key as ChannelKey)}
                    style={{
                      ...pillBtn,
                      ...(activeImageChannel === tab.key ? pillBtnActive : {}),
                      padding: "6px 10px",
                      fontSize: 11,
                      whiteSpace: "nowrap",
                      flex: isMobile ? undefined : "0 0 auto",
                      width: isMobile ? "100%" : undefined,
                      minWidth: 0,
                      minHeight: isMobile ? 32 : undefined,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => setShowPublicationPreview((visible) => !visible)}
              aria-expanded={showPublicationPreview}
              style={isMobile ? { width: "100%", justifyContent: "center" } : undefined}
            >
              {showPublicationPreview ? "Masquer" : "Afficher"}
            </button>
          </div>
          {showPublicationPreview ? (
            <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
              <ChannelPublicationPreview preview={activePublicationPreview} />
            </div>
          ) : null}
        </div>
      ) : null}

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

      <div
        ref={publishAreaRef}
        style={{
          display: "grid",
          gap: 8,
          justifyItems: "end",
          scrollMarginBottom: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <HelpButton
            onClick={() => setPublishHelpOpen(true)}
            title="Aide publication et iNr'Send"
            size={32}
          />
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={onPublish}
            disabled={saving}
            style={{
              minHeight: 52,
              padding: "0 24px",
              fontSize: 16,
              fontWeight: 800,
              opacity: saving ? 0.64 : 1,
              cursor: saving ? "wait" : "pointer",
            }}
          >
            {saving
              ? `Publication en cours ${publishProgress}%`
              : "Vérifier et publier"}
          </button>
        </div>
        <div
          style={{
            width: "min(440px, 100%)",
            minHeight: saving || publishError ? 58 : 0,
            display: "grid",
            gap: 8,
            justifyItems: "stretch",
          }}
        >
          {saving ? (
            <div
              style={{
                justifySelf: "end",
                width: "100%",
                maxWidth: 440,
                borderRadius: 14,
                padding: "10px 12px",
                border: "1px solid rgba(76,195,255,0.22)",
                background: "rgba(76,195,255,0.08)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  fontSize: 12,
                  color: "rgba(255,255,255,0.86)",
                }}
              >
                <span>{publishProgressLabel || "Publication en cours..."}</span>
                <strong>{publishProgress}%</strong>
              </div>
              <div
                style={{
                  marginTop: 8,
                  height: 8,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.10)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${publishProgress}%`,
                    borderRadius: 999,
                    background:
                      "linear-gradient(90deg, rgba(76,195,255,0.92), rgba(99,102,241,0.95))",
                    transition: "width 180ms ease",
                  }}
                />
              </div>
            </div>
          ) : null}
          {publishError ? (
            <StatusMessage
              variant="error"
              style={{
                marginTop: 0,
                textAlign: "right",
                maxWidth: 440,
                justifySelf: "end",
              }}
            >
              {publishError}
            </StatusMessage>
          ) : null}
        </div>
      </div>
    </div>
  );
}
