export function normalizeAsyncPreparationAttempt(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(1, Math.floor(numeric)) : 1;
}

export function resolveChannelDispatchMediaType(
  mediaMode: unknown,
): "video" | "images" {
  return mediaMode === "video" ? "video" : "images";
}

/**
 * Une publication mixte photos + vidéo doit d'abord laisser le serveur
 * attester l'original vidéo. Si l'original est directement publiable, tous les
 * canaux partent ensemble. S'il faut réellement préparer la vidéo, la tentative
 * durable reste en préparation et aucun canal média n'est publié avant que les
 * médias soient prêts.
 */
export function shouldPrepareMixedMediaBeforeDispatch(params: {
  internalAsyncPreparationDispatch: boolean;
  preparationAttempt: unknown;
  imageChannelCount: number;
  videoChannelCount: number;
}) {
  return Boolean(
    params.internalAsyncPreparationDispatch &&
      params.imageChannelCount > 0 &&
      params.videoChannelCount > 0,
  );
}
