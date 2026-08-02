export type VideoPreparationIssue = {
  reason?: unknown;
  message?: unknown;
};

const NON_RECOVERABLE_VIDEO_REASONS = new Set([
  "video_duration_too_short",
  "video_duration_too_long",
]);

/**
 * A missing/invalid publication variant must be regenerated once before the
 * publication is rejected. Only hard duration constraints are known to remain
 * invalid after a transcode because iNrCy never trims the professional's video
 * silently.
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
