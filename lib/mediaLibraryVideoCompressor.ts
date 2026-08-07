import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import {
  MEDIA_LIBRARY_VIDEO_OUTPUT_MAX_BYTES,
  normalizeMediaLibraryOptimizationTarget,
  buildVideoCompressionProfile,
  type VideoCompressionProfile,
} from "@/lib/mediaLibraryOptimizationPolicy";
import {
  probeVideoSource,
  resolveVideoNormalizationFfmpegPath,
  type VideoSourceProbe,
} from "@/lib/mediaVideoNormalizer";

export type MediaLibraryVideoCompressionResult = {
  outputPath: string;
  sizeBytes: number;
  source: VideoSourceProbe;
  output: VideoSourceProbe;
  profile: VideoCompressionProfile;
  mimeType: "video/mp4";
  extension: "mp4";
};

function compactError(value: unknown) {
  return String(value || "Erreur FFmpeg")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2_000);
}

function encoderPreset(source: VideoSourceProbe, profile: VideoCompressionProfile) {
  // Long videos are where the old `veryfast` preset was most expensive.
  // `superfast` keeps H.264 compatibility while materially reducing CPU time.
  if (source.durationSeconds >= 180 || profile.maxSide >= 1280) return "superfast";
  return "veryfast";
}

async function runFfmpegCompression(params: {
  ffmpegPath: string;
  inputPath: string;
  outputPath: string;
  source: VideoSourceProbe;
  profile: VideoCompressionProfile;
  progressStart: number;
  progressEnd: number;
  onProgress?: (progress: number, stage: string) => void;
}) {
  const filters = [
    `scale='min(${params.profile.maxSide},iw)':'min(${params.profile.maxSide},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`,
    "setsar=1",
  ];
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
    "-map",
    "0:a:0?",
    "-vf",
    filters.join(","),
    "-c:v",
    "libx264",
    "-preset",
    encoderPreset(params.source, params.profile),
    "-threads",
    "0",
    "-profile:v",
    "high",
    "-level",
    "4.1",
    "-pix_fmt",
    "yuv420p",
    "-b:v",
    String(params.profile.videoBitrate),
    "-maxrate",
    String(Math.max(params.profile.videoBitrate, Math.round(params.profile.videoBitrate * 1.15))),
    "-bufsize",
    String(Math.max(144_000, params.profile.videoBitrate * 2)),
  ];

  if (params.source.frameRate > 30.5) args.push("-r", "30");
  if (params.source.hasAudio && params.profile.audioBitrate > 0) {
    args.push(
      "-c:a",
      "aac",
      "-b:a",
      String(params.profile.audioBitrate),
      "-ac",
      "2",
      "-ar",
      "44100",
    );
  } else {
    args.push("-an");
  }
  args.push(
    "-movflags",
    "+faststart",
    "-max_muxing_queue_size",
    "2048",
    "-progress",
    "pipe:1",
    "-nostats",
    params.outputPath,
  );

  await new Promise<void>((resolve, reject) => {
    const child = spawn(params.ffmpegPath, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdoutBuffer = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("video_compression_timeout"));
    }, 1_650_000);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || "";
      for (const line of lines) {
        const [key, rawValue] = line.split("=", 2);
        if (key !== "out_time_us" && key !== "out_time_ms") continue;
        const microseconds = Number(rawValue || 0);
        if (!Number.isFinite(microseconds) || microseconds <= 0) continue;
        const elapsedSeconds = microseconds / 1_000_000;
        const ratio = Math.max(
          0,
          Math.min(1, elapsedSeconds / params.source.durationSeconds),
        );
        params.onProgress?.(
          params.progressStart +
            ratio * (params.progressEnd - params.progressStart),
          "Compression de la vidéo",
        );
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-8_000);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`video_compression_failed:${compactError(stderr)}`));
    });
  });
}

export async function compressMediaLibraryVideo(params: {
  inputPath: string;
  outputPath: string;
  targetBytes?: number | null;
  fallbackWidth?: number | null;
  fallbackHeight?: number | null;
  fallbackDurationSeconds?: number | null;
  onProgress?: (progress: number, stage: string) => void;
}): Promise<MediaLibraryVideoCompressionResult> {
  const ffmpegPath = await resolveVideoNormalizationFfmpegPath();
  params.onProgress?.(16, "Analyse de la vidéo");
  const source = await probeVideoSource({
    ffmpegPath,
    inputPath: params.inputPath,
    fallbackWidth: params.fallbackWidth,
    fallbackHeight: params.fallbackHeight,
    fallbackDurationSeconds: params.fallbackDurationSeconds,
    timeoutMs: 60_000,
  });

  const requestedTargetBytes = normalizeMediaLibraryOptimizationTarget({
    mediaType: "video",
    targetBytes: params.targetBytes,
  });
  let profile = buildVideoCompressionProfile({
    durationSeconds: source.durationSeconds,
    hasAudio: source.hasAudio,
    // buildVideoCompressionProfile already reserves container overhead, so the
    // first encode stays close to the professional's requested weight.
    targetBytes: requestedTargetBytes,
  });

  await runFfmpegCompression({
    ffmpegPath,
    inputPath: params.inputPath,
    outputPath: params.outputPath,
    source,
    profile,
    progressStart: 20,
    progressEnd: 86,
    onProgress: params.onProgress,
  });

  let sizeBytes = Number((await stat(params.outputPath)).size || 0);
  if (!sizeBytes) throw new Error("video_output_empty");

  // Normally one encode is enough. If muxing/codec overhead still overshoots,
  // retry once using the measured result instead of a fixed second target.
  if (sizeBytes > requestedTargetBytes) {
    params.onProgress?.(72, "Ajustement final de la compression");
    const correctionRatio = requestedTargetBytes / sizeBytes;
    const retryTarget = Math.max(
      5_000_000,
      Math.floor(profile.targetBytes * correctionRatio * 0.94),
    );
    profile = buildVideoCompressionProfile({
      durationSeconds: source.durationSeconds,
      hasAudio: source.hasAudio,
      targetBytes: retryTarget,
    });
    await runFfmpegCompression({
      ffmpegPath,
      inputPath: params.inputPath,
      outputPath: params.outputPath,
      source,
      profile,
      progressStart: 72,
      progressEnd: 88,
      onProgress: params.onProgress,
    });
    sizeBytes = Number((await stat(params.outputPath)).size || 0);
  }

  if (!sizeBytes || sizeBytes > requestedTargetBytes || sizeBytes > MEDIA_LIBRARY_VIDEO_OUTPUT_MAX_BYTES) {
    throw new Error(`video_output_too_large:${sizeBytes}`);
  }

  params.onProgress?.(90, "Vérification de la vidéo compressée");
  const output = await probeVideoSource({
    ffmpegPath,
    inputPath: params.outputPath,
    timeoutMs: 60_000,
  });
  if (output.videoCodec !== "h264") {
    throw new Error(`video_output_codec_invalid:${output.videoCodec}`);
  }
  if (output.hasAudio && output.audioCodec !== "aac") {
    throw new Error(`video_output_audio_codec_invalid:${output.audioCodec}`);
  }

  return {
    outputPath: params.outputPath,
    sizeBytes,
    source,
    output,
    profile,
    mimeType: "video/mp4",
    extension: "mp4",
  };
}
