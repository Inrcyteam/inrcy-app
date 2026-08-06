import { canPublishVideoSourceDirectly } from "./mediaVideoSourceCompatibility.ts";
import { INR_MEDIA_VIDEO_SOURCE_MAX_BYTES } from "./mediaRules.ts";

export const GOOGLE_BUSINESS_IMAGE_MIN_BYTES = 10 * 1024;
export const GOOGLE_BUSINESS_IMAGE_OFFICIAL_MAX_BYTES = 5_000_000;
// Marge sous les 5 Mo annoncés par Google pour absorber métadonnées et écarts d’unité.
export const GOOGLE_BUSINESS_IMAGE_TARGET_MAX_BYTES = 4_800_000;
export const GOOGLE_BUSINESS_IMAGE_MIN_SHORT_EDGE = 250;

export const GOOGLE_BUSINESS_VIDEO_OFFICIAL_MAX_BYTES = 75_000_000;
// Le plafond Booster est exactement le plafond Google. Une source acceptée
// ne déclenche donc jamais de conversion uniquement à cause de son poids.
export const GOOGLE_BUSINESS_VIDEO_MAX_BYTES =
  INR_MEDIA_VIDEO_SOURCE_MAX_BYTES;
export const GOOGLE_BUSINESS_VIDEO_MAX_DURATION_SECONDS = 30;
export const GOOGLE_BUSINESS_VIDEO_MIN_SHORT_EDGE = 720;

export const GOOGLE_BUSINESS_VIDEO_PROFILE = "google_business" as const;

export type GoogleBusinessVideoPreparationDecision =
  | { action: "direct"; reason: "already_compatible" }
  | {
      action: "prepare";
      reason:
        | "format_requires_normalization"
        | "resolution_requires_normalization"
        | "metadata_requires_probe";
    }
  | {
      action: "block";
      reason: "duration_too_long";
      errorCode: "video_duration_too_long";
      errorMessage: string;
    };

function knownPositiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function formatDuration(seconds: number) {
  const rounded = Math.max(1, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;
  return minutes
    ? `${minutes} min${remainingSeconds ? ` ${remainingSeconds} s` : ""}`
    : `${remainingSeconds} s`;
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
  videoCodec?: unknown;
  audioCodec?: unknown;
  frameRate?: unknown;
  fps?: unknown;
  hasAudio?: unknown;
  containerFormats?: unknown;
  pixelFormat?: unknown;
}): GoogleBusinessVideoPreparationDecision {
  const durationSeconds = knownPositiveNumber(input.durationSeconds);
  if (
    durationSeconds !== null &&
    durationSeconds > GOOGLE_BUSINESS_VIDEO_MAX_DURATION_SECONDS
  ) {
    return {
      action: "block",
      reason: "duration_too_long",
      errorCode: "video_duration_too_long",
      errorMessage: `Google Business bloqué — cette vidéo dure ${formatDuration(durationSeconds)}. Règle Google Business : 30 secondes maximum. La vidéo n’a pas été coupée automatiquement.`,
    };
  }

  const sizeBytes = knownPositiveNumber(input.sizeBytes);
  const width = knownPositiveNumber(input.width);
  const height = knownPositiveNumber(input.height);

  if (durationSeconds === null || sizeBytes === null || width === null || height === null) {
    return { action: "prepare", reason: "metadata_requires_probe" };
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
      maxBytes: GOOGLE_BUSINESS_VIDEO_MAX_BYTES,
      videoCodec: input.videoCodec,
      audioCodec: input.audioCodec,
      frameRate: input.frameRate ?? input.fps,
      hasAudio: input.hasAudio,
      containerFormats: input.containerFormats,
      pixelFormat: input.pixelFormat,
      requireCodecProof: true,
    })
  ) {
    return { action: "prepare", reason: "format_requires_normalization" };
  }

  return { action: "direct", reason: "already_compatible" };
}

export function isGoogleBusinessVideoValidationOmittable(reason: unknown) {
  // Une publication explicitement configurée en vidéo ne doit jamais devenir
  // silencieusement une publication texte. iNrCy convertit les contraintes
  // techniques ; si la conversion échoue, seul ce canal échoue avec son motif.
  void reason;
  return false;
}
