import type { MutableRefObject } from "react";
import { buildVideoTransformSignature, type BoosterVideoTransformedVariant } from "@/lib/boosterVideoTransforms";
import { ChannelImageAdapterCardsPanel } from "@/app/dashboard/_components/ChannelImageAdapterTool";
import BoosterVideoFormatManager from "./BoosterVideoFormatManager";
import {
  BOOSTER_MAX_IMAGE_COUNT,
  BOOSTER_MAX_MEDIA_MB_LABEL,
  BOOSTER_RECOMMENDED_VIDEO_DURATION_LABEL,
  BOOSTER_MAX_VIDEO_MB_LABEL,
  CHANNEL_PRESETS,
  VIDEO_ADAPTATION_MODE_LABELS,
  VIDEO_FORMAT_ASPECT_RATIOS,
  VIDEO_FORMAT_OPTIONS_BY_CHANNEL,
  VIDEO_RECOMMENDED_FORMAT_BY_CHANNEL,
  getBackgroundMode,
  getOptimizedTransform,
  getRecommendedVideoFormatForSource,
  type ChannelImageEditorState,
  type ChannelKey,
  type ImageMeta,
  type PublicationMediaType,
  type ChannelMediaMode,
  type VideoAdaptationMode,
  type BoosterVideoSourceMetadata,
  type VideoFormat,
} from "../publishModal.shared";
import { pillBtn, pillBtnActive } from "../publishModal.styles";

type PublishModalStyles = Readonly<Record<string, string>>;

function MediaModeGlyph({ mode, size = 14 }: { mode: ChannelMediaMode; size?: number }) {
  if (mode === "video") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flex: "0 0 auto" }}>
        <rect x="4" y="7" width="11" height="10" rx="2.2" />
        <path d="M15 10.2 20 7.8v8.4l-5-2.4z" />
      </svg>
    );
  }
  if (mode === "images") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flex: "0 0 auto" }}>
        <rect x="4" y="6" width="16" height="12" rx="2.2" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="m7 17 4.2-4.2 2.7 2.7 1.6-1.6L20 18" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flex: "0 0 auto" }}>
      <circle cx="12" cy="12" r="8" />
      <path d="m8 8 8 8" />
    </svg>
  );
}

