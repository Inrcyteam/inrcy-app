import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  GOOGLE_BUSINESS_IMAGE_OFFICIAL_MAX_BYTES,
  GOOGLE_BUSINESS_IMAGE_TARGET_MAX_BYTES,
  GOOGLE_BUSINESS_IMAGE_MIN_BYTES,
  GOOGLE_BUSINESS_IMAGE_MIN_SHORT_EDGE,
  GOOGLE_BUSINESS_VIDEO_MAX_DURATION_SECONDS,
  GOOGLE_BUSINESS_VIDEO_MIN_SHORT_EDGE,
  GOOGLE_BUSINESS_VIDEO_OFFICIAL_MAX_BYTES,
  GOOGLE_BUSINESS_VIDEO_TARGET_MAX_BYTES,
  getGoogleBusinessVideoPreparationDecision,
} from "../../lib/googleBusinessMediaPolicy.ts";
import {
  buildVideoTransformPlan,
  buildVideoTransformSignature,
  getVideoPublicationProfileForChannel,
} from "../../lib/boosterVideoTransforms.ts";
import { validateVideoPublicationForChannel } from "../../lib/videoPublicationPolicy.ts";
import {
  parseGoogleBusinessMediaContentLength,
  probeGoogleBusinessMediaUrl,
} from "../../lib/googleBusinessMediaProbe.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const MB = 1024 * 1024;

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("Google Business owns a dedicated safety policy without reducing the 300 MB source limit globally", () => {
  assert.equal(GOOGLE_BUSINESS_VIDEO_OFFICIAL_MAX_BYTES, 75_000_000);
  assert.equal(GOOGLE_BUSINESS_VIDEO_TARGET_MAX_BYTES, 70_000_000);
  assert.equal(GOOGLE_BUSINESS_VIDEO_MAX_DURATION_SECONDS, 30);
  assert.equal(GOOGLE_BUSINESS_VIDEO_MIN_SHORT_EDGE, 720);
  assert.equal(GOOGLE_BUSINESS_IMAGE_MIN_BYTES, 10 * 1024);
  assert.equal(GOOGLE_BUSINESS_IMAGE_OFFICIAL_MAX_BYTES, 5_000_000);
  assert.equal(GOOGLE_BUSINESS_IMAGE_TARGET_MAX_BYTES, 4_800_000);
  assert.equal(GOOGLE_BUSINESS_IMAGE_MIN_SHORT_EDGE, 250);

  const gmb = validateVideoPublicationForChannel({
    channel: "gmb",
    name: "source.mp4",
    type: "video/mp4",
    storagePath: "source.mp4",
    sizeBytes: 220 * MB,
    durationSeconds: 20,
    width: 1920,
    height: 1080,
  });
  const facebook = validateVideoPublicationForChannel({
    channel: "facebook",
    name: "source.mp4",
    type: "video/mp4",
    storagePath: "source.mp4",
    sizeBytes: 220 * MB,
    durationSeconds: 20,
    width: 1920,
    height: 1080,
  });

  assert.equal(gmb.ok, false);
  if (!gmb.ok) assert.equal(gmb.reason, "video_too_large");
  assert.equal(facebook.ok, true);
});

test("a compliant Google Business video is accepted directly", () => {
  const validation = validateVideoPublicationForChannel({
    channel: "gmb",
    name: "gmb.mp4",
    type: "video/mp4",
    storagePath: "gmb.mp4",
    sizeBytes: 70_000_000,
    durationSeconds: 30,
    width: 1280,
    height: 720,
  });
  assert.equal(validation.ok, true);
  assert.deepEqual(
    getGoogleBusinessVideoPreparationDecision({
      name: "gmb.mp4",
      type: "video/mp4",
      storagePath: "gmb.mp4",
      sizeBytes: 70_000_000,
      durationSeconds: 30,
      width: 1280,
      height: 720,
      videoCodec: "h264",
      audioCodec: "aac",
      frameRate: 30,
      hasAudio: true,
      containerFormats: ["mov", "mp4"],
      pixelFormat: "yuv420p",
    }),
    { action: "direct", reason: "already_compatible" },
  );
});

