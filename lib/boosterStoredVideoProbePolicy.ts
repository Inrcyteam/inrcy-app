const LEGACY_BOOSTER_BUCKET = "booster";

export type StoredVideoProbeRegistryIdentity = {
  user_id?: unknown;
  bucket_name?: unknown;
  storage_path?: unknown;
  media_type?: unknown;
  upload_status?: unknown;
};

export type StoredVideoProbeAuthorization = {
  bucket: string;
  storagePath: string;
  urlMode: "public" | "signed";
  registryAuthorized: boolean;
};

function normalizeBucket(value: unknown) {
  const bucket = String(value || LEGACY_BOOSTER_BUCKET).trim();
  return /^[a-zA-Z0-9_-]{1,80}$/.test(bucket) ? bucket : "";
}

function normalizeStoragePath(value: unknown) {
  const storagePath = String(value || "")
    .replace(/\\/g, "/")
    .replace(/\u0000/g, "")
    .replace(/^\/+/, "")
    .trim();
  return storagePath && !storagePath.includes("..") ? storagePath : "";
}

function normalizeLegacyAccountSegment(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/[-_]{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .replace(/\./g, "-");
}

/**
 * Authorizes a durable video source before Storage produces any usable URL.
 *
 * Private buckets are accepted only through an exact, uploaded video row
 * owned by the account. The historical public Booster bucket keeps its
 * account-prefixed fallback for sources created before the media registry.
 */
export function authorizeStoredVideoProbeSource(params: {
  accountId: string;
  bucket?: unknown;
  storagePath?: unknown;
  registryRow?: StoredVideoProbeRegistryIdentity | null;
}): StoredVideoProbeAuthorization {
  const accountId = String(params.accountId || "").trim();
  const bucket = normalizeBucket(params.bucket);
  const storagePath = normalizeStoragePath(params.storagePath);
  if (!accountId || !bucket || !storagePath) {
    throw new Error("video_fallback_storage_reference_untrusted");
  }

  const row = params.registryRow || null;
  const registryAuthorized = Boolean(
    row &&
      String(row.user_id || "").trim() === accountId &&
      normalizeBucket(row.bucket_name) === bucket &&
      normalizeStoragePath(row.storage_path) === storagePath &&
      String(row.media_type || "").trim() === "video" &&
      String(row.upload_status || "").trim() === "uploaded",
  );
  if (registryAuthorized) {
    return {
      bucket,
      storagePath,
      urlMode: bucket === LEGACY_BOOSTER_BUCKET ? "public" : "signed",
      registryAuthorized: true,
    };
  }

  const legacyAccountSegment = normalizeLegacyAccountSegment(accountId);
  if (
    bucket === LEGACY_BOOSTER_BUCKET &&
    legacyAccountSegment &&
    storagePath.startsWith(`${legacyAccountSegment}/`)
  ) {
    return {
      bucket,
      storagePath,
      urlMode: "public",
      registryAuthorized: false,
    };
  }

  throw new Error("video_fallback_storage_reference_untrusted");
}

