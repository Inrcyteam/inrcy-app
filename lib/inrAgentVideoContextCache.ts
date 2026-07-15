import "server-only";

import { createHash } from "node:crypto";

import {
  INR_AGENT_VIDEO_AI_PREPARATION_VERSION,
  prepareInrAgentVideoForAi,
  type InrAgentVideoPreparationResult,
  type InrAgentVideoPreparationSource,
} from "@/lib/inrAgentVideoPreparation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { VideoAiContextReference } from "@/lib/videoAiContextReference";

const DEFAULT_BUCKET = "inrcy-pro-media";
const FAILED_CACHE_RETRY_MS = 6 * 60 * 60 * 1000;
const MAX_PERSISTED_WARNINGS = 20;
const MAX_FRAME_PATHS = 3;

export type InrAgentVideoContextCacheSource =
  | "hit"
  | "miss"
  | "refresh"
  | "disabled";

export type InrAgentCachedVideoPreparationResult =
  InrAgentVideoPreparationResult & {
    cache: {
      source: InrAgentVideoContextCacheSource;
      persisted: boolean;
      fingerprint: string;
      framePaths: string[];
    };
  };

type VideoAiRow = {
  id: string;
  user_id: string;
  bucket_name: string | null;
  storage_path: string;
  media_type: string;
  mime_type: string | null;
  size_bytes: number | string | null;
  duration_seconds: number | string | null;
  ai_status: string | null;
  ai_transcript: string | null;
  ai_frame_paths: string[] | null;
  ai_prepared_at: string | null;
  ai_preparation_version: number | string | null;
  ai_source_fingerprint: string | null;
  ai_warnings: string[] | null;
  ai_timings: Record<string, unknown> | null;
};

function cleanStoragePath(value: unknown) {
  const path = String(value || "")
    .replace(/\\/g, "/")
    .replace(/\u0000/g, "")
    .replace(/^\/+/, "")
    .trim();
  if (!path || path.includes("..")) return "";
  return path;
}

function cleanBucket(value: unknown) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9._-]+/g, "")
    .slice(0, 100);
}

function cleanId(value: unknown) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9_-]+/g, "")
    .slice(0, 120);
}

function cleanTranscript(value: unknown) {
  return String(value || "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 5_000)
    .trim();
}

function normalizeStatus(value: unknown): InrAgentVideoPreparationResult["status"] {
  return value === "ready" || value === "partial" ? value : "unavailable";
}

function normalizeTimings(value: unknown): InrAgentVideoPreparationResult["timings"] {
  const record = value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
  const number = (entry: unknown) => {
    const parsed = Number(entry || 0);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
  };
  return {
    downloadMs: number(record.downloadMs),
    framesMs: number(record.framesMs),
    audioExtractionMs: number(record.audioExtractionMs),
    transcriptionMs: number(record.transcriptionMs),
    totalMs: number(record.totalMs),
  };
}

function warningCodes(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((entry) => String(entry || "").trim().slice(0, 300))
        .filter(Boolean)
        .slice(0, MAX_PERSISTED_WARNINGS)
    : [];
}

export function isVideoAiCacheSchemaUnavailable(error: {
  code?: string;
  message?: string;
} | null | undefined) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    message.includes("ai_status") ||
    message.includes("ai_transcript") ||
    message.includes("ai_frame_paths") ||
    message.includes("ai_preparation_version") ||
    message.includes("ai_source_fingerprint")
  );
}

export function buildInrAgentVideoSourceFingerprint(args: {
  mediaId: string;
  bucket: string;
  storagePath: string;
  mimeType?: string | null;
  size?: number | string | null;
  duration?: number | string | null;
}) {
  const payload = JSON.stringify({
    mediaId: cleanId(args.mediaId),
    bucket: cleanBucket(args.bucket),
    storagePath: cleanStoragePath(args.storagePath),
    mimeType: String(args.mimeType || "").trim().toLowerCase(),
    size: Number(args.size || 0) || 0,
    duration: Number(args.duration || 0) || 0,
  });
  return createHash("sha256").update(payload).digest("hex");
}

function ownedDerivativePrefix(userId: string) {
  return `users/${userId}/ai/video/`;
}

