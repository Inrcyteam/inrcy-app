/**
 * Règles de transport du pipeline média universel iNrCy.
 *
 * Ces valeurs ne sont pas des limites éditoriales visibles par le professionnel.
 * Elles protègent uniquement l'infrastructure contre les fichiers anormaux ou
 * les abus. La normalisation et les limites finales des réseaux sont traitées
 * par les étapes suivantes du pipeline.
 */

export const UNIVERSAL_MEDIA_STANDARD_UPLOAD_MAX_BYTES = 6 * 1024 * 1024;
export const UNIVERSAL_MEDIA_TUS_CHUNK_SIZE_BYTES = 6 * 1024 * 1024;
export const UNIVERSAL_MEDIA_TUS_RETRY_DELAYS_MS = [
  0,
  3_000,
  5_000,
  10_000,
  20_000,
] as const;

export const UNIVERSAL_MEDIA_IMAGE_HARD_MAX_BYTES = 500 * 1024 * 1024;
export const UNIVERSAL_MEDIA_VIDEO_HARD_MAX_BYTES = 5 * 1024 * 1024 * 1024;

export const UNIVERSAL_MEDIA_UPLOAD_TARGETS = [
  "booster_prepared_image",
  "booster_draft_image",
  "booster_video_source",
  "media_library_source",
  "workspace_source",
] as const;

export type UniversalMediaUploadTarget =
  (typeof UNIVERSAL_MEDIA_UPLOAD_TARGETS)[number];
export type UniversalMediaUploadProtocol = "signed" | "tus";
export type UniversalUploadMediaType = "image" | "video";

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/tiff",
  "image/bmp",
]);

const VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
  "video/webm",
  "video/mpeg",
  "video/x-msvideo",
  "video/x-matroska",
  "video/3gpp",
  "video/3gpp2",
]);

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "avif",
  "heic",
  "heif",
  "tif",
  "tiff",
  "bmp",
]);

const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "mov",
  "m4v",
  "webm",
  "mpeg",
  "mpg",
  "avi",
  "mkv",
  "3gp",
  "3g2",
]);

const MIME_TO_EXTENSION: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/tiff": "tiff",
  "image/bmp": "bmp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/x-m4v": "m4v",
  "video/webm": "webm",
  "video/mpeg": "mpeg",
  "video/x-msvideo": "avi",
  "video/x-matroska": "mkv",
  "video/3gpp": "3gp",
  "video/3gpp2": "3g2",
};

export function normalizeUniversalMediaMime(value: unknown): string {
  return (
    String(value || "")
      .toLowerCase()
      .split(";")[0]
      ?.trim() || ""
  );
}

export function getUniversalMediaFileExtension(name: unknown): string {
  const rawName = String(name || "")
    .replace(/\\/g, "/")
    .split("/")
    .pop();
  if (!rawName || !rawName.includes(".")) return "";
  return rawName.split(".").pop()?.toLowerCase() || "";
}

export function detectUniversalUploadMediaType(params: {
  name?: unknown;
  mimeType?: unknown;
}): UniversalUploadMediaType | null {
  const mime = normalizeUniversalMediaMime(params.mimeType);
  const extension = getUniversalMediaFileExtension(params.name);

  if (IMAGE_MIME_TYPES.has(mime) || IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }
  if (VIDEO_MIME_TYPES.has(mime) || VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }
  return null;
}

export function getUniversalMediaContentType(params: {
  name?: unknown;
  mimeType?: unknown;
  mediaType: UniversalUploadMediaType;
}): string {
  const mime = normalizeUniversalMediaMime(params.mimeType);
  if (
    (params.mediaType === "image" && IMAGE_MIME_TYPES.has(mime)) ||
    (params.mediaType === "video" && VIDEO_MIME_TYPES.has(mime))
  ) {
    return mime;
  }

  const extension = getUniversalMediaFileExtension(params.name);
  const extensionMime: Readonly<Record<string, string>> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
    heic: "image/heic",
    heif: "image/heif",
    tif: "image/tiff",
    tiff: "image/tiff",
    bmp: "image/bmp",
    mp4: "video/mp4",
    mov: "video/quicktime",
    m4v: "video/x-m4v",
    webm: "video/webm",
    mpeg: "video/mpeg",
    mpg: "video/mpeg",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
    "3gp": "video/3gpp",
    "3g2": "video/3gpp2",
  };

  return (
    extensionMime[extension] ||
    (params.mediaType === "video" ? "video/mp4" : "image/jpeg")
  );
}

export function getUniversalMediaSafeExtension(params: {
  name?: unknown;
  mimeType?: unknown;
  mediaType: UniversalUploadMediaType;
}): string {
  const mime = getUniversalMediaContentType(params);
  const byMime = MIME_TO_EXTENSION[mime];
  if (byMime) return byMime;

  const extension = getUniversalMediaFileExtension(params.name);
  const allowed = params.mediaType === "image" ? IMAGE_EXTENSIONS : VIDEO_EXTENSIONS;
  if (allowed.has(extension)) return extension === "jpeg" ? "jpg" : extension;
  return params.mediaType === "video" ? "mp4" : "jpg";
}

export function selectUniversalMediaUploadProtocol(
  sizeBytes: number,
): UniversalMediaUploadProtocol {
  return Number(sizeBytes || 0) > UNIVERSAL_MEDIA_STANDARD_UPLOAD_MAX_BYTES
    ? "tus"
    : "signed";
}

export function getUniversalMediaHardMaxBytes(
  mediaType: UniversalUploadMediaType,
): number {
  return mediaType === "video"
    ? UNIVERSAL_MEDIA_VIDEO_HARD_MAX_BYTES
    : UNIVERSAL_MEDIA_IMAGE_HARD_MAX_BYTES;
}

export function isUniversalMediaUploadTarget(
  value: unknown,
): value is UniversalMediaUploadTarget {
  return UNIVERSAL_MEDIA_UPLOAD_TARGETS.includes(
    String(value || "") as UniversalMediaUploadTarget,
  );
}

export function targetAcceptsUniversalMediaType(
  target: UniversalMediaUploadTarget,
  mediaType: UniversalUploadMediaType,
): boolean {
  if (
    target === "booster_prepared_image" ||
    target === "booster_draft_image"
  ) {
    return mediaType === "image";
  }
  if (target === "booster_video_source") return mediaType === "video";
  return true;
}

export function buildDirectStorageResumableEndpoint(
  supabaseUrl: string,
): string {
  const parsed = new URL(String(supabaseUrl || "").trim());
  const hostname = parsed.hostname;
  const projectRef = hostname.split(".")[0] || "";
  if (!projectRef) {
    throw new Error("URL Supabase invalide pour l'upload résumable.");
  }
  return `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;
}

export function sanitizeUniversalMediaSegment(
  value: unknown,
  fallback: string,
  maxLength = 90,
): string {
  const safe = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/[-_]{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, maxLength);
  return safe || fallback;
}

export function sanitizeUniversalMediaFileName(params: {
  name?: unknown;
  mimeType?: unknown;
  mediaType: UniversalUploadMediaType;
}): string {
  const rawName =
    String(params.name || "media-inrcy")
      .replace(/\\/g, "/")
      .split("/")
      .pop() || "media-inrcy";
  const base = sanitizeUniversalMediaSegment(
    rawName.replace(/\.[^.]*$/, ""),
    "media-inrcy",
    80,
  );
  return `${base}.${getUniversalMediaSafeExtension(params)}`.toLowerCase();
}

export function clampUniversalUploadProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}
