import { createHash } from "node:crypto";
import sharp from "sharp";
import { normalizeImageBuffer } from "@/lib/mediaImageNormalizer";
import {
  IMAGE_NORMALIZATION_PIPELINE_VERSION,
  IMAGE_NORMALIZATION_PURPOSES,
  buildImageNormalizationStoragePath,
  type ImageNormalizationPurpose,
} from "@/lib/mediaImageNormalizationPolicy";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  SUPABASE_STORAGE_BINARY_UPLOAD_VERSION,
  toExactStorageArrayBuffer,
  withStorageBinaryMetadata,
} from "@/lib/supabaseStorageBinary";
import {
  isUnifiedMediaConsumptionEnabled,
  type MediaPipelineUnifiedPurpose,
} from "@/lib/mediaPipelineUnifiedConsumptionPolicy";
import { canPublishVideoSourceDirectly } from "@/lib/mediaVideoSourceCompatibility";

const PRIVATE_MEDIA_BUCKET = "inrcy-pro-media";
const MAX_AI_IMAGE_BYTES = 2_500_000;
const MAX_AI_IMAGE_COUNT = 5;
const AI_PROVIDER_SAFE_VERSION = 1;
const AI_PROVIDER_SAFE_MAX_SIDE = 1280;
const AI_PROVIDER_SAFE_JPEG_QUALITY = 74;
const AI_PROVIDER_SAFE_CONCURRENCY = 3;
const AI_PROVIDER_SAFE_MAX_INPUT_PIXELS = 100_000_000;

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
  sourceBucket: string;
  sourceStoragePath: string;
  detectedMimeType: string;
  durationSeconds: number | null;
  mediaMetadata: Record<string, unknown>;
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

function sha256(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function isCompleteJpeg(buffer: Buffer) {
  return (
    buffer.byteLength >= 4 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[buffer.byteLength - 2] === 0xff &&
    buffer[buffer.byteLength - 1] === 0xd9
  );
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index], index);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), values.length) },
      () => worker(),
    ),
  );
  return results;
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
  allowProcessingVideoForAi?: boolean;
  allowUploadedVideoSource?: boolean;
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
      "position,media_settings,channel_settings,media_id,pro_media_library!inner(id,user_id,media_type,upload_status,processing_status,publication_status,original_file_name,client_media_key,mime_type,detected_mime_type,size_bytes,duration_seconds,bucket_name,storage_path,media_metadata)",
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
      sourceBucket: cleanText(item?.bucket_name, PRIVATE_MEDIA_BUCKET),
      sourceStoragePath: cleanText(item?.storage_path),
      detectedMimeType: normalizeMime(
        item?.detected_mime_type,
        item?.mime_type ||
          (item?.media_type === "video" ? "video/mp4" : "image/jpeg"),
      ),
      durationSeconds:
        Number.isFinite(Number(item?.duration_seconds)) &&
        Number(item?.duration_seconds) > 0
          ? Number(item.duration_seconds)
          : null,
      mediaMetadata: asObject(item?.media_metadata),
      mediaSettings: asObject(row.media_settings),
      channelSettings: asObject(row.channel_settings),
    };
  });

  if (!media.length) {
    return { workspace, media, variants: [] as ReadyVariant[] };
  }

  const invalid = media.find((item) => {
    if (item.uploadStatus !== "uploaded") return true;
    const uploadedVideoIsUsable =
      item.mediaType === "video" &&
      ((params.allowProcessingVideoForAi ?? false) ||
        ((params.allowUploadedVideoSource ?? false) &&
          canPublishVideoSourceDirectly({
            name: item.originalFileName,
            mimeType: item.detectedMimeType || item.sourceMimeType,
            storagePath: item.sourceStoragePath,
          })));
    if (uploadedVideoIsUsable) return false;
    return (
      item.processingStatus !== "ready" ||
      !["ready", "legacy_ready"].includes(item.publicationStatus)
    );
  });
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

const imageRepairInFlight = new Map<string, Promise<ReadyVariant[]>>();
let imageRepairTail: Promise<void> = Promise.resolve();

function hasTrustedBinaryUpload(variant: ReadyVariant) {
  return (
    Number(variant.metadata.storage_binary_upload_version || 0) ===
    SUPABASE_STORAGE_BINARY_UPLOAD_VERSION
  );
}

