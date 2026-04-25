import type { ConnectionDisplayStatus } from "@/lib/connectionVersions";

type ConnectionPillProps = {
  connected: boolean;
  status?: ConnectionDisplayStatus;
  label?: string;
};

export default function ConnectionPill({ connected, status, label }: ConnectionPillProps) {
  const displayStatus: ConnectionDisplayStatus = status ?? (connected ? "connected" : "disconnected");
  const displayLabel =
    label ?? (displayStatus === "needs_update" ? "À actualiser" : displayStatus === "connected" ? "Connecté" : "À connecter");

  const dotColor =
    displayStatus === "needs_update"
      ? "rgba(245,158,11,0.95)"
      : displayStatus === "connected"
        ? "rgba(34,197,94,0.95)"
        : "rgba(59,130,246,0.95)";

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(15,23,42,0.65)", colorScheme: "dark", padding: "6px 10px", borderRadius: 999, color: "rgba(255,255,255,0.92)", fontSize: 12, whiteSpace: "nowrap" }}>
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: dotColor }} />
      <strong>{displayLabel}</strong>
    </span>
  );
}
