import type { BoosterCreationMode } from "@/lib/boosterCreationMode";

export const BOOSTER_MEDIA_PIPELINE_MISSIONS = [
  "source_metadata",
  "ai_preparation",
  "publication_preparation",
] as const;

export type BoosterMediaPipelineMission =
  (typeof BOOSTER_MEDIA_PIPELINE_MISSIONS)[number];


export const BOOSTER_IMAGE_PREPARATION_PURPOSES = Object.freeze({
  ai_preparation: ["ai_preview"] as const,
  publication_preparation: ["canonical"] as const,
});

export const BOOSTER_VIDEO_PREPARATION_KEYS = Object.freeze({
  ai_preparation: [
    "ai_preview",
    "thumbnail",
    "frame_01",
    "frame_02",
    "frame_03",
    "audio_track",
  ] as const,
  publication_preparation: ["canonical", "thumbnail"] as const,
});

export type BoosterPreparationMission = Exclude<
  BoosterMediaPipelineMission,
  "source_metadata"
>;

export type BoosterSourceMediaMetadata = Record<string, unknown> & {
  pipeline_mission: "source_metadata";
  preparation_scope: "source_only";
  creation_mode: BoosterCreationMode | null;
  original_name: string;
  original_size_bytes: number;
  original_mime_type: string;
  original_last_modified: number | null;
  source_format: string;
  source_container: string;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  orientation: "landscape" | "portrait" | "square" | "unknown";
  video_codec: string;
  audio_codec: string;
  frame_rate: number | null;
  has_audio: boolean | null;
  codec_detection: "not_applicable" | "pending_server_probe" | "provided";
  interface_preview_required: boolean;
};

type FileLike = Pick<File, "name" | "size" | "type" | "lastModified">;

function cleanText(value: unknown, fallback = "unknown") {
  const clean = String(value ?? "").trim().toLowerCase();
  return clean || fallback;
}

function extensionFromName(name: string) {
  const match = String(name || "").toLowerCase().match(/\.([a-z0-9]{1,12})$/);
  return match?.[1] || "unknown";
}

function containerFromMime(mimeType: string, extension: string) {
  const normalizedMime = cleanText(mimeType, "");
  if (normalizedMime.includes("mp4")) return "mp4";
  if (normalizedMime.includes("quicktime")) return "mov";
  if (normalizedMime.includes("webm")) return "webm";
  if (normalizedMime.includes("heic")) return "heic";
  if (normalizedMime.includes("heif")) return "heif";
  if (normalizedMime.includes("jpeg")) return "jpeg";
  if (normalizedMime.includes("png")) return "png";
  if (normalizedMime.includes("webp")) return "webp";
  return extension;
}

export function getBoosterMediaOrientation(params: {
  width?: number | null;
  height?: number | null;
  explicit?: string | null;
}): BoosterSourceMediaMetadata["orientation"] {
  const explicit = cleanText(params.explicit, "");
  if (["landscape", "horizontal"].includes(explicit)) return "landscape";
  if (["portrait", "vertical"].includes(explicit)) return "portrait";
  if (explicit === "square") return "square";

  const width = Number(params.width || 0);
  const height = Number(params.height || 0);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return "unknown";
  }
  const delta = Math.abs(width - height) / Math.max(width, height);
  if (delta <= 0.015) return "square";
  return width > height ? "landscape" : "portrait";
}

export function requiresBoosterServerImagePreview(file: FileLike) {
  const mime = cleanText(file.type, "");
  const extension = extensionFromName(file.name);
  return (
    ["heic", "heif", "tif", "tiff", "bmp"].includes(extension) ||
    mime.includes("heic") ||
    mime.includes("heif") ||
    mime.includes("tiff") ||
    mime.includes("bmp")
  );
}

export function buildBoosterSourceMediaMetadata(params: {
  file: FileLike;
  mediaType: "image" | "video";
  creationMode: BoosterCreationMode | null;
  source?: Record<string, unknown> | null;
  mediaSettings?: Record<string, unknown>;
}): BoosterSourceMediaMetadata {
  const source = params.source || {};
  const extension = extensionFromName(params.file.name);
  const width = Number(source.width || 0) || null;
  const height = Number(source.height || 0) || null;
  const rawDuration = Number(source.durationSeconds ?? source.duration ?? 0);
  const durationSeconds =
    params.mediaType === "video" && Number.isFinite(rawDuration) && rawDuration > 0
      ? rawDuration
      : null;
  const videoCodec =
    params.mediaType === "video" ? cleanText(source.videoCodec) : "none";
  const audioCodec =
    params.mediaType === "video" ? cleanText(source.audioCodec) : "none";
  const rawFrameRate = Number(
    source.frameRate ?? source.frame_rate ?? source.fps ?? 0,
  );
  const frameRate =
    params.mediaType === "video" &&
    Number.isFinite(rawFrameRate) &&
    rawFrameRate > 0
      ? Number(rawFrameRate.toFixed(3))
      : null;
  const hasAudio =
    params.mediaType === "video" && typeof source.hasAudio === "boolean"
      ? source.hasAudio
      : params.mediaType === "video" &&
          typeof source.has_audio === "boolean"
        ? source.has_audio
        : null;
  const codecsProvided =
    params.mediaType === "video" &&
    videoCodec !== "unknown" &&
    (hasAudio === false || audioCodec !== "unknown") &&
    frameRate !== null;

  return {
    ...(params.mediaSettings || {}),
    pipeline_mission: "source_metadata",
    preparation_scope: "source_only",
    creation_mode: params.creationMode,
    original_name: String(params.file.name || "media-inrcy").slice(0, 240),
    original_size_bytes: Math.max(0, Number(params.file.size || 0)),
    original_mime_type: String(
      params.file.type || "application/octet-stream",
    ).slice(0, 120),
    original_last_modified:
      Number.isFinite(Number(params.file.lastModified)) &&
      Number(params.file.lastModified) > 0
        ? Number(params.file.lastModified)
        : null,
    source_format: extension,
    source_container: containerFromMime(params.file.type, extension),
    width,
    height,
    duration_seconds: durationSeconds,
    orientation: getBoosterMediaOrientation({
      width,
      height,
      explicit:
        typeof source.orientation === "string" ? source.orientation : null,
    }),
    video_codec: videoCodec,
    audio_codec: audioCodec,
    frame_rate: frameRate,
    has_audio: hasAudio,
    codec_detection:
      params.mediaType === "image"
        ? "not_applicable"
        : codecsProvided
          ? "provided"
          : "pending_server_probe",
    interface_preview_required:
      params.mediaType === "image" &&
      (source.interface_preview_required === true ||
        requiresBoosterServerImagePreview(params.file)),
  };
}

export function isBoosterMediaPipelineMission(
  value: unknown,
): value is BoosterMediaPipelineMission {
  return BOOSTER_MEDIA_PIPELINE_MISSIONS.includes(
    String(value || "") as BoosterMediaPipelineMission,
  );
}
