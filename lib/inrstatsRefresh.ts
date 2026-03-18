export type InrStatsCubeKey = "site_inrcy" | "site_web" | "gmb" | "facebook" | "instagram" | "linkedin";

type DirtyPayload = {
  all?: number;
  cubes?: Partial<Record<InrStatsCubeKey, number>>;
};

export const INRSTATS_DIRTY_STORAGE_KEY = "inrcy_inrstats_dirty_v1";

const ALL_CUBES: InrStatsCubeKey[] = ["site_inrcy", "site_web", "gmb", "facebook", "instagram", "linkedin"];

function isCubeKey(value: unknown): value is InrStatsCubeKey {
  return typeof value === "string" && (ALL_CUBES as string[]).includes(value);
}

function normalizeKeys(input?: Iterable<unknown> | "all" | null): InrStatsCubeKey[] | null {
  if (input == null || input === "all") return null;
  const out = new Set<InrStatsCubeKey>();
  for (const value of input) {
    if (isCubeKey(value)) out.add(value);
  }
  return Array.from(out);
}

function readPayload(): DirtyPayload {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(INRSTATS_DIRTY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DirtyPayload;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writePayload(payload: DirtyPayload) {
  if (typeof window === "undefined") return;
  try {
    const hasAll = typeof payload.all === "number";
    const cubeEntries = Object.entries(payload.cubes || {}).filter(([, value]) => typeof value === "number");
    if (!hasAll && cubeEntries.length === 0) {
      window.localStorage.removeItem(INRSTATS_DIRTY_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      INRSTATS_DIRTY_STORAGE_KEY,
      JSON.stringify({
        ...(hasAll ? { all: payload.all } : {}),
        ...(cubeEntries.length ? { cubes: Object.fromEntries(cubeEntries) } : {}),
      })
    );
  } catch {
    // ignore storage failures
  }
}

export function markInrStatsDirty(cubes?: Iterable<unknown> | "all" | null) {
  if (typeof window === "undefined") return;
  const keys = normalizeKeys(cubes);
  const now = Date.now();
  const payload = readPayload();
  if (keys === null) {
    writePayload({ all: now });
    return;
  }
  const next: DirtyPayload = { ...payload, cubes: { ...(payload.cubes || {}) } };
  for (const key of keys) {
    (next.cubes as Record<InrStatsCubeKey, number>)[key] = now;
  }
  writePayload(next);
}

export function readInrStatsDirty(): { all: boolean; cubes: InrStatsCubeKey[] } {
  const payload = readPayload();
  if (typeof payload.all === "number") {
    return { all: true, cubes: [...ALL_CUBES] };
  }
  const cubes = Object.keys(payload.cubes || {}).filter(isCubeKey);
  return { all: false, cubes };
}

export function clearInrStatsDirty(cubes?: Iterable<unknown> | "all" | null) {
  if (typeof window === "undefined") return;
  const keys = normalizeKeys(cubes);
  if (keys === null) {
    writePayload({});
    return;
  }
  const payload = readPayload();
  if (!payload.cubes) return;
  const next: DirtyPayload = { ...payload, cubes: { ...(payload.cubes || {}) } };
  for (const key of keys) {
    delete (next.cubes as Partial<Record<InrStatsCubeKey, number>>)[key];
  }
  writePayload(next);
}

type SearchParamsLike = { get(name: string): string | null } | null | undefined;

export function inferDirtyCubesFromUrlParams(params: SearchParamsLike): InrStatsCubeKey[] {
  if (!params) return [];
  const out = new Set<InrStatsCubeKey>();
  const linked = String(params.get("linked") || "").trim().toLowerCase();
  const activated = String(params.get("activated") || "").trim().toLowerCase();
  const source = String(params.get("source") || "").trim().toLowerCase();
  const product = String(params.get("product") || "").trim().toLowerCase();

  if (activated === "1") {
    if (source === "site_web") out.add("site_web");
    else out.add("site_inrcy");
  }

  switch (linked) {
    case "ga4":
    case "gsc":
    case "stats":
      if (source === "site_web") out.add("site_web");
      else if (source === "site_inrcy") out.add("site_inrcy");
      else if (product === "ga4" || product === "gsc") out.add("site_web");
      else out.add("site_inrcy");
      break;
    case "gmb":
    case "google_business":
      out.add("gmb");
      break;
    case "facebook":
      out.add("facebook");
      break;
    case "instagram":
      out.add("instagram");
      break;
    case "linkedin":
      out.add("linkedin");
      break;
    default:
      break;
  }

  return Array.from(out);
}
