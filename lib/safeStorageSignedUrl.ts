import { supabaseAdmin } from "@/lib/supabaseAdmin";

const IMAGE_BANK_BUCKET = "inrcy-image-bank";

function normalizePath(value: unknown) {
  const path = String(value ?? "").trim().replace(/^\/+/, "");
  if (!path || path.includes("..")) return "";
  return path;
}

async function imageBankObjectExists(path: string) {
  const lastSlash = path.lastIndexOf("/");
  const folder = lastSlash >= 0 ? path.slice(0, lastSlash) : "";
  const fileName = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
  if (!fileName) return false;

  const { data, error } = await supabaseAdmin.storage
    .from(IMAGE_BANK_BUCKET)
    .list(folder, { limit: 1, search: fileName });

  return Boolean(
    !error &&
      Array.isArray(data) &&
      data.some((entry) => String(entry?.name || "") === fileName),
  );
}

/**
 * Generates a signed URL without asking Supabase to sign stale image-bank rows.
 * Other buckets keep the normal signing behavior.
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
    if (
      normalizedBucket === IMAGE_BANK_BUCKET &&
      !(await imageBankObjectExists(normalizedPath))
    ) {
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