export function isOwnedInrAgentVideoDerivativePath(
  userId: string,
  path: unknown,
) {
  const cleanPath = cleanStoragePath(path);
  return Boolean(cleanPath && cleanPath.startsWith(ownedDerivativePrefix(userId)));
}

function buildFramePaths(args: {
  userId: string;
  mediaId: string;
  fingerprint: string;
  count: number;
}) {
  const mediaId = cleanId(args.mediaId) || "media";
  const fingerprint = String(args.fingerprint || "").slice(0, 24);
  return Array.from(
    { length: Math.min(MAX_FRAME_PATHS, Math.max(0, args.count)) },
    (_, index) =>
      `${ownedDerivativePrefix(args.userId)}${mediaId}/v${INR_AGENT_VIDEO_AI_PREPARATION_VERSION}/${fingerprint}/frame-${String(index + 1).padStart(2, "0")}.jpg`,
  );
}

function dataUrlToJpegBytes(value: unknown): Uint8Array | null {
  const match = /^data:image\/jpeg;base64,([a-z0-9+/=\r\n]+)$/i.exec(
    String(value || "").trim(),
  );
  if (!match) return null;
  const buffer = Buffer.from(match[1], "base64");
  return buffer.length ? new Uint8Array(buffer) : null;
}

async function loadPersistedFrames(bucket: string, paths: string[]) {
  const results = await Promise.allSettled(
    paths.slice(0, MAX_FRAME_PATHS).map(async (path) => {
      const cleanPath = cleanStoragePath(path);
      if (!cleanPath) throw new Error("invalid_cached_frame_path");
      const { data, error } = await supabaseAdmin.storage
        .from(bucket)
        .download(cleanPath);
      if (error || !data) {
        throw new Error(error?.message || "cached_frame_download_failed");
      }
      const buffer = Buffer.from(await data.arrayBuffer());
      if (!buffer.length) throw new Error("cached_frame_empty");
      return {
        dataUrl: `data:image/jpeg;base64,${buffer.toString("base64")}`,
        detail: "low" as const,
      };
    }),
  );

  return {
    frames: results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    ),
    complete: results.every((result) => result.status === "fulfilled"),
  };
}

function cacheFailureStillFresh(preparedAt: string | null) {
  const preparedMs = Date.parse(String(preparedAt || ""));
  return Number.isFinite(preparedMs) && Date.now() - preparedMs < FAILED_CACHE_RETRY_MS;
}

function cacheMetadata(args: {
  source: InrAgentVideoContextCacheSource;
  persisted: boolean;
  fingerprint: string;
  framePaths?: string[];
}) {
  return {
    source: args.source,
    persisted: args.persisted,
    fingerprint: args.fingerprint,
    framePaths: args.framePaths || [],
  };
}

async function removeDerivativePaths(bucket: string, userId: string, paths: string[]) {
  const ownedPaths = Array.from(
    new Set(
      paths
        .map(cleanStoragePath)
        .filter((path) => isOwnedInrAgentVideoDerivativePath(userId, path)),
    ),
  );
  if (!ownedPaths.length) return;
  const { error } = await supabaseAdmin.storage.from(bucket).remove(ownedPaths);
  if (error) {
    console.warn("[inr-agent] cached video frame cleanup unavailable", {
      count: ownedPaths.length,
      message: error.message,
    });
  }
}

