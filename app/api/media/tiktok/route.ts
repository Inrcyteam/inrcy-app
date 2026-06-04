import { NextResponse } from "next/server";
import sharp from "sharp";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyTiktokMediaSignature } from "@/lib/tiktokMediaUrl";

export const runtime = "nodejs";

const TIKTOK_PHOTO_WIDTH = 1080;
const TIKTOK_PHOTO_HEIGHT = 1920;

function safeStoragePath(input: string) {
  const path = String(input || "").trim();
  if (!path) return "";
  if (path.includes("..") || path.startsWith("/") || path.includes("\\")) return "";
  return path;
}

function normalizeVariant(input: unknown) {
  return String(input || "").trim() === "photo" ? "photo" : "raw";
}

async function toTikTokPhotoBuffer(blob: Blob) {
  const input = Buffer.from(await blob.arrayBuffer());

  // TikTok peut refuser les photos trop petites ou avec des dimensions atypiques
  // (picture_size_check_failed). Pour sécuriser le Direct Post photo, on sert une
  // variante JPEG 9:16 stable, en conservant l'image complète dans un cadre sobre.
  return sharp(input, { failOn: "none" })
    .rotate()
    .resize({
      width: TIKTOK_PHOTO_WIDTH,
      height: TIKTOK_PHOTO_HEIGHT,
      fit: "contain",
      background: { r: 8, g: 12, b: 22, alpha: 1 },
      withoutEnlargement: false,
    })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
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

  if (variant === "photo") {
    try {
      const photoBuffer = await toTikTokPhotoBuffer(data);
      body = photoBuffer;
      contentType = "image/jpeg";
      contentLength = photoBuffer.length;
    } catch {
      return NextResponse.json({ error: "Image TikTok impossible à préparer." }, { status: 422 });
    }
  }

  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Content-Length", String(contentLength));
  headers.set("Cache-Control", "public, max-age=300");
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
