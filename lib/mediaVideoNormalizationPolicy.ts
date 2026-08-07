import path from "node:path";
import {
  INR_MEDIA_VIDEO_PUBLISH_MAX_BYTES,
  INR_MEDIA_VIDEO_SOURCE_MAX_BYTES,
  INR_MEDIA_VIDEO_SOURCE_MAX_MB_LABEL,
} from "./mediaRules.ts";

export const VIDEO_NORMALIZATION_JOB_TYPE = "video_normalize_v1";
export const VIDEO_NORMALIZATION_PIPELINE_VERSION = 2;
export const VIDEO_NORMALIZATION_WORKER_LEASE_SECONDS = 1_860;
export const VIDEO_NORMALIZATION_DEFAULT_BATCH_SIZE = 1;
export const VIDEO_NORMALIZATION_MAX_BATCH_SIZE = 1;
export const VIDEO_NORMALIZATION_MAX_SOURCE_BYTES =
  INR_MEDIA_VIDEO_SOURCE_MAX_BYTES;
export const VIDEO_NORMALIZATION_MAX_SOURCE_MB_LABEL =
  INR_MEDIA_VIDEO_SOURCE_MAX_MB_LABEL;

export const VIDEO_FRAME_MAX_SIDE = 1280;
export const VIDEO_THUMBNAIL_MAX_SIDE = 720;
export const VIDEO_CANONICAL_MAX_SIDE = 1920;
export const VIDEO_CANONICAL_MAX_BYTES = INR_MEDIA_VIDEO_PUBLISH_MAX_BYTES;
export const VIDEO_CANONICAL_AUDIO_BITRATE_KBPS = 128;
export const VIDEO_AUDIO_TRACK_MAX_BYTES = 40 * 1024 * 1024;
export const VIDEO_FRAME_MAX_BYTES = 5 * 1024 * 1024;

// `canonical` est le fallback MP4/H.264/AAC de publication. `ai_preview`
// reste seulement lisible pour les anciens brouillons ; les sorties IA
// actives demeurent les captures, la miniature et la piste audio.
export const VIDEO_NORMALIZATION_VARIANT_KEYS = [
  "canonical",
  "ai_preview",
  "thumbnail",
  "frame_01",
  "frame_02",
  "frame_03",
  "audio_track",
] as const;

export type VideoNormalizationVariantKey =
  (typeof VIDEO_NORMALIZATION_VARIANT_KEYS)[number];

export type VideoNormalizationPurpose =
  | "canonical"
  | "ai_preview"
  | "thumbnail"
  | "video_frame"
  | "audio_track";

const PURPOSE_BY_KEY: Record<
  VideoNormalizationVariantKey,
  VideoNormalizationPurpose
> = {
  canonical: "canonical",
  ai_preview: "ai_preview",
  thumbnail: "thumbnail",
  frame_01: "video_frame",
  frame_02: "video_frame",
  frame_03: "video_frame",
  audio_track: "audio_track",
};

const FILE_BY_KEY: Record<
  VideoNormalizationVariantKey,
  { base: string; extension: "mp4" | "jpg" | "mp3" }
> = {
  canonical: { base: "canonical", extension: "mp4" },
  ai_preview: { base: "ai-preview", extension: "mp4" },
  thumbnail: { base: "thumbnail", extension: "jpg" },
  frame_01: { base: "frame-01", extension: "jpg" },
  frame_02: { base: "frame-02", extension: "jpg" },
  frame_03: { base: "frame-03", extension: "jpg" },
  audio_track: { base: "audio-track", extension: "mp3" },
};

export function isVideoNormalizationEnabled() {
  return process.env.MEDIA_PIPELINE_VIDEO_NORMALIZATION_V1 === "true";
}

export function getVideoNormalizationPurpose(
  key: VideoNormalizationVariantKey,
) {
  return PURPOSE_BY_KEY[key];
}

