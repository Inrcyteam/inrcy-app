import sharp from "sharp";

const INSTAGRAM_MAX_BYTES = 8 * 1024 * 1024;
const INSTAGRAM_WIDTH = 1080;
const INSTAGRAM_HEIGHT = 1350;
const SOCIAL_FEED_MAX_BYTES = 8 * 1024 * 1024;
const SOCIAL_FEED_WIDTH = 1200;
const SOCIAL_FEED_HEIGHT = 1200;

export type OptimizeResult = {
  buffer: Buffer;
  mime: "image/jpeg";
  extension: "jpg";
  width: number;
  height: number;
  size: number;
  quality: number;
  sourceFormat?: string;
};

async function flattenToJpegContain(params: {
  inputBuffer: Buffer;
  width: number;
  height: number;
  maxBytes: number;
  startQuality?: number;
  minQuality?: number;
}) : Promise<OptimizeResult> {
  const { inputBuffer, width, height, maxBytes, startQuality = 88, minQuality = 52 } = params;
  const src = sharp(inputBuffer, { failOn: "none" }).rotate();
  const meta = await src.metadata();

  let quality = startQuality;
  const pipeline = src
    .resize({
      width,
      height,
      fit: "contain",
      position: "centre",
      withoutEnlargement: true,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } });

  let output = await pipeline
    .jpeg({ quality, mozjpeg: true, progressive: true, chromaSubsampling: "4:2:0" })
    .toBuffer();

  while (output.byteLength > maxBytes && quality > minQuality) {
    quality -= 6;
    output = await pipeline
      .jpeg({ quality, mozjpeg: true, progressive: true, chromaSubsampling: "4:2:0" })
      .toBuffer();
  }

  return {
    buffer: output,
    mime: "image/jpeg",
    extension: "jpg",
    width,
    height,
    size: output.byteLength,
    quality,
    sourceFormat: meta.format,
  };
}

export async function optimizeForInstagram(inputBuffer: Buffer): Promise<OptimizeResult> {
  let result = await flattenToJpegContain({
    inputBuffer,
    width: INSTAGRAM_WIDTH,
    height: INSTAGRAM_HEIGHT,
    maxBytes: INSTAGRAM_MAX_BYTES,
    startQuality: 86,
    minQuality: 52,
  });

  if (result.size > INSTAGRAM_MAX_BYTES) {
    result = await flattenToJpegContain({
      inputBuffer,
      width: 900,
      height: 1125,
      maxBytes: INSTAGRAM_MAX_BYTES,
      startQuality: 78,
      minQuality: 48,
    });
  }

  return result;
}

export async function optimizeForSocialFeed(inputBuffer: Buffer): Promise<OptimizeResult> {
  let result = await flattenToJpegContain({
    inputBuffer,
    width: SOCIAL_FEED_WIDTH,
    height: SOCIAL_FEED_HEIGHT,
    maxBytes: SOCIAL_FEED_MAX_BYTES,
    startQuality: 88,
    minQuality: 56,
  });

  if (result.size > SOCIAL_FEED_MAX_BYTES) {
    result = await flattenToJpegContain({
      inputBuffer,
      width: 1080,
      height: 1080,
      maxBytes: SOCIAL_FEED_MAX_BYTES,
      startQuality: 80,
      minQuality: 50,
    });
  }

  return result;
}
