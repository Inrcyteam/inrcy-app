import sharp from "sharp";
import {
  BOOSTER_AUTO_CROP_MAX_LOSS,
  getImageCropLossFraction,
} from "@/lib/boosterImageDecision";

const INSTAGRAM_MAX_BYTES = 8 * 1024 * 1024;
const INSTAGRAM_WIDTH = 1080;
const INSTAGRAM_HEIGHT = 1350;
const INSTAGRAM_NATIVE_MIN_RATIO = 4 / 5;
const INSTAGRAM_NATIVE_MAX_RATIO = 1.91;
const INSTAGRAM_NATIVE_MAX_WIDTH = 1440;
const INSTAGRAM_NATIVE_MIN_WIDTH = 320;
const SOCIAL_FEED_MAX_BYTES = 8 * 1024 * 1024;
const SOCIAL_FEED_WIDTH = 1200;
const SOCIAL_FEED_HEIGHT = 1200;
const SOCIAL_FEED_NATIVE_MAX_SIDE = 1600;
const SITE_CARD_MAX_BYTES = 8 * 1024 * 1024;
const SITE_CARD_WIDTH = 1440;
const SITE_CARD_HEIGHT = 900;
const GMB_MAX_BYTES = 5 * 1024 * 1024;
const GMB_WIDTH = 1200;
const GMB_HEIGHT = 900;
const GMB_NATIVE_MAX_SIDE = 1600;
const FINAL_GEOMETRY_SCALE_STEPS = [1, 0.85, 0.7, 0.55, 0.4, 0.3, 0.2] as const;
const FINAL_GEOMETRY_RATIO_EPSILON = 0.005;

const DEFAULT_BACKGROUND = { r: 255, g: 255, b: 255, alpha: 1 };

export type OptimizeResult = {
  buffer: Buffer;
  mime: "image/jpeg";
  extension: "jpg";
  width: number;
  height: number;
  size: number;
  quality: number;
  sourceFormat?: string;
  strategy?: "native" | "safe-frame" | "geometry-locked";
};

export type FinalGeometryProfile = "instagram" | "social-feed" | "gmb";

function shouldUseCover(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
) {
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  return (
    getImageCropLossFraction(sourceRatio, targetRatio) <=
    BOOSTER_AUTO_CROP_MAX_LOSS
  );
}

async function getOutputMeta(
  buffer: Buffer,
  fallbackWidth: number,
  fallbackHeight: number,
) {
  const meta = await sharp(buffer, { failOn: "none" })
    .metadata()
    .catch(() => null);
  return {
    width: meta?.width || fallbackWidth,
    height: meta?.height || fallbackHeight,
  };
}

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

async function getVisualSourceRatio(inputBuffer: Buffer) {
  const meta = await sharp(inputBuffer, { failOn: "none" }).metadata();
  const oriented = getOrientedDimensions(meta);
  if (!oriented.width || !oriented.height) return null;
  return oriented.width / oriented.height;
}

async function createNativeJpeg(params: {
  inputBuffer: Buffer;
  maxBytes: number;
  startQuality?: number;
  minQuality?: number;
  maxWidth?: number;
  minWidth?: number;
  maxSide?: number;
  ratioMin?: number;
  ratioMax?: number;
  scaleSteps?: readonly number[];
}): Promise<OptimizeResult | null> {
  const {
    inputBuffer,
    maxBytes,
    startQuality = 88,
    minQuality = 50,
    maxWidth,
    minWidth,
    maxSide,
    ratioMin,
    ratioMax,
    scaleSteps = [1, 0.85, 0.7, 0.55],
  } = params;

  const src = sharp(inputBuffer, { failOn: "none" }).rotate();
  const meta = await src.metadata();
  const sourceWidth = meta.width || 0;
  const sourceHeight = meta.height || 0;
  if (!sourceWidth || !sourceHeight) return null;

  const sourceRatio = sourceWidth / sourceHeight;
  if (ratioMin && sourceRatio < ratioMin) return null;
  if (ratioMax && sourceRatio > ratioMax) return null;

  let targetWidth: number | undefined;
  let targetHeight: number | undefined;
  let withoutEnlargement = true;

  if (maxSide) {
    const nativeMaxSide = Math.min(
      maxSide,
      Math.max(sourceWidth, sourceHeight),
    );
    targetWidth = nativeMaxSide;
    targetHeight = nativeMaxSide;
  } else if (maxWidth || minWidth) {
    const preferredWidth = maxWidth
      ? Math.min(sourceWidth, maxWidth)
      : sourceWidth;
    const widenedWidth =
      minWidth && preferredWidth < minWidth ? minWidth : preferredWidth;
    targetWidth = Math.max(1, Math.round(widenedWidth));
    withoutEnlargement = targetWidth <= sourceWidth;
  }

  let quality = startQuality;
  async function render(q: number, scaleDown = 1) {
    const pipeline = sharp(inputBuffer, { failOn: "none" }).rotate();
    const resizeWidth = targetWidth
      ? Math.max(1, Math.round(targetWidth * scaleDown))
      : undefined;
    const resizeHeight = targetHeight
      ? Math.max(1, Math.round(targetHeight * scaleDown))
      : undefined;

    if (resizeWidth || resizeHeight) {
      pipeline.resize({
        width: resizeWidth,
        height: resizeHeight,
        fit: maxSide ? "inside" : "inside",
        withoutEnlargement: withoutEnlargement || Boolean(maxSide),
      });
    }

    return pipeline
      .flatten({ background: DEFAULT_BACKGROUND })
      .jpeg({
        quality: q,
        mozjpeg: true,
        progressive: true,
        chromaSubsampling: "4:2:0",
      })
      .toBuffer();
  }

  let output: Buffer | null = null;
  let finalQuality = quality;
  let finalScale = 1;

  for (const scale of scaleSteps) {
    quality = startQuality;
    output = await render(quality, scale);
    while (output.byteLength > maxBytes && quality > minQuality) {
      quality -= 6;
      output = await render(quality, scale);
    }
    if (output.byteLength <= maxBytes) {
      finalQuality = quality;
      finalScale = scale;
      break;
    }
    output = null;
  }

  if (!output) return null;
  const fallbackW = targetWidth
    ? Math.round(targetWidth * finalScale)
    : sourceWidth;
  const fallbackH = targetHeight
    ? Math.round(targetHeight * finalScale)
    : sourceHeight;
  const outMeta = await getOutputMeta(output, fallbackW, fallbackH);

  return {
    buffer: output,
    mime: "image/jpeg",
    extension: "jpg",
    width: outMeta.width,
    height: outMeta.height,
    size: output.byteLength,
    quality: finalQuality,
    sourceFormat: meta.format,
    strategy: "native",
  };
}

