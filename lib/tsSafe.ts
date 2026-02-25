// Centralized runtime-safe helpers for working with unknown JSON / DB payloads.
// These are intentionally defensive to keep production routes resilient.

export type AnyRecord = Record<string, unknown>;

export function asRecord(v: unknown): AnyRecord {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as AnyRecord) : {};
}

export function asString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return null;
}

export function asNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function pickFirstString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    const s = asString(v);
    if (s) return s;
  }
  return undefined;
}

export function pickFirstNumber(...vals: unknown[]): number | undefined {
  for (const v of vals) {
    const n = asNumber(v);
    if (n !== null) return n;
  }
  return undefined;
}

export function asHttpStatus(v: unknown, fallback: number): number {
  const n = asNumber(v);
  if (n === null) return fallback;
  // Clamp to valid HTTP status range
  if (n < 100 || n > 599) return fallback;
  return Math.trunc(n);
}

export function safeErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function safeDateFrom(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}
