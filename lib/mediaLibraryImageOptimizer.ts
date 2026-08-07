import { rm, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  MEDIA_LIBRARY_IMAGE_OUTPUT_MAX_BYTES,
  normalizeMediaLibraryOptimizationTarget,
} from "@/lib/mediaLibraryOptimizationPolicy";

export type MediaLibraryImageOptimizationResult = {
  outputPath: string;
  sizeBytes: number;
  width: number;
  height: number;
  mimeType: "image/jpeg";
  extension: "jpg";
  quality: number;
};

const IMAGE_PROFILES = [
  { maxSide: 8_000, quality: 90 },
  { maxSide: 6_000, quality: 82 },
  { maxSide: 4_096, quality: 74 },
  { maxSide: 3_072, quality: 66 },
  { maxSide: 2_048, quality: 58 },
] as const;

export async function optimizeMediaLibraryImage(params: {
  inputPath: string;
  outputDirectory: string;
  targetBytes?: number | null;
  onProgress?: (progress: number, stage: string) => void;
}): Promise<MediaLibraryImageOptimizationResult> {
  const targetBytes = normalizeMediaLibraryOptimizationTarget({
    mediaType: "image",
    targetBytes: params.targetBytes,
  });
  const metadata = await sharp(params.inputPath, {
    failOn: "error",
    limitInputPixels: 268_402_689,
  }).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("image_dimensions_unavailable");
  }

  for (let index = 0; index < IMAGE_PROFILES.length; index += 1) {
    const profile = IMAGE_PROFILES[index];
    const outputPath = path.join(
      params.outputDirectory,
      `compressed-${index + 1}.jpg`,
    );
    params.onProgress?.(
      25 + index * 13,
      index === 0
        ? "Compression de l’image"
        : "Ajustement de la compression",
    );

    const info = await sharp(params.inputPath, {
      failOn: "error",
      limitInputPixels: 268_402_689,
    })
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize({
        width: profile.maxSide,
        height: profile.maxSide,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        quality: profile.quality,
        progressive: true,
        mozjpeg: true,
        chromaSubsampling: "4:2:0",
      })
      .toFile(outputPath);

    const sizeBytes = Number((await stat(outputPath)).size || 0);
    if (
      sizeBytes > 0 &&
      sizeBytes <= targetBytes &&
      sizeBytes <= MEDIA_LIBRARY_IMAGE_OUTPUT_MAX_BYTES
    ) {
      params.onProgress?.(88, "Vérification de l’image compressée");
      return {
        outputPath,
        sizeBytes,
        width: info.width,
        height: info.height,
        mimeType: "image/jpeg",
        extension: "jpg",
        quality: profile.quality,
      };
    }
    await rm(outputPath, { force: true }).catch(() => undefined);
  }

  throw new Error("image_output_too_large");
}
