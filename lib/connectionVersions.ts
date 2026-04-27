import { asRecord, asString } from "@/lib/tsSafe";

export type ConnectionDisplayStatus = "connected" | "needs_update" | "disconnected";

export type ConnectionKind =
  | "mail:gmail"
  | "mail:microsoft"
  | "mail:imap"
  | "channel:gmb"
  | "channel:facebook"
  | "channel:instagram"
  | "channel:linkedin";

/**
 * Version centrale des autorisations/contrats par connexion.
 *
 * Important :
 * - Ne pas modifier ces valeurs pour une simple mise à jour UI/build.
 * - À augmenter uniquement quand une ancienne autorisation devient insuffisante
 *   (nouveau scope OAuth, nouvelle donnée obligatoire, gros changement d’API provider).
 * - Les anciennes connexions sans version sont considérées comme version 1.
 */
export const CONNECTION_REQUIRED_VERSIONS: Record<ConnectionKind, number> = {
  "mail:gmail": 1,
  "mail:microsoft": 1,
  "mail:imap": 1,
  "channel:gmb": 1,
  "channel:facebook": 1,
  "channel:instagram": 1,
  "channel:linkedin": 1,
};

export function getRequiredConnectionVersion(kind: ConnectionKind): number {
  return CONNECTION_REQUIRED_VERSIONS[kind] ?? 1;
}

export function readConnectionVersion(node: unknown): number {
  const rec = asRecord(node);
  const raw = rec["connection_version"] ?? rec["connectionVersion"] ?? rec["auth_version"] ?? rec["authVersion"] ?? 1;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.trunc(n);
}

export function isConnectionUpdateRequired(kind: ConnectionKind, versionNode: unknown): boolean {
  return readConnectionVersion(versionNode) < getRequiredConnectionVersion(kind);
}

export function getConnectionDisplayStatus(
  isConnected: boolean,
  kind: ConnectionKind,
  versionNode: unknown,
): ConnectionDisplayStatus {
  if (!isConnected) return "disconnected";
  return isConnectionUpdateRequired(kind, versionNode) ? "needs_update" : "connected";
}

export function getConnectionDisplayLabel(status: ConnectionDisplayStatus): string {
  if (status === "needs_update") return "À actualiser";
  if (status === "connected") return "Connecté";
  return "Déconnecté";
}

export function withCurrentConnectionVersion<T extends Record<string, unknown>>(
  kind: ConnectionKind,
  node: T | null | undefined,
): T & { connection_version: number; connection_version_updated_at: string } {
  return {
    ...((node ?? {}) as T),
    connection_version: getRequiredConnectionVersion(kind),
    connection_version_updated_at: new Date().toISOString(),
  };
}

export function mailConnectionKind(provider: unknown): ConnectionKind | null {
  const p = (asString(provider) || "").toLowerCase();
  if (p === "gmail") return "mail:gmail";
  if (p === "microsoft") return "mail:microsoft";
  if (p === "imap") return "mail:imap";
  return null;
}
