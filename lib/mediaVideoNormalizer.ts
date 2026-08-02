import { execFile, spawn } from "node:child_process";
import { access, chmod, copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegStaticPath from "ffmpeg-static";
import {
  VIDEO_AI_PREVIEW_FPS,
  VIDEO_AI_PREVIEW_MAX_SIDE,
  VIDEO_AUDIO_TRACK_MAX_BYTES,
  VIDEO_CANONICAL_AUDIO_BITRATE_KBPS,
  VIDEO_CANONICAL_ENCODER_PRESET,
  VIDEO_CANONICAL_MIN_SAVINGS_RATIO,
  VIDEO_CANONICAL_QUALITY_CRF,
  VIDEO_CANONICAL_MAX_BYTES,
  VIDEO_CANONICAL_MAX_SIDE,
  VIDEO_FRAME_MAX_BYTES,
  VIDEO_FRAME_MAX_SIDE,
  VIDEO_THUMBNAIL_MAX_SIDE,
  buildVideoFrameCaptureTimes,
  fitVideoWithinMaxSide,
  getOrientedVideoDimensions,
  getVideoCanonicalOptimizationProfile,
  getVideoNormalizationPurpose,
  getVideoTargetBitrateKbps,
  type VideoNormalizationPurpose,
  type VideoNormalizationVariantKey,
} from "@/lib/mediaVideoNormalizationPolicy";

const execFileAsync = promisify(execFile);
const FFMPEG_PROBE_TIMEOUT_MS = 30_000;
const FFMPEG_CANONICAL_TIMEOUT_MS = 240_000;
const FFMPEG_DERIVATIVE_TIMEOUT_MS = 75_000;
const FFMPEG_STALL_TIMEOUT_MS = 55_000;

export type VideoSourceProbe = {
  width: number;
  height: number;
  orientedWidth: number;
  orientedHeight: number;
  durationSeconds: number;
  rotationDegrees: number;
  hasAudio: boolean;
  videoCodec: string;
  audioCodec: string;
  pixelFormat: string;
  containerFormats: string[];
};

export type VideoNormalizationProgress = {
  progress: number;
  stage: string;
};

export type NormalizedVideoVariant = {
  key: VideoNormalizationVariantKey;
  purpose: VideoNormalizationPurpose;
  available: boolean;
  filePath: string | null;
  mimeType: "video/mp4" | "image/jpeg" | "audio/mpeg";
  extension: "mp4" | "jpg" | "mp3";
  width: number | null;
  height: number | null;
  durationSeconds: number;
  sizeBytes: number;
  transformSpec: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export type NormalizedVideoBundle = {
  source: VideoSourceProbe;
  warnings: string[];
  variants: Record<VideoNormalizationVariantKey, NormalizedVideoVariant>;
};

type CanonicalPreparation = {
  sizeBytes: number;
  bitrateKbps: number | null;
  attempts: number;
  mode:
    | "stream_copy"
    | "video_copy_audio_transcode"
    | "quality_transcode"
    | "size_cap_transcode";
  encoderPreset: "ultrafast" | "superfast" | "veryfast" | null;
  qualityCrf: number | null;
  optimizationReason: string;
};

function compactError(error: unknown) {
  const record = error as { stderr?: unknown; message?: unknown } | null;
  return String(record?.stderr || record?.message || error || "Erreur FFmpeg")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2_000);
}

function getBundledFfmpegCandidate() {
  const binaryName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  return path.join(process.cwd(), "node_modules", "ffmpeg-static", binaryName);
}

function getFfmpegCandidates() {
  return Array.from(
    new Set(
      [process.env.FFMPEG_PATH, ffmpegStaticPath, getBundledFfmpegCandidate(), "ffmpeg"]
        .map((candidate) => String(candidate || "").trim())
        .filter(Boolean),
    ),
  );
}

async function makeExecutableIfNeeded(candidate: string) {
  if (!candidate || candidate === "ffmpeg" || process.platform === "win32") return;
  try {
    await access(candidate);
    await chmod(candidate, 0o755);
  } catch {
    // Le contrôle -version ci-dessous retournera une erreur exploitable.
  }
}

export async function resolveVideoNormalizationFfmpegPath() {
  const errors: string[] = [];
  for (const candidate of getFfmpegCandidates()) {
    try {
      await makeExecutableIfNeeded(candidate);
      await execFileAsync(candidate, ["-version"], {
        timeout: 8_000,
        maxBuffer: 1024 * 1024,
      });
      return candidate;
    } catch (error) {
      errors.push(`${candidate}: ${compactError(error).slice(0, 300)}`);
    }
  }
  throw new Error(`ffmpeg_unavailable:${errors.join(" | ").slice(0, 1_500)}`);
}

function parseDurationSeconds(stderr: string) {
  const match = stderr.match(/Duration:\s*(\d{1,2}):(\d{2}):(\d{2}(?:\.\d+)?)/i);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function parseRotationDegrees(stderr: string) {
  const sideData = stderr.match(/rotation of\s+(-?\d+(?:\.\d+)?)\s+degrees/i);
  if (sideData) return Math.round(Number(sideData[1]) || 0);
  const metadata = stderr.match(/rotate\s*:\s*(-?\d+(?:\.\d+)?)/i);
  return metadata ? Math.round(Number(metadata[1]) || 0) : 0;
}

function parseContainerFormats(stderr: string) {
  const match = stderr.match(/Input #0,\s*([^,\n]+(?:,[^,\n]+)*?),\s*from\s/i);
  return String(match?.[1] || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function parseVideoStream(stderr: string) {
  const line = stderr.split(/\r?\n/).find((entry) => /Stream .*Video:/i.test(entry));
  if (!line) return { width: 0, height: 0, codec: "unknown", pixelFormat: "unknown" };
  const dimensions = line.match(/(?:^|\D)(\d{2,5})x(\d{2,5})(?:\D|$)/);
  const codec = line.match(/Video:\s*([^,\s]+)/i)?.[1] || "unknown";
  const pixelFormat = line.match(/Video:[^\n]*?,\s*([a-z0-9_]+)(?:\([^)]*\))?,\s*\d{2,5}x\d{2,5}/i)?.[1] || "unknown";
  return {
    width: Number(dimensions?.[1] || 0),
    height: Number(dimensions?.[2] || 0),
    codec: codec.toLowerCase(),
    pixelFormat: pixelFormat.toLowerCase(),
  };
}

function parseAudioCodec(stderr: string) {
  const line = stderr.split(/\r?\n/).find((entry) => /Stream .*Audio:/i.test(entry));
  return String(line?.match(/Audio:\s*([^,\s]+)/i)?.[1] || "unknown").toLowerCase();
}

export async function probeVideoSource(params: {
  ffmpegPath: string;
  inputPath: string;
  fallbackWidth?: number | null;
  fallbackHeight?: number | null;
  fallbackDurationSeconds?: number | null;
}): Promise<VideoSourceProbe> {
  let stderr = "";
  try {
    const result = await execFileAsync(
      params.ffmpegPath,
      [
        "-hide_banner",
        "-nostdin",
        "-i",
        params.inputPath,
        "-map",
        "0:v:0",
        "-frames:v",
        "1",
        "-f",
        "null",
        "-",
      ],
      { timeout: FFMPEG_PROBE_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
    );
    stderr = String(result.stderr || "");
  } catch (error) {
    const record = error as { stderr?: unknown };
    stderr = String(record?.stderr || "");
    if (!/Stream .*Video:/i.test(stderr)) {
      throw new Error(`video_probe_failed:${compactError(error)}`);
    }
  }

  const stream = parseVideoStream(stderr);
  const width = stream.width || Math.max(0, Number(params.fallbackWidth || 0));
  const height = stream.height || Math.max(0, Number(params.fallbackHeight || 0));
  if (!width || !height) throw new Error("video_dimensions_unavailable");

  const rotationDegrees = parseRotationDegrees(stderr);
  const oriented = getOrientedVideoDimensions({ width, height, rotationDegrees });
  const probedDuration = parseDurationSeconds(stderr);
  const fallbackDuration = Math.max(0, Number(params.fallbackDurationSeconds || 0));
  const durationSeconds = probedDuration || fallbackDuration;
  if (!durationSeconds) throw new Error("video_duration_unavailable");

  const hasAudio = /Stream .*Audio:/i.test(stderr);
  return {
    width,
    height,
    orientedWidth: oriented.width,
    orientedHeight: oriented.height,
    durationSeconds,
    rotationDegrees,
    hasAudio,
    videoCodec: stream.codec,
    audioCodec: hasAudio ? parseAudioCodec(stderr) : "none",
    pixelFormat: stream.pixelFormat,
    containerFormats: parseContainerFormats(stderr),
  };
}

function buildScaleFilter(maxSide: number, fps?: number) {
  const filters = [
    `scale='min(${maxSide},iw)':'min(${maxSide},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`,
    "setsar=1",
  ];
  if (fps) filters.push(`fps=${fps}`);
  return filters.join(",");
}

async function outputSize(filePath: string) {
  return Number((await stat(filePath)).size || 0);
}

function normalizeProgressValue(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function runFfmpegWithProgress(params: {
  ffmpegPath: string;
  args: string[];
  durationSeconds: number;
  timeoutMs: number;
  stallTimeoutMs?: number;
  onProgress?: (ratio: number) => void;
}) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(params.ffmpegPath, params.args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let settled = false;
    let stdoutBuffer = "";
    let stderr = "";
    let lastActivityAt = Date.now();
    let lastRatio = 0;

    const cleanup = () => {
      clearInterval(stallTimer);
      clearTimeout(overallTimer);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        child.kill("SIGKILL");
      } catch {
        // Processus déjà terminé.
      }
      reject(error);
    };
    const emitRatio = (ratio: number) => {
      const safe = normalizeProgressValue(ratio);
      if (safe <= lastRatio && safe < 1) return;
      lastRatio = safe;
      params.onProgress?.(safe);
    };

    const overallTimer = setTimeout(() => {
      fail(
        new Error(
          `video_ffmpeg_timeout:${Math.round(params.timeoutMs / 1000)}s:${stderr.slice(-1_200)}`,
        ),
      );
    }, params.timeoutMs);
    const stallTimer = setInterval(() => {
      const stallTimeoutMs = params.stallTimeoutMs || FFMPEG_STALL_TIMEOUT_MS;
      if (Date.now() - lastActivityAt > stallTimeoutMs) {
        fail(
          new Error(
            `video_ffmpeg_stalled:${Math.round(stallTimeoutMs / 1000)}s:${stderr.slice(-1_200)}`,
          ),
        );
      }
    }, 2_000);

    child.stdout?.on("data", (chunk: unknown) => {
      lastActivityAt = Date.now();
      stdoutBuffer += String(chunk || "");
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || "";
      for (const line of lines) {
        const separator = line.indexOf("=");
        if (separator <= 0) continue;
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim();
        if (key === "out_time_us" || key === "out_time_ms") {
          const microseconds = Number(value || 0);
          if (params.durationSeconds > 0 && Number.isFinite(microseconds)) {
            emitRatio(microseconds / 1_000_000 / params.durationSeconds);
          }
        } else if (key === "progress" && value === "end") {
          emitRatio(1);
        }
      }
    });
    child.stderr?.on("data", (chunk: unknown) => {
      lastActivityAt = Date.now();
      stderr = `${stderr}${String(chunk || "")}`.slice(-8_000);
    });
    child.once("error", (error: unknown) => fail(new Error(`video_ffmpeg_spawn_failed:${compactError(error)}`)));
    child.once("close", (code: number | null, signal: string | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (code === 0) {
        emitRatio(1);
        resolve();
        return;
      }
      reject(
        new Error(
          `video_ffmpeg_failed:${code ?? "null"}:${signal || "none"}:${stderr.slice(-1_500)}`,
        ),
      );
    });
  });
}

async function encodeMp4(params: {
  ffmpegPath: string;
  inputPath: string;
  outputPath: string;
  maxSide: number;
  durationSeconds: number;
  maxBytes: number;
  maxVideoKbps: number;
  minVideoKbps: number;
  audioBitrateKbps: number;
  includeAudio: boolean;
  fps?: number;
  timeoutMs: number;
  encoderPreset?: "ultrafast" | "superfast" | "veryfast";
  onProgress?: (ratio: number) => void;
}) {
  const initialBitrate = getVideoTargetBitrateKbps({
    durationSeconds: params.durationSeconds,
    maxBytes: params.maxBytes,
    audioBitrateKbps: params.includeAudio ? params.audioBitrateKbps : 0,
    minVideoKbps: params.minVideoKbps,
    maxVideoKbps: params.maxVideoKbps,
  });

  let bitrate = initialBitrate;
  const encoderPreset = params.encoderPreset || "superfast";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const args = [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-i",
      params.inputPath,
      "-map",
      "0:v:0",
    ];
    if (params.includeAudio) args.push("-map", "0:a:0?");
    args.push(
      "-vf",
      buildScaleFilter(params.maxSide, params.fps),
      "-c:v",
      "libx264",
      "-preset",
      encoderPreset,
      "-threads",
      "0",
      "-b:v",
      `${bitrate}k`,
      "-maxrate",
      `${Math.max(bitrate, Math.round(bitrate * 1.25))}k`,
      "-bufsize",
      `${Math.max(512, bitrate * 2)}k`,
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-map_metadata",
      "-1",
      "-map_chapters",
      "-1",
      "-metadata:s:v:0",
      "rotate=0",
      "-max_muxing_queue_size",
      "2048",
    );
    if (params.includeAudio) {
      args.push("-c:a", "aac", "-b:a", `${params.audioBitrateKbps}k`, "-ac", "2");
    } else {
      args.push("-an");
    }
    args.push("-progress", "pipe:1", "-nostats", params.outputPath);

    await runFfmpegWithProgress({
      ffmpegPath: params.ffmpegPath,
      args,
      durationSeconds: params.durationSeconds,
      timeoutMs: params.timeoutMs,
      onProgress: (ratio) => {
        const attemptBase = (attempt - 1) / 2;
        params.onProgress?.(attemptBase + ratio / 2);
      },
    });
    const sizeBytes = await outputSize(params.outputPath);
    if (sizeBytes > 0 && sizeBytes <= params.maxBytes) {
      params.onProgress?.(1);
      return {
        sizeBytes,
        bitrateKbps: bitrate,
        attempts: attempt,
        mode: "size_cap_transcode" as const,
        encoderPreset,
        qualityCrf: null,
        optimizationReason: "size_cap_fallback",
      };
    }
    if (attempt === 2) {
      throw new Error(`video_output_too_large:${path.basename(params.outputPath)}:${sizeBytes}`);
    }
    bitrate = Math.max(120, Math.floor(bitrate * 0.68));
  }
  throw new Error("video_encoding_failed");
}

function normalizedRotation(value: number) {
  return ((Math.round(Number(value || 0)) % 360) + 360) % 360;
}

function canFastPrepareCanonical(params: {
  source: VideoSourceProbe;
  sourceSizeBytes: number;
}) {
  const codec = params.source.videoCodec.toLowerCase();
  const pixelFormat = params.source.pixelFormat.toLowerCase();
  return (
    (codec === "h264" || codec === "avc1") &&
    (!pixelFormat || pixelFormat === "unknown" || pixelFormat.startsWith("yuv420")) &&
    normalizedRotation(params.source.rotationDegrees) === 0 &&
    Math.max(params.source.orientedWidth, params.source.orientedHeight) <= VIDEO_CANONICAL_MAX_SIDE &&
    params.sourceSizeBytes > 0 &&
    params.sourceSizeBytes <= VIDEO_CANONICAL_MAX_BYTES
  );
}

async function remuxCanonical(params: {
  ffmpegPath: string;
  inputPath: string;
  outputPath: string;
  source: VideoSourceProbe;
  onProgress?: (ratio: number) => void;
}): Promise<CanonicalPreparation> {
  const copyAudio = !params.source.hasAudio || params.source.audioCodec === "aac";
  const args = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-i",
    params.inputPath,
    "-map",
    "0:v:0",
  ];
  if (params.source.hasAudio) args.push("-map", "0:a:0?");
  args.push("-c:v", "copy");
  if (params.source.hasAudio) {
    if (copyAudio) args.push("-c:a", "copy");
    else args.push("-c:a", "aac", "-b:a", "128k", "-ac", "2");
  } else {
    args.push("-an");
  }
  args.push(
    "-movflags",
    "+faststart",
    "-map_metadata",
    "-1",
    "-map_chapters",
    "-1",
    "-metadata:s:v:0",
    "rotate=0",
    "-avoid_negative_ts",
    "make_zero",
    "-progress",
    "pipe:1",
    "-nostats",
    params.outputPath,
  );

  await runFfmpegWithProgress({
    ffmpegPath: params.ffmpegPath,
    args,
    durationSeconds: params.source.durationSeconds,
    timeoutMs: Math.min(90_000, FFMPEG_CANONICAL_TIMEOUT_MS),
    stallTimeoutMs: 35_000,
    onProgress: params.onProgress,
  });
  const sizeBytes = await outputSize(params.outputPath);
  if (!sizeBytes) throw new Error("video_canonical_empty");
  if (sizeBytes > VIDEO_CANONICAL_MAX_BYTES) {
    throw new Error(`video_output_too_large:${path.basename(params.outputPath)}:${sizeBytes}`);
  }
  return {
    sizeBytes,
    bitrateKbps: null,
    attempts: 1,
    mode: copyAudio ? "stream_copy" : "video_copy_audio_transcode",
    encoderPreset: null,
    qualityCrf: null,
    optimizationReason: "already_efficient",
  };
}

async function encodeQualityOptimizedCanonical(params: {
  ffmpegPath: string;
  inputPath: string;
  outputPath: string;
  source: VideoSourceProbe;
  targetMaxVideoKbps: number;
  onProgress?: (ratio: number) => void;
}): Promise<CanonicalPreparation> {
  const args = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-i",
    params.inputPath,
    "-map",
    "0:v:0",
  ];
  if (params.source.hasAudio) args.push("-map", "0:a:0?");
  args.push(
    "-vf",
    buildScaleFilter(VIDEO_CANONICAL_MAX_SIDE),
    "-c:v",
    "libx264",
    "-preset",
    VIDEO_CANONICAL_ENCODER_PRESET,
    "-crf",
    String(VIDEO_CANONICAL_QUALITY_CRF),
    "-maxrate",
    `${params.targetMaxVideoKbps}k`,
    "-bufsize",
    `${params.targetMaxVideoKbps * 2}k`,
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-map_metadata",
    "-1",
    "-map_chapters",
    "-1",
    "-metadata:s:v:0",
    "rotate=0",
    "-max_muxing_queue_size",
    "2048",
  );
  if (params.source.hasAudio) {
    args.push(
      "-c:a",
      "aac",
      "-b:a",
      `${VIDEO_CANONICAL_AUDIO_BITRATE_KBPS}k`,
      "-ac",
      "2",
    );
  } else {
    args.push("-an");
  }
  args.push("-progress", "pipe:1", "-nostats", params.outputPath);

  await runFfmpegWithProgress({
    ffmpegPath: params.ffmpegPath,
    args,
    durationSeconds: params.source.durationSeconds,
    timeoutMs: FFMPEG_CANONICAL_TIMEOUT_MS,
    onProgress: params.onProgress,
  });
  const sizeBytes = await outputSize(params.outputPath);
  if (!sizeBytes) throw new Error("video_canonical_empty");
  if (sizeBytes > VIDEO_CANONICAL_MAX_BYTES) {
    throw new Error(
      `video_output_too_large:${path.basename(params.outputPath)}:${sizeBytes}`,
    );
  }
  return {
    sizeBytes,
    bitrateKbps: Math.round(
      (sizeBytes * 8) / Math.max(0.001, params.source.durationSeconds) / 1000,
    ),
    attempts: 1,
    mode: "quality_transcode",
    encoderPreset: VIDEO_CANONICAL_ENCODER_PRESET,
    qualityCrf: VIDEO_CANONICAL_QUALITY_CRF,
    optimizationReason: "meaningful_savings",
  };
}

