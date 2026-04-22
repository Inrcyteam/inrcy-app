export const ACTIVE_USER_COOKIE = "inrcy_uid";
const ACTIVE_USER_STORAGE_KEY = "inrcy_active_user_id_v1";

const ACCOUNT_CACHE_BASE_KEYS = [
  "inrcy_stats_last_channel_sync_v1",
  "inrcy_stats_last_channel_syncs_v1",
  "inrcy_generator_kpis_v1",
  "inrcy_opp30_total_v1",
  "inrcy_ui_balance_v1",
  "inrcy_docs_v1",
  "inrcy_crm_important_ids",
  "inrcy_crm_notes_by_id",
  "inrcy_profile_preview_v1",
  "inrcy_stats_server_cache_check_ui_v1",
  "inrcy_dashboard_server_cache_check_ui_v1",
  "inrcy_daily_stats_bootstrap_ui_v1",
] as const;

const ACCOUNT_CACHE_PREFIXES = [
  "inrcy_stats_cube_snapshot_v1:",
  "inrcy_stats_summary_snapshot_v2:",
] as const;

function canUseWindow() {
  return typeof window !== "undefined";
}

function readCookie(name: string): string | null {
  if (!canUseWindow()) return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1] ?? null;
  }
}

function writeCookie(name: string, value: string | null) {
  if (!canUseWindow()) return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  if (!value) {
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    return;
  }
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax${secure}`;
}

export function getActiveBrowserUserId(): string | null {
  if (!canUseWindow()) return null;

  const cookieValue = readCookie(ACTIVE_USER_COOKIE);
  if (cookieValue) return cookieValue;

  try {
    const stored = window.localStorage.getItem(ACTIVE_USER_STORAGE_KEY);
    return stored || null;
  } catch {
    return null;
  }
}

export function setActiveBrowserUserId(userId: string | null) {
  if (!canUseWindow()) return;

  if (!userId) {
    try {
      window.localStorage.removeItem(ACTIVE_USER_STORAGE_KEY);
    } catch {
      // ignore
    }
    writeCookie(ACTIVE_USER_COOKIE, null);
    return;
  }

  try {
    window.localStorage.setItem(ACTIVE_USER_STORAGE_KEY, userId);
  } catch {
    // ignore
  }
  writeCookie(ACTIVE_USER_COOKIE, userId);
}

export function accountScopedStorageKey(baseKey: string, userId = getActiveBrowserUserId()): string | null {
  if (!userId) return null;
  return `${baseKey}:uid:${userId}`;
}

export function readAccountCacheValue(baseKey: string, userId = getActiveBrowserUserId()): string | null {
  if (!canUseWindow()) return null;
  const scopedKey = accountScopedStorageKey(baseKey, userId);
  if (!scopedKey) return null;

  try {
    const sessionValue = window.sessionStorage.getItem(scopedKey);
    if (sessionValue !== null) return sessionValue;
  } catch {
    // ignore
  }

  try {
    return window.localStorage.getItem(scopedKey);
  } catch {
    return null;
  }
}

export function writeAccountCacheValue(baseKey: string, value: string, userId = getActiveBrowserUserId()) {
  if (!canUseWindow()) return;
  const scopedKey = accountScopedStorageKey(baseKey, userId);
  if (!scopedKey) return;

  try {
    window.sessionStorage.setItem(scopedKey, value);
  } catch {
    // ignore
  }

  try {
    window.localStorage.setItem(scopedKey, value);
  } catch {
    // ignore
  }
}

export function removeAccountCacheValue(baseKey: string, userId = getActiveBrowserUserId()) {
  if (!canUseWindow()) return;
  const scopedKey = accountScopedStorageKey(baseKey, userId);
  if (!scopedKey) return;

  try {
    window.sessionStorage.removeItem(scopedKey);
  } catch {
    // ignore
  }

  try {
    window.localStorage.removeItem(scopedKey);
  } catch {
    // ignore
  }
}

function purgeStorage(storage: Storage) {
  const keysToDelete: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key) continue;

    if (
      ACCOUNT_CACHE_BASE_KEYS.includes(key as (typeof ACCOUNT_CACHE_BASE_KEYS)[number]) ||
      ACCOUNT_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)) ||
      ACCOUNT_CACHE_BASE_KEYS.some((baseKey) => key.startsWith(`${baseKey}:uid:`))
    ) {
      keysToDelete.push(key);
    }
  }

  for (const key of keysToDelete) {
    try {
      storage.removeItem(key);
    } catch {
      // ignore
    }
  }
}

export function purgeAllBrowserAccountCaches() {
  if (!canUseWindow()) return;

  try {
    purgeStorage(window.sessionStorage);
  } catch {
    // ignore
  }

  try {
    purgeStorage(window.localStorage);
  } catch {
    // ignore
  }
}
