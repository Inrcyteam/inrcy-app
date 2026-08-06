import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

const modal = read("app/dashboard/booster/publier/PublishModal.tsx");
const route = read("app/api/booster/publish-now/route.ts");
const prewarm = read("app/api/media-pipeline/workspace/prewarm/route.ts");

test("mixed publications keep workspace media and build a fallback only for the missing type", () => {
  assert.match(modal, /workspaceCarriesImagesForPublish/);
  assert.match(modal, /workspaceCarriesVideoForPublish/);
  assert.match(
    modal,
    /shouldBuildImageFallbackPayload\s*=\s*hasAnyImagePublish\s*&&\s*!workspaceCarriesImagesForPublish/,
  );
  assert.match(
    modal,
    /shouldBuildVideoFallbackPayload\s*=\s*hasAnyVideoPublish\s*&&\s*!workspaceCarriesVideoForPublish/,
  );
  assert.match(modal, /if \(shouldBuildImageFallbackPayload\)/);
  assert.match(modal, /if \(shouldBuildVideoFallbackPayload\)/);
  assert.match(modal, /workspaceCarriesImagesForSchedule/);
  assert.match(modal, /workspaceCarriesVideoForSchedule/);
});

test("strict publish accepts an explicit stored fallback when the workspace carries the other media type", () => {
  assert.match(route, /hasImageFallbackForChannel/);
  assert.match(route, /hasVideoFallbackPayload/);
  assert.match(
    route,
    /expectedMode === "images" && hasImageFallbackForChannel\(channel\)/,
  );
  assert.match(
    route,
    /expectedMode === "video" && hasVideoFallbackPayload/,
  );
  assert.match(
    route,
    /const legacyVideoResult = hasAnyVideoChannel\s*\? await normalizeVideoPayload\(body\.video\)/,
  );
});

test("compatible original video is a real fast path and does not require variant generation", () => {
  assert.match(
    prewarm,
    /allowOriginalVideoFallback\s*&&[\s\S]{0,100}allowsOriginalVideoFallback\(request\.channel\)\s*&&[\s\S]{0,80}sourceValidation\.ok/,
  );
  assert.doesNotMatch(
    prewarm,
    /allowOriginalVideoFallback\s*&&\s*generateMissingVideoVariants\s*&&\s*allowsOriginalVideoFallback/,
  );
  assert.match(
    modal,
    /directOriginalAvailable[\s\S]*canPublishVideoSourceDirectly/,
  );
});
