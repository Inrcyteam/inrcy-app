import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import bmp from "bmp-js";

import { normalizeImageSource } from "../../lib/mediaImageNormalizer.ts";

test("un BMP réellement accepté est converti puis normalisé", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "inrcy-bmp-test-"));
  const inputPath = path.join(directory, "source.bmp");
  try {
    const encoded = bmp.encode({
      width: 2,
      height: 2,
      data: Buffer.from([
        255, 0, 0, 255,
        255, 0, 255, 0,
        255, 255, 0, 0,
        255, 255, 255, 255,
      ]),
    });
    await writeFile(inputPath, encoded.data);

    const normalized = await normalizeImageSource({
      inputPath,
      mimeType: "image/bmp",
      originalFileName: "source.bmp",
    });

    assert.equal(normalized.source.decoder, "bmp-js");
    assert.equal(normalized.source.width, 2);
    assert.equal(normalized.source.height, 2);
    assert.equal(normalized.variants.canonical.mimeType, "image/jpeg");
    assert.ok(normalized.variants.canonical.sizeBytes > 0);
    assert.ok(normalized.variants.ai_preview.sizeBytes > 0);
    assert.ok(normalized.variants.thumbnail.sizeBytes > 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
