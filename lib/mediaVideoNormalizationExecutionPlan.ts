import {
  BOOSTER_VIDEO_PREPARATION_KEYS,
  type BoosterPreparationMission,
} from "./boosterMediaPipelineMissions.ts";
import type { VideoNormalizationVariantKey } from "./mediaVideoNormalizationPolicy.ts";

const AI_PREPARATION_OUTPUTS = new Set<VideoNormalizationVariantKey>(
  BOOSTER_VIDEO_PREPARATION_KEYS.ai_preparation,
);
const AI_EXCLUSIVE_OUTPUTS = new Set<VideoNormalizationVariantKey>(
  BOOSTER_VIDEO_PREPARATION_KEYS.ai_preparation.filter(
    (key) => key !== "thumbnail",
  ),
);

/**
 * Produces exactly one bounded worker stage from the complete durable request.
 * A heavy source is canonicalized first so captures/audio and every publisher
 * subsequently consume the same light master. Light sources keep the former
 * low-latency AI-first path.
 */
export function planVideoNormalizationExecution(params: {
  mission: BoosterPreparationMission | null;
  requestedKeys: readonly VideoNormalizationVariantKey[];
  readyKeys: ReadonlySet<VideoNormalizationVariantKey>;
  requiresCanonicalFirst?: boolean;
}) {
  const pendingKeys = params.requestedKeys.filter(
    (key) => !params.readyKeys.has(key),
  );
  const canonicalPending = pendingKeys.includes("canonical");
  const derivativePending = pendingKeys.some((key) => key !== "canonical");
  const aiDerivativesPending = pendingKeys.some((key) =>
    AI_EXCLUSIVE_OUTPUTS.has(key),
  );

  if (
    params.requiresCanonicalFirst &&
    canonicalPending &&
    derivativePending
  ) {
    return {
      mission: "publication_preparation" as const,
      keys: ["canonical"] as VideoNormalizationVariantKey[],
      continuesWithPendingOutputs: true,
    };
  }

  if (canonicalPending && aiDerivativesPending) {
    return {
      mission: "ai_preparation" as const,
      keys: pendingKeys.filter((key) => AI_PREPARATION_OUTPUTS.has(key)),
      continuesWithPendingOutputs: true,
    };
  }

  return {
    mission: params.mission,
    keys: [...params.requestedKeys],
    continuesWithPendingOutputs: false,
  };
}
