export type BoosterVideoChannelKey =
  | "inrcy_site"
  | "site_web"
  | "gmb"
  | "facebook"
  | "instagram"
  | "linkedin"
  | "tiktok"
  | "youtube_shorts";

export type VideoFormat = "original" | "9_16" | "1_1" | "16_9";
export type VideoAdaptationMode = "safe_blur" | "cover_crop";

export type ChannelVideoSettings = {
  format: VideoFormat;
  adaptationMode: VideoAdaptationMode;
};

export type VideoSettingsByChannel = Partial<Record<BoosterVideoChannelKey, ChannelVideoSettings>>;
export type VideoFormatByChannel = Partial<Record<BoosterVideoChannelKey, VideoFormat>>;
export type VideoAdaptationModeByChannel = Partial<Record<BoosterVideoChannelKey, VideoAdaptationMode>>;

export const VIDEO_FORMAT_LABELS: Record<VideoFormat, string> = {
  original: "Original",
  "9_16": "9:16",
  "1_1": "1:1",
  "16_9": "16:9",
};

export const VIDEO_FORMAT_ASPECT_RATIOS: Record<VideoFormat, string> = {
  original: "16 / 9",
  "9_16": "9 / 16",
  "1_1": "1 / 1",
  "16_9": "16 / 9",
};

export const VIDEO_ADAPTATION_MODE_LABELS: Record<VideoAdaptationMode, string> = {
  safe_blur: "Cadre sobre sécurisé",
  cover_crop: "Recadrer plein écran",
};

export const VIDEO_RECOMMENDED_FORMAT_BY_CHANNEL: Record<BoosterVideoChannelKey, VideoFormat> = {
  inrcy_site: "original",
  site_web: "original",
  gmb: "original",
  facebook: "16_9",
  instagram: "16_9",
  linkedin: "16_9",
  tiktok: "9_16",
  youtube_shorts: "9_16",
};

export const VIDEO_FORMAT_OPTIONS_BY_CHANNEL: Record<BoosterVideoChannelKey, VideoFormat[]> = {
  inrcy_site: ["original", "16_9", "1_1", "9_16"],
  site_web: ["original", "16_9", "1_1", "9_16"],
  gmb: ["original", "16_9", "1_1", "9_16"],
  facebook: ["9_16", "1_1", "16_9", "original"],
  instagram: ["9_16", "1_1", "16_9", "original"],
  linkedin: ["1_1", "16_9", "9_16", "original"],
  tiktok: ["9_16", "1_1", "16_9", "original"],
  youtube_shorts: ["9_16", "1_1", "16_9", "original"],
};

export function isBoosterVideoChannelKey(value: unknown): value is BoosterVideoChannelKey {
  return ["inrcy_site", "site_web", "gmb", "facebook", "instagram", "linkedin", "tiktok", "youtube_shorts"].includes(String(value || ""));
}

export function normalizeVideoFormat(channel: BoosterVideoChannelKey, value: unknown): VideoFormat {
  const raw = String(value || "").trim() as VideoFormat;
  const allowed = VIDEO_FORMAT_OPTIONS_BY_CHANNEL[channel] || [];
  if (allowed.includes(raw)) return raw;
  return VIDEO_RECOMMENDED_FORMAT_BY_CHANNEL[channel] || "original";
}

export function normalizeVideoAdaptationMode(value: unknown): VideoAdaptationMode {
  return value === "cover_crop" ? "cover_crop" : "safe_blur";
}

type VideoSourceMetadataLike = {
  orientation?: unknown;
  width?: unknown;
  height?: unknown;
} | null | undefined;

