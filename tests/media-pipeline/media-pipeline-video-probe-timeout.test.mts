import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("un timeout de probe vidéo retourne une valeur vide sans récursion", () => {
  const source = readFileSync(
    new URL("../../lib/boosterVideoVariantServer.ts", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("function emptyProbedVideoMetadata");
  const end = source.indexOf("type BoosterVideoProbeRegistryRow", start);
  const helper = source.slice(start, end);

  assert.match(helper, /duration:\s*null/);
  assert.match(helper, /containerFormats:\s*\[\]/);
  assert.doesNotMatch(
    helper,
    /return\s+emptyProbedVideoMetadata\(\)/,
    "the empty probe helper must never call itself",
  );
});
