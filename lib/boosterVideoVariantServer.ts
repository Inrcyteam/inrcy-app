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
import { INR_MEDIA_VIDEO_SOURCE_MAX_BYTES } from "@/lib/mediaRules";
import { canPublishVideoSourceDirectly } from "@/lib/mediaVideoSourceCompatibility";

const execFileAsync = promisify(execFile);
const BOOSTER_BUCKET = "booster";
const MAX_VARIANTS_PER_REQUEST = 8;
const OUTPUT_CONTENT_TYPE = "video/mp4";
const FFMPEG_TRANSFORM_TIMEOUT_MS = 90000;
const CHANNEL_VIDEO_VARIANT_PIPELINE_VERSION = 2;

type CachedVideoVariantRow = {
  id: string;
  media_id: string;
  signature: string | null;
  bucket_name: string | null;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  duration_seconds: number | null;
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

async function probeDurationSeconds(filePath: string): Promise<number | null> {
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
          "format=duration",
          "-of",
          "default=noprint_wrappers=1:nokey=1",
          filePath,
        ],
        { timeout: 10000, maxBuffer: 1024 * 1024 },
      );
      const value = Number(String(stdout || "").trim());
      if (Number.isFinite(value) && value > 0) return value;
    } catch {
      // On conserve la durée fournie par le registre si ffprobe est absent.
    }
  }
  return null;
}

function buildFilter(plan: BoosterVideoTransformVariantPlan) {
  const { format, adaptationMode, target } = plan;
  if (format === "original" || !target.width || !target.height) return null;
  const w = target.width;
  const h = target.height;
  if (adaptationMode === "cover_crop") {
    return `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,format=yuv420p[v]`;
  }
  return [
    `[0:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,setsar=1[fg]`,
    `color=c=0x0f172a:s=${w}x${h}:r=30[bg]`,
    `[bg][fg]overlay=(W-w)/2:(H-h)/2:shortest=1,format=yuv420p[v]`,
  ].join(";");
}

async function runFfmpegVariant(
  ffmpegPath: string,
  inputPath: string,
  outputPath: string,
  plan: BoosterVideoTransformVariantPlan,
) {
  const filter = buildFilter(plan);
  const quality = getVideoTransformQualityProfile(plan.format);
  const commonOutputArgs = [
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-crf",
    String(quality.crf),
    "-b:v",
    quality.videoBitrate,
    "-maxrate",
    quality.maxrate,
    "-bufsize",
    quality.bufsize,
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    quality.audioBitrate,
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    "-threads",
    "2",
    "-shortest",
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
      "id,media_id,signature,bucket_name,storage_path,mime_type,size_bytes,duration_seconds,variant_metadata",
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
    generatedAt: String(metadata.generatedAt || new Date().toISOString()),
    quality: getVideoTransformQualityProfile(plan.format),
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
  generatedAt: string;
}) {
  const signature = buildPersistentSignature(params.plan);
  const quality = getVideoTransformQualityProfile(params.plan.format);
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
    width: params.plan.target.width,
    height: params.plan.target.height,
    duration_seconds: params.duration,
    pipeline_version: CHANNEL_VIDEO_VARIANT_PIPELINE_VERSION,
    transform_spec: {
      format: params.plan.format,
      adaptationMode: params.plan.adaptationMode,
      target: params.plan.target,
    },
    variant_metadata: {
      generatedAt: params.generatedAt,
      quality,
      plan: params.plan,
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
          "id,media_id,signature,bucket_name,storage_path,mime_type,size_bytes,duration_seconds,variant_metadata",
        )
        .single()
    : await supabaseAdmin
        .from("media_variants")
        .insert(record)
        .select(
          "id,media_id,signature,bucket_name,storage_path,mime_type,size_bytes,duration_seconds,variant_metadata",
        )
        .single();
  if (saved.error?.code === "23505") {
    const winner = await supabaseAdmin
      .from("media_variants")
      .select(
        "id,media_id,signature,bucket_name,storage_path,mime_type,size_bytes,duration_seconds,variant_metadata",
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
  source: BoosterVideoTransformSource;
  variants: readonly BoosterVideoTransformRequestVariant[];
}): Promise<BoosterVideoVariantServerResult> {
  let tempDir = "";
  const plan = buildVideoTransformPlan(
    params.variants.slice(0, MAX_VARIANTS_PER_REQUEST),
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
  };

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
    if (
      variant.format === "original" &&
      sourcePath &&
      Number(params.source.size || 0) > 0 &&
      sourceUrl &&
      canPublishVideoSourceDirectly({
        name: params.source.name,
        type: params.source.type,
        storagePath: sourcePath,
      })
    ) {
      readyVariants.push({
        ...variant,
        storagePath: sourcePath,
        publicUrl: sourceUrl,
        contentType: String(params.source.type || OUTPUT_CONTENT_TYPE),
        size: Number(params.source.size || 0),
        duration: emptySource.duration,
        generatedAt: new Date().toISOString(),
        quality: getVideoTransformQualityProfile("original"),
      });
      continue;
    }
    const cachedRow = cached.get(buildPersistentSignature(variant));
    if (cachedRow?.storage_path) {
      readyVariants.push(cachedRowToVideoVariant(cachedRow, variant));
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
      ok: true,
      fallbackToOriginal: true,
      source: {
        ...emptySource,
        size: Number(params.source.size || 0),
      },
      variants: readyVariants,
      errors: missingPlan.map((variant) => ({
        key: variant.key,
        format: variant.format,
        adaptationMode: variant.adaptationMode,
        message:
          "Variante non préparée : la vidéo source compatible sera utilisée sans nouveau réencodage.",
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
    const fallbackDuration =
      typeof params.source.duration === "number"
        ? params.source.duration
        : (params.source.sourceMetadata?.duration ?? null);
    const duration = fallbackDuration || (await probeDurationSeconds(inputPath));
    const generated: BoosterVideoTransformedVariant[] = [];
    const errors: BoosterVideoVariantServerResult["errors"] = [];
    const generatedAt = new Date().toISOString();

    const generateVariant = async (
      variant: BoosterVideoTransformVariantPlan,
    ) => {
      const outputPath = path.join(tempDir, `${variant.key}.mp4`);
      try {
        await runFfmpegVariant(ffmpegPath, inputPath, outputPath, variant);
        const outputBuffer = await readFile(outputPath);
        const quality = getVideoTransformQualityProfile(variant.format);
        if (outputBuffer.length > quality.maxOutputBytes) {
          throw new Error(
            `La variante ${variant.target.label} reste trop lourde après compression (${Math.ceil(outputBuffer.length / 1024 / 1024)} Mo).`,
          );
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
            duration,
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
          duration,
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
      fallbackToOriginal: errors.length > 0,
      source: {
        bucket: downloaded.bucket,
        storagePath: downloaded.storagePath || null,
        publicUrl: downloaded.publicUrl,
        size: downloaded.buffer.length,
        duration,
      },
      variants: [...readyVariants, ...generated],
      errors,
    };
  } catch (error: any) {
    return {
      ok: false,
      fallbackToOriginal: true,
      source: emptySource,
      variants: readyVariants,
      errors: [
        {
          message: compactFfmpegError(
            error,
            "Adaptation automatique indisponible : la vidéo originale sera utilisée.",
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