async function markVariantBinaryUploadTrusted(variant: ReadyVariant) {
  if (hasTrustedBinaryUpload(variant)) return;
  const metadata = withStorageBinaryMetadata(variant.metadata);
  const updated = await supabaseAdmin
    .from("media_variants")
    .update({ variant_metadata: metadata })
    .eq("id", variant.id)
    .eq("media_id", variant.mediaId);
  if (updated.error) {
    console.warn("[media-pipeline] binary marker persistence skipped", {
      variantId: variant.id,
      message: updated.error.message,
    });
    return;
  }
  variant.metadata = metadata;
}

async function assertStoredImageVariantIsValid(variant: ReadyVariant) {
  if (hasTrustedBinaryUpload(variant)) return;

  const { buffer } = await downloadVariant(variant);
  if (variant.sizeBytes > 0 && buffer.byteLength !== variant.sizeBytes) {
    throw new Error(
      `image_variant_size_mismatch:${buffer.byteLength}:${variant.sizeBytes}`,
    );
  }

  const expectedSha256 = cleanText(variant.metadata.output_sha256).toLowerCase();
  if (
    expectedSha256.length === 64 &&
    expectedSha256 !== sha256(buffer)
  ) {
    throw new Error("image_variant_hash_mismatch");
  }

  const metadata = await sharp(buffer, {
    failOn: "error",
    limitInputPixels: AI_PROVIDER_SAFE_MAX_INPUT_PIXELS,
    pages: 1,
  }).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("image_variant_dimensions_missing");
  }
  await markVariantBinaryUploadTrusted(variant);
}

async function downloadWorkspaceImageSource(params: {
  accountId: string;
  media: WorkspaceMediaRow;
}) {
  const bucket = cleanText(params.media.sourceBucket, PRIVATE_MEDIA_BUCKET);
  const storagePath = cleanText(params.media.sourceStoragePath).replace(
    /^\/+/,
    "",
  );
  const expectedPrefixes =
    bucket === "booster"
      ? [`${params.accountId}/`]
      : [`users/${params.accountId}/`];
  if (
    !bucket ||
    !storagePath ||
    !expectedPrefixes.some((prefix) => storagePath.startsWith(prefix)) ||
    params.media.mediaType !== "image"
  ) {
    throw new MediaWorkspaceConsumptionError(
      "La source image n'est plus accessible pour sa réparation.",
      "workspace_image_source_invalid",
      409,
    );
  }

  const downloaded = await supabaseAdmin.storage.from(bucket).download(storagePath);
  if (downloaded.error || !downloaded.data) {
    throw new MediaWorkspaceConsumptionError(
      downloaded.error?.message ||
        "Impossible de relire la source image pour la réparer.",
      "workspace_image_source_download_failed",
      503,
    );
  }
  const buffer = Buffer.from(await downloaded.data.arrayBuffer());
  if (!buffer.byteLength) {
    throw new MediaWorkspaceConsumptionError(
      "La source image est vide.",
      "workspace_image_source_empty",
      422,
    );
  }
  return buffer;
}

