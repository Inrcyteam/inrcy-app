import {
  BOOSTER_VIDEO_PREPARATION_KEYS,
  type BoosterPreparationMission,
} from "./boosterMediaPipelineMissions.ts";
import type { VideoNormalizationVariantKey } from "./mediaVideoNormalizationPolicy.ts";

const VIDEO_NORMALIZATION_KEY_SET = new Set<string>(
  [
    ...BOOSTER_VIDEO_PREPARATION_KEYS.ai_preparation,
    ...BOOSTER_VIDEO_PREPARATION_KEYS.publication_preparation,
  ],
);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readMission(value: unknown): BoosterPreparationMission | null {
  return value === "ai_preparation" || value === "publication_preparation"
    ? value
    : null;
}

function readKeys(value: unknown): VideoNormalizationVariantKey[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter((item): item is VideoNormalizationVariantKey =>
          VIDEO_NORMALIZATION_KEY_SET.has(item),
        ),
    ),
  );
}

export function readVideoPreparationMission(
  payload: unknown,
): BoosterPreparationMission | null {
  return readMission(asRecord(payload).pipelineMission);
}

export function readRequestedVideoPreparationKeys(params: {
  payload: unknown;
  fallbackMission?: BoosterPreparationMission | null;
}) {
  const payload = asRecord(params.payload);
  const explicit = readKeys(payload.requiredOutputs);
  if (explicit.length) return explicit;

  const mission = readMission(payload.pipelineMission) || params.fallbackMission;
  return mission
    ? [...BOOSTER_VIDEO_PREPARATION_KEYS[mission]]
    : [...BOOSTER_VIDEO_PREPARATION_KEYS.ai_preparation];
}

/**
 * Conserve une demande de publication déjà enregistrée et fusionne les sorties.
 * L'enrichissement IA peut précéder la publication, mais ne doit jamais l'effacer
 * lorsqu'un nouvel appel idempotent réutilise le même job.
 */
export function mergeVideoPreparationRequest(params: {
  jobPayload: unknown;
  mediaMetadata: unknown;
  requestedMission: BoosterPreparationMission;
}) {
  const jobPayload = asRecord(params.jobPayload);
  const mediaMetadata = asRecord(params.mediaMetadata);
  const knownMissions = [
    readMission(jobPayload.pipelineMission),
    readMission(mediaMetadata.pipeline_mission),
    params.requestedMission,
  ];
  const mission: BoosterPreparationMission = knownMissions.includes(
    "publication_preparation",
  )
    ? "publication_preparation"
    : "ai_preparation";
  const requiredOutputs = Array.from(
    new Set<VideoNormalizationVariantKey>([
      ...readKeys(jobPayload.requiredOutputs),
      ...readKeys(mediaMetadata.preparation_required_outputs),
      ...BOOSTER_VIDEO_PREPARATION_KEYS[params.requestedMission],
    ]),
  );

  return { mission, requiredOutputs };
}

export function findUnfulfilledVideoPreparationKeys(params: {
  payload: unknown;
  fulfilledKeys: Iterable<VideoNormalizationVariantKey>;
  fallbackMission?: BoosterPreparationMission | null;
}) {
  const fulfilled = new Set(params.fulfilledKeys);
  return readRequestedVideoPreparationKeys({
    payload: params.payload,
    fallbackMission: params.fallbackMission,
  }).filter((key) => !fulfilled.has(key));
}
