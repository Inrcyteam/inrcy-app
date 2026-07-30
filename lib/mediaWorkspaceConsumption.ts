import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  isUnifiedMediaConsumptionEnabled,
  type MediaPipelineUnifiedPurpose,
} from "@/lib/mediaPipelineUnifiedConsumptionPolicy";

const PRIVATE_MEDIA_BUCKET = "inrcy-pro-media";
const MAX_AI_IMAGE_BYTES = 2_500_000;
const MAX_AI_IMAGE_COUNT = 5;

export class MediaWorkspaceConsumptionError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status = 409) {
    super(message);
    this.name = "MediaWorkspaceConsumptionError";
    this.code = code;
    this.status = status;
  }
}

type WorkspaceRow = {
  id: string;
  account_id: string;
  status: string;
  revision: number;
  idea: string | null;
  theme: string | null;
  generated_content: Record<string, unknown> | null;
  generation_options: Record<string, unknown> | null;
  selected_channels: string[] | null;
  workspace_metadata: Record<string, unknown> | null;
  scheduled_for: string | null;
};

type WorkspaceMediaRow = {
  mediaId: string;
  position: number;
  mediaType: "image" | "video";
  uploadStatus: string;
  processingStatus: string;
  publicationStatus: string;
  originalFileName: string;
  clientMediaKey: string | null;
  sourceMimeType: string;
  sourceSizeBytes: number;
  durationSeconds: number | null;
  mediaSettings: Record<string, unknown>;
  channelSettings: Record<string, unknown>;
};

type ReadyVariant = {
  id: string;
  mediaId: string;
  purpose: string;
  channel: string | null;
  signature: string | null;
  bucket: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  metadata: Record<string, unknown>;
};

export type WorkspacePublicationImage = {
  mediaId: string;
  imageKey: string;
  name: string;
  type: string;
  size: number;
  bucket: string;
  storagePath: string;
  publicUrl?: string;
  workspacePosition: number;
  imageMeta?: {
    width: number;
    height: number;
    ratio: number;
  };
};

export type WorkspacePublicationVideo = {
  mediaId: string;
  name: string;
  type: string;
  size: number;
  duration: number | null;
  bucket: string;
  storagePath: string;
  publicUrl?: string;
  url?: string;
  thumbnailUrl?: string | null;
  thumbnailStoragePath?: string | null;
  thumbnailBucket?: string | null;
  transformedVariants: [];
  sourceMetadata?: {
    width?: number | null;
    height?: number | null;
    duration?: number | null;
    orientation?: "horizontal" | "vertical" | "square" | "unknown";
  };
};

export type WorkspacePublicationConsumption = {
  source: "media_workspace_v1";
  purpose: MediaPipelineUnifiedPurpose;
  workspaceId: string;
  workspaceRevision: number;
  workspaceStatus: string;
  mediaType: "images" | "video" | "none";
  images: WorkspacePublicationImage[];
  video: WorkspacePublicationVideo | null;
};

