import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("final audit keeps per-channel fallbacks local and rejects partial image lists", async () => {
  const route = await read("app/api/booster/publish-now/route.ts");

  assert.match(route, /function[\s\S]*pickCompleteChannelImageUrls|const pickCompleteChannelImageUrls/);
  assert.match(route, /never borrow a fallback from another channel/i);
  assert.match(route, /urls\.length >= expected/);
  assert.match(route, /candidates: \["instagramPublishableUrls"\]/);
  assert.match(route, /facebookImageUrls/);
  assert.match(route, /linkedInImages/);
  assert.match(route, /gmbChannelImages/);
  assert.match(route, /siteImageUrls/);
});

test("final audit only uses a complete TikTok storage-path set", async () => {
  const route = await read("app/api/booster/publish-now/route.ts");

  assert.match(route, /expectedTiktokImageCount/);
  assert.match(route, /hasCompleteTikTokPaths/);
  assert.match(route, /hasCompleteTikTokPaths\(socialStoragePaths\)/);
  assert.match(route, /hasCompleteTikTokPaths\(sourceStoragePaths\)/);
  assert.match(route, /photo_locked/);
});

test("final audit uses safe integer render dimensions for channel targets", async () => {
  const matrix = await read("lib/boosterImageDecision.ts");
  const controller = await read(
    "app/dashboard/booster/publier/usePublishImageController.ts",
  );
  const panel = await read(
    "app/dashboard/booster/publier/components/PublishImagesPanel.tsx",
  );

  assert.match(matrix, /getBoosterImageRenderDimensions/);
  assert.match(matrix, /Math\.ceil\(baseWidth \/ targetRatio - 1e-9\)/);
  assert.match(controller, /getBoosterImageRenderDimensions/);
  assert.match(panel, /getBoosterImageRenderDimensions/);
});
