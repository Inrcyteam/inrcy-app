export type ParsedFfmpegVideoStreamMetadata = {
  width: number;
  height: number;
  codec: string;
  pixelFormat: string;
  frameRate: number;
};

/** Parse uniquement la ligne vidÃ©o stable de la sortie `ffmpeg -i`. */
export function parseFfmpegVideoStreamMetadata(
  stderr: string,
): ParsedFfmpegVideoStreamMetadata {
  const line = stderr
    .split(/\r?\n/)
    .find((entry) => /Stream .*Video:/i.test(entry));
  if (!line) {
    return {
      width: 0,
      height: 0,
      codec: "unknown",
      pixelFormat: "unknown",
      frameRate: 0,
    };
  }
  const dimensions = line.match(/(?:^|\D)(\d{2,5})x(\d{2,5})(?:\D|$)/);
  const codec = line.match(/Video:\s*([^,\s]+)/i)?.[1] || "unknown";
  const pixelFormat =
    line.match(
      /Video:[^\n]*?,\s*([a-z0-9_]+)(?:\([^)]*\))?,\s*\d{2,5}x\d{2,5}/i,
    )?.[1] || "unknown";
  // `fps` est la cadence effective. `tbr` est volontairement ignorÃ© car il
  // peut seulement reflÃ©ter le timebase du conteneur.
  const frameRate = Number(
    line.match(/([0-9]+(?:\.[0-9]+)?)\s*fps(?:[,\s]|$)/i)?.[1] || 0,
  );
  return {
    width: Number(dimensions?.[1] || 0),
    height: Number(dimensions?.[2] || 0),
    codec: codec.toLowerCase(),
    pixelFormat: pixelFormat.toLowerCase(),
    frameRate:
      Number.isFinite(frameRate) && frameRate > 0
        ? Number(frameRate.toFixed(3))
        : 0,
  };
}
