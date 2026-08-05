export function shouldDeferMixedVideoPreparation(params: {
  internalAsyncPreparationDispatch: boolean;
  preparationAttempt: unknown;
  imageChannelCount: number;
  videoChannelCount: number;
}) {
  const preparationAttempt = Math.max(
    1,
    Math.floor(Number(params.preparationAttempt || 1)),
  );
  return Boolean(
    params.internalAsyncPreparationDispatch &&
      preparationAttempt === 1 &&
      params.imageChannelCount > 0 &&
      params.videoChannelCount > 0,
  );
}

