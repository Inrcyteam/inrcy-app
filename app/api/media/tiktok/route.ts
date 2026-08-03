import { NextResponse } from "next/server";
import sharp from "sharp";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { toExactStorageArrayBuffer } from "@/lib/supabaseStorageBinary";
import { verifyTiktokMediaSignature } from "@/lib/tiktokMediaUrl";

export const runtime = "nodejs";

const TIKTOK_PHOTO_MAX_BYTES = 20 * 1024 * 1024;
const TIKTOK_LANDSCAPE_MAX_WIDTH = 1920;
const TIKTOK_LANDSCAPE_MAX_HEIGHT = 1080;
const TIKTOK_PORTRAIT_MAX_WIDTH = 1080;
const TIKTOK_PORTRAIT_MAX_HEIGHT = 1920;
const TIKTOK_FALLBACK_WIDTH = 1080;
const TIKTOK_FALLBACK_HEIGHT = 1920;
const TIKTOK_PHOTO_CACHE_VERSION = 2;

function safeStoragePath(input: string) {
  const path = String(input || "").trim();
  if (!path) return "";
  if (path.includes("..") || path.startsWith("/") || path.includes("\\")) return "";
  return path;
}

function normalizeVariant(input: unknown) {
  const value = String(input || "").trim();
  if (value === "photo_locked") return "photo_locked";
  if (value === "photo") return "photo";
  return "raw";
}

function mediaPathSuffix(path: string) {
  const clean = String(path || "").trim();
  if (!clean) return "";
  const parts = clean.split("/").filter(Boolean);
  return parts.slice(-2).join("/").slice(-160);
}

function tiktokPreparedPhotoPath(path: string, geometryLocked: boolean) {
  const clean = safeStoragePath(path);
  const lastSlash = clean.lastIndexOf("/");
  const directory = lastSlash >= 0 ? clean.slice(0, lastSlash + 1) : "";
  const fileName = lastSlash >= 0 ? clean.slice(lastSlash + 1) : clean;
  const base = fileName.replace(/\.[^.]+$/, "") || "image";
  const mode = geometryLocked ? "locked" : "photo";
  return `${directory}${base}-tiktok-classic-v${TIKTOK_PHOTO_CACHE_VERSION}-${mode}.jpg`;
}