/**
 * Final publication optimizer used once Booster has already decided and, when
 * needed, rendered the visual composition for a channel.
 *
 * Contract: this function may rotate from EXIF, resize proportionally and
 * compress/re-encode, but it must never crop or place the image in a new
 * canvas. In other words, the geometry prepared by Booster is locked.
 */
export async function optimizeFinalImageGeometry(
  inputBuffer: Buffer,
  profile: FinalGeometryProfile,
): Promise<OptimizeResult> {
  const sourceRatio = await getVisualSourceRatio(inputBuffer).catch(() => null);
  const result = await createNativeJpeg(
    profile === "instagram"
      ? {
          inputBuffer,
          maxBytes: INSTAGRAM_MAX_BYTES,
          startQuality: 88,
          minQuality: 50,
          maxWidth: INSTAGRAM_NATIVE_MAX_WIDTH,
          minWidth: INSTAGRAM_NATIVE_MIN_WIDTH,
          scaleSteps: FINAL_GEOMETRY_SCALE_STEPS,
        }
      : profile === "gmb"
        ? {
            inputBuffer,
            maxBytes: GMB_MAX_BYTES,
            startQuality: 88,
            minQuality: 50,
            maxSide: GMB_NATIVE_MAX_SIDE,
            scaleSteps: FINAL_GEOMETRY_SCALE_STEPS,
          }
        : {
            inputBuffer,
            maxBytes: SOCIAL_FEED_MAX_BYTES,
            startQuality: 88,
            minQuality: 50,
            maxSide: SOCIAL_FEED_NATIVE_MAX_SIDE,
            scaleSteps: FINAL_GEOMETRY_SCALE_STEPS,
          },
  ).catch(() => null);

  if (!result) {
    throw new Error("final_geometry_optimization_failed");
  }

  const outputRatio =
    result.width > 0 && result.height > 0 ? result.width / result.height : null;
  if (sourceRatio && outputRatio) {
    const relativeDrift = Math.abs(outputRatio - sourceRatio) / sourceRatio;
    if (relativeDrift > FINAL_GEOMETRY_RATIO_EPSILON) {
      throw new Error("final_geometry_ratio_drift");
    }
  }

  return { ...result, strategy: "geometry-locked" };
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
    strategy: "safe-frame",
  };
}

async function optimizeForInstagramSafeFrame(
  inputBuffer: Buffer,
): Promise<OptimizeResult> {
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

export async function optimizeForInstagram(
  inputBuffer: Buffer,
): Promise<OptimizeResult> {
  const native = await createNativeJpeg({
    inputBuffer,
    maxBytes: INSTAGRAM_MAX_BYTES,
    startQuality: 88,
    minQuality: 50,
    maxWidth: INSTAGRAM_NATIVE_MAX_WIDTH,
    minWidth: INSTAGRAM_NATIVE_MIN_WIDTH,
    ratioMin: INSTAGRAM_NATIVE_MIN_RATIO,
    ratioMax: INSTAGRAM_NATIVE_MAX_RATIO,
  }).catch(() => null);

  if (native) return native;
  return optimizeForInstagramSafeFrame(inputBuffer);
}

async function optimizeForSocialFeedSafeFrame(
  inputBuffer: Buffer,
): Promise<OptimizeResult> {
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

export async function optimizeForSocialFeed(
  inputBuffer: Buffer,
  options?: { nativeFirst?: boolean },
): Promise<OptimizeResult> {
  if (options?.nativeFirst) {
    const native = await createNativeJpeg({
      inputBuffer,
      maxBytes: SOCIAL_FEED_MAX_BYTES,
      startQuality: 88,
      minQuality: 50,
      maxSide: SOCIAL_FEED_NATIVE_MAX_SIDE,
    }).catch(() => null);

    if (native) return native;
  }

  return optimizeForSocialFeedSafeFrame(inputBuffer);
}

export async function optimizeForSiteCard(
  inputBuffer: Buffer,
): Promise<OptimizeResult> {
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

async function optimizeForGoogleBusinessSafeFrame(
  inputBuffer: Buffer,
): Promise<OptimizeResult> {
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

export async function optimizeForGoogleBusiness(
  inputBuffer: Buffer,
): Promise<OptimizeResult> {
  const native = await createNativeJpeg({
    inputBuffer,
    maxBytes: GMB_MAX_BYTES,
    startQuality: 88,
    minQuality: 50,
    maxSide: GMB_NATIVE_MAX_SIDE,
  }).catch(() => null);

  if (native) return native;
  return optimizeForGoogleBusinessSafeFrame(inputBuffer);
}
