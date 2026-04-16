import type { SupabaseClient } from "@supabase/supabase-js";

type LogoSource = {
  logo_path?: string | null;
  logo_url?: string | null;
};

const LOGO_BUCKET = "logos";
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 30;

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, "");
}

export function extractLogoPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  const raw = url.trim();
  if (!raw) return null;

  if (!/^https?:\/\//i.test(raw)) {
    const normalized = trimSlashes(raw.replace(new RegExp(`^${LOGO_BUCKET}\/`), ""));
    return normalized || null;
  }

  try {
    const parsed = new URL(raw);
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

export async function createSignedLogoUrl(
  supabase: SupabaseClient,
  logoPath: string | null | undefined
): Promise<string> {
  const cleanPath = trimSlashes(logoPath || "");
  if (!cleanPath) return "";

  const { data, error } = await supabase.storage
    .from(LOGO_BUCKET)
    .createSignedUrl(cleanPath, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw error || new Error("Impossible de générer l’URL du logo.");
  }

  return data.signedUrl;
}

export async function resolveProfileLogoUrl(
  supabase: SupabaseClient,
  source: LogoSource | null | undefined
): Promise<{ logoPath: string; logoUrl: string }> {
  const storedPath = trimSlashes(source?.logo_path || "");
  const legacyPath = extractLogoPathFromUrl(source?.logo_url || "") || "";
  const finalPath = storedPath || legacyPath;

  if (!finalPath) {
    return { logoPath: "", logoUrl: source?.logo_url?.trim() || "" };
  }

  try {
    const logoUrl = await createSignedLogoUrl(supabase, finalPath);
    return { logoPath: finalPath, logoUrl };
  } catch {
    return { logoPath: finalPath, logoUrl: source?.logo_url?.trim() || "" };
  }
}

export function revokeBlobUrl(url: string | null | undefined) {
  if (!url || !url.startsWith("blob:")) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // ignore
  }
}
