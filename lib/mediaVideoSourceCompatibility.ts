const DIRECT_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/x-m4v",
  "application/mp4",
]);

const DIRECT_VIDEO_EXTENSIONS = new Set(["mp4", "m4v"]);
// `ffmpeg -i` reports a comma-separated alias list for the ISO BMFF family
// (usually `mov,mp4,m4a,3gp,3g2,mj2`). This proof is about the bytes that were
// probed by the server, unlike a filename or a browser-provided MIME type.
const DIRECT_VIDEO_CONTAINER_FORMATS = new Set([
  "mov",
  "mp4",
  "m4a",
  "3gp",
  "3g2",
  "mj2",
]);
const DIRECT_VIDEO_CODECS = new Set(["h264", "avc", "avc1"]);
const DIRECT_AUDIO_CODECS = new Set([
  "aac",
  "aac_latm",
  "mp4a",
  "mp4a.40.2",
]);
const NO_AUDIO_CODECS = new Set(["none", "no_audio", "absent", "silent"]);

export const DIRECT_VIDEO_MAX_FRAME_RATE = 60;

export type DirectVideoCompatibilityReason =
  | "compatible"
  | "container_incompatible"
  | "container_proof_unknown"
  | "container_proof_incompatible"
  | "size_unknown"
  | "size_exceeded"
  | "video_codec_unknown"
  | "video_codec_incompatible"
  | "audio_codec_unknown"
  | "audio_codec_incompatible"
  | "frame_rate_unknown"
  | "frame_rate_incompatible"
  | "pixel_format_unknown"
  | "pixel_format_incompatible";

export type DirectVideoCompatibility = {
  compatible: boolean;
  action: "original" | "canonical_required";
  reason: DirectVideoCompatibilityReason;
};

export type DirectVideoCompatibilityInput = {
  name?: unknown;
  type?: unknown;
  mimeType?: unknown;
  storagePath?: unknown;
  containerFormat?: unknown;
  containerFormats?: unknown;
  sizeBytes?: unknown;
  maxBytes?: unknown;
  videoCodec?: unknown;
  audioCodec?: unknown;
  frameRate?: unknown;
  fps?: unknown;
  hasAudio?: unknown;
  pixelFormat?: unknown;
  /**
   * Active la preuve technique requise pour envoyer le binaire original aux
   * fournisseurs. Un conteneur MP4 ne suffit pas : H.264, AAC (si une piste
   * audio existe) et un FPS connu <= 60 doivent Ãªtre confirmÃ©s par le serveur.
   *
   * La preuve est exigÃ©e par dÃ©faut. Les rares usages qui ne font qu'identifier
   * un conteneur doivent explicitement mettre ce drapeau Ã  false.
   */
  requireCodecProof?: boolean;
};

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

