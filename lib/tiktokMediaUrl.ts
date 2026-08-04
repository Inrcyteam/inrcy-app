import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

const DEFAULT_TIKTOK_MEDIA_TTL_SECONDS = 60 * 60 * 6;

export type TiktokMediaVariant = "raw" | "photo" | "photo_locked";

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

function normalizeVariant(input: unknown): TiktokMediaVariant {
  const value = String(input || "").trim();
  if (value === "photo_locked") return "photo_locked";
  if (value === "photo") return "photo";
  return "raw";
}

function signaturePayload(path: string, exp: number, variant: TiktokMediaVariant) {
  return `${path}.${exp}.${variant}`;
}

function signPayload(path: string, exp: number, variant: TiktokMediaVariant = "raw") {
  const secret = getSigningSecret();
  if (!secret) throw new Error("Configuration média TikTok incomplète.");
  return base64url(createHmac("sha256", secret).update(signaturePayload(path, exp, variant)).digest());
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

export function verifyTiktokMediaSignature(path: string, exp: number, signature: string, variantInput?: unknown) {
  const cleanPath = String(path || "").trim();
  const cleanSignature = String(signature || "").trim();
  const variant = normalizeVariant(variantInput);
  if (!cleanPath || !cleanSignature || !Number.isFinite(exp)) return false;
  if (exp * 1000 < Date.now()) return false;

  try {
    const expected = signPayload(cleanPath, exp, variant);
    const a = Buffer.from(expected);
    const b = Buffer.from(cleanSignature);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function isPublicHttpOrigin(input: string | undefined) {
  const origin = safeOrigin(input);
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:") return false;
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function getAppBaseUrl(requestUrl?: string) {
  const candidates = [
    process.env.TIKTOK_MEDIA_BASE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "",
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
    process.env.TIKTOK_REDIRECT_URI,
    requestUrl,
    "https://app.inrcy.com",
  ];

  const publicBase = candidates.find((candidate) => isPublicHttpOrigin(candidate));
  return safeOrigin(publicBase).replace(/\/+$/g, "");
}

export function buildTiktokMediaProxyUrl(
  requestUrl: string | undefined,
  storagePath: string,
  ttlSeconds = DEFAULT_TIKTOK_MEDIA_TTL_SECONDS,
  options?: { variant?: TiktokMediaVariant },
) {
  const cleanPath = String(storagePath || "").trim();
  if (!cleanPath) return "";

  const baseUrl = getAppBaseUrl(requestUrl);
  if (!baseUrl) return "";

  const variant = normalizeVariant(options?.variant);
  const exp = Math.floor(Date.now() / 1000) + Math.max(300, ttlSeconds);
  const sig = signPayload(cleanPath, exp, variant);
  const url = new URL(`${baseUrl}/api/media/tiktok`);
  url.searchParams.set("path", cleanPath);
  url.searchParams.set("exp", String(exp));
  url.searchParams.set("sig", sig);
  if (variant !== "raw") url.searchParams.set("variant", variant);
  return url.toString();
}
