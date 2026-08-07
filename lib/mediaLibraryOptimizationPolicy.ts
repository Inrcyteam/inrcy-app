import { INR_MEDIA_IMAGE_MAX_BYTES, INR_MEDIA_VIDEO_SOURCE_MAX_BYTES } from "./mediaRules.ts";

/**
 * The Media Library may keep a heavier original than Booster accepts. The
 * optimizer creates a second, publication-ready file and never mutates the
 * source selected by the professional.
 */
export const MEDIA_LIBRARY_OPTIMIZATION_PIPELINE_VERSION = 2;
export const MEDIA_LIBRARY_VIDEO_OPTIMIZATION_JOB_TYPE =
  "media_library_video_compress_v1";
export const MEDIA_LIBRARY_IMAGE_OPTIMIZATION_JOB_TYPE =
  "media_library_image_optimize_v1";
export const MEDIA_LIBRARY_OPTIMIZATION_JOB_TYPES = [
  MEDIA_LIBRARY_VIDEO_OPTIMIZATION_JOB_TYPE,
  MEDIA_LIBRARY_IMAGE_OPTIMIZATION_JOB_TYPE,
] as const;

export const MEDIA_LIBRARY_VIDEO_SOURCE_MAX_BYTES = 300 * 1024 * 1024;
export const MEDIA_LIBRARY_VIDEO_SOURCE_MAX_MB_LABEL = "300 Mo";
export const MEDIA_LIBRARY_IMAGE_SOURCE_MAX_BYTES = 300 * 1024 * 1024;
export const MEDIA_LIBRARY_IMAGE_SOURCE_MAX_MB_LABEL = "300 Mo";
export const MEDIA_LIBRARY_VIDEO_OUTPUT_MAX_BYTES =
  INR_MEDIA_VIDEO_SOURCE_MAX_BYTES;
export const MEDIA_LIBRARY_VIDEO_TARGET_BYTES = MEDIA_LIBRARY_VIDEO_OUTPUT_MAX_BYTES;
export const MEDIA_LIBRARY_VIDEO_RETRY_TARGET_BYTES = 58_000_000;

// The business-facing compressor uses decimal megabytes so 75 Mo is displayed
// as 75 Mo (and not ~72 MiB). Booster still keeps its exact historical byte
// ceiling for videos.
export const MEDIA_LIBRARY_IMAGE_OUTPUT_MAX_BYTES = Math.min(
  INR_MEDIA_IMAGE_MAX_BYTES,
  50_000_000,
);
export const MEDIA_LIBRARY_IMAGE_TARGET_BYTES = MEDIA_LIBRARY_IMAGE_OUTPUT_MAX_BYTES;
export const MEDIA_LIBRARY_EMAIL_TARGET_BYTES = 20_000_000;
export const MEDIA_LIBRARY_MIN_TARGET_BYTES = 5_000_000;

export const MEDIA_LIBRARY_OPTIMIZATION_WORKER_LEASE_SECONDS = 1_800;
export const MEDIA_LIBRARY_OPTIMIZATION_MAX_ATTEMPTS = 3;

export type MediaLibraryOptimizationMediaType = "image" | "video";
export type MediaLibraryOptimizationJobType =
  (typeof MEDIA_LIBRARY_OPTIMIZATION_JOB_TYPES)[number];

export function getMediaLibraryOptimizationJobType(
  mediaType: MediaLibraryOptimizationMediaType,
): MediaLibraryOptimizationJobType {
  return mediaType === "video"
    ? MEDIA_LIBRARY_VIDEO_OPTIMIZATION_JOB_TYPE
    : MEDIA_LIBRARY_IMAGE_OPTIMIZATION_JOB_TYPE;
}

export function getMediaLibraryOptimizationOutputLimit(
  mediaType: MediaLibraryOptimizationMediaType,
) {
  return mediaType === "video"
    ? MEDIA_LIBRARY_VIDEO_OUTPUT_MAX_BYTES
    : MEDIA_LIBRARY_IMAGE_OUTPUT_MAX_BYTES;
}

