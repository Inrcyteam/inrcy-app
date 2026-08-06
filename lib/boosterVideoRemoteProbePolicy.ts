import { INR_MEDIA_VIDEO_SOURCE_MAX_BYTES } from "./mediaRules.ts";

// Above this threshold a remote probe is allowed only when Storage proves that
// byte ranges work. That keeps an accepted 75 MB MP4 (including `moov` at the
// end) out of application memory: FFprobe/FFmpeg can seek header to tail.
export const BOOSTER_REMOTE_VIDEO_RANGE_REQUIRED_BYTES = 50 * 1024 * 1024;
export const BOOSTER_REMOTE_VIDEO_PROBE_TIMEOUT_MS = 20_000;
export const BOOSTER_REMOTE_VIDEO_TRANSPORT_TIMEOUT_MS = 5_000;

export type BoosterRemoteVideoProbeTransport = {
  sizeBytes: number;
  requiresByteRanges: boolean;
  byteRangesConfirmed: boolean;
};

function positiveInteger(value: unknown) {
  const number = Number(value || 0);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function contentRangeTotalBytes(value: unknown) {
  const match = String(value || "")
    .trim()
    .match(/^bytes\s+\d+-\d+\/(\d+)$/i);
  return positiveInteger(match?.[1]);
}

export function validateBoosterRemoteVideoProbeTransport(params: {
  expectedSizeBytes: unknown;
  headContentLength?: unknown;
  headAcceptRanges?: unknown;
  rangeStatus?: unknown;
  rangeContentRange?: unknown;
}): BoosterRemoteVideoProbeTransport {
  const expectedSizeBytes = positiveInteger(params.expectedSizeBytes);
  if (!expectedSizeBytes) {
    throw new Error("video_fallback_size_unavailable");
  }
  if (expectedSizeBytes > INR_MEDIA_VIDEO_SOURCE_MAX_BYTES) {
    throw new Error("video_fallback_source_too_large");
  }

  const headContentLength = positiveInteger(params.headContentLength);
  if (headContentLength && headContentLength !== expectedSizeBytes) {
    throw new Error("video_fallback_storage_size_mismatch");
  }

  const rangeTotal = contentRangeTotalBytes(params.rangeContentRange);
  const rangeStatus = Number(params.rangeStatus || 0);
  if (rangeTotal && rangeTotal !== expectedSizeBytes) {
    throw new Error("video_fallback_storage_size_mismatch");
  }
  const rangeWasTested = rangeStatus > 0;
  const byteRangesConfirmed = rangeWasTested
    ? rangeStatus === 206 && rangeTotal === expectedSizeBytes
    : String(params.headAcceptRanges || "").trim().toLowerCase() === "bytes";
  const requiresByteRanges =
    expectedSizeBytes > BOOSTER_REMOTE_VIDEO_RANGE_REQUIRED_BYTES;
  if (requiresByteRanges && !byteRangesConfirmed) {
    throw new Error("video_fallback_byte_ranges_required");
  }

  return {
    sizeBytes: expectedSizeBytes,
    requiresByteRanges,
    byteRangesConfirmed,
  };
}
