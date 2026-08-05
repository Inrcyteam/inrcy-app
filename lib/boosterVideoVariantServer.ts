import { createHash, randomUUID } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { access, chmod, mkdir, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import ffmpegStaticPath from "ffmpeg-static";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { toExactStorageArrayBuffer } from "@/lib/supabaseStorageBinary";
import {
  buildVideoTransformPlan,
  getVideoTransformQualityProfile,
  type BoosterVideoTransformRequestVariant,
  type BoosterVideoTransformSource,
  type BoosterVideoTransformVariantPlan,
  type BoosterVideoTransformedVariant,
} from "@/lib/boosterVideoTransforms";
import {
  INR_MEDIA_VIDEO_PUBLISH_MAX_BYTES,
  INR_MEDIA_VIDEO_SOURCE_MAX_BYTES,
} from "@/lib/mediaRules";
import {
  canPublishVideoSourceDirectly,
  normalizeVideoFrameRate,
} from "@/lib/mediaVideoSourceCompatibility";
import { validateVideoPublicationForChannel } from "@/lib/videoPublicationPolicy";
import {
  getVideoTargetBitrateKbps,
} from "@/lib/mediaVideoNormalizationPolicy";
import {
  probeVideoSource,
  resolveVideoNormalizationFfmpegPath,
} from "@/lib/mediaVideoNormalizer";
import {
  GOOGLE_BUSINESS_VIDEO_PROFILE,
  GOOGLE_BUSINESS_VIDEO_MAX_DURATION_SECONDS,
  GOOGLE_BUSINESS_VIDEO_MIN_SHORT_EDGE,
} from "@/lib/googleBusinessMediaPolicy";

const execFileAsync = promisify(execFile);
const BOOSTER_BUCKET = "booster";
const MAX_VARIANTS_PER_REQUEST = 10;
const OUTPUT_CONTENT_TYPE = "video/mp4";
const FFMPEG_TRANSFORM_TIMEOUT_MS = 150000;
const CHANNEL_VIDEO_VARIANT_PIPELINE_VERSION = 7;

type CachedVideoVariantRow = {
  id: string;
  media_id: string;
  signature: string | null;
  bucket_name: string | null;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  variant_metadata: Record<string, unknown> | null;
};

export type BoosterVideoVariantServerResult = {
  ok: boolean;
  fallbackToOriginal: boolean;
  source: {
    bucket: string;
    storagePath: string | null;
    publicUrl: string | null;
    size: number;
    duration: number | null;
    width: number | null;
    height: number | null;
    videoCodec?: string | null;
    audioCodec?: string | null;
    frameRate?: number | null;
    hasAudio?: boolean | null;
    containerFormats?: string[] | null;
    pixelFormat?: string | null;
  };
  variants: BoosterVideoTransformedVariant[];
  errors: Array<{
    key?: string;
    format?: string;
    adaptationMode?: string;
    message: string;
  }>;
};

function normalizeSafeSegment(value: string, fallback: string) {
  const safe = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/[-_]{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 90);
  return safe || fallback;
}

function sanitizeUserId(userId: string) {
  return normalizeSafeSegment(userId, randomUUID()).replace(/\./g, "-");
}

function sanitizeStoragePath(storagePath: unknown) {
  const clean = String(storagePath || "")
    .replace(/\\/g, "/")
    .replace(/\u0000/g, "")
    .replace(/^\/+/, "")
    .trim();
  if (!clean || clean.includes("..")) return "";
  return clean;
}

function sanitizeBucketName(value: unknown) {
  const clean = String(value || BOOSTER_BUCKET).trim();
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(clean)) return BOOSTER_BUCKET;
  return clean;
}

function getSourceExtension(source: BoosterVideoTransformSource) {
  const type = String(source.type || "").toLowerCase();
  const name = String(source.name || source.storagePath || "").toLowerCase();
  if (type.includes("webm") || name.endsWith(".webm")) return "webm";
  if (type.includes("quicktime") || name.endsWith(".mov")) return "mov";
  if (name.endsWith(".m4v")) return "m4v";
  return "mp4";
}

function compactFfmpegError(error: any, fallback: string) {
  const raw = String(error?.stderr || error?.message || fallback).trim();
  if (!raw) return fallback;
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return (lines.slice(-12).join(" | ") || raw).slice(-1_200);
}

