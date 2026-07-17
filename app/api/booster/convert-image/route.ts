import { execFile } from "node:child_process";
import { access, chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegStaticPath from "ffmpeg-static";
import heicConvert from "heic-convert";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireUser } from "@/lib/requireUser";
import { enforceRateLimit } from "@/lib/rateLimit";
import { INR_MEDIA_IMAGE_MAX_BYTES } from "@/lib/mediaRules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const MAX_SOURCE_BYTES = INR_MEDIA_IMAGE_MAX_BYTES;
const MAX_OUTPUT_BYTES = INR_MEDIA_IMAGE_MAX_BYTES;
const MAX_OUTPUT_SIDE = 2500;
const HEIC_MIME_TYPES = new Set(["image/heic", "image/heif"]);
const FFMPEG_TIMEOUT_MS = 35_000;

type ConversionEngine = "heic-convert" | "sharp" | "ffmpeg";

type ConversionResult = {
  output: Buffer;
  engine: ConversionEngine;
};

class HeicDecodeError extends Error {
  readonly attempts: Array<{ engine: ConversionEngine; error: unknown }>;

  constructor(attempts: Array<{ engine: ConversionEngine; error: unknown }>) {
    super("HEIC_DECODE_FAILED");
    this.name = "HeicDecodeError";
    this.attempts = attempts;
  }
}

function normalizeMime(type: string) {
  return (
    String(type || "")
      .toLowerCase()
      .split(";")[0]
      ?.trim() || ""
  );
}

function getFileExtension(name: string) {
  const rawName =
    String(name || "")
      .toLowerCase()
      .split(/[\\/]/)
      .pop() || "";
  return rawName.includes(".") ? rawName.split(".").pop() || "" : "";
}

function isHeicOrHeif(file: File) {
  const type = normalizeMime(file.type);
  const extension = getFileExtension(file.name);
  return (
    HEIC_MIME_TYPES.has(type) || extension === "heic" || extension === "heif"
  );
}

function normalizeSafeSegment(value: string, fallback: string) {
  const safe = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['`]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/[-_]{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 90);

  return safe || fallback;
}

function buildConvertedFileName(name: string) {
  const rawName =
    String(name || "image-inrcy")
      .split(/[\\/]/)
      .pop() || "image-inrcy";
  const base = normalizeSafeSegment(
    rawName.replace(/\.[^.]*$/, ""),
    "image-inrcy",
  );
  return `${base}.jpg`.toLowerCase();
}

function compactErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 240);
  return String(error || "Erreur inconnue").slice(0, 240);
}

