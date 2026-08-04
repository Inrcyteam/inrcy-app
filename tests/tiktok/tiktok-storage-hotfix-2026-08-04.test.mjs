import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("TikTok photos use the exact original storage object without a visual derivative", async () => {
  const route = await read("app/api/booster/publish-now/route.ts");
  assert.match(route, /rawOriginalStoragePaths/);
  assert.match(route, /image\.originalStoragePath/);
  assert.match(route, /variant: "raw"/);
  assert.match(route, /original_exact_bytes/);
  assert.doesNotMatch(route, /preferredTiktokStoragePaths = socialStoragePaths/);
});

test("TikTok media pull bypasses authenticated middleware and rate limiting", async () => {
  const proxy = await read("proxy.ts");
  assert.match(proxy, /pathname === "\/api\/media\/tiktok"/);
  assert.match(proxy, /return response;/);
});

test("TikTok photo retry rebuilds fresh raw URLs from stored original paths", async () => {
  const retry = await read(
    "app/api/inrsend/publications/[publicationId]/tiktok/retry/route.ts",
  );
  assert.match(retry, /mediaStoragePaths/);
  assert.match(retry, /rebuiltOriginalUrls/);
  assert.match(retry, /variant: "raw"/);
  assert.match(retry, /original_exact_bytes/);
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
