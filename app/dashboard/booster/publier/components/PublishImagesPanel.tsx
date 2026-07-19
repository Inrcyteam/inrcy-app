import type { MutableRefObject } from "react";
import {
  getBoosterImageDisplayPlan,
  getBoosterImageRenderDimensions,
  getBoosterImageSequenceTargetRatio,
} from "@/lib/boosterImageDecision";
import type { BoosterVideoTransformedVariant } from "@/lib/boosterVideoTransforms";
import { ChannelImageAdapterCardsPanel } from "@/app/dashboard/_components/ChannelImageAdapterTool";
import PublishVideoAdapterPanel, {
  type PublishVideoVariantPreparationState,
} from "./PublishVideoAdapterPanel";
import {
  BOOSTER_MAX_IMAGE_COUNT,
  BOOSTER_IMAGE_ACCEPT,
  BOOSTER_MAX_MEDIA_MB_LABEL,
  BOOSTER_RECOMMENDED_VIDEO_DURATION_LABEL,
  BOOSTER_MAX_VIDEO_MB_LABEL,
  CHANNEL_PRESETS,
  channelSupportsImages,
  channelSupportsTextOnly,
  getUnavailableMediaModeMessage,
  getBackgroundMode,
  getOptimizedTransform,
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

function getCompactChannelLabel(channel: ChannelKey, label: string) {
  if (channel === "gmb") return "Google";
  return label;
}

type ImageAdapterTab = {
  key: ChannelKey;
  label: string;
  count: number;
  tone: "ready" | "warning";
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
  videoVariantPreparationByChannel?: Partial<Record<ChannelKey, PublishVideoVariantPreparationState>>;
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
  const getModeForChannel = (channel: ChannelKey): ChannelMediaMode => {
    const explicit = channelMediaModes[channel];

    if (channel === "youtube_shorts") return hasVideoMedia ? "video" : "none";

    if (channel === "tiktok") {
      if (explicit === "video" && hasVideoMedia) return "video";
      if (explicit === "images" && hasImages) return "images";
      if (hasImages) return "images";
      if (hasVideoMedia) return "video";
      return "none";
    }

    if (explicit === "video" && hasVideoMedia) return "video";
    if (explicit === "images" && hasImages && channelSupportsImages(channel)) return "images";
    if (explicit === "none" && channelSupportsTextOnly(channel)) return "none";
    if (hasImages && channelSupportsImages(channel)) return "images";
    if (hasVideoMedia) return "video";
    return "none";
  };

  const activeMode: ChannelMediaMode = getModeForChannel(activeImageChannel);
  const activeImageEditor = channelImageEditors[activeImageChannel];
  const activeImageFirstKey = activeImageEditor?.imageKeys?.[0] || "";
  const activeImageSequenceTargetRatio = getBoosterImageSequenceTargetRatio({
    channel: activeImageChannel,
    metas: (activeImageEditor?.imageKeys || []).map(
      (key) => imageMetaByKey[key],
    ),
    firstImageCustomizedTargetRatio:
      activeImageChannel === "instagram" &&
      activeImageFirstKey &&
      (activeImageEditor?.customizedImageKeys || []).includes(activeImageFirstKey)
        ? CHANNEL_PRESETS.instagram.width / CHANNEL_PRESETS.instagram.height
        : null,
  });
  const getPreparationTone = (state?: PublishVideoVariantPreparationState) => {
    if (state?.status === "ready") return { icon: "✅", color: "#bbf7d0", border: "rgba(34,197,94,0.28)", background: "rgba(34,197,94,0.10)" };
    if (state?.status === "preparing") return { icon: "⏳", color: "#bfdbfe", border: "rgba(96,165,250,0.30)", background: "rgba(59,130,246,0.12)" };
    if (state?.status === "error") return { icon: "⚠️", color: "#fecaca", border: "rgba(248,113,113,0.28)", background: "rgba(248,113,113,0.10)" };
    return { icon: "⚙️", color: "rgba(226,232,240,0.76)", border: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.055)" };
  };

  const getMediaCountForChannel = (channel: ChannelKey) => {
    const mode = getModeForChannel(channel);
    if (mode === "video") return hasVideoMedia ? 1 : 0;
    if (mode === "images" && channelSupportsImages(channel)) {
      return channelImageEditors[channel]?.imageKeys?.length || 0;
    }
    return 0;
  };

  const getMediaToneForChannel = (channel: ChannelKey): "ready" | "warning" | "blocked" => {
    const mode = getModeForChannel(channel);
    const count = getMediaCountForChannel(channel);
    if (channel === "youtube_shorts") return hasVideoMedia ? "ready" : "blocked";
    if (channel === "tiktok") return count > 0 ? "ready" : "blocked";
    return count > 0 ? "ready" : "warning";
  };

  const getMediaIconForChannel = (channel: ChannelKey) => {
    const mode = getModeForChannel(channel);
    return mode;
  };

  const mediaModeButton = (mode: ChannelMediaMode, label: string, disabled = false) => {
    const active = activeMode === mode;
    const unsupportedMessage = getUnavailableMediaModeMessage(activeImageChannel, mode);
    const unavailable = Boolean(unsupportedMessage);
    const effectiveDisabled = disabled || unavailable;
    return (
      <button
        type="button"
        disabled={effectiveDisabled}
        title={unsupportedMessage || undefined}
        onClick={() => !effectiveDisabled && setChannelMediaMode(activeImageChannel, mode)}
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
          cursor: effectiveDisabled ? "not-allowed" : "pointer",
          opacity: effectiveDisabled ? 0.45 : 1,
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
        <div
          className={styles.blockTitle}
          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 24,
              height: 24,
              borderRadius: 999,
              display: "inline-grid",
              placeItems: "center",
              border: "1px solid rgba(76,195,255,0.38)",
              background: "rgba(76,195,255,0.12)",
              color: "#dff6ff",
              fontSize: 12,
              fontWeight: 950,
              flex: "0 0 auto",
            }}
          >
            4
          </span>
          Médias de la publication
        </div>
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
        accept={BOOSTER_IMAGE_ACCEPT}
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
            : `Aucun média ajouté · ${BOOSTER_MAX_IMAGE_COUNT} images max (${BOOSTER_MAX_MEDIA_MB_LABEL} total) ou 1 vidéo (${BOOSTER_MAX_VIDEO_MB_LABEL} max)`}
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
              display: "grid",
              gridTemplateColumns: isMobile
                ? "repeat(2, minmax(0, 1fr))"
                : "repeat(10, minmax(0, 1fr))",
              gap: isMobile ? 8 : 6,
              width: "100%",
              minWidth: 0,
              alignItems: "center",
              paddingBottom: 2,
            }}
          >
            {selectedChannels.map((channel) => {
              const count = getMediaCountForChannel(channel);
              const mediaIcon = getMediaIconForChannel(channel);
              const tone = getMediaToneForChannel(channel);
              const toneReady = tone === "ready";
              const toneBlocked = tone === "blocked";
              const isActive = activeImageChannel === channel;
              return (
                <button
                  key={channel}
                  type="button"
                  onClick={() => setSynchronizedActiveChannel(channel)}
                  style={{
                    minWidth: 0,
                    width: "100%",
                    boxSizing: "border-box",
                    minHeight: isMobile ? 43 : 38,
                    borderRadius: 999,
                    padding: isMobile ? "4px 6px" : "0 5px",
                    border: isActive
                      ? toneReady
                        ? "2px solid rgba(74,222,128,0.90)"
                        : toneBlocked
                          ? "2px solid rgba(248,113,113,0.92)"
                          : "2px solid rgba(250,204,21,0.92)"
                      : toneReady
                        ? "1px solid rgba(34,197,94,0.34)"
                        : toneBlocked
                          ? "1px solid rgba(248,113,113,0.42)"
                          : "1px solid rgba(251,191,36,0.36)",
                    background: toneReady
                      ? "rgba(34,197,94,0.10)"
                      : toneBlocked
                        ? "rgba(248,113,113,0.10)"
                        : "rgba(251,191,36,0.10)",
                    color: toneReady ? "#bbf7d0" : toneBlocked ? "#fecaca" : "#fde68a",
                    boxShadow: isActive
                      ? toneReady
                        ? "0 0 0 1px rgba(74,222,128,0.28) inset, 0 0 0 1px rgba(74,222,128,0.22), 0 0 18px rgba(74,222,128,0.22)"
                        : toneBlocked
                          ? "0 0 0 1px rgba(248,113,113,0.28) inset, 0 0 0 1px rgba(248,113,113,0.22), 0 0 18px rgba(248,113,113,0.18)"
                          : "0 0 0 1px rgba(250,204,21,0.28) inset, 0 0 0 1px rgba(250,204,21,0.22), 0 0 18px rgba(250,204,21,0.18)"
                      : undefined,
                    fontSize: isMobile ? "clamp(10px, 2.9vw, 12px)" : "clamp(8px, 0.72vw, 11.5px)",
                    fontWeight: 850,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: isMobile ? 4 : 5,
                    overflow: isMobile ? "visible" : "hidden",
                  }}
                >
                  <span
                    style={{
                      minWidth: 0,
                      overflow: isMobile ? "visible" : "hidden",
                      textOverflow: isMobile ? "clip" : "ellipsis",
                      whiteSpace: isMobile ? "normal" : "nowrap",
                      overflowWrap: isMobile ? "anywhere" : undefined,
                      textAlign: isMobile ? "center" : undefined,
                    }}
                  >
                    {getCompactChannelLabel(channel, getImageAdapterLabel(channel))}
                  </span>
                  <span
                    style={{
                      flex: "0 0 auto",
                      minWidth: isMobile ? 14 : 20,
                      height: isMobile ? 16 : 20,
                      padding: isMobile ? "0 3px" : "0 6px",
                      borderRadius: 999,
                      display: "inline-grid",
                      placeItems: "center",
                      fontSize: "clamp(7px, 0.7vw, 11px)",
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
                      width: isMobile ? 12 : 16,
                      height: isMobile ? 12 : 16,
                      display: "inline-grid",
                      placeItems: "center",
                      opacity: toneReady ? 0.96 : 0.72,
                    }}
                  >
                    <MediaModeGlyph mode={mediaIcon} size={isMobile ? 11 : 14} />
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
            {mediaModeButton("images", "Photos", !hasImages || !channelSupportsImages(activeImageChannel))}
            {mediaModeButton("none", "Aucun", !channelSupportsTextOnly(activeImageChannel))}
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
              {!channelSupportsTextOnly(activeImageChannel)
                ? getUnavailableMediaModeMessage(activeImageChannel, "none") ||
                  "Ce canal nécessite un média."
                : "Ce canal publiera uniquement le texte."}
            </div>
          ) : activeMode === "video" ? (
            <PublishVideoAdapterPanel
              styles={styles}
              isMobile={isMobile}
              activeChannel={activeImageChannel}
              videoFile={videoFile}
              videoPreviewUrl={videoPreviewUrl}
              videoDurationSeconds={videoDurationSeconds}
              videoSourceMetadata={videoSourceMetadata}
              videoFormatByChannel={videoFormatByChannel}
              setVideoFormatForChannel={setVideoFormatForChannel}
              videoAdaptationModeByChannel={videoAdaptationModeByChannel}
              setVideoAdaptationModeForChannel={setVideoAdaptationModeForChannel}
              videoVariantPreparationByChannel={videoVariantPreparationByChannel}
              videoTransformedVariants={videoTransformedVariants}
              videoPreviewVariantsPreparing={videoPreviewVariantsPreparing}
              onApplyVideoFormatForChannel={onApplyVideoFormatForChannel}
              onApplyVideoFormatToAllChannels={onApplyVideoFormatToAllChannels}
              setChannelMediaMode={setChannelMediaMode}
            />
          ) : !images.length ? (
            <div style={{ fontSize: 13, opacity: 0.75 }}>
              {activeImageChannel === "youtube_shorts"
                ? "Ajoutez une vidéo pour publier sur YouTube."
                : activeImageChannel === "tiktok"
                  ? "Ajoutez une photo ou une vidéo pour publier sur TikTok."
                  : "Ajoutez une ou plusieurs images, ou choisissez Vidéo / Aucun média pour ce canal."}
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
                        disabled={!isMobile || images.length >= BOOSTER_MAX_IMAGE_COUNT}
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
                formatLabel="Rendu intelligent par image"
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
                  const automaticTransform = getOptimizedTransform(
                    activeImageChannel,
                    imageMetaByKey[key],
                  );
                  const currentTransform =
                    channelImageEditors[activeImageChannel]?.transforms?.[key] ||
                    automaticTransform;
                  const explicitlyCustomized = (
                    channelImageEditors[activeImageChannel]?.customizedImageKeys || []
                  ).includes(key);
                  const displayPlan = getBoosterImageDisplayPlan({
                    channel: activeImageChannel,
                    meta: imageMetaByKey[key],
                    customized: explicitlyCustomized,
                    currentTransform,
                    automaticTransform,
                    requiredTargetRatio: activeImageSequenceTargetRatio,
                  });
                  const decision = displayPlan.decision;
                  const sourceMeta = imageMetaByKey[key];
                  const channelPreset = CHANNEL_PRESETS[activeImageChannel];

                  const previewPreset = (() => {
                    if (decision.mode === "original" && sourceMeta?.width && sourceMeta?.height) {
                      return { width: sourceMeta.width, height: sourceMeta.height };
                    }
                    if (decision.mode === "adapted" && displayPlan.previewRatio) {
                      return getBoosterImageRenderDimensions({
                        baseWidth: channelPreset.width,
                        baseHeight: channelPreset.height,
                        targetRatio: displayPlan.previewRatio,
                      });
                    }
                    if (
                      decision.mode === "customized" &&
                      activeImageChannel === "instagram" &&
                      activeImageSequenceTargetRatio
                    ) {
                      return getBoosterImageRenderDimensions({
                        baseWidth: channelPreset.width,
                        baseHeight: channelPreset.height,
                        targetRatio: activeImageSequenceTargetRatio,
                      });
                    }
                    return channelPreset;
                  })();

                  const previewTransform = (() => {
                    if (decision.mode === "customized") return currentTransform;
                    if (decision.mode === "adapted") {
                      return {
                        ...automaticTransform,
                        fit: displayPlan.automaticFit,
                        zoom: 1,
                        offsetX: 0,
                        offsetY: 0,
                        blurBackground: false,
                        backgroundMode: "color" as const,
                        backgroundColor: "#ffffff",
                      };
                    }
                    return {
                      ...automaticTransform,
                      fit: "contain" as const,
                      zoom: 1,
                      offsetX: 0,
                      offsetY: 0,
                      blurBackground: false,
                      backgroundMode: "color" as const,
                      backgroundColor: "#ffffff",
                    };
                  })();

                  const previewAspectRatio = `${previewPreset.width} / ${previewPreset.height}`;
                  const bgMode = getBackgroundMode(previewTransform);
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
                    fitLabel: decision.label,
                    previewAspectRatio,
                    backgroundMode: bgMode,
                    backgroundColor: previewTransform.backgroundColor,
                    transform: previewTransform,
                    preset: previewPreset,
                    imageMeta: sourceMeta,
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