async function downloadSourceVideo(source: BoosterVideoTransformSource) {
  const storagePath = sanitizeStoragePath(source.storagePath);
  const bucket = sanitizeBucketName(source.bucket);
  if (storagePath) {
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .download(storagePath);
    if (error || !data) {
      throw new Error(
        error?.message || "Impossible de lire la vidéo source depuis le stockage.",
      );
    }
    return {
      bucket,
      storagePath,
      publicUrl: String(source.publicUrl || source.url || "").trim() || null,
      buffer: Buffer.from(await data.arrayBuffer()),
    };
  }

  const publicUrl = String(source.publicUrl || source.url || "").trim();
  if (!publicUrl || !/^https?:\/\//i.test(publicUrl)) {
    throw new Error("Vidéo source manquante : storagePath ou URL publique requis.");
  }
  const res = await fetch(publicUrl);
  if (!res.ok) {
    throw new Error(`Impossible de télécharger la vidéo source (${res.status}).`);
  }
  return {
    bucket,
    storagePath: "",
    publicUrl,
    buffer: Buffer.from(await res.arrayBuffer()),
  };
}

function getBundledFfmpegCandidate() {
  const binaryName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  return path.join(process.cwd(), "node_modules", "ffmpeg-static", binaryName);
}

function getFfmpegPathCandidates() {
  return [
    process.env.FFMPEG_PATH,
    ffmpegStaticPath,
    getBundledFfmpegCandidate(),
    "ffmpeg",
  ]
    .map((candidate) => String(candidate || "").trim())
    .filter(Boolean);
}

async function makeFfmpegExecutableIfNeeded(ffmpegPath: string) {
  if (!ffmpegPath || ffmpegPath === "ffmpeg" || process.platform === "win32") return;
  try {
    await access(ffmpegPath);
    await chmod(ffmpegPath, 0o755);
  } catch {
    // Le test de disponibilité ci-dessous retourne l'erreur précise.
  }
}

async function ensureFfmpegAvailable() {
  const errors: string[] = [];
  for (const ffmpegPath of getFfmpegPathCandidates()) {
    try {
      await makeFfmpegExecutableIfNeeded(ffmpegPath);
      await execFileAsync(ffmpegPath, ["-version"], {
        timeout: 6000,
        maxBuffer: 1024 * 1024,
      });
      return ffmpegPath;
    } catch (error: any) {
      errors.push(
        `${ffmpegPath}: ${String(error?.stderr || error?.message || error || "indisponible").slice(0, 260)}`,
      );
    }
  }
  throw new Error(
    `Adaptation automatique indisponible : FFmpeg n'est pas exécutable sur le serveur. ${errors.join(" | ")}`,
  );
}

type ProbedVideoMetadata = {
  duration: number | null;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  frameRate: number | null;
  hasAudio: boolean;
  containerFormats: string[];
  pixelFormat: string | null;
};

async function probeVideoMetadata(filePath: string): Promise<ProbedVideoMetadata> {
  const candidates = [process.env.FFPROBE_PATH, "ffprobe"]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  for (const candidate of candidates) {
    try {
      const { stdout } = await execFileAsync(
        candidate,
        [
          "-v",
          "error",
          "-show_entries",
          "stream=codec_type,codec_name,width,height,pix_fmt,avg_frame_rate,r_frame_rate:format=duration,format_name",
          "-of",
          "json",
          filePath,
        ],
        { timeout: 12000, maxBuffer: 1024 * 1024 },
      );
      const parsed = JSON.parse(String(stdout || "{}")) as {
        streams?: Array<{
          codec_type?: string;
          codec_name?: string;
          width?: number;
          height?: number;
          avg_frame_rate?: string;
          r_frame_rate?: string;
          pix_fmt?: string;
        }>;
        format?: { duration?: string | number; format_name?: string };
      };
      const videoStream =
        parsed.streams?.find((stream) => stream.codec_type === "video") || {};
      const audioStream = parsed.streams?.find(
        (stream) => stream.codec_type === "audio",
      );
      const duration = Number(parsed.format?.duration || 0);
      const width = Number(videoStream.width || 0);
      const height = Number(videoStream.height || 0);
      return {
        duration: Number.isFinite(duration) && duration > 0 ? duration : null,
        width: Number.isFinite(width) && width > 0 ? width : null,
        height: Number.isFinite(height) && height > 0 ? height : null,
        videoCodec: String(videoStream.codec_name || "").trim().toLowerCase() || null,
        audioCodec: audioStream
          ? String(audioStream.codec_name || "").trim().toLowerCase() || null
          : "none",
        frameRate:
          normalizeVideoFrameRate(videoStream.avg_frame_rate) ||
          normalizeVideoFrameRate(videoStream.r_frame_rate),
        hasAudio: Boolean(audioStream),
        containerFormats: String(parsed.format?.format_name || "")
          .split(",")
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean),
        pixelFormat:
          String(videoStream.pix_fmt || "").trim().toLowerCase() || null,
      };
    } catch {
      // On essaie le candidat suivant.
    }
  }
  // Les runtimes Vercel embarquent notre FFmpeg statique mais pas toujours un
  // binaire ffprobe sÃ©parÃ©. Le mÃªme probe que le normaliseur garantit alors les
  // mÃ©tadonnÃ©es codec/FPS au lieu de transformer un succÃ¨s en "unknown".
  try {
    const ffmpegPath = await resolveVideoNormalizationFfmpegPath();
    const probed = await probeVideoSource({ ffmpegPath, inputPath: filePath });
    return {
      duration: probed.durationSeconds,
      width: probed.orientedWidth,
      height: probed.orientedHeight,
      videoCodec: probed.videoCodec,
      audioCodec: probed.audioCodec,
      frameRate: probed.frameRate,
      hasAudio: probed.hasAudio,
      containerFormats: probed.containerFormats,
      pixelFormat: probed.pixelFormat,
    };
  } catch {
    // L'appelant conserve une erreur de prÃ©paration isolÃ©e au canal.
  }
  return {
    duration: null,
    width: null,
    height: null,
    videoCodec: null,
    audioCodec: null,
    frameRate: null,
    hasAudio: false,
    containerFormats: [],
    pixelFormat: null,
  };
}

