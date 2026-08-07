import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  MEDIA_LIBRARY_IMAGE_OUTPUT_MAX_BYTES,
  MEDIA_LIBRARY_IMAGE_SOURCE_MAX_BYTES,
  MEDIA_LIBRARY_VIDEO_OUTPUT_MAX_BYTES,
  MEDIA_LIBRARY_VIDEO_SOURCE_MAX_BYTES,
  buildVideoCompressionProfile,
  needsMediaLibraryOptimization,
} from "../../lib/mediaLibraryOptimizationPolicy.ts";

const ROOT = process.cwd();
const read = (relativePath: string) =>
  readFileSync(path.join(ROOT, relativePath), "utf8");

test("the Media Library accepts heavy originals while Booster limits remain unchanged", () => {
  assert.equal(MEDIA_LIBRARY_VIDEO_SOURCE_MAX_BYTES, 300 * 1024 * 1024);
  assert.equal(MEDIA_LIBRARY_IMAGE_SOURCE_MAX_BYTES, 300 * 1024 * 1024);
  assert.equal(MEDIA_LIBRARY_VIDEO_OUTPUT_MAX_BYTES, 75_000_000);
  assert.equal(MEDIA_LIBRARY_IMAGE_OUTPUT_MAX_BYTES, 50 * 1024 * 1024);
  assert.equal(
    needsMediaLibraryOptimization({ mediaType: "video", sizeBytes: 75_000_001 }),
    true,
  );
  assert.equal(
    needsMediaLibraryOptimization({ mediaType: "video", sizeBytes: 75_000_000 }),
    false,
  );
});

test("video optimization targets a safe file below Booster's hard ceiling", () => {
  const profile = buildVideoCompressionProfile({
    durationSeconds: 180,
    hasAudio: true,
  });
  assert.ok(profile.targetBytes < MEDIA_LIBRARY_VIDEO_OUTPUT_MAX_BYTES);
  assert.ok(profile.videoBitrate > 0);
  assert.ok(profile.audioBitrate > 0);
});

test("optimization is autonomous and never re-enters Booster publication", () => {
  const worker = read("lib/mediaLibraryOptimizationWorker.ts");
  const boosterProgress = read("lib/boosterProgressPhases.ts");
  const mediaLibrary = read(
    "app/dashboard/mediatheque/MediaLibraryClient.tsx",
  );
  const vercel = read("vercel.json");

  assert.match(worker, /source_media_id/);
  assert.match(worker, /source_sha256/);
  assert.match(worker, /source:\s*"mediatheque_optimization"/);
  assert.match(mediaLibrary, /Compresser pour Booster/);
  assert.match(mediaLibrary, /Copie compatible créée/);
  assert.match(vercel, /api\/cron\/media-library-optimization/);
  assert.doesNotMatch(boosterProgress, /Compression des médias/);
});

