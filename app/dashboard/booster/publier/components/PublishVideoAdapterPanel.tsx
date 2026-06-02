import type { BoosterVideoTransformedVariant } from "@/lib/boosterVideoTransforms";
import BoosterVideoFormatManager, {
  type BoosterVideoPreparationState,
} from "./BoosterVideoFormatManager";
import {
  getRecommendedVideoFormatForSource,
  type BoosterVideoSourceMetadata,
  type ChannelKey,
  type ChannelMediaMode,
  type VideoAdaptationMode,
  type VideoFormat,
} from "../publishModal.shared";

type PublishModalStyles = Readonly<Record<string, string>>;

export type PublishVideoVariantPreparationState = BoosterVideoPreparationState;

type PublishVideoAdapterPanelProps = {
  styles: PublishModalStyles;
  isMobile: boolean;
  activeChannel: ChannelKey;
  videoFile: File | null;
  videoPreviewUrl: string;
  videoDurationSeconds: number | null;
  videoSourceMetadata: BoosterVideoSourceMetadata | null;
  videoFormatByChannel: Partial<Record<ChannelKey, VideoFormat>>;
  setVideoFormatForChannel: (channel: ChannelKey, format: VideoFormat) => void;
  videoAdaptationModeByChannel: Partial<Record<ChannelKey, VideoAdaptationMode>>;
  setVideoAdaptationModeForChannel: (
    channel: ChannelKey,
    mode: VideoAdaptationMode,
  ) => void;
  videoVariantPreparationByChannel?: Partial<
    Record<ChannelKey, PublishVideoVariantPreparationState>
  >;
  videoTransformedVariants?: BoosterVideoTransformedVariant[];
  videoPreviewVariantsPreparing?: boolean;
  onApplyVideoFormatForChannel?: (channel: ChannelKey) => void;
  onApplyVideoFormatToAllChannels?: (channel: ChannelKey) => void;
  setChannelMediaMode: (channel: ChannelKey, mode: ChannelMediaMode) => void;
};

export default function PublishVideoAdapterPanel({
  styles,
  isMobile,
  activeChannel,
  videoFile,
  videoPreviewUrl,
  videoDurationSeconds,
  videoSourceMetadata,
  videoFormatByChannel,
  setVideoFormatForChannel,
  videoAdaptationModeByChannel,
  setVideoAdaptationModeForChannel,
  videoVariantPreparationByChannel = {},
  videoTransformedVariants = [],
  videoPreviewVariantsPreparing = false,
  onApplyVideoFormatForChannel,
  onApplyVideoFormatToAllChannels,
  setChannelMediaMode,
}: PublishVideoAdapterPanelProps) {
  const hasVideoMedia = Boolean(videoFile || videoPreviewUrl);

  if (!hasVideoMedia) {
    return (
      <div style={{ fontSize: 13, opacity: 0.75 }}>
        Ajoutez une vidéo ou choisissez Photos / Aucun média pour ce canal.
      </div>
    );
  }

  const currentFormat =
    videoFormatByChannel[activeChannel] ||
    getRecommendedVideoFormatForSource(activeChannel, videoSourceMetadata);
  const adaptationMode = videoAdaptationModeByChannel[activeChannel] || "safe_blur";
  const preparationState = videoVariantPreparationByChannel[activeChannel] || null;

  return (
    <BoosterVideoFormatManager
      isMobile={isMobile}
      channel={activeChannel}
      videoName={videoFile?.name || "Vidéo sélectionnée"}
      videoDisplayUrl={videoPreviewUrl}
      videoSize={videoFile?.size || videoSourceMetadata?.size || 0}
      videoDurationSeconds={videoDurationSeconds}
      videoSourceMetadata={videoSourceMetadata}
      currentFormat={currentFormat}
      adaptationMode={adaptationMode}
      videoTransformedVariants={videoTransformedVariants}
      preparationState={preparationState}
      preparing={videoPreviewVariantsPreparing}
      onFormatChange={(format) => setVideoFormatForChannel(activeChannel, format)}
      onAdaptationModeChange={(mode) =>
        setVideoAdaptationModeForChannel(activeChannel, mode)
      }
      onApplyFormat={
        onApplyVideoFormatForChannel
          ? () => onApplyVideoFormatForChannel(activeChannel)
          : undefined
      }
      onApplyFormatToAllChannels={
        onApplyVideoFormatToAllChannels
          ? () => onApplyVideoFormatToAllChannels(activeChannel)
          : undefined
      }
      onRemoveFromChannel={() => setChannelMediaMode(activeChannel, "none")}
      buttonClassName={styles.secondaryBtn}
    />
  );
}
