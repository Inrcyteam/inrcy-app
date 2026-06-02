import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import { requestBoosterVideoStorageCleanup, requestBoosterVideoTransforms } from "@/lib/boosterVideoTransformClient";
import { buildVideoTransformSignature } from "@/lib/boosterVideoTransforms";
import {
  buildVideoSettingsByChannel,
  getRecommendedVideoFormatForSource,
  getVideoFormatLabel,
  normalizeVideoAdaptationMode,
  normalizeVideoFormat,
  uploadBoosterVideo,
  VIDEO_ADAPTATION_MODE_LABELS,
  type BoosterVideoSourceMetadata,
  type ChannelKey,
  type ChannelMediaMode,
  type VideoAdaptationMode,
  type VideoFormat,
  type VideoPayload,
} from "./publishModal.shared";

export type VideoVariantPreparationStatus = "idle" | "preparing" | "ready" | "error";

export type VideoVariantPreparationState = {
  status: VideoVariantPreparationStatus;
  label: string;
  detail?: string;
};

type VideoSettingsByChannel = Partial<
  Record<ChannelKey, { format: VideoFormat; adaptationMode: VideoAdaptationMode }>
>;

type UsePublishVideoControllerParams = {
  allChannels: readonly ChannelKey[];
  selectedChannels: readonly ChannelKey[];
  setImgError: Dispatch<SetStateAction<string>>;
  setPublishProgress: Dispatch<SetStateAction<number>>;
  setPublishProgressLabel: Dispatch<SetStateAction<string>>;
};

export function normalizeRestoredVideoVariants(
  raw: unknown,
): NonNullable<VideoPayload["transformedVariants"]> {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .filter((variant: any) => {
      const signature = String(variant?.signature || "").trim();
      const publicUrl = String(variant?.publicUrl || variant?.url || "").trim();
      const storagePath = String(variant?.storagePath || "").trim();
      return Boolean(signature && publicUrl && storagePath);
    })
    .map((variant: any) => ({
      ...variant,
      publicUrl: String(variant.publicUrl || variant.url || ""),
      storagePath: String(variant.storagePath || ""),
      contentType: String(variant.contentType || variant.type || "video/mp4"),
      size: Number(variant.size || 0),
      duration: Number.isFinite(Number(variant.duration))
        ? Number(variant.duration)
        : null,
      generatedAt: String(variant.generatedAt || new Date().toISOString()),
    }))
    .filter((variant: any) => {
      if (seen.has(variant.signature)) return false;
      seen.add(variant.signature);
      return true;
    }) as NonNullable<VideoPayload["transformedVariants"]>;
}