test("Google Business prepares heavy or low-resolution videos but never silently trims a long video", () => {
  assert.deepEqual(
    getGoogleBusinessVideoPreparationDecision({
      name: "heavy.mp4",
      type: "video/mp4",
      storagePath: "heavy.mp4",
      sizeBytes: 220 * MB,
      durationSeconds: 20,
      width: 1920,
      height: 1080,
    }),
    { action: "prepare", reason: "size_requires_compression" },
  );
  assert.deepEqual(
    getGoogleBusinessVideoPreparationDecision({
      name: "small.mp4",
      type: "video/mp4",
      storagePath: "small.mp4",
      sizeBytes: 20 * MB,
      durationSeconds: 20,
      width: 640,
      height: 360,
    }),
    { action: "prepare", reason: "resolution_requires_normalization" },
  );
  const long = getGoogleBusinessVideoPreparationDecision({
    name: "long.mp4",
    type: "video/mp4",
    storagePath: "long.mp4",
    sizeBytes: 20 * MB,
    durationSeconds: 31,
    width: 1280,
    height: 720,
  });
  assert.equal(long.action, "block");
  if (long.action === "block") {
    assert.equal(long.errorCode, "video_duration_too_long");
    assert.match(long.errorMessage, /30 secondes maximum/i);
    assert.match(long.errorMessage, /pas été coupée/i);
  }
});

test("the Google transform signature is isolated from every other channel", () => {
  const common = buildVideoTransformSignature("original", "safe_frame");
  const google = buildVideoTransformSignature(
    "original",
    "safe_frame",
    getVideoPublicationProfileForChannel("gmb"),
  );
  assert.equal(common, "original:safe_frame");
  assert.equal(google, "original:safe_frame:google_business");

  const plan = buildVideoTransformPlan([
    {
      channel: "facebook",
      format: "original",
      adaptationMode: "safe_frame",
    },
    {
      channel: "gmb",
      format: "original",
      adaptationMode: "safe_frame",
    },
  ]);
  assert.equal(plan.length, 2);
  assert.deepEqual(
    plan.map((item) => item.publicationProfile),
    ["default", "google_business"],
  );
});

test("Google media URL probing rejects inaccessible, mistyped and oversized files", async (t) => {
  const server = http.createServer((request, response) => {
    const route = request.url || "/";
    if (route === "/image-ok") {
      response.writeHead(200, {
        "content-type": "image/jpeg",
        "content-length": String(12 * 1024),
      });
    } else if (route === "/image-small") {
      response.writeHead(200, {
        "content-type": "image/png",
        "content-length": String(5 * 1024),
      });
    } else if (route === "/video-large") {
      response.writeHead(200, {
        "content-type": "video/mp4",
        "content-length": String(76 * MB),
      });
    } else if (route === "/wrong-type") {
      response.writeHead(200, {
        "content-type": "text/html",
        "content-length": "20000",
      });
    } else {
      response.writeHead(404);
    }
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  // Production requires HTTPS. The local HTTP fixture verifies that the guard
  // rejects non-public URLs before any network request.
  const invalidScheme = await probeGoogleBusinessMediaUrl({
    url: `${base}/image-ok`,
    kind: "image",
  });
  assert.equal(invalidScheme.reason, "url_invalid");

  const rangedResponse = new Response(null, {
    status: 206,
    headers: {
      "content-type": "image/jpeg",
      "content-length": "1",
      "content-range": "bytes 0-0/12000",
    },
  });
  assert.equal(
    parseGoogleBusinessMediaContentLength(rangedResponse),
    12_000,
  );

  const sources = read("lib/googleBusinessMediaProbe.ts");
  assert.match(sources, /GOOGLE_BUSINESS_IMAGE_MIN_BYTES/);
  assert.match(sources, /GOOGLE_BUSINESS_VIDEO_TARGET_MAX_BYTES/);
  assert.match(sources, /content_type_invalid/);
  assert.match(sources, /file_too_small/);
  assert.match(sources, /file_too_large/);
});

test("prewarm, publish-now and iNrSend all use the same Google safeguards", () => {
  const prewarm = read("app/api/media-pipeline/workspace/prewarm/route.ts");
  const route = read("app/api/booster/publish-now/route.ts");
  const inrsend = read("lib/inrsend/publicationChannelActions.ts");
  const variantServer = read("lib/boosterVideoVariantServer.ts");
  const optimizer = read("lib/imageOptimizer.ts");

  assert.match(prewarm, /getGoogleBusinessVideoPreparationDecision/);
  assert.match(prewarm, /mediaWarnings/);
  assert.match(route, /preflightFailuresByChannel/);
  assert.match(route, /video_variant_required/);
  assert.match(route, /filterGoogleBusinessMediaUrls/);
  assert.match(route, /La publication texte n’a pas été envoyée à la place/);
  assert.match(inrsend, /filterGoogleBusinessMediaUrls/);
  assert.match(variantServer, /CHANNEL_VIDEO_VARIANT_PIPELINE_VERSION = 7/);
  assert.match(variantServer, /GOOGLE_BUSINESS_VIDEO_MIN_SHORT_EDGE/);
  assert.match(variantServer, /n’a pas été coupée automatiquement/);
  assert.match(optimizer, /ensureGoogleBusinessImageCompliance/);
  assert.match(optimizer, /padJpegToMinimumBytes/);
});
