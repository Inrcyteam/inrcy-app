import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { resolveActiveBrowserUserId } from "@/lib/browserAccountCache";
import { createClient } from "@/lib/supabaseClient";
import { prewarmBoosterGenerationContextClient } from "@/lib/boosterGenerationContextClient";
import { buildBoosterGenerationRequest } from "@/lib/boosterGenerationTransportClient";
import {
  getBoosterGenerationSpecialErrorMessage,
  isAutomaticBoosterGenerationRetryEligible,
} from "@/lib/boosterGenerationErrorPolicy";
import { getClientUserFacingErrorMessage as getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import {
  DEFAULT_AI_PREFERRED_ENGINE,
  getAiEngineOption,
  getAutomaticAiRetryEngine,
  normalizeAiPreferredEngine,
  type AiPreferredEngine,
} from "@/lib/aiEnginePreference";
import {
  readPinterestBoardUiCache,
  writePinterestBoardUiCache,
} from "@/lib/pinterestUiSessionCache";
import {
  buildVideoTransformSignature,
  getVideoPublicationProfileForChannel,
} from "@/lib/boosterVideoTransforms";
import { extractVideoAudioForTranscription } from "@/lib/boosterVideoAudioClient";
import { readSanitizedElementHtml } from "@/lib/sanitizeHtml";
import {
  normalizeVideoAiContextReference,
  videoAiContextReferenceAliases,
  type VideoAiContextReference,
} from "@/lib/videoAiContextReference";
import { confirmInrcy } from "@/lib/inrcyDialog";
import { INR_SEARCH_CONTENT_MAX_LENGTH } from "@/lib/boosterChannelRules";
import {
  buildCtaTextForChannel,
  sanitizeBoosterPostForStructuredCta,
} from "@/lib/boosterCta";
import {
  editableHtmlToSiteText,
  stripSiteTextFormatting,
  stripSiteTextFormattingPreserveLayout,
} from "@/lib/boosterFormatting";
import stylesDash from "../../dashboard.module.css";
import { ChannelImageAdapterModal } from "@/app/dashboard/_components/ChannelImageAdapterTool";
import {
  BOOSTER_MAX_IMAGE_COUNT,
  BOOSTER_MAX_VIDEO_BYTES,
  BOOSTER_MAX_VIDEO_MB_LABEL,
  BOOSTER_MAX_VIDEO_PUBLISH_BYTES,
  BOOSTER_VIDEO_FORMATS_LABEL,
  CHANNEL_LABELS,
  CHANNEL_PRESETS,
  buildAutoPrefillPatch,
  buildPreferredCtaPatch,
  buildBoosterVideoGenerationContext,
  buildVideoSettingsByChannel,
  channelSupportsImages,
  channelSupportsTextOnly,
  clampPercent,
  getChannelDefaultCtaLabel,
  getChannelPublicationRequirements,
  getAutomaticVideoSettingsForPublication,
  getDefaultCtaModeForChannel,
  normalizeBoosterPreferredCta,
  getPublicationMediaLabel,
  getWebsiteUrlForChannel,
  getImageFitLabel,
  getChannelSafetyBackgroundMode,
  getOptimizedTransform,
  getVideoFormatLabel,
  VIDEO_ADAPTATION_MODE_LABELS,
  VIDEO_FORMAT_ASPECT_RATIOS,
  extractVideoFramesForAI,
  fileToBoosterAiImagePayload,
  makeImageKey,
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
  type BoosterAiImagePayload,
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
import {
  AI_CONFIGURATION_STORAGE_KEY,
  CHANNEL_KEYS,
  EMPTY_CHANNEL_DETAILS,
  buildVideoFileName,
  isChannelKey,
  isStyleKey,
  isThemeKey,
  makeVideoTranscriptCacheKey,
  normalizeExternalHref,
  sanitizePatchForEditor,
  sanitizePostForEditor,
  sanitizePostsForEditor,
  simplifyChannelDetail,
  truncateText,
  type ChannelConnectionDetail,
  type PendingImmediatePublishAfterSchedule,
  type PinterestBoardOption,
  type VideoAudioFilePreparationCache,
  type VideoAudioTranscriptCache,
  type VideoFramesForAI,
  type VideoFramesPreparationCache,
} from "./publishModal.foundations";
import {
  preloadPreparedImagePreview,
  readVideoSourceMetadata,
  transcribeVideoAudioForAI,
} from "./publishModal.videoAiRuntime";
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
import usePersistentMediaWorkspace from "./usePersistentMediaWorkspace";
import { isUnifiedMediaConsumptionClientEnabled } from "@/lib/mediaPipelineUnifiedConsumptionPolicy";
import { isLegacyMediaTransportCutoverClientEnabled } from "@/lib/mediaPipelineLegacyCutoverPolicy";
import { canPublishVideoSourceDirectly } from "@/lib/mediaVideoSourceCompatibility";
import {
  YOUTUBE_SHORT_MAX_DURATION_SECONDS,
  normalizeYoutubeLongUploadsStatus,
  type YoutubeLongUploadsStatus,
} from "@/lib/videoPublicationPolicy";
import {
  canContinueWithIsolatedVideoPreparationFailures,
  isVideoPreparationReady,
  shouldRetryVideoVariantGeneration,
} from "@/lib/boosterVideoPreparationRecovery";
import {
  loadMediaPublicationWorkspace,
  prepareMediaPublicationWorkspace,
  type MediaWorkspaceMediaSummary,
} from "@/lib/mediaWorkspaceClient";
import usePublishVideoController, {
  normalizeRestoredVideoVariants,
  type VideoVariantPreparationState,
} from "./usePublishVideoController";

import InrcyCameraCaptureModal from "@/app/dashboard/_components/InrcyCameraCaptureModal";
import MediaLibraryPickerModal, {
  type MediaLibraryPickerItem,
} from "@/app/dashboard/_components/MediaLibraryPickerModal";

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
  const [publicationInstruction, setPublicationInstruction] = useState("");
  const [theme, setTheme] = useState<ThemeKey>("");
  const [contentStyle, setContentStyle] = useState<StyleKey>("equilibre");
  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStage, setGenerationStage] = useState("");
  const generationTimersRef = useRef<number[]>([]);
  const generationPulseTimerRef = useRef<number | null>(null);
  // Une préparation vidéo lancée pendant la génération est réutilisée par
  // Publier/Programmer. La clé évite d'attendre ou de relancer un préchauffage
  // qui correspondrait à une ancienne vidéo ou à d'autres réglages.
  const videoPrewarmTaskRef = useRef<{
    key: string;
    promise: Promise<unknown>;
  } | null>(null);
  const videoAudioTranscriptCacheRef = useRef<VideoAudioTranscriptCache | null>(
    null,
  );
  const videoFramesForAiCacheRef = useRef<VideoFramesPreparationCache | null>(
    null,
  );
  const videoAudioFileForAiCacheRef =
    useRef<VideoAudioFilePreparationCache | null>(null);
  const aiImagePayloadCacheRef = useRef<
    Map<string, Promise<BoosterAiImagePayload>>
  >(new Map());

  const getOrPrepareVideoFramesForAI = useCallback((file: File) => {
    const key = makeVideoTranscriptCacheKey(file);
    const cached = videoFramesForAiCacheRef.current;
    if (cached?.key === key) return cached.promise;

    const preparationPromise = extractVideoFramesForAI(file).catch((error) => {
      if (videoFramesForAiCacheRef.current?.promise === preparationPromise) {
        videoFramesForAiCacheRef.current = null;
      }
      throw error;
    });

    videoFramesForAiCacheRef.current = {
      key,
      promise: preparationPromise,
    };
    return preparationPromise;
  }, []);

  const getOrPrepareVideoAudioFileForAI = useCallback((file: File) => {
    const key = makeVideoTranscriptCacheKey(file);
    const cached = videoAudioFileForAiCacheRef.current;
    if (cached?.key === key) return cached.promise;

    // L'extraction reste locale et ne consomme aucun crédit IA. Un échec est
    // mémorisé comme indisponible pour éviter de refaire 30 secondes de travail
    // au clic ; les petites vidéos conservent ensuite le fallback historique.
    const preparationPromise = extractVideoAudioForTranscription(file).catch(
      () => null,
    );
    videoAudioFileForAiCacheRef.current = {
      key,
      promise: preparationPromise,
    };
    return preparationPromise;
  }, []);
  const [genError, setGenError] = useState("");
  const [generationNotice, setGenerationNotice] = useState("");
  const [publishError, setPublishError] = useState("");
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftMessage, setDraftMessage] = useState("");
  const [lastPublicationDraftSnapshot, setLastPublicationDraftSnapshot] =
    useState<string | null>(null);
  const [videoAiContextRef, setVideoAiContextRef] =
    useState<VideoAiContextReference | null>(null);

  useEffect(() => {
    onDraftHeaderStateChange?.({ saving, draftSaving, draftMessage });
  }, [saving, draftSaving, draftMessage, onDraftHeaderStateChange]);
  const [publishProgress, setPublishProgress] = useState(0);
  const [publishProgressLabel, setPublishProgressLabel] = useState("");
  const [postsByChannel, setPostsByChannel] = useState<
    Partial<Record<ChannelKey, ChannelPost>>
  >({});
  const [contentWorkspaceOpen, setContentWorkspaceOpen] = useState(false);
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
  const [defaultAiPreferredEngine, setDefaultAiPreferredEngine] =
    useState<AiPreferredEngine>(DEFAULT_AI_PREFERRED_ENGINE);
  const [selectedAiPreferredEngine, setSelectedAiPreferredEngine] =
    useState<AiPreferredEngine>(DEFAULT_AI_PREFERRED_ENGINE);
  const [instagramHashtagsInput, setInstagramHashtagsInput] = useState("");
  const [emptyContentWarningChannels, setEmptyContentWarningChannels] =
    useState<ChannelKey[]>([]);
  const [emptyContentWarningIndex, setEmptyContentWarningIndex] = useState(0);
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

  const applyDefaultAiPreferredEngine = useCallback((value: unknown) => {
    const next = normalizeAiPreferredEngine(value);
    setDefaultAiPreferredEngine((previousDefault) => {
      setSelectedAiPreferredEngine((current) =>
        current === previousDefault ? next : current,
      );
      return next;
    });
  }, []);
  const [pendingPublishPosts, setPendingPublishPosts] = useState<Partial<
    Record<ChannelKey, ChannelPost>
  > | null>(null);
  const initialPinterestBoardCache = useMemo(
    () => readPinterestBoardUiCache(),
    [],
  );
  const [pinterestBoards, setPinterestBoards] = useState<
    PinterestBoardOption[]
  >(() => initialPinterestBoardCache?.boards || []);
  const [pinterestBoardId, setPinterestBoardId] = useState(
    () => initialPinterestBoardCache?.defaultBoardId || "",
  );
  const [pinterestBoardName, setPinterestBoardName] = useState(() => {
    const defaultId = initialPinterestBoardCache?.defaultBoardId || "";
    return (
      initialPinterestBoardCache?.boards.find((board) => board.id === defaultId)
        ?.name || ""
    );
  });
  const [pinterestBoardsLoading, setPinterestBoardsLoading] = useState(false);
  const [pinterestBoardsError, setPinterestBoardsError] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
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
  const imagesRef = useRef<File[]>([]);
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

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  const getOrPrepareAiImagePayload = useCallback((file: File) => {
    const key = makeImageKey(file);
    const cached = aiImagePayloadCacheRef.current.get(key);
    if (cached) return cached;

    const preparationPromise = fileToBoosterAiImagePayload(file).catch(
      (error) => {
        if (aiImagePayloadCacheRef.current.get(key) === preparationPromise) {
          aiImagePayloadCacheRef.current.delete(key);
        }
        throw error;
      },
    );
    aiImagePayloadCacheRef.current.set(key, preparationPromise);
    return preparationPromise;
  }, []);

  useEffect(() => {
    const activeKeys = new Set(images.map((file) => makeImageKey(file)));
    for (const key of aiImagePayloadCacheRef.current.keys()) {
      if (!activeKeys.has(key)) aiImagePayloadCacheRef.current.delete(key);
    }

    if (!useImagesForAI) return;
    images.forEach((file) => {
      void getOrPrepareAiImagePayload(file).catch(() => {
        // La génération réessaiera avec le même fallback qu'avant si le
        // préchauffage local échoue sur un navigateur ou un format donné.
      });
    });
  }, [getOrPrepareAiImagePayload, images, useImagesForAI]);

  useEffect(() => {
    return () => {
      aiImagePayloadCacheRef.current.clear();
    };
  }, []);

  const [showPublicationPreview, setShowPublicationPreview] = useState(false);
  const previewStageRef = useRef<HTMLDivElement | null>(null);
  const publishAreaRef = useRef<HTMLDivElement | null>(null);
  const contentTextAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const siteContentEditorRef = useRef<HTMLDivElement | null>(null);
  const contentWorkspaceRef = useRef<HTMLDivElement | null>(null);
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
    inr_search: !!initialConnectedChannels?.inr_search,
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
  const lastInitialConnectedChannelsRef = useRef<Record<ChannelKey, boolean> | null>(
    null,
  );
  const manuallyControlledChannelsRef = useRef<Set<ChannelKey>>(new Set());
  const draftChannelsRestoredRef = useRef(false);
  const [ctaDefaults, setCtaDefaults] = useState<BoosterCtaDefaults | null>(
    null,
  );
  const preferredCtaDefaultsAppliedRef = useRef(false);

  const applyConnectedChannels = useCallback(
    (nextConnected: Record<ChannelKey, boolean>) => {
      setConnected(nextConnected);
      setChannels((previousSelection) =>
        CHANNEL_KEYS.reduce(
          (nextSelection, key) => {
            if (!nextConnected[key]) {
              nextSelection[key] = false;
            } else if (
              !draftChannelsRestoredRef.current &&
              !manuallyControlledChannelsRef.current.has(key)
            ) {
              // À l'ouverture, tout canal connecté est sélectionné par défaut.
              // Une action explicite du pro ou un brouillon restauré reste prioritaire.
              nextSelection[key] = true;
            } else {
              nextSelection[key] = Boolean(previousSelection[key]);
            }
            return nextSelection;
          },
          {} as Record<ChannelKey, boolean>,
        ),
      );
    },
    [],
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
    void prewarmBoosterGenerationContextClient();
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
          const nextConnected = CHANNEL_KEYS.reduce(
            (result, key) => {
              result[key] = Boolean(json.channels[key]);
              return result;
            },
            {} as Record<ChannelKey, boolean>,
          );
          applyConnectedChannels(nextConnected);
          if (json?.channelDetails) {
            setChannelDetails((prev) => ({ ...prev, ...json.channelDetails }));
          }
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      alive = false;
    };
  }, [applyConnectedChannels]);

  useEffect(() => {
    if (!initialConnectedChannels) return;
    const nextConnected = getInitialConnectedChannels();
    const previousConnected = lastInitialConnectedChannelsRef.current;
    lastInitialConnectedChannelsRef.current = nextConnected;

    // Les valeurs initiales sont déjà utilisées par les state initializers.
    // On ne resynchronise ensuite que les clés qui changent réellement, afin
    // de ne pas écraser une réponse plus fraîche de /connected-channels.
    if (!previousConnected) return;
    const changedKeys = CHANNEL_KEYS.filter(
      (key) => nextConnected[key] !== previousConnected[key],
    );
    if (!changedKeys.length) return;

    setConnected((current) => {
      const next = { ...current };
      changedKeys.forEach((key) => {
        next[key] = nextConnected[key];
      });
      return next;
    });
    setChannels((previousSelection) => {
      const nextSelection = { ...previousSelection };
      changedKeys.forEach((key) => {
        if (!nextConnected[key]) {
          nextSelection[key] = false;
        } else if (
          !draftChannelsRestoredRef.current &&
          !manuallyControlledChannelsRef.current.has(key)
        ) {
          nextSelection[key] = true;
        }
      });
      return nextSelection;
    });
  }, [initialConnectedChannels]);

  const loadPinterestBoardsForPublish = useCallback(async () => {
    if (!connected.pinterest) {
      setPinterestBoards([]);
      setPinterestBoardsError("");
      return;
    }

    setPinterestBoardsLoading(true);
    setPinterestBoardsError("");
    try {
      const response = await fetch("/api/integrations/pinterest/boards", {
        cache: "no-store" as any,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        throw new Error(
          String(
            result?.error || "Impossible de charger les tableaux Pinterest.",
          ),
        );
      }

      const rawBoards: unknown[] = Array.isArray(result.boards)
        ? result.boards
        : [];
      const boards: PinterestBoardOption[] = rawBoards
        .map((value: unknown): PinterestBoardOption | null => {
          if (!value || typeof value !== "object" || Array.isArray(value))
            return null;
          const record = value as Record<string, unknown>;
          const id = String(record.id || "").trim();
          if (!id) return null;
          return {
            id,
            name:
              String(record.name || "Tableau Pinterest").trim() ||
              "Tableau Pinterest",
          };
        })
        .filter(
          (value: PinterestBoardOption | null): value is PinterestBoardOption =>
            Boolean(value),
        );

      setPinterestBoards(boards);
      writePinterestBoardUiCache(boards, result.defaultBoardId);
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
        getSimpleFrenchErrorMessage(
          error,
          "Impossible de charger les tableaux Pinterest.",
        ),
      );
    } finally {
      setPinterestBoardsLoading(false);
    }
  }, [connected.pinterest]);

  useEffect(() => {
    if (!connected.pinterest || !channels.pinterest) return;
    void loadPinterestBoardsForPublish();
  }, [connected.pinterest, channels.pinterest, loadPinterestBoardsForPublish]);

  const onPinterestBoardChange = useCallback(
    (boardId: string) => {
      const cleanId = String(boardId || "").trim();
      const selectedBoard = pinterestBoards.find(
        (board) => board.id === cleanId,
      );
      setPinterestBoardId(cleanId);
      setPinterestBoardName(selectedBoard?.name || "");
      setPinterestBoardsError("");
    },
    [pinterestBoards],
  );

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
      void prewarmBoosterGenerationContextClient();
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
        const merged = sanitizePostForEditor(
          key,
          sanitizeBoosterPostForStructuredCta(
            hasMeaningfulPatch ? { ...current, ...patch } : current,
            {
              websiteUrl: getWebsiteUrlForChannel(key, ctaDefaults),
              phone: ctaDefaults.phone,
            },
          ),
        );
        const before = JSON.stringify(current);
        const after = JSON.stringify(merged);
        if (before === after) continue;
        next[key] = merged;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [ctaDefaults]);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const applyIfActive = (value: unknown) => {
      if (!cancelled) applyDefaultAiPreferredEngine(value);
    };

    try {
      const local = JSON.parse(
        window.localStorage.getItem(AI_CONFIGURATION_STORAGE_KEY) || "{}",
      ) as { preferredEngine?: unknown };
      applyIfActive(local.preferredEngine || DEFAULT_AI_PREFERRED_ENGINE);
    } catch {
      applyIfActive(DEFAULT_AI_PREFERRED_ENGINE);
    }

    const loadPersistedEngine = async () => {
      try {
        const supabase = createClient();
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData?.user?.id;
        if (!userId) return;
        const { data } = await supabase
          .from("business_profiles")
          .select("ai_preferred_engine")
          .eq("user_id", resolveActiveBrowserUserId(userId))
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data?.ai_preferred_engine) {
          applyIfActive(data.ai_preferred_engine);
        }
      } catch {
        // La génération reste utilisable avec la valeur locale ou le défaut.
      }
    };

    const onAiConfigurationUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ aiPreferredEngine?: unknown }>)
        .detail;
      if (detail?.aiPreferredEngine) {
        applyIfActive(detail.aiPreferredEngine);
      }
    };

    loadPersistedEngine();
    window.addEventListener(
      "inrcy:ai-configuration-updated",
      onAiConfigurationUpdated,
    );

    return () => {
      cancelled = true;
      window.removeEventListener(
        "inrcy:ai-configuration-updated",
        onAiConfigurationUpdated,
      );
    };
  }, [applyDefaultAiPreferredEngine]);

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
    return CHANNEL_KEYS.filter((key) => channels[key] && connected[key]);
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
    () => CHANNEL_KEYS.filter((key) => channels[key] && connected[key]),
    [channels, connected],
  );

  const handlePreparedWorkspaceMedia = useCallback(
    (preparedMedia: readonly MediaWorkspaceMediaSummary[]) => {
      const preparedImages = preparedMedia.filter(
        (item) =>
          item.mediaType === "image" &&
          item.processingStatus === "ready" &&
          Boolean(item.previewUrl),
      );
      if (!preparedImages.length) return;

      for (const item of preparedImages) {
        if (item.position < 0 || item.position >= images.length) continue;
        const previewUrl = String(item.previewUrl || "");
        const expectedImageKey = makeImageKey(images[item.position]);
        if (!previewUrl) continue;

        void preloadPreparedImagePreview(previewUrl).then((loaded) => {
          const currentFile = imagesRef.current[item.position];
          if (
            !loaded ||
            !currentFile ||
            makeImageKey(currentFile) !== expectedImageKey
          ) {
            return;
          }
          setImagePreviews((current) => {
            const previous = current[item.position];
            // Un aperçu blob local décodable reste le plus rapide et le plus
            // fiable pendant la session. Le serveur remplace uniquement les
            // placeholders des formats que le navigateur ne sait pas lire.
            if (previous?.startsWith("blob:") || previous === previewUrl) {
              return current;
            }
            const next = current.slice();
            next[item.position] = previewUrl;
            return next;
          });
        });
      }
      setImageMetaByKey((current) => {
        const next = { ...current };
        for (const item of preparedImages) {
          const file = images[item.position];
          const width = Number(item.width || 0);
          const height = Number(item.height || 0);
          if (!file || width <= 0 || height <= 0) continue;
          next[makeImageKey(file)] = {
            width,
            height,
            ratio: width / height,
          };
        }
        return next;
      });
    },
    [images],
  );

  const {
    enabled: persistentMediaWorkspaceEnabled,
    workspaceId: mediaWorkspaceId,
    clientWorkspaceKey: mediaWorkspaceClientKey,
    adoptWorkspace: adoptMediaWorkspace,
    syncImages: syncPersistentWorkspaceImages,
    syncVideo: syncPersistentWorkspaceVideo,
    prewarmWorkspace: prewarmPersistentMediaWorkspace,
    clearWorkspaceMedia: clearPersistentWorkspaceMedia,
    linkDraft: linkPersistentWorkspaceDraft,
    ensureWorkspace: ensurePersistentMediaWorkspace,
    waitForIdle: waitForPersistentWorkspaceIdle,
    archiveWorkspace: archivePersistentMediaWorkspace,
  } = usePersistentMediaWorkspace({
    draftId: publicationDraftIdParam,
    selectedChannels,
    imageSettingsByChannel: channelImageEditors as Record<string, unknown>,
    onError: setImgError,
    onPreparedMedia: handlePreparedWorkspaceMedia,
  });
  const legacyMediaCutoverClientAvailable =
    persistentMediaWorkspaceEnabled &&
    isUnifiedMediaConsumptionClientEnabled() &&
    isLegacyMediaTransportCutoverClientEnabled();
  const unifiedMediaConsumptionClientAvailable =
    persistentMediaWorkspaceEnabled && isUnifiedMediaConsumptionClientEnabled();
  const unifiedMediaConsumptionEnabled =
    unifiedMediaConsumptionClientAvailable && Boolean(mediaWorkspaceId);
  const mediaPipelineCutoverEnabled = legacyMediaCutoverClientAvailable;

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

  const [tiktokMaxVideoDurationSeconds, setTiktokMaxVideoDurationSeconds] =
    useState<number | null>(null);
  const [tiktokDurationLimitVerified, setTiktokDurationLimitVerified] =
    useState(false);
  const [youtubeLongUploadsStatus, setYoutubeLongUploadsStatus] =
    useState<YoutubeLongUploadsStatus>("unknown");

  useEffect(() => {
    if (!connected.tiktok) {
      setTiktokMaxVideoDurationSeconds(null);
      setTiktokDurationLimitVerified(false);
      return;
    }
    let active = true;
    setTiktokDurationLimitVerified(false);
    fetch("/api/integrations/tiktok/creator-info", {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json?.ok) {
          throw new Error(String(json?.error || "Limite TikTok indisponible."));
        }
        return json;
      })
      .then((json) => {
        if (!active) return;
        const value = Number(json?.creatorInfo?.maxVideoDurationSeconds || 0);
        setTiktokMaxVideoDurationSeconds(
          Number.isFinite(value) && value > 0 ? value : null,
        );
        setTiktokDurationLimitVerified(Number.isFinite(value) && value > 0);
      })
      .catch(() => {
        if (active) {
          setTiktokMaxVideoDurationSeconds(null);
          setTiktokDurationLimitVerified(false);
        }
      });
    return () => {
      active = false;
    };
  }, [connected.tiktok]);

  useEffect(() => {
    if (!connected.youtube_shorts) {
      setYoutubeLongUploadsStatus("unknown");
      return;
    }
    let active = true;
    fetch("/api/integrations/youtube-shorts/creator-info", {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json?.ok) {
          throw new Error(String(json?.error || "Limites YouTube indisponibles."));
        }
        return json;
      })
      .then((json) => {
        if (!active) return;
        setYoutubeLongUploadsStatus(
          normalizeYoutubeLongUploadsStatus(
            json?.creatorInfo?.longUploadsStatus,
          ),
        );
      })
      .catch(() => {
        if (active) setYoutubeLongUploadsStatus("unknown");
      });
    return () => {
      active = false;
    };
  }, [connected.youtube_shorts]);

  useEffect(() => {
    const duration = Number(
      videoDurationSeconds ?? videoSourceMetadata?.duration ?? 0,
    );
    if (
      !videoFile ||
      !channels.youtube_shorts ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > YOUTUBE_SHORT_MAX_DURATION_SECONDS
    ) {
      return;
    }
    setVideoFormatByChannel((current) =>
      current.youtube_shorts === "9_16"
        ? current
        : { ...current, youtube_shorts: "9_16" },
    );
    setVideoAdaptationModeByChannel((current) =>
      current.youtube_shorts === "safe_frame"
        ? current
        : { ...current, youtube_shorts: "safe_frame" },
    );
  }, [
    channels.youtube_shorts,
    setVideoAdaptationModeByChannel,
    setVideoFormatByChannel,
    videoDurationSeconds,
    videoFile,
    videoSourceMetadata?.duration,
  ]);

  const waitForPersistentWorkspaceReadiness = useCallback(
    async (
      purpose: "generate" | "publish" | "schedule",
      onProgress?: (progress: number, label: string) => void,
    ): Promise<string | null> => {
      if (!persistentMediaWorkspaceEnabled) return null;

      const expectedCount =
        publicationMediaType === "video" && videoFile ? 1 : images.length;
      if (!expectedCount) return null;

      const expectedMediaType =
        publicationMediaType === "video" && videoFile ? "video" : "image";
      const mediaLabel = expectedCount > 1 ? "médias" : "média";

      await waitForPersistentWorkspaceIdle((progress, label) => {
        onProgress?.(
          Math.max(6, Math.min(24, Math.round(progress * 0.24))),
          label || `Upload des ${mediaLabel}...`,
        );
      });

      const ensuredWorkspace = mediaWorkspaceId
        ? null
        : await ensurePersistentMediaWorkspace();
      const activeWorkspaceId =
        mediaWorkspaceId || ensuredWorkspace?.workspaceId || "";
      if (!activeWorkspaceId) {
        throw new Error("Impossible de préparer l’espace média.");
      }

      const timeoutMs =
        expectedMediaType === "video"
          ? purpose === "generate"
            ? 360_000
            : 420_000
          : purpose === "generate"
            ? 210_000
            : 240_000;
      const startedAt = Date.now();
      let preparationKick: Promise<void> | null = null;
      let nextPreparationKickAt = 0;
      let lastPreparationError: Error | null = null;
      let retryableFailureSince = 0;
      let lastObservedProcessingProgress = -1;

      while (true) {
        const snapshot = await loadMediaPublicationWorkspace({
          workspaceId: activeWorkspaceId,
          includeUrls: false,
        });
        const relevantMedia = (snapshot.media || [])
          .filter((item) => item.mediaType === expectedMediaType)
          .sort((a, b) => a.position - b.position)
          .slice(0, expectedCount);

        const hasAllExpectedMedia = relevantMedia.length >= expectedCount;
        const uploadFailure = relevantMedia.find(
          (item) =>
            item.uploadStatus === "failed" || item.uploadStatus === "removed",
        );
        if (uploadFailure) {
          throw new Error(
            uploadFailure.processingErrorMessage ||
              "L’envoi du média a échoué. Retirez-le puis ajoutez-le de nouveau.",
          );
        }

        const allUploaded =
          hasAllExpectedMedia &&
          relevantMedia.every((item) => item.uploadStatus === "uploaded");
        const directVideoSource =
          expectedMediaType === "video" &&
          Boolean(videoFile) &&
          canPublishVideoSourceDirectly({
            name: videoFile?.name,
            type: videoFile?.type,
            storagePath: relevantMedia[0]?.storagePath,
            sizeBytes: relevantMedia[0]?.sizeBytes || videoFile?.size,
            maxBytes: BOOSTER_MAX_VIDEO_PUBLISH_BYTES,
          });

        if (allUploaded && directVideoSource) {
          // La source MP4/M4V est déjà stockée et exploitable par les canaux.
          // Publier et programmer ne doivent jamais attendre un second
          // téléchargement puis un réencodage complet dans une fonction Vercel.
          onProgress?.(
            purpose === "generate" ? 32 : 42,
            purpose === "generate"
              ? "Vidéo envoyée · analyse locale rapide"
              : "Vidéo sécurisée · prête à être utilisée",
          );
          return activeWorkspaceId;
        }

        const processingFailure = relevantMedia.find(
          (item) =>
            String(item.processingStatus || "") === "failed_terminal" ||
            ["failed", "removed"].includes(
              String(item.publicationStatus || ""),
            ),
        );
        if (processingFailure) {
          throw new Error(
            processingFailure.processingErrorMessage ||
              "La préparation du média a échoué. Retirez-le puis ajoutez-le de nouveau.",
          );
        }

        const allProcessed =
          hasAllExpectedMedia &&
          relevantMedia.every(
            (item) => String(item.processingStatus || "") === "ready",
          );
        const publicationReady =
          purpose === "generate"
            ? true
            : hasAllExpectedMedia &&
              relevantMedia.every((item) => {
                const status = String(item.publicationStatus || "");
                return status === "ready" || status === "legacy_ready";
              });

        if (!allUploaded) {
          const uploadProgress = hasAllExpectedMedia
            ? Math.round(
                relevantMedia.reduce(
                  (sum, item) => sum + clampPercent(item.uploadProgress || 0),
                  0,
                ) / expectedCount,
              )
            : 0;
          onProgress?.(
            Math.max(6, Math.min(24, Math.round(uploadProgress * 0.24))),
            expectedCount > 1
              ? `Upload des ${mediaLabel} ${uploadProgress}%`
              : `Upload du ${mediaLabel} ${uploadProgress}%`,
          );
        } else if (!unifiedMediaConsumptionClientAvailable) {
          onProgress?.(
            24,
            expectedCount > 1 ? "Médias envoyés" : "Média envoyé",
          );
          return activeWorkspaceId;
        } else if (!allProcessed || !publicationReady) {
          const processingProgress = Math.round(
            relevantMedia.reduce(
              (sum, item) =>
                sum +
                (String(item.processingStatus || "") === "ready"
                  ? 100
                  : clampPercent(item.processingProgress || 0)),
              0,
            ) / Math.max(1, relevantMedia.length),
          );
          const processingStarting =
            expectedMediaType === "video" &&
            processingProgress === 0 &&
            relevantMedia.some((item) =>
              ["not_requested", "queued"].includes(
                String(item.processingStatus || ""),
              ),
            );
          onProgress?.(
            Math.max(25, Math.min(41, 25 + Math.round(processingProgress * 0.16))),
            !allProcessed
              ? processingStarting
                ? "Démarrage du traitement vidéo sur le serveur..."
                : `Préparation des ${mediaLabel} sur le serveur ${processingProgress}%`
              : `Finalisation des ${mediaLabel} pour la publication...`,
          );

          const now = Date.now();
          const retryableFailure = relevantMedia.find(
            (item) => String(item.processingStatus || "") === "failed_retryable",
          );
          if (retryableFailure) {
            if (!retryableFailureSince) retryableFailureSince = now;
            lastPreparationError = new Error(
              retryableFailure.processingErrorMessage ||
                "La préparation vidéo a rencontré une erreur temporaire.",
            );
          } else {
            retryableFailureSince = 0;
            if (processingProgress > lastObservedProcessingProgress) {
              lastPreparationError = null;
            }
          }
          lastObservedProcessingProgress = Math.max(
            lastObservedProcessingProgress,
            processingProgress,
          );

          const preparationErrorMessage = String(
            lastPreparationError?.message || "",
          ).toLowerCase();
          if (
            preparationErrorMessage.includes("n’est pas activée") ||
            preparationErrorMessage.includes("n'est pas activée") ||
            preparationErrorMessage.includes("media_processing_disabled")
          ) {
            throw lastPreparationError;
          }

          if (!preparationKick && now >= nextPreparationKickAt) {
            nextPreparationKickAt = now + 4_000;
            preparationKick = prepareMediaPublicationWorkspace({
              workspaceId: activeWorkspaceId,
            })
              .then((preparation) => {
                if (preparation.status === "failed") {
                  throw new Error(
                    preparation.message ||
                      "La préparation du média a échoué sur le serveur.",
                  );
                }
                if (preparation.status === "ready") {
                  lastPreparationError = null;
                  nextPreparationKickAt = 0;
                }
              })
              .catch((error) => {
                lastPreparationError =
                  error instanceof Error
                    ? error
                    : new Error(
                        "Impossible de relancer la préparation du média.",
                      );
                nextPreparationKickAt = Date.now() + 4_000;
              })
              .finally(() => {
                preparationKick = null;
              });
          }

          if (
            retryableFailureSince &&
            now - retryableFailureSince > 75_000 &&
            lastPreparationError
          ) {
            throw lastPreparationError;
          }
        } else {
          onProgress?.(42, expectedCount > 1 ? "Médias prêts" : "Média prêt");
          return activeWorkspaceId;
        }

        if (Date.now() - startedAt > timeoutMs) {
          if (lastPreparationError) throw lastPreparationError;
          throw new Error(
            expectedMediaType === "video"
              ? "La vidéo est encore en préparation. Réessayez dans quelques instants."
              : "Les images sont encore en préparation. Réessayez dans quelques instants.",
          );
        }
        // Les statuts sont légers (aucun binaire dans la réponse). Un cycle
        // court rend le démarrage perceptiblement plus réactif sans toucher au
        // traitement serveur ni multiplier les relances de préparation.
        await sleep(800);
      }
    },
    [
      ensurePersistentMediaWorkspace,
      images.length,
      mediaWorkspaceId,
      persistentMediaWorkspaceEnabled,
      publicationMediaType,
      unifiedMediaConsumptionClientAvailable,
      videoFile,
      waitForPersistentWorkspaceIdle,
    ],
  );

  useEffect(() => {
    if (!videoFile || videoAiContextRef || mediaPipelineCutoverEnabled) return;

    void getOrPrepareVideoFramesForAI(videoFile).catch(() => {
      // Une extraction anticipée défaillante n'est jamais conservée : la
      // génération retentera avec le comportement de secours historique.
    });
    void getOrPrepareVideoAudioFileForAI(videoFile);
  }, [
    getOrPrepareVideoAudioFileForAI,
    getOrPrepareVideoFramesForAI,
    videoAiContextRef,
    videoFile,
    mediaPipelineCutoverEnabled,
  ]);

  useEffect(() => {
    if (!videoFile || videoAiContextRef || !mediaPipelineCutoverEnabled) return;

    // Le nouveau pipeline conserve son upload direct. Seuls trois JPEG légers
    // et une piste audio locale sont anticipés pour ne plus faire dépendre
    // Générer du transcodage canonique sur le serveur.
    void getOrPrepareVideoFramesForAI(videoFile).catch(() => undefined);
    void getOrPrepareVideoAudioFileForAI(videoFile);
  }, [
    getOrPrepareVideoAudioFileForAI,
    getOrPrepareVideoFramesForAI,
    mediaPipelineCutoverEnabled,
    videoAiContextRef,
    videoFile,
  ]);

  useEffect(() => {
    return () => {
      videoFramesForAiCacheRef.current = null;
      videoAudioFileForAiCacheRef.current = null;
    };
  }, []);

  const resolveChannelMediaMode = (channel: ChannelKey): ChannelMediaMode => {
    const explicit = channelMediaModes[channel];
    const hasVideo = Boolean(videoFile || videoPreviewUrl);
    const hasImages = images.length > 0;

    if (channel === "youtube_shorts") return hasVideo ? "video" : "none";

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
    // A channel can stay selected while its current media is removed. Keep
    // this explicit state even for channels that normally require media;
    // validation will request a replacement without dropping the text.
    if (explicit === "none") return "none";
    if (hasImages && channelSupportsImages(channel)) return "images";
    if (hasVideo) return "video";
    return "none";
  };

  const buildVideoPrewarmTaskKey = (
    workspaceId: string,
    channels: readonly ChannelKey[],
    settingsByChannel: Partial<
      Record<
        ChannelKey,
        { format: VideoFormat; adaptationMode: VideoAdaptationMode }
      >
    >,
  ) =>
    [
      workspaceId,
      videoFile ? makeVideoTranscriptCacheKey(videoFile) : "",
      channels.join(","),
      JSON.stringify(settingsByChannel),
    ].join("|");

  const startBackgroundVideoPrewarm = (
    workspaceId: string,
    channels: readonly ChannelKey[],
    settingsByChannel: Partial<
      Record<
        ChannelKey,
        { format: VideoFormat; adaptationMode: VideoAdaptationMode }
      >
    >,
  ) => {
    if (
      !mediaPipelineCutoverEnabled ||
      !videoFile ||
      !workspaceId ||
      !channels.length
    ) {
      return null;
    }

    const key = buildVideoPrewarmTaskKey(workspaceId, channels, settingsByChannel);
    const current = videoPrewarmTaskRef.current;
    if (current?.key === key) return current.promise;

    const promise = prewarmPersistentMediaWorkspace({
      selectedChannels: channels,
      videoSettingsByChannel: settingsByChannel as Record<string, unknown>,
      // Les variantes nécessaires sont préparées pendant que l'IA travaille,
      // jamais au dernier moment après le clic de publication.
      generateMissingVideoVariants: true,
      allowOriginalVideoFallback: true,
    });
    videoPrewarmTaskRef.current = { key, promise };
    return promise;
  };

  const setChannelMediaMode = (channel: ChannelKey, mode: ChannelMediaMode) => {
    if (mode === "images" && !channelSupportsImages(channel)) return;
    if (mode === "none" && !channelSupportsTextOnly(channel)) return;
    setChannelMediaModes((prev) => ({ ...prev, [channel]: mode }));
    clearVideoVariantPreparationForChannel(channel);
    clearPreparedVideoVariantsForChannel(channel);
  };

  function getCutoverVideoPreparationError(result: any) {
    const firstInvalidChannel = Array.isArray(result?.invalidChannels)
      ? result.invalidChannels[0]
      : null;
    const firstError = Array.isArray(result?.errors) ? result.errors[0] : null;
    const message = String(
      firstInvalidChannel?.message ||
        (typeof firstError === "string" ? firstError : firstError?.message) ||
        result?.error ||
        "",
    ).trim();
    return (
      message ||
      "La vidéo n’est pas encore prête pour tous les réseaux. Réessayez dans quelques instants."
    );
  }

  async function ensureCutoverVideoVariantsReady(
    channels: ChannelKey[],
    settingsByChannel: Partial<
      Record<
        ChannelKey,
        { format: VideoFormat; adaptationMode: VideoAdaptationMode }
      >
    >,
    options?: {
      generateMissingVideoVariants?: boolean;
      allowOriginalVideoFallback?: boolean;
      allowPartialChannelFailures?: boolean;
    },
  ) {
    if (!mediaPipelineCutoverEnabled || !channels.length) return null;

    await waitForPersistentWorkspaceIdle();
    const workspace = await ensurePersistentMediaWorkspace();
    if (!workspace) {
      throw new Error("L’espace média de cette publication est indisponible.");
    }

    const taskKey = buildVideoPrewarmTaskKey(
      workspace.workspaceId,
      channels,
      settingsByChannel,
    );
    let result: any = null;
    const backgroundTask = videoPrewarmTaskRef.current;
    if (backgroundTask?.key === taskKey) {
      // Si la génération est encore en train de préparer les variantes, on
      // attend la même requête au lieu d'en lancer une seconde en parallèle.
      try {
        result = await backgroundTask.promise;
      } catch {
        // Le préchauffage anticipé est opportuniste : on retente ci-dessous
        // dans le chemin de publication afin de conserver le comportement de
        // secours existant.
        result = null;
      }
    }
    if (!result) {
      result = await prewarmPersistentMediaWorkspace({
        selectedChannels: channels,
        videoSettingsByChannel: settingsByChannel as Record<string, unknown>,
        generateMissingVideoVariants:
          options?.generateMissingVideoVariants !== false,
        allowOriginalVideoFallback:
          options?.allowOriginalVideoFallback === true,
      });
    }
    // Fast path first: use an existing optimized variant or the original when
    // the channel accepts it. If cache v6 invalidated an older variant, a MOV
    // needs conversion, or metadata must be probed, regenerate exactly once.
    // This keeps normal publications instant without ever blocking a valid
    // publication merely because a derived variant is absent.
    if (
      !isVideoPreparationReady(result) &&
      options?.generateMissingVideoVariants === false &&
      shouldRetryVideoVariantGeneration(
        Array.isArray(result?.invalidChannels) ? result.invalidChannels : [],
      )
    ) {
      setPublishProgress((current) => Math.max(current, 46));
      setPublishProgressLabel(
        "Préparation de la variante vidéo nécessaire...",
      );
      result = await prewarmPersistentMediaWorkspace({
        selectedChannels: channels,
        videoSettingsByChannel: settingsByChannel as Record<string, unknown>,
        generateMissingVideoVariants: true,
        allowOriginalVideoFallback:
          options?.allowOriginalVideoFallback === true,
      });
    }

    if (!isVideoPreparationReady(result)) {
      if (
        options?.allowPartialChannelFailures === true &&
        canContinueWithIsolatedVideoPreparationFailures(result)
      ) {
        return result;
      }
      throw new Error(getCutoverVideoPreparationError(result));
    }
    return result;
  }

  async function prepareCutoverVideoVariants(
    channels: ChannelKey[],
    settingsByChannel: Partial<
      Record<
        ChannelKey,
        { format: VideoFormat; adaptationMode: VideoAdaptationMode }
      >
    >,
  ) {
    if (!videoFile) {
      setImgError("Ajoutez d’abord une vidéo.");
      return;
    }

    setImgError("");
    setVideoVariantPreparationByChannel((prev) => ({
      ...prev,
      ...Object.fromEntries(
        channels.map((channel) => [
          channel,
          {
            status: "preparing" as const,
            label: "Adaptation en cours",
            detail: "Création de la variante demandée sur le serveur…",
          },
        ]),
      ),
    }));

    try {
      await ensureCutoverVideoVariantsReady(channels, settingsByChannel, {
        generateMissingVideoVariants: true,
        allowOriginalVideoFallback: false,
      });

      setVideoVariantPreparationByChannel((prev) => ({
        ...prev,
        ...Object.fromEntries(
          channels.map((channel) => [
            channel,
            {
              status: "ready" as const,
              label: "Variante prête",
              detail:
                "Cette adaptation est enregistrée et sera réutilisée sans nouveau traitement.",
            },
          ]),
        ),
      }));
    } catch (error) {
      const message = getSimpleFrenchErrorMessage(
        error,
        "La préparation de la variante vidéo a échoué.",
      );
      setVideoVariantPreparationByChannel((prev) => ({
        ...prev,
        ...Object.fromEntries(
          channels.map((channel) => [
            channel,
            {
              status: "error" as const,
              label: "Adaptation impossible",
              detail: message,
            },
          ]),
        ),
      }));
      setImgError(message);
    }
  }

  async function applyVideoFormatForChannel(channel: ChannelKey) {
    if (mediaPipelineCutoverEnabled) {
      const settings = videoSettingsByChannel[channel];
      if (!settings) {
        setImgError("Choisissez d’abord le format vidéo à appliquer.");
        return;
      }
      await prepareCutoverVideoVariants([channel], { [channel]: settings });
      return;
    }
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

    if (mediaPipelineCutoverEnabled) {
      await prepareCutoverVideoVariants(
        videoChannels,
        sharedSettingsByChannel,
      );
      return;
    }

    await applyVideoFormatsForChannels({
      channels: videoChannels,
      mediaModeByChannel: publishMediaModeByChannel,
      settingsByChannel: sharedSettingsByChannel,
    });
  }

  const syncActiveImagesToPersistentWorkspace = useCallback(
    async (nextImages: readonly File[]) => {
      if (!persistentMediaWorkspaceEnabled) return;
      if (publicationMediaType === "video" && videoFile) {
        await syncPersistentWorkspaceVideo(videoFile, {
          duration: videoDurationSeconds,
          source_metadata: videoSourceMetadata,
        });
        return;
      }
      if (nextImages.length) {
        await syncPersistentWorkspaceImages(nextImages);
      } else {
        await clearPersistentWorkspaceMedia();
      }
    },
    [
      clearPersistentWorkspaceMedia,
      persistentMediaWorkspaceEnabled,
      publicationMediaType,
      syncPersistentWorkspaceImages,
      syncPersistentWorkspaceVideo,
      videoDurationSeconds,
      videoFile,
      videoSourceMetadata,
    ],
  );

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
    buildChannelImageSettingsPayload,
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
    syncPersistentWorkspaceImages: syncActiveImagesToPersistentWorkspace,
  });

  const selectedForGeneration = useMemo(() => {
    return CHANNEL_KEYS.filter((channel) => channels[channel] && connected[channel]);
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
          current === "none" ||
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

  const hasWrittenChannelContent = useMemo(
    () =>
      (
        Object.values(postsByChannel) as Array<ChannelPost | undefined>
      ).some((post) => {
        const normalized = normalizePost(post);
        return Boolean(
          String(normalized.title || "").trim() ||
            String(normalized.content || "").trim(),
        );
      }),
    [postsByChannel],
  );

  useEffect(() => {
    if (hasWrittenChannelContent) setContentWorkspaceOpen(true);
  }, [hasWrittenChannelContent]);

  const hasDraftablePublicationContent = useMemo(() => {
    const hasText =
      !!idea.trim() ||
      !!publicationInstruction.trim() ||
      !!theme ||
      contentStyle !== "equilibre";
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
    publicationInstruction,
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
      publicationInstruction: publicationInstruction.trim(),
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
      videoAiContextRef,
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
    publicationInstruction,
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
    videoAiContextRef,
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
        adoptMediaWorkspace(
          payload.mediaWorkspaceId,
          payload.mediaWorkspaceClientKey,
        );

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
        let imageDrafts = Array.isArray(payload.imageDrafts)
          ? payload.imageDrafts
          : [];
        let videoDraft =
          payload.videoDraft && typeof payload.videoDraft === "object"
            ? payload.videoDraft
            : null;

        const linkedWorkspaceId = String(payload.mediaWorkspaceId || "").trim();
        if (
          legacyMediaCutoverClientAvailable &&
          linkedWorkspaceId &&
          !imageDrafts.length &&
          !videoDraft
        ) {
          const snapshot = await loadMediaPublicationWorkspace({
            workspaceId: linkedWorkspaceId,
          });
          const workspaceImages = snapshot.media.filter(
            (media) => media.mediaType === "image" && Boolean(media.publicUrl),
          );
          const workspaceVideo = snapshot.media.find(
            (media) => media.mediaType === "video" && Boolean(media.publicUrl),
          );
          imageDrafts = workspaceImages.map((media) => {
            const keyParts = String(media.clientMediaKey || "").split(":");
            const lastModified = Number(keyParts[keyParts.length - 1] || 0);
            return {
              name: media.fileName,
              type: media.mimeType,
              size: media.sizeBytes,
              lastModified:
                Number.isFinite(lastModified) && lastModified > 0
                  ? lastModified
                  : Date.now(),
              storagePath: media.storagePath,
              publicUrl: media.publicUrl,
            };
          });
          if (workspaceVideo) {
            const keyParts = String(workspaceVideo.clientMediaKey || "").split(":");
            const lastModified = Number(keyParts[keyParts.length - 1] || 0);
            videoDraft = {
              name: workspaceVideo.fileName,
              type: workspaceVideo.mimeType,
              size: workspaceVideo.sizeBytes,
              lastModified:
                Number.isFinite(lastModified) && lastModified > 0
                  ? lastModified
                  : Date.now(),
              duration: workspaceVideo.durationSeconds,
              storagePath: workspaceVideo.storagePath,
              publicUrl: workspaceVideo.publicUrl,
              url: workspaceVideo.publicUrl,
              sourceMetadata: {
                width: workspaceVideo.width,
                height: workspaceVideo.height,
                duration: workspaceVideo.durationSeconds,
              },
            };
          }
        }
        const nextVideoAiContextRef =
          normalizeVideoAiContextReference(payload.videoAiContextRef) ||
          normalizeVideoAiContextReference(videoDraft?.videoAiContextRef);
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
        const nextPublicationInstruction = String(
          payload.publicationInstruction || "",
        );
        const nextInstagramHashtags =
          String(payload.instagramHashtagsInput || "") ||
          (Array.isArray((nextPostsByChannel as any)?.instagram?.hashtags)
            ? (nextPostsByChannel as any).instagram.hashtags.join(" ")
            : "");
        const nextPinterestBoardId = String(
          payload.pinterestBoardId || "",
        ).trim();
        const nextPinterestBoardName = String(
          payload.pinterestBoardName || "",
        ).trim();

        setIdea(nextIdea);
        setPublicationInstruction(nextPublicationInstruction);
        setTheme(nextTheme);
        setContentStyle(nextContentStyle);
        draftChannelsRestoredRef.current = true;
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
        setVideoAiContextRef(restoredVideo.file ? nextVideoAiContextRef : null);
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
            publicationInstruction: nextPublicationInstruction.trim(),
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
            videoAiContextRef: nextVideoAiContextRef,
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
  }, [
    publicationDraftIdParam,
    loadedPublicationDraftId,
    onUnsavedChange,
    legacyMediaCutoverClientAvailable,
  ]);

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
    manuallyControlledChannelsRef.current.add(key);
    setChannels((s) => ({ ...s, [key]: !s[key] }));
  };

  const deselectChannel = (key: ChannelKey) => {
    manuallyControlledChannelsRef.current.add(key);
    setChannels((current) => ({ ...current, [key]: false }));
    setChannelInfoOpen((current) => (current === key ? null : current));
    if (key === "tiktok") {
      setTiktokSettingsOpen(false);
      setTiktokSettingsFlow(null);
      setTiktokPublicationSettings(null);
    }
  };

  const setAllChannelsSelected = (selected: boolean) => {
    CHANNEL_KEYS.forEach((key) => manuallyControlledChannelsRef.current.add(key));
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
    videoFramesForAiCacheRef.current = null;
    videoAudioFileForAiCacheRef.current = null;
    setVideoAiContextRef(null);
  };

  const clearPublicationWork = () => {
    setIdea("");
    setPublicationInstruction("");
    setTheme("");
    setContentStyle("equilibre");
    setPostsByChannel({});
    setInstagramHashtagsInput("");
    closeEmptyContentWarnings();
    setGenError("");
    setGenerationNotice("");
    setDuplicateFeedback(null);
    setDraftMessage("");
    setLastPublicationDraftSnapshot(null);
    setFinalReviewOpen(false);
    setFinalReviewPosts(null);
    setContentWorkspaceOpen(false);
    setShowPublicationPreview(false);
    setIsImageEditorOpen(false);
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

  const scrollToContentWorkspace = () => {
    if (typeof window === "undefined") return;
    window.setTimeout(() => {
      contentWorkspaceRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
  };

  const onCreateManually = () => {
    if (generating) return;
    setGenError("");
    setGenerationNotice("");
    if (!selectedChannels.length) {
      setGenError(
        "Veuillez sélectionner au moins 1 canal avant de créer le contenu manuellement.",
      );
      return;
    }

    setContentWorkspaceOpen(true);
    setSynchronizedActiveChannel(selectedChannels[0]);
    scrollToContentWorkspace();
  };

  const onGenerate = async () => {
    if (generating) return;
    setGenError("");
    setImgError("");
    setGenerationNotice("");

    const trimmed = idea.trim();
    const selectedAiEngineOption = getAiEngineOption(selectedAiPreferredEngine);
    if (!selectedChannels.length) {
      setGenError("Veuillez sélectionner au moins 1 canal avant de générer.");
      return;
    }
    if (!trimmed) {
      setGenError("Écrivez une phrase (ex : chantier terminé...).");
      return;
    }

    if (hasWrittenChannelContent) {
      const confirmed = await confirmInrcy({
        eyebrow: "Contenus déjà présents",
        title: "Générer de nouveaux contenus ?",
        message:
          "Les textes déjà saisis ou générés seront remplacés par les nouveaux contenus créés par iNrCy.",
        cancelLabel: "Conserver mes textes",
        confirmLabel: "Générer et remplacer",
        variant: "warning",
      });
      if (!confirmed) return;
    }

    const shouldUseImagesForAI = images.length > 0 && useImagesForAI;
    const videoGenerationContext = buildBoosterVideoGenerationContext({
      mediaType: videoFile || videoPreviewUrl ? "video" : "images",
      videoFile,
      duration: videoDurationSeconds,
      storage: videoStorageContext,
    });
    const hasVideoForGeneration = !!videoGenerationContext?.enabled;
    const mediaPreflightIncluded =
      persistentMediaWorkspaceEnabled &&
      (images.length > 0 || Boolean(videoFile));
    const generationPercent = (withoutMedia: number, withMedia: number) =>
      mediaPreflightIncluded ? withMedia : withoutMedia;

    clearGenerationTimers();
    setGenerating(true);
    setGenerationProgress(6);
    setGenerationStage("Vérification du média...");
    setDuplicateFeedback(null);

    let didGenerate = false;
    try {
      const readyMediaWorkspaceId =
        await waitForPersistentWorkspaceReadiness("generate", (progress, label) => {
          setGenerationProgress((current) => Math.max(current, progress));
          setGenerationStage(label || "Préparation du média...");
        });

      if (
        hasVideoForGeneration &&
        mediaPipelineCutoverEnabled &&
        readyMediaWorkspaceId
      ) {
        const videoChannelsForPrewarm = selectedForGeneration.filter(
          (channel) => resolveChannelMediaMode(channel) === "video",
        );
        const videoSettingsForPrewarm = Object.fromEntries(
          videoChannelsForPrewarm.map((channel) => [
            channel,
            getAutomaticVideoSettingsForPublication({
              channel,
              settings: videoSettingsByChannel[channel],
              durationSeconds:
                videoDurationSeconds ?? videoSourceMetadata?.duration ?? null,
            }),
          ]),
        ) as Partial<
          Record<
            ChannelKey,
            { format: VideoFormat; adaptationMode: VideoAdaptationMode }
          >
        >;
        const backgroundPrewarm = startBackgroundVideoPrewarm(
          readyMediaWorkspaceId,
          videoChannelsForPrewarm,
          videoSettingsForPrewarm,
        );
        // Le préchauffage est opportuniste ; Publier retentera proprement si
        // le serveur le refuse ou si la connexion est interrompue.
        if (backgroundPrewarm) {
          void backgroundPrewarm.catch(() => undefined);
        }
      }

      setGenerationProgress((current) =>
        Math.max(current, mediaPreflightIncluded ? 42 : 8),
      );
      setGenerationStage(`Préparation avec ${selectedAiEngineOption.shortLabel}`);

      const generationSteps = [
        { percent: generationPercent(16, 46), label: "Préparation du brief", delay: 250 },
        { percent: generationPercent(26, 50), label: "Analyse de l’intention", delay: 650 },
        ...(shouldUseImagesForAI
          ? [
              { percent: generationPercent(36, 56), label: "Préparation des images", delay: 1200 },
              { percent: generationPercent(48, 62), label: "Analyse des visuels", delay: 2200 },
            ]
          : hasVideoForGeneration
            ? [
                { percent: generationPercent(34, 52), label: "Préparation de la vidéo", delay: 900 },
                {
                  percent: generationPercent(42, 58),
                  label: "Transcription audio de la vidéo",
                  delay: 1500,
                },
                {
                  percent: generationPercent(52, 64),
                  label: "Extraction des images de la vidéo",
                  delay: 2300,
                },
                {
                  percent: generationPercent(60, 70),
                  label: "Analyse audio + images de la vidéo",
                  delay: 3200,
                },
              ]
            : [{ percent: generationPercent(42, 58), label: "Construction du contenu", delay: 1400 }]),
        {
          percent: generationPercent(62, 74),
          label: hasVideoForGeneration
            ? `Rédaction avec ${selectedAiEngineOption.shortLabel} à partir de votre vidéo`
            : `Rédaction avec ${selectedAiEngineOption.shortLabel}`,
          delay: hasVideoForGeneration ? 3800 : 3200,
        },
        { percent: generationPercent(70, 82), label: "Adaptation par canal", delay: 4800 },
        { percent: generationPercent(80, 88), label: "Vérification des textes", delay: 6200 },
        { percent: generationPercent(88, 93), label: "Mise en forme", delay: 8000 },
        { percent: generationPercent(94, 96), label: "Finalisation", delay: 10000 },
        { percent: generationPercent(97, 98), label: "Encore quelques secondes...", delay: 14000 },
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
      const imagePreparationResults =
        shouldUseImagesForAI && !mediaPipelineCutoverEnabled
        ? await Promise.allSettled(
            images.map((file) => getOrPrepareAiImagePayload(file)),
          )
        : [];
      const imagesForAI = imagePreparationResults.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      let videoFramesForAI: VideoFramesForAI = [];
      let videoAudioTranscript = "";
      let videoRawAudioTranscript = "";
      let videoAudioTranscriptStatus: "pending" | "ready" | "unavailable" =
        "pending";
      const useWorkspaceVideoFastAiPreview =
        mediaPipelineCutoverEnabled && Boolean(readyMediaWorkspaceId);

      if (
        hasVideoForGeneration &&
        videoFile &&
        !videoAiContextRef &&
        (!mediaPipelineCutoverEnabled || useWorkspaceVideoFastAiPreview)
      ) {
        setGenerationProgress((current) => Math.max(current, 36));
        setGenerationStage("Analyse audio + images de la vidéo");

        const cacheKey = makeVideoTranscriptCacheKey(videoFile);
        const cachedTranscript =
          videoAudioTranscriptCacheRef.current?.key === cacheKey
            ? videoAudioTranscriptCacheRef.current
            : null;

        const transcriptionPromise = cachedTranscript
          ? Promise.resolve(cachedTranscript)
          : getOrPrepareVideoAudioFileForAI(videoFile).then((preparedAudio) =>
              transcribeVideoAudioForAI(videoFile, preparedAudio),
            );

        const [transcriptResult, framesResult] = await Promise.allSettled([
          transcriptionPromise,
          getOrPrepareVideoFramesForAI(videoFile),
        ]);

        const transcript =
          transcriptResult.status === "fulfilled"
            ? transcriptResult.value
            : null;
        if (transcript?.text) {
          videoAudioTranscript = transcript.text;
          videoRawAudioTranscript = transcript.rawText || transcript.text;
          videoAudioTranscriptStatus = "ready";
          videoAudioTranscriptCacheRef.current = {
            key: cacheKey,
            text: videoAudioTranscript,
            rawText: videoRawAudioTranscript,
          };
        } else {
          videoAudioTranscriptStatus = "unavailable";
        }

        videoFramesForAI =
          framesResult.status === "fulfilled" ? framesResult.value : [];

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
      } else if (
        hasVideoForGeneration &&
        videoAiContextRef
      ) {
        setGenerationProgress((current) => Math.max(current, 60));
        setGenerationStage("Réutilisation de l’analyse vidéo iNrAgent");
      }

      const generationPayload = {
        mediaWorkspaceId:
          unifiedMediaConsumptionClientAvailable && readyMediaWorkspaceId
            ? readyMediaWorkspaceId
            : undefined,
        mediaPipelineCutoverV1: mediaPipelineCutoverEnabled,
        mediaWorkspaceExpected:
          hasVideoForGeneration || images.length > 0,
        idea: trimmed,
        publicationInstruction: publicationInstruction.trim(),
        theme,
        style: contentStyle,
        aiPreferredEngine: selectedAiPreferredEngine,
        channels: selectedForGeneration,
        mediaType: hasVideoForGeneration ? "video" : "images",
        useImagesForAI:
          !mediaPipelineCutoverEnabled && imagesForAI.length > 0,
        imageCount: mediaPipelineCutoverEnabled ? 0 : imagesForAI.length,
        imagesForAI: mediaPipelineCutoverEnabled ? [] : imagesForAI,
        videoForAI:
          hasVideoForGeneration &&
          videoGenerationContext
            ? {
                ...videoGenerationContext,
                contextRef: videoAiContextRef,
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
      };
      const executeGenerationRequest = async (engine: AiPreferredEngine) => {
        const request = buildBoosterGenerationRequest({
          ...generationPayload,
          aiPreferredEngine: engine,
        });
        const response = await fetch("/api/booster/generate", {
          method: "POST",
          ...(request.headers ? { headers: request.headers } : {}),
          body: request.body,
        });
        const responseJson = await response.json().catch(() => ({}));
        return { response, responseJson };
      };

      let { response: res, responseJson: json } =
        await executeGenerationRequest(selectedAiPreferredEngine);
      let automaticRetry:
        | { primaryEngine: AiPreferredEngine; finalEngine: AiPreferredEngine }
        | null = null;

      if (
        !res.ok &&
        isAutomaticBoosterGenerationRetryEligible(res.status, json)
      ) {
        const retryEngine = getAutomaticAiRetryEngine(
          selectedAiPreferredEngine,
        );
        const primaryLabel = getAiEngineOption(
          selectedAiPreferredEngine,
        ).shortLabel;
        const retryLabel = getAiEngineOption(retryEngine).shortLabel;

        automaticRetry = {
          primaryEngine: selectedAiPreferredEngine,
          finalEngine: retryEngine,
        };
        setGenerationProgress(94);
        setGenerationStage(
          `${primaryLabel} n'a pas répondu, secours automatique avec ${retryLabel}`,
        );

        ({ response: res, responseJson: json } =
          await executeGenerationRequest(retryEngine));
      }

      if (!res.ok) {
        const specialMessage = getBoosterGenerationSpecialErrorMessage({
          status: res.status,
          payload: json,
          retryAfterHeader: res.headers.get("Retry-After"),
        });
        setGenError(
          specialMessage ||
            getSimpleFrenchErrorMessage(
              json?.user_message || json?.error,
              "La génération n'a pas pu aboutir. Merci de réessayer.",
            ),
        );
        return;
      }

      const versions = json?.versions || {};
      setPostsByChannel(sanitizePostsForEditor(versions));
      setContentWorkspaceOpen(true);
      if (selectedForGeneration.length) {
        setSynchronizedActiveChannel(selectedForGeneration[0]);
      }
      scrollToContentWorkspace();
      const aiFallback = json?.aiFallback;
      if (aiFallback?.used) {
        const primaryLabel = String(
          aiFallback.primaryEngineLabel || "Le moteur sélectionné",
        ).trim();
        const finalLabel = String(
          aiFallback.finalEngineLabel || "ChatGPT",
        ).trim();
        const transportLabel =
          aiFallback.transport === "openai_direct"
            ? "via la connexion OpenAI de secours"
            : "via le moteur de secours";
        setGenerationNotice(
          `${primaryLabel} était temporairement indisponible. Le contenu a été généré avec ${finalLabel} ${transportLabel}.`,
        );
      } else if (automaticRetry) {
        const primaryLabel = getAiEngineOption(
          automaticRetry.primaryEngine,
        ).shortLabel;
        const finalLabel = getAiEngineOption(
          automaticRetry.finalEngine,
        ).shortLabel;
        setGenerationNotice(
          `${primaryLabel} n'a pas répondu au premier essai. iNrCy a automatiquement terminé la génération avec ${finalLabel}, sans modifier votre moteur par défaut.`,
        );
      }
      didGenerate = true;
    } catch (error) {
      const fallback = shouldUseImagesForAI
        ? "Impossible de préparer ou d’analyser les images pour le moment. Merci de réessayer."
        : hasVideoForGeneration
          ? "Impossible de préparer l’analyse vidéo pour le moment. Merci de réessayer."
          : "Connexion impossible pour le moment. Merci de réessayer.";
      setGenError(
        getSimpleFrenchErrorMessage(
          error instanceof Error ? error.message : error,
          fallback,
        ),
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
    if (images.length) {
      void syncPersistentWorkspaceImages(images);
    } else {
      void clearPersistentWorkspaceMedia();
    }
    setChannelMediaModes((prev) => {
      const next: Partial<Record<ChannelKey, ChannelMediaMode>> = { ...prev };
      for (const key of Object.keys(next) as ChannelKey[]) {
        if (next[key] === "video")
          next[key] = images.length ? "images" : "none";
      }
      return next;
    });
  };

  const removeVideoFromChannel = (channel: ChannelKey) => {
    setImgError("");
    clearVideoVariantPreparationForChannel(channel);
    clearPreparedVideoVariantsForChannel(channel);
    setChannelMediaModes((prev) => ({ ...prev, [channel]: "none" }));
  };

  const addVideoFile = async (file: File | null) => {
    if (!file) return;
    setImgError("");
    setVideoVariantPreparationByChannel({});
    setVideoTransformedVariants([]);

    if (!isBoosterVideoFile(file)) {
      setImgError(`Ajoutez une vidéo valide : ${BOOSTER_VIDEO_FORMATS_LABEL}.`);
      return;
    }

    if (file.size > BOOSTER_MAX_VIDEO_BYTES) {
      setImgError(
        `La vidéo ${file.name} dépasse ${BOOSTER_MAX_VIDEO_MB_LABEL}.`,
      );
      return;
    }

    clearVideoMedia({ cleanupStorage: true, reason: "replace-video" });
    const normalizedFile = new File([file], buildVideoFileName(file), {
      type: file.type || "video/mp4",
      lastModified: file.lastModified || Date.now(),
    });
    if (!mediaPipelineCutoverEnabled) {
      void getOrPrepareVideoFramesForAI(normalizedFile).catch(() => {
        // Le parcours historique conserve son fallback en cas d’échec local.
      });
      void getOrPrepareVideoAudioFileForAI(normalizedFile);
    }

    let sourceMetadata: BoosterVideoSourceMetadata | null = null;
    try {
      sourceMetadata = await readVideoSourceMetadata(normalizedFile);
    } catch {
      sourceMetadata = null;
    }
    const duration = sourceMetadata?.duration ?? null;

    setPublicationMediaType("video");
    setVideoFile(normalizedFile);
    setVideoPreviewUrl(URL.createObjectURL(normalizedFile));
    setVideoDurationSeconds(duration);
    setVideoSourceMetadata(sourceMetadata);
    setVideoStorageContext(null);
    void syncPersistentWorkspaceVideo(normalizedFile, {
      duration,
      source_metadata: sourceMetadata,
    });
    setVideoFormatByChannel((prev) => {
      const next: Partial<Record<ChannelKey, VideoFormat>> = { ...prev };
      for (const channel of selectedChannels.length
        ? selectedChannels
        : CHANNEL_KEYS) {
        next[channel] = "original";
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
          next[channel] || "safe_frame",
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
    if (channel === "inr_search" && typeof nextPatch.content === "string") {
      nextPatch.content = nextPatch.content
        .slice(0, INR_SEARCH_CONTENT_MAX_LENGTH)
        .trim();
    }
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

  const getPreviewCtaForDisplayKey = (key: DisplayKey, post: ChannelPost) =>
    buildCtaTextForChannel(key, post, {
      websiteUrl: getWebsiteUrlForChannel(key, ctaDefaults),
      phone: ctaDefaults?.phone || "",
    });

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
      if (!prepared[key]) continue;
      const structuredSafePost = sanitizeBoosterPostForStructuredCta(
        prepared[key],
        {
          websiteUrl: getWebsiteUrlForChannel(key, ctaDefaults),
          phone: ctaDefaults?.phone || "",
        },
      );
      if (isSiteDisplayKey(key)) {
        prepared[key] = normalizePost(structuredSafePost);
        continue;
      }
      prepared[key] = normalizePost({
        ...structuredSafePost,
        title: stripSiteTextFormatting(structuredSafePost.title || ""),
        content: stripSiteTextFormattingPreserveLayout(
          structuredSafePost.content || "",
        ),
        cta: stripSiteTextFormatting(structuredSafePost.cta || ""),
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
      videoFormatByChannel[channel] || "original",
    );
    const selectedVideoAdaptation = normalizeVideoAdaptationMode(
      videoAdaptationModeByChannel[channel],
    );
    const signature = buildVideoTransformSignature(
      selectedVideoFormat,
      selectedVideoAdaptation,
      getVideoPublicationProfileForChannel(channel),
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
              selectedVideoFormat === "original" &&
              videoSourceMetadata?.width &&
              videoSourceMetadata?.height
                ? `${videoSourceMetadata.width} / ${videoSourceMetadata.height}`
                : VIDEO_FORMAT_ASPECT_RATIOS[selectedVideoFormat] || "16 / 9",
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
        channel === "inrcy_site" || channel === "site_web" || channel === "inr_search"
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
      new Set(
        options?.channels !== undefined ? options.channels : selectedChannels,
      ),
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
    const preflightFailedChannels = reviewItems
      .filter((item) => item.blockers.length > 0)
      .map((item) => ({
        channel: item.channel,
        label: item.label,
        blockers: item.blockers,
        code: item.blockerCodes?.[0] || "prepublish_validation_failed",
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
    const publishVideoSettingsByChannel = Object.fromEntries(
      publishableChannels.map((channel) => [
        channel,
        getAutomaticVideoSettingsForPublication({
          channel,
          settings: videoSettingsByChannel[channel],
          durationSeconds:
            videoDurationSeconds ?? videoSourceMetadata?.duration ?? null,
        }),
      ]),
    ) as Partial<
      Record<
        ChannelKey,
        { format: VideoFormat; adaptationMode: VideoAdaptationMode }
      >
    >;

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

    closeEmptyContentWarnings();
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
      const pinterestMode = publishMediaModeByChannel.pinterest || "none";
      const pinterestImages = channelImageEditors.pinterest?.imageKeys || [];
      if (pinterestMode === "none") {
        setImgError("Pinterest nécessite une image ou une vidéo.");
        return;
      }
      if (pinterestMode === "images" && !pinterestImages.length) {
        setImgError(
          "Veuillez ajouter au moins 1 image pour publier sur Pinterest.",
        );
        return;
      }
      if (pinterestMode === "video" && !videoFile) {
        setImgError("Veuillez ajouter une vidéo pour publier sur Pinterest.");
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

    let publishDispatchStarted = false;

    try {
      const readyMediaWorkspaceId =
        await waitForPersistentWorkspaceReadiness("publish", (progress, label) => {
          setPublishProgress((current) => Math.max(current, progress));
          setPublishProgressLabel(label || "Vérification des médias...");
        });

      if (hasAnyVideoPublish && mediaPipelineCutoverEnabled) {
        const videoChannels = publishableChannels.filter(
          (channel) => publishMediaModeByChannel[channel] === "video",
        );
        setPublishProgress((current) => Math.max(current, 43));
        setPublishProgressLabel(
          "Vérification de la vidéo pour les réseaux...",
        );
        const videoPreparation = await ensureCutoverVideoVariantsReady(
          videoChannels,
          publishVideoSettingsByChannel,
          {
            generateMissingVideoVariants: true,
            allowOriginalVideoFallback: true,
            allowPartialChannelFailures: true,
          },
        );
        setPublishProgress((current) => Math.max(current, 57));
        setPublishProgressLabel(
          canContinueWithIsolatedVideoPreparationFailures(videoPreparation)
            ? "Vidéo vérifiée : les canaux incompatibles seront isolés."
            : "Vidéo compatible et prête à publier.",
        );
      }

      const emptyChannelImages = {} as ChannelImagePayload;
      const emptyChannelSettings = {} as ChannelImageSettingsPayload;
      const { channelImages, channelSettings } = !hasAnyImagePublish
        ? {
            channelImages: emptyChannelImages,
            channelSettings: emptyChannelSettings,
          }
        : mediaPipelineCutoverEnabled
          ? {
              channelImages: emptyChannelImages,
              channelSettings: buildChannelImageSettingsPayload(),
            }
          : await buildChannelImagesPayload((current, total) => {
            if (!total) {
              setPublishProgress((current) => Math.max(current, 25));
              setPublishProgressLabel("Préparation des contenus...");
              return;
            }
            const ratio = current / total;
            setPublishProgress((current) =>
              Math.max(current, clampPercent(8 + ratio * 27)),
            );
            setPublishProgressLabel(
              `Préparation des images ${clampPercent(ratio * 100)}%`,
            );
          });

      const originalImageByKey: Record<string, ImagePayload> =
        !hasAnyImagePublish || mediaPipelineCutoverEnabled
          ? {}
          : await (async () => {
              setPublishProgress((prev) => Math.max(prev, 35));
              setPublishProgressLabel("Upload des images originales...");
              return await uploadOriginalImagesForPublication(
                (current, total) => {
                  if (!total) return;
                  const ratio = current / total;
                  setPublishProgress((current) =>
                    Math.max(current, clampPercent(35 + ratio * 12)),
                  );
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
      if (hasAnyImagePublish && !mediaPipelineCutoverEnabled) {
        for (const channel of publishableChannels) {
          if (publishMediaModeByChannel[channel] !== "images") continue;
          const uploadedImages = await uploadPreparedImages(
            channelImages[channel] || [],
            (current, total) => {
              if (!total) return;
              uploadedCount += 1;
              const ratio = uploadTargets ? uploadedCount / uploadTargets : 1;
              setPublishProgress((current) =>
                Math.max(
                  current,
                  clampPercent(
                    (images.length ? 47 : 35) +
                      ratio * (images.length ? 23 : 35),
                  ),
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
      if (hasAnyVideoPublish && !mediaPipelineCutoverEnabled) {
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
          { settingsByChannel: publishVideoSettingsByChannel },
        );
      }

      setPublishProgress((prev) => Math.max(prev, 74));
      publishPulseProgressRef.current = 74;
      setPublishProgressLabel("Création de l’historique iNr’Send...");
      if (publishPulseTimerRef.current)
        window.clearInterval(publishPulseTimerRef.current);

      const publishStartedAt = Date.now();
      const publishChannels = [...publishableChannels];
      // Le suivi de progression accompagne l'appel réseau ; il ne doit pas
      // imposer une attente artificielle après que les médias sont prêts.
      const estimatedPublishMs = Math.max(
        2500,
        1800 +
          publishChannels.length * 1200 +
          (uploadTargets ? 600 : 0) +
          (hasAnyVideoPublish ? 800 : 0),
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
      }, 350);

      publishDispatchStarted = true;
      const result = await trackEvent("publish", {
        mediaWorkspaceId:
          unifiedMediaConsumptionClientAvailable && readyMediaWorkspaceId
            ? readyMediaWorkspaceId
            : undefined,
        mediaWorkspaceClientKey:
          unifiedMediaConsumptionClientAvailable && readyMediaWorkspaceId
            ? mediaWorkspaceClientKey
            : undefined,
        mediaPipelineCutoverV1: mediaPipelineCutoverEnabled,
        mediaType: hasAnyVideoPublish ? "video" : "images",
        mediaModeByChannel: buildChannelRecord(
          publishMediaModeByChannel,
          publishableChannels,
        ),
        videoFormatByChannel: buildChannelRecord(
          videoFormatByChannel,
          publishableChannels,
        ),
        videoAdaptationModeByChannel: buildChannelRecord(
          videoAdaptationModeByChannel,
          publishableChannels,
        ),
        videoSettingsByChannel: buildChannelRecord(
          publishVideoSettingsByChannel,
          publishableChannels,
        ),
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
        imagesByChannel: buildChannelRecord(
          uploadedChannelImages,
          publishableChannels,
        ),
        imageSettingsByChannel: buildChannelRecord(
          channelSettings,
          publishableChannels,
        ),
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
      const resultEntries = Array.isArray(result?.summary?.entries)
        ? result.summary.entries
        : [];
      const retryFailedChannels = resultEntries
        .filter(
          (entry: any) =>
            entry?.ok === false &&
            entry?.retryable !== false &&
            publishableChannels.includes(entry?.channel as ChannelKey),
        )
        .map((entry: any) => entry.channel as ChannelKey);
      const failureCount = Math.max(
        0,
        Number(result?.summary?.failureCount || retryFailedChannels.length),
      );
      const warningCount = Math.max(
        0,
        Number(
          result?.summary?.warningCount ||
            resultEntries.filter(
              (entry: any) => entry?.status === "published_with_warning",
            ).length,
        ),
      );
      const publicationComplete = failureCount === 0;

      setPublishProgress(100);
      setPublishProgressLabel(
        result?.summary?.allFailed
          ? "Échec"
          : publicationComplete
            ? warningCount > 0
              ? "Publié avec avertissement"
              : "Publié"
            : "Publication partielle",
      );
      await sleep(220);
      if (publicationComplete) {
        onUnsavedChange?.(false);
      }
      const channelLinks = Object.fromEntries(
        publishableChannels.map((channel) => [
          channel,
          normalizeExternalHref(channelDetails[channel]?.href),
        ]),
      );
      if (publicationComplete) {
        void archivePersistentMediaWorkspace().catch((error) => {
          console.warn("[media-pipeline] workspace archive skipped", error);
        });
      }

      const retryFailed = retryFailedChannels.length
        ? async () => {
            await runPublish({
              channels: retryFailedChannels,
              preparedPostsByChannel,
              tiktokPublicationSettings:
                options?.tiktokPublicationSettings ||
                tiktokPublicationSettings,
              closeOnSuccess: true,
              suppressPublishSuccess: false,
              throwOnError: true,
            });
          }
        : undefined;

      if (!options?.suppressPublishSuccess) {
        onPublishSuccess?.({
          ...result,
          channelLinks,
          preflightFailedChannels,
          retryFailedChannels,
          retryFailed,
        });
      }
      if (options?.closeOnSuccess !== false && publicationComplete) {
        onClose();
      }
    } catch (e) {
      if (publishPulseTimerRef.current) {
        window.clearInterval(publishPulseTimerRef.current);
        publishPulseTimerRef.current = null;
      }
      setPublishProgress(0);
      setPublishProgressLabel("");
      const baseMessage = getSimpleFrenchErrorMessage(
        e,
        "La publication n'a pas pu être envoyée. Merci de réessayer.",
      );
      const networkLike = /connexion au serveur impossible|connexion interrompue|failed to fetch|networkerror|network request failed/i.test(
        `${e instanceof Error ? e.message : String(e || "")} ${baseMessage}`,
      );
      const message = networkLike
        ? publishDispatchStarted
          ? "Connexion interrompue pendant la publication. L’envoi peut encore être en cours : vérifiez iNr’Send avant de relancer."
          : "Connexion interrompue pendant la préparation des médias. Aucun envoi n’a été confirmé : réessayez dans quelques instants."
        : baseMessage;
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
      const imageDrafts =
        images.length && !(mediaPipelineCutoverEnabled && mediaWorkspaceId)
          ? await uploadPublicationDraftImages()
          : [];
      const rawVideoDraft = mediaPipelineCutoverEnabled && mediaWorkspaceId
        ? null
        : await buildPublicationDraftVideoPayload();
      const videoDraft = rawVideoDraft
        ? {
            ...rawVideoDraft,
            ...videoAiContextReferenceAliases(videoAiContextRef),
          }
        : null;
      const response = await fetch("/api/booster/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "publish_draft",
          draftId:
            loadedPublicationDraftId || publicationDraftIdParam || undefined,
          payload: {
            status: "draft",
            mediaWorkspaceId,
            mediaWorkspaceClientKey,
            mediaPipelineCutoverV1: mediaPipelineCutoverEnabled,
            title: firstTitle || "Brouillon publication",
            preview: firstContent || idea.trim() || channelLabels,
            content: firstContent || "",
            idea: idea.trim(),
            publicationInstruction: publicationInstruction.trim(),
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
            ...videoAiContextReferenceAliases(videoAiContextRef),
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
        await linkPersistentWorkspaceDraft(savedDraftId).catch((error) => {
          console.warn("[media-pipeline] workspace draft link skipped", error);
        });
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

    const requestedChannelsToSchedule = Array.from(
      new Set(selections.map((selection) => selection.channel)),
    ).filter((channel): channel is ChannelKey =>
      selectedChannels.includes(channel),
    );

    if (!requestedChannelsToSchedule.length) {
      setScheduleError("Sélectionnez au moins un canal à programmer.");
      return;
    }

    const immediateChannelsToPublish = Array.from(new Set(immediateChannels))
      .filter((channel): channel is ChannelKey =>
        selectedChannels.includes(channel),
      )
      .filter((channel) => !requestedChannelsToSchedule.includes(channel));

    const reviewItems = buildFinalReviewItems(
      preparedPostsByChannel,
      requestedChannelsToSchedule,
    );
    const blocked = reviewItems.filter((item) => item.blockers.length > 0);
    const channelsToSchedule = reviewItems
      .filter((item) => item.blockers.length === 0)
      .map((item) => item.channel);
    if (!channelsToSchedule.length) {
      setScheduleError(
        `Aucun canal ne peut être programmé : ${blocked
          .map(
            (item) =>
              `${item.label} — ${item.blockers[0] || "canal non prêt"}`,
          )
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
    const scheduleVideoSettingsByChannel = Object.fromEntries(
      channelsToSchedule.map((channel) => [
        channel,
        getAutomaticVideoSettingsForPublication({
          channel,
          settings: videoSettingsByChannel[channel],
          durationSeconds:
            videoDurationSeconds ?? videoSourceMetadata?.duration ?? null,
        }),
      ]),
    ) as Partial<
      Record<
        ChannelKey,
        { format: VideoFormat; adaptationMode: VideoAdaptationMode }
      >
    >;

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
      const readyMediaWorkspaceId =
        await waitForPersistentWorkspaceReadiness("schedule", (progress, label) => {
          setPublishProgress((current) => Math.max(current, progress));
          setPublishProgressLabel(label || "Vérification des médias...");
        });

      if (hasAnyVideoPublish && mediaPipelineCutoverEnabled) {
        const videoChannels = channelsToSchedule.filter(
          (channel) => publishMediaModeByChannel[channel] === "video",
        );
        setPublishProgress((current) => Math.max(current, 43));
        setPublishProgressLabel(
          "Vérification de la vidéo pour la programmation...",
        );
        const videoPreparation = await ensureCutoverVideoVariantsReady(
          videoChannels,
          scheduleVideoSettingsByChannel,
          {
            generateMissingVideoVariants: true,
            allowOriginalVideoFallback: true,
            allowPartialChannelFailures: true,
          },
        );
        setPublishProgress((current) => Math.max(current, 57));
        setPublishProgressLabel(
          canContinueWithIsolatedVideoPreparationFailures(videoPreparation)
            ? "Vidéo vérifiée : les canaux incompatibles seront isolés."
            : "Vidéo compatible et prête à programmer.",
        );
      }

      const emptyChannelImages = {} as ChannelImagePayload;
      const emptyChannelSettings = {} as ChannelImageSettingsPayload;
      const { channelImages, channelSettings } = !hasAnyImagePublish
        ? {
            channelImages: emptyChannelImages,
            channelSettings: emptyChannelSettings,
          }
        : mediaPipelineCutoverEnabled
          ? {
              channelImages: emptyChannelImages,
              channelSettings: buildChannelImageSettingsPayload(),
            }
          : await buildChannelImagesPayload((current, total) => {
            if (!total) {
              setPublishProgress((current) => Math.max(current, 20));
              setPublishProgressLabel("Préparation des contenus...");
              return;
            }
            const ratio = current / total;
            setPublishProgress((current) =>
              Math.max(current, clampPercent(8 + ratio * 22)),
            );
            setPublishProgressLabel(
              `Préparation des images ${clampPercent(ratio * 100)}%`,
            );
          });

      const originalImageByKey: Record<string, ImagePayload> =
        !hasAnyImagePublish || mediaPipelineCutoverEnabled
          ? {}
          : await (async () => {
              setPublishProgress((current) => Math.max(current, 32));
              setPublishProgressLabel("Upload des images originales...");
              return await uploadOriginalImagesForPublication(
                (current, total) => {
                  if (!total) return;
                  const ratio = current / total;
                  setPublishProgress((current) =>
                    Math.max(current, clampPercent(32 + ratio * 12)),
                  );
                  setPublishProgressLabel(
                    `Upload des images originales ${clampPercent(ratio * 100)}%`,
                  );
                },
              );
            })();

      const uploadedChannelImages = {} as ChannelImagePayload;
      if (hasAnyImagePublish && !mediaPipelineCutoverEnabled) {
        setPublishProgress((current) => Math.max(current, 48));
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
              setPublishProgress((current) =>
                Math.max(current, clampPercent(48 + ratio * 22)),
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
      if (hasAnyVideoPublish && !mediaPipelineCutoverEnabled) {
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
          { settingsByChannel: scheduleVideoSettingsByChannel },
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
                mediaWorkspaceId:
                  unifiedMediaConsumptionClientAvailable && readyMediaWorkspaceId
                    ? readyMediaWorkspaceId
                    : undefined,
                mediaWorkspaceClientKey:
                  unifiedMediaConsumptionClientAvailable && readyMediaWorkspaceId
                    ? mediaWorkspaceClientKey
                    : undefined,
                mediaPipelineCutoverV1: mediaPipelineCutoverEnabled,
                source: "booster_scheduled",
                origin: {
                  source: "booster_scheduled",
                  label: "Booster programmé",
                  workflowTool: "booster",
                  workflowAction: "publier",
                },
                mediaType: hasAnyVideoPublish ? "video" : "images",
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
                  scheduleVideoSettingsByChannel as Partial<
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
                pinterestPublicationSettings: groupChannels.includes(
                  "pinterest",
                )
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
      const scheduledMessage =
        channelsToSchedule.length > 1
          ? `Publication multicanale programmée dans iNr’Agent (${channelsToSchedule.length} canaux).`
          : "Publication programmée dans iNr’Agent.";
      const blockedMessage = blocked.length
        ? ` Canal${blocked.length > 1 ? "aux" : ""} non programmé${blocked.length > 1 ? "s" : ""} : ${blocked
            .map(
              (item) =>
                `${item.label} — ${item.blockers[0] || "canal non prêt"}`,
            )
            .join(" / ")}.`
        : "";
      setDraftMessage(`${scheduledMessage}${blockedMessage}`);

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
      onUnsavedChange?.(blocked.length > 0);
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
        tiktokMaxVideoDurationSeconds,
        tiktokDurationLimitVerified,
        youtubeLongUploadsStatus,
        hasImage,
        imageCount: imageKeysToPublish.length,
        hasText,
        hasTitle,
        hasContent,
      });
      const videoPreparationState = videoVariantPreparationByChannel[channel];
      const videoPreparationBlocker =
        mode === "video" && videoPreparationState?.status === "error"
          ? String(
              videoPreparationState.detail ||
                "La conversion technique de la vidéo a échoué pour ce canal.",
            ).trim()
          : "";

      const blockers = [
        ...requirements.blockers,
        ...(videoPreparationBlocker ? [videoPreparationBlocker] : []),
        ...(channel === "pinterest" && !pinterestBoardId
          ? ["Choisissez un tableau Pinterest."]
          : []),
      ];
      const blockerCodes = [
        ...requirements.blockerCodes,
        ...(videoPreparationBlocker ? ["video_conversion_failed"] : []),
        ...(channel === "pinterest" && !pinterestBoardId
          ? ["pinterest_board_required"]
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
        blockerCodes,
        mediaBlockers: [
          ...requirements.mediaBlockers,
          ...(videoPreparationBlocker ? [videoPreparationBlocker] : []),
        ],
        mediaBlockerCodes: [
          ...requirements.mediaBlockerCodes,
          ...(videoPreparationBlocker ? ["video_conversion_failed"] : []),
        ],
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
      tone: reviewItem?.mediaBlockers?.length
        ? ("blocked" as const)
        : count
          ? ("ready" as const)
          : ("warning" as const),
      message: reviewItem?.mediaBlockers?.[0] || "",
      blockers: reviewItem?.mediaBlockers || [],
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
      message: reviewItem?.blockers?.[0] || "",
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

  const excludeTiktokAndContinue = () => {
    const flow = tiktokSettingsFlow;
    deselectChannel("tiktok");
    setPendingScheduleRequest(null);
    if (flow === "schedule") {
      setScheduleModalOpen(true);
      return;
    }
    setFinalReviewOpen(true);
  };

  const aiDrawerHeight = drawerViewportHeight
    ? `${drawerViewportHeight}px`
    : isMobile
      ? "100svh"
      : "100dvh";
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
        onExcludeAndContinue={excludeTiktokAndContinue}
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
        progress={publishProgress}
        progressLabel={publishProgressLabel}
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
        onCloseEmptyContentWarnings={closeEmptyContentWarnings}
        onValidateEmptyContentWarning={onValidateEmptyContentWarning}
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
        publicationInstruction={publicationInstruction}
        setPublicationInstruction={setPublicationInstruction}
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
        generationNotice={generationNotice}
        generating={generating}
        generationStage={generationStage}
        generationProgress={generationProgress}
        aiPreferredEngine={selectedAiPreferredEngine}
        defaultAiPreferredEngine={defaultAiPreferredEngine}
        onAiPreferredEngineChange={(engine) =>
          setSelectedAiPreferredEngine(normalizeAiPreferredEngine(engine))
        }
        onGenerate={onGenerate}
        onReset={onReset}
        onCreateManually={onCreateManually}
        onOpenAiConfiguration={() => setAiConfigurationOpen(true)}
      />

      {contentWorkspaceOpen ? (
        <>
          <div
            ref={contentWorkspaceRef}
            style={{ display: "grid", gap: 12, minWidth: 0 }}
          >
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
            />

            <PublishImagesPanel
              styles={styles}
              isMobile={isMobile}
              publicationMediaType={publicationMediaType}
              channelMediaModes={channelMediaModes}
              setChannelMediaMode={setChannelMediaMode}
              onRemoveMediaFromChannel={removeVideoFromChannel}
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
              removeVideo={removeVideo}
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
          </div>

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
                  backgroundColor: undefined,
                  blurBackground: false,
                  fit: "contain",
                  zoom: 1,
                  offsetX: 0,
                  offsetY: 0,
                }
              : {
                  backgroundMode: mode,
                  backgroundColor:
                    mode === "black"
                      ? "#0d1320"
                      : mode === "white"
                        ? "#ffffff"
                        : activeEditorTransform.backgroundColor ||
                          (getChannelSafetyBackgroundMode(activeImageChannel) === "black"
                            ? "#0d1320"
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
        </>
      ) : null}
    </div>
  );
}
