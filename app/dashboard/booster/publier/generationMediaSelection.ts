export type GenerationMediaLibraryAccept = "all" | "image" | "video";

export const GENERATION_MEDIA_EXCLUSIVE_MESSAGE =
  "Pour la génération, choisissez soit des images, soit une vidéo.";

export function getGenerationMediaSelectionPolicy(params: {
  imageCount: number;
  hasVideo: boolean;
  maxImageCount?: number;
}) {
  const maxImageCount = Math.max(1, Math.floor(params.maxImageCount || 5));
  const imageCount = Math.max(0, Math.floor(params.imageCount || 0));
  const hasImages = imageCount > 0;
  const hasVideo = params.hasVideo === true;

  return {
    imagePickerDisabled: hasVideo || imageCount >= maxImageCount,
    videoPickerDisabled: hasVideo || hasImages,
    cameraCaptureDisabled: hasVideo || imageCount >= maxImageCount,
    allowCameraVideo: !hasImages && !hasVideo,
    libraryAccept: (hasVideo
      ? "video"
      : hasImages
        ? "image"
        : "all") as GenerationMediaLibraryAccept,
    libraryMultiple: !hasVideo,
    libraryMaxSelection: hasImages
      ? Math.max(1, maxImageCount - imageCount)
      : hasVideo
        ? 1
        : maxImageCount,
  } as const;
}

export function getGenerationMediaSelectionError(params: {
  existingImageCount: number;
  hasExistingVideo: boolean;
  selectedImageCount: number;
  selectedVideoCount: number;
}) {
  const existingImageCount = Math.max(
    0,
    Math.floor(params.existingImageCount || 0),
  );
  const selectedImageCount = Math.max(
    0,
    Math.floor(params.selectedImageCount || 0),
  );
  const selectedVideoCount = Math.max(
    0,
    Math.floor(params.selectedVideoCount || 0),
  );

  if (selectedVideoCount > 1) {
    return "Une seule vidéo peut être ajoutée à la génération.";
  }
  if (
    (selectedImageCount > 0 && selectedVideoCount > 0) ||
    (existingImageCount > 0 && selectedVideoCount > 0) ||
    (params.hasExistingVideo && selectedImageCount > 0)
  ) {
    return GENERATION_MEDIA_EXCLUSIVE_MESSAGE;
  }
  return null;
}
