import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("Step 5 locks final Booster geometry before channel optimization", async () => {
  const route = await read("app/api/booster/publish-now/route.ts");

  assert.match(route, /function hasFinalImageGeometryDecision/);
  assert.match(route, /const finalGeometryLocked = hasFinalImageGeometryDecision\(img\)/);
  assert.match(
    route,
    /finalGeometryLocked[\s\S]*optimizeFinalImageGeometry\(parsed\.buffer, "instagram"\)/,
  );
  assert.match(
    route,
    /finalGeometryLocked[\s\S]*optimizeFinalImageGeometry\(parsed\.buffer, "social-feed"\)/,
  );
  assert.match(
    route,
    /finalGeometryLocked[\s\S]*optimizeFinalImageGeometry\(parsed\.buffer, "gmb"\)/,
  );
});

test("Final geometry optimizer only uses proportional native resizing", async () => {
  const source = await read("lib/imageOptimizer.ts");
  const start = source.indexOf("export async function optimizeFinalImageGeometry");
  const end = source.indexOf("async function createSmartJpeg", start);
  const block = source.slice(start, end);

  assert.ok(start >= 0);
  assert.match(block, /createNativeJpeg/);
  assert.doesNotMatch(block, /createSmartJpeg/);
  assert.doesNotMatch(block, /fit:\s*"cover"/);
  assert.doesNotMatch(block, /fit:\s*"contain"/);
  assert.match(block, /strategy: "geometry-locked"/);
});

test("Step 5 preserves prepared source instead of recropping when locked optimization fails", async () => {
  const route = await read("app/api/booster/publish-now/route.ts");

  assert.match(route, /instagramGeometryPreserveFallback/);
  assert.match(route, /socialFeedGeometryPreserveFallback/);
  assert.match(route, /gmbGeometryPreserveFallback/);
  assert.match(route, /socialFeedStoragePaths\.push\(sourceStoragePath\)/);
  assert.match(route, /without fallback recrop/);
});

test("Legacy safety curtain remains available for payloads without a final decision", async () => {
  const route = await read("app/api/booster/publish-now/route.ts");
  const optimizer = await read("lib/imageOptimizer.ts");

  assert.match(route, /: await optimizeForInstagram\(parsed\.buffer\)/);
  assert.match(route, /: await optimizeForSocialFeed\(parsed\.buffer/);
  assert.match(route, /: await optimizeForGoogleBusiness\(parsed\.buffer\)/);
  assert.match(optimizer, /optimizeForInstagramSafeFrame/);
  assert.match(optimizer, /optimizeForSocialFeedSafeFrame/);
  assert.match(optimizer, /optimizeForGoogleBusinessSafeFrame/);
});
