/**
 * Étape 8 — bascule stricte hors des transports média historiques.
 *
 * Ce flag n'est valide que si l'upload universel, le workspace persistant et
 * la consommation unifiée sont déjà activés. En mode bascule, Générer,
 * Publier, Programmer et les brouillons transportent uniquement la référence
 * du workspace et les réglages légers. Aucun binaire média n'est renvoyé par
 * le navigateur vers les anciennes routes Booster.
 */

export const MEDIA_PIPELINE_LEGACY_CUTOVER_VERSION = 1;

function isTrue(value: unknown) {
  return value === "true";
}

export function isLegacyMediaTransportCutoverEnabled() {
  return (
    isTrue(process.env.MEDIA_PIPELINE_UPLOADS_V1) &&
    isTrue(process.env.MEDIA_PIPELINE_WORKSPACE_V1) &&
    isTrue(process.env.MEDIA_PIPELINE_IMAGE_NORMALIZATION_V1) &&
    isTrue(process.env.MEDIA_PIPELINE_VIDEO_NORMALIZATION_V1) &&
    isTrue(process.env.MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1) &&
    isTrue(process.env.MEDIA_PIPELINE_LEGACY_CUTOVER_V1)
  );
}

export function isLegacyMediaTransportCutoverClientEnabled() {
  return (
    isTrue(process.env.NEXT_PUBLIC_MEDIA_PIPELINE_UPLOADS_V1) &&
    isTrue(process.env.NEXT_PUBLIC_MEDIA_PIPELINE_WORKSPACE_V1) &&
    isTrue(process.env.NEXT_PUBLIC_MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1) &&
    isTrue(process.env.NEXT_PUBLIC_MEDIA_PIPELINE_LEGACY_CUTOVER_V1)
  );
}
