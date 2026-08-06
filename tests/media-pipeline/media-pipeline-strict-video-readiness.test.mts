import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

function sliceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `missing start marker: ${start}`);
  assert.ok(endIndex > startIndex, `missing end marker after ${start}: ${end}`);
  return source.slice(startIndex, endIndex);
}

const route = read("app/api/booster/publish-now/route.ts");
const preparation = read("lib/mediaWorkspacePublicationPreparation.ts");

test("strict workspace publication never falls back to body.video or a legacy cover", () => {
  const strictFamilyGuard = sliceBetween(
    route,
    "const hasImageFallbackForChannel",
    "let images = hasAnyImageChannel",
  );
  assert.match(strictFamilyGuard, /expectedMode === "video" && workspaceHasVideo/);
  assert.doesNotMatch(strictFamilyGuard, /hasVideoFallbackPayload|body\.video/);
  assert.match(
    strictFamilyGuard,
    /expectedMode === "images" && hasImageFallbackForChannel\(channel\)/,
  );

  assert.match(
    route,
    /const legacyVideoResult = hasAnyVideoChannel && !strictMediaCutover\s*\? await normalizeVideoPayload\(body\.video\)/,
  );
  assert.match(
    route,
    /thumbnailStoragePath:\s*workspaceVideoResult\.video\.thumbnailStoragePath \|\|\s*\(!strictMediaCutover[\s\S]{0,120}legacyVideoResult\.video\?\.thumbnailStoragePath/,
  );
  assert.match(
    route,
    /!strictMediaCutover &&\s*internalAsyncPreparationDispatch[\s\S]{0,320}probeStoredBoosterVideoForPublication/,
  );
});

test("TikTok video readiness requires canonical v2 but not the Pinterest cover", () => {
  const readiness = sliceBetween(
    preparation,
    "function hasReadyPublicationVariants",
    "async function markCanonicalMediaReadyForPublication",
  );
  assert.match(
    readiness,
    /if \(!params\.canonicalMediaIds\.has\(params\.media\.mediaId\)\) return false/,
  );
  assert.match(
    readiness,
    /params\.media\.mediaType !== "video" \|\|\s*!params\.requiresVideoThumbnail \|\|\s*params\.videoThumbnailMediaIds\.has/,
  );
  assert.match(
    preparation,
    /getVideoNormalizationSignature\("canonical"\)/,
  );
  assert.doesNotMatch(preparation, /videoChannels\?\.includes\("tiktok"\)/);
});

test("Pinterest video waits for the ready v2 thumbnail while other video channels can leave", () => {
  assert.match(
    preparation,
    /params\.videoChannels\?\.includes\("pinterest"\)/,
  );
  assert.match(
    preparation,
    /\.eq\("purpose", "thumbnail"\)[\s\S]{0,120}\.eq\("signature", getVideoNormalizationSignature\("thumbnail"\)\)[\s\S]{0,80}\.eq\("status", "ready"\)/,
  );
  assert.match(
    preparation,
    /pendingVideoThumbnailMediaIds:[\s\S]{0,180}terminalVideoThumbnailMediaIds:/,
  );
  assert.match(
    route,
    /videoChannels: activeRequestedMediaChannels\.filter\([\s\S]{0,180}=== "video"/,
  );
  assert.match(
    route,
    /terminalVideoThumbnailMediaIds\.length > 0[\s\S]{0,100}terminalWorkspaceMediaChannels\.add\("pinterest"\)/,
  );
  assert.match(
    route,
    /pendingVideoThumbnailMediaIds\.length > 0[\s\S]{0,100}deferredPreparationChannels\.add\("pinterest"\)/,
  );
});
