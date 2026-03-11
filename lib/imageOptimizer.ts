import sharp from "sharp";

const INSTAGRAM_MAX_BYTES = 8 * 1024 * 1024;
const INSTAGRAM_WIDTH = 1080;
const INSTAGRAM_HEIGHT = 1350;

type OptimizeResult = {
  buffer: Buffer;
  mime: "image/jpeg";
  extension: "jpg";
  width: number;
  height: number;
  size: number;
  quality: number;
  sourceFormat?: string;
};

export async function optimizeForInstagram(inputBuffer: Buffer): Promise<OptimizeResult> {
  const src = sharp(inputBuffer, { failOn: "none" }).rotate();
  const meta = await src.metadata();

  let pipeline = src.resize({
    width: INSTAGRAM_WIDTH,
    height: INSTAGRAM_HEIGHT,
    fit: "cover",
    position: "centre",
    withoutEnlargement: false,
  });

  let quality = 86;
  let output = await pipeline
    .jpeg({ quality, mozjpeg: true, progressive: true, chromaSubsampling: "4:2:0" })
    .toBuffer();

  while (output.byteLength > INSTAGRAM_MAX_BYTES && quality > 52) {
    quality -= 6;
    output = await pipeline
      .jpeg({ quality, mozjpeg: true, progressive: true, chromaSubsampling: "4:2:0" })
      .toBuffer();
  }

  if (output.byteLength > INSTAGRAM_MAX_BYTES) {
    pipeline = src.resize({
      width: 900,
      height: 1125,
      fit: "cover",
      position: "centre",
      withoutEnlargement: false,
    });
    quality = 78;
    output = await pipeline
      .jpeg({ quality, mozjpeg: true, progressive: true, chromaSubsampling: "4:2:0" })
      .toBuffer();
  }

  return {
    buffer: output,
    mime: "image/jpeg",
    extension: "jpg",
    width: INSTAGRAM_WIDTH,
    height: INSTAGRAM_HEIGHT,
    size: output.byteLength,
    quality,
    sourceFormat: meta.format,
  };
}
