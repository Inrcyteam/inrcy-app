import { INR_MEDIA_VIDEO_COMPRESSION_TRIGGER_BYTES } from "./mediaRules.ts";
import { VIDEO_NORMALIZATION_CHAIN_PROGRESS_SPLIT } from "./mediaVideoNormalizationProgress.ts";

export type MediaPreparationDisplayPhase = "compression" | "preparation";

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

/**
 * A heavy source owns the first 0..65 portion of the durable video job while
 * the shared sub-70 MB master is produced. The remaining work is ordinary
 * media preparation (thumbnail, captures and audio).
 */
export function resolveMediaPreparationDisplayState(
  rows: readonly MediaPreparationDisplayRow[],
): MediaPreparationDisplayState {
  const compressionRows = rows.filter((row) => {
    const processingStatus = String(row.processingStatus || "")
      .trim()
      .toLowerCase();
    const processingProgress = Math.max(
      0,
      Math.min(100, Number(row.processingProgress || 0)),
    );
    return (
      String(row.mediaType || "").trim().toLowerCase() === "video" &&
      Number(row.sizeBytes || 0) >=
        INR_MEDIA_VIDEO_COMPRESSION_TRIGGER_BYTES &&
      !["ready", "failed_terminal"].includes(processingStatus) &&
      processingProgress < VIDEO_NORMALIZATION_CHAIN_PROGRESS_SPLIT
    );
  });

  if (!compressionRows.length) {
    return { phase: "preparation", phaseProgress: null };
  }

  const canonicalProgress =
    compressionRows.reduce(
      (sum, row) =>
        sum +
        Math.max(
          0,
          Math.min(
            VIDEO_NORMALIZATION_CHAIN_PROGRESS_SPLIT,
            Number(row.processingProgress || 0),
          ),
        ),
      0,
    ) / compressionRows.length;
  return {
    phase: "compression",
    phaseProgress: Math.round(
      (canonicalProgress / VIDEO_NORMALIZATION_CHAIN_PROGRESS_SPLIT) * 100,
    ),
  };
}

export function resolveMediaPreparationDisplayPhase(
  rows: readonly MediaPreparationDisplayRow[],
): MediaPreparationDisplayPhase {
  return resolveMediaPreparationDisplayState(rows).phase;
}