function cleanCodec(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^video\//, "")
    .replace(/^audio\//, "");
}

function normalizeContainerFormats(...values: unknown[]) {
  const formats = values.flatMap((value) => {
    if (Array.isArray(value)) return value;
    return String(value || "").split(",");
  });
  return Array.from(
    new Set(
      formats
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function normalizedPixelFormat(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

/** Persisted compatibility proof is trusted only when produced by our probe. */
export function hasServerVideoProbeProvenance(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proof = value as Record<string, unknown>;
  return String(
    proof.probeProvenance ?? proof.probe_provenance ?? "",
  ).trim() === "server_ffmpeg";
}

export function normalizeVideoFrameRate(value: unknown): number | null {
  if (typeof value === "string" && value.includes("/")) {
    const [numeratorRaw, denominatorRaw] = value.split("/", 2);
    const numerator = Number(numeratorRaw);
    const denominator = Number(denominatorRaw);
    if (
      Number.isFinite(numerator) &&
      Number.isFinite(denominator) &&
      numerator > 0 &&
      denominator > 0
    ) {
      return Number((numerator / denominator).toFixed(3));
    }
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? Number(number.toFixed(3))
    : null;
}

function normalizedVideoCodec(value: unknown) {
  const codec = cleanCodec(value);
  if (codec.startsWith("avc1")) return "avc1";
  if (codec.startsWith("avc")) return "avc";
  if (codec.startsWith("h264")) return "h264";
  return codec;
}

function normalizedAudioCodec(value: unknown) {
  const codec = cleanCodec(value);
  if (codec.startsWith("mp4a.40.2")) return "mp4a.40.2";
  if (codec.startsWith("mp4a")) return "mp4a";
  if (codec.startsWith("aac_latm")) return "aac_latm";
  if (codec.startsWith("aac")) return "aac";
  return codec;
}

/**
 * DÃ©cide si le binaire original peut Ãªtre envoyÃ© tel quel. Une incompatibilitÃ©
 * technique demande une canonicalisation/adaptation ; elle ne constitue pas un
 * blocage mÃ©tier global (durÃ©e, poids et rÃ©solution restent validÃ©s canal par
 * canal par `videoPublicationPolicy`).
 */
export function getDirectVideoCompatibility(
  input: DirectVideoCompatibilityInput,
): DirectVideoCompatibility {
  const mimeType = cleanMimeType(input.type || input.mimeType);
  const extension =
    fileExtension(input.name) || fileExtension(input.storagePath);
  const compatibleContainer =
    DIRECT_VIDEO_MIME_TYPES.has(mimeType) ||
    DIRECT_VIDEO_EXTENSIONS.has(extension);
  if (!compatibleContainer) {
    return {
      compatible: false,
      action: "canonical_required",
      reason: "container_incompatible",
    };
  }

  const maxBytes = isKnownPositiveNumber(input.maxBytes);
  if (maxBytes) {
    const sizeBytes = isKnownPositiveNumber(input.sizeBytes);
    if (!sizeBytes) {
      return {
        compatible: false,
        action: "canonical_required",
        reason: "size_unknown",
      };
    }
    if (sizeBytes > maxBytes) {
      return {
        compatible: false,
        action: "canonical_required",
        reason: "size_exceeded",
      };
    }
  }

  if (input.requireCodecProof === false) {
    return { compatible: true, action: "original", reason: "compatible" };
  }

  const containerFormats = normalizeContainerFormats(
    input.containerFormats,
    input.containerFormat,
  );
  if (!containerFormats.length) {
    return {
      compatible: false,
      action: "canonical_required",
      reason: "container_proof_unknown",
    };
  }
  if (
    !containerFormats.some((format) =>
      DIRECT_VIDEO_CONTAINER_FORMATS.has(format),
    )
  ) {
    return {
      compatible: false,
      action: "canonical_required",
      reason: "container_proof_incompatible",
    };
  }

  const videoCodec = normalizedVideoCodec(input.videoCodec);
  if (!videoCodec || videoCodec === "unknown") {
    return {
      compatible: false,
      action: "canonical_required",
      reason: "video_codec_unknown",
    };
  }
  if (!DIRECT_VIDEO_CODECS.has(videoCodec)) {
    return {
      compatible: false,
      action: "canonical_required",
      reason: "video_codec_incompatible",
    };
  }

  const pixelFormat = normalizedPixelFormat(input.pixelFormat);
  if (!pixelFormat || pixelFormat === "unknown") {
    return {
      compatible: false,
      action: "canonical_required",
      reason: "pixel_format_unknown",
    };
  }
  if (!pixelFormat.startsWith("yuv420")) {
    return {
      compatible: false,
      action: "canonical_required",
      reason: "pixel_format_incompatible",
    };
  }

  const hasAudio =
    input.hasAudio === false
      ? false
      : input.hasAudio === true
        ? true
        : null;
  const audioCodec = normalizedAudioCodec(input.audioCodec);
  const explicitlySilent = NO_AUDIO_CODECS.has(audioCodec);
  if (hasAudio !== false && !explicitlySilent) {
    if (!audioCodec || audioCodec === "unknown") {
      return {
        compatible: false,
        action: "canonical_required",
        reason: "audio_codec_unknown",
      };
    }
    if (!DIRECT_AUDIO_CODECS.has(audioCodec)) {
      return {
        compatible: false,
        action: "canonical_required",
        reason: "audio_codec_incompatible",
      };
    }
  }

  const frameRate = normalizeVideoFrameRate(input.frameRate ?? input.fps);
  if (frameRate === null) {
    return {
      compatible: false,
      action: "canonical_required",
      reason: "frame_rate_unknown",
    };
  }
  if (frameRate > DIRECT_VIDEO_MAX_FRAME_RATE) {
    return {
      compatible: false,
      action: "canonical_required",
      reason: "frame_rate_incompatible",
    };
  }

  return { compatible: true, action: "original", reason: "compatible" };
}

export function canPublishVideoSourceDirectly(
  input: DirectVideoCompatibilityInput,
) {
  return getDirectVideoCompatibility(input).compatible;
}
