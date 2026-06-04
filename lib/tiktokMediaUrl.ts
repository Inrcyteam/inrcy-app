import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

const DEFAULT_TIKTOK_MEDIA_TTL_SECONDS = 60 * 60 * 6;

export type TiktokMediaVariant = "raw" | "photo";

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
  return String(input || "").trim() === "photo" ? "photo" : "raw";
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
