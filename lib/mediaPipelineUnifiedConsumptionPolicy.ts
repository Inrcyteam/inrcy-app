/**
 * Étape 7 — consommation unifiée du workspace média.
 *
 * Le flag serveur autorise les routes à lire les variantes normalisées depuis
 * le registre universel. Le flag public autorise Booster à joindre la référence
 * du workspace à Générer / Publier / Programmer. Les transports historiques
 * restent présents jusqu'à l'étape 8 comme filet de sécurité.
 */

export const MEDIA_PIPELINE_UNIFIED_CONSUMPTION_VERSION = 1;

export const MEDIA_PIPELINE_UNIFIED_PURPOSES = [
  "ai",
  "publish",
  "schedule",
] as const;

export type MediaPipelineUnifiedPurpose =
  (typeof MEDIA_PIPELINE_UNIFIED_PURPOSES)[number];

export function isUnifiedMediaConsumptionEnabled() {
  return process.env.MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1 === "true";
}

export function isUnifiedMediaConsumptionClientEnabled() {
  return (
    process.env.NEXT_PUBLIC_MEDIA_PIPELINE_UPLOADS_V1 === "true" &&
    process.env.NEXT_PUBLIC_MEDIA_PIPELINE_WORKSPACE_V1 === "true" &&
    process.env.NEXT_PUBLIC_MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1 === "true"
  );
}

export function isMediaPipelineUnifiedPurpose(
  value: unknown,
): value is MediaPipelineUnifiedPurpose {
  return MEDIA_PIPELINE_UNIFIED_PURPOSES.includes(
    String(value || "") as MediaPipelineUnifiedPurpose,
  );
}
