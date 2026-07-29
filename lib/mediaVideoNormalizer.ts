import { execFile } from "node:child_process";
import { access, chmod, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegStaticPath from "ffmpeg-static";
import {
  VIDEO_AI_PREVIEW_FPS,
  VIDEO_AI_PREVIEW_MAX_BYTES,
  VIDEO_AI_PREVIEW_MAX_SIDE,
  VIDEO_AUDIO_TRACK_MAX_BYTES,
  VIDEO_CANONICAL_MAX_BYTES,
  VIDEO_CANONICAL_MAX_SIDE,
  VIDEO_FRAME_MAX_BYTES,
  VIDEO_FRAME_MAX_SIDE,
  VIDEO_THUMBNAIL_MAX_SIDE,
  buildVideoFrameCaptureTimes,
  fitVideoWithinMaxSide,
  getOrientedVideoDimensions,
  getVideoNormalizationPurpose,
  getVideoTargetBitrateKbps,
  type VideoNormalizationPurpose,
  type VideoNormalizationVariantKey,
} from "@/lib/mediaVideoNormalizationPolicy";

const execFileAsync = promisify(execFile);
const FFMPEG_PROBE_TIMEOUT_MS = 30_000;
const FFMPEG_CANONICAL_TIMEOUT_MS = 220_000;
const FFMPEG_PREVIEW_TIMEOUT_MS = 150_000;
const FFMPEG_DERIVATIVE_TIMEOUT_MS = 90_000;

export type VideoSourceProbe = {
  width: number;
  height: number;
  orientedWidth: number;
  orientedHeight: number;
  durationSeconds: number;
  rotationDegrees: number;
  hasAudio: boolean;
  videoCodec: string;
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
      [
        process.env.FFMPEG_PATH,
        ffmpegStaticPath,
        getBundledFfmpegCandidate(),
        "ffmpeg",
      ]
        .map((candidate) => String(candidate || "").trim())
        .filter(Boolean),
    ),
  );
}

