import type { VideoNormalizationVariantKey } from "./mediaVideoNormalizationPolicy.ts";

export type VideoNormalizationFailureStatus =
  | "queued"
  | "retry_wait"
  | "failed";

/**
 * A claimed job contains the complete durable request. The worker may execute
 * only one prerequisite stage (for example `canonical`) from that request.
 * Consequently, only outputs absent from the claim snapshot are a genuinely
 * late mission; outputs merely deferred to the next stage must keep the
 * current attempt/backoff.
 */
export function planVideoNormalizationFailure(params: {
  claimedKeys: readonly VideoNormalizationVariantKey[];
  latestKeys: readonly VideoNormalizationVariantKey[];
  retryableError: boolean;
  attemptCount: number;
  maxAttempts: number;
}) {
  const claimed = new Set(params.claimedKeys);
  const addedKeys = Array.from(
    new Set(params.latestKeys.filter((key) => !claimed.has(key))),
  );
  const hasLateRequest = addedKeys.length > 0;
  const exhausted = params.attemptCount >= params.maxAttempts;
  const status: VideoNormalizationFailureStatus = hasLateRequest
    ? "queued"
    : params.retryableError && !exhausted
      ? "retry_wait"
      : "failed";

  return {
    status,
    addedKeys,
    hasLateRequest,
    attemptCount: hasLateRequest ? 0 : params.attemptCount,
  };
}
