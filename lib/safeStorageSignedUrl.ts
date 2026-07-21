import { supabaseAdmin } from "@/lib/supabaseAdmin";

function normalizePath(value: unknown) {
  const path = String(value ?? "").trim().replace(/^\/+/, "");
  if (!path || path.includes("..")) return "";
  return path;
}

export type StorageObjectProbe = "exists" | "missing" | "unknown";

export async function probeStorageObject(
  bucket: string,
  storagePath: string,
): Promise<StorageObjectProbe> {
  const normalizedBucket = String(bucket || "").trim();
  const path = normalizePath(storagePath);
  if (!normalizedBucket || !path) return "missing";

  const lastSlash = path.lastIndexOf("/");
  const folder = lastSlash >= 0 ? path.slice(0, lastSlash) : "";
  const fileName = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
  if (!fileName) return "missing";

  const { data, error } = await supabaseAdmin.storage
    .from(normalizedBucket)
    .list(folder, { limit: 100, search: fileName });

  if (error || !Array.isArray(data)) return "unknown";
  return data.some((entry) => String(entry?.name || "") === fileName)
    ? "exists"
    : "missing";
}

/**
 * Generates a signed URL only for an object that still exists.
 * Supabase can sign a stale path and only return the failure when a browser
 * later requests the URL, which creates noisy Storage 400 warnings.
 */
export async function createSafeStorageSignedUrl(
  bucket: string,
  storagePath: string,
  expiresIn: number,
) {
  const normalizedBucket = String(bucket || "").trim();
  const normalizedPath = normalizePath(storagePath);
  if (!normalizedBucket || !normalizedPath) return null;

  try {
    if ((await probeStorageObject(normalizedBucket, normalizedPath)) !== "exists") {
      return null;
    }

    const { data, error } = await supabaseAdmin.storage
      .from(normalizedBucket)
      .createSignedUrl(normalizedPath, expiresIn);
    return error ? null : data?.signedUrl || null;
  } catch {
    return null;
  }
}
