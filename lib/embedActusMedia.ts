import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

const ALLOWED_EMBED_MEDIA_BUCKETS = new Set(["booster", "inrcy-pro-media"]);
const EMBED_MEDIA_TOKEN_VERSION = "v1";

export type EmbedActusStorageReference = {
  bucket: string;
  storagePath: string;
};

function signingSecret() {
  return String(
    process.env.INRCY_WIDGETS_SIGNING_SECRET ||
      process.env.STORAGE_CONTENT_SECRET ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      "",
  ).trim();
}

function normalizeBucket(value: unknown) {
  const bucket = String(value || "").trim();
  return ALLOWED_EMBED_MEDIA_BUCKETS.has(bucket) ? bucket : "";
}

function normalizeStoragePath(value: unknown) {
  const storagePath = String(value || "")
    .trim()
    .replace(/^\/+/, "");
  if (
    !storagePath ||
    storagePath.length > 1000 ||
    storagePath.includes("..") ||
    storagePath.includes("\\")
  ) {
    return "";
  }
  return storagePath;
}

function tokenPayload(bucket: string, storagePath: string) {
  return `inrcy-embed-actus-media:${EMBED_MEDIA_TOKEN_VERSION}:${bucket}:${storagePath}`;
}

function signReference(bucket: string, storagePath: string) {
  const secret = signingSecret();
  if (!secret) return "";
  return createHmac("sha256", secret)
    .update(tokenPayload(bucket, storagePath))
    .digest("base64url");
}

export function normalizeEmbedActusStorageReference(
  bucketValue: unknown,
  pathValue: unknown,
): EmbedActusStorageReference | null {
  const bucket = normalizeBucket(bucketValue);
  let storagePath = normalizeStoragePath(pathValue);
  if (!bucket || !storagePath) return null;

  const bucketPrefix = `${bucket}/`;
  if (storagePath.startsWith(bucketPrefix)) {
    storagePath = normalizeStoragePath(storagePath.slice(bucketPrefix.length));
  }
  if (!storagePath) return null;

  return { bucket, storagePath };
}

export function extractEmbedActusStorageReference(
  input: unknown,
): EmbedActusStorageReference | null {
  const raw = String(input || "").trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const configuredSupabaseUrl = String(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  ).trim();
  if (configuredSupabaseUrl) {
    try {
      const expected = new URL(configuredSupabaseUrl);
      if (url.origin !== expected.origin) return null;
    } catch {
      return null;
    }
  }

  let pathname = url.pathname;
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // Keep the encoded path if decoding fails.
  }

  const match = pathname.match(
    /\/storage\/v1\/(?:object|render\/image)\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/,
  );
  if (!match?.[1] || !match[2]) return null;

  return normalizeEmbedActusStorageReference(match[1], match[2]);
}

export function buildEmbedActusMediaUrl(
  bucketValue: unknown,
  pathValue: unknown,
) {
  const reference = normalizeEmbedActusStorageReference(
    bucketValue,
    pathValue,
  );
  if (!reference) return "";

  const token = signReference(reference.bucket, reference.storagePath);
  if (!token) return "";

  const params = new URLSearchParams({
    bucket: reference.bucket,
    path: reference.storagePath,
    token,
  });
  return `/embed/actus/media?${params.toString()}`;
}

export function buildStableEmbedActusMediaUrl(params: {
  sourceUrl?: unknown;
  bucket?: unknown;
  storagePath?: unknown;
}) {
  const explicitReference = normalizeEmbedActusStorageReference(
    params.bucket,
    params.storagePath,
  );
  const reference =
    explicitReference || extractEmbedActusStorageReference(params.sourceUrl);
  if (!reference) return "";
  return buildEmbedActusMediaUrl(reference.bucket, reference.storagePath);
}

export function verifyEmbedActusMediaToken(
  bucketValue: unknown,
  pathValue: unknown,
  tokenValue: unknown,
) {
  const reference = normalizeEmbedActusStorageReference(
    bucketValue,
    pathValue,
  );
  const token = String(tokenValue || "").trim();
  if (!reference || !token) return false;

  const expected = signReference(reference.bucket, reference.storagePath);
  if (!expected) return false;

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(token);
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}