async function optimizeToJpeg(input: Buffer) {
  let quality = 90;
  let output = await sharp(input, { failOn: "none", limitInputPixels: false })
    .rotate()
    .resize({
      width: MAX_OUTPUT_SIDE,
      height: MAX_OUTPUT_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({
      quality,
      mozjpeg: true,
      progressive: true,
      chromaSubsampling: "4:2:0",
    })
    .toBuffer();

  while (output.byteLength > MAX_OUTPUT_BYTES && quality > 62) {
    quality -= 8;
    output = await sharp(input, {
      failOn: "none",
      limitInputPixels: false,
    })
      .rotate()
      .resize({
        width: MAX_OUTPUT_SIDE,
        height: MAX_OUTPUT_SIDE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        quality,
        mozjpeg: true,
        progressive: true,
        chromaSubsampling: "4:2:0",
      })
      .toBuffer();
  }

  return output;
}

async function convertHeicWithPureJs(input: Buffer) {
  const converted = await heicConvert({
    buffer: input,
    format: "JPEG",
    quality: 0.94,
  });
  const output = Buffer.from(converted);
  if (!output.byteLength) {
    throw new Error("heic-convert a retourne une image vide.");
  }
  return output;
}

function getBundledFfmpegCandidate() {
  const binaryName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  return path.join(process.cwd(), "node_modules", "ffmpeg-static", binaryName);
}

function getFfmpegPathCandidates() {
  return Array.from(
    new Set(
      [
        process.env.FFMPEG_PATH,
        ffmpegStaticPath,
        getBundledFfmpegCandidate(),
        "ffmpeg",
      ]
        .map((candidate) => String(candidate || "").trim())
        .filter(Boolean),
    ),
  );
}

async function resolveFfmpegPath() {
  const errors: string[] = [];

  for (const candidate of getFfmpegPathCandidates()) {
    try {
      if (candidate !== "ffmpeg") {
        await access(candidate);
        if (process.platform !== "win32") {
          await chmod(candidate, 0o755).catch(() => undefined);
        }
      }
      await execFileAsync(candidate, ["-version"], {
        timeout: 6_000,
        maxBuffer: 1024 * 1024,
      });
      return candidate;
    } catch (error) {
      errors.push(`${candidate}: ${compactErrorMessage(error)}`);
    }
  }

  throw new Error(`ffmpeg_unavailable:${errors.join(" | ").slice(0, 600)}`);
}

async function convertHeicWithFfmpeg(input: Buffer) {
  const workDir = await mkdtemp(path.join(tmpdir(), "inrcy-heic-"));
  const sourcePath = path.join(workDir, "source.heic");
  const outputPath = path.join(workDir, "converted.jpg");

  try {
    await writeFile(sourcePath, input);
    const ffmpegPath = await resolveFfmpegPath();

    await execFileAsync(
      ffmpegPath,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        sourcePath,
        "-map_metadata",
        "-1",
        "-frames:v",
        "1",
        "-q:v",
        "2",
        outputPath,
      ],
      {
        timeout: FFMPEG_TIMEOUT_MS,
        maxBuffer: 4 * 1024 * 1024,
      },
    );

    const output = await readFile(outputPath);
    if (!output.byteLength) {
      throw new Error("FFmpeg a retourne une image vide.");
    }
    return output;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function convertWithFallback(input: Buffer): Promise<ConversionResult> {
  const attempts: Array<{ engine: ConversionEngine; error: unknown }> = [];

  // Le binaire Sharp déployé sur Vercel peut être compilé sans le décodeur
  // HEIC complet. Le moteur JS/WASM est donc prioritaire et produit un JPEG
  // standard que Sharp peut ensuite optimiser sans dépendre de libheif natif.
  try {
    const decodedJpeg = await convertHeicWithPureJs(input);
    return {
      output: await optimizeToJpeg(decodedJpeg),
      engine: "heic-convert",
    };
  } catch (pureJsError) {
    attempts.push({ engine: "heic-convert", error: pureJsError });
    console.warn("[Booster] JS HEIC decode failed, trying sharp", {
      error: compactErrorMessage(pureJsError),
    });
  }

  try {
    return {
      output: await optimizeToJpeg(input),
      engine: "sharp",
    };
  } catch (sharpError) {
    attempts.push({ engine: "sharp", error: sharpError });
    console.warn("[Booster] sharp HEIC decode failed, trying ffmpeg", {
      error: compactErrorMessage(sharpError),
    });
  }

  try {
    const fallbackJpeg = await convertHeicWithFfmpeg(input);
    return {
      output: await optimizeToJpeg(fallbackJpeg),
      engine: "ffmpeg",
    };
  } catch (ffmpegError) {
    attempts.push({ engine: "ffmpeg", error: ffmpegError });
    throw new HeicDecodeError(attempts);
  }
}

export async function POST(req: Request) {
  try {
    const { errorResponse, activeUserId } = await requireUser();
    if (errorResponse) return errorResponse;

    const rateLimited = await enforceRateLimit({
      name: "booster_convert_image",
      identifier: activeUserId,
      limit: 40,
      window: "1 m",
      failClosed: false,
    });
    if (rateLimited) return rateLimited;

    const formData = await req.formData().catch(() => null);
    if (!formData)
      return NextResponse.json(
        { error: "Donnees invalides." },
        { status: 400 },
      );

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Image manquante." }, { status: 400 });
    }

    if (!isHeicOrHeif(file)) {
      return NextResponse.json(
        { error: "Conversion reservee aux images HEIC/HEIF." },
        { status: 400 },
      );
    }

    if (file.size > MAX_SOURCE_BYTES) {
      return NextResponse.json(
        { error: "Image HEIC trop lourde. Taille maximale : 40 Mo." },
        { status: 413 },
      );
    }

    const input = Buffer.from(await file.arrayBuffer());
    if (!input.byteLength) {
      return NextResponse.json(
        { error: "Le fichier HEIC est vide ou endommage." },
        { status: 422 },
      );
    }

    const { output, engine } = await convertWithFallback(input);

    if (!output.byteLength || output.byteLength > MAX_OUTPUT_BYTES) {
      return NextResponse.json(
        {
          error: "Image convertie trop lourde. Utilisez une image plus legere.",
        },
        { status: 413 },
      );
    }

    const responseBody = new ArrayBuffer(output.byteLength);
    new Uint8Array(responseBody).set(output);

    return new Response(responseBody, {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(output.byteLength),
        "Cache-Control": "no-store",
        "X-Inrcy-Filename": buildConvertedFileName(file.name),
        "X-Inrcy-Converter": engine,
      },
    });
  } catch (error) {
    if (error instanceof HeicDecodeError) {
      console.error("[Booster] all HEIC converters failed", {
        attempts: error.attempts.map((attempt) => ({
          engine: attempt.engine,
          error: compactErrorMessage(attempt.error),
        })),
      });
      return NextResponse.json(
        {
          error:
            "Cette photo HEIC n'a pas pu etre lue, meme avec le moteur de secours. Le fichier est peut-etre endommage ou utilise une variante HEIC inhabituelle. Exportez-la en JPG depuis le telephone puis reessayez.",
          code: "HEIC_DECODE_FAILED",
        },
        { status: 422 },
      );
    }

    console.error("[Booster] convert-image failed", error);
    return NextResponse.json(
      {
        error:
          "La conversion de cette image HEIC a rencontre une erreur temporaire. Reessayez dans quelques instants.",
        code: "HEIC_CONVERSION_ERROR",
      },
      { status: 500 },
    );
  }
}
