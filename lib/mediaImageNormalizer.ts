import { readFile } from "node:fs/promises";
import bmp from "bmp-js";
import heicConvert from "heic-convert";
import sharp, { type Sharp } from "sharp";
import {
  IMAGE_AI_PREVIEW_JPEG_QUALITY,
  IMAGE_AI_PREVIEW_MAX_SIDE,
  IMAGE_CANONICAL_JPEG_QUALITY,
  IMAGE_CANONICAL_MAX_SIDE,
  IMAGE_NORMALIZATION_BMP_FALLBACK_MAX_BYTES,
  IMAGE_NORMALIZATION_BMP_MAX_INPUT_PIXELS,
  IMAGE_NORMALIZATION_HEIC_FALLBACK_MAX_BYTES,
  IMAGE_NORMALIZATION_MAX_INPUT_PIXELS,
  IMAGE_THUMBNAIL_JPEG_QUALITY,
  IMAGE_THUMBNAIL_MAX_SIDE,
  isBmpMimeOrName,
  isHeicMimeOrName,
  type ImageNormalizationPurpose,
} from "./mediaImageNormalizationPolicy.ts";

const WHITE_BACKGROUND = { r: 255, g: 255, b: 255, alpha: 1 } as const;

type SharpInput = string | Buffer;

export type NormalizedImageVariant = {
  purpose: ImageNormalizationPurpose;
  buffer: Buffer;
  mimeType: "image/jpeg" | "image/png";
  extension: "jpg" | "png";
  width: number;
  height: number;
  sizeBytes: number;
  transformSpec: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export type NormalizedImageBundle = {
  source: {
    width: number;
    height: number;
    format: string;
    hasAlpha: boolean;
    pages: number;
    orientation: number | null;
    decoder: "sharp" | "heic-convert" | "bmp-js";
  };
  variants: Record<ImageNormalizationPurpose, NormalizedImageVariant>;
};

function getOrientedDimensions(meta: {
  width?: number;
  height?: number;
  orientation?: number;
}) {
  const width = Number(meta.width || 0);
  const height = Number(meta.height || 0);
  const orientation = Number(meta.orientation || 1);
  const swapsAxes = orientation >= 5 && orientation <= 8;
  return {
    width: swapsAxes ? height : width,
    height: swapsAxes ? width : height,
  };
}

function createBasePipeline(input: SharpInput, maxSide: number): Sharp {
  return sharp(input, {
    failOn: "error",
    limitInputPixels: IMAGE_NORMALIZATION_MAX_INPUT_PIXELS,
    pages: 1,
  })
    .rotate()
    .resize({
      width: maxSide,
      height: maxSide,
      fit: "inside",
      withoutEnlargement: true,
      fastShrinkOnLoad: true,
    });
}

async function renderJpeg(params: {
  input: SharpInput;
  purpose: ImageNormalizationPurpose;
  maxSide: number;
  quality: number;
  sourceMetadata: Record<string, unknown>;
}) {
  const rendered = await createBasePipeline(params.input, params.maxSide)
    .flatten({ background: WHITE_BACKGROUND })
    .jpeg({
      quality: params.quality,
      mozjpeg: true,
      progressive: true,
      chromaSubsampling: "4:2:0",
    })
    .toBuffer({ resolveWithObject: true });

  return {
    purpose: params.purpose,
    buffer: rendered.data,
    mimeType: "image/jpeg" as const,
    extension: "jpg" as const,
    width: rendered.info.width,
    height: rendered.info.height,
    sizeBytes: rendered.info.size,
    transformSpec: {
      operation: "normalize_image",
      fit: "inside",
      max_side: params.maxSide,
      without_enlargement: true,
      auto_orient: true,
      crop: false,
      flatten_background: "#ffffff",
      output: "jpeg",
      quality: params.quality,
      metadata_stripped: true,
    },
    metadata: params.sourceMetadata,
  } satisfies NormalizedImageVariant;
}

async function renderCanonical(params: {
  input: SharpInput;
  hasAlpha: boolean;
  sourceMetadata: Record<string, unknown>;
}) {
  if (params.hasAlpha) {
    const rendered = await createBasePipeline(
      params.input,
      IMAGE_CANONICAL_MAX_SIDE,
    )
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true,
        palette: false,
      })
      .toBuffer({ resolveWithObject: true });

    return {
      purpose: "canonical",
      buffer: rendered.data,
      mimeType: "image/png",
      extension: "png",
      width: rendered.info.width,
      height: rendered.info.height,
      sizeBytes: rendered.info.size,
      transformSpec: {
        operation: "normalize_image",
        fit: "inside",
        max_side: IMAGE_CANONICAL_MAX_SIDE,
        without_enlargement: true,
        auto_orient: true,
        crop: false,
        preserve_alpha: true,
        output: "png",
        metadata_stripped: true,
      },
      metadata: params.sourceMetadata,
    } satisfies NormalizedImageVariant;
  }

  return await renderJpeg({
    input: params.input,
    purpose: "canonical",
    maxSide: IMAGE_CANONICAL_MAX_SIDE,
    quality: IMAGE_CANONICAL_JPEG_QUALITY,
    sourceMetadata: params.sourceMetadata,
  });
}

