import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../lib/mediaWorkspaceConsumption.ts", import.meta.url),
  "utf8",
);

test("videos at or above 70 MB always use the canonical shared master", () => {
  assert.match(
    source,
    /item\.sourceSizeBytes >= VIDEO_SHARED_CANONICAL_PREFERRED_SOURCE_BYTES/,
  );
  assert.match(
    source,
    /directSourceReady && !preferSharedCanonical \? null : canonical/,
  );
});

test("a compatible small source still publishes the professional original", () => {
  assert.match(source, /Below 70 MB/);
  assert.match(source, /The original is retained/);
});
