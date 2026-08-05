"use client";

type DashboardStyles = Readonly<Record<string, string>>;

export default function PublishExecutionProgress({
  styles,
  scheduling = false,
  publishProgress,
  publishProgressLabel,
  phaseIndex,
  phaseTotal,
  phaseLabel,
}: {
  styles: DashboardStyles;
  scheduling?: boolean;
  publishProgress: number;
  publishProgressLabel: string;
  phaseIndex?: number;
  phaseTotal?: number;
  phaseLabel?: string;
}) {
  const safeProgress = Math.max(
    0,
    Math.min(100, Math.round(Number(publishProgress) || 0)),
  );
  const hasPhaseDetails =
    !scheduling &&
    Number.isFinite(phaseIndex) &&
    Number.isFinite(phaseTotal) &&
    Number(phaseIndex) > 0 &&
    Number(phaseTotal) > 0;
  const isComplete = safeProgress >= 100;
  const visibleLabel =
    publishProgressLabel ||
    (scheduling ? "Programmation en cours..." : "Publication en cours...");
  const progressTitle = isComplete
    ? scheduling
      ? "Programmation finalisée"
      : "Publication finalisée"
    : scheduling
      ? "Programmation en cours"
      : "Publication en cours";

  return (
    <div className={styles.publishProgressBox}>
      <div className={styles.publishProgressHeader}>
        <div className={styles.publishProgressHeadingGroup}>
          <strong className={styles.publishProgressTitle}>
            {progressTitle}
          </strong>
          {hasPhaseDetails ? (
            <span className={styles.publishProgressPhase}>
              Étape {phaseIndex}/{phaseTotal}
              {phaseLabel ? ` · ${phaseLabel}` : ""}
            </span>
          ) : null}
        </div>
        <strong className={styles.publishProgressPercent}>{safeProgress}%</strong>
      </div>

      <span className={styles.publishProgressLabel} role="status" aria-live="polite">
        {visibleLabel}
      </span>

      <div
        className={styles.publishProgressTrack}
        role="progressbar"
        aria-label={
          scheduling
            ? "Progression de la programmation"
            : "Progression de la publication"
        }
        aria-valuetext={`${safeProgress} %. ${visibleLabel}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={safeProgress}
      >
        <div
          className={styles.publishProgressFill}
          style={{ width: `${safeProgress}%` }}
        />
      </div>
    </div>
  );
}
