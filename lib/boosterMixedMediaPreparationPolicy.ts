export function normalizeAsyncPreparationAttempt(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(1, Math.floor(numeric)) : 1;
}

export function resolveChannelDispatchMediaType(
  mediaMode: unknown,
): "video" | "images" {
  return mediaMode === "video" ? "video" : "images";
}

export function shouldDeferMixedVideoPreparation(params: {
  internalAsyncPreparationDispatch: boolean;
  preparationAttempt: unknown;
  imageChannelCount: number;
  videoChannelCount: number;
}) {
  const preparationAttempt = normalizeAsyncPreparationAttempt(
    params.preparationAttempt,
  );
  return Boolean(
    params.internalAsyncPreparationDispatch &&
      preparationAttempt === 1 &&
      params.imageChannelCount > 0 &&
      params.videoChannelCount > 0,
  );
}
