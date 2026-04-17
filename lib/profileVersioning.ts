export type ProfileVersionField =
  | "stats_version"
  | "notifications_version"
  | "docs_version"
  | "loyalty_version"
  | "publications_version";

export const PROFILE_VERSION_FIELDS: ProfileVersionField[] = [
  "stats_version",
  "notifications_version",
  "docs_version",
  "loyalty_version",
  "publications_version",
];

export const PROFILE_VERSION_EVENT = "inrcy:profile-version-change";

export type ProfileVersionsSnapshot = Record<ProfileVersionField, number>;

export type ProfileVersionChangeDetail = {
  field: ProfileVersionField;
  previousValue: number;
  value: number;
};

function toSafeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function toProfileVersionsSnapshot(input: unknown): ProfileVersionsSnapshot {
  const row = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    stats_version: toSafeNumber(row.stats_version),
    notifications_version: toSafeNumber(row.notifications_version),
    docs_version: toSafeNumber(row.docs_version),
    loyalty_version: toSafeNumber(row.loyalty_version),
    publications_version: toSafeNumber(row.publications_version),
  };
}

export function getChangedProfileVersionFields(
  previous: ProfileVersionsSnapshot,
  next: ProfileVersionsSnapshot,
): ProfileVersionChangeDetail[] {
  return PROFILE_VERSION_FIELDS
    .filter((field) => next[field] !== previous[field])
    .map((field) => ({
      field,
      previousValue: previous[field],
      value: next[field],
    }));
}
