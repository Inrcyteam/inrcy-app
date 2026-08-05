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
  { key: "verification", label: "Finalisation des médias", start: 1, cap: 8 },
  { key: "media_preparation", label: "Finalisation des médias", start: 8, cap: 28 },
  { key: "channel_compatibility", label: "Finalisation des médias", start: 28, cap: 42 },
  { key: "file_preparation", label: "Finalisation des médias", start: 42, cap: 58 },
  { key: "channel_dispatch", label: "Publication sur les canaux", start: 58, cap: 78 },
  { key: "publication_finalization", label: "Publication sur les canaux", start: 78, cap: 92 },
  { key: "status_collection", label: "Mise à jour du bilan", start: 92, cap: 96 },
  { key: "inrsend_recording", label: "Bilan iNr’Send", start: 96, cap: 99 },
  { key: "complete", label: "Bilan prêt", start: 100, cap: 100 },
] as const satisfies readonly ProgressPhaseDefinition[];

export type GenerationProgressPhaseKey =
  (typeof GENERATION_PROGRESS_PHASES)[number]["key"];
export type PublicationProgressPhaseKey =
  (typeof PUBLICATION_PROGRESS_PHASES)[number]["key"];

// Les phases techniques ci-dessus gardent des plafonds précis. L'interface
// les regroupe en quatre étapes compréhensibles par le pro.
export const PUBLICATION_PROGRESS_STAGES = [
  { index: 1, label: "Demande prise en charge" },
  { index: 2, label: "Finalisation des médias" },
  { index: 3, label: "Envoi parallèle" },
  { index: 4, label: "Confirmations et bilan" },
] as const;

export function getPublicationProgressStage(
  key: PublicationProgressPhaseKey,
) {
  if (key === "verification") return PUBLICATION_PROGRESS_STAGES[0];
  if (
    key === "media_preparation" ||
    key === "channel_compatibility" ||
    key === "file_preparation"
  ) {
    return PUBLICATION_PROGRESS_STAGES[1];
  }
  if (key === "channel_dispatch" || key === "publication_finalization") {
    return PUBLICATION_PROGRESS_STAGES[2];
  }
  return PUBLICATION_PROGRESS_STAGES[3];
}

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
