export type MediaPreparationDisplayPhase = "preparation";

export type MediaPreparationDisplayRow = {
  mediaType?: unknown;
  sizeBytes?: unknown;
  processingStatus?: unknown;
  processingProgress?: unknown;
};

export type MediaPreparationDisplayState = Readonly<{
  phase: MediaPreparationDisplayPhase;
  phaseProgress: number | null;
}>;

/** Booster exposes one universal preparation phase for images and videos. */
export function resolveMediaPreparationDisplayState(
  _rows: readonly MediaPreparationDisplayRow[],
): MediaPreparationDisplayState {
  return { phase: "preparation", phaseProgress: null };
}

export function resolveMediaPreparationDisplayPhase(
  rows: readonly MediaPreparationDisplayRow[],
): MediaPreparationDisplayPhase {
  return resolveMediaPreparationDisplayState(rows).phase;
}