function getVideoSafetyBackgroundColor(
  publicationProfile: BoosterVideoTransformVariantPlan["publicationProfile"],
) {
  return publicationProfile === "default" ? "black" : "white";
}

function buildFilter(plan: BoosterVideoTransformVariantPlan) {
  const { format, adaptationMode, target } = plan;
  if (plan.publicationProfile === "google_business" && format === "original") {
    return `[0:v]scale='if(gte(iw,ih),-2,${GOOGLE_BUSINESS_VIDEO_MIN_SHORT_EDGE})':'if(gte(iw,ih),${GOOGLE_BUSINESS_VIDEO_MIN_SHORT_EDGE},-2)',setsar=1,format=yuv420p[v]`;
  }
  if (format === "original" || !target.width || !target.height) {
    // Préserve le ratio et toute l'image, mais normalise réellement la source :
    // côté long plafonné à 1920 px, dimensions paires et pixels yuv420p. Un
    // fond sobre complète les sources extrêmes afin de rester dans le rapport
    // commun 1:2,4 à 2,4:1 sans rogner l'image.
    const background = getVideoSafetyBackgroundColor(plan.publicationProfile);
    return `[0:v]scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,pad='ceil(max(max(iw,ih/2.4),360)/2)*2':'ceil(max(max(ih,iw/2.4),360)/2)*2':(ow-iw)/2:(oh-ih)/2:color=${background},setsar=1,format=yuv420p[v]`;
  }
  const w = target.width;
  const h = target.height;
  if (adaptationMode === "cover_crop") {
    return `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,format=yuv420p[v]`;
  }

  const background = getVideoSafetyBackgroundColor(plan.publicationProfile);
  return `[0:v]scale=${w}:${h}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=${background},setsar=1,format=yuv420p[v]`;
}

