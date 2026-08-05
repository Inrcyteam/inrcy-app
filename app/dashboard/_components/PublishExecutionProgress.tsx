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
  phaseCaps,
}: {
  styles: DashboardStyles;
  scheduling?: boolean;
  publishProgress: number;
  publishProgressLabel: string;
  phaseIndex?: number;
  phaseTotal?: number;
  phaseLabel?: string;
  phaseCaps?: readonly number[];
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

  return (
    <div className={styles.publishProgressBox}>
      <div className={styles.publishProgressHeader}>
        <div className={styles.publishProgressHeadingGroup}>
          <strong className={styles.publishProgressTitle}>
            {scheduling ? "Programmation en cours" : "Publication en cours"}
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
      <span className={styles.publishProgressLabel}>
        {publishProgressLabel ||
          (scheduling
            ? "Programmation en cours..."
            : "Publication en cours...")}
      </span>
      <div className={styles.publishProgressTrack} aria-hidden="true">
        <div
          className={styles.publishProgressFill}
          style={{ width: `${safeProgress}%` }}
        />
        {(phaseCaps || [])
          .filter((cap) => cap > 0 && cap < 100)
          .map((cap) => (
            <span
              key={cap}
              className={styles.publishProgressMarker}
              data-complete={safeProgress >= cap ? "true" : "false"}
              style={{ left: `${cap}%` }}
            />
          ))}
      </div>
    </div>
  );
}
