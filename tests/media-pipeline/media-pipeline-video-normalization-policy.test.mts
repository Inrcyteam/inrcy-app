import assert from "node:assert/strict";
import test from "node:test";
import {
  VIDEO_FRAME_MAX_SIDE,
  VIDEO_NORMALIZATION_MAX_SOURCE_BYTES,
  VIDEO_NORMALIZATION_MAX_SOURCE_MB_LABEL,
  VIDEO_NORMALIZATION_WORKER_LEASE_SECONDS,
  VIDEO_THUMBNAIL_MAX_SIDE,
  buildVideoFrameCaptureTimes,
  buildVideoNormalizationStoragePath,
  fitVideoWithinMaxSide,
  getOrientedVideoDimensions,
  getVideoNormalizationRetryDelaySeconds,
  getVideoNormalizationSignature,
  getVideoTargetBitrateKbps,
} from "../../lib/mediaVideoNormalizationPolicy.ts";

test("le worker accepte une source vidéo jusqu'à 75 Mo exactement", () => {
  assert.equal(VIDEO_NORMALIZATION_MAX_SOURCE_BYTES, 75_000_000);
  assert.equal(VIDEO_NORMALIZATION_MAX_SOURCE_MB_LABEL, "75 Mo");
  assert.equal(VIDEO_NORMALIZATION_WORKER_LEASE_SECONDS, 1_860);
});

test("les captures et miniatures ne sont jamais agrandies", () => {
  assert.equal(VIDEO_FRAME_MAX_SIDE, 1280);
  assert.equal(VIDEO_THUMBNAIL_MAX_SIDE, 720);
  assert.deepEqual(
    fitVideoWithinMaxSide({ width: 640, height: 360, maxSide: 1280 }),
    { width: 640, height: 360 },
  );
  assert.deepEqual(
    fitVideoWithinMaxSide({ width: 3840, height: 2160, maxSide: 1280 }),
    { width: 1280, height: 720 },
  );
});

test("les rotations 90 et 270 degrés inversent les dimensions", () => {
  assert.deepEqual(
    getOrientedVideoDimensions({
      width: 1920,
      height: 1080,
      rotationDegrees: 90,
    }),
    { width: 1080, height: 1920 },
  );
  assert.deepEqual(
    getOrientedVideoDimensions({
      width: 1920,
      height: 1080,
      rotationDegrees: 180,
    }),
    { width: 1920, height: 1080 },
  );
});

test("les anciennes signatures restent lisibles sans être produites", () => {
  assert.equal(
    getVideoNormalizationSignature("canonical"),
    "inrcy:video:canonical:v2",
  );
  assert.equal(
    getVideoNormalizationSignature("frame_02"),
    "inrcy:video:frame:02:v2",
  );
  assert.equal(
    buildVideoNormalizationStoragePath({
      accountId: "account-123",
      mediaId: "media-456",
      key: "audio_track",
    }),
    "users/account-123/normalized/video/v2/media-456/audio-track.mp3",
  );
});

test("les captures couvrent début, milieu et fin sans dépasser la durée", () => {
  assert.deepEqual(buildVideoFrameCaptureTimes(100), [3, 50, 90]);
  assert.deepEqual(buildVideoFrameCaptureTimes(2), [0.2, 1, 1.8]);
});

test("le débit n'est calculé que pour une adaptation explicitement demandée", () => {
  const short = getVideoTargetBitrateKbps({
    durationSeconds: 20,
    maxBytes: 75_000_000,
    audioBitrateKbps: 128,
    minVideoKbps: 250,
    maxVideoKbps: 5000,
  });
  const long = getVideoTargetBitrateKbps({
    durationSeconds: 300,
    maxBytes: 75_000_000,
    audioBitrateKbps: 128,
    minVideoKbps: 250,
    maxVideoKbps: 5000,
  });
  assert.equal(short, 5000);
  assert.ok(long < short);
  assert.ok(long >= 250);
});

test("le backoff vidéo augmente puis reste plafonné", () => {
  assert.equal(getVideoNormalizationRetryDelaySeconds(1), 30);
  assert.equal(getVideoNormalizationRetryDelaySeconds(2), 60);
  assert.equal(getVideoNormalizationRetryDelaySeconds(8), 900);
});