async function persistPreparation(args: {
  row: VideoAiRow;
  userId: string;
  fingerprint: string;
  result: InrAgentVideoPreparationResult;
}) {
  const bucket = cleanBucket(args.row.bucket_name) || DEFAULT_BUCKET;
  const oldFramePaths = Array.isArray(args.row.ai_frame_paths)
    ? args.row.ai_frame_paths.map(cleanStoragePath).filter(Boolean)
    : [];
  const frameBuffers: Uint8Array[] = [];
  for (const frame of args.result.frames) {
    const bytes = dataUrlToJpegBytes(frame.dataUrl);
    if (bytes) frameBuffers.push(bytes);
  }
  const newFramePaths = buildFramePaths({
    userId: args.userId,
    mediaId: args.row.id,
    fingerprint: args.fingerprint,
    count: frameBuffers.length,
  });

  const uploadedPaths: string[] = [];
  try {
    for (let index = 0; index < frameBuffers.length; index += 1) {
      const path = newFramePaths[index];
      const { error } = await supabaseAdmin.storage.from(bucket).upload(
        path,
        frameBuffers[index],
        {
          contentType: "image/jpeg",
          cacheControl: "31536000",
          upsert: true,
        },
      );
      if (error) throw error;
      uploadedPaths.push(path);
    }

    const preparedAt = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("pro_media_library")
      .update({
        ai_status: args.result.status,
        ai_transcript: cleanTranscript(args.result.transcript) || null,
        ai_frame_paths: uploadedPaths,
        ai_prepared_at: preparedAt,
        ai_preparation_version: INR_AGENT_VIDEO_AI_PREPARATION_VERSION,
        ai_source_fingerprint: args.fingerprint,
        ai_warnings: warningCodes(args.result.warnings),
        ai_timings: args.result.timings,
        updated_at: preparedAt,
      })
      .eq("id", args.row.id)
      .eq("user_id", args.userId)
      .eq("media_type", "video");

    if (error) {
      if (isVideoAiCacheSchemaUnavailable(error)) {
        await removeDerivativePaths(
          bucket,
          args.userId,
          uploadedPaths.filter((path) => !oldFramePaths.includes(path)),
        );
        return { persisted: false, framePaths: [] as string[], schemaUnavailable: true };
      }
      throw error;
    }

    const obsoletePaths = oldFramePaths.filter(
      (path) => !uploadedPaths.includes(path),
    );
    await removeDerivativePaths(bucket, args.userId, obsoletePaths);
    return { persisted: true, framePaths: uploadedPaths, schemaUnavailable: false };
  } catch (error) {
    await removeDerivativePaths(
      bucket,
      args.userId,
      uploadedPaths.filter((path) => !oldFramePaths.includes(path)),
    );
    console.warn("[inr-agent] video AI context persistence unavailable", {
      mediaId: args.row.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return { persisted: false, framePaths: [] as string[], schemaUnavailable: false };
  }
}

/**
 * Charge le contexte vidéo persistant de la médiathèque ou prépare et mémorise
 * la vidéo une seule fois. La génération iNrAgent reste best-effort lorsque la
 * migration SQL n'est pas encore installée ou que Storage est momentanément
 * indisponible.
 */
export async function getOrPrepareInrAgentVideoForAi(args: {
  mediaId: string;
  userId: string;
  accountId: string;
  source: InrAgentVideoPreparationSource;
}): Promise<InrAgentCachedVideoPreparationResult> {
  const mediaId = cleanId(args.mediaId || args.source.id);
  if (!mediaId) {
    const fresh = await prepareInrAgentVideoForAi({
      source: args.source,
      accountId: args.accountId,
    });
    return {
      ...fresh,
      cache: cacheMetadata({
        source: "disabled",
        persisted: false,
        fingerprint: "",
      }),
    };
  }

  const select = [
    "id",
    "user_id",
    "bucket_name",
    "storage_path",
    "media_type",
    "mime_type",
    "size_bytes",
    "duration_seconds",
    "ai_status",
    "ai_transcript",
    "ai_frame_paths",
    "ai_prepared_at",
    "ai_preparation_version",
    "ai_source_fingerprint",
    "ai_warnings",
    "ai_timings",
  ].join(",");
  const { data, error } = await supabaseAdmin
    .from("pro_media_library")
    .select(select)
    .eq("id", mediaId)
    .eq("user_id", args.userId)
    .eq("media_type", "video")
    .maybeSingle();

  if (error || !data) {
    const fresh = await prepareInrAgentVideoForAi({
      source: args.source,
      accountId: args.accountId,
    });
    const disabled = Boolean(error && isVideoAiCacheSchemaUnavailable(error));
    if (error && !disabled) {
      console.warn("[inr-agent] video AI cache lookup unavailable", {
        mediaId,
        message: error.message,
      });
    }
    return {
      ...fresh,
      cache: cacheMetadata({
        source: "disabled",
        persisted: false,
        fingerprint: "",
      }),
    };
  }

  const row = data as unknown as VideoAiRow;
  const bucket = cleanBucket(row.bucket_name) || DEFAULT_BUCKET;
  const fingerprint = buildInrAgentVideoSourceFingerprint({
    mediaId: row.id,
    bucket,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    size: row.size_bytes,
    duration: row.duration_seconds,
  });
  const versionMatches =
    Number(row.ai_preparation_version || 0) ===
    INR_AGENT_VIDEO_AI_PREPARATION_VERSION;
  const fingerprintMatches = row.ai_source_fingerprint === fingerprint;
  const cachedFramePaths = Array.isArray(row.ai_frame_paths)
    ? row.ai_frame_paths.map(cleanStoragePath).filter(Boolean).slice(0, MAX_FRAME_PATHS)
    : [];
  const cachedTranscript = cleanTranscript(row.ai_transcript);
  const cachedStatus = normalizeStatus(row.ai_status);

  if (versionMatches && fingerprintMatches) {
    if (cachedStatus === "unavailable" && cacheFailureStillFresh(row.ai_prepared_at)) {
      return {
        status: "unavailable",
        frames: [],
        transcript: "",
        rawTranscript: "",
        warnings: warningCodes(row.ai_warnings),
        sourceBytes: Number(row.size_bytes || 0) || 0,
        timings: normalizeTimings(row.ai_timings),
        cache: cacheMetadata({
          source: "hit",
          persisted: true,
          fingerprint,
          framePaths: cachedFramePaths,
        }),
      };
    }

    if (cachedFramePaths.length || cachedTranscript) {
      const loaded = await loadPersistedFrames(bucket, cachedFramePaths);
      if (loaded.complete) {
        return {
          status:
            loaded.frames.length && cachedTranscript
              ? "ready"
              : loaded.frames.length || cachedTranscript
                ? "partial"
                : cachedStatus,
          frames: loaded.frames,
          transcript: cachedTranscript,
          rawTranscript: cachedTranscript,
          warnings: warningCodes(row.ai_warnings),
          sourceBytes: Number(row.size_bytes || 0) || 0,
          timings: normalizeTimings(row.ai_timings),
          cache: cacheMetadata({
            source: "hit",
            persisted: true,
            fingerprint,
            framePaths: cachedFramePaths,
          }),
        };
      }
    }
  }

  const cacheSource: InrAgentVideoContextCacheSource =
    row.ai_prepared_at || row.ai_source_fingerprint ? "refresh" : "miss";
  const fresh = await prepareInrAgentVideoForAi({
    source: {
      ...args.source,
      id: row.id,
      bucket,
      storagePath: row.storage_path,
      mimeType: row.mime_type || args.source.mimeType,
      size: Number(row.size_bytes || args.source.size || 0) || null,
      duration: Number(row.duration_seconds || args.source.duration || 0) || null,
    },
    accountId: args.accountId,
  });
  const persistence = await persistPreparation({
    row,
    userId: args.userId,
    fingerprint,
    result: fresh,
  });

  return {
    ...fresh,
    cache: cacheMetadata({
      source: persistence.schemaUnavailable ? "disabled" : cacheSource,
      persisted: persistence.persisted,
      fingerprint,
      framePaths: persistence.framePaths,
    }),
  };
}


/**
 * Lit uniquement un contexte vidéo déjà préparé et encore valide. Cette
 * fonction ne télécharge jamais la vidéo source, ne lance jamais FFmpeg et ne
 * déclenche aucune transcription. Elle est utilisée par iNrSend/Booster pour
 * réutiliser le travail fait par iNrAgent.
 */
export async function loadPersistedInrAgentVideoForAi(args: {
  userId: string;
  reference: VideoAiContextReference;
}): Promise<InrAgentCachedVideoPreparationResult | null> {
  const mediaId = cleanId(args.reference.mediaAssetId);
  if (!mediaId) return null;

  const select = [
    "id",
    "user_id",
    "bucket_name",
    "storage_path",
    "media_type",
    "mime_type",
    "size_bytes",
    "duration_seconds",
    "ai_status",
    "ai_transcript",
    "ai_frame_paths",
    "ai_prepared_at",
    "ai_preparation_version",
    "ai_source_fingerprint",
    "ai_warnings",
    "ai_timings",
  ].join(",");
  const { data, error } = await supabaseAdmin
    .from("pro_media_library")
    .select(select)
    .eq("id", mediaId)
    .eq("user_id", args.userId)
    .eq("media_type", "video")
    .maybeSingle();

  if (error || !data) {
    if (error && !isVideoAiCacheSchemaUnavailable(error)) {
      console.warn("[inrsend] persisted video AI context lookup unavailable", {
        mediaId,
        message: error.message,
      });
    }
    return null;
  }

  const row = data as unknown as VideoAiRow;
  const bucket = cleanBucket(row.bucket_name) || DEFAULT_BUCKET;
  const currentFingerprint = buildInrAgentVideoSourceFingerprint({
    mediaId: row.id,
    bucket,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    size: row.size_bytes,
    duration: row.duration_seconds,
  });
  const storedFingerprint = String(row.ai_source_fingerprint || "").trim();
  const storedVersion = Number(row.ai_preparation_version || 0);

  if (
    storedVersion !== INR_AGENT_VIDEO_AI_PREPARATION_VERSION ||
    storedVersion !== args.reference.preparationVersion ||
    storedFingerprint !== currentFingerprint ||
    storedFingerprint !== args.reference.sourceFingerprint
  ) {
    return null;
  }

  const framePaths = Array.isArray(row.ai_frame_paths)
    ? row.ai_frame_paths
        .map(cleanStoragePath)
        .filter((path) => isOwnedInrAgentVideoDerivativePath(args.userId, path))
        .slice(0, MAX_FRAME_PATHS)
    : [];
  const transcript = cleanTranscript(row.ai_transcript);
  const loaded = await loadPersistedFrames(bucket, framePaths);
  const status = normalizeStatus(row.ai_status);

  if (!loaded.frames.length && !transcript && status !== "unavailable") {
    return null;
  }

  return {
    status:
      loaded.frames.length && transcript
        ? "ready"
        : loaded.frames.length || transcript
          ? "partial"
          : "unavailable",
    frames: loaded.frames,
    transcript,
    rawTranscript: transcript,
    warnings: warningCodes(row.ai_warnings),
    sourceBytes: Number(row.size_bytes || 0) || 0,
    timings: normalizeTimings(row.ai_timings),
    cache: cacheMetadata({
      source: "hit",
      persisted: true,
      fingerprint: currentFingerprint,
      framePaths,
    }),
  };
}

export async function loadInrAgentVideoDerivativePaths(args: {
  userId: string;
  mediaIds: string[];
}) {
  const mediaIds = Array.from(
    new Set(args.mediaIds.map(cleanId).filter(Boolean)),
  ).slice(0, 200);
  if (!mediaIds.length) return new Map<string, { bucket: string; paths: string[] }>();

  const { data, error } = await supabaseAdmin
    .from("pro_media_library")
    .select("id,bucket_name,ai_frame_paths")
    .eq("user_id", args.userId)
    .in("id", mediaIds);

  if (error) {
    if (!isVideoAiCacheSchemaUnavailable(error)) {
      console.warn("[inr-agent] video derivative lookup unavailable", {
        message: error.message,
      });
    }
    return new Map<string, { bucket: string; paths: string[] }>();
  }

  const result = new Map<string, { bucket: string; paths: string[] }>();
  for (const row of Array.isArray(data) ? data : []) {
    const id = cleanId((row as { id?: unknown }).id);
    if (!id) continue;
    const bucket = cleanBucket((row as { bucket_name?: unknown }).bucket_name) || DEFAULT_BUCKET;
    const paths = Array.isArray((row as { ai_frame_paths?: unknown }).ai_frame_paths)
      ? ((row as { ai_frame_paths: unknown[] }).ai_frame_paths)
          .map(cleanStoragePath)
          .filter((path) => isOwnedInrAgentVideoDerivativePath(args.userId, path))
      : [];
    result.set(id, { bucket, paths });
  }
  return result;
}
