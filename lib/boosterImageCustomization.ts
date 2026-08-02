export type BoosterImageCustomizationScope<TTransform = unknown> = {
  imageKeys: string[];
  transforms: Record<string, TTransform>;
  customizedImageKeys: string[];
  usedSelectionFallback: boolean;
};

function normalizeImageKey(value: unknown): string {
  return String(value || "").trim();
}

function uniqueImageKeys(values: readonly unknown[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const key = normalizeImageKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(key);
    if (result.length >= limit) break;
  }

  return result;
}

/**
 * Resolves the exact image scope selected for one publication channel.
 *
 * Important invariants:
 * - requested order is preserved;
 * - a partial selection stays partial instead of silently restoring all media;
 * - stale keys are ignored;
 * - a completely stale/absent selection falls back to the available media so
 *   older drafts remain publishable;
 * - Adapter provenance is kept only for the exact selected media keys.
 */
export function normalizeBoosterImageCustomizationScope<TTransform>(params: {
  availableImageKeys: readonly unknown[];
  requestedImageKeys?: readonly unknown[] | null;
  transforms?: Record<string, TTransform> | null;
  customizedImageKeys?: readonly unknown[] | null;
  maxImages?: number;
  fallbackToAvailableWhenSelectionEmpty?: boolean;
}): BoosterImageCustomizationScope<TTransform> {
  const maxImages = Math.max(1, Math.floor(Number(params.maxImages) || 5));
  const availableImageKeys = uniqueImageKeys(params.availableImageKeys, maxImages);
  const availableSet = new Set(availableImageKeys);
  const requestedImageKeys = uniqueImageKeys(
    params.requestedImageKeys || [],
    maxImages,
  ).filter((key) => availableSet.has(key));

  const hasRequestedSelection = Array.isArray(params.requestedImageKeys)
    ? params.requestedImageKeys.some((value) => Boolean(normalizeImageKey(value)))
    : false;
  const fallbackToAvailableWhenSelectionEmpty =
    params.fallbackToAvailableWhenSelectionEmpty !== false;
  const shouldFallback =
    !requestedImageKeys.length && fallbackToAvailableWhenSelectionEmpty;
  const imageKeys = requestedImageKeys.length
    ? requestedImageKeys
    : shouldFallback
      ? availableImageKeys
      : [];
  const selectedSet = new Set(imageKeys);

  const sourceTransforms = params.transforms || {};
  const transforms = Object.fromEntries(
    imageKeys.flatMap((imageKey) => {
      const transform = sourceTransforms[imageKey];
      return transform === undefined ? [] : [[imageKey, transform] as const];
    }),
  ) as Record<string, TTransform>;

  const customizedImageKeys = uniqueImageKeys(
    params.customizedImageKeys || [],
    maxImages,
  ).filter((key) => selectedSet.has(key));

  return {
    imageKeys,
    transforms,
    customizedImageKeys,
    usedSelectionFallback: shouldFallback && hasRequestedSelection,
  };
}

export function isBoosterImageExplicitlyCustomized(
  customizedImageKeys: readonly unknown[] | null | undefined,
  imageKey: unknown,
): boolean {
  const normalizedImageKey = normalizeImageKey(imageKey);
  if (!normalizedImageKey || !Array.isArray(customizedImageKeys)) return false;
  return customizedImageKeys.some(
    (value) => normalizeImageKey(value) === normalizedImageKey,
  );
}
