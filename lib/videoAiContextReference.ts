export const VIDEO_AI_CONTEXT_REFERENCE_SCHEMA_VERSION = 1 as const;

export type VideoAiContextReference = {
  schemaVersion: typeof VIDEO_AI_CONTEXT_REFERENCE_SCHEMA_VERSION;
  source: "pro_media_library";
  mediaAssetId: string;
  preparationVersion: number;
  sourceFingerprint: string;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function cleanMediaAssetId(value: unknown) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9_-]+/g, "")
    .slice(0, 160);
}

function cleanFingerprint(value: unknown) {
  const fingerprint = String(value || "").trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(fingerprint) ? fingerprint : "";
}

function cleanPreparationVersion(value: unknown) {
  const version = Number(value || 0);
  return Number.isInteger(version) && version > 0 && version <= 10_000
    ? version
    : 0;
}

export function normalizeVideoAiContextReference(
  value: unknown,
): VideoAiContextReference | null {
  const record = asRecord(value);
  if (!record) return null;

  const source = String(record.source || "").trim();
  const schemaVersion = Number(
    record.schemaVersion ?? record.schema_version ?? 0,
  );
  const mediaAssetId = cleanMediaAssetId(
    record.mediaAssetId ?? record.media_asset_id ?? record.mediaId,
  );
  const preparationVersion = cleanPreparationVersion(
    record.preparationVersion ??
      record.preparation_version ??
      record.videoAiContextVersion ??
      record.video_ai_context_version,
  );
  const sourceFingerprint = cleanFingerprint(
    record.sourceFingerprint ??
      record.source_fingerprint ??
      record.videoFingerprint ??
      record.video_fingerprint,
  );

  if (
    source !== "pro_media_library" ||
    schemaVersion !== VIDEO_AI_CONTEXT_REFERENCE_SCHEMA_VERSION ||
    !mediaAssetId ||
    !preparationVersion ||
    !sourceFingerprint
  ) {
    return null;
  }

  return {
    schemaVersion: VIDEO_AI_CONTEXT_REFERENCE_SCHEMA_VERSION,
    source: "pro_media_library",
    mediaAssetId,
    preparationVersion,
    sourceFingerprint,
  };
}

export function buildVideoAiContextReference(args: {
  mediaAssetId?: unknown;
  mediaSource?: unknown;
  preparationVersion?: unknown;
  sourceFingerprint?: unknown;
  persisted?: unknown;
}): VideoAiContextReference | null {
  if (args.persisted !== true) return null;

  return normalizeVideoAiContextReference({
    schemaVersion: VIDEO_AI_CONTEXT_REFERENCE_SCHEMA_VERSION,
    source: String(args.mediaSource || "").trim(),
    mediaAssetId: args.mediaAssetId,
    preparationVersion: args.preparationVersion,
    sourceFingerprint: args.sourceFingerprint,
  });
}

export function videoAiContextReferenceAliases(
  reference: VideoAiContextReference | null,
) {
  return reference
    ? {
        videoAiContextRef: reference,
        mediaAssetId: reference.mediaAssetId,
        videoAiContextVersion: reference.preparationVersion,
        videoFingerprint: reference.sourceFingerprint,
      }
    : {
        videoAiContextRef: null,
        mediaAssetId: null,
        videoAiContextVersion: null,
        videoFingerprint: null,
      };
}

function readVideoDraftStoragePath(value: unknown) {
  const record = asRecord(value);
  return String(record?.storagePath || record?.path || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim()
    .slice(0, 900);
}

export function preserveVideoAiContextReferenceOnDraftUpdate(args: {
  previousPayload: unknown;
  nextPayload: Record<string, unknown>;
}) {
  const previous = asRecord(args.previousPayload) || {};
  const next = args.nextPayload;
  const hasExplicitReference = Object.prototype.hasOwnProperty.call(
    next,
    "videoAiContextRef",
  );
  if (hasExplicitReference) return next;

  const previousVideoDraft = asRecord(previous.videoDraft);
  const nextVideoDraft = asRecord(next.videoDraft);
  const previousStoragePath = readVideoDraftStoragePath(previousVideoDraft);
  const nextStoragePath = readVideoDraftStoragePath(nextVideoDraft);

  if (
    !previousStoragePath ||
    !nextStoragePath ||
    previousStoragePath !== nextStoragePath
  ) {
    return next;
  }

  const reference =
    normalizeVideoAiContextReference(previous.videoAiContextRef) ||
    normalizeVideoAiContextReference(previousVideoDraft?.videoAiContextRef);
  if (!reference) return next;

  return {
    ...next,
    ...videoAiContextReferenceAliases(reference),
    videoDraft: nextVideoDraft
      ? {
          ...nextVideoDraft,
          ...videoAiContextReferenceAliases(reference),
        }
      : next.videoDraft,
  };
}
