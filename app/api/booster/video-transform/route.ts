import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { access, chmod, mkdir, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import ffmpegStaticPath from "ffmpeg-static";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { enforceRateLimit } from "@/lib/rateLimit";
import {
  buildVideoTransformPlan,
  getVideoTransformQualityProfile,
  type BoosterVideoTransformSource,
  type BoosterVideoTransformVariantPlan,
} from "@/lib/boosterVideoTransforms";
import { type VideoAdaptationMode, type VideoFormat } from "@/lib/boosterVideoSettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const BOOSTER_BUCKET = "booster";
const MAX_VARIANTS_PER_REQUEST = 8;
const MAX_INPUT_BYTES = 80 * 1024 * 1024;
const OUTPUT_CONTENT_TYPE = "video/mp4";
const FFMPEG_TRANSFORM_TIMEOUT_MS = 120000;

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
  if (storagePath) {
    const { data, error } = await supabaseAdmin.storage.from(BOOSTER_BUCKET).download(storagePath);
    if (error || !data) {
      throw new Error(error?.message || "Impossible de lire la vidéo source depuis le stockage.");
    }
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  const publicUrl = String(source.publicUrl || source.url || "").trim();
  if (!publicUrl || !/^https?:\/\//i.test(publicUrl)) {
    throw new Error("Vidéo source manquante : storagePath ou URL publique requis.");
  }

  const res = await fetch(publicUrl);
  if (!res.ok) {
    throw new Error(`Impossible de télécharger la vidéo source (${res.status}).`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
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
    // On laisse le test "-version" ci-dessous retourner l'erreur exacte.
  }
}

async function ensureFfmpegAvailable() {
  const errors: string[] = [];

  for (const ffmpegPath of getFfmpegPathCandidates()) {
    try {
      await makeFfmpegExecutableIfNeeded(ffmpegPath);
      await execFileAsync(ffmpegPath, ["-version"], { timeout: 6000, maxBuffer: 1024 * 1024 });
      console.info("[Booster] ffmpeg available", { ffmpegPath });
      return ffmpegPath;
    } catch (error: any) {
      errors.push(`${ffmpegPath}: ${String(error?.stderr || error?.message || error || "indisponible").slice(0, 260)}`);
    }
  }

  console.error("[Booster] ffmpeg unavailable", errors);
  throw new Error("Adaptation automatique indisponible : FFmpeg n’est pas exécutable sur le serveur.");
}

async function probeDurationSeconds(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath],
      { timeout: 10000, maxBuffer: 1024 * 1024 },
    );
    const value = Number(String(stdout || "").trim());
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
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

async function runFfmpegVariant(ffmpegPath: string, inputPath: string, outputPath: string, plan: BoosterVideoTransformVariantPlan) {
  const filter = buildFilter(plan);
  const quality = getVideoTransformQualityProfile(plan.format);
  const commonOutputArgs = [
    "-c:v", "libx264",
    // Mode rapide volontaire : sur Vercel, on privilégie un résultat utilisable vite
    // plutôt qu'un réencodage lourd en très haute définition.
    "-preset", "ultrafast",
    "-crf", String(quality.crf),
    "-b:v", quality.videoBitrate,
    "-maxrate", quality.maxrate,
    "-bufsize", quality.bufsize,
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", quality.audioBitrate,
    "-ac", "2",
    "-movflags", "+faststart",
    "-threads", "2",
    "-shortest",
    outputPath,
  ];

  const args = filter
    ? ["-y", "-i", inputPath, "-filter_complex", filter, "-map", "[v]", "-map", "0:a?", ...commonOutputArgs]
    : ["-y", "-i", inputPath, "-map", "0:v:0", "-map", "0:a?", ...commonOutputArgs];

  try {
    const startedAt = Date.now();
    console.info("[Booster] ffmpeg transform started", {
      format: plan.format,
      adaptationMode: plan.adaptationMode,
      target: plan.target.label,
      output: `${plan.target.width || "auto"}x${plan.target.height || "auto"}`,
    });
    await execFileAsync(ffmpegPath, args, { timeout: FFMPEG_TRANSFORM_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 });
    console.info("[Booster] ffmpeg transform completed", {
      format: plan.format,
      adaptationMode: plan.adaptationMode,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error: any) {
    const details = String(error?.stderr || error?.message || "").slice(0, 900);
    console.error("[Booster] ffmpeg transform failed", {
      format: plan.format,
      adaptationMode: plan.adaptationMode,
      target: plan.target.label,
      details,
    });
    throw new Error(`Transformation vidéo échouée (${plan.target.label}). ${details}`.trim());
  }
}

function buildOutputStoragePath(userId: string, plan: BoosterVideoTransformVariantPlan) {
  const safeUserId = sanitizeUserId(userId);
  const folderId = randomUUID();
  const safeKey = normalizeSafeSegment(plan.key, "variant").toLowerCase();
  return `${safeUserId}/booster-video-variants/${folderId}/${safeKey}.mp4`;
}

export async function POST(req: Request) {
  let tempDir = "";
  try {
    const { user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;

    const rateLimited = await enforceRateLimit({
      name: "booster_video_transform",
      identifier: user.id,
      limit: 6,
      window: "1 m",
      failClosed: false,
    });
    if (rateLimited) return rateLimited;

    const body = await req.json().catch(() => null) as {
      source?: BoosterVideoTransformSource;
      variants?: Array<{ key?: string; channel?: any; format?: VideoFormat; adaptationMode?: VideoAdaptationMode }>;
    } | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Données de transformation vidéo invalides." }, { status: 400 });
    }

    const source = body.source || {};
    const variants = Array.isArray(body.variants) ? body.variants.slice(0, MAX_VARIANTS_PER_REQUEST) : [];
    const plan = buildVideoTransformPlan(variants as any);

    if (!plan.length) {
      return NextResponse.json({ error: "Aucun format vidéo à générer." }, { status: 400 });
    }

    let ffmpegPath = "";
    try {
      ffmpegPath = await ensureFfmpegAvailable();
    } catch (error: any) {
      return NextResponse.json({
        ok: false,
        fallbackToOriginal: true,
        variants: [],
        errors: [{ message: error?.message || "Adaptation automatique indisponible : la vidéo originale sera utilisée." }],
      }, { status: 200 });
    }

    const sourceBuffer = await downloadSourceVideo(source);
    if (!sourceBuffer.length) {
      return NextResponse.json({ error: "Vidéo source vide." }, { status: 400 });
    }
    if (sourceBuffer.length > MAX_INPUT_BYTES) {
      return NextResponse.json({ error: "Vidéo source trop lourde pour la transformation locale. Limite actuelle : 80 Mo." }, { status: 413 });
    }

    tempDir = path.join(os.tmpdir(), `inrcy-video-${randomUUID()}`);
    await mkdir(tempDir, { recursive: true });

    const inputPath = path.join(tempDir, `source.${getSourceExtension(source)}`);
    await writeFile(inputPath, sourceBuffer);
    const fallbackDuration = typeof source.duration === "number" ? source.duration : source.sourceMetadata?.duration ?? null;
    const duration = fallbackDuration || (await probeDurationSeconds(inputPath));

    const generated = [];
    const errors = [];
    const generatedAt = new Date().toISOString();

    for (const variant of plan) {
      const outputPath = path.join(tempDir, `${variant.key}.mp4`);
      try {
        await runFfmpegVariant(ffmpegPath, inputPath, outputPath, variant);
        const outputBuffer = await readFile(outputPath);
        const quality = getVideoTransformQualityProfile(variant.format);
        if (outputBuffer.length > quality.maxOutputBytes) {
          throw new Error(`La variante ${variant.target.label} reste trop lourde après compression (${Math.ceil(outputBuffer.length / 1024 / 1024)} Mo). Réduisez la durée de la vidéo ou choisissez un format plus léger.`);
        }
        const storagePath = buildOutputStoragePath(user.id, variant);
        const upload = await supabaseAdmin.storage.from(BOOSTER_BUCKET).upload(storagePath, outputBuffer, {
          contentType: OUTPUT_CONTENT_TYPE,
          cacheControl: "3600",
          upsert: false,
        });

        if (upload.error) {
          throw new Error(upload.error.message || "Upload de la variante vidéo impossible.");
        }

        const publicUrl = supabaseAdmin.storage.from(BOOSTER_BUCKET).getPublicUrl(storagePath)?.data?.publicUrl || "";
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
          message: String(error?.message || "Transformation impossible."),
        });
      }
    }

    return NextResponse.json({
      ok: errors.length === 0,
      fallbackToOriginal: errors.length > 0,
      source: {
        storagePath: source.storagePath || null,
        publicUrl: source.publicUrl || source.url || null,
        size: sourceBuffer.length,
        duration,
      },
      variants: generated,
      errors,
    }, { status: 200 });
  } catch (error: any) {
    console.error("[Booster] video-transform failed", error);
    return NextResponse.json({
      ok: false,
      fallbackToOriginal: true,
      variants: [],
      error: error?.message || "Adaptation automatique indisponible : la vidéo originale sera utilisée.",
    }, { status: 200 });
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
