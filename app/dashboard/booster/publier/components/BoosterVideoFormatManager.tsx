import { buildVideoTransformSignature, type BoosterVideoTransformedVariant } from "@/lib/boosterVideoTransforms";
import {
  VIDEO_ADAPTATION_MODE_LABELS,
  VIDEO_FORMAT_ASPECT_RATIOS,
  VIDEO_FORMAT_OPTIONS_BY_CHANNEL,
  getRecommendedVideoFormatForSource,
  getVideoFormatLabel,
  type BoosterVideoSourceMetadata,
  type ChannelKey,
  type VideoAdaptationMode,
  type VideoFormat,
} from "../publishModal.shared";

export type BoosterVideoPreparationState = {
  status: "idle" | "preparing" | "ready" | "error";
  label: string;
  detail?: string;
};

function formatVideoSeconds(seconds: number | null | undefined) {
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

function getVideoSourceSummary(meta: BoosterVideoSourceMetadata | null | undefined, fallbackDuration: number | null | undefined, fallbackSize?: number | null) {
  const duration = formatVideoSeconds(meta?.duration ?? fallbackDuration ?? null);
  const dimension = meta?.width && meta?.height ? `${meta.width}×${meta.height}` : "Dimensions inconnues";
  const orientation = meta?.orientationLabel || "Orientation inconnue";
  const ratio = meta?.ratioLabel && meta.ratioLabel !== "Ratio inconnu" ? meta.ratioLabel : null;
  const size = formatVideoBytes(meta?.size || fallbackSize || 0);
  return [orientation, ratio, dimension, duration ? duration : null, size].filter(Boolean).join(" · ");
}

function getVideoTechnicalDetails(meta: BoosterVideoSourceMetadata | null | undefined) {
  return [
    meta?.width && meta?.height ? `Résolution ${meta.width} × ${meta.height}` : null,
    meta?.ratioLabel && meta.ratioLabel !== "Ratio inconnu" ? `Ratio ${meta.ratioLabel}` : null,
    meta?.orientationLabel ? `Source ${meta.orientationLabel.toLowerCase()}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
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

  if (format === "9_16") return isMobile ? "min(72vw, 220px)" : "210px";
  if (format === "1_1") return isMobile ? "min(84vw, 280px)" : "270px";
  if (format === "16_9") return isMobile ? "min(94vw, 380px)" : "360px";

  if (orientation === "vertical") return isMobile ? "min(72vw, 220px)" : "210px";
  if (orientation === "square") return isMobile ? "min(84vw, 280px)" : "270px";
  return isMobile ? "min(94vw, 380px)" : "360px";
}

function getPreparationTone(state?: BoosterVideoPreparationState | null) {
  if (state?.status === "ready") return { icon: "✅", color: "#bbf7d0", border: "rgba(34,197,94,0.28)", background: "rgba(34,197,94,0.10)" };
  if (state?.status === "preparing") return { icon: "⏳", color: "#bfdbfe", border: "rgba(96,165,250,0.30)", background: "rgba(59,130,246,0.12)" };
  if (state?.status === "error") return { icon: "⚠️", color: "#fecaca", border: "rgba(248,113,113,0.28)", background: "rgba(248,113,113,0.10)" };
  return { icon: "⚙️", color: "rgba(226,232,240,0.76)", border: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.055)" };
}

export default function BoosterVideoFormatManager({
  isMobile,
  channel,
  videoName,
  videoDisplayUrl,
  videoSize,
  videoDurationSeconds,
  videoSourceMetadata,
  currentFormat,
  adaptationMode,
  videoTransformedVariants = [],
  preparationState,
  preparing = false,
  onFormatChange,
  onAdaptationModeChange,
  onApplyFormat,
  onApplyFormatToAllChannels,
  onRemoveFromChannel,
  onDeleteVideo,
  onPickVideoClick,
  pickVideoLabel = "Remplacer la vidéo",
  showApplyAll = true,
  buttonClassName,
  compact = false,
}: {
  isMobile: boolean;
  channel: ChannelKey;
  videoName?: string | null;
  videoDisplayUrl: string;
  videoSize?: number | null;
  videoDurationSeconds?: number | null;
  videoSourceMetadata?: BoosterVideoSourceMetadata | null;
  currentFormat: VideoFormat;
  adaptationMode: VideoAdaptationMode;
  videoTransformedVariants?: BoosterVideoTransformedVariant[];
  preparationState?: BoosterVideoPreparationState | null;
  preparing?: boolean;
  onFormatChange?: (format: VideoFormat) => void;
  onAdaptationModeChange?: (mode: VideoAdaptationMode) => void;
  onApplyFormat?: () => void;
  onApplyFormatToAllChannels?: () => void;
  onRemoveFromChannel?: () => void;
  onDeleteVideo?: () => void;
  onPickVideoClick?: () => void;
  pickVideoLabel?: string;
  showApplyAll?: boolean;
  buttonClassName?: string;
  compact?: boolean;
}) {
  const smartRecommendedFormat = getRecommendedVideoFormatForSource(channel, videoSourceMetadata);
  const videoFormatOptions = [
    smartRecommendedFormat,
    ...(VIDEO_FORMAT_OPTIONS_BY_CHANNEL[channel] || ["original"]),
  ].filter((format, index, arr) => arr.indexOf(format) === index);
  const sourceSummary = getVideoSourceSummary(videoSourceMetadata, videoDurationSeconds, videoSize);
  const technicalDetails = getVideoTechnicalDetails(videoSourceMetadata);
  const aspectRatio = getVideoPreviewAspectRatio(currentFormat, videoSourceMetadata);
  const signature = buildVideoTransformSignature(currentFormat, adaptationMode);
  const preparedVariant = videoTransformedVariants.find((variant) => variant.signature === signature || variant.channel === channel);
  const displayUrl = String(preparedVariant?.publicUrl || preparedVariant?.url || "").trim() || videoDisplayUrl;
  const isApplied = Boolean(preparedVariant?.publicUrl || preparedVariant?.url);
  const isHorizontalSource = videoSourceMetadata?.orientation === "horizontal";
  const isVerticalDestination = currentFormat === "9_16";
  const isTikTokHorizontalRecommended = channel === "tiktok" && isHorizontalSource && smartRecommendedFormat === "16_9";
  const frameWidth = getVideoFrameWidth({ format: currentFormat, metadata: videoSourceMetadata, isMobile });
  const usesSafeFramePreview = !isApplied && adaptationMode === "safe_blur" && currentFormat !== "original";
  const targetRatio = VIDEO_FORMAT_ASPECT_RATIOS[currentFormat] || "16 / 9";
  const [targetWidth, targetHeight] = targetRatio
    .split("/")
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
  const sourceRatio = videoSourceMetadata?.width && videoSourceMetadata?.height ? videoSourceMetadata.width / videoSourceMetadata.height : 16 / 9;
  const frameRatio = targetWidth && targetHeight ? targetWidth / targetHeight : sourceRatio;
  const sourceIsWiderThanFrame = sourceRatio >= frameRatio;
  const btnClass = buttonClassName || "";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "minmax(260px, 0.92fr) minmax(320px, 1.08fr)",
        alignItems: "stretch",
        gap: isMobile ? 12 : 16,
        borderRadius: 16,
        padding: isMobile ? 10 : 14,
        border: "1px solid rgba(76,195,255,0.22)",
        background: "#122033",
        isolation: "isolate",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateRows: "auto auto minmax(0, auto) auto",
          alignContent: "start",
          gap: isMobile ? 9 : 10,
          minWidth: 0,
          borderRadius: 14,
          padding: isMobile ? 0 : 2,
        }}
      >
        <strong
          title={videoName || "Vidéo sélectionnée"}
          style={{
            fontSize: isMobile ? 12 : 13,
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            lineHeight: 1.25,
            color: "rgba(248,250,252,0.94)",
          }}
        >
          {videoName || "Vidéo sélectionnée"}
        </strong>

        {sourceSummary ? (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "flex-start",
              justifySelf: isMobile ? "center" : "start",
              maxWidth: "100%",
              borderRadius: 999,
              padding: "5px 9px",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(15,23,42,0.46)",
              color: "rgba(226,232,240,0.82)",
              fontSize: 11,
              fontWeight: 800,
              lineHeight: 1.25,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={sourceSummary}
          >
            {sourceSummary}
          </div>
        ) : null}

        {displayUrl ? (
          <div
            style={{
              width: frameWidth,
              maxWidth: "100%",
              marginInline: "auto",
              aspectRatio,
              borderRadius: 14,
              background: "#0b1220",
              overflow: "hidden",
              border: "4px solid #020617",
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "none",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 8,
                left: 8,
                zIndex: 2,
                borderRadius: 999,
                padding: "4px 8px",
                background: isApplied ? "rgba(22,163,74,0.86)" : "rgba(15,23,42,0.82)",
                color: "#fff",
                fontSize: 10,
                fontWeight: 950,
                letterSpacing: "0.01em",
                boxShadow: "0 8px 18px rgba(0,0,0,0.26)",
                pointerEvents: "none",
              }}
            >
              {isApplied ? "Format appliqué" : "Aperçu du format"}
            </div>
            <video
              src={displayUrl}
              controls
              playsInline
              preload="metadata"
              style={{
                position: "relative",
                zIndex: 1,
                width: usesSafeFramePreview ? (sourceIsWiderThanFrame ? "100%" : "auto") : "100%",
                height: usesSafeFramePreview ? (sourceIsWiderThanFrame ? "auto" : "100%") : "100%",
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: isApplied ? "contain" : adaptationMode === "cover_crop" ? "cover" : "contain",
                borderRadius: 10,
                background: "#0b1220",
                display: "block",
                boxShadow: "none",
              }}
            />
          </div>
        ) : (
          <div
            style={{
              borderRadius: 14,
              border: "1px dashed rgba(255,255,255,0.16)",
              padding: "24px 16px",
              color: "rgba(226,232,240,0.70)",
              fontSize: 12,
              textAlign: "center",
            }}
          >
            Aucune vidéo sélectionnée.
          </div>
        )}

        {technicalDetails ? (
          <div
            style={{
              display: "grid",
              gap: 3,
              borderRadius: 12,
              padding: "8px 10px",
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(15,23,42,0.28)",
              color: "rgba(226,232,240,0.66)",
              fontSize: 10.5,
              lineHeight: 1.35,
              fontWeight: 750,
            }}
          >
            <span style={{ color: "rgba(226,232,240,0.82)", fontWeight: 900 }}>
              Infos techniques
            </span>
            <span>{technicalDetails}</span>
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: "grid",
          alignContent: "start",
          gap: isMobile ? 10 : 12,
          minWidth: 0,
          borderRadius: 14,
          padding: isMobile ? 10 : 12,
          border: "1px solid rgba(255,255,255,0.09)",
          background: "#111a2b",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 950, color: "rgba(248,250,252,0.92)", letterSpacing: "0.01em" }}>
            Modification
          </div>
          {onRemoveFromChannel ? (
            <button
              type="button"
              className={btnClass}
              onClick={onRemoveFromChannel}
              style={{ minHeight: 28, padding: "4px 9px", fontSize: 10.5, opacity: 0.78, whiteSpace: "nowrap" }}
            >
              Retirer du canal
            </button>
          ) : onDeleteVideo ? (
            <button
              type="button"
              className={btnClass}
              onClick={onDeleteVideo}
              style={{ minHeight: 28, padding: "4px 9px", fontSize: 10.5, opacity: 0.78, whiteSpace: "nowrap" }}
            >
              Supprimer la vidéo
            </button>
          ) : null}
        </div>

        <div style={{ display: "grid", gap: 7, width: "100%", minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: "rgba(226,232,240,0.78)" }}>Format actuel</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: isMobile ? "center" : "flex-start" }}>
            {videoFormatOptions.map((format) => {
              const active = currentFormat === format;
              return (
                <button
                  key={format}
                  type="button"
                  onClick={() => onFormatChange?.(format)}
                  disabled={!onFormatChange}
                  style={{
                    minHeight: 30,
                    borderRadius: 999,
                    padding: "5px 10px",
                    border: active ? "2px solid rgba(74,222,128,0.90)" : "1px solid rgba(255,255,255,0.13)",
                    background: active ? "rgba(34,197,94,0.14)" : "rgba(255,255,255,0.055)",
                    color: active ? "#bbf7d0" : "rgba(255,255,255,0.78)",
                    boxShadow: active ? "0 0 0 1px rgba(74,222,128,0.22) inset, 0 0 14px rgba(74,222,128,0.14)" : undefined,
                    cursor: onFormatChange ? "pointer" : "default",
                    fontSize: 11,
                    fontWeight: 900,
                    whiteSpace: "nowrap",
                    opacity: onFormatChange ? 1 : 0.86,
                  }}
                >
                  {getVideoFormatLabel(channel, format, videoSourceMetadata)}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "grid", gap: 7, width: "100%", minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: "rgba(226,232,240,0.78)" }}>Adaptation</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: isMobile ? "center" : "flex-start" }}>
            {(["safe_blur", "cover_crop"] as const).map((mode) => {
              const active = adaptationMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onAdaptationModeChange?.(mode)}
                  disabled={!onAdaptationModeChange}
                  style={{
                    minHeight: 30,
                    borderRadius: 999,
                    padding: "5px 10px",
                    border: active ? "2px solid rgba(76,195,255,0.88)" : "1px solid rgba(255,255,255,0.13)",
                    background: active ? "rgba(76,195,255,0.14)" : "rgba(255,255,255,0.055)",
                    color: active ? "#e6f8ff" : "rgba(255,255,255,0.78)",
                    boxShadow: active ? "0 0 0 1px rgba(76,195,255,0.22) inset, 0 0 14px rgba(76,195,255,0.14)" : undefined,
                    cursor: onAdaptationModeChange ? "pointer" : "default",
                    fontSize: 11,
                    fontWeight: 900,
                    whiteSpace: "nowrap",
                    opacity: onAdaptationModeChange ? 1 : 0.86,
                  }}
                >
                  {VIDEO_ADAPTATION_MODE_LABELS[mode]}
                </button>
              );
            })}
          </div>
        </div>

        {isHorizontalSource && isVerticalDestination ? (
          <div
            style={{
              borderRadius: 12,
              padding: "8px 10px",
              border: "1px solid rgba(251,191,36,0.24)",
              background: "rgba(251,191,36,0.10)",
              color: "#fde68a",
              fontSize: 11,
              lineHeight: 1.35,
              fontWeight: 800,
            }}
          >
            Vidéo horizontale détectée : le 9:16 créera un cadre autour de la vidéo. Le 16:9 est conseillé pour garder le meilleur rendu.
          </div>
        ) : isTikTokHorizontalRecommended ? (
          <div
            style={{
              borderRadius: 12,
              padding: "8px 10px",
              border: "1px solid rgba(96,165,250,0.24)",
              background: "rgba(59,130,246,0.10)",
              color: "#bfdbfe",
              fontSize: 11,
              lineHeight: 1.35,
              fontWeight: 800,
            }}
          >
            Vidéo horizontale détectée : TikTok accepte le 16:9, même si le 9:16 reste le format plein écran.
          </div>
        ) : null}

        {preparationState ? (
          <div
            style={{
              display: "grid",
              gap: 3,
              borderRadius: 12,
              padding: "8px 10px",
              border: `1px solid ${getPreparationTone(preparationState).border}`,
              background: getPreparationTone(preparationState).background,
              color: getPreparationTone(preparationState).color,
              fontSize: 11,
              lineHeight: 1.35,
              fontWeight: 850,
            }}
            role={preparationState.status === "error" ? "alert" : "status"}
          >
            <span>{getPreparationTone(preparationState).icon} {preparationState.label}</span>
            {preparationState.detail ? <span style={{ opacity: 0.78, fontWeight: 750 }}>{preparationState.detail}</span> : null}
          </div>
        ) : null}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: isMobile ? "stretch" : "flex-start" }}>
          {onApplyFormat ? (
            <button
              type="button"
              className={btnClass}
              onClick={onApplyFormat}
              disabled={preparing || !displayUrl}
              style={{
                minHeight: 34,
                padding: "7px 12px",
                fontSize: 11.5,
                opacity: preparing || !displayUrl ? 0.64 : 1,
                cursor: preparing ? "wait" : !displayUrl ? "not-allowed" : "pointer",
                flex: isMobile ? "1 1 100%" : "0 0 auto",
                border: "1px solid rgba(76,195,255,0.32)",
                background: "rgba(76,195,255,0.12)",
              }}
            >
              {preparationState?.status === "ready" ? "Format appliqué" : preparing ? "Modification du format..." : "Appliquer ce format"}
            </button>
          ) : null}
          {showApplyAll && onApplyFormatToAllChannels ? (
            <button
              type="button"
              className={btnClass}
              onClick={onApplyFormatToAllChannels}
              disabled={preparing || !displayUrl}
              style={{
                minHeight: 34,
                padding: "7px 12px",
                fontSize: 11.5,
                opacity: preparing || !displayUrl ? 0.56 : 0.9,
                cursor: preparing ? "wait" : !displayUrl ? "not-allowed" : "pointer",
                flex: isMobile ? "1 1 100%" : "0 0 auto",
                border: "1px solid rgba(255,255,255,0.13)",
                background: "rgba(255,255,255,0.055)",
              }}
            >
              {preparing ? "Modification des formats..." : "Appliquer ce format à tous les canaux"}
            </button>
          ) : null}
          {onPickVideoClick ? (
            <button
              type="button"
              className={btnClass}
              onClick={onPickVideoClick}
              disabled={preparing}
              style={{
                minHeight: 34,
                padding: "7px 12px",
                fontSize: 11.5,
                opacity: preparing ? 0.56 : 0.9,
                cursor: preparing ? "wait" : "pointer",
                flex: isMobile ? "1 1 100%" : "0 0 auto",
                border: "1px solid rgba(255,255,255,0.13)",
                background: "rgba(255,255,255,0.055)",
              }}
            >
              {pickVideoLabel}
            </button>
          ) : null}
        </div>

        {compact ? (
          <div style={{ fontSize: 11, lineHeight: 1.45, color: "rgba(226,232,240,0.62)" }}>
            Enregistrez ensuite la modification pour republier ce canal avec la vidéo affichée.
          </div>
        ) : null}
      </div>
    </div>
  );
}
