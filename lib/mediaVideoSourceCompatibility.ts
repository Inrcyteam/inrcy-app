const DIRECT_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/x-m4v",
  "application/mp4",
]);

const DIRECT_VIDEO_EXTENSIONS = new Set(["mp4", "m4v"]);

function cleanMimeType(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split(";")[0]
    ?.trim();
}

function fileExtension(value: unknown) {
  const clean = String(value || "")
    .trim()
    .toLowerCase()
    .split(/[?#]/)[0];
  const match = clean.match(/\.([a-z0-9]{1,8})$/);
  return match?.[1] || "";
}

function isKnownPositiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * MP4/M4V est le conteneur commun aux APIs de publication utilisées par
 * Booster. Le contrôle de taille reste optionnel pour les usages qui vérifient
 * uniquement le conteneur (analyse IA, affichage, etc.).
 *
 * Pour une publication directe, les appelants doivent fournir `sizeBytes` et
 * `maxBytes`. Une taille inconnue ou supérieure au plafond force alors la
 * normalisation serveur au lieu d'envoyer silencieusement la source originale.
 */
export function canPublishVideoSourceDirectly(input: {
  name?: unknown;
  type?: unknown;
  mimeType?: unknown;
  storagePath?: unknown;
  sizeBytes?: unknown;
  maxBytes?: unknown;
}) {
  const mimeType = cleanMimeType(input.type || input.mimeType);
  const extension =
    fileExtension(input.name) || fileExtension(input.storagePath);
  const compatibleContainer =
    DIRECT_VIDEO_MIME_TYPES.has(mimeType) ||
    DIRECT_VIDEO_EXTENSIONS.has(extension);
  if (!compatibleContainer) return false;

  const maxBytes = isKnownPositiveNumber(input.maxBytes);
  if (!maxBytes) return true;

  const sizeBytes = isKnownPositiveNumber(input.sizeBytes);
  return Boolean(sizeBytes && sizeBytes <= maxBytes);
}
