import path from "node:path";

export const IMAGE_NORMALIZATION_JOB_TYPE = "image_normalize_v1";
export const IMAGE_NORMALIZATION_PIPELINE_VERSION = 1;
export const IMAGE_NORMALIZATION_WORKER_LEASE_SECONDS = 180;
export const IMAGE_NORMALIZATION_DEFAULT_BATCH_SIZE = 2;
export const IMAGE_NORMALIZATION_MAX_BATCH_SIZE = 4;
export const IMAGE_NORMALIZATION_MAX_INPUT_PIXELS = 100_000_000;
export const IMAGE_NORMALIZATION_MAX_SOURCE_BYTES = 500 * 1024 * 1024;
export const IMAGE_NORMALIZATION_HEIC_FALLBACK_MAX_BYTES = 120 * 1024 * 1024;

export const IMAGE_CANONICAL_MAX_SIDE = 4096;
export const IMAGE_AI_PREVIEW_MAX_SIDE = 1280;
export const IMAGE_THUMBNAIL_MAX_SIDE = 480;

export const IMAGE_CANONICAL_JPEG_QUALITY = 88;
export const IMAGE_AI_PREVIEW_JPEG_QUALITY = 76;
export const IMAGE_THUMBNAIL_JPEG_QUALITY = 72;

export const IMAGE_NORMALIZATION_PURPOSES = [
  "canonical",
  "ai_preview",
  "thumbnail",
] as const;

export type ImageNormalizationPurpose =
  (typeof IMAGE_NORMALIZATION_PURPOSES)[number];

export type ImageNormalizationOutputFormat = "jpeg" | "png";

export type ImageNormalizationVariantSpec = {
  purpose: ImageNormalizationPurpose;
  signature: string;
  maxSide: number;
  mimeType: "image/jpeg" | "image/png";
  extension: "jpg" | "png";
};

export function isImageNormalizationEnabled() {
  return process.env.MEDIA_PIPELINE_IMAGE_NORMALIZATION_V1 === "true";
}

export function getImageNormalizationSignature(
  purpose: ImageNormalizationPurpose,
) {
  return `inrcy:image:${purpose}:v${IMAGE_NORMALIZATION_PIPELINE_VERSION}`;
}

export function sanitizeImageNormalizationPathSegment(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export function buildImageNormalizationStoragePath(params: {
  accountId: string;
  mediaId: string;
  purpose: ImageNormalizationPurpose;
  extension: "jpg" | "png";
}) {
  const account = sanitizeImageNormalizationPathSegment(params.accountId);
  const media = sanitizeImageNormalizationPathSegment(params.mediaId);
  const purpose = sanitizeImageNormalizationPathSegment(params.purpose);
  if (!account || !media || !purpose) {
    throw new Error("image_normalization_storage_path_invalid");
  }

  return path.posix.join(
    "users",
    account,
    "normalized",
    "image",
    `v${IMAGE_NORMALIZATION_PIPELINE_VERSION}`,
    media,
    `${purpose}.${params.extension}`,
  );
}

export function getImageNormalizationRetryDelaySeconds(attemptCount: number) {
  const safeAttempt = Math.max(1, Math.min(8, Math.round(attemptCount || 1)));
  return Math.min(15 * 60, 30 * 2 ** (safeAttempt - 1));
}

export function isHeicMimeOrName(mimeType: string, fileName = "") {
  const mime = String(mimeType || "")
    .toLowerCase()
    .split(";")[0]
    ?.trim();
  const name = String(fileName || "").toLowerCase();
  return (
    mime === "image/heic" ||
    mime === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}
