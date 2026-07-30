import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { refreshPublicationWorkspaceStatusesForMedia } from "@/lib/mediaWorkspaceServer";
import { claimTargetedProcessingJob } from "@/lib/mediaProcessingTargetedClaim";
import {
  VIDEO_NORMALIZATION_DEFAULT_BATCH_SIZE,
  VIDEO_NORMALIZATION_JOB_TYPE,
  VIDEO_NORMALIZATION_MAX_BATCH_SIZE,
  VIDEO_NORMALIZATION_MAX_SOURCE_BYTES,
  VIDEO_NORMALIZATION_MAX_SOURCE_MB_LABEL,
  VIDEO_NORMALIZATION_PIPELINE_VERSION,
  VIDEO_NORMALIZATION_VARIANT_KEYS,
  VIDEO_NORMALIZATION_WORKER_LEASE_SECONDS,
  buildVideoNormalizationStoragePath,
  getVideoNormalizationKeyFromSignature,
  getVideoNormalizationRetryDelaySeconds,
  getVideoNormalizationSignature,
  isVideoNormalizationEnabled,
  type VideoNormalizationVariantKey,
} from "@/lib/mediaVideoNormalizationPolicy";
import {
  normalizeVideoSource,
  type NormalizedVideoVariant,
} from "@/lib/mediaVideoNormalizer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ClaimedVideoJob = {
  id: string;
  account_id: string;
  media_id: string;
  workspace_id: string | null;
  variant_id: string | null;
  status: string;
  progress: number;
  attempt_count: number;
  max_attempts: number;
  payload: Record<string, unknown> | null;
};

type MediaRow = {
  id: string;
  user_id: string;
  bucket_name: string;
  storage_path: string;
  media_type: string;
  mime_type: string | null;
  detected_mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  upload_status: string;
  processing_status: string;
  publication_status: string;
  original_file_name: string | null;
  media_metadata: Record<string, unknown> | null;
};

type VariantRow = {
  id: string;
  purpose: string;
  signature: string;
  status: string;
  key: VideoNormalizationVariantKey;
};

type ProcessedJobSummary = {
  jobId: string;
  mediaId: string;
  status: "succeeded" | "retry_wait" | "failed" | "cancelled";
  errorCode?: string;
};

class VideoNormalizationError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.name = "VideoNormalizationError";
    this.code = code;
    this.retryable = retryable;
  }
}

function compactMessage(error: unknown) {
  const record = error as { stderr?: unknown; message?: unknown } | null;
  return String(record?.stderr || record?.message || error || "Erreur inconnue")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1_500);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function classifyWorkerError(error: unknown) {
  if (error instanceof VideoNormalizationError) return error;
  const message = compactMessage(error).toLowerCase();
  const terminal =
    message.includes("video_source_too_large") ||
    message.includes("video_dimensions_unavailable") ||
    message.includes("video_duration_unavailable") ||
    message.includes("video_output_too_large") ||
    message.includes("video_frame_too_large") ||
    message.includes("video_audio_too_large") ||
    message.includes("invalid data found") ||
    message.includes("moov atom not found") ||
    message.includes("could not find codec parameters") ||
    message.includes("unsupported codec") ||
    message.includes("video_probe_failed") ||
    message.includes("corrupt") ||
    message.includes("decode");

  return new VideoNormalizationError(
    terminal ? "video_decode_failed" : "video_worker_temporary_failure",
    compactMessage(error),
    !terminal,
  );
}

async function updateJobProgress(job: ClaimedVideoJob, progress: number) {
  const safe = Math.max(1, Math.min(99, Math.round(progress)));
  const now = new Date().toISOString();
  await Promise.all([
    supabaseAdmin
      .from("media_processing_jobs")
      .update({
        progress: safe,
        lock_expires_at: new Date(
          Date.now() + VIDEO_NORMALIZATION_WORKER_LEASE_SECONDS * 1_000,
        ).toISOString(),
        updated_at: now,
      })
      .eq("id", job.id)
      .eq("account_id", job.account_id),
    supabaseAdmin
      .from("pro_media_library")
      .update({
        processing_status: "processing",
        publication_status: "processing",
        processing_progress: safe,
        processing_started_at: now,
        processing_error_code: null,
        processing_error_message: null,
      })
      .eq("id", job.media_id)
      .eq("user_id", job.account_id),
  ]);
}

