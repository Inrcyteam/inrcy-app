import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

const DEFAULT_TIKTOK_MEDIA_TTL_SECONDS = 60 * 60 * 6;

function getSigningSecret() {
  return (
    process.env.TIKTOK_MEDIA_SIGNING_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.TIKTOK_CLIENT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  );
}

function base64url(value: Buffer | string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signPayload(path: string, exp: number) {
  const secret = getSigningSecret();
  if (!secret) throw new Error("Configuration média TikTok incomplète.");
  return base64url(createHmac("sha256", secret).update(`${path}.${exp}`).digest());
}

function safeOrigin(input: string | undefined) {
  const value = String(input || "").trim();
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

export function verifyTiktokMediaSignature(path: string, exp: number, signature: string) {
  const cleanPath = String(path || "").trim();
  const cleanSignature = String(signature || "").trim();
  if (!cleanPath || !cleanSignature || !Number.isFinite(exp)) return false;
  if (exp * 1000 < Date.now()) return false;

  try {
    const expected = signPayload(cleanPath, exp);
    const a = Buffer.from(expected);
    const b = Buffer.from(cleanSignature);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function getAppBaseUrl(requestUrl?: string) {
  const base =
    process.env.TIKTOK_MEDIA_BASE_URL ||
    safeOrigin(process.env.TIKTOK_REDIRECT_URI) ||
    safeOrigin(requestUrl) ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.APP_URL ||
    "";
  return base.replace(/\/+$/g, "");
}

export function buildTiktokMediaProxyUrl(
  requestUrl: string | undefined,
  storagePath: string,
  ttlSeconds = DEFAULT_TIKTOK_MEDIA_TTL_SECONDS,
) {
  const cleanPath = String(storagePath || "").trim();
  if (!cleanPath) return "";

  const baseUrl = getAppBaseUrl(requestUrl);
  if (!baseUrl) return "";

  const exp = Math.floor(Date.now() / 1000) + Math.max(300, ttlSeconds);
  const sig = signPayload(cleanPath, exp);
  const url = new URL(`${baseUrl}/api/media/tiktok`);
  url.searchParams.set("path", cleanPath);
  url.searchParams.set("exp", String(exp));
  url.searchParams.set("sig", sig);
  return url.toString();
}
