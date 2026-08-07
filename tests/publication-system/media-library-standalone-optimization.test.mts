import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  MEDIA_LIBRARY_EMAIL_TARGET_BYTES,
  MEDIA_LIBRARY_IMAGE_OUTPUT_MAX_BYTES,
  MEDIA_LIBRARY_IMAGE_SOURCE_MAX_BYTES,
  MEDIA_LIBRARY_VIDEO_OUTPUT_MAX_BYTES,
  MEDIA_LIBRARY_VIDEO_SOURCE_MAX_BYTES,
  buildVideoCompressionProfile,
  needsMediaLibraryOptimization,
  normalizeMediaLibraryOptimizationTarget,
} from "../../lib/mediaLibraryOptimizationPolicy.ts";

const ROOT = process.cwd();
const read = (relativePath: string) =>
  readFileSync(path.join(ROOT, relativePath), "utf8");

test("the Media Library keeps heavy originals and exposes exact business compression ceilings", () => {
  assert.equal(MEDIA_LIBRARY_VIDEO_SOURCE_MAX_BYTES, 300 * 1024 * 1024);
  assert.equal(MEDIA_LIBRARY_IMAGE_SOURCE_MAX_BYTES, 300 * 1024 * 1024);
  assert.equal(MEDIA_LIBRARY_VIDEO_OUTPUT_MAX_BYTES, 75_000_000);
  assert.equal(MEDIA_LIBRARY_IMAGE_OUTPUT_MAX_BYTES, 50_000_000);
  assert.equal(MEDIA_LIBRARY_EMAIL_TARGET_BYTES, 20_000_000);
  assert.equal(
    normalizeMediaLibraryOptimizationTarget({ mediaType: "video", targetBytes: 90_000_000 }),
    75_000_000,
  );
  assert.equal(
    normalizeMediaLibraryOptimizationTarget({ mediaType: "image", targetBytes: 90_000_000 }),
    50_000_000,
  );
});

test("compression is driven by the professional's requested target", () => {
  assert.equal(
    needsMediaLibraryOptimization({
      mediaType: "video",
      sizeBytes: 40_000_000,
      targetBytes: 20_000_000,
    }),
    true,
  );
  assert.equal(
    needsMediaLibraryOptimization({
      mediaType: "video",
      sizeBytes: 19_000_000,
      targetBytes: 20_000_000,
    }),
    false,
  );
  const profile = buildVideoCompressionProfile({
    durationSeconds: 180,
    hasAudio: true,
    targetBytes: 20_000_000,
  });
  assert.equal(profile.targetBytes, 20_000_000);
  assert.ok(profile.videoBitrate > 0);
  assert.ok(profile.audioBitrate > 0);
});

test("compression stays autonomous and reusable outside Booster", () => {
  const worker = read("lib/mediaLibraryOptimizationWorker.ts");
  const compressor = read("lib/mediaLibraryVideoCompressor.ts");
  const modal = read("app/dashboard/_components/MediaOptimizerModal.tsx");
  const mediaLibrary = read("app/dashboard/mediatheque/MediaLibraryClient.tsx");
  const boosterProgress = read("lib/boosterProgressPhases.ts");
  const vercel = read("vercel.json");

  assert.match(worker, /target_bytes/);
  assert.match(worker, /source:\s*"mediatheque_optimization"/);
  assert.match(compressor, /superfast/);
  assert.match(modal, /Objectif de poids/);
  assert.match(modal, /Email 20 Mo/);
  assert.match(modal, /Compression forte/);
  assert.match(mediaLibrary, /mediaCanBeCompressed/);
  assert.match(vercel, /api\/cron\/media-library-optimization/);
  assert.doesNotMatch(boosterProgress, /Compression des médias/);
});