async function loadMedia(job: ClaimedVideoJob): Promise<MediaRow> {
  const result = await supabaseAdmin
    .from("pro_media_library")
    .select(
      "id,user_id,bucket_name,storage_path,media_type,mime_type,detected_mime_type,size_bytes,width,height,duration_seconds,upload_status,processing_status,publication_status,original_file_name,media_metadata",
    )
    .eq("id", job.media_id)
    .eq("user_id", job.account_id)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) {
    throw new VideoNormalizationError(
      "video_media_not_found",
      "Média vidéo introuvable.",
      false,
    );
  }
  return result.data as MediaRow;
}

async function loadVariants(job: ClaimedVideoJob): Promise<VariantRow[]> {
  const signatures = VIDEO_NORMALIZATION_VARIANT_KEYS.map((key) =>
    getVideoNormalizationSignature(key),
  );
  const result = await supabaseAdmin
    .from("media_variants")
    .select("id,purpose,signature,status")
    .eq("account_id", job.account_id)
    .eq("media_id", job.media_id)
    .is("workspace_id", null)
    .in("signature", signatures);
  if (result.error) throw result.error;

  const rows = (result.data || [])
    .map((row: any) => {
      const key = getVideoNormalizationKeyFromSignature(String(row.signature));
      return key ? ({ ...row, key } as VariantRow) : null;
    })
    .filter((row): row is VariantRow => Boolean(row));
  const keys = new Set(rows.map((row) => row.key));
  for (const key of VIDEO_NORMALIZATION_VARIANT_KEYS) {
    if (!keys.has(key)) {
      throw new VideoNormalizationError(
        "video_variant_missing",
        `Variante vidéo ${key} absente du registre.`,
        true,
      );
    }
  }
  return rows;
}

async function markVariantsProcessing(
  job: ClaimedVideoJob,
  variants: VariantRow[],
) {
  const result = await supabaseAdmin
    .from("media_variants")
    .update({
      status: "processing",
      error_code: null,
      error_message: null,
      pipeline_version: VIDEO_NORMALIZATION_PIPELINE_VERSION,
    })
    .eq("account_id", job.account_id)
    .eq("media_id", job.media_id)
    .in(
      "id",
      variants.map((variant) => variant.id),
    );
  if (result.error) throw result.error;
}

