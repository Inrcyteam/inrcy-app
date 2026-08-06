import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const read = (file) => readFileSync(resolve(ROOT, file), "utf8");

test("Booster ne fabrique plus aucun second fichier vidéo", () => {
  const normalizer = read("lib/mediaVideoNormalizer.ts");
  assert.doesNotMatch(normalizer, /libx264|VIDEO_CANONICAL_TARGET_BYTES/);
  assert.doesNotMatch(normalizer, /key:\s*"canonical"|key:\s*"ai_preview"/);
  assert.match(normalizer, /BOOSTER_VIDEO_DERIVATIVE_KEYS/);
  assert.match(normalizer, /"thumbnail"/);
  assert.match(normalizer, /"frame_01"/);
  assert.match(normalizer, /"audio_track"/);
});

test("les extractions bornées publient une progression durable", () => {
  const normalizer = read("lib/mediaVideoNormalizer.ts");
  const worker = read("lib/mediaVideoNormalizationWorker.ts");
  assert.match(normalizer, /FFMPEG_DERIVATIVE_TIMEOUT_MS/);
  assert.match(normalizer, /extractFrame/);
  assert.match(normalizer, /extractAudioTrack/);
  assert.match(worker, /queueNormalizationProgress/);
  assert.match(worker, /onProgress:\s*\(\{ progress, stage \}\)/);
  assert.match(worker, /const persistStageProgress[\s\S]*updateJobProgress/);
  assert.match(worker, /await persistStageProgress\(mapped\)/);
  assert.match(worker, /video_job_lease_refresh_failed/);
});

test("l'analyse IA utilise les captures et l'audio issus de l'original", () => {
  const normalizer = read("lib/mediaVideoNormalizer.ts");
  const consumption = read("lib/mediaWorkspaceConsumption.ts");
  assert.match(normalizer, /inputPath:\s*params\.inputPath/);
  assert.doesNotMatch(normalizer, /key:\s*"ai_preview"/);
  assert.match(
    consumption,
    /const videoReference = \{[\s\S]*storagePath: item\.sourceStoragePath/,
  );
  assert.match(consumption, /\["frame_01", "frame_02", "frame_03"\] as const/);
  assert.match(consumption, /"audio_track"/);
});
