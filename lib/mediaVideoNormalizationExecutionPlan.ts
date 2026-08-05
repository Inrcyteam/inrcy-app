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
 * Produces one bounded worker stage from the complete durable request.
 * Captures/audio deliberately precede a pending canonical MP4 so a large
 * transcode can never starve the inexpensive AI context. The caller keeps the
 * complete request and requeues the same job for the publication stage.
 */
export function planVideoNormalizationExecution(params: {
  mission: BoosterPreparationMission | null;
  requestedKeys: readonly VideoNormalizationVariantKey[];
  readyKeys: ReadonlySet<VideoNormalizationVariantKey>;
}) {
  const pendingKeys = params.requestedKeys.filter(
    (key) => !params.readyKeys.has(key),
  );
  const canonicalPending = pendingKeys.includes("canonical");
  const aiDerivativesPending = pendingKeys.some((key) =>
    AI_EXCLUSIVE_OUTPUTS.has(key),
  );

  if (canonicalPending && aiDerivativesPending) {
    return {
      mission: "ai_preparation" as const,
      keys: pendingKeys.filter((key) => AI_PREPARATION_OUTPUTS.has(key)),
      continuesWithPublication: true,
    };
  }

  return {
    mission: params.mission,
    keys: [...params.requestedKeys],
    continuesWithPublication: false,
  };
}
