export const INR_MEDIA_IMAGE_MAX_BYTES = 40 * 1024 * 1024;
export const INR_MEDIA_IMAGE_MAX_MB_LABEL = "40 Mo";

export const INR_MEDIA_VIDEO_SOURCE_MAX_BYTES = 100 * 1024 * 1024;
export const INR_MEDIA_VIDEO_SOURCE_MAX_MB_LABEL = "100 Mo";

export const INR_MEDIA_PUBLICATION_MAX_IMAGE_COUNT = 5;
export const INR_MEDIA_PUBLICATION_IMAGE_COUNT_LABEL = "5 images";
export const INR_MEDIA_PUBLICATION_IMAGES_TOTAL_MAX_BYTES = 40 * 1024 * 1024;
export const INR_MEDIA_PUBLICATION_IMAGES_TOTAL_MAX_MB_LABEL = "40 Mo";

export const INR_MEDIA_VIDEO_PUBLISH_MAX_BYTES = 40 * 1024 * 1024;
export const INR_MEDIA_VIDEO_PUBLISH_MAX_MB_LABEL = "40 Mo";

export const INR_MEDIA_AGENT_MAX_MEDIA_COUNT = 1;
export const INR_MEDIA_UPLOAD_BATCH_SIZE = 10;

export const INR_MEDIA_ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const INR_MEDIA_ALLOWED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
] as const;

export const INR_MEDIA_ALLOWED_VIDEO_EXTENSIONS = [
  "mp4",
  "mov",
  "webm",
  "m4v",
] as const;

export function isInrMediaImageMimeType(value: unknown) {
  return INR_MEDIA_ALLOWED_IMAGE_MIME_TYPES.includes(
    String(value || "")
      .toLowerCase()
      .split(";")[0]
      ?.trim() as any,
  );
}

export function isInrMediaVideoMimeType(value: unknown) {
  return INR_MEDIA_ALLOWED_VIDEO_MIME_TYPES.includes(
    String(value || "")
      .toLowerCase()
      .split(";")[0]
      ?.trim() as any,
  );
}

export function formatInrMediaBytes(value: number | null | undefined) {
  const bytes = Number(value || 0);
  if (!bytes || !Number.isFinite(bytes)) return "taille inconnue";
  if (bytes < 1024) return `${Math.round(bytes)} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} Mo`;
}