async function performImageVariantRepair(params: {
  accountId: string;
  media: WorkspaceMediaRow;
  variants: ReadyVariant[];
}) {
  const sourceBuffer = await downloadWorkspaceImageSource(params);
  const normalized = await normalizeImageBuffer({
    buffer: sourceBuffer,
    mimeType: params.media.detectedMimeType || params.media.sourceMimeType,
    originalFileName: params.media.originalFileName,
  });
  const repairedAt = new Date().toISOString();
  const outputs: Record<string, Record<string, unknown>> = {};

  for (const purpose of IMAGE_NORMALIZATION_PURPOSES) {
    const target = params.variants.find(
      (variant) =>
        variant.mediaId === params.media.mediaId &&
        variant.purpose === purpose,
    );
    if (!target) {
      throw new MediaWorkspaceConsumptionError(
        `La variante ${purpose} est absente du registre.`,
        "workspace_image_variant_registry_missing",
        409,
      );
    }

    const output = normalized.variants[purpose];
    const storagePath = buildImageNormalizationStoragePath({
      accountId: params.accountId,
      mediaId: params.media.mediaId,
      purpose,
      extension: output.extension,
    });
    const variantMetadata = withStorageBinaryMetadata({
      ...output.metadata,
      repaired_from_source_at: repairedAt,
    });
    const uploaded = await supabaseAdmin.storage
      .from(PRIVATE_MEDIA_BUCKET)
      .upload(storagePath, toExactStorageArrayBuffer(output.buffer), {
        upsert: true,
        contentType: output.mimeType,
        cacheControl: "31536000",
      });
    if (uploaded.error) {
      throw new MediaWorkspaceConsumptionError(
        uploaded.error.message,
        "workspace_image_repair_upload_failed",
        503,
      );
    }

    const updated = await supabaseAdmin
      .from("media_variants")
      .update({
        status: "ready",
        bucket_name: PRIVATE_MEDIA_BUCKET,
        storage_path: storagePath,
        mime_type: output.mimeType,
        size_bytes: output.sizeBytes,
        width: output.width,
        height: output.height,
        duration_seconds: null,
        pipeline_version: IMAGE_NORMALIZATION_PIPELINE_VERSION,
        transform_spec: output.transformSpec,
        variant_metadata: variantMetadata,
        error_code: null,
        error_message: null,
        ready_at: repairedAt,
      })
      .eq("id", target.id)
      .eq("account_id", params.accountId)
      .eq("media_id", params.media.mediaId);
    if (updated.error) throw updated.error;

    Object.assign(target, {
      bucket: PRIVATE_MEDIA_BUCKET,
      storagePath,
      mimeType: output.mimeType,
      sizeBytes: output.sizeBytes,
      width: output.width,
      height: output.height,
      durationSeconds: null,
      metadata: variantMetadata,
    });
    outputs[purpose] = {
      variantId: target.id,
      bucket: PRIVATE_MEDIA_BUCKET,
      storagePath,
      mimeType: output.mimeType,
      sizeBytes: output.sizeBytes,
      width: output.width,
      height: output.height,
    };
  }

  const canonical = params.variants.find(
    (variant) =>
      variant.mediaId === params.media.mediaId &&
      variant.purpose === "canonical",
  );
  if (!canonical) {
    throw new MediaWorkspaceConsumptionError(
      "La variante canonique réparée est introuvable.",
      "workspace_image_repair_canonical_missing",
      409,
    );
  }
  const mediaUpdate = await supabaseAdmin
    .from("pro_media_library")
    .update({
      canonical_bucket_name: canonical.bucket,
      canonical_storage_path: canonical.storagePath,
      canonical_mime_type: canonical.mimeType,
      canonical_size_bytes: canonical.sizeBytes,
      processing_status: "ready",
      publication_status: "ready",
      processing_progress: 100,
      processing_error_code: null,
      processing_error_message: null,
      processing_completed_at: repairedAt,
      pipeline_version: IMAGE_NORMALIZATION_PIPELINE_VERSION,
      media_metadata: {
        ...params.media.mediaMetadata,
        image_binary_repair: {
          version: SUPABASE_STORAGE_BINARY_UPLOAD_VERSION,
          repaired_at: repairedAt,
          source: normalized.source,
          variants: outputs,
        },
      },
    })
    .eq("id", params.media.mediaId)
    .eq("user_id", params.accountId);
  if (mediaUpdate.error) throw mediaUpdate.error;

  params.media.mediaMetadata = {
    ...params.media.mediaMetadata,
    image_binary_repair: {
      version: SUPABASE_STORAGE_BINARY_UPLOAD_VERSION,
      repaired_at: repairedAt,
    },
  };
  return params.variants;
}

async function repairImageVariantsFromSource(params: {
  accountId: string;
  media: WorkspaceMediaRow;
  variants: ReadyVariant[];
}) {
  const repairKey = `${params.accountId}:${params.media.mediaId}`;
  const existing = imageRepairInFlight.get(repairKey);
  if (existing) return await existing;

  // Une source peut peser 50 Mo et se décompresser en plusieurs centaines de
  // Mo. Les réparations historiques sont donc sérialisées, alors que les
  // aperçus déjà sains restent lus en parallèle.
  const repair = imageRepairTail
    .catch(() => undefined)
    .then(() => performImageVariantRepair(params))
    .finally(() => {
      imageRepairInFlight.delete(repairKey);
    });
  imageRepairTail = repair.then(
    () => undefined,
    () => undefined,
  );
  imageRepairInFlight.set(repairKey, repair);
  return await repair;
}

