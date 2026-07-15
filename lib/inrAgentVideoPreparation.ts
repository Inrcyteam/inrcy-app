import "server-only";

import { execFile } from "node:child_process";
import {
  access,
  chmod,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";

import ffmpegStaticPath from "ffmpeg-static";

import { aiTranscribeMedia } from "@/lib/aiGatewayTranscription";
import type { BoosterAiImage } from "@/lib/boosterPublishGeneration";
import { INR_MEDIA_VIDEO_SOURCE_MAX_BYTES } from "@/lib/mediaRules";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const execFileAsync = promisify(execFile);

const FRAME_COUNT = 3;
const FRAME_MAX_EDGE = 768;
const VIDEO_DOWNLOAD_TIMEOUT_MS = 18_000;
const FFMPEG_TASK_TIMEOUT_MS = 22_000;
const TRANSCRIPTION_TIMEOUT_MS = 28_000;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MIN_AUDIO_BYTES = 900;

export const INR_AGENT_VIDEO_AI_PREPARATION_VERSION = 1;

export type InrAgentVideoPreparationSource = {
  id?: string;
  bucket?: string;
  storagePath?: string;
  url?: string;
  mimeType?: string;
  size?: number | null;
  duration?: number | null;
};

export type InrAgentVideoPreparationResult = {
  status: "ready" | "partial" | "unavailable";
  frames: BoosterAiImage[];
  transcript: string;
  rawTranscript: string;
  warnings: string[];
  sourceBytes: number;
  timings: {
    downloadMs: number;
    framesMs: number;
    audioExtractionMs: number;
    transcriptionMs: number;
    totalMs: number;
  };
};

type TaskTimings = InrAgentVideoPreparationResult["timings"];

function emptyTimings(): TaskTimings {
  return {
    downloadMs: 0,
    framesMs: 0,
    audioExtractionMs: 0,
    transcriptionMs: 0,
    totalMs: 0,
  };
}

function cleanStoragePath(value: unknown) {
  const path = String(value || "")
    .replace(/\\/g, "/")
    .replace(/\u0000/g, "")
    .replace(/^\/+/, "")
    .trim();
  if (!path || path.includes("..")) return "";
  return path;
}

function cleanBucket(value: unknown) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9._-]+/g, "")
    .slice(0, 100);
}

function safeVideoExtension(source: InrAgentVideoPreparationSource) {
  const pathExtension = extname(String(source.storagePath || source.url || ""))
    .toLowerCase();
  if (/^\.(mp4|mov|webm|m4v)$/.test(pathExtension)) return pathExtension;
  const type = String(source.mimeType || "").toLowerCase();
  if (type.includes("quicktime")) return ".mov";
  if (type.includes("webm")) return ".webm";
  if (type.includes("m4v")) return ".m4v";
  return ".mp4";
}

