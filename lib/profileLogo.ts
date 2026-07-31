import type { SupabaseClient } from "@supabase/supabase-js";

type LogoSource = {
  logo_path?: string | null;
  logo_url?: string | null;
};

export const LOGO_BUCKET = "logos";
export const PROFILE_LOGO_MAX_BYTES = 20 * 1024 * 1024;
export const PROFILE_LOGO_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
] as const;
const LOGO_EXTENSION_TO_MIME: Record<string, (typeof PROFILE_LOGO_MIME_TYPES)[number]> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
};

type LogoFileLike = {
  name?: string | null;
  type?: string | null;
  size?: number | null;
};

function normalizeLogoMimeType(value: string | null | undefined) {
  const mime = String(value || "").trim().toLowerCase();
  return mime === "image/jpg" ? "image/jpeg" : mime;
}

export function getProfileLogoMimeType(file: LogoFileLike): (typeof PROFILE_LOGO_MIME_TYPES)[number] | null {
  const declaredMime = normalizeLogoMimeType(file.type);
  if ((PROFILE_LOGO_MIME_TYPES as readonly string[]).includes(declaredMime)) {
    return declaredMime as (typeof PROFILE_LOGO_MIME_TYPES)[number];
  }

  const extension = String(file.name || "")
    .split(".")
    .pop()
    ?.trim()
    .toLowerCase();

  return extension ? LOGO_EXTENSION_TO_MIME[extension] || null : null;
}

export function getProfileLogoExtension(file: LogoFileLike) {
  const mime = getProfileLogoMimeType(file);
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/svg+xml") return "svg";
  return "png";
}

export function validateProfileLogoFile(file: LogoFileLike | null | undefined): string | null {
  if (!file) return "Sélectionne un fichier logo.";

  const size = Number(file.size || 0);
  if (!size) return "Le fichier logo est vide ou illisible.";
  if (size > PROFILE_LOGO_MAX_BYTES) return "Le logo doit peser 20 Mo maximum.";
  if (!getProfileLogoMimeType(file)) {
    return "Format accepté : PNG, JPG/JPEG, WebP ou SVG.";
  }

  return null;
}

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, "");
}

export function extractLogoPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  const raw = url.trim();
  if (!raw) return null;

  if (!/^https?:\/\//i.test(raw)) {
    if (raw.startsWith("/api/public/logo")) {
      try {
        return trimSlashes(new URL(raw, "https://app.inrcy.com").searchParams.get("path") || "") || null;
      } catch {
        return null;
      }
    }
    const normalized = trimSlashes(raw.replace(new RegExp(`^${LOGO_BUCKET}\/`), ""));
    return normalized || null;
  }

  try {
    const parsed = new URL(raw);
    if (parsed.pathname === "/api/public/logo") {
      return trimSlashes(parsed.searchParams.get("path") || "") || null;
    }

    const pathname = decodeURIComponent(parsed.pathname);
    const markers = [
      `/storage/v1/object/sign/${LOGO_BUCKET}/`,
      `/storage/v1/object/public/${LOGO_BUCKET}/`,
      `/storage/v1/object/authenticated/${LOGO_BUCKET}/`,
      `/storage/v1/render/image/authenticated/${LOGO_BUCKET}/`,
      `/storage/v1/render/image/public/${LOGO_BUCKET}/`,
    ];

    for (const marker of markers) {
      const idx = pathname.indexOf(marker);
      if (idx >= 0) {
        const extracted = trimSlashes(pathname.slice(idx + marker.length));
        return extracted || null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeLogoVersion(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);
}

export function getProfileLogoVersion(url: string | null | undefined) {
  const raw = String(url || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw, "https://app.inrcy.com");
    if (parsed.pathname !== "/api/public/logo") return "";
    return normalizeLogoVersion(parsed.searchParams.get("v"));
  } catch {
    return "";
  }
}

export function createProfileLogoVersion(now = Date.now()) {
  return Math.max(0, Math.trunc(now)).toString(36);
}

export function getProfileLogoDisplayUrl(
  logoPath: string | null | undefined,
  version?: string | null,
) {
  const cleanPath = trimSlashes(logoPath || "");
  if (!cleanPath) return "";

  const params = new URLSearchParams({ path: cleanPath });
  const cleanVersion = normalizeLogoVersion(version);
  if (cleanVersion) params.set("v", cleanVersion);
  return `/api/public/logo?${params.toString()}`;
}

export async function resolveProfileLogoUrl(
  _supabase: SupabaseClient,
  source: LogoSource | null | undefined
): Promise<{ logoPath: string; logoUrl: string }> {
  const storedPath = extractLogoPathFromUrl(source?.logo_path || "") || "";
  const legacyPath = extractLogoPathFromUrl(source?.logo_url || "") || "";
  const finalPath = storedPath || legacyPath;

  if (!finalPath) {
    return { logoPath: "", logoUrl: source?.logo_url?.trim() || "" };
  }

  const logoVersion = getProfileLogoVersion(source?.logo_url);
  const logoUrl = getProfileLogoDisplayUrl(finalPath, logoVersion);
  return { logoPath: finalPath, logoUrl };
}

export function revokeBlobUrl(url: string | null | undefined) {
  if (!url || !url.startsWith("blob:")) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // ignore
  }
}
