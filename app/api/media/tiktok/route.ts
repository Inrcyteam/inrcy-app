import { createHash } from "node:crypto";

import { NextResponse } from "next/server";
import sharp from "sharp";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyTiktokMediaSignature } from "@/lib/tiktokMediaUrl";

export const runtime = "nodejs";

const TIKTOK_PHOTO_MAX_BYTES = 20_000_000;
const TIKTOK_LANDSCAPE_MAX_WIDTH = 1920;
const TIKTOK_LANDSCAPE_MAX_HEIGHT = 1080;
const TIKTOK_PORTRAIT_MAX_WIDTH = 1080;
const TIKTOK_PORTRAIT_MAX_HEIGHT = 1920;
const TIKTOK_FALLBACK_WIDTH = 1080;
const TIKTOK_FALLBACK_HEIGHT = 1920;
const TIKTOK_READY_CACHE_VERSION = 3;

function safeStoragePath(input: string) {
  const path = String(input || "").trim();
  if (!path) return "";
  if (path.includes("..") || path.startsWith("/") || path.includes("\\")) return "";
  return path;
}


function cachedVariantPath(sourcePath: string, variant: string) {
  const digest = createHash("sha256")
    .update(`${sourcePath}:${variant}:v${TIKTOK_READY_CACHE_VERSION}`)
    .digest("hex")
    .slice(0, 40);
  return `tiktok-ready/${digest}.jpg`;
}

async function downloadCachedVariant(path: string) {
  const { data, error } = await supabaseAdmin.storage.from("booster").download(path);
  if (error || !data) return null;
  return data;
}

async function persistCachedVariant(path: string, buffer: Buffer) {
  const { error } = await supabaseAdmin.storage.from("booster").upload(path, buffer, {
    contentType: "image/jpeg",
    cacheControl: "31536000",
    upsert: true,
  });
  if (error) throw error;
}

function normalizeVariant(input: unknown) {
  const value = String(input || "").trim();
  if (value === "photo_locked") return "photo_locked";
  if (value === "photo") return "photo";
  return "raw";
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
      .toColourspace("srgb")
      .jpeg({
        quality: q,
        mozjpeg: false,
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
    .flatten({ background: { r: 8, g: 12, b: 22, alpha: 1 } })
    .toColourspace("srgb")
    .jpeg({
      quality: 90,
      mozjpeg: false,
      progressive: false,
      chromaSubsampling: "4:2:0",
    })
    .toBuffer();
}

async function isDirectTikTokPhotoPublishable(input: Buffer, mime: string) {
  // Validate the encoded bytes, not just the declared MIME. TikTok's PHOTO
  // endpoint intermittently rejects progressive/CMYK JPEGs even when their
  // dimensions and Content-Type look valid.
  if (mime !== "image/jpeg") return false;
  if (input.byteLength > TIKTOK_PHOTO_MAX_BYTES) return false;

  const meta = await sharp(input, { failOn: "none" }).metadata().catch(() => null);
  if (!meta?.width || !meta?.height) return false;
  if (meta.format !== "jpeg" || meta.isProgressive === true) return false;
  if (String(meta.space || "").toLowerCase() !== "srgb") return false;
  if (String(meta.chromaSubsampling || "") !== "4:2:0") return false;
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

async function loadMedia(request: Request, includeBody: boolean) {
  const url = new URL(request.url);
  const path = safeStoragePath(url.searchParams.get("path") || "");
  const exp = Number(url.searchParams.get("exp") || "0");
  const sig = url.searchParams.get("sig") || "";
  const variant = normalizeVariant(url.searchParams.get("variant") || "raw");

  if (!path || !verifyTiktokMediaSignature(path, exp, sig, variant)) {
    return NextResponse.json({ error: "Lien média TikTok invalide ou expiré." }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin.storage.from("booster").download(path);
  if (error || !data) {
    return NextResponse.json({ error: "Média introuvable." }, { status: 404 });
  }

  let body: Blob | Buffer = data;
  let contentType = data.type || "application/octet-stream";
  let contentLength = data.size || 0;

  if (variant === "photo" || variant === "photo_locked") {
    try {
      const geometryLocked = variant === "photo_locked";
      const sourceBuffer = Buffer.from(await data.arrayBuffer());
      const sourceMime = String(data.type || "").toLowerCase() === "image/jpg"
        ? "image/jpeg"
        : String(data.type || "").toLowerCase();
      const canServeStoredBytes = geometryLocked &&
        await isDirectTikTokPhotoPublishable(sourceBuffer, sourceMime);

      if (canServeStoredBytes) {
        body = sourceBuffer;
        contentType = sourceMime;
        contentLength = sourceBuffer.length;
      } else {
        const cachePath = cachedVariantPath(path, variant);
        let cached = await downloadCachedVariant(cachePath);
        if (cached) {
          const cachedBuffer = Buffer.from(await cached.arrayBuffer());
          const validCachedBytes = await isDirectTikTokPhotoPublishable(
            cachedBuffer,
            "image/jpeg",
          );
          if (!validCachedBytes) cached = null;
        }
        if (!cached) {
          const prepared = await toTikTokPhotoBuffer(data, geometryLocked);
          await persistCachedVariant(cachePath, prepared.buffer);
          const preparedBytes = new Uint8Array(prepared.buffer.length);
          preparedBytes.set(prepared.buffer);
          cached = new Blob([preparedBytes.buffer], { type: prepared.mime });
        }
        body = cached;
        contentType = "image/jpeg";
        contentLength = cached.size;
      }
    } catch {
      return NextResponse.json({ error: "Image TikTok impossible à préparer." }, { status: 422 });
    }
  }

  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Content-Length", String(contentLength));
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("X-Content-Type-Options", "nosniff");

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
