import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

function getSigningSecret() {
  return String(
    process.env.MEDIA_LIBRARY_CONTENT_SECRET ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      "",
  ).trim();
}

function signMediaId(mediaId: string) {
  const secret = getSigningSecret();
  const id = String(mediaId || "").trim();
  if (!secret || !id) return "";
  return createHmac("sha256", secret)
    .update(`inrcy-media-content:v1:${id}`)
    .digest("base64url");
}

export function buildMediaLibraryContentUrl(mediaId: string) {
  const id = String(mediaId || "").trim();
  const token = signMediaId(id);
  if (!id || !token) return null;
  return `/api/media-library/items/${encodeURIComponent(id)}/content?token=${encodeURIComponent(token)}`;
}

export function verifyMediaLibraryContentToken(mediaId: string, token: string) {
  const expected = signMediaId(mediaId);
  const received = String(token || "").trim();
  if (!expected || !received) return false;

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}
