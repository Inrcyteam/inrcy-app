export type ProgressPhaseDefinition<Key extends string = string> = Readonly<{
  key: Key;
  label: string;
  start: number;
  cap: number;
}>;

export const GENERATION_PROGRESS_PHASES = [
  { key: "initialization", label: "Initialisation", start: 1, cap: 7 },
  { key: "media_security", label: "Sécurisation des médias", start: 7, cap: 22 },
  { key: "media_analysis", label: "Analyse des médias", start: 22, cap: 40 },
  { key: "request_understanding", label: "Compréhension de la demande", start: 40, cap: 50 },
  { key: "ai_writing", label: "Rédaction IA", start: 50, cap: 72 },
  { key: "channel_adaptation", label: "Adaptation multicanale", start: 72, cap: 86 },
  { key: "quality_control", label: "Contrôle qualité", start: 86, cap: 95 },
  { key: "editor_preparation", label: "Préparation de l’éditeur", start: 95, cap: 99 },
  { key: "complete", label: "Contenus prêts", start: 100, cap: 100 },
] as const satisfies readonly ProgressPhaseDefinition[];

export const PUBLICATION_PROGRESS_PHASES = [
  { key: "verification", label: "Vérification", start: 1, cap: 8 },
  { key: "media_preparation", label: "Préparation des médias", start: 8, cap: 28 },
  { key: "channel_compatibility", label: "Compatibilité des canaux", start: 28, cap: 42 },
  { key: "file_preparation", label: "Préparation des fichiers", start: 42, cap: 58 },
  { key: "channel_dispatch", label: "Envoi aux canaux", start: 58, cap: 78 },
  { key: "publication_finalization", label: "Finalisation des publications", start: 78, cap: 92 },
  { key: "status_collection", label: "Collecte des statuts", start: 92, cap: 96 },
  { key: "inrsend_recording", label: "Enregistrement dans iNr’Send", start: 96, cap: 99 },
  { key: "complete", label: "Bilan prêt", start: 100, cap: 100 },
] as const satisfies readonly ProgressPhaseDefinition[];

export type GenerationProgressPhaseKey =
  (typeof GENERATION_PROGRESS_PHASES)[number]["key"];
export type PublicationProgressPhaseKey =
  (typeof PUBLICATION_PROGRESS_PHASES)[number]["key"];

export function clampProgress(value: number, minimum = 0, maximum = 100) {
  const safeMinimum = Math.min(minimum, maximum);
  const safeMaximum = Math.max(minimum, maximum);
  return Math.min(
    safeMaximum,
    Math.max(safeMinimum, Math.round(Number(value) || 0)),
  );
}

export function mapProgressRange(
  value: number,
  sourceStart: number,
  sourceEnd: number,
  targetStart: number,
  targetEnd: number,
) {
  if (sourceEnd <= sourceStart) return clampProgress(targetEnd, targetStart, targetEnd);
  const ratio = Math.min(
    1,
    Math.max(0, (Number(value) - sourceStart) / (sourceEnd - sourceStart)),
  );
  return clampProgress(
    targetStart + ratio * (targetEnd - targetStart),
    targetStart,
    targetEnd,
  );
}

export function getProgressPhase<Phase extends ProgressPhaseDefinition>(
  phases: readonly Phase[],
  key: Phase["key"],
): Phase {
  const phase = phases.find((candidate) => candidate.key === key);
  if (!phase) {
    throw new Error(`Unknown progress phase: ${key}`);
  }
  return phase;
}

export function getProgressPhaseIndex<Phase extends ProgressPhaseDefinition>(
  phases: readonly Phase[],
  key: Phase["key"],
) {
  const index = phases.findIndex((phase) => phase.key === key);
  if (index < 0) {
    throw new Error(`Unknown progress phase: ${key}`);
  }
  return index + 1;
}

export function getProgressPhaseCaps(
  phases: readonly ProgressPhaseDefinition[],
) {
  return phases.map((phase) => phase.cap);
}

export function resolvePublicationBilanProgress(pendingCount: unknown) {
  const safePendingCount = Math.max(0, Math.floor(Number(pendingCount) || 0));
  return {
    pendingCount: safePendingCount,
    progress: 100,
    backgroundFinalization: safePendingCount > 0,
  } as const;
}
