/**
 * Contrats du registre média universel iNrCy.
 *
 * Étape 2 : ce module décrit le modèle cible sans modifier les parcours runtime
 * de Booster. Les prochaines étapes l'utiliseront pour l'upload, le worker et
 * l'unification Générer / Programmer / Publier.
 */

export const MEDIA_UPLOAD_STATUSES = [
  "pending",
  "uploading",
  "uploaded",
  "failed",
  "removed",
] as const;

export const MEDIA_PROCESSING_STATUSES = [
  "not_requested",
  "queued",
  "processing",
  "ready",
  "failed_retryable",
  "failed_terminal",
] as const;

export const MEDIA_PUBLICATION_STATUSES = [
  "legacy_ready",
  "not_requested",
  "processing",
  "ready",
  "failed",
  "removed",
] as const;

export const PUBLICATION_WORKSPACE_STATUSES = [
  "draft",
  "active",
  "waiting_media",
  "ready",
  "scheduled",
  "publishing",
  "published",
  "failed",
  "archived",
] as const;

export const MEDIA_VARIANT_STATUSES = [
  "pending",
  "processing",
  "ready",
  "failed",
  "removed",
] as const;

export const MEDIA_PROCESSING_JOB_STATUSES = [
  "queued",
  "processing",
  "retry_wait",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export const MEDIA_PIPELINE_PURPOSES = ["ai", "publish", "schedule"] as const;
export const UNIVERSAL_MEDIA_TYPES = ["image", "video"] as const;

export const MEDIA_WORKSPACE_MAX_IMAGES = 5;
export const MEDIA_WORKSPACE_MAX_VIDEOS = 1;
export const LEGACY_MEDIA_PIPELINE_VERSION = 0;
export const UNIVERSAL_MEDIA_PIPELINE_VERSION = 1;

export type MediaUploadStatus = (typeof MEDIA_UPLOAD_STATUSES)[number];
export type MediaProcessingStatus = (typeof MEDIA_PROCESSING_STATUSES)[number];
export type MediaPublicationStatus = (typeof MEDIA_PUBLICATION_STATUSES)[number];
export type PublicationWorkspaceStatus =
  (typeof PUBLICATION_WORKSPACE_STATUSES)[number];
export type MediaVariantStatus = (typeof MEDIA_VARIANT_STATUSES)[number];
export type MediaProcessingJobStatus =
  (typeof MEDIA_PROCESSING_JOB_STATUSES)[number];
export type MediaPipelinePurpose = (typeof MEDIA_PIPELINE_PURPOSES)[number];
export type UniversalMediaType = (typeof UNIVERSAL_MEDIA_TYPES)[number];

export type JsonObject = Readonly<Record<string, unknown>>;

export interface UniversalMediaRecord {
  readonly id: string;
  readonly accountId: string;
  readonly mediaType: UniversalMediaType;
  readonly uploadStatus: MediaUploadStatus;
  readonly uploadProgress: number;
  readonly processingStatus: MediaProcessingStatus;
  readonly publicationStatus: MediaPublicationStatus;
  readonly processingProgress: number;
  readonly pipelineVersion: number;
  readonly originalStoragePath: string;
  readonly canonicalStoragePath: string | null;
  readonly aiStatus: "ready" | "partial" | "unavailable" | null;
}

export interface PublicationWorkspaceRecord {
  readonly id: string;
  readonly accountId: string;
  readonly status: PublicationWorkspaceStatus;
  readonly selectedChannels: readonly string[];
  readonly revision: number;
  readonly generatedContent: JsonObject;
}

export interface PublicationWorkspaceMediaRecord {
  readonly workspaceId: string;
  readonly mediaId: string;
  readonly mediaType: UniversalMediaType;
  readonly position: number;
  readonly mediaSettings: JsonObject;
  readonly channelSettings: JsonObject;
}

export interface MediaVariantRecord {
  readonly id: string;
  readonly accountId: string;
  readonly mediaId: string;
  readonly workspaceId: string | null;
  readonly purpose: string;
  readonly channel: string | null;
  readonly signature: string | null;
  readonly status: MediaVariantStatus;
  readonly storagePath: string | null;
  readonly pipelineVersion: number;
}

export interface MediaProcessingJobRecord {
  readonly id: string;
  readonly accountId: string;
  readonly mediaId: string;
  readonly workspaceId: string | null;
  readonly variantId: string | null;
  readonly jobType: string;
  readonly status: MediaProcessingJobStatus;
  readonly progress: number;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly idempotencyKey: string | null;
}

export type WorkspaceMediaContractResult =
  | { readonly ok: true; readonly mediaType: UniversalMediaType | null }
  | { readonly ok: false; readonly code: string; readonly message: string };

/**
 * Contrat produit global : un workspace accepte au maximum cinq images OU une
 * seule vidéo. Le mélange images / vidéo est volontairement interdit.
 */
export function validateWorkspaceMediaContract(
  mediaTypes: readonly UniversalMediaType[],
): WorkspaceMediaContractResult {
  if (mediaTypes.length === 0) {
    return { ok: true, mediaType: null };
  }

  const imageCount = mediaTypes.filter((type) => type === "image").length;
  const videoCount = mediaTypes.filter((type) => type === "video").length;

  if (imageCount > 0 && videoCount > 0) {
    return {
      ok: false,
      code: "mixed_media_not_allowed",
      message: "Un contenu accepte soit des images, soit une vidéo.",
    };
  }

  if (imageCount > MEDIA_WORKSPACE_MAX_IMAGES) {
    return {
      ok: false,
      code: "too_many_images",
      message: `Un contenu accepte au maximum ${MEDIA_WORKSPACE_MAX_IMAGES} images.`,
    };
  }

  if (videoCount > MEDIA_WORKSPACE_MAX_VIDEOS) {
    return {
      ok: false,
      code: "too_many_videos",
      message: "Un contenu accepte une seule vidéo.",
    };
  }

  return { ok: true, mediaType: videoCount === 1 ? "video" : "image" };
}

/**
 * Indique si le média peut être réutilisé sans nouvel upload pour le besoin
 * demandé. Les médias historiques restent publiables via legacy_ready.
 */
export function isMediaReadyForPurpose(
  media: Pick<
    UniversalMediaRecord,
    "uploadStatus" | "aiStatus" | "publicationStatus"
  >,
  purpose: MediaPipelinePurpose,
): boolean {
  if (media.uploadStatus !== "uploaded") return false;

  if (purpose === "ai") {
    return media.aiStatus === "ready" || media.aiStatus === "partial";
  }

  return (
    media.publicationStatus === "ready" ||
    media.publicationStatus === "legacy_ready"
  );
}

export function isMediaProcessingTerminal(
  status: MediaProcessingStatus,
): boolean {
  return (
    status === "ready" ||
    status === "failed_retryable" ||
    status === "failed_terminal"
  );
}

export function isMediaJobTerminal(status: MediaProcessingJobStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

export function clampMediaProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}