async function downloadSourceToTemp(media: MediaRow, jobId: string) {
  const declaredSize = Number(media.size_bytes || 0);
  if (declaredSize > VIDEO_NORMALIZATION_MAX_SOURCE_BYTES) {
    throw new VideoNormalizationError(
      "video_source_too_large",
      `La source dépasse le plafond technique de ${VIDEO_NORMALIZATION_MAX_SOURCE_MB_LABEL} du worker vidéo.`,
      false,
    );
  }

  const signed = await supabaseAdmin.storage
    .from(media.bucket_name)
    .createSignedUrl(media.storage_path, 600);
  if (signed.error || !signed.data?.signedUrl) {
    throw new VideoNormalizationError(
      "video_source_signing_failed",
      signed.error?.message || "URL source privée indisponible.",
      true,
    );
  }

  const response = await fetch(signed.data.signedUrl, { cache: "no-store" });
  if (!response.ok || !response.body) {
    throw new VideoNormalizationError(
      "video_source_download_failed",
      `Téléchargement source impossible (${response.status}).`,
      response.status >= 500 || response.status === 408 || response.status === 429,
    );
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > VIDEO_NORMALIZATION_MAX_SOURCE_BYTES) {
    throw new VideoNormalizationError(
      "video_source_too_large",
      `La source dépasse le plafond technique de ${VIDEO_NORMALIZATION_MAX_SOURCE_MB_LABEL} du worker vidéo.`,
      false,
    );
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "inrcy-video-normalize-"));
  const inputPath = path.join(workDir, `${jobId || randomUUID()}.source`);
  let bytes = 0;
  const hash = createHash("sha256");
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.byteLength;
      if (bytes > VIDEO_NORMALIZATION_MAX_SOURCE_BYTES) {
        callback(
          new VideoNormalizationError(
            "video_source_too_large",
            `La source dépasse le plafond technique de ${VIDEO_NORMALIZATION_MAX_SOURCE_MB_LABEL} du worker vidéo.`,
            false,
          ),
        );
        return;
      }
      hash.update(buffer);
      callback(null, buffer);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(response.body as any),
      meter,
      createWriteStream(inputPath, { flags: "wx" }),
    );
    if (!bytes) {
      throw new VideoNormalizationError(
        "video_source_empty",
        "La source vidéo est vide.",
        false,
      );
    }
    return {
      workDir,
      inputPath,
      sizeBytes: bytes,
      sha256: hash.digest("hex"),
    };
  } catch (error) {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

async function uploadVariant(params: {
  job: ClaimedVideoJob;
  variant: VariantRow;
  normalized: NormalizedVideoVariant;
}) {
  const bucket = "inrcy-pro-media";
  const storagePath = buildVideoNormalizationStoragePath({
    accountId: params.job.account_id,
    mediaId: params.job.media_id,
    key: params.normalized.key,
  });
  let storedBucket: string | null = null;
  let storedPath: string | null = null;

  if (params.normalized.available && params.normalized.filePath) {
    const buffer = await readFile(params.normalized.filePath);
    if (!buffer.length) {
      throw new VideoNormalizationError(
        "video_variant_empty",
        `La variante ${params.normalized.key} est vide.`,
        true,
      );
    }
    const upload = await supabaseAdmin.storage
      .from(bucket)
      .upload(storagePath, buffer, {
        upsert: true,
        contentType: params.normalized.mimeType,
        cacheControl: "31536000",
      });
    if (upload.error) {
      throw new VideoNormalizationError(
        "video_variant_upload_failed",
        upload.error.message,
        true,
      );
    }
    storedBucket = bucket;
    storedPath = storagePath;
  }

  const update = await supabaseAdmin
    .from("media_variants")
    .update({
      status: "ready",
      bucket_name: storedBucket,
      storage_path: storedPath,
      mime_type: params.normalized.mimeType,
      size_bytes: params.normalized.sizeBytes,
      width: params.normalized.width,
      height: params.normalized.height,
      duration_seconds: params.normalized.durationSeconds,
      pipeline_version: VIDEO_NORMALIZATION_PIPELINE_VERSION,
      transform_spec: params.normalized.transformSpec,
      variant_metadata: {
        ...params.normalized.metadata,
        available: params.normalized.available,
      },
      error_code: null,
      error_message: null,
      ready_at: new Date().toISOString(),
    })
    .eq("id", params.variant.id)
    .eq("account_id", params.job.account_id)
    .eq("media_id", params.job.media_id);
  if (update.error) throw update.error;

  return {
    key: params.normalized.key,
    purpose: params.normalized.purpose,
    variantId: params.variant.id,
    available: params.normalized.available,
    bucket: storedBucket,
    storagePath: storedPath,
    mimeType: params.normalized.mimeType,
    sizeBytes: params.normalized.sizeBytes,
    width: params.normalized.width,
    height: params.normalized.height,
    durationSeconds: params.normalized.durationSeconds,
  };
}

async function markJobCancelled(
  job: ClaimedVideoJob,
  variants: VariantRow[],
  reason: string,
): Promise<ProcessedJobSummary> {
  const now = new Date().toISOString();
  const operations: PromiseLike<unknown>[] = [
    supabaseAdmin
      .from("media_processing_jobs")
      .update({
        status: "cancelled",
        progress: 0,
        error_code: "video_normalization_cancelled",
        error_message: reason,
        completed_at: now,
        locked_at: null,
        lock_expires_at: null,
        locked_by: null,
      })
      .eq("id", job.id),
  ];
  if (variants.length) {
    operations.push(
      supabaseAdmin
        .from("media_variants")
        .update({
          status: "removed",
          error_code: "source_removed",
          error_message: reason,
        })
        .in(
          "id",
          variants.map((variant) => variant.id),
        ),
    );
  }
  await Promise.all(operations);
  return { jobId: job.id, mediaId: job.media_id, status: "cancelled" };
}

async function markJobFailure(params: {
  job: ClaimedVideoJob;
  variants: VariantRow[];
  error: unknown;
}): Promise<ProcessedJobSummary> {
  const normalized = classifyWorkerError(params.error);
  const exhausted = params.job.attempt_count >= params.job.max_attempts;
  const retryable = normalized.retryable && !exhausted;
  const jobStatus = retryable ? "retry_wait" : "failed";
  const mediaStatus = retryable ? "failed_retryable" : "failed_terminal";
  const now = new Date();
  const availableAt = new Date(
    now.getTime() +
      getVideoNormalizationRetryDelaySeconds(params.job.attempt_count) * 1_000,
  ).toISOString();

  const operations: PromiseLike<unknown>[] = [
    supabaseAdmin
      .from("media_processing_jobs")
      .update({
        status: jobStatus,
        progress: 0,
        available_at: retryable ? availableAt : now.toISOString(),
        error_code: normalized.code,
        error_message: normalized.message,
        completed_at: retryable ? null : now.toISOString(),
        locked_at: null,
        lock_expires_at: null,
        locked_by: null,
      })
      .eq("id", params.job.id)
      .eq("account_id", params.job.account_id),
    supabaseAdmin
      .from("pro_media_library")
      .update({
        processing_status: mediaStatus,
        publication_status: retryable ? "processing" : "failed",
        processing_progress: 0,
        processing_error_code: normalized.code,
        processing_error_message: normalized.message,
        processing_completed_at: retryable ? null : now.toISOString(),
      })
      .eq("id", params.job.media_id)
      .eq("user_id", params.job.account_id),
  ];
  if (params.variants.length) {
    operations.push(
      supabaseAdmin
        .from("media_variants")
        .update({
          status: "failed",
          error_code: normalized.code,
          error_message: normalized.message,
        })
        .in(
          "id",
          params.variants.map((variant) => variant.id),
        )
        .eq("account_id", params.job.account_id),
    );
  }
  await Promise.all(operations);

  await refreshPublicationWorkspaceStatusesForMedia({
    mediaId: params.job.media_id,
    accountId: params.job.account_id,
  }).catch((error) => {
    console.error("[media-pipeline] video failure workspace refresh failed", error);
  });

  return {
    jobId: params.job.id,
    mediaId: params.job.media_id,
    status: jobStatus,
    errorCode: normalized.code,
  };
}

async function processClaimedVideoJob(
  job: ClaimedVideoJob,
): Promise<ProcessedJobSummary> {
  let variants: VariantRow[] = [];
  let workDir = "";
  try {
    const media = await loadMedia(job);
    variants = await loadVariants(job);

    if (media.upload_status === "removed") {
      return await markJobCancelled(job, variants, "La source a été retirée.");
    }
    if (media.media_type !== "video") {
      return await markJobCancelled(job, variants, "Le média n’est pas une vidéo.");
    }
    if (media.upload_status !== "uploaded") {
      throw new VideoNormalizationError(
        "video_source_not_uploaded",
        "La source vidéo n’est pas encore disponible.",
        true,
      );
    }

    await markVariantsProcessing(job, variants);
    await updateJobProgress(job, 5);

    const downloaded = await downloadSourceToTemp(media, job.id);
    workDir = downloaded.workDir;
    await updateJobProgress(job, 20);

    const normalized = await normalizeVideoSource({
      inputPath: downloaded.inputPath,
      outputDirectory: path.join(workDir, "outputs"),
      fallbackWidth: media.width,
      fallbackHeight: media.height,
      fallbackDurationSeconds: media.duration_seconds,
    });
    await updateJobProgress(job, 72);

    const byKey = new Map(variants.map((variant) => [variant.key, variant]));
    const outputs: Record<string, Awaited<ReturnType<typeof uploadVariant>>> = {};
    for (let index = 0; index < VIDEO_NORMALIZATION_VARIANT_KEYS.length; index += 1) {
      const key = VIDEO_NORMALIZATION_VARIANT_KEYS[index];
      const variant = byKey.get(key);
      if (!variant) {
        throw new VideoNormalizationError(
          "video_variant_missing",
          `Variante ${key} absente au moment de l’upload.`,
          true,
        );
      }
      outputs[key] = await uploadVariant({
        job,
        variant,
        normalized: normalized.variants[key],
      });
      await updateJobProgress(
        job,
        74 + Math.round(((index + 1) / VIDEO_NORMALIZATION_VARIANT_KEYS.length) * 20),
      );
    }

    const canonical = outputs.canonical;
    if (!canonical?.bucket || !canonical.storagePath) {
      throw new VideoNormalizationError(
        "video_canonical_missing",
        "La variante canonique vidéo n’a pas été produite.",
        true,
      );
    }

    const completedAt = new Date().toISOString();
    const existingMetadata = asRecord(media.media_metadata);
    const mediaUpdate = await supabaseAdmin
      .from("pro_media_library")
      .update({
        width: normalized.source.orientedWidth,
        height: normalized.source.orientedHeight,
        duration_seconds: normalized.source.durationSeconds,
        canonical_bucket_name: canonical.bucket,
        canonical_storage_path: canonical.storagePath,
        canonical_mime_type: canonical.mimeType,
        canonical_size_bytes: canonical.sizeBytes,
        content_hash_sha256: downloaded.sha256,
        processing_status: "ready",
        publication_status: "ready",
        processing_progress: 100,
        processing_error_code: null,
        processing_error_message: null,
        processing_completed_at: completedAt,
        pipeline_version: VIDEO_NORMALIZATION_PIPELINE_VERSION,
        media_metadata: {
          ...existingMetadata,
          video_normalization: {
            version: VIDEO_NORMALIZATION_PIPELINE_VERSION,
            source: normalized.source,
            variants: outputs,
            warnings: normalized.warnings,
            completed_at: completedAt,
          },
        },
      })
      .eq("id", job.media_id)
      .eq("user_id", job.account_id);
    if (mediaUpdate.error) throw mediaUpdate.error;

    const jobUpdate = await supabaseAdmin
      .from("media_processing_jobs")
      .update({
        status: "succeeded",
        progress: 100,
        result: {
          pipelineVersion: VIDEO_NORMALIZATION_PIPELINE_VERSION,
          sourceSha256: downloaded.sha256,
          sourceSizeBytes: downloaded.sizeBytes,
          source: normalized.source,
          variants: outputs,
          warnings: normalized.warnings,
        },
        error_code: null,
        error_message: null,
        completed_at: completedAt,
        locked_at: null,
        lock_expires_at: null,
        locked_by: null,
      })
      .eq("id", job.id)
      .eq("account_id", job.account_id);
    if (jobUpdate.error) throw jobUpdate.error;

    await refreshPublicationWorkspaceStatusesForMedia({
      mediaId: job.media_id,
      accountId: job.account_id,
    });

    return { jobId: job.id, mediaId: job.media_id, status: "succeeded" };
  } catch (error) {
    return await markJobFailure({ job, variants, error });
  } finally {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

async function claimVideoJobs(params: { workerId: string; limit: number }) {
  const result = await supabaseAdmin.rpc("inrcy_claim_video_normalization_jobs", {
    p_worker_id: params.workerId,
    p_limit: params.limit,
    p_lease_seconds: VIDEO_NORMALIZATION_WORKER_LEASE_SECONDS,
  });
  if (result.error) throw result.error;
  return (Array.isArray(result.data) ? result.data : []) as ClaimedVideoJob[];
}

export async function processVideoNormalizationJobs(params?: {
  limit?: number;
  workerId?: string;
}) {
  if (!isVideoNormalizationEnabled()) {
    return {
      enabled: false,
      claimed: 0,
      succeeded: 0,
      retrying: 0,
      failed: 0,
      cancelled: 0,
      jobs: [] as ProcessedJobSummary[],
    };
  }

  const limit = Math.max(
    1,
    Math.min(
      VIDEO_NORMALIZATION_MAX_BATCH_SIZE,
      Math.round(params?.limit || VIDEO_NORMALIZATION_DEFAULT_BATCH_SIZE),
    ),
  );
  const workerId =
    String(params?.workerId || "").trim() ||
    `video-worker-${process.env.VERCEL_REGION || "local"}-${randomUUID()}`;
  const jobs = await claimVideoJobs({ workerId, limit });
  const summaries: ProcessedJobSummary[] = [];

  // Un seul encodage vidéo à la fois : la source peut atteindre 300 Mo et
  // FFmpeg utilise déjà plusieurs threads pour le MP4 canonique.
  for (const job of jobs) {
    summaries.push(await processClaimedVideoJob(job));
  }

  return {
    enabled: true,
    claimed: jobs.length,
    succeeded: summaries.filter((item) => item.status === "succeeded").length,
    retrying: summaries.filter((item) => item.status === "retry_wait").length,
    failed: summaries.filter((item) => item.status === "failed").length,
    cancelled: summaries.filter((item) => item.status === "cancelled").length,
    jobs: summaries,
  };
}

export async function processVideoNormalizationJobsForMedia(params: {
  accountId: string;
  mediaIds: readonly string[];
  workerId?: string;
}) {
  if (!isVideoNormalizationEnabled()) {
    return {
      enabled: false,
      requested: 0,
      claimed: 0,
      succeeded: 0,
      retrying: 0,
      failed: 0,
      cancelled: 0,
      jobs: [] as ProcessedJobSummary[],
    };
  }

  const accountId = String(params.accountId || "").trim();
  const mediaIds = Array.from(
    new Set(
      params.mediaIds
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  ).slice(0, 1);
  if (!accountId || mediaIds.length === 0) {
    return {
      enabled: true,
      requested: mediaIds.length,
      claimed: 0,
      succeeded: 0,
      retrying: 0,
      failed: 0,
      cancelled: 0,
      jobs: [] as ProcessedJobSummary[],
    };
  }

  const workerId =
    String(params.workerId || "").trim() ||
    `video-workspace-${process.env.VERCEL_REGION || "local"}-${randomUUID()}`;
  const summaries: ProcessedJobSummary[] = [];
  let claimed = 0;

  for (const mediaId of mediaIds) {
    const job = await claimTargetedProcessingJob({
      accountId,
      mediaId,
      jobType: VIDEO_NORMALIZATION_JOB_TYPE,
      workerId: workerId.slice(0, 180),
      leaseSeconds: VIDEO_NORMALIZATION_WORKER_LEASE_SECONDS,
    });
    if (!job) continue;
    claimed += 1;
    summaries.push(await processClaimedVideoJob(job as ClaimedVideoJob));
  }

  return {
    enabled: true,
    requested: mediaIds.length,
    claimed,
    succeeded: summaries.filter((item) => item.status === "succeeded").length,
    retrying: summaries.filter((item) => item.status === "retry_wait").length,
    failed: summaries.filter((item) => item.status === "failed").length,
    cancelled: summaries.filter((item) => item.status === "cancelled").length,
    jobs: summaries,
  };
}
