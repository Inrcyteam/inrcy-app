export type PinterestImageUrlItem = {
  url: string;
};

export type PinterestImageMediaSource =
  | {
      source_type: "image_url";
      url: string;
      is_standard: true;
    }
  | {
      source_type: "multiple_image_urls";
      items: PinterestImageUrlItem[];
      index: number;
    };

function normalizePublicHttpUrl(value: unknown) {
  const raw = String(value || "").trim();
  return /^https?:\/\//i.test(raw) ? raw : "";
}

export function buildPinterestImageMediaSource(
  imageUrls: readonly unknown[],
): PinterestImageMediaSource {
  const requestedUrls = imageUrls
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  if (!requestedUrls.length) {
    throw new Error("Pinterest nécessite au moins 1 image publique valide.");
  }
  if (requestedUrls.length > 5) {
    throw new Error("Pinterest accepte au maximum 5 images par épingle.");
  }

  const normalizedUrls = requestedUrls.map(normalizePublicHttpUrl);
  if (normalizedUrls.some((url) => !url)) {
    throw new Error("Pinterest nécessite des images publiques valides.");
  }

  if (normalizedUrls.length === 1) {
    return {
      source_type: "image_url",
      url: normalizedUrls[0],
      is_standard: true,
    };
  }

  return {
    source_type: "multiple_image_urls",
    items: normalizedUrls.map((url) => ({ url })),
    index: 0,
  };
}
