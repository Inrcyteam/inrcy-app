import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("Step 6 rejects any ratio drift inside the final geometry lock", async () => {
  const optimizer = await read("lib/imageOptimizer.ts");
  const start = optimizer.indexOf("export async function optimizeFinalImageGeometry");
  const end = optimizer.indexOf("async function createSmartJpeg", start);
  const block = optimizer.slice(start, end);

  assert.ok(start >= 0);
  assert.match(optimizer, /FINAL_GEOMETRY_RATIO_EPSILON\s*=\s*0\.005/);
  assert.match(block, /getVisualSourceRatio/);
  assert.match(block, /relativeDrift/);
  assert.match(block, /final_geometry_ratio_drift/);
  assert.doesNotMatch(block, /fit:\s*"cover"/);
  assert.doesNotMatch(block, /fit:\s*"contain"/);
});

test("Step 6 uses a signed TikTok photo_locked variant for the new Booster pipeline", async () => {
  const signer = await read("lib/tiktokMediaUrl.ts");
  const publishRoute = await read("app/api/booster/publish-now/route.ts");

  assert.match(signer, /"photo_locked"/);
  assert.match(signer, /signaturePayload\(path, exp, variant\)/);
  assert.match(publishRoute, /tiktokGeometryLocked/);
  assert.match(
    publishRoute,
    /variant:\s*tiktokGeometryLocked\s*\?\s*"photo_locked"\s*:\s*"photo"/,
  );
});

test("Step 6 never applies the legacy 9:16 safety canvas to geometry-locked TikTok photos", async () => {
  const route = await read("app/api/media/tiktok/route.ts");
  const lockedStart = route.indexOf("if (geometryLocked)");
  const legacyStart = route.indexOf("// Legacy safety curtain", lockedStart);
  const lockedBlock = route.slice(lockedStart, legacyStart);

  assert.ok(lockedStart >= 0);
  assert.match(lockedBlock, /sourceIsDirectlyPublishable/);
  assert.match(route, /isDirectTikTokPhotoPublishable/);
  assert.match(lockedBlock, /locked_geometry_photo_prepare_failed/);
  assert.doesNotMatch(lockedBlock, /renderTikTokSafetyFrame/);

  // The old curtain remains available for legacy payloads only.
  assert.match(route, /renderTikTokSafetyFrame/);
  assert.match(route, /variant === "photo" \|\| variant === "photo_locked"/);
});

test("Step 6 makes TikTok orientation checks EXIF-aware before proportional resize", async () => {
  const route = await read("app/api/media/tiktok/route.ts");
  assert.match(route, /orientation >= 5 && orientation <= 8/);
  assert.match(route, /const width = swapsAxes \? rawHeight : rawWidth/);
  assert.match(route, /fit: "inside"/);
  assert.match(route, /withoutEnlargement: true/);
});