export type WorkspaceAiConsumption = {
  source: "media_workspace_v1";
  workspaceId: string;
  workspaceRevision: number;
  workspaceStatus: string;
  mediaType: "images" | "video" | "none";
  imagesForAI: Array<{
    name: string;
    type: string;
    dataUrl: string;
    mediaId: string;
    position: number;
  }>;
  videoForAI: null | {
    name: string;
    type: string;
    size: number;
    duration: number | null;
    source: "supabase_storage";
    bucket: string;
    storagePath: string;
    visualFrames: Array<{
      name: string;
      type: string;
      dataUrl: string;
      frameTarget: "start" | "middle" | "end";
      timeSeconds?: number;
    }>;
    audioTrackFile: File | null;
    audioAvailable: boolean;
  };
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanText(value: unknown, fallback = "") {
  return String(value ?? fallback).trim();
}

function normalizeMime(value: unknown, fallback: string) {
  const mime = cleanText(value).toLowerCase().split(";")[0]?.trim() || "";
  return mime || fallback;
}

function fileStem(value: unknown, fallback: string) {
  const raw = cleanText(value, fallback);
  const baseName = raw.split(/[\\/]/).pop() || fallback;
  const stem = baseName.replace(/\.[^.]+$/, "").trim();
  return stem || fallback;
}

function imageExtensionForMime(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/avif") return "avif";
  return "jpg";
}

function canonicalImageName(
  originalFileName: string,
  mimeType: string,
  position: number,
) {
  const stem = fileStem(originalFileName, `image-${position + 1}`);
  return `${stem}.${imageExtensionForMime(mimeType)}`;
}

function canonicalVideoName(originalFileName: string) {
  return `${fileStem(originalFileName, "video-inrcy")}.mp4`;
}

function variantKey(mediaId: string, purpose: string) {
  return `${mediaId}:${purpose}`;
}

function editorImageKeyFromClientMediaKey(value: string | null, fallback: string) {
  const clean = cleanText(value);
  if (!clean) return fallback;
  const parts = clean.split(":");
  if (parts.length < 4) return fallback;
  const lastModified = parts.pop() || "0";
  const size = parts.pop() || "0";
  const name = parts.pop() || "image";
  return `${name}__${size}__${lastModified}`;
}

function orientationFromDimensions(width: number | null, height: number | null) {
  if (!width || !height) return "unknown" as const;
  const ratio = width / height;
  if (ratio > 1.08) return "horizontal" as const;
  if (ratio < 0.92) return "vertical" as const;
  return "square" as const;
}

async function readWorkspaceGraph(params: {
  accountId: string;
  workspaceId: string;
}) {
  if (!isUnifiedMediaConsumptionEnabled()) {
    throw new MediaWorkspaceConsumptionError(
      "La consommation média unifiée n'est pas activée.",
      "unified_consumption_disabled",
      404,
    );
  }

  const workspaceResult = await supabaseAdmin
    .from("publication_workspaces")
    .select(
      "id,account_id,status,revision,idea,theme,generated_content,generation_options,selected_channels,workspace_metadata,scheduled_for",
    )
    .eq("id", params.workspaceId)
    .eq("account_id", params.accountId)
    .maybeSingle();
  if (workspaceResult.error) throw workspaceResult.error;
  if (!workspaceResult.data) {
    throw new MediaWorkspaceConsumptionError(
      "Espace média introuvable pour cet établissement.",
      "workspace_not_found",
      404,
    );
  }
  const workspace = workspaceResult.data as WorkspaceRow;

  const mediaResult = await supabaseAdmin
    .from("publication_workspace_media")
    .select(
      "position,media_settings,channel_settings,media_id,pro_media_library!inner(id,user_id,media_type,upload_status,processing_status,publication_status,original_file_name,client_media_key,mime_type,size_bytes,duration_seconds)",
    )
    .eq("workspace_id", params.workspaceId)
    .eq("pro_media_library.user_id", params.accountId)
    .order("position", { ascending: true });
  if (mediaResult.error) throw mediaResult.error;

  const media: WorkspaceMediaRow[] = (mediaResult.data || []).map((row: any) => {
    const item = Array.isArray(row.pro_media_library)
      ? row.pro_media_library[0]
      : row.pro_media_library;
    return {
      mediaId: cleanText(row.media_id || item?.id),
      position: Number(row.position || 0),
      mediaType: item?.media_type === "video" ? "video" : "image",
      uploadStatus: cleanText(item?.upload_status, "pending"),
      processingStatus: cleanText(item?.processing_status, "not_requested"),
      publicationStatus: cleanText(item?.publication_status, "not_requested"),
      originalFileName: cleanText(item?.original_file_name, "media-inrcy"),
      clientMediaKey: cleanText(item?.client_media_key) || null,
      sourceMimeType: normalizeMime(
        item?.mime_type,
        item?.media_type === "video" ? "video/mp4" : "image/jpeg",
      ),
      sourceSizeBytes: Number(item?.size_bytes || 0),
      durationSeconds:
        Number.isFinite(Number(item?.duration_seconds)) &&
        Number(item?.duration_seconds) > 0
          ? Number(item.duration_seconds)
          : null,
      mediaSettings: asObject(row.media_settings),
      channelSettings: asObject(row.channel_settings),
    };
  });

  if (!media.length) {
    return { workspace, media, variants: [] as ReadyVariant[] };
  }

  const invalid = media.find(
    (item) =>
      item.uploadStatus !== "uploaded" ||
      item.processingStatus !== "ready" ||
      item.publicationStatus !== "ready",
  );
  if (invalid) {
    throw new MediaWorkspaceConsumptionError(
      "Les médias sont encore en cours de préparation.",
      "workspace_media_not_ready",
      409,
    );
  }

  const mediaIds = media.map((item) => item.mediaId).filter(Boolean);
  const variantsResult = await supabaseAdmin
    .from("media_variants")
    .select(
      "id,media_id,purpose,channel,signature,status,bucket_name,storage_path,mime_type,size_bytes,width,height,duration_seconds,variant_metadata",
    )
    .eq("account_id", params.accountId)
    .in("media_id", mediaIds)
    .eq("status", "ready")
    .order("updated_at", { ascending: false });
  if (variantsResult.error) throw variantsResult.error;

  const variants: ReadyVariant[] = (variantsResult.data || [])
    .map((row: any) => ({
      id: cleanText(row.id),
      mediaId: cleanText(row.media_id),
      purpose: cleanText(row.purpose),
      channel: cleanText(row.channel) || null,
      signature: cleanText(row.signature) || null,
      bucket: cleanText(row.bucket_name, PRIVATE_MEDIA_BUCKET),
      storagePath: cleanText(row.storage_path),
      mimeType: normalizeMime(row.mime_type, "application/octet-stream"),
      sizeBytes: Number(row.size_bytes || 0),
      width:
        Number.isFinite(Number(row.width)) && Number(row.width) > 0
          ? Number(row.width)
          : null,
      height:
        Number.isFinite(Number(row.height)) && Number(row.height) > 0
          ? Number(row.height)
          : null,
      durationSeconds:
        Number.isFinite(Number(row.duration_seconds)) &&
        Number(row.duration_seconds) >= 0
          ? Number(row.duration_seconds)
          : null,
      metadata: asObject(row.variant_metadata),
    }))
    .filter((row: ReadyVariant) => Boolean(row.mediaId && row.purpose));

  return { workspace, media, variants };
}

function pickReadyVariant(
  variants: readonly ReadyVariant[],
  mediaId: string,
  purpose: string,
) {
  return variants.find(
    (variant) =>
      variant.mediaId === mediaId &&
      variant.purpose === purpose &&
      Boolean(variant.storagePath),
  );
}

function pickAllReadyVariants(
  variants: readonly ReadyVariant[],
  mediaId: string,
  purpose: string,
) {
  return variants.filter(
    (variant) =>
      variant.mediaId === mediaId && variant.purpose === purpose,
  );
}

async function downloadVariant(variant: ReadyVariant) {
  if (!variant.storagePath) {
    throw new MediaWorkspaceConsumptionError(
      "Une variante média est incomplète.",
      "workspace_variant_missing",
      409,
    );
  }
  const downloaded = await supabaseAdmin.storage
    .from(variant.bucket || PRIVATE_MEDIA_BUCKET)
    .download(variant.storagePath);
  if (downloaded.error || !downloaded.data) {
    throw new MediaWorkspaceConsumptionError(
      downloaded.error?.message || "Impossible de relire la variante média.",
      "workspace_variant_download_failed",
      503,
    );
  }
  const buffer = Buffer.from(await downloaded.data.arrayBuffer());
  return {
    buffer,
    mimeType: normalizeMime(
      downloaded.data.type || variant.mimeType,
      variant.mimeType || "application/octet-stream",
    ),
  };
}

async function variantToDataUrl(variant: ReadyVariant) {
  const { buffer, mimeType } = await downloadVariant(variant);
  if (buffer.byteLength > MAX_AI_IMAGE_BYTES) {
    throw new MediaWorkspaceConsumptionError(
      "L'aperçu IA dépasse le plafond de sécurité.",
      "workspace_ai_variant_too_large",
      413,
    );
  }
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

export async function resolveWorkspacePublicationConsumption(params: {
  accountId: string;
  workspaceId: string;
  purpose: "publish" | "schedule";
}): Promise<WorkspacePublicationConsumption> {
  const graph = await readWorkspaceGraph(params);
  const { workspace, media, variants } = graph;

  if (!media.length) {
    return {
      source: "media_workspace_v1",
      purpose: params.purpose,
      workspaceId: workspace.id,
      workspaceRevision: Number(workspace.revision || 1),
      workspaceStatus: workspace.status,
      mediaType: "none",
      images: [],
      video: null,
    };
  }

  const mediaType = media[0]?.mediaType === "video" ? "video" : "images";
  if (mediaType === "images") {
    const images = media.slice(0, MAX_AI_IMAGE_COUNT).map((item) => {
      const canonical = pickReadyVariant(
        variants,
        item.mediaId,
        "canonical",
      );
      if (!canonical) {
        throw new MediaWorkspaceConsumptionError(
          "La version canonique d'une image n'est pas prête.",
          "workspace_canonical_missing",
          409,
        );
      }
      const canonicalMimeType = normalizeMime(
        canonical.mimeType,
        "image/jpeg",
      );
      return {
        mediaId: item.mediaId,
        imageKey: editorImageKeyFromClientMediaKey(
          item.clientMediaKey,
          `workspace:${item.mediaId}`,
        ),
        name: canonicalImageName(
          item.originalFileName,
          canonicalMimeType,
          item.position,
        ),
        type: canonicalMimeType,
        size: canonical.sizeBytes || item.sourceSizeBytes,
        bucket: canonical.bucket,
        storagePath: canonical.storagePath,
        workspacePosition: item.position,
        ...(canonical.width && canonical.height
          ? {
              imageMeta: {
                width: canonical.width,
                height: canonical.height,
                ratio: canonical.width / canonical.height,
              },
            }
          : {}),
      };
    });

    return {
      source: "media_workspace_v1",
      purpose: params.purpose,
      workspaceId: workspace.id,
      workspaceRevision: Number(workspace.revision || 1),
      workspaceStatus: workspace.status,
      mediaType: "images",
      images,
      video: null,
    };
  }

  const item = media[0];
  const canonical = pickReadyVariant(variants, item.mediaId, "canonical");
  if (!canonical) {
    throw new MediaWorkspaceConsumptionError(
      "La version canonique de la vidéo n'est pas prête.",
      "workspace_canonical_missing",
      409,
    );
  }
  const thumbnail = pickReadyVariant(variants, item.mediaId, "thumbnail");

  const canonicalMimeType = normalizeMime(canonical.mimeType, "video/mp4");

  return {
    source: "media_workspace_v1",
    purpose: params.purpose,
    workspaceId: workspace.id,
    workspaceRevision: Number(workspace.revision || 1),
    workspaceStatus: workspace.status,
    mediaType: "video",
    images: [],
    video: {
      mediaId: item.mediaId,
      name: canonicalVideoName(item.originalFileName),
      type: canonicalMimeType,
      size: canonical.sizeBytes || item.sourceSizeBytes,
      duration: canonical.durationSeconds ?? item.durationSeconds,
      bucket: canonical.bucket,
      storagePath: canonical.storagePath,
      thumbnailUrl: null,
      thumbnailStoragePath: thumbnail?.storagePath || null,
      thumbnailBucket: thumbnail?.bucket || null,
      transformedVariants: [],
      sourceMetadata: {
        width: canonical.width,
        height: canonical.height,
        duration: canonical.durationSeconds ?? item.durationSeconds,
        orientation: orientationFromDimensions(canonical.width, canonical.height),
      },
    },
  };
}

export async function resolveWorkspaceAiConsumption(params: {
  accountId: string;
  workspaceId: string;
}): Promise<WorkspaceAiConsumption> {
  const graph = await readWorkspaceGraph(params);
  const { workspace, media, variants } = graph;

  if (!media.length) {
    return {
      source: "media_workspace_v1",
      workspaceId: workspace.id,
      workspaceRevision: Number(workspace.revision || 1),
      workspaceStatus: workspace.status,
      mediaType: "none",
      imagesForAI: [],
      videoForAI: null,
    };
  }

  if (media[0]?.mediaType === "image") {
    const imagesForAI = [] as WorkspaceAiConsumption["imagesForAI"];
    for (const item of media.slice(0, MAX_AI_IMAGE_COUNT)) {
      const preview = pickReadyVariant(
        variants,
        item.mediaId,
        "ai_preview",
      );
      if (!preview) {
        throw new MediaWorkspaceConsumptionError(
          "L'aperçu IA d'une image n'est pas prêt.",
          "workspace_ai_preview_missing",
          409,
        );
      }
      imagesForAI.push({
        name: item.originalFileName || `image-${item.position + 1}.jpg`,
        type: normalizeMime(preview.mimeType, "image/jpeg"),
        dataUrl: await variantToDataUrl(preview),
        mediaId: item.mediaId,
        position: item.position,
      });
    }

    return {
      source: "media_workspace_v1",
      workspaceId: workspace.id,
      workspaceRevision: Number(workspace.revision || 1),
      workspaceStatus: workspace.status,
      mediaType: "images",
      imagesForAI,
      videoForAI: null,
    };
  }

  const item = media[0];
  const preview =
    pickReadyVariant(variants, item.mediaId, "ai_preview") ||
    pickReadyVariant(variants, item.mediaId, "canonical");
  if (!preview) {
    throw new MediaWorkspaceConsumptionError(
      "La vidéo de référence pour l'IA n'est pas prête.",
      "workspace_ai_preview_missing",
      409,
    );
  }

  const frameVariants = pickAllReadyVariants(
    variants,
    item.mediaId,
    "video_frame",
  )
    .filter((variant) => Boolean(variant.storagePath))
    .sort((a, b) => {
      const aIndex = Number(a.metadata.frame_index || 0);
      const bIndex = Number(b.metadata.frame_index || 0);
      if (aIndex !== bIndex) return aIndex - bIndex;
      return String(a.signature || "").localeCompare(String(b.signature || ""));
    })
    .slice(0, 3);
  if (!frameVariants.length) {
    throw new MediaWorkspaceConsumptionError(
      "Les captures IA de la vidéo ne sont pas prêtes.",
      "workspace_video_frames_missing",
      409,
    );
  }

  const frameTargets = ["start", "middle", "end"] as const;
  const visualFrames = [] as NonNullable<
    WorkspaceAiConsumption["videoForAI"]
  >["visualFrames"];
  for (let index = 0; index < frameVariants.length; index += 1) {
    const frame = frameVariants[index];
    visualFrames.push({
      name: `video-frame-${index + 1}.jpg`,
      type: normalizeMime(frame.mimeType, "image/jpeg"),
      dataUrl: await variantToDataUrl(frame),
      frameTarget: frameTargets[index] || "middle",
      ...(Number.isFinite(
        Number(frame.metadata.capture_seconds ?? frame.metadata.time_seconds),
      )
        ? {
            timeSeconds: Number(
              frame.metadata.capture_seconds ?? frame.metadata.time_seconds,
            ),
          }
        : {}),
    });
  }

  const audioVariant = pickAllReadyVariants(
    variants,
    item.mediaId,
    "audio_track",
  )[0];
  const audioAvailable =
    Boolean(audioVariant?.storagePath) && audioVariant?.metadata.available !== false;
  let audioTrackFile: File | null = null;
  if (audioVariant && audioAvailable) {
    const audio = await downloadVariant(audioVariant);
    const audioArrayBuffer = audio.buffer.buffer.slice(
      audio.buffer.byteOffset,
      audio.buffer.byteOffset + audio.buffer.byteLength,
    ) as ArrayBuffer;
    audioTrackFile = new File(
      [audioArrayBuffer],
      `${item.originalFileName.replace(/\.[^.]+$/, "") || "video"}-audio.mp3`,
      { type: normalizeMime(audio.mimeType, "audio/mpeg") },
    );
  }

  return {
    source: "media_workspace_v1",
    workspaceId: workspace.id,
    workspaceRevision: Number(workspace.revision || 1),
    workspaceStatus: workspace.status,
    mediaType: "video",
    imagesForAI: [],
    videoForAI: {
      name: item.originalFileName || "video-inrcy.mp4",
      type: normalizeMime(preview.mimeType, "video/mp4"),
      size: preview.sizeBytes || item.sourceSizeBytes,
      duration: preview.durationSeconds ?? item.durationSeconds,
      source: "supabase_storage",
      bucket: preview.bucket,
      storagePath: preview.storagePath,
      visualFrames,
      audioTrackFile,
      audioAvailable,
    },
  };
}

export async function syncPublicationWorkspaceContext(params: {
  accountId: string;
  workspaceId: string;
  operation: "generate" | "publish" | "schedule";
  idea?: string;
  theme?: string;
  selectedChannels?: readonly string[];
  generatedContent?: Record<string, unknown>;
  generationOptions?: Record<string, unknown>;
  scheduledFor?: string | null;
  status?: "active" | "ready" | "scheduled" | "publishing" | "published" | "failed";
  metadata?: Record<string, unknown>;
}) {
  if (!isUnifiedMediaConsumptionEnabled()) return false;
  const currentResult = await supabaseAdmin
    .from("publication_workspaces")
    .select(
      "id,account_id,status,revision,workspace_metadata,generated_content,generation_options,scheduled_for",
    )
    .eq("id", params.workspaceId)
    .eq("account_id", params.accountId)
    .maybeSingle();
  if (currentResult.error) throw currentResult.error;
  if (!currentResult.data) return false;

  const current = currentResult.data as any;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    revision: Number(current.revision || 1) + 1,
    last_opened_at: now,
    workspace_metadata: {
      ...asObject(current.workspace_metadata),
      ...asObject(params.metadata),
      media_pipeline_step: 8,
      last_operation: params.operation,
      last_operation_at: now,
    },
  };
  if (params.idea !== undefined) patch.idea = cleanText(params.idea).slice(0, 8000);
  if (params.theme !== undefined) patch.theme = cleanText(params.theme).slice(0, 120);
  if (params.selectedChannels) {
    patch.selected_channels = Array.from(
      new Set(params.selectedChannels.map((value) => cleanText(value)).filter(Boolean)),
    ).slice(0, 30);
  }
  if (params.generatedContent) {
    patch.generated_content = {
      ...asObject(current.generated_content),
      ...asObject(params.generatedContent),
    };
  }
  if (params.generationOptions) {
    patch.generation_options = {
      ...asObject(current.generation_options),
      ...asObject(params.generationOptions),
    };
  }
  if (params.scheduledFor !== undefined) {
    if (params.operation === "schedule" && params.scheduledFor) {
      const currentScheduledAt = Date.parse(String(current.scheduled_for || ""));
      const requestedScheduledAt = Date.parse(params.scheduledFor);
      patch.scheduled_for =
        Number.isFinite(currentScheduledAt) &&
        Number.isFinite(requestedScheduledAt) &&
        currentScheduledAt <= requestedScheduledAt
          ? current.scheduled_for
          : params.scheduledFor;
    } else {
      patch.scheduled_for = params.scheduledFor;
    }
  }
  if (params.status) {
    patch.status = params.status;
    if (params.status === "published") patch.published_at = now;
  }

  const update = await supabaseAdmin
    .from("publication_workspaces")
    .update(patch)
    .eq("id", params.workspaceId)
    .eq("account_id", params.accountId);
  if (update.error) throw update.error;
  return true;
}