async function runFfmpegVariant(
  ffmpegPath: string,
  inputPath: string,
  outputPath: string,
  plan: BoosterVideoTransformVariantPlan,
  durationSeconds?: number | null,
  sourceSizeBytes?: number | null,
) {
  const filter = buildFilter(plan);
  const quality = getVideoTransformQualityProfile(plan.format, plan.publicationProfile);
  const audioBitrateKbps = Math.max(
    32,
    Number.parseInt(quality.audioBitrate, 10) || 96,
  );
  const safeDurationSeconds = Number(durationSeconds || 0);
  const safeSourceSizeBytes = Number(sourceSizeBytes || 0);
  const sourceAverageTotalKbps =
    Number.isFinite(safeDurationSeconds) &&
    safeDurationSeconds > 0 &&
    Number.isFinite(safeSourceSizeBytes) &&
    safeSourceSizeBytes > 0
      ? Math.round((safeSourceSizeBytes * 8) / safeDurationSeconds / 1000)
      : null;
  const sourceAwareMaxVideoKbps = sourceAverageTotalKbps
    ? Math.max(
        32,
        Math.round(sourceAverageTotalKbps * 1.1) - audioBitrateKbps,
      )
    : quality.maxVideoKbps;
  const targetVideoKbps = getVideoTargetBitrateKbps({
    durationSeconds: safeDurationSeconds,
    maxBytes: quality.maxOutputBytes,
    audioBitrateKbps,
    minVideoKbps: 32,
    maxVideoKbps: Math.min(
      quality.maxVideoKbps,
      sourceAwareMaxVideoKbps,
    ),
  });
  const durationArgs =
    Number.isFinite(safeDurationSeconds) && safeDurationSeconds > 0
      ? ["-t", safeDurationSeconds.toFixed(3)]
      : [];
  const commonOutputArgs = [
    "-c:v",
    "libx264",
    "-preset",
    quality.preset,
    "-crf",
    String(quality.crf),
    "-maxrate",
    `${targetVideoKbps}k`,
    "-bufsize",
    `${Math.max(64, targetVideoKbps * 2)}k`,
    "-pix_fmt",
    "yuv420p",
    "-r",
    "30",
    "-c:a",
    "aac",
    "-b:a",
    quality.audioBitrate,
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    "-map_metadata",
    "-1",
    "-map_chapters",
    "-1",
    "-metadata:s:v:0",
    "rotate=0",
    "-avoid_negative_ts",
    "make_zero",
    "-max_muxing_queue_size",
    "2048",
    "-threads",
    "2",
    ...durationArgs,
    outputPath,
  ];
  const args = filter
    ? [
        "-y",
        "-i",
        inputPath,
        "-filter_complex",
        filter,
        "-map",
        "[v]",
        "-map",
        "0:a?",
        ...commonOutputArgs,
      ]
    : [
        "-y",
        "-i",
        inputPath,
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        ...commonOutputArgs,
      ];
  await execFileAsync(ffmpegPath, args, {
    timeout: FFMPEG_TRANSFORM_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024,
  });
}

function buildPersistentSignature(plan: BoosterVideoTransformVariantPlan) {
  return `inrcy:video:channel_publish:v${CHANNEL_VIDEO_VARIANT_PIPELINE_VERSION}:${plan.signature}`;
}

function buildOutputStoragePath(
  userId: string,
  mediaId: string,
  plan: BoosterVideoTransformVariantPlan,
) {
  const safeUserId = sanitizeUserId(userId);
  const safeMediaId = normalizeSafeSegment(mediaId, "media").toLowerCase();
  const hash = createHash("sha256")
    .update(buildPersistentSignature(plan))
    .digest("hex");
  return `${safeUserId}/workspace-channel-videos/${safeMediaId}/${hash}.mp4`;
}

async function loadCachedVideoVariants(params: {
  accountId: string;
  workspaceId?: string;
  mediaId?: string;
}) {
  const cache = new Map<string, CachedVideoVariantRow>();
  if (!params.workspaceId || !params.mediaId) return cache;
  const result = await supabaseAdmin
    .from("media_variants")
    .select(
      "id,media_id,signature,bucket_name,storage_path,mime_type,size_bytes,duration_seconds,width,height,variant_metadata",
    )
    .eq("account_id", params.accountId)
    .eq("workspace_id", params.workspaceId)
    .eq("media_id", params.mediaId)
    .eq("purpose", "channel_publish")
    .eq("status", "ready");
  if (result.error) throw result.error;
  for (const row of (result.data || []) as CachedVideoVariantRow[]) {
    if (row.signature) cache.set(row.signature, row);
  }
  return cache;
}

function cachedRowToVideoVariant(
  row: CachedVideoVariantRow,
  plan: BoosterVideoTransformVariantPlan,
): BoosterVideoTransformedVariant {
  const bucket = String(row.bucket_name || BOOSTER_BUCKET);
  const storagePath = String(row.storage_path || "");
  const publicUrl =
    supabaseAdmin.storage.from(bucket).getPublicUrl(storagePath).data
      .publicUrl || "";
  const metadata =
    row.variant_metadata &&
    typeof row.variant_metadata === "object" &&
    !Array.isArray(row.variant_metadata)
      ? row.variant_metadata
      : {};
  return {
    ...plan,
    storagePath,
    publicUrl,
    contentType: String(row.mime_type || OUTPUT_CONTENT_TYPE),
    size: Number(row.size_bytes || 0),
    duration:
      Number.isFinite(Number(row.duration_seconds)) &&
      Number(row.duration_seconds) >= 0
        ? Number(row.duration_seconds)
        : null,
    width: Number.isFinite(Number(row.width)) && Number(row.width) > 0 ? Number(row.width) : null,
    height: Number.isFinite(Number(row.height)) && Number(row.height) > 0 ? Number(row.height) : null,
    generatedAt: String(metadata.generatedAt || new Date().toISOString()),
    quality: getVideoTransformQualityProfile(plan.format, plan.publicationProfile),
  };
}