export default function usePublishVideoController({
  allChannels,
  selectedChannels,
  setImgError,
  setPublishProgress,
  setPublishProgressLabel,
}: UsePublishVideoControllerParams) {
  const [videoFormatByChannel, setVideoFormatByChannel] = useState<
    Partial<Record<ChannelKey, VideoFormat>>
  >({});
  const [videoAdaptationModeByChannel, setVideoAdaptationModeByChannel] =
    useState<Partial<Record<ChannelKey, VideoAdaptationMode>>>({});
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState("");
  const [videoDurationSeconds, setVideoDurationSeconds] = useState<number | null>(null);
  const [videoSourceMetadata, setVideoSourceMetadata] =
    useState<BoosterVideoSourceMetadata | null>(null);
  const [videoStorageContext, setVideoStorageContext] = useState<Pick<
    VideoPayload,
    "storagePath" | "publicUrl" | "url"
  > | null>(null);
  const [videoVariantPreparationByChannel, setVideoVariantPreparationByChannel] =
    useState<Partial<Record<ChannelKey, VideoVariantPreparationState>>>({});
  const [videoTransformedVariants, setVideoTransformedVariants] = useState<
    NonNullable<VideoPayload["transformedVariants"]>
  >([]);
  const [videoPreviewVariantsPreparing, setVideoPreviewVariantsPreparing] = useState(false);

  const videoSettingsByChannel = useMemo(
    () =>
      buildVideoSettingsByChannel({
        channels: selectedChannels.length ? selectedChannels : allChannels,
        videoFormatByChannel,
        videoAdaptationModeByChannel,
        sourceMetadata: videoSourceMetadata,
      }),
    [
      allChannels,
      selectedChannels,
      videoFormatByChannel,
      videoAdaptationModeByChannel,
      videoSourceMetadata,
    ],
  );

  const clearVideoVariantPreparationForChannel = (channel: ChannelKey) => {
    setVideoVariantPreparationByChannel((prev) => {
      if (!prev[channel]) return prev;
      const next = { ...prev };
      delete next[channel];
      return next;
    });
  };

  const clearPreparedVideoVariantsForChannel = (channel: ChannelKey) => {
    const currentSettings = videoSettingsByChannel[channel];
    if (!currentSettings) return;
    const signature = buildVideoTransformSignature(
      currentSettings.format,
      currentSettings.adaptationMode,
    );
    setVideoTransformedVariants((prev) =>
      prev.filter(
        (variant) => variant.signature !== signature && variant.channel !== channel,
      ),
    );
  };

  const setVideoFormatForChannel = (channel: ChannelKey, format: VideoFormat) => {
    setVideoFormatByChannel((prev) => ({
      ...prev,
      [channel]: normalizeVideoFormat(channel, format),
    }));
    // Changer de bulle choisit seulement un format en attente : on ne supprime pas
    // la variante déjà appliquée, qui reste le format vert réellement publié.
    clearVideoVariantPreparationForChannel(channel);
  };

  const setVideoAdaptationModeForChannel = (
    channel: ChannelKey,
    mode: VideoAdaptationMode,
  ) => {
    setVideoAdaptationModeByChannel((prev) => ({
      ...prev,
      [channel]: normalizeVideoAdaptationMode(mode),
    }));
    // Même logique : l'adaptation choisie devient une intention, pas une transformation.
    clearVideoVariantPreparationForChannel(channel);
  };

  async function uploadPublicationDraftVideo(): Promise<VideoPayload | null> {
    if (!videoFile) return null;
    return await uploadBoosterVideo(videoFile, {
      folder: "booster-drafts",
      duration: videoDurationSeconds,
      sourceMetadata: videoSourceMetadata,
    });
  }

  async function uploadPublicationVideoForPublish(): Promise<VideoPayload | null> {
    if (!videoFile) return null;
    return await uploadBoosterVideo(videoFile, {
      folder: "booster-videos",
      duration: videoDurationSeconds,
      sourceMetadata: videoSourceMetadata,
    });
  }

  function buildStoredVideoPayloadForTransforms(): VideoPayload | null {
    const publicUrl = String(videoStorageContext?.publicUrl || videoStorageContext?.url || "").trim();
    const storagePath = String(videoStorageContext?.storagePath || "").trim();
    if (!publicUrl && !storagePath) return null;
    return {
      name: videoFile?.name || "video-inrcy.mp4",
      type: videoFile?.type || "video/mp4",
      size: videoFile?.size || videoSourceMetadata?.size || 0,
      lastModified: videoFile?.lastModified || Date.now(),
      duration: videoDurationSeconds,
      sourceMetadata: videoSourceMetadata,
      storagePath,
      publicUrl,
      url: publicUrl,
      transformedVariants: videoTransformedVariants,
    };
  }

  function buildCurrentVideoStorageCleanupPayload(): VideoPayload | null {
    const publicUrl = String(videoStorageContext?.publicUrl || videoStorageContext?.url || "").trim();
    const storagePath = String(videoStorageContext?.storagePath || "").trim();
    const hasVariants = videoTransformedVariants.length > 0;
    if (!publicUrl && !storagePath && !hasVariants) return null;
    return {
      name: videoFile?.name || "video-inrcy.mp4",
      type: videoFile?.type || "video/mp4",
      size: videoFile?.size || videoSourceMetadata?.size || 0,
      lastModified: videoFile?.lastModified || Date.now(),
      duration: videoDurationSeconds,
      sourceMetadata: videoSourceMetadata,
      storagePath,
      publicUrl,
      url: publicUrl,
      transformedVariants: videoTransformedVariants,
    };
  }

  function cleanupVideoStorageBestEffort(payloads: unknown[], reason: string) {
    const cleanPayloads = payloads.filter(Boolean);
    if (!cleanPayloads.length) return;
    requestBoosterVideoStorageCleanup({ payloads: cleanPayloads }).catch((cleanupError) => {
      console.warn(`[Booster] video cleanup skipped (${reason})`, cleanupError);
    });
  }

  function cleanupObsoleteVideoVariantsBestEffort(
    previousVariants: NonNullable<VideoPayload["transformedVariants"]>,
    keptVariants: NonNullable<VideoPayload["transformedVariants"]>,
    reason: string,
  ) {
    if (!previousVariants.length) return;
    const keptPaths = new Set(
      keptVariants.map((variant) => String(variant.storagePath || "")).filter(Boolean),
    );
    const obsoleteVariants = previousVariants.filter((variant) => {
      const path = String(variant.storagePath || "").trim();
      return path && !keptPaths.has(path);
    });
    if (!obsoleteVariants.length) return;
    cleanupVideoStorageBestEffort(
      [{ mediaType: "video", transformedVariants: obsoleteVariants }],
      reason,
    );
  }

  async function ensureVideoSourceUploadedForTransforms(): Promise<VideoPayload | null> {
    const existing = buildStoredVideoPayloadForTransforms();
    if (existing?.publicUrl || existing?.url) return existing;
    const uploaded = await uploadPublicationVideoForPublish();
    if (uploaded?.publicUrl || uploaded?.url) {
      setVideoStorageContext({
        storagePath: uploaded.storagePath || "",
        publicUrl: uploaded.publicUrl || uploaded.url || "",
        url: uploaded.url || uploaded.publicUrl || "",
      });
    }
    return uploaded;
  }

  async function buildPublicationDraftVideoPayload(): Promise<VideoPayload | null> {
    if (!videoFile) return null;
    const stored = buildStoredVideoPayloadForTransforms();
    const base = stored?.publicUrl || stored?.url ? stored : await uploadPublicationDraftVideo();
    if (!base) return null;
    return {
      ...base,
      sourceMetadata: base.sourceMetadata || videoSourceMetadata,
      transformedVariants: normalizeRestoredVideoVariants([
        ...(Array.isArray(base.transformedVariants) ? base.transformedVariants : []),
        ...videoTransformedVariants,
      ]),
    };
  }

  function buildRequiredVideoTransformVariants(
    channels: readonly ChannelKey[],
    mediaModeByChannel: Partial<Record<ChannelKey, ChannelMediaMode>>,
    settingsByChannel: VideoSettingsByChannel = videoSettingsByChannel,
  ) {
    const seen = new Set<string>();
    return channels.flatMap((channel) => {
      if (mediaModeByChannel[channel] !== "video") return [];
      const settings = settingsByChannel[channel];
      if (!settings) return [];
      const signature = `${settings.format}:${settings.adaptationMode}`;
      if (seen.has(signature)) return [];
      seen.add(signature);
      return [
        {
          key: `${channel}-${settings.format}-${settings.adaptationMode}`,
          channel,
          format: settings.format,
          adaptationMode: settings.adaptationMode,
        },
      ];
    });
  }

  function buildVideoPreparationStateFromVariants(params: {
    channels: readonly ChannelKey[];
    mediaModeByChannel: Partial<Record<ChannelKey, ChannelMediaMode>>;
    variants: NonNullable<VideoPayload["transformedVariants"]>;
    settingsByChannel?: VideoSettingsByChannel;
  }): Partial<Record<ChannelKey, VideoVariantPreparationState>> {
    const { channels, mediaModeByChannel, variants, settingsByChannel } = params;
    if (!variants.length) return {};

    return channels.reduce((acc, channel) => {
      if (mediaModeByChannel[channel] !== "video") return acc;
      const settings = settingsByChannel?.[channel] || videoSettingsByChannel[channel];
      if (!settings) return acc;
      const signature = buildVideoTransformSignature(settings.format, settings.adaptationMode);
      const found = variants.find((variant) => variant.signature === signature);
      if (!found?.publicUrl) return acc;
      const formatLabel = getVideoFormatLabel(channel, settings.format, videoSourceMetadata);
      const adaptationLabel = VIDEO_ADAPTATION_MODE_LABELS[settings.adaptationMode as VideoAdaptationMode];
      acc[channel] = {
        status: "ready",
        label: "Format appliqué",
        detail: `${formatLabel} · ${adaptationLabel} · conservé du brouillon`,
      };
      return acc;
    }, {} as Partial<Record<ChannelKey, VideoVariantPreparationState>>);
  }

  async function preparePublicationVideoVariants(
    baseVideo: VideoPayload | null,
    channels: readonly ChannelKey[],
    mediaModeByChannel: Partial<Record<ChannelKey, ChannelMediaMode>>,
    options?: {
      previewOnly?: boolean;
      settingsByChannel?: VideoSettingsByChannel;
    },
  ): Promise<VideoPayload | null> {
    if (!baseVideo) return null;

    const effectiveVideoSettingsByChannel = options?.settingsByChannel || videoSettingsByChannel;
    const videoChannels = channels.filter(
      (channel) => mediaModeByChannel[channel] === "video",
    );
    const variants = buildRequiredVideoTransformVariants(
      channels,
      mediaModeByChannel,
      effectiveVideoSettingsByChannel,
    );
    if (!variants.length) return baseVideo;

    const requiredSignatures = new Set(
      variants
        .map((variant) =>
          variant.format && variant.adaptationMode
            ? buildVideoTransformSignature(variant.format, variant.adaptationMode)
            : "",
        )
        .filter(Boolean),
    );
    const allExistingVariants = [
      ...(Array.isArray(baseVideo.transformedVariants) ? baseVideo.transformedVariants : []),
      ...videoTransformedVariants,
    ];
    const existingVariants = allExistingVariants.filter((variant) =>
      requiredSignatures.has(String(variant.signature || "")),
    );
    cleanupObsoleteVideoVariantsBestEffort(
      allExistingVariants,
      existingVariants,
      "obsolete-video-variants",
    );

    // Sécurité prod : pendant une publication, on ne lance JAMAIS une adaptation vidéo automatique.
    // FFmpeg doit uniquement être appelé quand le pro clique explicitement sur
    // "Appliquer ce format" / "Appliquer ce format à tous les canaux".
    // Si aucune modification n'a été demandée, la vidéo originale est publiée telle quelle.
    if (!options?.previewOnly) {
      return { ...baseVideo, transformedVariants: existingVariants };
    }

    const existingSignatures = new Set(
      existingVariants.map((variant) => variant.signature).filter(Boolean),
    );
    const variantsToGenerate = variants.filter(
      (variant) =>
        !existingSignatures.has(
          variant.format && variant.adaptationMode
            ? buildVideoTransformSignature(variant.format, variant.adaptationMode)
            : "",
        ),
    );

    const preparingState = Object.fromEntries(
      videoChannels.map((channel) => {
        const settings = effectiveVideoSettingsByChannel[channel];
        const formatLabel = settings
          ? getVideoFormatLabel(channel, settings.format, videoSourceMetadata)
          : "Format vidéo";
        const adaptationMode = settings?.adaptationMode as VideoAdaptationMode | undefined;
        const adaptationLabel = adaptationMode
          ? VIDEO_ADAPTATION_MODE_LABELS[adaptationMode]
          : "Adaptation vidéo";
        return [
          channel,
          {
            status: "preparing" as const,
            label: "Modification du format...",
            detail: `${formatLabel} · ${adaptationLabel}`,
          },
        ];
      }),
    ) as Partial<Record<ChannelKey, VideoVariantPreparationState>>;

    setVideoVariantPreparationByChannel((prev) => ({
      ...prev,
      ...preparingState,
    }));
    if (!options?.previewOnly) {
      setPublishProgress((prev) => Math.max(prev, 58));
      setPublishProgressLabel(
        variants.length > 1
          ? `Modification des ${variants.length} formats vidéo...`
          : "Modification du format vidéo...",
      );
    }

    if (!variantsToGenerate.length) {
      const readyState = Object.fromEntries(
        videoChannels.map((channel) => {
          const settings = effectiveVideoSettingsByChannel[channel];
          const formatLabel = settings
            ? getVideoFormatLabel(channel, settings.format, videoSourceMetadata)
            : "Format vidéo";
          const adaptationMode = settings?.adaptationMode as VideoAdaptationMode | undefined;
          const adaptationLabel = adaptationMode
            ? VIDEO_ADAPTATION_MODE_LABELS[adaptationMode]
            : "Adaptation vidéo";
          return [
            channel,
            {
              status: "ready" as const,
              label: "Format appliqué",
              detail: `${formatLabel} · ${adaptationLabel}`,
            },
          ];
        }),
      ) as Partial<Record<ChannelKey, VideoVariantPreparationState>>;
      setVideoVariantPreparationByChannel((prev) => ({ ...prev, ...readyState }));
      setVideoTransformedVariants(existingVariants);
      if (options?.previewOnly) setImgError("");
      return { ...baseVideo, transformedVariants: existingVariants };
    }

    try {
      const response = await requestBoosterVideoTransforms({
        source: {
          storagePath: baseVideo.storagePath,
          publicUrl: baseVideo.publicUrl || baseVideo.url,
          url: baseVideo.url,
          name: baseVideo.name,
          type: baseVideo.type,
          size: baseVideo.size,
          duration: baseVideo.duration,
          sourceMetadata: baseVideo.sourceMetadata || videoSourceMetadata,
        },
        variants: variantsToGenerate,
      });

      const transformedVariants = [
        ...existingVariants,
        ...(Array.isArray(response.variants) ? response.variants : []),
      ];
      if (!transformedVariants.length && !response.ok) {
        const fallbackDetail =
          "Adaptation automatique indisponible : la vidéo originale sera publiée.";
        setVideoVariantPreparationByChannel((prev) => ({
          ...prev,
          ...Object.fromEntries(
            videoChannels.map((channel) => [
              channel,
              {
                status: "ready" as const,
                label: "Vidéo originale conservée",
                detail: fallbackDetail,
              },
            ]),
          ),
        }));
        setVideoTransformedVariants(existingVariants);
        if (options?.previewOnly) setImgError("");
        if (!options?.previewOnly) {
          setPublishProgressLabel(
            "Adaptation vidéo indisponible : publication de la vidéo originale.",
          );
        }
        return { ...baseVideo, transformedVariants: existingVariants };
      }

      const responseErrors = Array.isArray(response.errors) ? response.errors : [];
      const nextState = Object.fromEntries(
        videoChannels.map((channel) => {
          const settings = effectiveVideoSettingsByChannel[channel];
          if (!settings) {
            return [
              channel,
              { status: "error" as const, label: "Réglage vidéo incomplet" },
            ];
          }

          const signature = buildVideoTransformSignature(
            settings.format,
            settings.adaptationMode,
          );
          const foundVariant = transformedVariants.find(
            (variant) => variant.signature === signature,
          );
          const formatLabel = getVideoFormatLabel(channel, settings.format, videoSourceMetadata);
          const adaptationMode = settings.adaptationMode as VideoAdaptationMode;
          const adaptationLabel = VIDEO_ADAPTATION_MODE_LABELS[adaptationMode];

          if (foundVariant?.publicUrl) {
            return [
              channel,
              {
                status: "ready" as const,
                label: "Format appliqué",
                detail: `${formatLabel} · ${adaptationLabel}`,
              },
            ];
          }

          return [
            channel,
            {
              status: "ready" as const,
              label: "Vidéo originale conservée",
              detail:
                "Adaptation automatique indisponible : la vidéo originale sera publiée.",
            },
          ];
        }),
      ) as Partial<Record<ChannelKey, VideoVariantPreparationState>>;

      setVideoVariantPreparationByChannel((prev) => ({
        ...prev,
        ...nextState,
      }));
      setVideoTransformedVariants(transformedVariants);
      if (options?.previewOnly && !responseErrors.length) setImgError("");

      if (responseErrors.length) {
        setPublishProgressLabel(
          "Adaptation vidéo indisponible : publication de la vidéo originale.",
        );
      }

      return {
        ...baseVideo,
        transformedVariants,
      };
    } catch (error) {
      const fallbackDetail =
        "Adaptation automatique indisponible : la vidéo originale sera publiée.";
      setVideoVariantPreparationByChannel((prev) => ({
        ...prev,
        ...Object.fromEntries(
          videoChannels.map((channel) => [
            channel,
            {
              status: "ready" as const,
              label: "Vidéo originale conservée",
              detail: fallbackDetail,
            },
          ]),
        ),
      }));
      setVideoTransformedVariants(existingVariants);
      if (options?.previewOnly) setImgError("");
      if (!options?.previewOnly) {
        setPublishProgressLabel(
          "Adaptation vidéo indisponible : publication de la vidéo originale.",
        );
      }
      return { ...baseVideo, transformedVariants: existingVariants };
    }
  }

  async function applyVideoFormatsForChannels(params: {
    channels: ChannelKey[];
    mediaModeByChannel: Partial<Record<ChannelKey, ChannelMediaMode>>;
    settingsByChannel?: VideoSettingsByChannel;
  }) {
    if (videoPreviewVariantsPreparing) return;
    const videoChannels = params.channels.filter(
      (channel) => params.mediaModeByChannel[channel] === "video",
    );
    if (!videoChannels.length) {
      setImgError("Sélectionnez au moins un canal en mode vidéo.");
      return;
    }

    try {
      setImgError("");
      setVideoPreviewVariantsPreparing(true);
      const baseVideo = await ensureVideoSourceUploadedForTransforms();
      if (!baseVideo?.publicUrl && !baseVideo?.url) {
        throw new Error("La vidéo source n’a pas pu être chargée.");
      }
      await preparePublicationVideoVariants(
        baseVideo,
        videoChannels,
        params.mediaModeByChannel,
        { previewOnly: true, settingsByChannel: params.settingsByChannel },
      );
    } catch (error) {
      setImgError(
        getSimpleFrenchErrorMessage(
          error,
          "Les formats vidéo n’ont pas pu être modifiés.",
        ),
      );
    } finally {
      setVideoPreviewVariantsPreparing(false);
    }
  }

  function clearVideoMediaState(options?: { cleanupStorage?: boolean; reason?: string }) {
    if (options?.cleanupStorage) {
      const cleanupPayload = buildCurrentVideoStorageCleanupPayload();
      if (cleanupPayload) {
        cleanupVideoStorageBestEffort(
          [cleanupPayload],
          options.reason || "clear-video",
        );
      }
    }

    setVideoPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
    setVideoFile(null);
    setVideoDurationSeconds(null);
    setVideoSourceMetadata(null);
    setVideoStorageContext(null);
    setVideoVariantPreparationByChannel({});
    setVideoTransformedVariants([]);
    setVideoPreviewVariantsPreparing(false);
  }

  function applyDefaultVideoSettingsForSource(sourceMetadata: BoosterVideoSourceMetadata | null) {
    setVideoFormatByChannel((prev) => {
      const next: Partial<Record<ChannelKey, VideoFormat>> = { ...prev };
      for (const channel of selectedChannels.length ? selectedChannels : allChannels) {
        next[channel] = getRecommendedVideoFormatForSource(channel, sourceMetadata);
      }
      return next;
    });
    setVideoAdaptationModeByChannel((prev) => {
      const next: Partial<Record<ChannelKey, VideoAdaptationMode>> = { ...prev };
      for (const channel of selectedChannels.length ? selectedChannels : allChannels) {
        next[channel] = normalizeVideoAdaptationMode(next[channel] || "safe_blur");
      }
      return next;
    });
  }

  return {
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
    setVideoPreviewVariantsPreparing,
    videoSettingsByChannel,
    clearVideoVariantPreparationForChannel,
    clearPreparedVideoVariantsForChannel,
    setVideoFormatForChannel,
    setVideoAdaptationModeForChannel,
    buildStoredVideoPayloadForTransforms,
    buildCurrentVideoStorageCleanupPayload,
    cleanupVideoStorageBestEffort,
    cleanupObsoleteVideoVariantsBestEffort,
    ensureVideoSourceUploadedForTransforms,
    uploadPublicationVideoForPublish,
    buildPublicationDraftVideoPayload,
    buildRequiredVideoTransformVariants,
    buildVideoPreparationStateFromVariants,
    preparePublicationVideoVariants,
    applyVideoFormatsForChannels,
    clearVideoMediaState,
    applyDefaultVideoSettingsForSource,
  };
}
