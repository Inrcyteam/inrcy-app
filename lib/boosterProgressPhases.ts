export type ProgressPhaseDefinition<Key extends string = string> = Readonly<{
  key: Key;
  label: string;
  start: number;
  cap: number;
}>;

export const GENERATION_PROGRESS_PHASES = [
  { key: "initialization", label: "Initialisation", start: 1, cap: 7 },
  { key: "media_security", label: "Sécurisation des médias", start: 7, cap: 20 },
  { key: "media_analysis", label: "Analyse des médias", start: 20, cap: 38 },
  { key: "request_understanding", label: "Compréhension de la demande", start: 38, cap: 48 },
  { key: "ai_writing", label: "Rédaction IA", start: 48, cap: 68 },
  { key: "channel_adaptation", label: "Adaptation multicanale", start: 68, cap: 82 },
  { key: "quality_control", label: "Contrôle qualité", start: 82, cap: 92 },
  { key: "editor_preparation", label: "Préparation de l’éditeur", start: 92, cap: 95 },
  { key: "final_wait", label: "Encore quelques secondes…", start: 95, cap: 99 },
  { key: "complete", label: "Contenus prêts", start: 100, cap: 100 },
] as const satisfies readonly ProgressPhaseDefinition[];

export const PUBLICATION_PROGRESS_PHASES = [
  { key: "verification", label: "Demande prise en charge", start: 1, cap: 5 },
  { key: "channel_verification", label: "Vérification des canaux", start: 5, cap: 12 },
  { key: "media_verification", label: "Vérification des médias", start: 12, cap: 22 },
  { key: "media_preparation", label: "Préparation des médias", start: 22, cap: 40 },
  { key: "file_preparation", label: "Préparation des envois", start: 40, cap: 50 },
  { key: "channel_dispatch", label: "Publication sur les canaux", start: 50, cap: 66 },
  { key: "publication_finalization", label: "Publication sur les canaux", start: 66, cap: 82 },
  { key: "status_collection", label: "Confirmation des plateformes", start: 82, cap: 94 },
  { key: "inrsend_recording", label: "Enregistrement dans iNr’Send", start: 94, cap: 96 },
  { key: "final_wait", label: "Encore quelques secondes…", start: 96, cap: 99 },
  { key: "complete", label: "Publication terminée", start: 100, cap: 100 },
] as const satisfies readonly ProgressPhaseDefinition[];

export type GenerationProgressPhaseKey =
  (typeof GENERATION_PROGRESS_PHASES)[number]["key"];
export type PublicationProgressPhaseKey =
  (typeof PUBLICATION_PROGRESS_PHASES)[number]["key"];

// Les phases techniques gardent des plafonds précis. L'interface les regroupe
// en étapes factuelles et chronologiques pour le pro.
export const PUBLICATION_PROGRESS_STAGES = [
  { index: 1, label: "Demande prise en charge" },
  { index: 2, label: "Vérification des canaux" },
  { index: 3, label: "Vérification des médias" },
  { index: 4, label: "Préparation des médias" },
  { index: 5, label: "Préparation des envois" },
  { index: 6, label: "Publication sur les canaux" },
  { index: 7, label: "Confirmation des plateformes" },
  { index: 8, label: "Enregistrement dans iNr’Send" },
  { index: 9, label: "Un peu de patience…" },
  { index: 10, label: "Publication terminée" },
] as const;

export function getPublicationProgressStage(
  key: PublicationProgressPhaseKey,
) {
  if (key === "verification") return PUBLICATION_PROGRESS_STAGES[0];
  if (key === "channel_verification") return PUBLICATION_PROGRESS_STAGES[1];
  if (key === "media_verification") return PUBLICATION_PROGRESS_STAGES[2];
  if (key === "media_preparation") return PUBLICATION_PROGRESS_STAGES[3];
  if (key === "file_preparation") return PUBLICATION_PROGRESS_STAGES[4];
  if (key === "channel_dispatch" || key === "publication_finalization") {
    return PUBLICATION_PROGRESS_STAGES[5];
  }
  if (key === "status_collection") return PUBLICATION_PROGRESS_STAGES[6];
  if (key === "inrsend_recording") return PUBLICATION_PROGRESS_STAGES[7];
  if (key === "final_wait") return PUBLICATION_PROGRESS_STAGES[8];
  return PUBLICATION_PROGRESS_STAGES[9];
}

export function getPublicationProgressStageForValue(value: number) {
  const progress = clampProgress(value);
  if (progress < 5) return PUBLICATION_PROGRESS_STAGES[0];
  if (progress < 12) return PUBLICATION_PROGRESS_STAGES[1];
  if (progress < 22) return PUBLICATION_PROGRESS_STAGES[2];
  if (progress < 40) return PUBLICATION_PROGRESS_STAGES[3];
  if (progress < 50) return PUBLICATION_PROGRESS_STAGES[4];
  if (progress < 82) return PUBLICATION_PROGRESS_STAGES[5];
  if (progress < 94) return PUBLICATION_PROGRESS_STAGES[6];
  if (progress < 96) return PUBLICATION_PROGRESS_STAGES[7];
  if (progress < 100) return PUBLICATION_PROGRESS_STAGES[8];
  return PUBLICATION_PROGRESS_STAGES[9];
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
