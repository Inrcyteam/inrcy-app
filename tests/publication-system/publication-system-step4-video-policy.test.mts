import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  INR_MEDIA_VIDEO_CANONICAL_MAX_BYTES,
  INR_MEDIA_VIDEO_PUBLISH_MAX_BYTES,
  INR_MEDIA_VIDEO_SOURCE_MAX_BYTES,
} from "../../lib/mediaRules.ts";
import { VIDEO_CANONICAL_MAX_BYTES } from "../../lib/mediaVideoNormalizationPolicy.ts";
import { validateVideoPublicationForChannel } from "../../lib/videoPublicationPolicy.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MB = 1024 * 1024;
const read = (relativePath: string) =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

test("la source reste à 300 Mio et le canonique garde uniquement 1 Mio de marge", () => {
  assert.equal(INR_MEDIA_VIDEO_SOURCE_MAX_BYTES, 300 * MB);
  assert.equal(INR_MEDIA_VIDEO_PUBLISH_MAX_BYTES, 300 * MB);
  assert.equal(INR_MEDIA_VIDEO_CANONICAL_MAX_BYTES, 299 * MB);
  assert.equal(VIDEO_CANONICAL_MAX_BYTES, 299 * MB);
});

test("une variante sociale reste publiable jusqu'au garde-fou, mais les sources lourdes sont optimisées", () => {
  for (const channel of [
    "facebook",
    "instagram",
    "linkedin",
    "tiktok",
    "youtube_shorts",
    "pinterest",
    "inrcy_site",
    "site_web",
    "inr_search",
  ] as const) {
    const result = validateVideoPublicationForChannel({
      channel,
      name: "canonical.mp4",
      type: "video/mp4",
      storagePath: "canonical.mp4",
      sizeBytes: 220 * MB,
      durationSeconds: 20,
      width: 1920,
      height: 1080,
    });
    assert.equal(result.ok, true, `${channel} doit accepter une variante de secours 220 Mio`);
  }
});

test("Google Business reste le seul canal forcé vers une variante légère", () => {
  const result = validateVideoPublicationForChannel({
    channel: "gmb",
    name: "canonical.mp4",
    type: "video/mp4",
    storagePath: "canonical.mp4",
    sizeBytes: 220 * MB,
    durationSeconds: 20,
    width: 1920,
    height: 1080,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "video_too_large");
});

test("le worker remuxe seulement une source déjà efficace et compresse les débits excessifs", () => {
  const normalizer = read("lib/mediaVideoNormalizer.ts");
  const policy = read("lib/mediaVideoNormalizationPolicy.ts");
  assert.match(policy, /getVideoCanonicalOptimizationProfile/);
  assert.match(policy, /VIDEO_CANONICAL_MIN_SAVINGS_RATIO = 0\.08/);
  assert.match(normalizer, /encodeQualityOptimizedCanonical/);
  assert.match(normalizer, /VIDEO_CANONICAL_QUALITY_CRF/);
  assert.match(normalizer, /actualSavingsRatio < VIDEO_CANONICAL_MIN_SAVINGS_RATIO/);
  assert.doesNotMatch(normalizer, /VIDEO_ULTRAFAST_SOURCE_THRESHOLD_BYTES/);
});

test("les scripts SQL historiques restent immuables et la politique courante vit dans le runtime", () => {
  const sql = read(
    "ops/sql/2026-07-30_media_pipeline_step10_performance_hardening.sql",
  );
  const verify = read("ops/sql/2026-07-30_media_pipeline_step10_verify.sql");
  assert.match(sql, /40894464/);
  assert.match(verify, /40894464/);
  assert.doesNotMatch(sql, /313524224/);
  assert.doesNotMatch(verify, /313524224/);
});

test("les variantes de format restent plafonnées par la politique globale, sauf Google", () => {
  const transforms = read("lib/boosterVideoTransforms.ts");
  assert.match(
    transforms,
    /maxOutputBytes: INR_MEDIA_VIDEO_PUBLISH_MAX_BYTES/g,
  );
  assert.match(
    transforms,
    /maxOutputBytes: GOOGLE_BUSINESS_VIDEO_TARGET_MAX_BYTES/,
  );
});
