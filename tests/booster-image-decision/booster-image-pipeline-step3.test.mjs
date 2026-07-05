import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("Step 3 publishes Originale from the source payload and Adaptée from the matrix plan", async () => {
  const source = await read("app/dashboard/booster/publier/usePublishImageController.ts");
  assert.match(source, /displayPlan\.decision\.mode === "original"[\s\S]*fileToImagePayload\(file\)/);
  assert.match(source, /displayPlan\.decision\.mode === "adapted"[\s\S]*buildAutomaticRenderPreset/);
  assert.match(source, /requiredTargetRatio: sequenceTargetRatio/);
});

test("Facebook, LinkedIn, TikTok and Pinterest use native-first derivatives", async () => {
  const source = await read("app/api/booster/publish-now/route.ts");
  for (const channel of ["facebook", "linkedin", "tiktok", "pinterest"]) {
    assert.match(source, new RegExp(`channel === "${channel}"`));
  }
  assert.match(source, /socialFeed: true, socialFeedNativeFirst: true/);
});

test("TikTok normal path preserves ratio and keeps the old 9:16 frame only as fallback", async () => {
  const source = await read("app/api/media/tiktok/route.ts");
  assert.match(source, /renderTikTokRatioPreservingJpeg/);
  assert.match(source, /fit: "inside"/);
  assert.match(source, /withoutEnlargement: true/);
  assert.match(source, /renderTikTokSafetyFrame/);
  assert.match(source, /fit: "contain"/);
});

test("Social native-first optimization no longer rejects extreme source ratios", async () => {
  const source = await read("lib/imageOptimizer.ts");
  const nativeFirstBlock = source.slice(
    source.indexOf("export async function optimizeForSocialFeed"),
    source.indexOf("export async function optimizeForSiteCard"),
  );
  assert.doesNotMatch(nativeFirstBlock, /ratioMin/);
  assert.doesNotMatch(nativeFirstBlock, /ratioMax/);
});
