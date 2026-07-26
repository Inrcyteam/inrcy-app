import { supabaseAdmin } from "@/lib/supabaseAdmin";

function normalizePath(value: unknown) {
  const path = String(value ?? "").trim().replace(/^\/+/, "");
  if (!path || path.includes("..") || path.includes("\\")) return "";
  return path;
}

export type StorageObjectProbe = "exists" | "missing" | "unknown";

type SignedUrlCacheEntry = {
  url: string;
  validUntil: number;
};

const signedUrlCache = new Map<string, SignedUrlCacheEntry>();
const signingInFlight = new Map<string, Promise<string | null>>();
const MAX_CACHE_ENTRIES = 500;
const RETRY_DELAYS_MS = [180, 550, 1_250] as const;

function cacheKey(bucket: string, path: string, expiresIn: number) {
  return `${bucket}:${path}:${expiresIn}`;
}

function pruneCache(now: number) {
  for (const [key, entry] of signedUrlCache) {
    if (entry.validUntil <= now) signedUrlCache.delete(key);
  }

  if (signedUrlCache.size <= MAX_CACHE_ENTRIES) return;
  const overflow = signedUrlCache.size - MAX_CACHE_ENTRIES;
  let removed = 0;
  for (const key of signedUrlCache.keys()) {
    signedUrlCache.delete(key);
    removed += 1;
    if (removed >= overflow) break;
  }
}

function isMissingObjectError(error: unknown) {
  const candidate = error as { statusCode?: string | number; status?: number; message?: string; error?: string } | null;
  const status = Number(candidate?.statusCode || candidate?.status || 0);
  const message = `${candidate?.message || ""} ${candidate?.error || ""}`.toLowerCase();
  return status === 400 || status === 404 || message.includes("not found") || message.includes("does not exist");
}

function isTransientStorageError(error: unknown) {
  const candidate = error as { statusCode?: string | number; status?: number; message?: string; error?: string } | null;
  const status = Number(candidate?.statusCode || candidate?.status || 0);
  const message = `${candidate?.message || ""} ${candidate?.error || ""}`.toLowerCase();
  return status === 408 || status === 429 || status >= 500 || message.includes("timeout") || message.includes("fetch failed") || message.includes("econnreset");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exact object probe through Storage's authenticated object endpoint.
 * This avoids folder listings and does not generate a signed URL.
 */
export async function probeStorageObject(
  bucket: string,
  storagePath: string,
): Promise<StorageObjectProbe> {
  const normalizedBucket = String(bucket || "").trim();
  const path = normalizePath(storagePath);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!normalizedBucket || !path) return "missing";
  if (!supabaseUrl || !serviceRoleKey) return "unknown";

  try {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const response = await fetch(
      `${supabaseUrl}/storage/v1/object/authenticated/${encodeURIComponent(normalizedBucket)}/${encodedPath}`,
      {
        method: "HEAD",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        cache: "no-store",
      },
    );

    if (response.ok) return "exists";
    if (response.status === 400 || response.status === 404) return "missing";
    return "unknown";
  } catch {
    return "unknown";
  }
}

async function signWithRetry(bucket: string, path: string, expiresIn: number): Promise<string | null> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const { data, error } = await supabaseAdmin.storage
        .from(bucket)
        .createSignedUrl(path, expiresIn);

      if (!error && data?.signedUrl) return data.signedUrl;
      lastError = error;

      // A stale/non-existent path is deterministic: retrying only creates more 400s.
      if (isMissingObjectError(error)) return null;
      if (!isTransientStorageError(error)) return null;
    } catch (error) {
      lastError = error;
      if (!isTransientStorageError(error)) return null;
    }

    if (attempt < RETRY_DELAYS_MS.length) {
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }

  console.error("[storage-sign] unavailable after retries", {
    bucket,
    path,
    error: lastError instanceof Error ? lastError.message : String(lastError || "unknown"),
  });
  return null;
}

/**
 * Central signed-URL service:
 * - no preliminary folder listing;
 * - one in-flight request per object (prevents request storms);
 * - retries only transient 5xx/timeout failures;
 * - never retries deterministic 400/404 stale paths;
 * - caches the URL for less than its real TTL so callers do not keep re-signing it.
 */
export async function createSafeStorageSignedUrl(
  bucket: string,
  storagePath: string,
  expiresIn: number,
) {
  const normalizedBucket = String(bucket || "").trim();
  const normalizedPath = normalizePath(storagePath);
  const ttlSeconds = Math.max(60, Math.floor(Number(expiresIn) || 0));
  if (!normalizedBucket || !normalizedPath) return null;

  const key = cacheKey(normalizedBucket, normalizedPath, ttlSeconds);
  const now = Date.now();
  pruneCache(now);

  const cached = signedUrlCache.get(key);
  if (cached && cached.validUntil > now) return cached.url;

  const active = signingInFlight.get(key);
  if (active) return active;

  const request = signWithRetry(normalizedBucket, normalizedPath, ttlSeconds)
    .then((url) => {
      if (url) {
        // Keep a safety margin: never serve a URL close to expiration.
        const cacheSeconds = Math.max(30, Math.min(ttlSeconds - 30, Math.floor(ttlSeconds * 0.8)));
        signedUrlCache.set(key, { url, validUntil: Date.now() + cacheSeconds * 1_000 });
      }
      return url;
    })
    .finally(() => {
      signingInFlight.delete(key);
    });

  signingInFlight.set(key, request);
  return request;
}
