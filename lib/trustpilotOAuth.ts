import "server-only";

import { asNumber, asRecord, asString } from "@/lib/tsSafe";
import { encryptToken, tryDecryptToken } from "@/lib/oauthCrypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const TRUSTPILOT_PROVIDER = "trustpilot";
export const TRUSTPILOT_SOURCE = "trustpilot";
export const TRUSTPILOT_PRODUCT = "trustpilot";

export type TrustpilotTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number | string;
  token_type?: string;
  error?: string;
  error_description?: string;
  message?: string;
};

export type TrustpilotBusinessUnit = {
  id: string;
  displayName: string;
  name: string | null;
  domain: string | null;
  profileUrl: string | null;
  evaluateUrl: string | null;
  numberOfReviews: number | null;
  trustScore: number | null;
  stars: number | null;
  raw?: unknown;
};

function trimSlash(value: string) {
  return value.replace(/\/+$/g, "");
}

function cleanDomain(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/g, "")
    .trim()
    .toLowerCase();
}

function basicAuthHeader(clientId: string, clientSecret: string) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")}`;
}

function numberOrNull(value: unknown) {
  const direct = asNumber(value);
  return Number.isFinite(Number(direct)) ? Number(direct) : null;
}

function getReviewStats(value: unknown) {
  const source = asRecord(value);
  const stars = asRecord(source.stars);
  return {
    count: numberOrNull(source.totalReviewCount) ?? numberOrNull(source.numberOfReviews) ?? numberOrNull(source.reviewCount),
    score: numberOrNull(source.trustScore) ?? numberOrNull(source.score),
    stars: numberOrNull(stars.value) ?? numberOrNull(source.stars),
  };
}

export function getTrustpilotClientId() {
  return String(process.env.TRUSTPILOT_CLIENT_ID || process.env.TRUSTPILOT_API_KEY || "").trim();
}

export function getTrustpilotClientSecret() {
  return String(process.env.TRUSTPILOT_CLIENT_SECRET || process.env.TRUSTPILOT_API_SECRET || "").trim();
}

export function getTrustpilotRedirectUri(requestUrl?: string) {
  const explicit = String(process.env.TRUSTPILOT_REDIRECT_URI || "").trim();
  if (explicit) return explicit;
  const origin = process.env.NEXT_PUBLIC_SITE_URL
    ? trimSlash(process.env.NEXT_PUBLIC_SITE_URL)
    : requestUrl
      ? new URL(requestUrl).origin
      : "";
  return `${origin}/api/integrations/trustpilot/callback`;
}

export function buildTrustpilotReviewUrl(domain: unknown) {
  const clean = cleanDomain(domain);
  return clean ? `https://fr.trustpilot.com/review/${encodeURIComponent(clean)}` : null;
}

async function trustpilotPostForm(body: Record<string, string>): Promise<TrustpilotTokenResponse> {
  const clientId = getTrustpilotClientId();
  const clientSecret = getTrustpilotClientSecret();
  if (!clientId || !clientSecret) throw new Error("Configuration Trustpilot incomplète côté serveur.");

  const res = await fetch("https://api.trustpilot.com/v1/oauth/oauth-business-users-for-applications/accesstoken", {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
    cache: "no-store",
  });

  const json = (await res.json().catch(() => ({}))) as TrustpilotTokenResponse;
  if (!res.ok) {
    throw new Error(json.error_description || json.message || json.error || "Trustpilot n'a pas accepté la connexion.");
  }
  return json;
}

export async function exchangeTrustpilotAuthorizationCode(code: string, requestUrl?: string) {
  return trustpilotPostForm({
    grant_type: "authorization_code",
    code,
    redirect_uri: getTrustpilotRedirectUri(requestUrl),
  });
}

export async function refreshTrustpilotAccessToken(refreshToken: string) {
  const clientId = getTrustpilotClientId();
  const clientSecret = getTrustpilotClientSecret();
  if (!clientId || !clientSecret) throw new Error("Configuration Trustpilot incomplète côté serveur.");

  const res = await fetch("https://api.trustpilot.com/v1/oauth/oauth-business-users-for-applications/refresh", {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    cache: "no-store",
  });

  const json = (await res.json().catch(() => ({}))) as TrustpilotTokenResponse;
  if (!res.ok) {
    throw new Error(json.error_description || json.message || json.error || "Actualisation Trustpilot impossible.");
  }
  return json;
}

export function buildTrustpilotTokenDates(token: TrustpilotTokenResponse) {
  const expiresIn = numberOrNull(token.expires_in);
  return {
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
  };
}