async function persistVideoVariant(params: {
  accountId: string;
  workspaceId: string;
  mediaId: string;
  plan: BoosterVideoTransformVariantPlan;
  storagePath: string;
  outputSize: number;
  duration: number | null;
  width: number | null;
  height: number | null;
  generatedAt: string;
}) {
  const signature = buildPersistentSignature(params.plan);
  const quality = getVideoTransformQualityProfile(params.plan.format, params.plan.publicationProfile);
  const record = {
    account_id: params.accountId,
    media_id: params.mediaId,
    workspace_id: params.workspaceId,
    purpose: "channel_publish",
    channel: params.plan.channel,
    signature,
    status: "ready",
    bucket_name: BOOSTER_BUCKET,
    storage_path: params.storagePath,
    mime_type: OUTPUT_CONTENT_TYPE,
    size_bytes: params.outputSize,
    width: params.width,
    height: params.height,
    duration_seconds: params.duration,
    pipeline_version: CHANNEL_VIDEO_VARIANT_PIPELINE_VERSION,
    transform_spec: {
      format: params.plan.format,
      adaptationMode: params.plan.adaptationMode,
      target: params.plan.target,
      publicationProfile: params.plan.publicationProfile,
    },
    variant_metadata: {
      generatedAt: params.generatedAt,
      quality,
      plan: params.plan,
      output_video_codec: "h264",
      output_audio_codec: "aac",
      output_frame_rate: 30,
    },
    error_code: null,
    error_message: null,
    ready_at: params.generatedAt,
  };
  const existing = await supabaseAdmin
    .from("media_variants")
    .select("id")
    .eq("account_id", params.accountId)
    .eq("workspace_id", params.workspaceId)
    .eq("media_id", params.mediaId)
    .eq("purpose", "channel_publish")
    .eq("signature", signature)
    .maybeSingle();
  if (existing.error) throw existing.error;
  const saved = existing.data?.id
    ? await supabaseAdmin
        .from("media_variants")
        .update(record)
        .eq("id", existing.data.id)
        .select(
          "id,media_id,signature,bucket_name,storage_path,mime_type,size_bytes,duration_seconds,width,height,variant_metadata",
        )
        .single()
    : await supabaseAdmin
        .from("media_variants")
        .insert(record)
        .select(
          "id,media_id,signature,bucket_name,storage_path,mime_type,size_bytes,duration_seconds,width,height,variant_metadata",
        )
        .single();
  if (saved.error?.code === "23505") {
    const winner = await supabaseAdmin
      .from("media_variants")
      .select(
        "id,media_id,signature,bucket_name,storage_path,mime_type,size_bytes,duration_seconds,width,height,variant_metadata",
      )
      .eq("account_id", params.accountId)
      .eq("workspace_id", params.workspaceId)
      .eq("media_id", params.mediaId)
      .eq("purpose", "channel_publish")
      .eq("signature", signature)
      .single();
    if (winner.error) throw winner.error;
    return winner.data as CachedVideoVariantRow;
  }
  if (saved.error) throw saved.error;
  return saved.data as CachedVideoVariantRow;
}