export function normalizeMediaLibraryOptimizationTarget(params: {
  mediaType: MediaLibraryOptimizationMediaType;
  targetBytes?: number | null;
}) {
  const maxBytes = getMediaLibraryOptimizationOutputLimit(params.mediaType);
  const requested = Math.round(Number(params.targetBytes || maxBytes));
  return Math.max(MEDIA_LIBRARY_MIN_TARGET_BYTES, Math.min(maxBytes, requested));
}

export function needsMediaLibraryOptimization(params: {
  mediaType: MediaLibraryOptimizationMediaType;
  sizeBytes: number | null | undefined;
  targetBytes?: number | null;
}) {
  const sizeBytes = Math.max(0, Number(params.sizeBytes || 0));
  const targetBytes = normalizeMediaLibraryOptimizationTarget({
    mediaType: params.mediaType,
    targetBytes: params.targetBytes,
  });
  return sizeBytes > targetBytes;
}

export function buildMediaLibraryOptimizationIdempotencyKey(params: {
  mediaId: string;
  mediaType: MediaLibraryOptimizationMediaType;
  targetBytes?: number | null;
}) {
  const targetBytes = normalizeMediaLibraryOptimizationTarget({
    mediaType: params.mediaType,
    targetBytes: params.targetBytes,
  });
  return `media-library-${params.mediaType}-compress-v${MEDIA_LIBRARY_OPTIMIZATION_PIPELINE_VERSION}:${params.mediaId}:${targetBytes}`;
}

export function buildOptimizedMediaTitle(title: unknown) {
  const clean = String(title || "Média iNrCy")
    .trim()
    .replace(/\s+[—-]\s+(?:optimis[ée]e? pour Booster|compress[ée]e?)$/i, "")
    .slice(0, 145);
  return `${clean || "Média iNrCy"} — compressé`;
}

export function buildOptimizedFileStem(value: unknown) {
  const stem = String(value || "media-inrcy")
    .replace(/\.[a-z0-9]{2,6}$/i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return stem || "media-inrcy";
}

export function buildOptimizedStoragePath(params: {
  accountId: string;
  mediaType: MediaLibraryOptimizationMediaType;
  originalName: unknown;
  jobId: string;
}) {
  const folder = params.mediaType === "video" ? "video" : "image";
  const extension = params.mediaType === "video" ? "mp4" : "jpg";
  const year = new Date().getUTCFullYear();
  return `users/${params.accountId}/${folder}/optimized/${year}/${params.jobId}-${buildOptimizedFileStem(params.originalName)}.${extension}`;
}

export type VideoCompressionProfile = {
  targetBytes: number;
  totalBitrate: number;
  videoBitrate: number;
  audioBitrate: number;
  maxSide: number;
};

export function buildVideoCompressionProfile(params: {
  durationSeconds: number;
  hasAudio: boolean;
  targetBytes?: number;
}): VideoCompressionProfile {
  const durationSeconds = Math.max(1, Number(params.durationSeconds || 0));
  const targetBytes = normalizeMediaLibraryOptimizationTarget({
    mediaType: "video",
    targetBytes: params.targetBytes,
  });
  // Keep 4% for MP4 container overhead and faststart metadata.
  const totalBitrate = Math.max(
    120_000,
    Math.floor((targetBytes * 8 * 0.96) / durationSeconds),
  );
  const audioBitrate = params.hasAudio
    ? Math.max(48_000, Math.min(96_000, Math.floor(totalBitrate * 0.12)))
    : 0;
  const videoBitrate = Math.max(72_000, totalBitrate - audioBitrate);
  const maxSide =
    videoBitrate >= 4_000_000
      ? 1_920
      : videoBitrate >= 2_000_000
        ? 1_600
        : videoBitrate >= 1_050_000
          ? 1_280
          : videoBitrate >= 550_000
            ? 960
            : 640;

  return {
    targetBytes,
    totalBitrate,
    videoBitrate,
    audioBitrate,
    maxSide,
  };
}

export function mapMediaLibraryOptimizationStage(progress: number) {
  const safe = Math.max(0, Math.min(100, Math.round(progress)));
  if (safe < 8) return "Préparation du média";
  if (safe < 18) return "Lecture du fichier original";
  if (safe < 90) return "Compression du média";
  if (safe < 96) return "Vérification du fichier";
  if (safe < 100) return "Enregistrement dans la Médiathèque";
  return "Copie compressée créée";
}