async function variantToDataUrl(variant: ReadyVariant) {
  const { buffer, mimeType } = await downloadVariant(variant);
  if (
    (variant.sizeBytes > 0 && buffer.byteLength !== variant.sizeBytes) ||
    (mimeType === "image/jpeg" && !isCompleteJpeg(buffer))
  ) {
    throw new MediaWorkspaceConsumptionError(
      "Une capture vidéo stockée est illisible.",
      "workspace_variant_binary_invalid",
      422,
    );
  }
  if (buffer.byteLength > MAX_AI_IMAGE_BYTES) {
    throw new MediaWorkspaceConsumptionError(
      "L'aperçu IA dépasse le plafond de sécurité.",
      "workspace_ai_variant_too_large",
      413,
    );
  }
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function imageVariantToProviderSafeDataUrl(variant: ReadyVariant) {
  const { buffer } = await downloadVariant(variant);
  const expectedSha256 = cleanText(variant.metadata.output_sha256).toLowerCase();
  const declaredProviderSafe =
    Number(variant.metadata.ai_provider_safe_version || 0) ===
    AI_PROVIDER_SAFE_VERSION;

  // Les nouvelles variantes sont déjà des JPEG baseline sRGB. Le hash permet
  // de les envoyer directement sans recompression ni latence supplémentaire.
  if (
    declaredProviderSafe &&
    expectedSha256.length === 64 &&
    expectedSha256 === sha256(buffer) &&
    isCompleteJpeg(buffer) &&
    buffer.byteLength <= MAX_AI_IMAGE_BYTES
  ) {
    await markVariantBinaryUploadTrusted(variant);
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  }

  // Auto-réparation des variantes historiques ou atypiques : même si leur
  // en-tête Storage est incorrect, Sharp lit les octets puis recrée une image
  // strictement compatible avec les fournisseurs IA.
  const rendered = await sharp(buffer, {
    failOn: "error",
    limitInputPixels: AI_PROVIDER_SAFE_MAX_INPUT_PIXELS,
    pages: 1,
  })
    .rotate()
    .resize({
      width: AI_PROVIDER_SAFE_MAX_SIDE,
      height: AI_PROVIDER_SAFE_MAX_SIDE,
      fit: "inside",
      withoutEnlargement: true,
      fastShrinkOnLoad: true,
    })
    .toColourspace("srgb")
    .flatten({ background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .jpeg({
      quality: AI_PROVIDER_SAFE_JPEG_QUALITY,
      mozjpeg: false,
      progressive: false,
      chromaSubsampling: "4:2:0",
      optimiseCoding: true,
    })
    .toBuffer();

  if (
    !isCompleteJpeg(rendered) ||
    rendered.byteLength <= 0 ||
    rendered.byteLength > MAX_AI_IMAGE_BYTES
  ) {
    throw new MediaWorkspaceConsumptionError(
      "Une image n'a pas pu être sécurisée pour l'analyse IA.",
      "workspace_ai_variant_invalid",
      422,
    );
  }
  return `data:image/jpeg;base64,${rendered.toString("base64")}`;
}

async function resolveProviderSafeImageDataUrl(params: {
  accountId: string;
  media: WorkspaceMediaRow;
  variants: ReadyVariant[];
}) {
  const candidates = ["ai_preview", "canonical", "thumbnail"]
    .map((purpose) =>
      pickReadyVariant(params.variants, params.media.mediaId, purpose),
    )
    .filter(
      (variant, index, all): variant is ReadyVariant =>
        Boolean(variant) &&
        all.findIndex(
          (candidate) =>
            candidate?.bucket === variant?.bucket &&
            candidate?.storagePath === variant?.storagePath,
        ) === index,
    );

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      return await imageVariantToProviderSafeDataUrl(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  try {
    const repaired = await repairImageVariantsFromSource(params);
    const repairedPreview =
      pickReadyVariant(repaired, params.media.mediaId, "ai_preview") ||
      pickReadyVariant(repaired, params.media.mediaId, "canonical");
    if (!repairedPreview) throw new Error("image_repair_preview_missing");
    return await imageVariantToProviderSafeDataUrl(repairedPreview);
  } catch (repairError) {
    lastError = repairError;
  }

  throw new MediaWorkspaceConsumptionError(
    lastError instanceof Error
      ? `L'aperçu IA d'une image est illisible : ${lastError.message}`
      : "L'aperçu IA d'une image est illisible.",
    "workspace_ai_variant_invalid",
    422,
  );
}

export async function resolveWorkspacePublicationConsumption(params: {
  accountId: string;
  workspaceId: string;
  purpose: "publish" | "schedule";
}): Promise<WorkspacePublicationConsumption> {
  const graph = await readWorkspaceGraph({
    ...params,
    allowUploadedVideoSource: true,
  });
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
    const images = await mapWithConcurrency(
      media.slice(0, MAX_AI_IMAGE_COUNT),
      AI_PROVIDER_SAFE_CONCURRENCY,
      async (item) => {
      let canonical = pickReadyVariant(
        variants,
        item.mediaId,
        "canonical",
      );
      try {
        if (!canonical) throw new Error("image_canonical_missing");
        await assertStoredImageVariantIsValid(canonical);
      } catch {
        await repairImageVariantsFromSource({
          accountId: params.accountId,
          media: item,
          variants,
        });
        canonical = pickReadyVariant(variants, item.mediaId, "canonical");
      }
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
      },
    );

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
  const directSourceReady =
    Boolean(item.sourceStoragePath) &&
    canPublishVideoSourceDirectly({
      name: item.originalFileName,
      mimeType: item.detectedMimeType || item.sourceMimeType,
      storagePath: item.sourceStoragePath,
    });
  if (!canonical && !directSourceReady) {
    throw new MediaWorkspaceConsumptionError(
      "La version canonique de la vidéo n'est pas prête.",
      "workspace_canonical_missing",
      409,
    );
  }
  const thumbnail = pickReadyVariant(variants, item.mediaId, "thumbnail");

  const videoMimeType = normalizeMime(
    canonical?.mimeType || item.detectedMimeType || item.sourceMimeType,
    "video/mp4",
  );
  const directSourceMetadata = asObject(item.mediaSettings.source_metadata);
  const nestedMediaSettings = asObject(item.mediaMetadata.media_settings);
  const sourceMetadata = Object.keys(directSourceMetadata).length
    ? directSourceMetadata
    : asObject(
        item.mediaMetadata.source_metadata ||
          nestedMediaSettings.source_metadata,
      );
  const sourceWidth =
    Number.isFinite(Number(sourceMetadata.width)) &&
    Number(sourceMetadata.width) > 0
      ? Number(sourceMetadata.width)
      : null;
  const sourceHeight =
    Number.isFinite(Number(sourceMetadata.height)) &&
    Number(sourceMetadata.height) > 0
      ? Number(sourceMetadata.height)
      : null;
  const videoWidth = canonical?.width ?? sourceWidth;
  const videoHeight = canonical?.height ?? sourceHeight;
  const sourceDuration =
    Number.isFinite(Number(sourceMetadata.duration)) &&
    Number(sourceMetadata.duration) > 0
      ? Number(sourceMetadata.duration)
      : null;
  const videoDuration =
    canonical?.durationSeconds ?? item.durationSeconds ?? sourceDuration;

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
      name: canonical
        ? canonicalVideoName(item.originalFileName)
        : item.originalFileName,
      type: videoMimeType,
      size: canonical?.sizeBytes || item.sourceSizeBytes,
      duration: videoDuration,
      bucket: canonical?.bucket || item.sourceBucket,
      storagePath: canonical?.storagePath || item.sourceStoragePath,
      thumbnailUrl: null,
      thumbnailStoragePath: thumbnail?.storagePath || null,
      thumbnailBucket: thumbnail?.bucket || null,
      transformedVariants: [],
      sourceMetadata: {
        width: videoWidth,
        height: videoHeight,
        duration: videoDuration,
        orientation: orientationFromDimensions(videoWidth, videoHeight),
      },
    },
  };
}

export async function resolveWorkspaceAiConsumption(params: {
  accountId: string;
  workspaceId: string;
}): Promise<WorkspaceAiConsumption> {
  const graph = await readWorkspaceGraph({
    ...params,
    allowProcessingVideoForAi: true,
  });
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
    const selectedMedia = media.slice(0, MAX_AI_IMAGE_COUNT);
    const imagesForAI = await mapWithConcurrency(
      selectedMedia,
      AI_PROVIDER_SAFE_CONCURRENCY,
      async (item) => {
        return {
          name: item.originalFileName || `image-${item.position + 1}.jpg`,
          type: "image/jpeg",
          dataUrl: await resolveProviderSafeImageDataUrl({
            accountId: params.accountId,
            media: item,
            variants,
          }),
          mediaId: item.mediaId,
          position: item.position,
        };
      },
    );

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
