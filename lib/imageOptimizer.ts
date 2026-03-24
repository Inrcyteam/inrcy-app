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

async function createBlurContainJpeg(params: {
  inputBuffer: Buffer;
  width: number;
  height: number;
  maxBytes: number;
  startQuality?: number;
  minQuality?: number;
  blurSigma?: number;
}) : Promise<OptimizeResult> {
  const { inputBuffer, width, height, maxBytes, startQuality = 88, minQuality = 52, blurSigma = 28 } = params;

  const src = sharp(inputBuffer, { failOn: "none" }).rotate();
  const meta = await src.metadata();

  let quality = startQuality;

  async function render(q: number) {
    const backdrop = await sharp(inputBuffer, { failOn: "none" })
      .rotate()
      .resize({ width, height, fit: "cover", position: "centre" })
      .blur(blurSigma)
      .modulate({ brightness: 1.03, saturation: 1.05 })
      .jpeg({ quality: Math.max(54, Math.min(q, 76)), mozjpeg: true, progressive: true, chromaSubsampling: "4:2:0" })
      .toBuffer();

    const foreground = await sharp(inputBuffer, { failOn: "none" })
      .rotate()
      .resize({
        width,
        height,
        fit: "contain",
        position: "centre",
        withoutEnlargement: true,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    return sharp(backdrop)
      .composite([{ input: foreground, gravity: "centre" }])
      .jpeg({ quality: q, mozjpeg: true, progressive: true, chromaSubsampling: "4:2:0" })
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
  let result = await createBlurContainJpeg({
    inputBuffer,
    width: INSTAGRAM_WIDTH,
    height: INSTAGRAM_HEIGHT,
    maxBytes: INSTAGRAM_MAX_BYTES,
    startQuality: 86,
    minQuality: 52,
  });

  if (result.size > INSTAGRAM_MAX_BYTES) {
    result = await createBlurContainJpeg({
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
  let result = await createBlurContainJpeg({
    inputBuffer,
    width: SOCIAL_FEED_WIDTH,
    height: SOCIAL_FEED_HEIGHT,
    maxBytes: SOCIAL_FEED_MAX_BYTES,
    startQuality: 88,
    minQuality: 56,
  });

  if (result.size > SOCIAL_FEED_MAX_BYTES) {
    result = await createBlurContainJpeg({
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
  let result = await createBlurContainJpeg({
    inputBuffer,
    width: SITE_CARD_WIDTH,
    height: SITE_CARD_HEIGHT,
    maxBytes: SITE_CARD_MAX_BYTES,
    startQuality: 88,
    minQuality: 56,
    blurSigma: 24,
  });

  if (result.size > SITE_CARD_MAX_BYTES) {
    result = await createBlurContainJpeg({
      inputBuffer,
      width: 1280,
      height: 800,
      maxBytes: SITE_CARD_MAX_BYTES,
      startQuality: 80,
      minQuality: 50,
      blurSigma: 22,
    });
  }

  return result;
}
