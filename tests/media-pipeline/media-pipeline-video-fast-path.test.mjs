import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const read = (file) => readFileSync(resolve(ROOT, file), "utf8");

test("les MP4 H.264 déjà efficaces évitent le double réencodage complet", () => {
  const normalizer = read("lib/mediaVideoNormalizer.ts");
  assert.match(normalizer, /canFastPrepareCanonical/);
  assert.match(normalizer, /codec === "h264" \|\| codec === "avc1"/);
  assert.match(normalizer, /getVideoCanonicalOptimizationProfile/);
  assert.match(normalizer, /if \(compatibleForRemux\)/);
  assert.match(normalizer, /"-c:v", "copy"/);
  assert.match(normalizer, /"-movflags",\s*"\+faststart"/);
  assert.match(normalizer, /const remuxed = await remuxCanonical\(params\)/);
  assert.doesNotMatch(normalizer, /for \(let attempt = 1; attempt <= 2/);
  assert.match(normalizer, /maxBytes:\s*VIDEO_CANONICAL_TARGET_BYTES/);
});

test("la préparation lourde publie une progression et coupe un FFmpeg silencieux", () => {
  const normalizer = read("lib/mediaVideoNormalizer.ts");
  const worker = read("lib/mediaVideoNormalizationWorker.ts");
  assert.match(normalizer, /"-progress", "pipe:1"/);
  assert.match(normalizer, /FFMPEG_STALL_TIMEOUT_MS/);
  assert.match(normalizer, /video_ffmpeg_timeout/);
  assert.match(normalizer, /video_ffmpeg_stalled/);
  assert.match(worker, /queueNormalizationProgress/);
  assert.match(worker, /onProgress:\s*\(\{ progress, stage \}\)/);
  assert.match(worker, /const persistStageProgress[\s\S]*updateJobProgress/);
  assert.match(worker, /await persistStageProgress\(mapped\)/);
  assert.match(worker, /video_job_lease_refresh_failed/);
});

test("l'analyse IA utilise les captures et l'audio sans fabriquer un second film complet", () => {
  const normalizer = read("lib/mediaVideoNormalizer.ts");
  const consumption = read("lib/mediaWorkspaceConsumption.ts");
  assert.match(normalizer, /available:\s*false,[\s\S]*reason:\s*"ai_uses_server_frames_and_audio"/);
  assert.match(normalizer, /inputPath:\s*params\.inputPath/);
  assert.match(
    consumption,
    /pickReadyVariant\(params\.variants, item\.mediaId, "ai_preview"\) \|\|[\s\S]*pickReadyVariant\(params\.variants, item\.mediaId, "canonical"\)/,
  );
});