async function renderTikTokRatioPreservingJpeg(input: Buffer) {
  const source = sharp(input, { failOn: "none" }).rotate();
  const meta = await source.metadata();
  const rawWidth = Number(meta.width || 0);
  const rawHeight = Number(meta.height || 0);
  const orientation = Number(meta.orientation || 1);
  const swapsAxes = orientation >= 5 && orientation <= 8;
  const width = swapsAxes ? rawHeight : rawWidth;
  const height = swapsAxes ? rawWidth : rawHeight;
  if (!width || !height) throw new Error("image_dimensions_unavailable");

  const isLandscape = width >= height;
  const maxWidth = isLandscape
    ? TIKTOK_LANDSCAPE_MAX_WIDTH
    : TIKTOK_PORTRAIT_MAX_WIDTH;
  const maxHeight = isLandscape
    ? TIKTOK_LANDSCAPE_MAX_HEIGHT
    : TIKTOK_PORTRAIT_MAX_HEIGHT;

  let quality = 92;
  const render = (q: number) =>
    sharp(input, { failOn: "none" })
      .rotate()
      .resize({
        width: maxWidth,
        height: maxHeight,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .jpeg({
        quality: q,
        mozjpeg: true,
        progressive: false,
        chromaSubsampling: "4:2:0",
      })
      .toBuffer();

  let output = await render(quality);
  while (output.byteLength > TIKTOK_PHOTO_MAX_BYTES && quality > 50) {
    quality -= 6;
    output = await render(quality);
  }
  if (output.byteLength > TIKTOK_PHOTO_MAX_BYTES) {
    throw new Error("image_too_large_after_prepare");
  }
  return output;
}

async function renderTikTokSafetyFrame(input: Buffer) {
  return sharp(input, { failOn: "none" })
    .rotate()
    .resize({
      width: TIKTOK_FALLBACK_WIDTH,
      height: TIKTOK_FALLBACK_HEIGHT,
      fit: "contain",
      background: { r: 8, g: 12, b: 22, alpha: 1 },
      withoutEnlargement: false,
    })
    .jpeg({
      quality: 90,
      mozjpeg: true,
      progressive: false,
      chromaSubsampling: "4:2:0",
    })
    .toBuffer();
}

async function isDirectTikTokPhotoPublishable(input: Buffer, mime: string) {
  if (mime !== "image/jpeg" && mime !== "image/webp") return false;
  if (input.byteLength > TIKTOK_PHOTO_MAX_BYTES) return false;

  const meta = await sharp(input, { failOn: "none" }).metadata().catch(() => null);
  if (!meta?.width || !meta?.height) return false;
  if (mime === "image/jpeg" && meta.isProgressive) return false;
  const orientation = Number(meta.orientation || 1);
  const swapsAxes = orientation >= 5 && orientation <= 8;
  const width = swapsAxes ? meta.height : meta.width;
  const height = swapsAxes ? meta.width : meta.height;
  const isLandscape = width >= height;
  const maxWidth = isLandscape
    ? TIKTOK_LANDSCAPE_MAX_WIDTH
    : TIKTOK_PORTRAIT_MAX_WIDTH;
  const maxHeight = isLandscape
    ? TIKTOK_LANDSCAPE_MAX_HEIGHT
    : TIKTOK_PORTRAIT_MAX_HEIGHT;

  return width <= maxWidth && height <= maxHeight;
}

async function toTikTokPhotoBuffer(blob: Blob, geometryLocked = false) {
  const input = Buffer.from(await blob.arrayBuffer());

  if (geometryLocked) {
    // The new Booster pipeline already produced the definitive TikTok image.
    // Serve the exact stored bytes when they satisfy TikTok's photo limits so
    // the media is not put through a second lossy Sharp/JPEG encoding pass.
    const sourceMime = String(blob.type || "").toLowerCase();
    const normalizedMime = sourceMime === "image/jpg" ? "image/jpeg" : sourceMime;
    const sourceIsDirectlyPublishable =
      await isDirectTikTokPhotoPublishable(input, normalizedMime);
    if (sourceIsDirectlyPublishable) {
      return { buffer: input, mime: normalizedMime };
    }
  }

  // Legacy or non-compliant input: preserve the source composition and ratio,
  // bound it to TikTok's photo ceiling and encode a compatible JPEG once here.
  try {
    return {
      buffer: await renderTikTokRatioPreservingJpeg(input),
      mime: "image/jpeg" as const,
    };
  } catch {
    if (geometryLocked) {
      // A geometry-locked image must never be replaced by the legacy 9:16
      // safety canvas because that would alter the user's prepared composition.
      throw new Error("locked_geometry_photo_prepare_failed");
    }

    // Legacy safety curtain kept for old payloads only. It avoids a hard
    // publication failure without changing the new Originale/Adaptée/
    // Personnalisée contract.
    return {
      buffer: await renderTikTokSafetyFrame(input),
      mime: "image/jpeg" as const,
    };
  }
}

async function loadOrPrepareTikTokPhoto(params: {
  sourcePath: string;
  sourceBlob: Blob;
  geometryLocked: boolean;
}) {
  const sourceBuffer = Buffer.from(await params.sourceBlob.arrayBuffer());
  const sourceMimeRaw = String(params.sourceBlob.type || "").toLowerCase();
  const sourceMime = sourceMimeRaw === "image/jpg" ? "image/jpeg" : sourceMimeRaw;
  if (await isDirectTikTokPhotoPublishable(sourceBuffer, sourceMime)) {
    return { buffer: sourceBuffer, mime: sourceMime, cache: "source" as const };
  }

  const preparedPath = tiktokPreparedPhotoPath(
    params.sourcePath,
    params.geometryLocked,
  );
  const cached = await supabaseAdmin.storage
    .from("booster")
    .download(preparedPath)
    .catch(() => ({ data: null, error: null }));
  if (cached.data) {
    const cachedBuffer = Buffer.from(await cached.data.arrayBuffer());
    if (await isDirectTikTokPhotoPublishable(cachedBuffer, "image/jpeg")) {
      return { buffer: cachedBuffer, mime: "image/jpeg" as const, cache: "hit" as const };
    }
  }

  const prepared = await toTikTokPhotoBuffer(
    params.sourceBlob,
    params.geometryLocked,
  );
  const upload = await supabaseAdmin.storage.from("booster").upload(
    preparedPath,
    toExactStorageArrayBuffer(prepared.buffer),
    {
      contentType: prepared.mime,
      cacheControl: "3600",
      upsert: true,
    },
  );
  if (upload.error) {
    console.warn("[tiktok-media] prepared photo cache upload failed", {
      pathSuffix: mediaPathSuffix(params.sourcePath),
      preparedPathSuffix: mediaPathSuffix(preparedPath),
      error: upload.error.message,
    });
  }
  return { ...prepared, cache: "miss" as const };
}

async function loadMedia(request: Request, includeBody: boolean) {
  const url = new URL(request.url);
  const path = safeStoragePath(url.searchParams.get("path") || "");
  const exp = Number(url.searchParams.get("exp") || "0");
  const sig = url.searchParams.get("sig") || "";
  const variant = normalizeVariant(url.searchParams.get("variant") || "raw");

  if (!path || !verifyTiktokMediaSignature(path, exp, sig, variant)) {
    console.warn("[tiktok-media] signed URL rejected", {
      method: request.method,
      variant,
      pathSuffix: mediaPathSuffix(path),
      expired: Number.isFinite(exp) ? exp * 1000 < Date.now() : null,
    });
    return NextResponse.json({ error: "Lien média TikTok invalide ou expiré." }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin.storage.from("booster").download(path);
  if (error || !data) {
    console.error("[tiktok-media] storage download failed", {
      method: request.method,
      variant,
      pathSuffix: mediaPathSuffix(path),
      error: error?.message || "media_missing",
    });
    return NextResponse.json({ error: "Média introuvable." }, { status: 404 });
  }

  let body: Blob | Buffer = data;
  let contentType = data.type || "application/octet-stream";
  let contentLength = data.size || 0;

  if (variant === "photo" || variant === "photo_locked") {
    try {
      const geometryLocked = variant === "photo_locked";
      const prepared = await loadOrPrepareTikTokPhoto({
        sourcePath: path,
        sourceBlob: data,
        geometryLocked,
      });
      body = prepared.buffer;
      contentType = prepared.mime;
      contentLength = prepared.buffer.length;
    } catch (error) {
      console.error("[tiktok-media] photo preparation failed", {
        method: request.method,
        variant,
        pathSuffix: mediaPathSuffix(path),
        error: error instanceof Error ? error.message : String(error || ""),
      });
      return NextResponse.json({ error: "Image TikTok impossible à préparer." }, { status: 422 });
    }
  }

  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Content-Length", String(contentLength));
  headers.set("Cache-Control", "public, max-age=3600, immutable");
  headers.set("X-Content-Type-Options", "nosniff");

  console.info("[tiktok-media] media served", {
    method: request.method,
    variant,
    pathSuffix: mediaPathSuffix(path),
    contentType,
    contentLength,
  });

  if (!includeBody) return new NextResponse(null, { status: 200, headers });

  const responseBody: BodyInit =
    body instanceof Blob
      ? body
      : (body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer);

  return new NextResponse(responseBody, { status: 200, headers });
}

export async function GET(request: Request) {
  return loadMedia(request, true);
}

export async function HEAD(request: Request) {
  return loadMedia(request, false);
}
