import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  isBoosterImageExplicitlyCustomized,
  normalizeBoosterImageCustomizationScope,
} from "../../lib/boosterImageCustomization.ts";
import { getBoosterImageDecision } from "../../lib/boosterImageDecision.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("a partial channel selection stays partial and keeps its exact order", () => {
  const scope = normalizeBoosterImageCustomizationScope({
    availableImageKeys: ["image-1", "image-2", "image-3", "image-4"],
    requestedImageKeys: ["image-3", "image-1"],
    transforms: {
      "image-1": { zoom: 1 },
      "image-2": { zoom: 2 },
      "image-3": { zoom: 1.3 },
    },
    customizedImageKeys: ["image-3", "image-2"],
  });

  assert.deepEqual(scope.imageKeys, ["image-3", "image-1"]);
  assert.deepEqual(scope.customizedImageKeys, ["image-3"]);
  assert.deepEqual(Object.keys(scope.transforms), ["image-3", "image-1"]);
  assert.equal(scope.usedSelectionFallback, false);
});

test("Adapter provenance remains exact per channel for the same media", () => {
  const availableImageKeys = ["hero", "team", "shop"];
  const instagram = normalizeBoosterImageCustomizationScope({
    availableImageKeys,
    requestedImageKeys: availableImageKeys,
    customizedImageKeys: ["hero"],
  });
  const facebook = normalizeBoosterImageCustomizationScope({
    availableImageKeys,
    requestedImageKeys: availableImageKeys,
    customizedImageKeys: ["team"],
  });

  assert.equal(
    isBoosterImageExplicitlyCustomized(instagram.customizedImageKeys, "hero"),
    true,
  );
  assert.equal(
    isBoosterImageExplicitlyCustomized(instagram.customizedImageKeys, "team"),
    false,
  );
  assert.equal(
    isBoosterImageExplicitlyCustomized(facebook.customizedImageKeys, "hero"),
    false,
  );
  assert.equal(
    isBoosterImageExplicitlyCustomized(facebook.customizedImageKeys, "team"),
    true,
  );
});

test("untouched media stay original while only the adapted media is customized", () => {
  const customizedKeys = ["image-2"];
  const decisions = ["image-1", "image-2", "image-3"].map((imageKey) =>
    getBoosterImageDecision({
      channel: "facebook",
      meta: { width: 1600, height: 900 },
      customized: isBoosterImageExplicitlyCustomized(customizedKeys, imageKey),
    }),
  );

  assert.deepEqual(
    decisions.map((decision) => decision.mode),
    ["original", "customized", "original"],
  );
});

test("apply-to-all provenance marks every selected media and nothing else", () => {
  const scope = normalizeBoosterImageCustomizationScope({
    availableImageKeys: ["a", "b", "c", "d"],
    requestedImageKeys: ["a", "b", "c"],
    customizedImageKeys: ["a", "b", "c", "d"],
  });

  assert.deepEqual(scope.customizedImageKeys, ["a", "b", "c"]);
});

test("mixed stale keys are ignored without restoring unrelated images", () => {
  const scope = normalizeBoosterImageCustomizationScope({
    availableImageKeys: ["a", "b", "c"],
    requestedImageKeys: ["stale", "b"],
    customizedImageKeys: ["stale", "b"],
  });

  assert.deepEqual(scope.imageKeys, ["b"]);
  assert.deepEqual(scope.customizedImageKeys, ["b"]);
  assert.equal(scope.usedSelectionFallback, false);
});

test("a fully stale legacy selection recovers safely without fake customization", () => {
  const scope = normalizeBoosterImageCustomizationScope({
    availableImageKeys: ["a", "b"],
    requestedImageKeys: ["old-a", "old-b"],
    customizedImageKeys: ["old-a"],
  });

  assert.deepEqual(scope.imageKeys, ["a", "b"]);
  assert.deepEqual(scope.customizedImageKeys, []);
  assert.equal(scope.usedSelectionFallback, true);
});

test("the current client can explicitly keep an empty channel selection", () => {
  const scope = normalizeBoosterImageCustomizationScope({
    availableImageKeys: ["a", "b"],
    requestedImageKeys: [],
    customizedImageKeys: ["a"],
    fallbackToAvailableWhenSelectionEmpty: false,
  });

  assert.deepEqual(scope.imageKeys, []);
  assert.deepEqual(scope.customizedImageKeys, []);
});

test("client, server and publication route preserve the exact per-channel scope", () => {
  const controller = read(
    "app/dashboard/booster/publier/usePublishImageController.ts",
  );
  const server = read("lib/boosterImageServerPreparation.ts");
  const route = read("app/api/booster/publish-now/route.ts");

  assert.match(controller, /normalizeBoosterImageCustomizationScope<ImageTransform>/);
  assert.match(controller, /fallbackToAvailableWhenSelectionEmpty: false/);
  assert.match(server, /const exactChannelSources = requestedSettings\.imageKeys/);
  assert.match(server, /const hasExplicitImageSelection = Object\.prototype\.hasOwnProperty\.call/);
  assert.match(server, /fallbackToAvailableWhenSelectionEmpty: !hasExplicitImageSelection/);
  assert.doesNotMatch(
    server,
    /ordered\.length === valid\.length \? ordered : valid/,
  );
  assert.match(server, /imageKey: entry\.imageKey,[\s\S]{0,120}channel,[\s\S]{0,80}mode,/);
  assert.match(route, /const rawChannelImages = Array\.isArray\(imagesByChannel\[channel\]\)/);
});
