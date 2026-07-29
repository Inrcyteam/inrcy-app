/**
 * Étape 9 — certification et activation progressive du pipeline média.
 *
 * Ce module ne bascule aucun parcours à lui seul. Il décrit l'état effectif des
 * flags serveur/client, détecte les combinaisons incohérentes et expose un
 * niveau de déploiement lisible par la QA, les scripts d'exploitation et le
 * healthcheck interne.
 */

export const MEDIA_PIPELINE_CERTIFICATION_VERSION = 1;

export const MEDIA_PIPELINE_SERVER_FLAG_KEYS = [
  "MEDIA_PIPELINE_UPLOADS_V1",
  "MEDIA_PIPELINE_WORKSPACE_V1",
  "MEDIA_PIPELINE_IMAGE_NORMALIZATION_V1",
  "MEDIA_PIPELINE_VIDEO_NORMALIZATION_V1",
  "MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1",
  "MEDIA_PIPELINE_LEGACY_CUTOVER_V1",
] as const;

export const MEDIA_PIPELINE_CLIENT_FLAG_KEYS = [
  "NEXT_PUBLIC_MEDIA_PIPELINE_UPLOADS_V1",
  "NEXT_PUBLIC_MEDIA_PIPELINE_WORKSPACE_V1",
  "NEXT_PUBLIC_MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1",
  "NEXT_PUBLIC_MEDIA_PIPELINE_LEGACY_CUTOVER_V1",
] as const;

export const MEDIA_PIPELINE_ALL_FLAG_KEYS = [
  ...MEDIA_PIPELINE_SERVER_FLAG_KEYS,
  ...MEDIA_PIPELINE_CLIENT_FLAG_KEYS,
] as const;

export type MediaPipelineFlagKey =
  (typeof MEDIA_PIPELINE_ALL_FLAG_KEYS)[number];

export type MediaPipelineRolloutStage =
  | "disabled"
  | "server_foundation"
  | "workspace_canary"
  | "unified_canary"
  | "full_cutover"
  | "transition"
  | "invalid";

export type MediaPipelineCertificationSnapshot = {
  readonly version: number;
  readonly stage: MediaPipelineRolloutStage;
  readonly flags: Readonly<Record<MediaPipelineFlagKey, boolean>>;
  readonly enabledFlags: readonly MediaPipelineFlagKey[];
  readonly disabledFlags: readonly MediaPipelineFlagKey[];
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly cutoverPrerequisitesReady: boolean;
  readonly fullCutoverEnabled: boolean;
};

type EnvLike = Readonly<Record<string, string | undefined>>;

function isEnabled(value: unknown) {
  return value === "true";
}

function everyFlag(
  flags: Readonly<Record<MediaPipelineFlagKey, boolean>>,
  keys: readonly MediaPipelineFlagKey[],
) {
  return keys.every((key) => flags[key]);
}

function noFlag(
  flags: Readonly<Record<MediaPipelineFlagKey, boolean>>,
  keys: readonly MediaPipelineFlagKey[],
) {
  return keys.every((key) => !flags[key]);
}