async function prepareCanonical(params: {
  ffmpegPath: string;
  inputPath: string;
  outputPath: string;
  source: VideoSourceProbe;
  sourceSizeBytes: number;
  warnings: string[];
  onProgress?: (ratio: number) => void;
}) {
  const compatibleForRemux = canFastPrepareCanonical(params);
  const optimization = getVideoCanonicalOptimizationProfile({
    width: params.source.orientedWidth,
    height: params.source.orientedHeight,
    durationSeconds: params.source.durationSeconds,
    sourceSizeBytes: params.sourceSizeBytes,
    hasAudio: params.source.hasAudio,
  });

  if (compatibleForRemux && !optimization.shouldOptimize) {
    try {
      const remuxed = await remuxCanonical(params);
      return { ...remuxed, optimizationReason: optimization.reason };
    } catch (error) {
      params.warnings.push(`canonical_fast_path_failed:${compactError(error)}`);
      params.onProgress?.(0);
    }
  }

  try {
    const optimized = await encodeQualityOptimizedCanonical({
      ffmpegPath: params.ffmpegPath,
      inputPath: params.inputPath,
      outputPath: params.outputPath,
      source: params.source,
      targetMaxVideoKbps: optimization.targetMaxVideoKbps,
      onProgress: params.onProgress,
    });
    const actualSavingsRatio = params.sourceSizeBytes
      ? 1 - optimized.sizeBytes / params.sourceSizeBytes
      : 1;
    if (
      compatibleForRemux &&
      actualSavingsRatio < VIDEO_CANONICAL_MIN_SAVINGS_RATIO
    ) {
      params.warnings.push(
        `canonical_transcode_skipped_low_gain:${actualSavingsRatio.toFixed(4)}`,
      );
      params.onProgress?.(0);
      const remuxed = await remuxCanonical(params);
      return { ...remuxed, optimizationReason: "measured_gain_too_small" };
    }
    return optimized;
  } catch (error) {
    params.warnings.push(
      `canonical_quality_optimization_failed:${compactError(error)}`,
    );
    params.onProgress?.(0);
  }

  return await encodeMp4({
    ffmpegPath: params.ffmpegPath,
    inputPath: params.inputPath,
    outputPath: params.outputPath,
    maxSide: VIDEO_CANONICAL_MAX_SIDE,
    durationSeconds: params.source.durationSeconds,
    maxBytes: VIDEO_CANONICAL_MAX_BYTES,
    maxVideoKbps: optimization.targetMaxVideoKbps,
    minVideoKbps: 250,
    audioBitrateKbps: VIDEO_CANONICAL_AUDIO_BITRATE_KBPS,
    includeAudio: params.source.hasAudio,
    timeoutMs: FFMPEG_CANONICAL_TIMEOUT_MS,
    encoderPreset: "superfast",
    onProgress: params.onProgress,
  });
}

