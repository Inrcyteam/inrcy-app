export const INR_MEDIA_IMAGE_MAX_BYTES = 50 * 1024 * 1024;
export const INR_MEDIA_IMAGE_MAX_MB_LABEL = "50 Mo";

// 75 Mo est le seuil de la copie prête à publier. Une source plus lourde peut
// être importée jusqu'au plafond de 300 Mo puis optimisée avant publication.
export const INR_MEDIA_VIDEO_SOURCE_MAX_BYTES = 75_000_000;
export const INR_MEDIA_VIDEO_SOURCE_MAX_MB_LABEL = "75 Mo";
export const INR_MEDIA_VIDEO_TOO_LARGE_MESSAGE =
  `Cette vidéo dépasse ${INR_MEDIA_VIDEO_SOURCE_MAX_MB_LABEL}. iNrCy vous propose de créer une copie optimisée avant de poursuivre.`;

export const INR_MEDIA_PUBLICATION_MAX_IMAGE_COUNT = 5;
export const INR_MEDIA_PUBLICATION_IMAGE_COUNT_LABEL = "5 images";
export const INR_MEDIA_PUBLICATION_IMAGES_TOTAL_MAX_BYTES = 150 * 1024 * 1024;
export const INR_MEDIA_PUBLICATION_IMAGES_TOTAL_MAX_MB_LABEL = "150 Mo";

// Publication consumes the same accepted original. A channel derivative is
// created only when the professional explicitly requests a format adaptation.
export const INR_MEDIA_VIDEO_PUBLISH_MAX_BYTES =
  INR_MEDIA_VIDEO_SOURCE_MAX_BYTES;
export const INR_MEDIA_VIDEO_PUBLISH_MAX_MB_LABEL =
  INR_MEDIA_VIDEO_SOURCE_MAX_MB_LABEL;

export const INR_MEDIA_AGENT_MAX_MEDIA_COUNT = 1;
export const INR_MEDIA_UPLOAD_BATCH_SIZE = 10;

export const INR_MEDIA_IMAGE_FORMATS_LABEL =
  "JPG/JFIF, PNG, WebP, GIF, AVIF, HEIC, HEIF, TIFF ou BMP";
export const INR_MEDIA_VIDEO_FORMATS_LABEL =
  "MP4, M4V ou MOV (H.264/AAC)";
export const INR_MEDIA_IMAGE_LIMITS_LABEL = `${INR_MEDIA_PUBLICATION_MAX_IMAGE_COUNT} images maximum · ${INR_MEDIA_IMAGE_MAX_MB_LABEL} par image · ${INR_MEDIA_PUBLICATION_IMAGES_TOTAL_MAX_MB_LABEL} au total`;
export const INR_MEDIA_VIDEO_LIMITS_LABEL = `1 vidéo maximum · source jusqu’à 300 Mo · optimisation au-delà de ${INR_MEDIA_VIDEO_SOURCE_MAX_MB_LABEL} · original conservé`;

export const INR_MEDIA_ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/x-png",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
  "image/tif",
  "image/tiff",
  "image/bmp",
  "image/x-bmp",
  "image/x-ms-bmp",
] as const;

export const INR_MEDIA_ALLOWED_IMAGE_EXTENSIONS = [
  "jpg",
  "jpeg",
  "jpe",
  "jfif",
  "png",
  "webp",
  "gif",
  "avif",
  "heic",
  "heif",
  "tif",
  "tiff",
  "bmp",
] as const;

export const INR_MEDIA_ALLOWED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/x-m4v",
  "video/quicktime",
  "application/mp4",
] as const;

export const INR_MEDIA_ALLOWED_VIDEO_EXTENSIONS = [
  "mp4",
  "m4v",
  "mov",
] as const;

function normalizeInrMediaMimeType(value: unknown) {
  return (
    String(value || "")
      .toLowerCase()
      .split(";")[0]
      ?.trim() || ""
  );
}

export function getInrMediaFileExtension(value: unknown) {
  const name = String(value || "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.toLowerCase();
  return name && name.includes(".") ? name.split(".").pop() || "" : "";
}

export function isInrMediaImageMimeType(value: unknown) {
  return INR_MEDIA_ALLOWED_IMAGE_MIME_TYPES.includes(
    normalizeInrMediaMimeType(value) as any,
  );
}

export function isInrMediaVideoMimeType(value: unknown) {
  return INR_MEDIA_ALLOWED_VIDEO_MIME_TYPES.includes(
    normalizeInrMediaMimeType(value) as any,
  );
}

export function isInrMediaImageFile(value: {
  name?: unknown;
  type?: unknown;
}) {
  const extension = getInrMediaFileExtension(value?.name);
  return (
    isInrMediaImageMimeType(value?.type) ||
    INR_MEDIA_ALLOWED_IMAGE_EXTENSIONS.includes(extension as any)
  );
}

export function isInrMediaVideoFile(value: {
  name?: unknown;
  type?: unknown;
}) {
  const extension = getInrMediaFileExtension(value?.name);
  const mimeType = normalizeInrMediaMimeType(value?.type);
  return (
    INR_MEDIA_ALLOWED_VIDEO_EXTENSIONS.includes(extension as any) &&
    (!mimeType ||
      mimeType === "application/octet-stream" ||
      isInrMediaVideoMimeType(mimeType))
  );
}

export function formatInrMediaBytes(value: number | null | undefined) {
  const bytes = Number(value || 0);
  if (!bytes || !Number.isFinite(bytes)) return "taille inconnue";
  if (bytes < 1024) return `${Math.round(bytes)} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} Mo`;
}