export function getVideoSourceOrientation(sourceMetadata?: VideoSourceMetadataLike): "horizontal" | "vertical" | "square" | "unknown" {
  const rawOrientation = String(sourceMetadata?.orientation || "").trim().toLowerCase();
  if (rawOrientation === "horizontal" || rawOrientation === "vertical" || rawOrientation === "square") return rawOrientation;

  const width = Number(sourceMetadata?.width || 0);
  const height = Number(sourceMetadata?.height || 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return "unknown";
  const ratio = width / height;
  if (ratio > 1.08) return "horizontal";
  if (ratio < 0.92) return "vertical";
  return "square";
}

export function getRecommendedVideoFormatForSource(
  channel: BoosterVideoChannelKey,
  sourceMetadata?: VideoSourceMetadataLike,
): VideoFormat {
  const orientation = getVideoSourceOrientation(sourceMetadata);
  if (orientation === "horizontal") return "16_9";
  if (orientation === "vertical") return "9_16";
  if (orientation === "square") return "1_1";
  return VIDEO_RECOMMENDED_FORMAT_BY_CHANNEL[channel] || "original";
}

export function getVideoFormatLabel(channel: BoosterVideoChannelKey, format: VideoFormat, sourceMetadata?: VideoSourceMetadataLike) {
  const normalized = normalizeVideoFormat(channel, format);
  const label = VIDEO_FORMAT_LABELS[normalized] || VIDEO_FORMAT_LABELS.original;
  const recommended = getRecommendedVideoFormatForSource(channel, sourceMetadata);
  return normalized === recommended ? `${label} recommandé` : label;
}

export function getDefaultChannelVideoSettings(channel: BoosterVideoChannelKey, sourceMetadata?: VideoSourceMetadataLike): ChannelVideoSettings {
  return {
    format: getRecommendedVideoFormatForSource(channel, sourceMetadata),
    adaptationMode: "safe_blur",
  };
}

function readChannelSettingNode(node: unknown): Record<string, unknown> | null {
  return node && typeof node === "object" && !Array.isArray(node) ? (node as Record<string, unknown>) : null;
}

export function normalizeChannelVideoSettings(
  channel: BoosterVideoChannelKey,
  value: unknown,
  fallbackFormat?: unknown,
  fallbackAdaptationMode?: unknown,
  sourceMetadata?: VideoSourceMetadataLike,
): ChannelVideoSettings {
  const node = readChannelSettingNode(value);
  const recommendedFormat = getRecommendedVideoFormatForSource(channel, sourceMetadata);
  return {
    format: normalizeVideoFormat(channel, node?.format ?? fallbackFormat ?? recommendedFormat),
    adaptationMode: normalizeVideoAdaptationMode(node?.adaptationMode ?? node?.fitMode ?? fallbackAdaptationMode),
  };
}

export function buildVideoSettingsByChannel(params: {
  channels: readonly BoosterVideoChannelKey[];
  videoSettingsByChannel?: unknown;
  videoFormatByChannel?: unknown;
  videoAdaptationModeByChannel?: unknown;
  sourceMetadata?: VideoSourceMetadataLike;
}): VideoSettingsByChannel {
  const settingsNode = readChannelSettingNode(params.videoSettingsByChannel) || {};
  const formatNode = readChannelSettingNode(params.videoFormatByChannel) || {};
  const adaptationNode = readChannelSettingNode(params.videoAdaptationModeByChannel) || {};

  return Array.from(new Set(params.channels.filter(isBoosterVideoChannelKey))).reduce<VideoSettingsByChannel>((acc, channel) => {
    acc[channel] = normalizeChannelVideoSettings(
      channel,
      settingsNode[channel],
      formatNode[channel],
      adaptationNode[channel],
      params.sourceMetadata,
    );
    return acc;
  }, {});
}

export function splitVideoSettingsByChannel(settings: VideoSettingsByChannel): {
  videoFormatByChannel: VideoFormatByChannel;
  videoAdaptationModeByChannel: VideoAdaptationModeByChannel;
} {
  return Object.entries(settings).reduce(
    (acc, [rawChannel, rawSettings]) => {
      if (!isBoosterVideoChannelKey(rawChannel)) return acc;
      const normalized = normalizeChannelVideoSettings(rawChannel, rawSettings);
      acc.videoFormatByChannel[rawChannel] = normalized.format;
      acc.videoAdaptationModeByChannel[rawChannel] = normalized.adaptationMode;
      return acc;
    },
    {
      videoFormatByChannel: {} as VideoFormatByChannel,
      videoAdaptationModeByChannel: {} as VideoAdaptationModeByChannel,
    },
  );
}

export function getVideoPreviewAspectRatio(format: VideoFormat | null | undefined): string {
  return VIDEO_FORMAT_ASPECT_RATIOS[format || "original"] || VIDEO_FORMAT_ASPECT_RATIOS.original;
}

export function getVideoPreviewFitMode(mode: VideoAdaptationMode | null | undefined): "contain" | "cover" {
  return normalizeVideoAdaptationMode(mode) === "cover_crop" ? "cover" : "contain";
}
