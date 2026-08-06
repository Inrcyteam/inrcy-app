export type VideoPreparationIssue = {
  channel?: unknown;
  reason?: unknown;
  message?: unknown;
};

type VideoPreparationResult = {
  ok?: unknown;
  status?: unknown;
  invalidSignatures?: unknown;
  invalidChannels?: unknown;
};

const NON_RECOVERABLE_VIDEO_REASONS = new Set([
  "video_duration_too_short",
  "video_duration_too_long",
  "video_duration_account_limit_unknown",
  "video_duration_long_upload_not_allowed",
]);

/**
 * A missing/invalid publication variant must be regenerated once before the
 * publication is rejected. Only hard duration constraints are known to remain
 * invalid after another technical preparation attempt because iNrCy never
 * trims the professional's video silently.
 */
export function shouldRetryVideoVariantGeneration(
  issues: readonly VideoPreparationIssue[] | null | undefined,
) {
  if (!issues?.length) return true;
  return issues.some((issue) => {
    const reason = String(issue?.reason || "").trim();
    return !NON_RECOVERABLE_VIDEO_REASONS.has(reason);
  });
}

export function isVideoPreparationReady(value: unknown) {
  const result = (value || {}) as VideoPreparationResult;
  return Boolean(
    value &&
      result.ok !== false &&
      result.status === "ready" &&
      (!Array.isArray(result.invalidSignatures) ||
        result.invalidSignatures.length === 0),
  );
}

/**
 * A partial prewarm response is safe to continue only when every reported
 * problem belongs to an identified channel. The publish endpoint can then
 * terminalise those channels independently while dispatching the valid ones.
 */
export function canContinueWithIsolatedVideoPreparationFailures(
  value: unknown,
) {
  const result = (value || {}) as VideoPreparationResult;
  if (result.status !== "partial" || !Array.isArray(result.invalidChannels)) {
    return false;
  }
  return (
    result.invalidChannels.length > 0 &&
    result.invalidChannels.every((issue) =>
      Boolean(
        issue &&
          typeof issue === "object" &&
          String((issue as VideoPreparationIssue).channel || "").trim(),
      ),
    )
  );
}
