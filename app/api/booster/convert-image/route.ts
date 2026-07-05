import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireUser } from "@/lib/requireUser";
import { enforceRateLimit } from "@/lib/rateLimit";
import { INR_MEDIA_IMAGE_MAX_BYTES } from "@/lib/mediaRules";

export const runtime = "nodejs";

const MAX_SOURCE_BYTES = INR_MEDIA_IMAGE_MAX_BYTES;
const MAX_OUTPUT_BYTES = INR_MEDIA_IMAGE_MAX_BYTES;
const MAX_OUTPUT_SIDE = 2500;
const HEIC_MIME_TYPES = new Set(["image/heic", "image/heif"]);

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

async function convertToJpeg(input: Buffer) {
  let quality = 90;
  let output = await sharp(input, { failOn: "none" })
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
    output = await sharp(input, { failOn: "none" })
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

export async function POST(req: Request) {
  try {
    const { user, errorResponse, activeUserId } = await requireUser();
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
    const output = await convertToJpeg(input);

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
      },
    });
  } catch (e) {
    console.error("[Booster] convert-image failed", e);
    return NextResponse.json(
      {
        error:
          "Impossible de convertir cette image HEIC. Utilisez une image JPG, PNG ou WebP.",
      },
      { status: 500 },
    );
  }
}
