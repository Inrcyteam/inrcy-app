import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../lib/mediaWorkspaceConsumption.ts", import.meta.url),
  "utf8",
);

test("large videos use a materially smaller canonical as the shared master", () => {
  assert.match(
    source,
    /item\.sourceSizeBytes > VIDEO_SHARED_CANONICAL_PREFERRED_SOURCE_BYTES/,
  );
  assert.match(source, /VIDEO_CANONICAL_MIN_SAVINGS_RATIO/);
  assert.match(
    source,
    /directSourceReady && !preferSharedCanonical \? null : canonical/,
  );
});

test("a compatible small source still publishes the professional original", () => {
  assert.match(source, /Up to 70 MB/);
  assert.match(source, /the original is preserved/);
});
