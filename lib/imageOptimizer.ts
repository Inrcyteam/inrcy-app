import sharp from "sharp";

const INSTAGRAM_MAX_BYTES = 8 * 1024 * 1024;
const INSTAGRAM_WIDTH = 1080;
const INSTAGRAM_HEIGHT = 1350;
const SOCIAL_FEED_MAX_BYTES = 8 * 1024 * 1024;
const SOCIAL_FEED_WIDTH = 1200;
const SOCIAL_FEED_HEIGHT = 1200;
const SITE_CARD_MAX_BYTES = 8 * 1024 * 1024;
const SITE_CARD_WIDTH = 1440;
const SITE_CARD_HEIGHT = 900;
const GMB_MAX_BYTES = 5 * 1024 * 1024;
const GMB_WIDTH = 1200;
const GMB_HEIGHT = 900;

const DEFAULT_BACKGROUND = { r: 255, g: 255, b: 255, alpha: 1 };
const COVER_CROP_THRESHOLD = 0.08;

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

function getCropLossFraction(sourceRatio: number, targetRatio: number) {
  if (!Number.isFinite(sourceRatio) || sourceRatio <= 0 || !Number.isFinite(targetRatio) || targetRatio <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  if (sourceRatio > targetRatio) {
    return 1 - targetRatio / sourceRatio;
  }

  return 1 - sourceRatio / targetRatio;
}

function shouldUseCover(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number) {
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  return getCropLossFraction(sourceRatio, targetRatio) <= COVER_CROP_THRESHOLD;
}

async function createSmartJpeg(params: {
  inputBuffer: Buffer;
  width: number;
  height: number;
  maxBytes: number;
  startQuality?: number;
  minQuality?: number;
  background?: { r: number; g: number; b: number; alpha: number };
}): Promise<OptimizeResult> {
  const {
    inputBuffer,
    width,
    height,
    maxBytes,
    startQuality = 88,
    minQuality = 52,
    background = DEFAULT_BACKGROUND,
  } = params;

  const src = sharp(inputBuffer, { failOn: "none" }).rotate();
  const meta = await src.metadata();
  const sourceWidth = meta.width ?? width;
  const sourceHeight = meta.height ?? height;
  const useCover = shouldUseCover(sourceWidth, sourceHeight, width, height);

  let quality = startQuality;

  async function render(q: number) {
    return sharp(inputBuffer, { failOn: "none" })
      .rotate()
      .resize({
        width,
        height,
        fit: useCover ? "cover" : "contain",
        position: "centre",
        withoutEnlargement: false,
        background: useCover ? undefined : background,
      })
      .flatten({ background })
      .jpeg({
        quality: q,
        mozjpeg: true,
        progressive: true,
        chromaSubsampling: "4:2:0",
      })
      .toBuffer();
  }

  let output = await render(quality);
  while (output.byteLength > maxBytes && quality > minQuality) {
    quality -= 6;
    output = await render(quality);
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
  let result = await createSmartJpeg({
    inputBuffer,
    width: INSTAGRAM_WIDTH,
    height: INSTAGRAM_HEIGHT,
    maxBytes: INSTAGRAM_MAX_BYTES,
    startQuality: 86,
    minQuality: 52,
  });

  if (result.size > INSTAGRAM_MAX_BYTES) {
    result = await createSmartJpeg({
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
  let result = await createSmartJpeg({
    inputBuffer,
    width: SOCIAL_FEED_WIDTH,
    height: SOCIAL_FEED_HEIGHT,
    maxBytes: SOCIAL_FEED_MAX_BYTES,
    startQuality: 88,
    minQuality: 56,
  });

  if (result.size > SOCIAL_FEED_MAX_BYTES) {
    result = await createSmartJpeg({
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

export async function optimizeForSiteCard(inputBuffer: Buffer): Promise<OptimizeResult> {
  let result = await createSmartJpeg({
    inputBuffer,
    width: SITE_CARD_WIDTH,
    height: SITE_CARD_HEIGHT,
    maxBytes: SITE_CARD_MAX_BYTES,
    startQuality: 88,
    minQuality: 56,
  });

  if (result.size > SITE_CARD_MAX_BYTES) {
    result = await createSmartJpeg({
      inputBuffer,
      width: 1280,
      height: 800,
      maxBytes: SITE_CARD_MAX_BYTES,
      startQuality: 80,
      minQuality: 50,
    });
  }

  return result;
}


export async function optimizeForGoogleBusiness(inputBuffer: Buffer): Promise<OptimizeResult> {
  let result = await createSmartJpeg({
    inputBuffer,
    width: GMB_WIDTH,
    height: GMB_HEIGHT,
    maxBytes: GMB_MAX_BYTES,
    startQuality: 86,
    minQuality: 52,
  });

  if (result.size > GMB_MAX_BYTES) {
    result = await createSmartJpeg({
      inputBuffer,
      width: 960,
      height: 720,
      maxBytes: GMB_MAX_BYTES,
      startQuality: 78,
      minQuality: 48,
    });
  }

  return result;
}
