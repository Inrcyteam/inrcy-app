export const PINTEREST_MIN_IMAGE_RATIO = 2 / 3;
export const PINTEREST_CAROUSEL_BASE_WIDTH = 1000;
const PINTEREST_RATIO_EPSILON = 1e-9;

export type PinterestImageMetadataLike = {
  width?: number | null;
  height?: number | null;
  orientation?: number | null;
};

export type PinterestVisualGeometry = {
  width: number;
  height: number;
  ratio: number;
  ratioKey: string;
};

export type PinterestCarouselGeometryPlan = {
  harmonize: boolean;
  reason: "single_image" | "already_uniform" | "mixed_ratios" | "first_image_too_tall";
  targetRatio: number | null;
  targetWidth: number | null;
  targetHeight: number | null;
  geometries: PinterestVisualGeometry[];
};

function greatestCommonDivisor(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y > 0) {
    const remainder = x % y;
    x = y;
    y = remainder;
  }
  return x || 1;
}

/**
 * Returns the visual dimensions after applying the EXIF orientation.
 * Sharp exposes the encoded dimensions and the orientation separately, so
 * rotations 5 to 8 must swap the axes before ratios are compared.
 */
export function getPinterestVisualGeometry(
  metadata: PinterestImageMetadataLike,
): PinterestVisualGeometry | null {
  const encodedWidth = Math.round(Number(metadata.width || 0));
  const encodedHeight = Math.round(Number(metadata.height || 0));
  if (encodedWidth <= 0 || encodedHeight <= 0) return null;

  const orientation = Math.round(Number(metadata.orientation || 1));
  const swapsAxes = orientation >= 5 && orientation <= 8;
  const width = swapsAxes ? encodedHeight : encodedWidth;
  const height = swapsAxes ? encodedWidth : encodedHeight;
  const divisor = greatestCommonDivisor(width, height);

  return {
    width,
    height,
    ratio: width / height,
    ratioKey: `${Math.round(width / divisor)}:${Math.round(height / divisor)}`,
  };
}

function getRatioAdaptationLoss(sourceRatio: number, targetRatio: number): number {
  if (sourceRatio > targetRatio) return 1 - targetRatio / sourceRatio;
  return 1 - sourceRatio / targetRatio;
}

function chooseBestCommonRatio(
  geometries: readonly PinterestVisualGeometry[],
): number {
  const candidates = Array.from(
    new Set(
      geometries.map((geometry) =>
        Math.max(geometry.ratio, PINTEREST_MIN_IMAGE_RATIO),
      ),
    ),
  );

  const scored = candidates.map((candidate) => {
    const totalLoss = geometries.reduce(
      (sum, geometry) => sum + getRatioAdaptationLoss(geometry.ratio, candidate),
      0,
    );
    const exactMatches = geometries.filter(
      (geometry) => Math.abs(geometry.ratio - candidate) <= PINTEREST_RATIO_EPSILON,
    ).length;

    return { candidate, totalLoss, exactMatches };
  });

  scored.sort((left, right) => {
    const lossDelta = left.totalLoss - right.totalLoss;
    if (Math.abs(lossDelta) > PINTEREST_RATIO_EPSILON) return lossDelta;
    if (left.exactMatches !== right.exactMatches) {
      return right.exactMatches - left.exactMatches;
    }
    return left.candidate - right.candidate;
  });

  return scored[0]?.candidate || PINTEREST_MIN_IMAGE_RATIO;
}

/**
 * Pinterest requires every item of a multiple_image_urls Pin to use the exact
 * same width/height ratio. When a correction is required, iNrCy evaluates all
 * source ratios and selects the common format that minimizes the total visual
 * alteration across the whole carousel. Very tall images still respect the
 * existing Pinterest floor of 2:3.
 */
export function buildPinterestCarouselGeometryPlan(
  metadataList: readonly PinterestImageMetadataLike[],
): PinterestCarouselGeometryPlan {
  const geometries = metadataList
    .map(getPinterestVisualGeometry)
    .filter((value): value is PinterestVisualGeometry => Boolean(value));

  if (geometries.length !== metadataList.length) {
    throw new Error("Impossible de lire les dimensions d’une image Pinterest.");
  }

  if (geometries.length <= 1) {
    return {
      harmonize: false,
      reason: "single_image",
      targetRatio: geometries[0]?.ratio || null,
      targetWidth: null,
      targetHeight: null,
      geometries,
    };
  }

  const first = geometries[0];
  const firstTooTall = first.ratio < PINTEREST_MIN_IMAGE_RATIO;
  const alreadyUniform = geometries.every(
    (geometry) => geometry.ratioKey === first.ratioKey,
  );

  if (alreadyUniform && !firstTooTall) {
    return {
      harmonize: false,
      reason: "already_uniform",
      targetRatio: first.ratio,
      targetWidth: null,
      targetHeight: null,
      geometries,
    };
  }

  const targetRatio = chooseBestCommonRatio(geometries);
  const targetWidth = PINTEREST_CAROUSEL_BASE_WIDTH;
  const targetHeight = Math.max(
    1,
    Math.ceil(targetWidth / targetRatio - 1e-9),
  );

  return {
    harmonize: true,
    reason: firstTooTall ? "first_image_too_tall" : "mixed_ratios",
    targetRatio,
    targetWidth,
    targetHeight,
    geometries,
  };
}
