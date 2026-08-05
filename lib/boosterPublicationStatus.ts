export const BOOSTER_PENDING_PUBLICATION_STATUSES = Object.freeze([
  "queued",
  "preparing",
  "dispatching",
  "processing",
  "finalizing",
  "pending",
] as const);

const PENDING_PUBLICATION_STATUS_SET = new Set<string>(
  BOOSTER_PENDING_PUBLICATION_STATUSES,
);

export function isBoosterPublicationPendingStatus(value: unknown) {
  return PENDING_PUBLICATION_STATUS_SET.has(
    String(value || "").trim().toLowerCase(),
  );
}
