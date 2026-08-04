import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("TikTok photos prefer the prepared storage derivative before the original", async () => {
  const route = await read("app/api/booster/publish-now/route.ts");
  assert.match(route, /const preferredTiktokStoragePaths = socialStoragePaths/);
  assert.match(route, /const fallbackTiktokStoragePaths = sourceStoragePaths/);
  assert.doesNotMatch(
    route,
    /const preferredTiktokStoragePaths = tiktokGeometryLocked[\s\S]{0,100}sourceStoragePaths/,
  );
});

test("TikTok video retries a valid stored source when the selected variant disappeared", async () => {
  const route = await read("app/api/booster/publish-now/route.ts");
  assert.match(route, /async function loadFirstAvailableTikTokVideo/);
  assert.match(route, /kind: "channel_variant"/);
  assert.match(route, /kind: "source_video"/);
  assert.match(route, /kind: "publication_source"/);
  assert.match(route, /validateVideoPublicationForChannel/);
  assert.match(route, /attempted_storage_paths/);
});

test("TikTok publication does not reuse a generation-time video promise", async () => {
  const modal = await read("app/dashboard/booster/publier/PublishModal.tsx");
  assert.doesNotMatch(modal, /videoPrewarmTaskRef/);
  assert.doesNotMatch(modal, /startBackgroundVideoPrewarm/);
  assert.match(
    modal,
    /let result = await prewarmPersistentMediaWorkspace\([\s\S]{0,300}options\?\.generateMissingVideoVariants !== false/,
  );
});
