export type RawInrcyOwnership = "none" | "rented" | "sold" | string | null | undefined;
export type InrcySiteAppState = "none" | "active";

export function normalizeInrcyOwnership(raw: RawInrcyOwnership): "none" | "rented" | "sold" {
  const value = String(raw ?? "none").trim().toLowerCase();
  if (value === "rented" || value === "sold") return value;
  return "none";
}

export function getInrcySiteAppState(raw: RawInrcyOwnership): InrcySiteAppState {
  return normalizeInrcyOwnership(raw) === "none" ? "none" : "active";
}

export function hasActiveInrcySite(raw: RawInrcyOwnership): boolean {
  return getInrcySiteAppState(raw) === "active";
}

export function isManagedInrcySite(raw: RawInrcyOwnership): boolean {
  return normalizeInrcyOwnership(raw) === "rented";
}
