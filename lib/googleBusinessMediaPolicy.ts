import { canPublishVideoSourceDirectly } from "./mediaVideoSourceCompatibility.ts";

export const GOOGLE_BUSINESS_IMAGE_MIN_BYTES = 10 * 1024;
export const GOOGLE_BUSINESS_IMAGE_OFFICIAL_MAX_BYTES = 5_000_000;
// Marge sous les 5 Mo annoncés par Google pour absorber métadonnées et écarts d’unité.
export const GOOGLE_BUSINESS_IMAGE_TARGET_MAX_BYTES = 4_800_000;
export const GOOGLE_BUSINESS_IMAGE_MIN_SHORT_EDGE = 250;

export const GOOGLE_BUSINESS_VIDEO_OFFICIAL_MAX_BYTES = 75_000_000;
// Marge volontaire sous la limite Google afin d'éviter les rejets à la frontière.
export const GOOGLE_BUSINESS_VIDEO_TARGET_MAX_BYTES = 72_000_000;
export const GOOGLE_BUSINESS_VIDEO_MAX_DURATION_SECONDS = 30;
export const GOOGLE_BUSINESS_VIDEO_MIN_SHORT_EDGE = 720;

export const GOOGLE_BUSINESS_VIDEO_PROFILE = "google_business" as const;

export type GoogleBusinessVideoPreparationDecision =
  | { action: "direct"; reason: "already_compatible" }
  | {
      action: "prepare";
      reason:
        | "size_requires_compression"
        | "format_requires_normalization"
        | "resolution_requires_normalization"
        | "metadata_requires_probe";
    }
  | {
      action: "omit";
      reason: "duration_too_long";
      warningCode: "google_business_video_too_long";
      warningMessage: string;
    };

function knownPositiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function getGoogleBusinessVideoPreparationDecision(input: {
  name?: unknown;
  type?: unknown;
  mimeType?: unknown;
  storagePath?: unknown;
  sizeBytes?: unknown;
  durationSeconds?: unknown;
  width?: unknown;
  height?: unknown;
}): GoogleBusinessVideoPreparationDecision {
  const durationSeconds = knownPositiveNumber(input.durationSeconds);
  if (
    durationSeconds !== null &&
    durationSeconds > GOOGLE_BUSINESS_VIDEO_MAX_DURATION_SECONDS
  ) {
    return {
      action: "omit",
      reason: "duration_too_long",
      warningCode: "google_business_video_too_long",
      warningMessage:
        "Google Business a publié le texte sans vidéo, car la vidéo dépasse 30 secondes. La vidéo originale n’a pas été coupée automatiquement.",
    };
  }

  const sizeBytes = knownPositiveNumber(input.sizeBytes);
  const width = knownPositiveNumber(input.width);
  const height = knownPositiveNumber(input.height);

  if (durationSeconds === null || sizeBytes === null || width === null || height === null) {
    return { action: "prepare", reason: "metadata_requires_probe" };
  }

  if (sizeBytes > GOOGLE_BUSINESS_VIDEO_TARGET_MAX_BYTES) {
    return { action: "prepare", reason: "size_requires_compression" };
  }

  if (Math.min(width, height) < GOOGLE_BUSINESS_VIDEO_MIN_SHORT_EDGE) {
    return { action: "prepare", reason: "resolution_requires_normalization" };
  }

  if (
    !canPublishVideoSourceDirectly({
      name: input.name,
      type: input.type,
      mimeType: input.mimeType,
      storagePath: input.storagePath,
      sizeBytes,
      maxBytes: GOOGLE_BUSINESS_VIDEO_TARGET_MAX_BYTES,
    })
  ) {
    return { action: "prepare", reason: "format_requires_normalization" };
  }

  return { action: "direct", reason: "already_compatible" };
}

export function isGoogleBusinessVideoValidationOmittable(reason: unknown) {
  return [
    "video_size_unknown",
    "video_too_large",
    "video_format_invalid",
    "video_duration_unknown",
    "video_duration_too_long",
    "video_resolution_unknown",
    "video_resolution_too_small",
  ].includes(String(reason || ""));
}
