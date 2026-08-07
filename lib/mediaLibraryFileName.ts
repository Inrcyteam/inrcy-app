export type MediaLibraryFileNameItem = {
  media_type: "image" | "video";
  original_file_name?: string | null;
  storage_path?: string | null;
  title?: string | null;
};

function storageFileName(value: unknown) {
  const raw =
    String(value || "")
      .replace(/\\/g, "/")
      .split("/")
      .pop() || "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function ensureVideoFileExtension(value: string) {
  const name = value || "video-inrcy";
  if (/\.(mp4|m4v|mov)$/i.test(name)) return name;
  return `${name.replace(/\.[^.]*$/, "")}.mp4`;
}

/**
 * RecrÃ©e un vrai nom de fichier Ã  partir d'une ligne de MÃ©diathÃ¨que.
 * `title` est un libellÃ© d'affichage et perd parfois volontairement
 * l'extension ; il ne doit pas passer avant le nom binaire stockÃ©.
 */
export function buildMediaLibraryDownloadFileName(
  item: MediaLibraryFileNameItem,
) {
  const originalName = String(item.original_file_name || "").trim();
  const storedName = storageFileName(item.storage_path);
  const title = String(item.title || "").trim();
  const fallback =
    item.media_type === "video" ? "video-inrcy.mp4" : "image-inrcy.jpg";
  const candidate = originalName || storedName || title || fallback;
  return item.media_type === "video"
    ? ensureVideoFileExtension(candidate)
    : candidate;
}