function formatVideoSeconds(seconds: number | null) {
  if (!Number.isFinite(Number(seconds))) return "";
  const safeSeconds = Math.max(0, Math.round(Number(seconds)));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatVideoBytes(bytes: number | null | undefined) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "Poids inconnu";
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} Mo`;
  if (value >= 1024) return `${Math.round(value / 1024)} Ko`;
  return `${Math.round(value)} o`;
}

function getVideoSourceSummary(meta: BoosterVideoSourceMetadata | null | undefined, fallbackDuration: number | null, fallbackSize?: number) {
  const duration = formatVideoSeconds(meta?.duration ?? fallbackDuration ?? null);
  const dimension = meta?.width && meta?.height ? `${meta.width}×${meta.height}` : "Dimensions inconnues";
  const orientation = meta?.orientationLabel || "Orientation inconnue";
  const ratio = meta?.ratioLabel && meta.ratioLabel !== "Ratio inconnu" ? meta.ratioLabel : null;
  const size = formatVideoBytes(meta?.size || fallbackSize || 0);
  return [orientation, ratio, dimension, duration ? duration : null, size].filter(Boolean).join(" · ");
}

function getCompactChannelLabel(channel: ChannelKey, label: string) {
  if (channel === "gmb") return "Google";
  return label;
}

function getVideoFormatOptionLabel(channel: ChannelKey, format: VideoFormat) {
  const base = format === "original" ? "Original" : format.replace("_", ":");
  return format === VIDEO_RECOMMENDED_FORMAT_BY_CHANNEL[channel] ? `${base} recommandé` : base;
}


function getVideoPreviewAspectRatio(format: VideoFormat, metadata?: BoosterVideoSourceMetadata | null) {
  if (format === "original" && metadata?.width && metadata?.height) {
    return `${metadata.width} / ${metadata.height}`;
  }
  return VIDEO_FORMAT_ASPECT_RATIOS[format] || "16 / 9";
}

function getVideoFrameWidth(params: {
  format: VideoFormat;
  metadata?: BoosterVideoSourceMetadata | null;
  isMobile: boolean;
}) {
  const { format, metadata, isMobile } = params;
  const orientation = metadata?.orientation || "unknown";

  if (format === "9_16") return isMobile ? "min(68vw, 202px)" : "190px";
  if (format === "1_1") return isMobile ? "min(82vw, 268px)" : "260px";
  if (format === "16_9") return isMobile ? "min(92vw, 360px)" : "348px";

  if (orientation === "vertical") return isMobile ? "min(68vw, 202px)" : "190px";
  if (orientation === "square") return isMobile ? "min(82vw, 268px)" : "260px";
  return isMobile ? "min(92vw, 360px)" : "348px";
}


type ImageAdapterTab = {
  key: ChannelKey;
  label: string;
  count: number;
  tone: "ready" | "warning";
};

type VideoVariantPreparationState = {
  status: "idle" | "preparing" | "ready" | "error";
  label: string;
  detail?: string;
};

type PublishImagesPanelProps = {
  styles: PublishModalStyles;
  isMobile: boolean;
  publicationMediaType: PublicationMediaType;
  channelMediaModes: Partial<Record<ChannelKey, ChannelMediaMode>>;
  setChannelMediaMode: (channel: ChannelKey, mode: ChannelMediaMode) => void;
  videoFormatByChannel: Partial<Record<ChannelKey, VideoFormat>>;
  setVideoFormatForChannel: (channel: ChannelKey, format: VideoFormat) => void;
  videoAdaptationModeByChannel: Partial<Record<ChannelKey, VideoAdaptationMode>>;
  setVideoAdaptationModeForChannel: (channel: ChannelKey, mode: VideoAdaptationMode) => void;
  images: File[];
  videoFile: File | null;
  videoPreviewUrl: string;
  videoDurationSeconds: number | null;
  videoSourceMetadata: BoosterVideoSourceMetadata | null;
  videoVariantPreparationByChannel?: Partial<Record<ChannelKey, VideoVariantPreparationState>>;
  videoTransformedVariants?: BoosterVideoTransformedVariant[];
  videoPreviewVariantsPreparing?: boolean;
  onApplyVideoFormatForChannel?: (channel: ChannelKey) => void;
  onApplyVideoFormatToAllChannels?: (channel: ChannelKey) => void;
  imgError: string;
  selectedChannels: ChannelKey[];
  activeImageChannel: ChannelKey;
  imageAdapterTabs: ImageAdapterTab[];
  imageKeys: string[];
  channelImageEditors: Partial<Record<ChannelKey, ChannelImageEditorState>>;
  imageMetaByKey: Record<string, ImageMeta>;
  previewByKey: Record<string, string>;
  previewAspectRatio: string;
  getImageAdapterLabel: (channel: ChannelKey) => string;
  setSynchronizedActiveChannel: (channel: ChannelKey) => void;
  onPickImagesClick: () => void;
  onPickVideoClick: () => void;
  onTakePhotoClick: (preferredChannel?: ChannelKey) => void;
  onImagesChange: (
    files: FileList | null,
    preferredChannel?: ChannelKey,
  ) => void;
  removeVideo: () => void;
  gmbFileInputRef: MutableRefObject<HTMLInputElement | null>;
  setImgError: (message: string) => void;
  toggleChannelImage: (channel: ChannelKey, imageKey: string) => void;
  openImageEditor: (channel: ChannelKey, imageKey: string) => void;
  resetChannelImage: (channel: ChannelKey, imageKey: string) => void;
  removeImage: (index: number) => void;
  moveChannelImage: (
    channel: ChannelKey,
    imageKey: string,
    direction: -1 | 1,
  ) => void;
};

export default function PublishImagesPanel({
  styles,
  isMobile,
  publicationMediaType: _publicationMediaType,
  channelMediaModes,
  setChannelMediaMode,
  videoFormatByChannel,
  setVideoFormatForChannel,
  videoAdaptationModeByChannel,
  setVideoAdaptationModeForChannel,
  images,
  videoFile,
  videoPreviewUrl,
  videoDurationSeconds,
  videoSourceMetadata,
  videoVariantPreparationByChannel = {},
  videoTransformedVariants = [],
  videoPreviewVariantsPreparing = false,
  onApplyVideoFormatForChannel,
  onApplyVideoFormatToAllChannels,
  imgError,
  selectedChannels,
  activeImageChannel,
  imageAdapterTabs,
  imageKeys,
  channelImageEditors,
  imageMetaByKey,
  previewByKey,
  previewAspectRatio,
  getImageAdapterLabel,
  setSynchronizedActiveChannel,
  onPickImagesClick,
  onPickVideoClick,
  onTakePhotoClick,
  onImagesChange,
  removeVideo,
  gmbFileInputRef,
  setImgError,
  toggleChannelImage,
  openImageEditor,
  resetChannelImage,
  removeImage,
  moveChannelImage,
}: PublishImagesPanelProps) {
  const hasImages = images.length > 0;
  const hasVideoMedia = Boolean(videoFile || videoPreviewUrl);
  const imagesLimitReached = images.length >= BOOSTER_MAX_IMAGE_COUNT;
  const pickImagesDisabled = imagesLimitReached;
  const pickVideoDisabled = hasVideoMedia;
  const cameraDisabled = !isMobile || imagesLimitReached;
  const activeMode: ChannelMediaMode =
    channelMediaModes[activeImageChannel] ||
    (hasVideoMedia ? "video" : hasImages ? "images" : "none");
  const activeImageKeys = channelImageEditors[activeImageChannel]?.imageKeys || [];
  const activeMediaCount =
    activeMode === "video" && hasVideoMedia
      ? 1
      : activeMode === "images"
        ? activeImageKeys.length
        : 0;
  const activeVideoFormat =
    videoFormatByChannel[activeImageChannel] ||
    getRecommendedVideoFormatForSource(activeImageChannel, videoSourceMetadata);
  const activeVideoAdaptationMode =
    videoAdaptationModeByChannel[activeImageChannel] || "safe_blur";
  const activeVideoAspectRatio = getVideoPreviewAspectRatio(activeVideoFormat, videoSourceMetadata);
  const videoFormatOptions = VIDEO_FORMAT_OPTIONS_BY_CHANNEL[activeImageChannel] || ["original"];
  const videoSourceSummary = getVideoSourceSummary(videoSourceMetadata, videoDurationSeconds, videoFile?.size || 0);
  const videoTechnicalDetails = [
    videoSourceMetadata?.width && videoSourceMetadata?.height
      ? `Résolution ${videoSourceMetadata.width} × ${videoSourceMetadata.height}`
      : null,
    videoSourceMetadata?.ratioLabel && videoSourceMetadata.ratioLabel !== "Ratio inconnu"
      ? `Ratio ${videoSourceMetadata.ratioLabel}`
      : null,
    videoSourceMetadata?.orientationLabel
      ? `Source ${videoSourceMetadata.orientationLabel.toLowerCase()}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const isHorizontalSource = videoSourceMetadata?.orientation === "horizontal";
  const isVerticalDestination = activeVideoFormat === "9_16";
  const activeVideoPreparation = videoVariantPreparationByChannel[activeImageChannel];
  const activeVideoSignature = buildVideoTransformSignature(
    activeVideoFormat,
    activeVideoAdaptationMode,
  );
  const activeVideoPreparedVariant = videoTransformedVariants.find(
    (variant) => variant.signature === activeVideoSignature,
  );
  const activeVideoDisplayUrl = String(activeVideoPreparedVariant?.publicUrl || "").trim() || videoPreviewUrl;
  const activeVideoIsApplied = Boolean(activeVideoPreparedVariant?.publicUrl);
  const activeVideoFrameWidth = getVideoFrameWidth({
    format: activeVideoFormat,
    metadata: videoSourceMetadata,
    isMobile,
  });
  const activeVideoUsesSafeBlurPreview =
    !activeVideoIsApplied &&
    activeVideoAdaptationMode === "safe_blur" &&
    activeVideoFormat !== "original";
  const activeVideoSourceIsWiderThanFrame = (() => {
    const width = Number(videoSourceMetadata?.width || 0);
    const height = Number(videoSourceMetadata?.height || 0);
    const sourceRatio = width > 0 && height > 0 ? width / height : 16 / 9;
    const targetRatio = VIDEO_FORMAT_ASPECT_RATIOS[activeVideoFormat] || "16 / 9";
    const [targetWidth, targetHeight] = targetRatio
      .split("/")
      .map((part) => Number(part.trim()))
      .filter((value) => Number.isFinite(value) && value > 0);
    const frameRatio = targetWidth && targetHeight ? targetWidth / targetHeight : sourceRatio;
    return sourceRatio >= frameRatio;
  })();

  const getPreparationTone = (state?: VideoVariantPreparationState) => {
    if (state?.status === "ready") return { icon: "✅", color: "#bbf7d0", border: "rgba(34,197,94,0.28)", background: "rgba(34,197,94,0.10)" };
    if (state?.status === "preparing") return { icon: "⏳", color: "#bfdbfe", border: "rgba(96,165,250,0.30)", background: "rgba(59,130,246,0.12)" };
    if (state?.status === "error") return { icon: "⚠️", color: "#fecaca", border: "rgba(248,113,113,0.28)", background: "rgba(248,113,113,0.10)" };
    return { icon: "⚙️", color: "rgba(226,232,240,0.76)", border: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.055)" };
  };

  const getModeForChannel = (channel: ChannelKey): ChannelMediaMode =>
    channelMediaModes[channel] ||
    (hasVideoMedia ? "video" : hasImages ? "images" : "none");

  const getMediaCountForChannel = (channel: ChannelKey) => {
    const mode = getModeForChannel(channel);
    if (mode === "video") return hasVideoMedia ? 1 : 0;
    if (mode === "images") return channelImageEditors[channel]?.imageKeys?.length || 0;
    return 0;
  };

  const getMediaIconForChannel = (channel: ChannelKey) => {
    const mode = getModeForChannel(channel);
    return mode;
  };

  const mediaModeButton = (mode: ChannelMediaMode, label: string, disabled = false) => {
    const active = activeMode === mode;
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setChannelMediaMode(activeImageChannel, mode)}
        style={{
          border: active
            ? "2px solid rgba(76,195,255,0.88)"
            : "1px solid rgba(255,255,255,0.13)",
          background: active
            ? "linear-gradient(135deg, rgba(36,145,190,0.34), rgba(124,92,255,0.22))"
            : "rgba(255,255,255,0.055)",
          color: active ? "#e6f8ff" : "rgba(255,255,255,0.76)",
          boxShadow: active ? "0 0 0 1px rgba(76,195,255,0.28) inset, 0 0 0 1px rgba(76,195,255,0.18), 0 0 14px rgba(76,195,255,0.16)" : undefined,
          borderRadius: 999,
          minHeight: isMobile ? 34 : 36,
          padding: isMobile ? "0 8px" : "0 14px",
          fontSize: isMobile ? 11 : 12,
          fontWeight: 900,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.45 : 1,
          whiteSpace: "nowrap",
          flex: isMobile ? "1 1 0" : "0 0 auto",
          minWidth: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        <MediaModeGlyph mode={mode} size={isMobile ? 13 : 14} />
        <span>{label}</span>
      </button>
    );
  };

  return (
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
          flexWrap: "wrap",
          marginBottom: 8,
        }}
      >
        <div className={styles.blockTitle}>Médias de la publication</div>
      </div>
      <div
        className={styles.subtitle}
        style={{ marginBottom: 12, maxWidth: "none", whiteSpace: "normal" }}
      >
        Choisissez vos images ou une vidéo. Les images restent ajustables par
        canal. En vidéo, l’IA peut utiliser les captures et l’audio détecté.
      </div>
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
          marginBottom: 14,
        }}
      >
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={onPickImagesClick}
          disabled={pickImagesDisabled}
          title={
            imagesLimitReached
              ? `${BOOSTER_MAX_IMAGE_COUNT} images maximum`
              : undefined
          }
          style={{
            opacity: pickImagesDisabled ? 0.48 : 1,
            filter: pickImagesDisabled ? "grayscale(1)" : undefined,
            cursor: pickImagesDisabled ? "not-allowed" : "pointer",
          }}
        >
          + Ajouter des images
        </button>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={onPickVideoClick}
          disabled={pickVideoDisabled}
          title={
            pickVideoDisabled
              ? "1 vidéo maximum par publication."
              : `1 vidéo maximum · ${BOOSTER_MAX_VIDEO_MB_LABEL} max · ${BOOSTER_RECOMMENDED_VIDEO_DURATION_LABEL}`
          }
          style={{
            opacity: pickVideoDisabled ? 0.48 : 1,
            filter: pickVideoDisabled ? "grayscale(1)" : undefined,
            cursor: pickVideoDisabled ? "not-allowed" : "pointer",
          }}
        >
          + Ajouter une vidéo
        </button>
        <span
          title={
            !isMobile
              ? "Utilisable en version mobile"
              : imagesLimitReached
                ? `${BOOSTER_MAX_IMAGE_COUNT} images maximum`
                : "Ouvrir l’Appareil iNrCy pour prendre une photo"
          }
          style={{ display: "inline-flex" }}
        >
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={!cameraDisabled ? () => onTakePhotoClick() : undefined}
            disabled={cameraDisabled}
            aria-disabled={cameraDisabled}
            style={{
              opacity: cameraDisabled ? 0.48 : 1,
              filter: cameraDisabled ? "grayscale(1)" : undefined,
              cursor: cameraDisabled ? "not-allowed" : "pointer",
            }}
          >
            📷 Appareil iNrCy
          </button>
        </span>
        <div
          style={{
            fontSize: 12,
            opacity: hasImages || hasVideoMedia ? 0.85 : 0.7,
            lineHeight: 1.45,
            minWidth: 0,
            overflowWrap: "anywhere",
          }}
        >
          {hasImages || hasVideoMedia
            ? `${images.length}/${BOOSTER_MAX_IMAGE_COUNT} image${images.length > 1 ? "s" : ""} · ${BOOSTER_MAX_MEDIA_MB_LABEL} max au total${hasVideoMedia ? ` · 1 vidéo · IA vidéo + audio · ${BOOSTER_MAX_VIDEO_MB_LABEL} max · ${BOOSTER_RECOMMENDED_VIDEO_DURATION_LABEL}` : ""}`
            : `Aucun média ajouté · ${BOOSTER_MAX_IMAGE_COUNT} images max ou 1 vidéo · ${BOOSTER_MAX_MEDIA_MB_LABEL} max`}
        </div>
      </div>
      {imgError ? (
        <div style={{ marginBottom: 10, fontSize: 13, color: "#ffb4b4" }}>
          {imgError}
        </div>
      ) : null}

      {selectedChannels.length ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              display: isMobile ? "grid" : "flex",
              gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : undefined,
              gap: 8,
              width: "100%",
              minWidth: 0,
              flexWrap: isMobile ? undefined : "nowrap",
              alignItems: "center",
              justifyContent: isMobile ? undefined : "flex-start",
              overflowX: isMobile ? undefined : "hidden",
            }}
          >
            {selectedChannels.map((channel, index) => {
              const count = getMediaCountForChannel(channel);
              const mediaIcon = getMediaIconForChannel(channel);
              const toneReady = count > 0;
              const isActive = activeImageChannel === channel;
              const isLastOddMobileItem =
                isMobile &&
                index === selectedChannels.length - 1 &&
                selectedChannels.length % 2 === 1;
              return (
                <button
                  key={channel}
                  type="button"
                  onClick={() => setSynchronizedActiveChannel(channel)}
                  style={{
                    minWidth: 0,
                    width: isMobile ? (isLastOddMobileItem ? "calc(50% - 4px)" : "100%") : "auto",
                    gridColumn: isLastOddMobileItem ? "1 / -1" : undefined,
                    justifySelf: isLastOddMobileItem ? "center" : undefined,
                    flex: isMobile ? undefined : "0 1 calc((100% - 48px) / 7)",
                    maxWidth: isMobile ? undefined : 172,
                    minHeight: 38,
                    borderRadius: 999,
                    padding: isMobile ? "0 10px" : "0 8px",
                    border: isActive
                      ? toneReady
                        ? "2px solid rgba(74,222,128,0.90)"
                        : "2px solid rgba(250,204,21,0.92)"
                      : toneReady
                        ? "1px solid rgba(34,197,94,0.34)"
                        : "1px solid rgba(251,191,36,0.36)",
                    background: toneReady
                      ? "rgba(34,197,94,0.10)"
                      : "rgba(251,191,36,0.10)",
                    color: toneReady ? "#bbf7d0" : "#fde68a",
                    boxShadow: isActive
                      ? toneReady
                        ? "0 0 0 1px rgba(74,222,128,0.28) inset, 0 0 0 1px rgba(74,222,128,0.22), 0 0 18px rgba(74,222,128,0.22)"
                        : "0 0 0 1px rgba(250,204,21,0.28) inset, 0 0 0 1px rgba(250,204,21,0.22), 0 0 18px rgba(250,204,21,0.18)"
                      : undefined,
                    fontSize: isMobile ? 12 : 13,
                    fontWeight: 900,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 7,
                    overflow: "hidden",
                  }}
                >
                  <span
                    style={{
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {getCompactChannelLabel(channel, getImageAdapterLabel(channel))}
                  </span>
                  <span
                    style={{
                      flex: "0 0 auto",
                      minWidth: 20,
                      height: 20,
                      padding: "0 6px",
                      borderRadius: 999,
                      display: "inline-grid",
                      placeItems: "center",
                      fontSize: 11,
                      fontWeight: 900,
                      background: "rgba(255,255,255,0.12)",
                    }}
                  >
                    {count}
                  </span>
                  <span
                    aria-hidden="true"
                    style={{
                      flex: "0 0 auto",
                      width: 16,
                      height: 16,
                      display: "inline-grid",
                      placeItems: "center",
                      opacity: toneReady ? 0.96 : 0.72,
                    }}
                  >
                    <MediaModeGlyph mode={mediaIcon} size={14} />
                  </span>
                  {getModeForChannel(channel) === "video" && hasVideoMedia && videoVariantPreparationByChannel[channel]?.status ? (
                    <span
                      aria-hidden="true"
                      title={videoVariantPreparationByChannel[channel]?.label || "Format vidéo"}
                      style={{
                        flex: "0 0 auto",
                        fontSize: 12,
                        lineHeight: 1,
                      }}
                    >
                      {getPreparationTone(videoVariantPreparationByChannel[channel]).icon}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: "flex",
              gap: isMobile ? 6 : 8,
              flexWrap: isMobile ? "nowrap" : "wrap",
              alignItems: "center",
              width: "100%",
              minWidth: 0,
            }}
          >
            {mediaModeButton("video", "Vidéo", !hasVideoMedia)}
            {mediaModeButton("images", "Photos", !hasImages)}
            {mediaModeButton("none", "Aucun")}
          </div>

          {activeMode === "none" ? (
            <div
              style={{
                borderRadius: 16,
                padding: "18px 16px",
                border: "1px solid rgba(251,191,36,0.22)",
                background: "rgba(251,191,36,0.08)",
                color: "#fde68a",
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              Ce canal publiera uniquement le texte.
            </div>
          ) : activeMode === "video" ? (
            hasVideoMedia ? (
              <BoosterVideoFormatManager
                isMobile={isMobile}
                channel={activeImageChannel}
                videoName={videoFile?.name || "Vidéo sélectionnée"}
                videoDisplayUrl={activeVideoDisplayUrl}
                videoSize={videoFile?.size || videoSourceMetadata?.size || 0}
                videoDurationSeconds={videoDurationSeconds}
                videoSourceMetadata={videoSourceMetadata}
                currentFormat={activeVideoFormat}
                adaptationMode={activeVideoAdaptationMode}
                videoTransformedVariants={videoTransformedVariants}
                preparationState={activeVideoPreparation || null}
                preparing={videoPreviewVariantsPreparing}
                onFormatChange={(format) => setVideoFormatForChannel(activeImageChannel, format)}
                onAdaptationModeChange={(mode) => setVideoAdaptationModeForChannel(activeImageChannel, mode)}
                onApplyFormat={onApplyVideoFormatForChannel ? () => onApplyVideoFormatForChannel(activeImageChannel) : undefined}
                onApplyFormatToAllChannels={onApplyVideoFormatToAllChannels ? () => onApplyVideoFormatToAllChannels(activeImageChannel) : undefined}
                onRemoveFromChannel={() => setChannelMediaMode(activeImageChannel, "none")}
                buttonClassName={styles.secondaryBtn}
              />
            ) : (
              <div style={{ fontSize: 13, opacity: 0.75 }}>
                Ajoutez une vidéo ou choisissez Photos / Aucun média pour ce canal.
              </div>
            )
          ) : !images.length ? (
            <div style={{ fontSize: 13, opacity: 0.75 }}>
              Ajoutez une ou plusieurs images, ou choisissez Vidéo / Aucun média
              pour ce canal.
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
                    style={{
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: "#fde68a",
                    }}
                  >
                    <strong>Google Business : 1 seule photo par publication.</strong>{" "}
                    Les autres images restent disponibles sur les autres canaux.
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      onClick={() => {
                        setImgError("");
                        if (images.length >= BOOSTER_MAX_IMAGE_COUNT) return;
                        gmbFileInputRef.current?.click();
                      }}
                      disabled={images.length >= BOOSTER_MAX_IMAGE_COUNT}
                      title={
                        images.length >= BOOSTER_MAX_IMAGE_COUNT
                          ? `${BOOSTER_MAX_IMAGE_COUNT} images maximum`
                          : undefined
                      }
                      style={{
                        opacity: images.length >= BOOSTER_MAX_IMAGE_COUNT ? 0.48 : 1,
                        filter:
                          images.length >= BOOSTER_MAX_IMAGE_COUNT
                            ? "grayscale(1)"
                            : undefined,
                        cursor:
                          images.length >= BOOSTER_MAX_IMAGE_COUNT
                            ? "not-allowed"
                            : "pointer",
                      }}
                    >
                      + Ajouter une image spécifique Google Business
                    </button>
                    <span
                      title={
                        isMobile
                          ? images.length >= BOOSTER_MAX_IMAGE_COUNT
                            ? `${BOOSTER_MAX_IMAGE_COUNT} images maximum`
                            : "Ouvrir l’Appareil iNrCy pour Google Business"
                          : "Utilisable en version mobile"
                      }
                      style={{ display: "inline-flex" }}
                    >
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        onClick={
                          isMobile
                            ? () => {
                                setImgError("");
                                if (images.length >= BOOSTER_MAX_IMAGE_COUNT) return;
                                onTakePhotoClick("gmb");
                              }
                            : undefined
                        }
                        disabled={isMobile && images.length >= BOOSTER_MAX_IMAGE_COUNT}
                        aria-disabled={!isMobile || images.length >= BOOSTER_MAX_IMAGE_COUNT}
                        style={{
                          opacity:
                            !isMobile || images.length >= BOOSTER_MAX_IMAGE_COUNT
                              ? 0.48
                              : 1,
                          filter:
                            !isMobile || images.length >= BOOSTER_MAX_IMAGE_COUNT
                              ? "grayscale(1)"
                              : undefined,
                          cursor:
                            !isMobile || images.length >= BOOSTER_MAX_IMAGE_COUNT
                              ? "not-allowed"
                              : "pointer",
                        }}
                      >
                        📷 Appareil iNrCy Google Business
                      </button>
                    </span>
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
                    getOptimizedTransform(activeImageChannel, imageMetaByKey[key]);
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
                showTabs={false}
              />
            </>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 13, opacity: 0.75 }}>
          Sélectionnez d’abord vos canaux.
        </div>
      )}
    </div>
  );
}