export function getVideoNormalizationSignature(
  key: VideoNormalizationVariantKey,
) {
  if (key.startsWith("frame_")) {
    return `inrcy:video:frame:${key.slice(-2)}:v${VIDEO_NORMALIZATION_PIPELINE_VERSION}`;
  }
  return `inrcy:video:${key}:v${VIDEO_NORMALIZATION_PIPELINE_VERSION}`;
}

export function getVideoNormalizationFileDescriptor(
  key: VideoNormalizationVariantKey,
) {
  return FILE_BY_KEY[key];
}

export function getVideoNormalizationKeyFromSignature(value: string) {
  const signature = String(value || "").trim();
  return (
    VIDEO_NORMALIZATION_VARIANT_KEYS.find(
      (key) => getVideoNormalizationSignature(key) === signature,
    ) || null
  );
}

export function sanitizeVideoNormalizationPathSegment(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export function buildVideoNormalizationStoragePath(params: {
  accountId: string;
  mediaId: string;
  key: VideoNormalizationVariantKey;
}) {
  const account = sanitizeVideoNormalizationPathSegment(params.accountId);
  const media = sanitizeVideoNormalizationPathSegment(params.mediaId);
  const file = getVideoNormalizationFileDescriptor(params.key);
  if (!account || !media) {
    throw new Error("video_normalization_storage_path_invalid");
  }

  return path.posix.join(
    "users",
    account,
    "normalized",
    "video",
    `v${VIDEO_NORMALIZATION_PIPELINE_VERSION}`,
    media,
    `${file.base}.${file.extension}`,
  );
}

export function getVideoNormalizationRetryDelaySeconds(attemptCount: number) {
  const safeAttempt = Math.max(1, Math.min(8, Math.round(attemptCount || 1)));
  return Math.min(15 * 60, 30 * 2 ** (safeAttempt - 1));
}

export function getOrientedVideoDimensions(params: {
  width: number;
  height: number;
  rotationDegrees?: number | null;
}) {
  const width = Math.max(0, Math.round(Number(params.width || 0)));
  const height = Math.max(0, Math.round(Number(params.height || 0)));
  const normalizedRotation =
    ((Math.round(Number(params.rotationDegrees || 0)) % 360) + 360) % 360;
  const swapsAxes = normalizedRotation === 90 || normalizedRotation === 270;
  return swapsAxes ? { width: height, height: width } : { width, height };
}

function evenDimension(value: number) {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

export function fitVideoWithinMaxSide(params: {
  width: number;
  height: number;
  maxSide: number;
}) {
  const width = Math.max(1, Number(params.width || 0));
  const height = Math.max(1, Number(params.height || 0));
  const maxSide = Math.max(2, Number(params.maxSide || 0));
  const ratio = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: evenDimension(width * ratio),
    height: evenDimension(height * ratio),
  };
}

export function buildVideoFrameCaptureTimes(durationSeconds: number) {
  const duration = Number(durationSeconds || 0);
  if (!Number.isFinite(duration) || duration <= 0) return [0, 1, 2] as const;
  const maxTimestamp = Math.max(0, duration - 0.05);
  const clamp = (value: number) =>
    Math.max(0, Math.min(maxTimestamp, Number(value.toFixed(3))));
  return [
    clamp(Math.min(3, duration * 0.1)),
    clamp(duration * 0.5),
    clamp(duration * 0.9),
  ] as const;
}

// Utilisé uniquement lorsqu'un professionnel demande explicitement une
// adaptation de format par canal. Ce calcul ne fait pas partie du flux vidéo
// original de Booster.
export function getVideoTargetBitrateKbps(params: {
  durationSeconds: number;
  maxBytes: number;
  audioBitrateKbps?: number;
  minVideoKbps: number;
  maxVideoKbps: number;
}) {
  const duration = Number(params.durationSeconds || 0);
  if (!Number.isFinite(duration) || duration <= 0) return params.maxVideoKbps;
  const totalKbps = (params.maxBytes * 8 * 0.82) / duration / 1000;
  const available = totalKbps - Math.max(0, params.audioBitrateKbps || 0);
  return Math.max(
    params.minVideoKbps,
    Math.min(params.maxVideoKbps, Math.floor(available)),
  );
}
