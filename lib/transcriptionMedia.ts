import "server-only";

import { execFile } from "node:child_process";
import { access, chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";

import ffmpegStaticPath from "ffmpeg-static";

const execFileAsync = promisify(execFile);

function safeExtension(file: File): string {
  const ext = extname(String(file.name || "")).toLowerCase();
  if (/^\.(mp4|mov|webm|m4v)$/.test(ext)) return ext;
  const type = String(file.type || "").toLowerCase();
  if (type.includes("quicktime")) return ".mov";
  if (type.includes("webm")) return ".webm";
  return ".mp4";
}

async function resolveFfmpegPath(): Promise<string> {
  const candidates = Array.from(new Set([ffmpegStaticPath || "", "ffmpeg"].filter(Boolean)));
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      if (candidate !== "ffmpeg") {
        await access(candidate);
        if (process.platform !== "win32") await chmod(candidate, 0o755).catch(() => undefined);
      }
      await execFileAsync(candidate, ["-version"], { timeout: 5000, maxBuffer: 512 * 1024 });
      return candidate;
    } catch (error) {
      errors.push(`${candidate}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`FFmpeg indisponible pour extraire la piste audio (${errors.join(" | ")}).`);
}

/**
 * Le REST Speech-to-Text Gateway documente un payload audio base64. Pour les
 * vidéos Booster, on extrait donc une petite piste MP3 avant l'appel Gateway.
 * Cela réduit aussi fortement la taille du payload par rapport au fichier vidéo.
 */
export async function extractVideoAudioForGateway(file: File): Promise<File> {
  const ffmpegPath = await resolveFfmpegPath();
  const dir = await mkdtemp(join(tmpdir(), "inrcy-transcribe-"));
  const inputPath = join(dir, `input${safeExtension(file)}`);
  const outputPath = join(dir, "audio.mp3");

  try {
    await writeFile(inputPath, Buffer.from(await file.arrayBuffer()));
    await execFileAsync(
      ffmpegPath,
      [
        "-y",
        "-i",
        inputPath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-b:a",
        "64k",
        outputPath,
      ],
      { timeout: 35_000, maxBuffer: 4 * 1024 * 1024 },
    );

    const audio = await readFile(outputPath);
    if (audio.length < 900) throw new Error("Piste audio vide ou trop courte.");
    return new File([audio], "booster-video-audio.mp3", { type: "audio/mpeg" });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