async function trustpilotPublicGet<T = any>(path: string): Promise<T> {
  const apiKey = getTrustpilotClientId();
  if (!apiKey) throw new Error("Clé API Trustpilot manquante.");

  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const res = await fetch(`https://api.trustpilot.com/v1${cleanPath}`, {
    method: "GET",
    headers: { apikey: apiKey },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const rec = asRecord(json);
    throw new Error(asString(rec.message) || asString(rec.error_description) || asString(rec.error) || "Appel Trustpilot impossible.");
  }
  return json as T;
}

export async function trustpilotPrivateGet<T = any>(path: string, accessToken: string): Promise<T> {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const res = await fetch(`https://api.trustpilot.com/v1${cleanPath}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const rec = asRecord(json);
    throw new Error(asString(rec.message) || asString(rec.error_description) || asString(rec.error) || "Appel Trustpilot impossible.");
  }
  return json as T;
}

function normalizeBusinessUnit(raw: unknown): TrustpilotBusinessUnit | null {
  const item = asRecord(raw);
  const nameRecord = asRecord(item.name);
  const referringNames = Array.isArray(nameRecord.referring) ? nameRecord.referring : [];
  const identifyingName =
    asString(item.identifyingName) ||
    asString(nameRecord.identifying) ||
    referringNames.map(asString).find(Boolean) ||
    null;
  const links = Array.isArray(item.links) ? item.links : Array.isArray(item.link) ? item.link : [];
  const webLinks = asRecord(item.webLinks);
  const stats = getReviewStats(item);
  const id = asString(item.id) || asString(item.businessUnitId) || "";
  const name = asString(item.displayName) || asString(item.companyName) || identifyingName || asString(item.name) || null;
  const domain = cleanDomain(item.domain || item.websiteUrl || item.website || identifyingName) || null;
  const profileLink = links.find((link) => {
    const rel = asString(asRecord(link).rel);
    return rel === "profile" || rel === "profile-url" || rel === "public-profile";
  });
  const profileUrl =
    asString(item.profileUrl) ||
    asString(webLinks.profileUrl) ||
    asString(asRecord(profileLink).href) ||
    buildTrustpilotReviewUrl(domain);
  const evaluateUrl = asString(item.evaluateUrl) || asString(webLinks.evaluateUrl) || (domain ? `https://fr.trustpilot.com/evaluate/${encodeURIComponent(domain)}` : null);

  if (!id && !domain && !profileUrl) return null;
  return {
    id,
    displayName: name || domain || "Compte Trustpilot",
    name,
    domain,
    profileUrl,
    evaluateUrl,
    numberOfReviews: stats.count,
    trustScore: stats.score,
    stars: stats.stars,
    raw,
  };
}

export async function findTrustpilotBusinessUnitByDomain(domain: string) {
  const clean = cleanDomain(domain);
  if (!clean) throw new Error("Domaine Trustpilot manquant.");

  const units = await searchTrustpilotBusinessUnits(clean);
  const exact = units.find((unit) => cleanDomain(unit.domain || unit.name || unit.displayName) === clean);
  return exact || units[0] || null;
}

export async function searchTrustpilotBusinessUnits(query: string) {
  const clean = String(query || "").trim();
  if (!clean) return [] as TrustpilotBusinessUnit[];
  const url = new URL("/business-units/search", "https://api.trustpilot.com/v1");
  url.searchParams.set("query", clean);
  const json = asRecord(await trustpilotPublicGet(`${url.pathname}${url.search}`));
  const items = Array.isArray(json.businessUnits) ? json.businessUnits : Array.isArray(json.items) ? json.items : [];
  return items.map(normalizeBusinessUnit).filter(Boolean) as TrustpilotBusinessUnit[];
}

export async function fetchTrustpilotBusinessUnitPublic(businessUnitId: string) {
  const cleanId = String(businessUnitId || "").trim();
  if (!cleanId) return null;
  const [unitRaw, linksRaw] = await Promise.all([
    trustpilotPublicGet(`/business-units/${encodeURIComponent(cleanId)}`).catch(() => ({})),
    trustpilotPublicGet(`/business-units/${encodeURIComponent(cleanId)}/web-links?locale=fr-FR`).catch(() => ({})),
  ]);
  const unit = normalizeBusinessUnit({ ...asRecord(unitRaw), webLinks: linksRaw });
  return unit;
}

export async function getTrustpilotIntegration(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", TRUSTPILOT_PROVIDER)
    .eq("source", TRUSTPILOT_SOURCE)
    .eq("product", TRUSTPILOT_PRODUCT)
    .maybeSingle();
  if (error) throw error;
  return asRecord(data);
}

function isExpired(expiresAt: unknown, skewSeconds = 120) {
  const iso = asString(expiresAt);
  if (!iso) return false;
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return false;
  return time <= Date.now() + skewSeconds * 1000;
}

export async function getTrustpilotAccessToken(userId: string) {
  const row = await getTrustpilotIntegration(userId);
  const status = asString(row.status);
  if (status !== "connected" && status !== "account_connected") return "";

  let accessToken = tryDecryptToken(asString(row.access_token_enc) || "") || "";
  const refreshToken = tryDecryptToken(asString(row.refresh_token_enc) || "") || "";
  if (accessToken && !isExpired(row.expires_at)) return accessToken;
  if (!refreshToken) return accessToken;

  const refreshed = await refreshTrustpilotAccessToken(refreshToken);
  const nextAccessToken = asString(refreshed.access_token) || "";
  if (!nextAccessToken) return accessToken;
  const nextRefreshToken = asString(refreshed.refresh_token) || refreshToken;
  const dates = buildTrustpilotTokenDates(refreshed);
  const meta = {
    ...asRecord(row.meta),
    trustpilot_token_refreshed_at: new Date().toISOString(),
  };

  await supabaseAdmin
    .from("integrations")
    .update({
      access_token_enc: encryptToken(nextAccessToken),
      refresh_token_enc: nextRefreshToken ? encryptToken(nextRefreshToken) : row.refresh_token_enc || null,
      expires_at: dates.expiresAt || row.expires_at || null,
      meta,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", TRUSTPILOT_PROVIDER)
    .eq("source", TRUSTPILOT_SOURCE)
    .eq("product", TRUSTPILOT_PRODUCT);

  accessToken = nextAccessToken;
  return accessToken;
}