async function extractFrame(params: {
  ffmpegPath: string;
  inputPath: string;
  outputPath: string;
  timestampSeconds: number;
  maxSide: number;
  quality: number;
}) {
  await execFileAsync(
    params.ffmpegPath,
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-ss",
      String(Math.max(0, params.timestampSeconds)),
      "-i",
      params.inputPath,
      "-map",
      "0:v:0",
      "-frames:v",
      "1",
      "-vf",
      buildScaleFilter(params.maxSide),
      "-q:v",
      String(params.quality),
      "-an",
      params.outputPath,
    ],
    { timeout: FFMPEG_DERIVATIVE_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
  );
  const sizeBytes = await outputSize(params.outputPath);
  if (!sizeBytes) throw new Error("video_frame_empty");
  if (sizeBytes > VIDEO_FRAME_MAX_BYTES) throw new Error(`video_frame_too_large:${sizeBytes}`);
  return sizeBytes;
}

async function extractAudioTrack(params: {
  ffmpegPath: string;
  inputPath: string;
  outputPath: string;
}) {
  await execFileAsync(
    params.ffmpegPath,
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-i",
      params.inputPath,
      "-map",
      "0:a:0",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "64k",
      params.outputPath,
    ],
    { timeout: FFMPEG_DERIVATIVE_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
  );
  const sizeBytes = await outputSize(params.outputPath);
  if (!sizeBytes) throw new Error("video_audio_empty");
  if (sizeBytes > VIDEO_AUDIO_TRACK_MAX_BYTES) throw new Error(`video_audio_too_large:${sizeBytes}`);
  return sizeBytes;
}

