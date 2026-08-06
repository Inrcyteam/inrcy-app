import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  getVideoCanonicalEncoderPreset,
  getVideoCanonicalOptimizationProfile,
  getVideoCanonicalTranscodeProfile,
  VIDEO_CANONICAL_QUALITY_CRF,
} from "../../lib/mediaVideoNormalizationPolicy.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath: string) =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const MB = 1024 * 1024;

test("une vidéo 220 Mo de 20 secondes est obligatoirement optimisée", () => {
  const profile = getVideoCanonicalOptimizationProfile({
    width: 1920,
    height: 1080,
    durationSeconds: 20,
    sourceSizeBytes: 220 * MB,
    hasAudio: true,
  });
  assert.equal(profile.shouldOptimize, true);
  assert.equal(profile.reason, "meaningful_savings");
  assert.ok((profile.expectedSavingsRatio || 0) > 0.8);
});

test("une vidéo longue déjà proche du débit cible garde le remux rapide", () => {
  const profile = getVideoCanonicalOptimizationProfile({
    width: 1920,
    height: 1080,
    durationSeconds: 300,
    sourceSizeBytes: 205 * MB,
    hasAudio: true,
  });
  assert.equal(profile.shouldOptimize, false);
  assert.equal(profile.reason, "already_efficient");
});

test("la compression vidéo est pilotée par la qualité et non par 40 Mo", () => {
  assert.equal(VIDEO_CANONICAL_QUALITY_CRF, 21);
  const normalizer = read("lib/mediaVideoNormalizer.ts");
  assert.match(normalizer, /"-crf"/);
  assert.match(normalizer, /getVideoCanonicalTranscodeProfile/);
  assert.match(normalizer, /canonical_transcode_skipped_low_gain/);
  assert.doesNotMatch(normalizer, /VIDEO_ULTRAFAST_SOURCE_THRESHOLD_BYTES/);
});


test("les sources longues ou AV1 utilisent le preset serveur rapide sans toucher aux petites H.264", () => {
  assert.equal(
    getVideoCanonicalEncoderPreset({
      durationSeconds: 636.8,
      videoCodec: "av1",
    }),
    "ultrafast",
  );
  assert.equal(
    getVideoCanonicalEncoderPreset({
      durationSeconds: 45,
      videoCodec: "h264",
    }),
    "veryfast",
  );
  assert.deepEqual(
    getVideoCanonicalTranscodeProfile({
      durationSeconds: 636.8,
      videoCodec: "av1",
    }),
    {
      encoderPreset: "ultrafast",
      maxSide: 1280,
      fps: 30,
      qualityCrf: 21,
      maxVideoKbps: 2200,
    },
  );
  assert.deepEqual(
    getVideoCanonicalTranscodeProfile({
      durationSeconds: 45,
      videoCodec: "h264",
    }),
    {
      encoderPreset: "veryfast",
      maxSide: 1920,
      fps: 30,
      qualityCrf: 21,
      maxVideoKbps: null,
    },
  );
});

test("l'original compatible reste original et les adaptations explicites restent normalisées", () => {
  const server = read("lib/boosterVideoVariantServer.ts");
  assert.doesNotMatch(server, /requiresSocialOptimization/);
  assert.match(
    server,
    /variant\.format === "original"[\s\S]*sourceCanPublishDirectly/,
  );
  assert.match(server, /CHANNEL_VIDEO_VARIANT_PIPELINE_VERSION = 7/);
  assert.match(server, /"-r",\s*"30"/);
  assert.doesNotMatch(server, /quality\.videoBitrate/);
});

test("les images utilisent MozJPEG et invalident le cache de publication", () => {
  const normalizer = read("lib/mediaImageNormalizer.ts");
  const server = read("lib/boosterImageServerPreparation.ts");
  assert.match(normalizer, /mozjpeg: !providerSafe/);
  assert.match(normalizer, /optimiseScans: !providerSafe/);
  assert.match(server, /CHANNEL_IMAGE_VARIANT_PIPELINE_VERSION = 8/);
  assert.match(server, /TIKTOK_CHANNEL_IMAGE_VARIANT_PIPELINE_VERSION = 9/);
  assert.match(server, /function getChannelJpegOptions/);
  assert.match(server, /quality = 87/);
  assert.match(server, /progressive: false/);
  assert.match(server, /compressionLevel: 9/);
});