export async function prepareBoosterVideoVariantsOnServer(params: {
  accountId: string;
  workspaceId?: string;
  mediaId?: string;
  generateMissing?: boolean;
  /** Source issue du resolver workspace serveur, jamais du JSON client brut. */
  trustedSourceCompatibilityProof?: boolean;
  source: BoosterVideoTransformSource;
  variants: readonly BoosterVideoTransformRequestVariant[];
}): Promise<BoosterVideoVariantServerResult> {
  let tempDir = "";
  // Deduplicate shared channel signatures before applying the safety cap. A
  // pre-dedupe slice could drop a unique adaptation requested by channel 9/10.
  const plan = buildVideoTransformPlan(params.variants).slice(
    0,
    MAX_VARIANTS_PER_REQUEST,
  );
  const sourceBucket = sanitizeBucketName(params.source.bucket);
  const sourcePath = sanitizeStoragePath(params.source.storagePath);
  const sourceUrl = String(params.source.publicUrl || params.source.url || "").trim() || null;
  const emptySource = {
    bucket: sourceBucket,
    storagePath: sourcePath || null,
    publicUrl: sourceUrl,
    size: 0,
    duration:
      typeof params.source.duration === "number"
        ? params.source.duration
        : (params.source.sourceMetadata?.duration ?? null),
    width: Number(params.source.sourceMetadata?.width || 0) || null,
    height: Number(params.source.sourceMetadata?.height || 0) || null,
    videoCodec: params.source.sourceMetadata?.videoCodec || null,
    audioCodec: params.source.sourceMetadata?.audioCodec || null,
    frameRate:
      normalizeVideoFrameRate(params.source.sourceMetadata?.frameRate) ||
      normalizeVideoFrameRate(params.source.sourceMetadata?.fps),
    hasAudio:
      typeof params.source.sourceMetadata?.hasAudio === "boolean"
        ? params.source.sourceMetadata.hasAudio
        : null,
    containerFormats: params.source.sourceMetadata?.containerFormats || null,
    pixelFormat: params.source.sourceMetadata?.pixelFormat || null,
  };
  const sourceCanPublishDirectly =
    params.trustedSourceCompatibilityProof === true &&
    Boolean(sourcePath && sourceUrl) &&
    canPublishVideoSourceDirectly({
      name: params.source.name,
      type: params.source.type,
      storagePath: sourcePath,
      sizeBytes: params.source.size,
      maxBytes: INR_MEDIA_VIDEO_PUBLISH_MAX_BYTES,
      videoCodec: params.source.sourceMetadata?.videoCodec,
      audioCodec: params.source.sourceMetadata?.audioCodec,
      frameRate:
        params.source.sourceMetadata?.frameRate ??
        params.source.sourceMetadata?.fps,
      hasAudio: params.source.sourceMetadata?.hasAudio,
      containerFormats: params.source.sourceMetadata?.containerFormats,
      pixelFormat: params.source.sourceMetadata?.pixelFormat,
      requireCodecProof: true,
    });
  const fallbackToOriginalAllowed =
    sourceCanPublishDirectly &&
    plan.every(
      (variant) =>
        variant.publicationProfile === "light_background" &&
        variant.format === "original",
    );
  if (!plan.length) {
    return {
      ok: true,
      fallbackToOriginal: false,
      source: emptySource,
      variants: [],
      errors: [],
    };
  }

  const cached = await loadCachedVideoVariants({
    accountId: params.accountId,
    workspaceId: params.workspaceId,
    mediaId: params.mediaId,
  });
  const readyVariants: BoosterVideoTransformedVariant[] = [];
  const missingPlan: BoosterVideoTransformVariantPlan[] = [];
  for (const variant of plan) {
    const validatesDedicatedChannel =
      variant.publicationProfile === GOOGLE_BUSINESS_VIDEO_PROFILE;
    const directValidation = validatesDedicatedChannel && variant.channel
      ? validateVideoPublicationForChannel({
          channel: variant.channel,
          name: params.source.name,
          type: params.source.type,
          storagePath: sourcePath,
          sizeBytes: params.source.size,
          durationSeconds: emptySource.duration,
          width: emptySource.width,
          height: emptySource.height,
        })
      : null;
    if (
      variant.format === "original" &&
      Number(params.source.size || 0) > 0 &&
      sourceCanPublishDirectly &&
      (!directValidation || directValidation.ok)
    ) {
      readyVariants.push({
        ...variant,
        storagePath: sourcePath || "",
        publicUrl: sourceUrl || "",
        contentType: OUTPUT_CONTENT_TYPE,
        size: Number(params.source.size || 0),
        duration: emptySource.duration,
        width: emptySource.width,
        height: emptySource.height,
        generatedAt: new Date().toISOString(),
        quality: getVideoTransformQualityProfile("original", variant.publicationProfile),
      });
      continue;
    }
    const cachedRow = cached.get(buildPersistentSignature(variant));
    if (cachedRow?.storage_path) {
      const cachedVariant = cachedRowToVideoVariant(cachedRow, variant);
      const cachedValidation = validatesDedicatedChannel && variant.channel
        ? validateVideoPublicationForChannel({
            channel: variant.channel,
            name: `${variant.key}.mp4`,
            type: cachedVariant.contentType,
            storagePath: cachedVariant.storagePath,
            sizeBytes: cachedVariant.size,
            durationSeconds: cachedVariant.duration ?? emptySource.duration,
            width: cachedVariant.width,
            height: cachedVariant.height,
          })
        : ({ ok: true } as const);
      if (cachedValidation.ok) {
        readyVariants.push(cachedVariant);
      } else {
        // A row can be present but unusable (partial upload, stale metadata,
        // former policy). Treat it exactly like a missing derivative so one
        // controlled regeneration can repair the cache instead of falling
        // back forever to the heavy source.
        missingPlan.push(variant);
      }
    } else {
      missingPlan.push(variant);
    }
  }

  if (!missingPlan.length) {
    return {
      ok: true,
      fallbackToOriginal: false,
      source: {
        ...emptySource,
        size: Number(params.source.size || 0),
      },
      variants: readyVariants,
      errors: [],
    };
  }

  if (params.generateMissing === false) {
    return {
      ok: false,
      fallbackToOriginal: fallbackToOriginalAllowed,
      source: {
        ...emptySource,
        size: Number(params.source.size || 0),
      },
      variants: readyVariants,
      errors: missingPlan.map((variant) => ({
        key: variant.key,
        format: variant.format,
        adaptationMode: variant.adaptationMode,
        message: fallbackToOriginalAllowed
          ? "Variante non préparée : la préparation doit être terminée avant la publication."
          : "Variante vidéo obligatoire manquante : la source originale dépasse le plafond de publication ou n'est pas directement compatible.",
      })),
    };
  }

  try {
    const ffmpegPath = await ensureFfmpegAvailable();
    const downloaded = await downloadSourceVideo(params.source);
    if (!downloaded.buffer.length) throw new Error("Vidéo source vide.");
    if (downloaded.buffer.length > INR_MEDIA_VIDEO_SOURCE_MAX_BYTES) {
      throw new Error("Vidéo source trop lourde pour la transformation serveur.");
    }

    tempDir = path.join(os.tmpdir(), `inrcy-video-${randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    const inputPath = path.join(
      tempDir,
      `source.${getSourceExtension(params.source)}`,
    );
    await writeFile(inputPath, downloaded.buffer);
    const probedSource = await probeVideoMetadata(inputPath);
    const duration =
      probedSource.duration ??
      (typeof params.source.duration === "number" ? params.source.duration : null) ??
      params.source.sourceMetadata?.duration ??
      null;
    const sourceWidth =
      Number(params.source.sourceMetadata?.width || 0) || probedSource.width;
    const sourceHeight =
      Number(params.source.sourceMetadata?.height || 0) || probedSource.height;
    const probedSourceCanPublishDirectly = canPublishVideoSourceDirectly({
      name: params.source.name,
      type: params.source.type,
      storagePath: downloaded.storagePath,
      sizeBytes: downloaded.buffer.length,
      maxBytes: INR_MEDIA_VIDEO_PUBLISH_MAX_BYTES,
      videoCodec: probedSource.videoCodec,
      audioCodec: probedSource.audioCodec,
      frameRate: probedSource.frameRate,
      hasAudio: probedSource.hasAudio,
      containerFormats: probedSource.containerFormats,
      pixelFormat: probedSource.pixelFormat,
      requireCodecProof: true,
    });
    const generated: BoosterVideoTransformedVariant[] = [];
    const errors: BoosterVideoVariantServerResult["errors"] = [];
    const generatedAt = new Date().toISOString();

    const generateVariant = async (
      variant: BoosterVideoTransformVariantPlan,
    ) => {
      const outputPath = path.join(tempDir, `${variant.key}.mp4`);
      try {
        if (
          variant.channel === "gmb" &&
          duration !== null &&
          duration > GOOGLE_BUSINESS_VIDEO_MAX_DURATION_SECONDS
        ) {
          throw new Error(
            "Google Business refuse les vidéos de plus de 30 secondes. La vidéo n’a pas été coupée automatiquement.",
          );
        }
        if (variant.format === "original" && probedSourceCanPublishDirectly) {
          const originalValidation = variant.channel
            ? validateVideoPublicationForChannel({
                channel: variant.channel,
                name: params.source.name,
                type: params.source.type,
                storagePath: downloaded.storagePath,
                sizeBytes: downloaded.buffer.length,
                durationSeconds: duration,
                width: sourceWidth,
                height: sourceHeight,
              })
            : ({ ok: true } as const);
          if (originalValidation.ok) {
            generated.push({
              ...variant,
              storagePath: downloaded.storagePath || "",
              publicUrl: downloaded.publicUrl || "",
              contentType: OUTPUT_CONTENT_TYPE,
              size: downloaded.buffer.length,
              duration,
              width: sourceWidth,
              height: sourceHeight,
              generatedAt,
              quality: getVideoTransformQualityProfile(
                "original",
                variant.publicationProfile,
              ),
            });
            return;
          }
        }
        await runFfmpegVariant(
          ffmpegPath,
          inputPath,
          outputPath,
          variant,
          duration,
          downloaded.buffer.length,
        );
        const outputBuffer = await readFile(outputPath);
        const quality = getVideoTransformQualityProfile(variant.format, variant.publicationProfile);
        const outputMetadata = await probeVideoMetadata(outputPath);
        if (outputBuffer.length > quality.maxOutputBytes) {
          throw new Error(
            `La variante ${variant.target.label} reste trop lourde après compression (${Math.ceil(outputBuffer.length / 1024 / 1024)} Mo).`,
          );
        }
        if (
          variant.channel &&
          variant.publicationProfile === GOOGLE_BUSINESS_VIDEO_PROFILE
        ) {
          const validation = validateVideoPublicationForChannel({
            channel: variant.channel,
            name: `${variant.key}.mp4`,
            type: OUTPUT_CONTENT_TYPE,
            storagePath: `${variant.key}.mp4`,
            sizeBytes: outputBuffer.length,
            durationSeconds: outputMetadata.duration || duration,
            width: outputMetadata.width,
            height: outputMetadata.height,
          });
          if (!validation.ok) throw new Error(validation.message);
        }
        const storagePath = buildOutputStoragePath(
          params.accountId,
          params.mediaId || randomUUID(),
          variant,
        );
        const upload = await supabaseAdmin.storage
          .from(BOOSTER_BUCKET)
          .upload(storagePath, toExactStorageArrayBuffer(outputBuffer), {
            contentType: OUTPUT_CONTENT_TYPE,
            cacheControl: "31536000",
            upsert: true,
          });
        if (upload.error) {
          throw new Error(
            upload.error.message || "Upload de la variante vidéo impossible.",
          );
        }
        const publicUrl =
          supabaseAdmin.storage.from(BOOSTER_BUCKET).getPublicUrl(storagePath)
              ?.data?.publicUrl || "";
        if (params.workspaceId && params.mediaId) {
          const saved = await persistVideoVariant({
            accountId: params.accountId,
            workspaceId: params.workspaceId,
            mediaId: params.mediaId,
            plan: variant,
            storagePath,
            outputSize: outputBuffer.length,
            duration: outputMetadata.duration || duration,
            width: outputMetadata.width,
            height: outputMetadata.height,
            generatedAt,
          });
          cached.set(buildPersistentSignature(variant), saved);
        }
        generated.push({
          ...variant,
          storagePath,
          publicUrl,
          contentType: OUTPUT_CONTENT_TYPE,
          size: outputBuffer.length,
          duration: outputMetadata.duration || duration,
          width: outputMetadata.width,
          height: outputMetadata.height,
          generatedAt,
          quality,
        });
      } catch (error: any) {
        errors.push({
          key: variant.key,
          format: variant.format,
          adaptationMode: variant.adaptationMode,
          message: compactFfmpegError(error, "Transformation impossible."),
        });
      }
    };
    for (let index = 0; index < missingPlan.length; index += 2) {
      await Promise.all(
        missingPlan.slice(index, index + 2).map(generateVariant),
      );
    }

    return {
      ok: errors.length === 0,
      fallbackToOriginal: errors.length > 0 && fallbackToOriginalAllowed,
      source: {
        bucket: downloaded.bucket,
        storagePath: downloaded.storagePath || null,
        publicUrl: downloaded.publicUrl,
        size: downloaded.buffer.length,
        duration,
        width: sourceWidth,
        height: sourceHeight,
        videoCodec: probedSource.videoCodec,
        audioCodec: probedSource.audioCodec,
        frameRate: probedSource.frameRate,
        hasAudio: probedSource.hasAudio,
        containerFormats: probedSource.containerFormats,
        pixelFormat: probedSource.pixelFormat,
      },
      variants: [...readyVariants, ...generated],
      errors,
    };
  } catch (error: any) {
    return {
      ok: false,
      fallbackToOriginal: fallbackToOriginalAllowed,
      source: emptySource,
      variants: readyVariants,
      errors: [
        {
          message: compactFfmpegError(
            error,
            fallbackToOriginalAllowed
              ? "Adaptation automatique indisponible : la vidéo originale compatible peut être conservée."
              : "Adaptation vidéo indisponible : la source originale ne peut pas être publiée directement.",
          ),
        },
      ],
    };
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
