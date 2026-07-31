import { readAccountCacheValue, writeAccountCacheValue } from "@/lib/browserAccountCache";

export type BrowserModuleSnapshot<T> = {
  cachedAt: number;
  data: T;
};

const SNAPSHOT_PREFIX = "inrcy_module_snapshot_v1";

function cacheKey(key: string) {
  return `${SNAPSHOT_PREFIX}:${key}`;
}

export function readModuleSnapshot<T>(key: string): BrowserModuleSnapshot<T> | null {
  try {
    const raw = readAccountCacheValue(cacheKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BrowserModuleSnapshot<T>;
    if (!parsed || typeof parsed !== "object") return null;
    if (!Number.isFinite(Number(parsed.cachedAt))) return null;
    if (!("data" in parsed)) return null;
    return { cachedAt: Number(parsed.cachedAt), data: parsed.data };
  } catch {
    return null;
  }
}

export function readFreshModuleSnapshot<T>(key: string, maxAgeMs: number): BrowserModuleSnapshot<T> | null {
  const snapshot = readModuleSnapshot<T>(key);
  if (!snapshot) return null;
  if (Date.now() - snapshot.cachedAt > Math.max(0, maxAgeMs)) return null;
  return snapshot;
}

export function writeModuleSnapshot<T>(key: string, data: T) {
  try {
    const payload: BrowserModuleSnapshot<T> = { cachedAt: Date.now(), data };
    writeAccountCacheValue(cacheKey(key), JSON.stringify(payload));
  } catch {
    // Le cache est un confort UX. Une indisponibilité du stockage navigateur
    // ne doit jamais bloquer l'outil ni son actualisation réseau.
  }
}

export const MODULE_SNAPSHOT_KEYS = {
  crmDefault: "crm:default",
  inrSendDefault: "inrsend:publications:sent:default",
  agendaMonth: (year: number, monthIndex: number) => `agenda:${year}-${String(monthIndex + 1).padStart(2, "0")}`,
  agendaContacts: "agenda:contacts",
  agendaSettings: "agenda:settings",
  propulserMetrics: "propulser:metrics",
  fideliserMetrics: "fideliser:metrics",
  facturesList: "documents:factures:list",
  devisList: "documents:devis:list",
  mediaLibraryDefault: "media-library:default",
} as const;
