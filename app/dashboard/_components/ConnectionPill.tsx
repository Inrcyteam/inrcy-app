import type { ConnectionDisplayStatus } from "@/lib/connectionVersions";
import styles from "../dashboard.module.css";

type ConnectionActivity = "searching" | "connecting" | "disconnecting";

type ConnectionPillProps = {
  connected: boolean;
  status?: ConnectionDisplayStatus;
  label?: string;
  activity?: ConnectionActivity;
};

const activityLabels: Record<ConnectionActivity, string> = {
  searching: "Recherche en cours…",
  connecting: "Connexion en cours…",
  disconnecting: "Déconnexion en cours…",
};

export default function ConnectionPill({ connected, status, label, activity }: ConnectionPillProps) {
  const displayStatus: ConnectionDisplayStatus = status ?? (connected ? "connected" : "disconnected");
  const displayLabel =
    label ??
    (activity
      ? activityLabels[activity]
      : displayStatus === "needs_update"
        ? "À actualiser"
        : displayStatus === "connected"
          ? "Connecté"
          : "À connecter");

  const dotColor =
    displayStatus === "needs_update"
      ? "rgba(245,158,11,0.95)"
      : displayStatus === "connected"
        ? "rgba(34,197,94,0.95)"
        : "rgba(59,130,246,0.95)";

  const activityClass = activity
    ? activity === "searching"
      ? styles.connectionPillSearching
      : activity === "connecting"
        ? styles.connectionPillConnecting
        : styles.connectionPillDisconnecting
    : "";

  return (
    <span
      className={`${styles.connectionPill} ${activityClass}`.trim()}
      role={activity ? "status" : undefined}
      aria-live={activity ? "polite" : undefined}
      aria-busy={activity ? true : undefined}
      title={displayLabel}
    >
      {activity ? (
        <span
          aria-hidden
          className={activity === "searching" ? styles.connectionPillSpinner : styles.connectionPillPulse}
        />
      ) : (
        <span aria-hidden className={styles.connectionPillDot} style={{ background: dotColor }} />
      )}
      <strong className={styles.connectionPillText}>{displayLabel}</strong>
    </span>
  );
}