export function buildMediaPipelineCertificationSnapshot(
  env: EnvLike = process.env,
): MediaPipelineCertificationSnapshot {
  const flags = Object.fromEntries(
    MEDIA_PIPELINE_ALL_FLAG_KEYS.map((key) => [key, isEnabled(env[key])]),
  ) as Record<MediaPipelineFlagKey, boolean>;

  const errors: string[] = [];
  const warnings: string[] = [];

  const requireDependency = (
    child: MediaPipelineFlagKey,
    parent: MediaPipelineFlagKey,
  ) => {
    if (flags[child] && !flags[parent]) {
      errors.push(`${child} exige ${parent}`);
    }
  };

  requireDependency("MEDIA_PIPELINE_WORKSPACE_V1", "MEDIA_PIPELINE_UPLOADS_V1");
  requireDependency(
    "MEDIA_PIPELINE_IMAGE_NORMALIZATION_V1",
    "MEDIA_PIPELINE_WORKSPACE_V1",
  );
  requireDependency(
    "MEDIA_PIPELINE_VIDEO_NORMALIZATION_V1",
    "MEDIA_PIPELINE_WORKSPACE_V1",
  );
  requireDependency(
    "MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1",
    "MEDIA_PIPELINE_IMAGE_NORMALIZATION_V1",
  );
  requireDependency(
    "MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1",
    "MEDIA_PIPELINE_VIDEO_NORMALIZATION_V1",
  );
  requireDependency(
    "MEDIA_PIPELINE_LEGACY_CUTOVER_V1",
    "MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1",
  );

  requireDependency(
    "NEXT_PUBLIC_MEDIA_PIPELINE_WORKSPACE_V1",
    "NEXT_PUBLIC_MEDIA_PIPELINE_UPLOADS_V1",
  );
  requireDependency(
    "NEXT_PUBLIC_MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1",
    "NEXT_PUBLIC_MEDIA_PIPELINE_WORKSPACE_V1",
  );
  requireDependency(
    "NEXT_PUBLIC_MEDIA_PIPELINE_LEGACY_CUTOVER_V1",
    "NEXT_PUBLIC_MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1",
  );

  requireDependency(
    "NEXT_PUBLIC_MEDIA_PIPELINE_UPLOADS_V1",
    "MEDIA_PIPELINE_UPLOADS_V1",
  );
  requireDependency(
    "NEXT_PUBLIC_MEDIA_PIPELINE_WORKSPACE_V1",
    "MEDIA_PIPELINE_WORKSPACE_V1",
  );
  requireDependency(
    "NEXT_PUBLIC_MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1",
    "MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1",
  );
  requireDependency(
    "NEXT_PUBLIC_MEDIA_PIPELINE_LEGACY_CUTOVER_V1",
    "MEDIA_PIPELINE_LEGACY_CUTOVER_V1",
  );

  const serverFoundationKeys = MEDIA_PIPELINE_SERVER_FLAG_KEYS.slice(0, 4);
  const publicWorkspaceKeys = MEDIA_PIPELINE_CLIENT_FLAG_KEYS.slice(0, 2);
  const unifiedKeys = [
    "MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1",
    "NEXT_PUBLIC_MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1",
  ] as const;
  const cutoverKeys = [
    "MEDIA_PIPELINE_LEGACY_CUTOVER_V1",
    "NEXT_PUBLIC_MEDIA_PIPELINE_LEGACY_CUTOVER_V1",
  ] as const;

  const serverFoundationReady = everyFlag(flags, serverFoundationKeys);
  const publicWorkspaceReady = everyFlag(flags, publicWorkspaceKeys);
  const unifiedReady = everyFlag(flags, unifiedKeys);
  const cutoverPrerequisitesReady =
    serverFoundationReady && publicWorkspaceReady && unifiedReady;
  const fullCutoverEnabled =
    cutoverPrerequisitesReady && everyFlag(flags, cutoverKeys);

  if (
    flags.MEDIA_PIPELINE_IMAGE_NORMALIZATION_V1 !==
    flags.MEDIA_PIPELINE_VIDEO_NORMALIZATION_V1
  ) {
    warnings.push(
      "Les normalisations image et vidéo ne sont pas au même niveau d'activation.",
    );
  }

  if (
    flags.MEDIA_PIPELINE_LEGACY_CUTOVER_V1 &&
    !flags.NEXT_PUBLIC_MEDIA_PIPELINE_LEGACY_CUTOVER_V1
  ) {
    warnings.push(
      "Le serveur est prêt pour la bascule stricte, mais le client utilise encore la voie de transition.",
    );
  }

  const enabledFlags = MEDIA_PIPELINE_ALL_FLAG_KEYS.filter((key) => flags[key]);
  const disabledFlags = MEDIA_PIPELINE_ALL_FLAG_KEYS.filter(
    (key) => !flags[key],
  );

  let stage: MediaPipelineRolloutStage;
  if (errors.length > 0) {
    stage = "invalid";
  } else if (enabledFlags.length === 0) {
    stage = "disabled";
  } else if (fullCutoverEnabled) {
    stage = "full_cutover";
  } else if (
    serverFoundationReady &&
    publicWorkspaceReady &&
    unifiedReady &&
    noFlag(flags, cutoverKeys)
  ) {
    stage = "unified_canary";
  } else if (
    serverFoundationReady &&
    publicWorkspaceReady &&
    noFlag(flags, [...unifiedKeys, ...cutoverKeys])
  ) {
    stage = "workspace_canary";
  } else if (
    serverFoundationReady &&
    noFlag(flags, MEDIA_PIPELINE_CLIENT_FLAG_KEYS) &&
    !flags.MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1 &&
    !flags.MEDIA_PIPELINE_LEGACY_CUTOVER_V1
  ) {
    stage = "server_foundation";
  } else {
    stage = "transition";
  }

  return {
    version: MEDIA_PIPELINE_CERTIFICATION_VERSION,
    stage,
    flags,
    enabledFlags,
    disabledFlags,
    errors,
    warnings,
    cutoverPrerequisitesReady,
    fullCutoverEnabled,
  };
}
