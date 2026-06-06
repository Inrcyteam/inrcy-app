export type InrBadgeProfileSummary = {
  userId?: string;
  logoUrl: string;
  companyLegalName: string;
  firstName: string;
  lastName: string;
  phone: string;
  contactEmail: string;
};

const DEFAULT_INRBADGE_BASE_URL = "https://app.inrcy.com";

function normalizeBaseUrl(baseUrl: string | undefined | null) {
  const trimmed = String(baseUrl || "").trim();
  if (!trimmed) return DEFAULT_INRBADGE_BASE_URL;
  return trimmed.replace(/\/+$/, "");
}

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function createInrBadgeSlug(profile: InrBadgeProfileSummary) {
  const source = [profile.companyLegalName, profile.firstName, profile.lastName]
    .map((part) => stripAccents(String(part || "").trim().toLowerCase()))
    .filter(Boolean)
    .join("-") || "mon-badge";

  const cleanName = source
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56) || "mon-badge";

  // Étape 5 : la page publique doit retrouver le bon professionnel sans ambiguïté.
  // On garde donc l'identifiant complet, compacté sans tirets, à la fin du slug.
  const compactUserId = String(profile.userId || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();

  return compactUserId ? `${cleanName}-${compactUserId}` : cleanName;
}

export function extractInrBadgeUserIdFromSlug(slug: string) {
  const cleanSlug = String(slug || "").trim().toLowerCase();
  const match = cleanSlug.match(/([0-9a-f]{32})$/i);
  if (!match) return "";
  const compact = match[1];
  return [
    compact.slice(0, 8),
    compact.slice(8, 12),
    compact.slice(12, 16),
    compact.slice(16, 20),
    compact.slice(20),
  ].join("-");
}

export function getInrBadgeBaseUrl() {
  // La page /badge/[slug] vit dans l'application : app.inrcy.com en production.
  // En local, on utilise l'origine courante pour que le QR pointe vers localhost:3000.
  const explicitBaseUrl = process.env.NEXT_PUBLIC_INRBADGE_BASE_URL;
  if (explicitBaseUrl) return normalizeBaseUrl(explicitBaseUrl);

  if (typeof window !== "undefined" && window.location?.origin) {
    return normalizeBaseUrl(window.location.origin);
  }

  return normalizeBaseUrl(
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    DEFAULT_INRBADGE_BASE_URL
  );
}

export function createInrBadgePublicUrl(profile: InrBadgeProfileSummary) {
  return `${getInrBadgeBaseUrl()}/badge/${createInrBadgeSlug(profile)}`;
}
export function createInrBadgeQrTrackingUrl(publicUrl: string) {
  const raw = String(publicUrl || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.searchParams.set("src", "qr");
    return url.toString();
  } catch {
    const separator = raw.includes("?") ? "&" : "?";
    return `${raw}${separator}src=qr`;
  }
}
