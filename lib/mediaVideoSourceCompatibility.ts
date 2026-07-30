const DIRECT_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/x-m4v",
  "application/mp4",
]);

const DIRECT_VIDEO_EXTENSIONS = new Set(["mp4", "m4v"]);

function cleanMimeType(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split(";")[0]
    ?.trim();
}

function fileExtension(value: unknown) {
  const clean = String(value || "")
    .trim()
    .toLowerCase()
    .split(/[?#]/)[0];
  const match = clean.match(/\.([a-z0-9]{1,8})$/);
  return match?.[1] || "";
}

/**
 * MP4/M4V H.264 is the common denominator of the publication APIs used by
 * Booster. These sources can be forwarded as-is instead of being downloaded
 * and re-encoded by a Vercel function. Other containers keep the normalization
 * path so MOV/WebM/AVI/MKV sources are converted before publication.
 */
export function canPublishVideoSourceDirectly(input: {
  name?: unknown;
  type?: unknown;
  mimeType?: unknown;
  storagePath?: unknown;
}) {
  const mimeType = cleanMimeType(input.type || input.mimeType);
  if (DIRECT_VIDEO_MIME_TYPES.has(mimeType)) return true;

  const extension =
    fileExtension(input.name) || fileExtension(input.storagePath);
  return DIRECT_VIDEO_EXTENSIONS.has(extension);
}

