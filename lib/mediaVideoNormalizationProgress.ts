export const VIDEO_NORMALIZATION_CHAIN_PROGRESS_SPLIT = 65;

export type VideoNormalizationProgressWindow = Readonly<{
  start: number;
  end: number;
}>;

function clampPercent(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, numeric));
}

/**
 * Keeps the media-level progress monotonic across durable worker invocations.
 *
 * A planned first stage owns 0..65. Any follow-up stage starts at 65 and owns
 * the remaining 65..100. For heavy videos this is canonicalization followed by
 * captures/audio/thumbnail generation. A one-stage light video keeps 0..100.
 */
export function resolveVideoNormalizationProgressWindow(params: {
  continuesWithPendingOutputs: boolean;
  previousProgress?: unknown;
  hasCompletedRequiredOutput?: boolean;
}): VideoNormalizationProgressWindow {
  if (params.continuesWithPendingOutputs) {
    return { start: 0, end: VIDEO_NORMALIZATION_CHAIN_PROGRESS_SPLIT };
  }

  if (
    clampPercent(params.previousProgress) >=
      VIDEO_NORMALIZATION_CHAIN_PROGRESS_SPLIT ||
    params.hasCompletedRequiredOutput === true
  ) {
    return { start: VIDEO_NORMALIZATION_CHAIN_PROGRESS_SPLIT, end: 100 };
  }

  return { start: 0, end: 100 };
}

export function mapVideoNormalizationStageProgress(
  stageProgress: unknown,
  window: VideoNormalizationProgressWindow,
) {
  const localProgress = clampPercent(stageProgress);
  return Math.round(
    window.start +
      (localProgress / 100) * Math.max(0, window.end - window.start),
  );
}
