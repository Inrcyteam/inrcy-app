const META_GRAPH_API_VERSION_PATTERN = /^v[1-9]\d*\.\d+$/;

/**
 * Version Meta validée pour les parcours Facebook + Instagram d'iNrCy.
 *
 * Rollback immédiat possible sans nouveau build métier :
 *   META_GRAPH_API_VERSION=v24.0
 */
export const META_GRAPH_API_DEFAULT_VERSION = "v25.0";

export function normalizeMetaGraphApiVersion(value: unknown) {
  const candidate = String(value || "").trim();
  return META_GRAPH_API_VERSION_PATTERN.test(candidate)
    ? candidate
    : META_GRAPH_API_DEFAULT_VERSION;
}

export const META_GRAPH_API_VERSION = normalizeMetaGraphApiVersion(
  process.env.META_GRAPH_API_VERSION,
);

export const META_GRAPH_API_BASE_URL =
  `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;
export const META_GRAPH_VIDEO_API_BASE_URL =
  `https://graph-video.facebook.com/${META_GRAPH_API_VERSION}`;
export const META_OAUTH_BASE_URL =
  `https://www.facebook.com/${META_GRAPH_API_VERSION}`;

function normalizeMetaPath(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/^\/+/, "");
}

export function buildMetaGraphUrl(path: unknown) {
  const normalizedPath = normalizeMetaPath(path);
  return normalizedPath
    ? `${META_GRAPH_API_BASE_URL}/${normalizedPath}`
    : META_GRAPH_API_BASE_URL;
}

export function buildMetaGraphVideoUrl(path: unknown) {
  const normalizedPath = normalizeMetaPath(path);
  return normalizedPath
    ? `${META_GRAPH_VIDEO_API_BASE_URL}/${normalizedPath}`
    : META_GRAPH_VIDEO_API_BASE_URL;
}

export function buildMetaOAuthUrl(path: unknown) {
  const normalizedPath = normalizeMetaPath(path);
  return normalizedPath
    ? `${META_OAUTH_BASE_URL}/${normalizedPath}`
    : META_OAUTH_BASE_URL;
}