function cleanTranscriptText(value: unknown, maxLength = 5_000) {
  return String(value || "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .replace(/^[\'\"“”‘’]+|[\'\"“”‘’]+$/g, "")
    .slice(0, maxLength)
    .trim();
}

function frameRateForDuration(durationSeconds: number | null | undefined) {
  const duration = Number(durationSeconds || 0);
  const usableDuration = Number.isFinite(duration) && duration > 1 ? duration : 12;
  return `${FRAME_COUNT}/${Math.max(1, usableDuration).toFixed(3)}`;
}

async function resolveFfmpegPath() {
  const binaryName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const bundledCandidate = join(
    process.cwd(),
    "node_modules",
    "ffmpeg-static",
    binaryName,
  );
  const candidates = Array.from(
    new Set(
      [
        process.env.FFMPEG_PATH,
        ffmpegStaticPath,
        bundledCandidate,
        "ffmpeg",
      ]
        .map((candidate) => String(candidate || "").trim())
        .filter(Boolean),
    ),
  );
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      if (candidate !== "ffmpeg") {
        await access(candidate);
        if (process.platform !== "win32") {
          await chmod(candidate, 0o755).catch(() => undefined);
        }
      }
      await execFileAsync(candidate, ["-version"], {
        timeout: 6_000,
        maxBuffer: 1024 * 1024,
      });
      return candidate;
    } catch (error) {
      errors.push(
        `${candidate}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  throw new Error(`ffmpeg_unavailable:${errors.join(" | ").slice(0, 500)}`);
}

async function downloadVideo(
  source: InrAgentVideoPreparationSource,
): Promise<Buffer> {
  const bucket = cleanBucket(source.bucket);
  const storagePath = cleanStoragePath(source.storagePath);

  if (bucket && storagePath) {
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .download(storagePath);
    if (error || !data) {
      throw new Error(error?.message || "video_storage_download_failed");
    }
    return Buffer.from(await data.arrayBuffer());
  }

  const url = String(source.url || "").trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("video_source_missing");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VIDEO_DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`video_download_${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

async function extractFrames(args: {
  ffmpegPath: string;
  inputPath: string;
  outputDirectory: string;
  durationSeconds?: number | null;
}) {
  const startedAt = Date.now();
  const outputPattern = join(args.outputDirectory, "frame-%02d.jpg");
  const duration = Number(args.durationSeconds || 0);
  const startOffset = Number.isFinite(duration) && duration > 4
    ? Math.min(1, Math.max(0.25, duration * 0.04))
    : 0;
  const filter = [
    `fps=${frameRateForDuration(duration > 0 ? Math.max(1, duration - startOffset) : null)}`,
    `scale='if(gt(iw,ih),min(${FRAME_MAX_EDGE},iw),-2)':'if(gt(iw,ih),-2,min(${FRAME_MAX_EDGE},ih))'`,
  ].join(",");

  const command = ["-y"];
  if (startOffset > 0) command.push("-ss", startOffset.toFixed(3));
  command.push(
    "-i",
    args.inputPath,
    "-an",
    "-vf",
    filter,
    "-frames:v",
    String(FRAME_COUNT),
    "-q:v",
    "4",
    outputPattern,
  );

  await execFileAsync(args.ffmpegPath, command, {
    timeout: FFMPEG_TASK_TIMEOUT_MS,
    maxBuffer: 8 * 1024 * 1024,
  });

  const names = (await readdir(args.outputDirectory))
    .filter((name) => /^frame-\d+\.jpg$/i.test(name))
    .sort()
    .slice(0, FRAME_COUNT);
  const frames: BoosterAiImage[] = [];
  for (const name of names) {
    const buffer = await readFile(join(args.outputDirectory, name));
    if (!buffer.length) continue;
    frames.push({
      dataUrl: `data:image/jpeg;base64,${buffer.toString("base64")}`,
      detail: "low",
    });
  }

  return { frames, elapsedMs: Date.now() - startedAt };
}

async function extractAndTranscribeAudio(args: {
  ffmpegPath: string;
  inputPath: string;
  outputDirectory: string;
  accountId: string;
}) {
  const audioPath = join(args.outputDirectory, "audio.mp3");
  const extractionStartedAt = Date.now();
  await execFileAsync(
    args.ffmpegPath,
    [
      "-y",
      "-i",
      args.inputPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      "64k",
      audioPath,
    ],
    { timeout: FFMPEG_TASK_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
  );
  const audioExtractionMs = Date.now() - extractionStartedAt;
  const audio = await readFile(audioPath);
  if (audio.length < MIN_AUDIO_BYTES) throw new Error("video_audio_empty");
  if (audio.length > MAX_AUDIO_BYTES) throw new Error("video_audio_too_large");

  const transcriptionStartedAt = Date.now();
  const result = await aiTranscribeMedia({
    file: new File([audio], "inr-agent-video-audio.mp3", {
      type: "audio/mpeg",
    }),
    accountId: args.accountId,
    mediaType: "audio/mpeg",
    retries: 0,
    timeoutMs: TRANSCRIPTION_TIMEOUT_MS,
  });
  const transcriptionMs = Date.now() - transcriptionStartedAt;
  const rawTranscript = cleanTranscriptText(result.text);

  return {
    transcript: rawTranscript,
    rawTranscript,
    audioExtractionMs,
    transcriptionMs,
  };
}

function buildStatus(frames: BoosterAiImage[], transcript: string) {
  if (frames.length && transcript) return "ready" as const;
  if (frames.length || transcript) return "partial" as const;
  return "unavailable" as const;
}

/**
 * Prépare une vidéo iNrAgent sans jamais bloquer la publication :
 * - un seul téléchargement du média source ;
 * - extraction des trois captures et de l'audio en parallèle ;
 * - transcription audio via l'AI Gateway ;
 * - suppression systématique des fichiers temporaires.
 *
 * Le résultat est volontairement best-effort. Les erreurs sont converties en
 * avertissements afin que le moteur rédactionnel puisse continuer avec les
 * éléments effectivement disponibles.
 */
export async function prepareInrAgentVideoForAi(args: {
  source: InrAgentVideoPreparationSource;
  accountId: string;
}): Promise<InrAgentVideoPreparationResult> {
  const startedAt = Date.now();
  const timings = emptyTimings();
  const warnings: string[] = [];
  let tempDirectory = "";
  let sourceBytes = 0;

  try {
    const declaredBytes = Number(args.source.size || 0);
    if (
      Number.isFinite(declaredBytes) &&
      declaredBytes > INR_MEDIA_VIDEO_SOURCE_MAX_BYTES
    ) {
      warnings.push("video_source_too_large");
      return {
        status: "unavailable",
        frames: [],
        transcript: "",
        rawTranscript: "",
        warnings,
        sourceBytes: declaredBytes,
        timings: { ...timings, totalMs: Date.now() - startedAt },
      };
    }

    const downloadStartedAt = Date.now();
    const sourceBuffer = await downloadVideo(args.source);
    timings.downloadMs = Date.now() - downloadStartedAt;
    sourceBytes = sourceBuffer.length;
    if (!sourceBytes) throw new Error("video_source_empty");
    if (sourceBytes > INR_MEDIA_VIDEO_SOURCE_MAX_BYTES) {
      throw new Error("video_source_too_large");
    }

    tempDirectory = await mkdtemp(join(tmpdir(), "inrcy-agent-video-"));
    const inputPath = join(
      tempDirectory,
      `source${safeVideoExtension(args.source)}`,
    );
    await writeFile(inputPath, sourceBuffer);
    const ffmpegPath = await resolveFfmpegPath();

    const [framesResult, audioResult] = await Promise.allSettled([
      extractFrames({
        ffmpegPath,
        inputPath,
        outputDirectory: tempDirectory,
        durationSeconds: args.source.duration,
      }),
      extractAndTranscribeAudio({
        ffmpegPath,
        inputPath,
        outputDirectory: tempDirectory,
        accountId: args.accountId,
      }),
    ]);

    const frames =
      framesResult.status === "fulfilled" ? framesResult.value.frames : [];
    if (framesResult.status === "fulfilled") {
      timings.framesMs = framesResult.value.elapsedMs;
    } else {
      warnings.push(
        `video_frames_unavailable:${String(
          framesResult.reason instanceof Error
            ? framesResult.reason.message
            : framesResult.reason,
        ).slice(0, 240)}`,
      );
    }

    let transcript = "";
    let rawTranscript = "";
    if (audioResult.status === "fulfilled") {
      transcript = audioResult.value.transcript;
      rawTranscript = audioResult.value.rawTranscript;
      timings.audioExtractionMs = audioResult.value.audioExtractionMs;
      timings.transcriptionMs = audioResult.value.transcriptionMs;
      if (!transcript) warnings.push("video_audio_empty");
    } else {
      warnings.push(
        `video_audio_unavailable:${String(
          audioResult.reason instanceof Error
            ? audioResult.reason.message
            : audioResult.reason,
        ).slice(0, 240)}`,
      );
    }

    return {
      status: buildStatus(frames, transcript),
      frames,
      transcript,
      rawTranscript,
      warnings,
      sourceBytes,
      timings: { ...timings, totalMs: Date.now() - startedAt },
    };
  } catch (error) {
    warnings.push(
      `video_preparation_unavailable:${String(
        error instanceof Error ? error.message : error,
      ).slice(0, 300)}`,
    );
    return {
      status: "unavailable",
      frames: [],
      transcript: "",
      rawTranscript: "",
      warnings,
      sourceBytes,
      timings: { ...timings, totalMs: Date.now() - startedAt },
    };
  } finally {
    if (tempDirectory) {
      await rm(tempDirectory, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
  }
}