async function makeExecutableIfNeeded(candidate: string) {
  if (!candidate || candidate === "ffmpeg" || process.platform === "win32") {
    return;
  }
  try {
    await access(candidate);
    await chmod(candidate, 0o755);
  } catch {
    // Le contrôle -version ci-dessous retournera l'erreur exploitable.
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

function parseVideoStream(stderr: string) {
  const line = stderr
    .split(/\r?\n/)
    .find((entry) => /Stream .*Video:/i.test(entry));
  if (!line) return { width: 0, height: 0, codec: "unknown" };
  const dimensions = line.match(/(?:^|\D)(\d{2,5})x(\d{2,5})(?:\D|$)/);
  const codec = line.match(/Video:\s*([^,\s]+)/i)?.[1] || "unknown";
  return {
    width: Number(dimensions?.[1] || 0),
    height: Number(dimensions?.[2] || 0),
    codec,
  };
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
  const oriented = getOrientedVideoDimensions({
    width,
    height,
    rotationDegrees,
  });
  const probedDuration = parseDurationSeconds(stderr);
  const fallbackDuration = Math.max(
    0,
    Number(params.fallbackDurationSeconds || 0),
  );
  const durationSeconds = probedDuration || fallbackDuration;
  if (!durationSeconds) throw new Error("video_duration_unavailable");

  return {
    width,
    height,
    orientedWidth: oriented.width,
    orientedHeight: oriented.height,
    durationSeconds,
    rotationDegrees,
    hasAudio: /Stream .*Audio:/i.test(stderr),
    videoCodec: stream.codec,
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
}) {
  const initialBitrate = getVideoTargetBitrateKbps({
    durationSeconds: params.durationSeconds,
    maxBytes: params.maxBytes,
    audioBitrateKbps: params.includeAudio ? params.audioBitrateKbps : 0,
    minVideoKbps: params.minVideoKbps,
    maxVideoKbps: params.maxVideoKbps,
  });

  let bitrate = initialBitrate;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const args = [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
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
      "veryfast",
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
      "-threads",
      "2",
    );
    if (params.includeAudio) {
      args.push(
        "-c:a",
        "aac",
        "-b:a",
        `${params.audioBitrateKbps}k`,
        "-ac",
        "2",
      );
    } else {
      args.push("-an");
    }
    args.push(params.outputPath);

    await execFileAsync(params.ffmpegPath, args, {
      timeout: params.timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
    });
    const sizeBytes = await outputSize(params.outputPath);
    if (sizeBytes > 0 && sizeBytes <= params.maxBytes) {
      return { sizeBytes, bitrateKbps: bitrate, attempts: attempt };
    }
    if (attempt === 2) {
      throw new Error(
        `video_output_too_large:${path.basename(params.outputPath)}:${sizeBytes}`,
      );
    }
    bitrate = Math.max(120, Math.floor(bitrate * 0.68));
  }
  throw new Error("video_encoding_failed");
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
  if (sizeBytes > VIDEO_FRAME_MAX_BYTES) {
    throw new Error(`video_frame_too_large:${sizeBytes}`);
  }
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
  if (sizeBytes > VIDEO_AUDIO_TRACK_MAX_BYTES) {
    throw new Error(`video_audio_too_large:${sizeBytes}`);
  }
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
}): Promise<NormalizedVideoBundle> {
  await mkdir(params.outputDirectory, { recursive: true });
  const ffmpegPath = await resolveVideoNormalizationFfmpegPath();
  const source = await probeVideoSource({
    ffmpegPath,
    inputPath: params.inputPath,
    fallbackWidth: params.fallbackWidth,
    fallbackHeight: params.fallbackHeight,
    fallbackDurationSeconds: params.fallbackDurationSeconds,
  });
  const warnings: string[] = [];
  const canonicalPath = path.join(params.outputDirectory, "canonical.mp4");
  const previewPath = path.join(params.outputDirectory, "ai-preview.mp4");
  const audioPath = path.join(params.outputDirectory, "audio-track.mp3");
  const framePaths = [1, 2, 3].map((index) =>
    path.join(params.outputDirectory, `frame-${String(index).padStart(2, "0")}.jpg`),
  );
  const thumbnailPath = path.join(params.outputDirectory, "thumbnail.jpg");

  const canonicalEncoding = await encodeMp4({
    ffmpegPath,
    inputPath: params.inputPath,
    outputPath: canonicalPath,
    maxSide: VIDEO_CANONICAL_MAX_SIDE,
    durationSeconds: source.durationSeconds,
    maxBytes: VIDEO_CANONICAL_MAX_BYTES,
    maxVideoKbps: 5_000,
    minVideoKbps: 250,
    audioBitrateKbps: 128,
    includeAudio: source.hasAudio,
    timeoutMs: FFMPEG_CANONICAL_TIMEOUT_MS,
  });

  const previewPromise = encodeMp4({
    ffmpegPath,
    inputPath: canonicalPath,
    outputPath: previewPath,
    maxSide: VIDEO_AI_PREVIEW_MAX_SIDE,
    durationSeconds: source.durationSeconds,
    maxBytes: VIDEO_AI_PREVIEW_MAX_BYTES,
    maxVideoKbps: 1_800,
    minVideoKbps: 160,
    audioBitrateKbps: 0,
    includeAudio: false,
    fps: VIDEO_AI_PREVIEW_FPS,
    timeoutMs: FFMPEG_PREVIEW_TIMEOUT_MS,
  });
  const audioPromise = source.hasAudio
    ? extractAudioTrack({ ffmpegPath, inputPath: canonicalPath, outputPath: audioPath })
    : Promise.resolve(0);
  const [previewResult, audioResult] = await Promise.allSettled([
    previewPromise,
    audioPromise,
  ]);
  if (previewResult.status === "rejected") throw previewResult.reason;
  let audioSizeBytes = 0;
  let audioAvailable = source.hasAudio;
  if (audioResult.status === "fulfilled") {
    audioSizeBytes = audioResult.value;
  } else {
    audioAvailable = false;
    warnings.push(`audio_track_unavailable:${compactError(audioResult.reason)}`);
  }

  const captureTimes = buildVideoFrameCaptureTimes(source.durationSeconds);
  const frameSizes: number[] = [];
  for (let index = 0; index < framePaths.length; index += 1) {
    frameSizes.push(
      await extractFrame({
        ffmpegPath,
        inputPath: previewPath,
        outputPath: framePaths[index],
        timestampSeconds: captureTimes[index],
        maxSide: VIDEO_FRAME_MAX_SIDE,
        quality: 4,
      }),
    );
  }
  const thumbnailSize = await extractFrame({
    ffmpegPath,
    inputPath: previewPath,
    outputPath: thumbnailPath,
    timestampSeconds: captureTimes[0],
    maxSide: VIDEO_THUMBNAIL_MAX_SIDE,
    quality: 5,
  });

  const canonicalDimensions = fitVideoWithinMaxSide({
    width: source.orientedWidth,
    height: source.orientedHeight,
    maxSide: VIDEO_CANONICAL_MAX_SIDE,
  });
  const previewDimensions = fitVideoWithinMaxSide({
    width: source.orientedWidth,
    height: source.orientedHeight,
    maxSide: VIDEO_AI_PREVIEW_MAX_SIDE,
  });
  const thumbnailDimensions = fitVideoWithinMaxSide({
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
    source_has_audio: source.hasAudio,
    metadata_stripped: true,
  };

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
          pixel_format: "yuv420p",
          faststart: true,
          bitrate_kbps: canonicalEncoding.bitrateKbps,
        },
        metadata: sourceMetadata,
      }),
      ai_preview: buildVariant({
        key: "ai_preview",
        filePath: previewPath,
        mimeType: "video/mp4",
        extension: "mp4",
        width: previewDimensions.width,
        height: previewDimensions.height,
        durationSeconds: source.durationSeconds,
        sizeBytes: previewResult.value.sizeBytes,
        transformSpec: {
          operation: "video_ai_preview",
          output: "mp4",
          video_codec: "h264",
          audio_removed: true,
          max_side: VIDEO_AI_PREVIEW_MAX_SIDE,
          fps: VIDEO_AI_PREVIEW_FPS,
          crop: false,
          preserve_ratio: true,
          without_enlargement: true,
          pixel_format: "yuv420p",
          faststart: true,
          bitrate_kbps: previewResult.value.bitrateKbps,
        },
        metadata: sourceMetadata,
      }),
      thumbnail: buildVariant({
        key: "thumbnail",
        filePath: thumbnailPath,
        mimeType: "image/jpeg",
        extension: "jpg",
        width: thumbnailDimensions.width,
        height: thumbnailDimensions.height,
        durationSeconds: source.durationSeconds,
        sizeBytes: thumbnailSize,
        transformSpec: {
          operation: "video_thumbnail",
          output: "jpeg",
          max_side: VIDEO_THUMBNAIL_MAX_SIDE,
          crop: false,
          capture_seconds: captureTimes[0],
        },
        metadata: { ...sourceMetadata, capture_seconds: captureTimes[0] },
      }),
      frame_01: buildVariant({
        key: "frame_01",
        filePath: framePaths[0],
        mimeType: "image/jpeg",
        extension: "jpg",
        width: previewDimensions.width,
        height: previewDimensions.height,
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
        filePath: framePaths[1],
        mimeType: "image/jpeg",
        extension: "jpg",
        width: previewDimensions.width,
        height: previewDimensions.height,
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
        filePath: framePaths[2],
        mimeType: "image/jpeg",
        extension: "jpg",
        width: previewDimensions.width,
        height: previewDimensions.height,
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
          reason: source.hasAudio
            ? audioAvailable
              ? null
              : "extraction_failed"
            : "source_without_audio",
        },
      }),
    },
  };
}
