import assert from "node:assert/strict";
import test from "node:test";

import {
  getBoosterOriginalPublicationExtension,
  shouldPreserveBoosterOriginalAlpha,
} from "../../lib/boosterImageOutputPolicy.ts";
import { classifyBoosterPublicationResult } from "../../lib/boosterPublicationOutcome.ts";
import {
  getGoogleBusinessVideoPreparationDecision,
  GOOGLE_BUSINESS_VIDEO_TARGET_MAX_BYTES,
} from "../../lib/googleBusinessMediaPolicy.ts";
import {
  INR_MEDIA_VIDEO_CANONICAL_MAX_BYTES,
  INR_MEDIA_VIDEO_CANONICAL_TARGET_BYTES,
  INR_MEDIA_VIDEO_COMPRESSION_TRIGGER_BYTES,
  INR_MEDIA_VIDEO_SOURCE_MAX_BYTES,
} from "../../lib/mediaRules.ts";
import {
  buildMetaGraphUrl,
  buildMetaGraphVideoUrl,
  normalizeMetaGraphApiVersion,
} from "../../lib/metaGraphApi.ts";

test("la source 300 Mio est acceptée puis son master cible 65 Mo", () => {
  assert.equal(INR_MEDIA_VIDEO_SOURCE_MAX_BYTES, 300 * 1024 * 1024);
  assert.equal(INR_MEDIA_VIDEO_COMPRESSION_TRIGGER_BYTES, 70_000_000);
  assert.equal(INR_MEDIA_VIDEO_CANONICAL_TARGET_BYTES, 65_000_000);
  assert.equal(INR_MEDIA_VIDEO_CANONICAL_MAX_BYTES, 70_000_000 - 1);
  assert.ok(
    INR_MEDIA_VIDEO_CANONICAL_TARGET_BYTES <
      INR_MEDIA_VIDEO_CANONICAL_MAX_BYTES,
  );
});

test("Google prépare 220 Mo, accepte une vidéo conforme et ne coupe jamais silencieusement 31 secondes", () => {
  const heavy = getGoogleBusinessVideoPreparationDecision({
    name: "video.mp4",
    type: "video/mp4",
    storagePath: "videos/video.mp4",
    sizeBytes: 220 * 1024 * 1024,
    durationSeconds: 20,
    width: 1280,
    height: 720,
    videoCodec: "h264",
    audioCodec: "aac",
    frameRate: 30,
    hasAudio: true,
    containerFormats: ["mov", "mp4"],
    pixelFormat: "yuv420p",
  });
  assert.deepEqual(heavy, { action: "prepare", reason: "size_requires_compression" });

  const direct = getGoogleBusinessVideoPreparationDecision({
    name: "video.mp4",
    type: "video/mp4",
    storagePath: "videos/video.mp4",
    sizeBytes: GOOGLE_BUSINESS_VIDEO_TARGET_MAX_BYTES - 1024,
    durationSeconds: 20,
    width: 1280,
    height: 720,
    videoCodec: "h264",
    audioCodec: "aac",
    frameRate: 30,
    hasAudio: true,
    containerFormats: ["mov", "mp4"],
    pixelFormat: "yuv420p",
  });
  assert.deepEqual(direct, { action: "direct", reason: "already_compatible" });

  const tooLong = getGoogleBusinessVideoPreparationDecision({
    name: "video.mp4",
    type: "video/mp4",
    storagePath: "videos/video.mp4",
    sizeBytes: 20 * 1024 * 1024,
    durationSeconds: 31,
    width: 1280,
    height: 720,
  });
  assert.equal(tooLong.action, "block");
  if (tooLong.action === "block") {
    assert.match(tooLong.errorMessage, /n’a pas été coupée automatiquement/);
  }
});

test("un texte publié sans média est un avertissement terminal, pas un échec", () => {
  const outcome = classifyBoosterPublicationResult({
    ok: true,
    warning: "published_without_media",
    warning_message: "Le réseau a refusé le média.",
  });
  assert.equal(outcome.status, "published_with_warning");
  assert.equal(outcome.warningKind, "media_degraded");
  assert.match(outcome.warningMessage || "", /iNrSend/);
});

test("un statut TikTok non terminal reste en traitement", () => {
  const outcome = classifyBoosterPublicationResult({
    ok: true,
    tiktok_status: "PROCESSING_UPLOAD",
  });
  assert.equal(outcome.status, "processing");
  assert.equal(outcome.warningKind, "pending");
});

test("la transparence est conservée sur les surfaces iNrCy mais pas imposée aux réseaux sociaux", () => {
  assert.equal(
    getBoosterOriginalPublicationExtension({ channel: "inrcy_site", sourceMime: "image/png" }),
    "png",
  );
  assert.equal(
    getBoosterOriginalPublicationExtension({ channel: "site_web", sourceMime: "image/webp" }),
    "png",
  );
  assert.equal(
    getBoosterOriginalPublicationExtension({ channel: "facebook", sourceMime: "image/png" }),
    "jpg",
  );
  assert.equal(
    shouldPreserveBoosterOriginalAlpha({ channel: "inr_search", sourceMime: "image/avif" }),
    true,
  );
});

test("Meta utilise un constructeur central et refuse les versions invalides", () => {
  assert.equal(normalizeMetaGraphApiVersion("v24.0"), "v24.0");
  assert.equal(normalizeMetaGraphApiVersion("24.0"), "v25.0");
  assert.match(buildMetaGraphUrl("me/accounts"), /^https:\/\/graph\.facebook\.com\/v\d+\.\d+\/me\/accounts$/);
  assert.match(buildMetaGraphVideoUrl("123/videos"), /^https:\/\/graph-video\.facebook\.com\/v\d+\.\d+\/123\/videos$/);
});
