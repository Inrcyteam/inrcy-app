import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  INR_MEDIA_VIDEO_CANONICAL_MAX_BYTES,
  INR_MEDIA_VIDEO_CANONICAL_TARGET_BYTES,
  INR_MEDIA_VIDEO_COMPRESSION_TRIGGER_BYTES,
  INR_MEDIA_VIDEO_PUBLISH_MAX_BYTES,
  INR_MEDIA_VIDEO_SOURCE_MAX_BYTES,
} from "../../lib/mediaRules.ts";
import {
  VIDEO_CANONICAL_MAX_BYTES,
  VIDEO_CANONICAL_TARGET_BYTES,
} from "../../lib/mediaVideoNormalizationPolicy.ts";
import { validateVideoPublicationForChannel } from "../../lib/videoPublicationPolicy.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MB = 1024 * 1024;
const read = (relativePath: string) =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

test("la source reste à 300 Mio et le master partagé reste sous 70 Mo", () => {
  assert.equal(INR_MEDIA_VIDEO_SOURCE_MAX_BYTES, 300 * MB);
  assert.equal(INR_MEDIA_VIDEO_PUBLISH_MAX_BYTES, 70_000_000 - 1);
  assert.equal(INR_MEDIA_VIDEO_COMPRESSION_TRIGGER_BYTES, 70_000_000);
  assert.equal(INR_MEDIA_VIDEO_CANONICAL_TARGET_BYTES, 65_000_000);
  assert.equal(INR_MEDIA_VIDEO_CANONICAL_MAX_BYTES, 70_000_000 - 1);
  assert.equal(VIDEO_CANONICAL_TARGET_BYTES, 65_000_000);
  assert.equal(VIDEO_CANONICAL_MAX_BYTES, 70_000_000 - 1);
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

test("le worker remuxe le MP4 léger compatible ou lance un unique encodage ciblé", () => {
  const normalizer = read("lib/mediaVideoNormalizer.ts");
  const policy = read("lib/mediaVideoNormalizationPolicy.ts");
  assert.match(policy, /getVideoCanonicalOptimizationProfile/);
  assert.match(
    policy,
    /VIDEO_SHARED_CANONICAL_PREFERRED_SOURCE_BYTES\s*=\s*[\r\n\s]*INR_MEDIA_VIDEO_COMPRESSION_TRIGGER_BYTES/,
  );
  assert.match(normalizer, /if \(compatibleForRemux\)/);
  assert.match(normalizer, /maxBytes:\s*VIDEO_CANONICAL_TARGET_BYTES/);
  assert.match(normalizer, /optimizationReason:\s*"shared_master_target_65mb"/);
  assert.doesNotMatch(normalizer, /encodeQualityOptimizedCanonical/);
  assert.doesNotMatch(normalizer, /for \(let attempt = 1; attempt <= 2/);
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