async function normalizeWithSharp(
  input: SharpInput,
  decoder: "sharp" | "heic-convert" | "bmp-js",
): Promise<NormalizedImageBundle> {
  const meta = await sharp(input, {
    failOn: "error",
    limitInputPixels: IMAGE_NORMALIZATION_MAX_INPUT_PIXELS,
    pages: 1,
  }).metadata();
  const oriented = getOrientedDimensions(meta);
  if (!oriented.width || !oriented.height) {
    throw new Error("image_dimensions_unavailable");
  }

  const pages = Math.max(1, Number(meta.pages || 1));
  const hasAlpha = Boolean(meta.hasAlpha);
  const sourceMetadata = {
    source_width: oriented.width,
    source_height: oriented.height,
    source_format: String(meta.format || "unknown"),
    source_has_alpha: hasAlpha,
    source_pages: pages,
    source_orientation: meta.orientation || null,
    animated_source_flattened_to_first_frame: pages > 1,
    decoder,
  };

  const [canonical, aiPreview, thumbnail] = await Promise.all([
    renderCanonical({ input, hasAlpha, sourceMetadata }),
    renderJpeg({
      input,
      purpose: "ai_preview",
      maxSide: IMAGE_AI_PREVIEW_MAX_SIDE,
      quality: IMAGE_AI_PREVIEW_JPEG_QUALITY,
      sourceMetadata,
    }),
    renderJpeg({
      input,
      purpose: "thumbnail",
      maxSide: IMAGE_THUMBNAIL_MAX_SIDE,
      quality: IMAGE_THUMBNAIL_JPEG_QUALITY,
      sourceMetadata,
    }),
  ]);

  return {
    source: {
      width: oriented.width,
      height: oriented.height,
      format: String(meta.format || "unknown"),
      hasAlpha,
      pages,
      orientation: meta.orientation || null,
      decoder,
    },
    variants: {
      canonical,
      ai_preview: aiPreview,
      thumbnail,
    },
  };
}

async function convertHeicSource(inputPath: string) {
  const input = await readFile(inputPath);
  if (input.byteLength > IMAGE_NORMALIZATION_HEIC_FALLBACK_MAX_BYTES) {
    throw new Error("heic_fallback_source_too_large");
  }
  const converted = await heicConvert({
    buffer: input,
    format: "JPEG",
    quality: 0.94,
  });
  const buffer = Buffer.from(converted);
  if (!buffer.byteLength) throw new Error("heic_conversion_empty");
  return buffer;
}

async function convertBmpSource(inputPath: string) {
  const input = await readFile(inputPath);
  if (input.byteLength > IMAGE_NORMALIZATION_BMP_FALLBACK_MAX_BYTES) {
    throw new Error("bmp_fallback_source_too_large");
  }
  if (
    input.byteLength < 54 ||
    input.toString("ascii", 0, 2) !== "BM" ||
    input.readUInt32LE(14) < 40
  ) {
    throw new Error("bmp_header_invalid");
  }

  const declaredWidth = input.readInt32LE(18);
  const declaredHeight = Math.abs(input.readInt32LE(22));
  const declaredPixels = declaredWidth * declaredHeight;
  if (
    declaredWidth <= 0 ||
    declaredHeight <= 0 ||
    !Number.isSafeInteger(declaredPixels) ||
    declaredPixels > IMAGE_NORMALIZATION_BMP_MAX_INPUT_PIXELS
  ) {
    throw new Error("bmp_dimensions_unsafe");
  }

  const decoded = bmp.decode(input);
  const width = Number(decoded.width || 0);
  const height = Number(decoded.height || 0);
  const pixelCount = width * height;
  if (
    width !== declaredWidth ||
    height !== declaredHeight ||
    !Number.isSafeInteger(pixelCount) ||
    pixelCount <= 0 ||
    pixelCount > IMAGE_NORMALIZATION_BMP_MAX_INPUT_PIXELS ||
    decoded.data.byteLength !== pixelCount * 4
  ) {
    throw new Error("bmp_decode_dimensions_invalid");
  }

  let meaningfulAlpha = false;
  if (decoded.bitPP === 32) {
    for (let offset = 0; offset < decoded.data.length; offset += 4) {
      if (decoded.data[offset] !== 0) {
        meaningfulAlpha = true;
        break;
      }
    }
  }

  const channels: 3 | 4 = meaningfulAlpha ? 4 : 3;
  const pixels = Buffer.allocUnsafe(pixelCount * channels);
  for (
    let sourceOffset = 0, targetOffset = 0;
    sourceOffset < decoded.data.length;
    sourceOffset += 4, targetOffset += channels
  ) {
    pixels[targetOffset] = decoded.data[sourceOffset + 3];
    pixels[targetOffset + 1] = decoded.data[sourceOffset + 2];
    pixels[targetOffset + 2] = decoded.data[sourceOffset + 1];
    if (meaningfulAlpha) {
      pixels[targetOffset + 3] = decoded.data[sourceOffset];
    }
  }

  return await sharp(pixels, {
    raw: { width, height, channels },
    limitInputPixels: IMAGE_NORMALIZATION_BMP_MAX_INPUT_PIXELS,
  })
    .png({ compressionLevel: 6, adaptiveFiltering: true })
    .toBuffer();
}

export async function normalizeImageSource(params: {
  inputPath: string;
  mimeType: string;
  originalFileName?: string | null;
}) {
  try {
    return await normalizeWithSharp(params.inputPath, "sharp");
  } catch (sharpError) {
    if (isHeicMimeOrName(params.mimeType, params.originalFileName || "")) {
      const converted = await convertHeicSource(params.inputPath);
      return await normalizeWithSharp(converted, "heic-convert");
    }
    if (isBmpMimeOrName(params.mimeType, params.originalFileName || "")) {
      const converted = await convertBmpSource(params.inputPath);
      return await normalizeWithSharp(converted, "bmp-js");
    }
    throw sharpError;
  }
}
