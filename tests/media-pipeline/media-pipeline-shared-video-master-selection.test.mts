import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../lib/mediaWorkspaceConsumption.ts", import.meta.url),
  "utf8",
);

test("every accepted video uses the verified original as publication master", () => {
  assert.match(source, /allowUploadedVideoSource:\s*true/);
  assert.match(source, /const publicationVariant = directSourceReady \? null : canonical/);
  assert.match(source, /compatibilityProof:\s*publicationVariant[\s\S]{0,120}: "server_ffmpeg"/);
  assert.match(source, /storagePath:\s*publicationVariant\?\.storagePath \|\| item\.sourceStoragePath/);
});

test("the original keeps the durable thumbnail contract", () => {
  assert.match(
    source,
    /pickReadyVideoNormalizationVariant\(\s*variants,\s*item\.mediaId,\s*"thumbnail"/,
  );
  assert.match(source, /thumbnailStoragePath:\s*thumbnail\?\.storagePath/);
});
