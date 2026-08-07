import {
  BOOSTER_VIDEO_PREPARATION_KEYS,
  type BoosterPreparationMission,
} from "./boosterMediaPipelineMissions.ts";
import type { VideoNormalizationVariantKey } from "./mediaVideoNormalizationPolicy.ts";

const AI_PREPARATION_OUTPUTS = new Set<VideoNormalizationVariantKey>(
  BOOSTER_VIDEO_PREPARATION_KEYS.ai_preparation,
);
const ACTIVE_PREPARATION_OUTPUTS = new Set<VideoNormalizationVariantKey>([
  ...BOOSTER_VIDEO_PREPARATION_KEYS.ai_preparation,
  ...BOOSTER_VIDEO_PREPARATION_KEYS.publication_preparation,
]);

/**
 * Produces one bounded preparation stage from the original accepted video.
 * Publication may request a canonical MP4 when the original failed the server
 * compatibility proof; AI preparation keeps using lightweight outputs.
 */
export function planVideoNormalizationExecution(params: {
  mission: BoosterPreparationMission | null;
  requestedKeys: readonly VideoNormalizationVariantKey[];
  readyKeys: ReadonlySet<VideoNormalizationVariantKey>;
}) {
  const pendingKeys = params.requestedKeys.filter(
    (key) =>
      ACTIVE_PREPARATION_OUTPUTS.has(key) && !params.readyKeys.has(key),
  );

  return {
    mission: params.mission,
    keys:
      params.mission === "ai_preparation"
        ? pendingKeys.filter((key) => AI_PREPARATION_OUTPUTS.has(key))
        : pendingKeys,
    continuesWithPendingOutputs: false,
  };
}
