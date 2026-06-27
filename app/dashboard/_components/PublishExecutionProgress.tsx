"use client";

type DashboardStyles = Readonly<Record<string, string>>;

export default function PublishExecutionProgress({
  styles,
  scheduling = false,
  publishProgress,
  publishProgressLabel,
}: {
  styles: DashboardStyles;
  scheduling?: boolean;
  publishProgress: number;
  publishProgressLabel: string;
}) {
  const safeProgress = Math.max(0, Math.min(100, Math.round(Number(publishProgress) || 0)));

  return (
    <div className={styles.publishProgressBox}>
      <div className={styles.publishProgressHeader}>
        <strong className={styles.publishProgressTitle}>
          {scheduling ? "Programmation en cours" : "Publication en cours"}
        </strong>
        <strong className={styles.publishProgressPercent}>{safeProgress}%</strong>
      </div>
      <span className={styles.publishProgressLabel}>
        {publishProgressLabel || (scheduling ? "Programmation en cours..." : "Publication en cours...")}
      </span>
      <div className={styles.publishProgressTrack}>
        <div
          style={{
            height: "100%",
            width: `${safeProgress}%`,
            borderRadius: 999,
            background:
              "linear-gradient(90deg, rgba(76,195,255,0.92), rgba(99,102,241,0.95))",
            transition: "width 180ms ease",
          }}
        />
      </div>
    </div>
  );
}
