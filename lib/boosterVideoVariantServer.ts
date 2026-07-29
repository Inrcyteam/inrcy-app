import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { access, chmod, mkdir, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import ffmpegStaticPath from "ffmpeg-static";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildVideoTransformPlan,
  getVideoTransformQualityProfile,
  type BoosterVideoTransformRequestVariant,
  type BoosterVideoTransformSource,
  type BoosterVideoTransformVariantPlan,
  type BoosterVideoTransformedVariant,
} from "@/lib/boosterVideoTransforms";
import { INR_MEDIA_VIDEO_SOURCE_MAX_BYTES } from "@/lib/mediaRules";

const execFileAsync = promisify(execFile);
const BOOSTER_BUCKET = "booster";
const MAX_VARIANTS_PER_REQUEST = 8;
const OUTPUT_CONTENT_TYPE = "video/mp4";
const FFMPEG_TRANSFORM_TIMEOUT_MS = 120000;

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

function buildOutputStoragePath(
  userId: string,
  plan: BoosterVideoTransformVariantPlan,
) {
  const safeUserId = sanitizeUserId(userId);
  const folderId = randomUUID();
  const safeKey = normalizeSafeSegment(plan.key, "variant").toLowerCase();
  return `${safeUserId}/booster-video-variants/${folderId}/${safeKey}.mp4`;
}

export async function prepareBoosterVideoVariantsOnServer(params: {
  accountId: string;
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

    for (const variant of plan) {
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
        const storagePath = buildOutputStoragePath(params.accountId, variant);
        const upload = await supabaseAdmin.storage
          .from(BOOSTER_BUCKET)
          .upload(storagePath, outputBuffer, {
            contentType: OUTPUT_CONTENT_TYPE,
            cacheControl: "3600",
            upsert: false,
          });
        if (upload.error) {
          throw new Error(
            upload.error.message || "Upload de la variante vidéo impossible.",
          );
        }
        const publicUrl =
          supabaseAdmin.storage.from(BOOSTER_BUCKET).getPublicUrl(storagePath)
            ?.data?.publicUrl || "";
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
          message: String(error?.stderr || error?.message || "Transformation impossible.").slice(0, 1200),
        });
      }
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
      variants: generated,
      errors,
    };
  } catch (error: any) {
    return {
      ok: false,
      fallbackToOriginal: true,
      source: emptySource,
      variants: [],
      errors: [
        {
          message: String(
            error?.message ||
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
