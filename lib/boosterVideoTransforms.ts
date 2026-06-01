import {
  getDefaultChannelVideoSettings,
  isBoosterVideoChannelKey,
  normalizeVideoAdaptationMode,
  normalizeVideoFormat,
  type BoosterVideoChannelKey,
  type VideoAdaptationMode,
  type VideoFormat,
} from "@/lib/boosterVideoSettings";

export type BoosterVideoTransformTarget = {
  format: VideoFormat;
  width: number | null;
  height: number | null;
  aspectRatio: string;
  label: string;
};

export type BoosterVideoQualityProfile = {
  label: string;
  crf: number;
  videoBitrate: string;
  maxrate: string;
  bufsize: string;
  audioBitrate: string;
  maxOutputBytes: number;
};

export type BoosterVideoTransformRequestVariant = {
  key?: string;
  channel?: BoosterVideoChannelKey;
  format?: VideoFormat;
  adaptationMode?: VideoAdaptationMode;
};

export type BoosterVideoTransformVariantPlan = {
  key: string;
  channel: BoosterVideoChannelKey | null;
  format: VideoFormat;
  adaptationMode: VideoAdaptationMode;
  target: BoosterVideoTransformTarget;
  signature: string;
};

export type BoosterVideoTransformedVariant = BoosterVideoTransformVariantPlan & {
  storagePath: string;
  publicUrl: string;
  contentType: string;
  size: number;
  duration: number | null;
  generatedAt: string;
  quality?: BoosterVideoQualityProfile;
  // Compatibilité avec les anciennes données / payloads côté UI.
  url?: string | null;
  name?: string | null;
  type?: string | null;
};

export type BoosterVideoTransformSource = {
  storagePath?: string | null;
  publicUrl?: string | null;
  url?: string | null;
  name?: string | null;
  type?: string | null;
  size?: number | null;
  duration?: number | null;
  sourceMetadata?: {
    width?: number | null;
    height?: number | null;
    duration?: number | null;
    [key: string]: unknown;
  } | null;
};

export const VIDEO_TRANSFORM_TARGETS: Record<Exclude<VideoFormat, "original">, BoosterVideoTransformTarget> = {
  "9_16": {
    format: "9_16",
    width: 1080,
    height: 1920,
    aspectRatio: "9:16",
    label: "9:16 vertical",
  },
  "1_1": {
    format: "1_1",
    width: 1080,
    height: 1080,
    aspectRatio: "1:1",
    label: "1:1 carré",
  },
  "16_9": {
    format: "16_9",
    width: 1920,
    height: 1080,
    aspectRatio: "16:9",
    label: "16:9 horizontal",
  },
};

export const VIDEO_TRANSFORM_QUALITY_PROFILES: Record<VideoFormat, BoosterVideoQualityProfile> = {
  "9_16": {
    label: "Qualité verticale optimisée",
    crf: 24,
    videoBitrate: "4200k",
    maxrate: "5500k",
    bufsize: "8400k",
    audioBitrate: "128k",
    maxOutputBytes: 40 * 1024 * 1024,
  },
  "1_1": {
    label: "Qualité carrée optimisée",
    crf: 24,
    videoBitrate: "3600k",
    maxrate: "4800k",
    bufsize: "7200k",
    audioBitrate: "128k",
    maxOutputBytes: 40 * 1024 * 1024,
  },
  "16_9": {
    label: "Qualité horizontale optimisée",
    crf: 23,
    videoBitrate: "5000k",
    maxrate: "6800k",
    bufsize: "10000k",
    audioBitrate: "128k",
    maxOutputBytes: 40 * 1024 * 1024,
  },
  original: {
    label: "Original optimisé",
    crf: 23,
    videoBitrate: "5200k",
    maxrate: "7000k",
    bufsize: "10000k",
    audioBitrate: "128k",
    maxOutputBytes: 40 * 1024 * 1024,
  },
};

export function getVideoTransformQualityProfile(format: VideoFormat): BoosterVideoQualityProfile {
  return VIDEO_TRANSFORM_QUALITY_PROFILES[format] || VIDEO_TRANSFORM_QUALITY_PROFILES.original;
}

export function getVideoTransformTarget(format: VideoFormat): BoosterVideoTransformTarget {
  if (format === "original") {
    return {
      format: "original",
      width: null,
      height: null,
      aspectRatio: "original",
      label: "Format original optimisé",
    };
  }
  return VIDEO_TRANSFORM_TARGETS[format] || getVideoTransformTarget("original");
}

function sanitizeVariantKey(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/[-_]{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .toLowerCase()
    .slice(0, 90) || "variant";
}

export function buildVideoTransformSignature(format: VideoFormat, adaptationMode: VideoAdaptationMode) {
  return `${format}:${adaptationMode}`;
}

export function normalizeVideoTransformVariant(
  raw: BoosterVideoTransformRequestVariant,
  index: number,
): BoosterVideoTransformVariantPlan | null {
  const channel = isBoosterVideoChannelKey(raw.channel) ? raw.channel : null;
  const channelDefaults = channel ? getDefaultChannelVideoSettings(channel) : { format: "original" as VideoFormat, adaptationMode: "safe_blur" as VideoAdaptationMode };
  const format = channel ? normalizeVideoFormat(channel, raw.format || channelDefaults.format) : (raw.format || "original");
  const adaptationMode = normalizeVideoAdaptationMode(raw.adaptationMode || channelDefaults.adaptationMode);
  const signature = buildVideoTransformSignature(format, adaptationMode);
  const key = sanitizeVariantKey(raw.key || (channel ? `${channel}-${signature}` : `variant-${index + 1}-${signature}`));

  return {
    key,
    channel,
    format,
    adaptationMode,
    target: getVideoTransformTarget(format),
    signature,
  };
}

export function buildVideoTransformPlan(variants: readonly BoosterVideoTransformRequestVariant[]): BoosterVideoTransformVariantPlan[] {
  const seen = new Set<string>();
  const plans: BoosterVideoTransformVariantPlan[] = [];

  variants.forEach((variant, index) => {
    const normalized = normalizeVideoTransformVariant(variant, index);
    if (!normalized) return;
    const dedupeKey = normalized.signature;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    plans.push(normalized);
  });

  return plans;
}

export function getVariantForChannel(
  variants: readonly BoosterVideoTransformedVariant[] | null | undefined,
  channel: BoosterVideoChannelKey,
  format: VideoFormat,
  adaptationMode: VideoAdaptationMode,
) {
  const signature = buildVideoTransformSignature(format, adaptationMode);
  return (variants || []).find((variant) => variant.signature === signature || variant.channel === channel) || null;
}
