import { getActiveBrowserUserId } from "@/lib/browserAccountCache";

export type PinterestUiBoard = {
  id: string;
  name: string;
};

type PinterestBoardCacheEntry = {
  boards: PinterestUiBoard[];
  defaultBoardId: string;
  updatedAt: number;
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const boardCache = new Map<string, PinterestBoardCacheEntry>();

function cacheKey() {
  return getActiveBrowserUserId() || "current";
}

function normalizeBoards(value: unknown): PinterestUiBoard[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const boards: PinterestUiBoard[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const id = String(record.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    boards.push({
      id,
      name:
        String(record.name || "Tableau Pinterest").trim() ||
        "Tableau Pinterest",
    });
  }

  return boards;
}

export function readPinterestBoardUiCache(): PinterestBoardCacheEntry | null {
  const entry = boardCache.get(cacheKey());
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > CACHE_TTL_MS) {
    boardCache.delete(cacheKey());
    return null;
  }
  return {
    boards: entry.boards.map((board) => ({ ...board })),
    defaultBoardId: entry.defaultBoardId,
    updatedAt: entry.updatedAt,
  };
}

export function writePinterestBoardUiCache(
  boards: unknown,
  defaultBoardId: unknown,
) {
  boardCache.set(cacheKey(), {
    boards: normalizeBoards(boards),
    defaultBoardId: String(defaultBoardId || "").trim(),
    updatedAt: Date.now(),
  });
}

export function clearPinterestBoardUiCache() {
  boardCache.delete(cacheKey());
}
