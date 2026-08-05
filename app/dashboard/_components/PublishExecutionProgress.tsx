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
  const fallbackLabel = scheduling
    ? "Programmation en cours..."
    : "Publication en cours...";
  const visibleLabel = publishProgressLabel || fallbackLabel;
  const progressTitle = isComplete
    ? scheduling
      ? "Programmation finalisée"
      : "Publication finalisée"
    : scheduling
      ? "Programmation en cours"
      : "Publication en cours";

  return (
    <section
      className={`${styles.publishProgressBox} ${isComplete ? styles.publishProgressBoxComplete : ""}`}
      aria-busy={!isComplete}
    >
      <div className={styles.publishProgressTopline}>
        <div className={styles.publishProgressIdentity}>
          <span className={styles.publishProgressSignal} aria-hidden="true">
            <span className={styles.publishProgressSignalHalo} />
            <span className={styles.publishProgressSignalCore} />
          </span>
          <div className={styles.publishProgressHeadingGroup}>
            <strong className={styles.publishProgressTitle}>{progressTitle}</strong>
            {hasPhaseDetails ? (
              <span className={styles.publishProgressPhase}>
                <span className={styles.publishProgressPhaseIndex}>
                  Étape {phaseIndex} sur {phaseTotal}
                </span>
                {phaseLabel ? (
                  <span className={styles.publishProgressPhaseName}>
                    {phaseLabel}
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>
        </div>
        <div className={styles.publishProgressPercentWrap} aria-hidden="true">
          <strong className={styles.publishProgressPercent}>{safeProgress}</strong>
          <span className={styles.publishProgressPercentUnit}>%</span>
        </div>
      </div>

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
          className={`${styles.publishProgressFill} ${safeProgress < 100 ? styles.publishProgressFillActive : ""}`}
          style={{ width: `${safeProgress}%` }}
        >
          <span className={styles.publishProgressLead} aria-hidden="true" />
        </div>
      </div>

      <div className={styles.publishProgressFooter}>
        <span
          className={styles.publishProgressLabel}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {visibleLabel}
        </span>
        <span className={styles.publishProgressBackgroundHint}>
          <span className={styles.publishProgressBackgroundDot} aria-hidden="true" />
          Traitement sécurisé
        </span>
      </div>
    </section>
  );
}