function buildVariant(params: {
  key: VideoNormalizationVariantKey;
  available?: boolean;
  filePath?: string | null;
  mimeType: NormalizedVideoVariant["mimeType"];
  extension: NormalizedVideoVariant["extension"];
  width?: number | null;
  height?: number | null;
  durationSeconds: number;
  sizeBytes?: number;
  transformSpec: Record<string, unknown>;
  metadata: Record<string, unknown>;
}): NormalizedVideoVariant {
  return {
    key: params.key,
    purpose: getVideoNormalizationPurpose(params.key),
    available: params.available !== false,
    filePath: params.filePath || null,
    mimeType: params.mimeType,
    extension: params.extension,
    width: params.width ?? null,
    height: params.height ?? null,
    durationSeconds: params.durationSeconds,
    sizeBytes: Math.max(0, Number(params.sizeBytes || 0)),
    transformSpec: params.transformSpec,
    metadata: params.metadata,
  };
}

export async function normalizeVideoSource(params: {
  inputPath: string;
  outputDirectory: string;
  fallbackWidth?: number | null;
  fallbackHeight?: number | null;
  fallbackDurationSeconds?: number | null;
  onProgress?: (update: VideoNormalizationProgress) => void;
}): Promise<NormalizedVideoBundle> {
  await mkdir(params.outputDirectory, { recursive: true });
  let lastProgress = 0;
  const emitProgress = (progress: number, stage: string) => {
    const safe = Math.max(lastProgress, Math.min(100, Math.round(progress)));
    if (safe === lastProgress && safe !== 100) return;
    lastProgress = safe;
    params.onProgress?.({ progress: safe, stage });
  };

  emitProgress(1, "Initialisation de FFmpeg");
  const ffmpegPath = await resolveVideoNormalizationFfmpegPath();
  const sourceSizeBytes = await outputSize(params.inputPath);
  const source = await probeVideoSource({
    ffmpegPath,
    inputPath: params.inputPath,
    fallbackWidth: params.fallbackWidth,
    fallbackHeight: params.fallbackHeight,
    fallbackDurationSeconds: params.fallbackDurationSeconds,
  });
  emitProgress(8, "Analyse du format vidéo");

  const warnings: string[] = [];
  const canonicalPath = path.join(params.outputDirectory, "canonical.mp4");
  const audioPath = path.join(params.outputDirectory, "audio-track.mp3");
  const framePaths = [1, 2, 3].map((index) =>
    path.join(params.outputDirectory, `frame-${String(index).padStart(2, "0")}.jpg`),
  );
  const thumbnailPath = path.join(params.outputDirectory, "thumbnail.jpg");
  const captureTimes = buildVideoFrameCaptureTimes(source.durationSeconds);

  let canonicalRatio = 0;
  let derivativeCompleted = 0;
  const derivativeTotal = source.hasAudio ? 5 : 4;
  const recalculateProgress = (stage: string) => {
    const combined = 8 + canonicalRatio * 58 + (derivativeCompleted / derivativeTotal) * 26;
    emitProgress(Math.min(92, combined), stage);
  };

  const canonicalPromise = prepareCanonical({
    ffmpegPath,
    inputPath: params.inputPath,
    outputPath: canonicalPath,
    source,
    sourceSizeBytes,
    warnings,
    onProgress: (ratio) => {
      canonicalRatio = Math.max(canonicalRatio, normalizeProgressValue(ratio));
      recalculateProgress(canonicalRatio >= 1 ? "Vidéo principale prête" : "Préparation de la vidéo principale");
    },
  });

  const frameSizes = [0, 0, 0];
  const frameAvailable = [false, false, false];
  let thumbnailSize = 0;
  let thumbnailAvailable = false;
  let thumbnailFallbackFromFrame = false;
  let audioSizeBytes = 0;
  let audioAvailable = source.hasAudio;

  const audioPromise = source.hasAudio
    ? extractAudioTrack({ ffmpegPath, inputPath: params.inputPath, outputPath: audioPath })
        .then((size) => {
          audioSizeBytes = size;
          derivativeCompleted += 1;
          recalculateProgress("Piste audio extraite");
        })
        .catch((error) => {
          audioAvailable = false;
          warnings.push(`audio_track_unavailable:${compactError(error)}`);
          derivativeCompleted += 1;
          recalculateProgress("Piste audio indisponible, traitement poursuivi");
        })
    : Promise.resolve();

  const visualPromise = (async () => {
    for (let index = 0; index < framePaths.length; index += 1) {
      try {
        frameSizes[index] = await extractFrame({
          ffmpegPath,
          inputPath: params.inputPath,
          outputPath: framePaths[index],
          timestampSeconds: captureTimes[index],
          maxSide: VIDEO_FRAME_MAX_SIDE,
          quality: 4,
        });
        frameAvailable[index] = true;
      } catch (error) {
        if (index === 0 && captureTimes[index] > 0) {
          try {
            frameSizes[index] = await extractFrame({
              ffmpegPath,
              inputPath: params.inputPath,
              outputPath: framePaths[index],
              timestampSeconds: 0,
              maxSide: VIDEO_FRAME_MAX_SIDE,
              quality: 4,
            });
            frameAvailable[index] = true;
          } catch (fallbackError) {
            warnings.push(`frame_${index + 1}_unavailable:${compactError(fallbackError)}`);
          }
        } else {
          warnings.push(`frame_${index + 1}_unavailable:${compactError(error)}`);
        }
      }
      derivativeCompleted += 1;
      recalculateProgress(`Capture vidéo ${index + 1}/3`);
    }

    try {
      thumbnailSize = await extractFrame({
        ffmpegPath,
        inputPath: params.inputPath,
        outputPath: thumbnailPath,
        timestampSeconds: captureTimes[0],
        maxSide: VIDEO_THUMBNAIL_MAX_SIDE,
        quality: 5,
      });
      thumbnailAvailable = true;
    } catch (error) {
      const firstAvailableIndex = frameAvailable.findIndex(Boolean);
      if (firstAvailableIndex >= 0) {
        await copyFile(framePaths[firstAvailableIndex], thumbnailPath);
        thumbnailSize = await outputSize(thumbnailPath);
        thumbnailAvailable = thumbnailSize > 0;
        thumbnailFallbackFromFrame = thumbnailAvailable;
      }
      if (!thumbnailAvailable) warnings.push(`thumbnail_unavailable:${compactError(error)}`);
    }
    derivativeCompleted += 1;
    recalculateProgress("Miniature vidéo prête");
  })();

  const [canonicalEncoding] = await Promise.all([canonicalPromise, visualPromise, audioPromise]);
  if (!frameAvailable.some(Boolean)) {
    throw new Error("video_frames_unavailable:aucune capture exploitable n'a pu être produite");
  }
  canonicalRatio = 1;
  emitProgress(94, "Finalisation des fichiers vidéo");

  const canonicalDimensions = fitVideoWithinMaxSide({
    width: source.orientedWidth,
    height: source.orientedHeight,
    maxSide: VIDEO_CANONICAL_MAX_SIDE,
  });
  const frameDimensions = fitVideoWithinMaxSide({
    width: source.orientedWidth,
    height: source.orientedHeight,
    maxSide: VIDEO_FRAME_MAX_SIDE,
  });
  const thumbnailDimensions = thumbnailFallbackFromFrame
    ? frameDimensions
    : fitVideoWithinMaxSide({
        width: source.orientedWidth,
        height: source.orientedHeight,
        maxSide: VIDEO_THUMBNAIL_MAX_SIDE,
      });
  const sourceMetadata = {
    source_width: source.width,
    source_height: source.height,
    oriented_width: source.orientedWidth,
    oriented_height: source.orientedHeight,
    rotation_degrees: source.rotationDegrees,
    duration_seconds: source.durationSeconds,
    source_video_codec: source.videoCodec,
    source_audio_codec: source.audioCodec,
    source_pixel_format: source.pixelFormat,
    source_container_formats: source.containerFormats,
    source_has_audio: source.hasAudio,
    canonical_mode: canonicalEncoding.mode,
    canonical_optimization_reason: canonicalEncoding.optimizationReason,
    source_size_bytes: sourceSizeBytes,
    canonical_size_bytes: canonicalEncoding.sizeBytes,
    canonical_saved_bytes: Math.max(0, sourceSizeBytes - canonicalEncoding.sizeBytes),
    canonical_compression_ratio: sourceSizeBytes
      ? Number((canonicalEncoding.sizeBytes / sourceSizeBytes).toFixed(4))
      : null,
    metadata_stripped: true,
  };

  emitProgress(100, "Préparation vidéo terminée");
  return {
    source,
    warnings,
    variants: {
      canonical: buildVariant({
        key: "canonical",
        filePath: canonicalPath,
        mimeType: "video/mp4",
        extension: "mp4",
        width: canonicalDimensions.width,
        height: canonicalDimensions.height,
        durationSeconds: source.durationSeconds,
        sizeBytes: canonicalEncoding.sizeBytes,
        transformSpec: {
          operation: "normalize_video",
          output: "mp4",
          video_codec: "h264",
          audio_codec: source.hasAudio ? "aac" : null,
          max_side: VIDEO_CANONICAL_MAX_SIDE,
          crop: false,
          preserve_ratio: true,
          without_enlargement: true,
          auto_orient: true,
          pixel_format:
            canonicalEncoding.mode === "quality_transcode" ||
            canonicalEncoding.mode === "size_cap_transcode"
              ? "yuv420p"
              : source.pixelFormat,
          faststart: true,
          bitrate_kbps: canonicalEncoding.bitrateKbps,
          mode: canonicalEncoding.mode,
          attempts: canonicalEncoding.attempts,
          encoder_preset: canonicalEncoding.encoderPreset,
          quality_crf: canonicalEncoding.qualityCrf,
          optimization_reason: canonicalEncoding.optimizationReason,
          source_size_bytes: sourceSizeBytes,
          saved_bytes: Math.max(0, sourceSizeBytes - canonicalEncoding.sizeBytes),
        },
        metadata: sourceMetadata,
      }),
      ai_preview: buildVariant({
        key: "ai_preview",
        available: false,
        filePath: null,
        mimeType: "video/mp4",
        extension: "mp4",
        width: null,
        height: null,
        durationSeconds: source.durationSeconds,
        sizeBytes: 0,
        transformSpec: {
          operation: "video_ai_preview",
          skipped: true,
          reason: "ai_uses_server_frames_and_audio",
          fallback_variant: "canonical",
          requested_max_side: VIDEO_AI_PREVIEW_MAX_SIDE,
          requested_fps: VIDEO_AI_PREVIEW_FPS,
        },
        metadata: {
          ...sourceMetadata,
          available: false,
          fallback_variant: "canonical",
          reason: "frames_and_audio_are_the_primary_ai_context",
        },
      }),
      thumbnail: buildVariant({
        key: "thumbnail",
        available: thumbnailAvailable,
        filePath: thumbnailAvailable ? thumbnailPath : null,
        mimeType: "image/jpeg",
        extension: "jpg",
        width: thumbnailAvailable ? thumbnailDimensions.width : null,
        height: thumbnailAvailable ? thumbnailDimensions.height : null,
        durationSeconds: source.durationSeconds,
        sizeBytes: thumbnailSize,
        transformSpec: {
          operation: "video_thumbnail",
          output: "jpeg",
          max_side: VIDEO_THUMBNAIL_MAX_SIDE,
          crop: false,
          capture_seconds: captureTimes[0],
          fallback_from_frame: thumbnailFallbackFromFrame,
        },
        metadata: {
          ...sourceMetadata,
          capture_seconds: captureTimes[0],
          fallback_from_frame: thumbnailFallbackFromFrame,
        },
      }),
      frame_01: buildVariant({
        key: "frame_01",
        available: frameAvailable[0],
        filePath: frameAvailable[0] ? framePaths[0] : null,
        mimeType: "image/jpeg",
        extension: "jpg",
        width: frameAvailable[0] ? frameDimensions.width : null,
        height: frameAvailable[0] ? frameDimensions.height : null,
        durationSeconds: source.durationSeconds,
        sizeBytes: frameSizes[0],
        transformSpec: {
          operation: "video_frame",
          output: "jpeg",
          max_side: VIDEO_FRAME_MAX_SIDE,
          crop: false,
          capture_seconds: captureTimes[0],
        },
        metadata: { ...sourceMetadata, frame_index: 1, capture_seconds: captureTimes[0] },
      }),
      frame_02: buildVariant({
        key: "frame_02",
        available: frameAvailable[1],
        filePath: frameAvailable[1] ? framePaths[1] : null,
        mimeType: "image/jpeg",
        extension: "jpg",
        width: frameAvailable[1] ? frameDimensions.width : null,
        height: frameAvailable[1] ? frameDimensions.height : null,
        durationSeconds: source.durationSeconds,
        sizeBytes: frameSizes[1],
        transformSpec: {
          operation: "video_frame",
          output: "jpeg",
          max_side: VIDEO_FRAME_MAX_SIDE,
          crop: false,
          capture_seconds: captureTimes[1],
        },
        metadata: { ...sourceMetadata, frame_index: 2, capture_seconds: captureTimes[1] },
      }),
      frame_03: buildVariant({
        key: "frame_03",
        available: frameAvailable[2],
        filePath: frameAvailable[2] ? framePaths[2] : null,
        mimeType: "image/jpeg",
        extension: "jpg",
        width: frameAvailable[2] ? frameDimensions.width : null,
        height: frameAvailable[2] ? frameDimensions.height : null,
        durationSeconds: source.durationSeconds,
        sizeBytes: frameSizes[2],
        transformSpec: {
          operation: "video_frame",
          output: "jpeg",
          max_side: VIDEO_FRAME_MAX_SIDE,
          crop: false,
          capture_seconds: captureTimes[2],
        },
        metadata: { ...sourceMetadata, frame_index: 3, capture_seconds: captureTimes[2] },
      }),
      audio_track: buildVariant({
        key: "audio_track",
        available: audioAvailable,
        filePath: audioAvailable ? audioPath : null,
        mimeType: "audio/mpeg",
        extension: "mp3",
        width: null,
        height: null,
        durationSeconds: source.durationSeconds,
        sizeBytes: audioSizeBytes,
        transformSpec: {
          operation: "video_audio_track",
          output: "mp3",
          audio_codec: "mp3",
          sample_rate_hz: 16000,
          channels: 1,
          bitrate_kbps: 64,
          available: audioAvailable,
        },
        metadata: {
          ...sourceMetadata,
          available: audioAvailable,
          reason: source.hasAudio ? (audioAvailable ? null : "extraction_failed") : "source_without_audio",
        },
      }),
    },
  };
}
