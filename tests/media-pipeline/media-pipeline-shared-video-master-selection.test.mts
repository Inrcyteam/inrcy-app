import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../lib/mediaWorkspaceConsumption.ts", import.meta.url),
  "utf8",
);

test("heavy and light videos always use the canonical shared master", () => {
  assert.match(source, /allowUploadedVideoSource:\s*false/);
  assert.match(source, /const publicationVariant = canonical/);
  assert.doesNotMatch(source, /directSourceReady && !preferSharedCanonical/);
});

test("the managed master carries the durable thumbnail contract", () => {
  assert.match(
    source,
    /pickReadyVideoNormalizationVariant\(\s*variants,\s*item\.mediaId,\s*"thumbnail"/,
  );
  assert.match(source, /thumbnailStoragePath:\s*thumbnail\?\.storagePath/);
});
