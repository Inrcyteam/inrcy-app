export type ServerVideoFallbackProbe = {
  bucket: string;
  storagePath: string;
  publicUrl: string;
  duration: number | null;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  frameRate: number | null;
  hasAudio: boolean;
  containerFormats: string[];
  pixelFormat: string | null;
  compatibilityProof: "server_ffmpeg";
};

function positiveNumber(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * Remplace toutes les métadonnées navigateur du fallback par le probe des
 * octets Storage. La durée client n'est volontairement jamais un fallback.
 */
export function applyServerVideoFallbackAttestation<
  T extends {
    sourceMetadata?: Record<string, unknown> | null;
  },
>(video: T, probe: ServerVideoFallbackProbe) {
  const duration = positiveNumber(probe.duration);
  const width = positiveNumber(probe.width);
  const height = positiveNumber(probe.height);
  const videoCodec = String(probe.videoCodec || "").trim().toLowerCase();
  const containerFormats = Array.isArray(probe.containerFormats)
    ? probe.containerFormats
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean)
    : [];
  if (
    probe.compatibilityProof !== "server_ffmpeg" ||
    !duration ||
    !width ||
    !height ||
    !videoCodec ||
    !containerFormats.length
  ) {
    throw new Error("video_fallback_probe_incomplete");
  }

  return {
    ...video,
    bucket: probe.bucket,
    storagePath: probe.storagePath,
    publicUrl: probe.publicUrl,
    url: probe.publicUrl,
    duration,
    sourceMetadata: {
      ...(video.sourceMetadata || {}),
      width,
      height,
      duration,
      videoCodec,
      audioCodec: String(probe.audioCodec || "none").trim().toLowerCase(),
      frameRate: positiveNumber(probe.frameRate),
      hasAudio: probe.hasAudio,
      containerFormats,
      pixelFormat:
        String(probe.pixelFormat || "").trim().toLowerCase() || null,
      compatibilityProof: "server_ffmpeg" as const,
    },
  };
}
