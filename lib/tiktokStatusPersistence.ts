type JsonRecord = Record<string, unknown>;

const BOOLEAN_RESULT_FIELDS = new Set([
  "ok",
  "cancelled",
  "warning",
  "tiktok_status_fetch_failed",
  "tiktok_stalled",
  "tiktok_status_retryable",
]);

const NUMBER_RESULT_FIELDS = new Set([
  "tiktok_uploaded_bytes",
  "tiktok_downloaded_bytes",
]);

const MEANINGFUL_RESULT_FIELDS = [
  "ok",
  "status",
  "cancelled",
  "cancelled_at",
  "error",
  "warning",
  "external_id",
  "share_url",
  "external_url",
  "tiktok_status",
  "tiktok_submitted_at",
  "tiktok_status_progress_at",
  "tiktok_status_fetch_failed",
  "tiktok_status_fetch_error",
  "tiktok_fail_reason",
  "tiktok_provider_error_code",
  "tiktok_uploaded_bytes",
  "tiktok_downloaded_bytes",
  "tiktok_public_post_ids",
  "tiktok_stalled",
  "tiktok_status_retryable",
] as const;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function normalizedText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizedNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizedStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((entry) => String(entry || "").trim()).filter(Boolean)),
  ).sort();
}

function meaningfulFieldValue(field: string, value: unknown) {
  if (field === "tiktok_public_post_ids") return normalizedStringArray(value);
  if (BOOLEAN_RESULT_FIELDS.has(field)) {
    return value === null || value === undefined ? null : Boolean(value);
  }
  if (NUMBER_RESULT_FIELDS.has(field)) return normalizedNumber(value);
  return normalizedText(value);
}

export function meaningfulTiktokResultSnapshot(resultLike: unknown) {
  const result = asRecord(resultLike);
  return Object.fromEntries(
    MEANINGFUL_RESULT_FIELDS.map((field) => [
      field,
      meaningfulFieldValue(field, result[field]),
    ]),
  );
}

/**
 * Check timestamps are intentionally excluded. A poll that only proves that
 * TikTok is still in the exact same state must remain a database no-op.
 */
export function hasMeaningfulTiktokResultChange(
  currentLike: unknown,
  nextLike: unknown,
) {
  return (
    JSON.stringify(meaningfulTiktokResultSnapshot(currentLike)) !==
    JSON.stringify(meaningfulTiktokResultSnapshot(nextLike))
  );
}

export function shouldUpdateTiktokDelivery(
  currentLike: unknown,
  nextStatusLike: unknown,
  nextErrorLike: unknown,
) {
  if (!currentLike || typeof currentLike !== "object") return false;
  const current = asRecord(currentLike);
  const currentStatus = String(current.status || "").trim().toLowerCase();
  if (!currentStatus || currentStatus === "deleted") return false;

  const nextStatus = String(nextStatusLike || "").trim().toLowerCase();
  return (
    currentStatus !== nextStatus ||
    normalizedText(current.error) !== normalizedText(nextErrorLike)
  );
}
