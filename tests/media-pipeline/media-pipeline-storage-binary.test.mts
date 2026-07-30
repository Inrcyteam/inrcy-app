import assert from "node:assert/strict";
import test from "node:test";

import {
  SUPABASE_STORAGE_BINARY_UPLOAD_VERSION,
  toExactStorageArrayBuffer,
  withStorageBinaryMetadata,
} from "../../lib/supabaseStorageBinary.ts";

test("le corps Storage conserve exactement une vue Buffer binaire", () => {
  const pooled = Buffer.alloc(64, 0x7a);
  const jpegLike = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff,
    0x80, 0xfe, 0xff, 0xd9,
  ]);
  jpegLike.copy(pooled, 19);
  const view = pooled.subarray(19, 19 + jpegLike.byteLength);

  const exact = Buffer.from(toExactStorageArrayBuffer(view));
  assert.equal(exact.byteLength, jpegLike.byteLength);
  assert.deepEqual(exact, jpegLike);
  assert.notEqual(
    Buffer.byteLength(view.toString()),
    view.byteLength,
    "le test doit couvrir les octets que la coercition UTF-8 corrompt",
  );
});

test("le marqueur binaire est ajouté sans supprimer les métadonnées", () => {
  assert.deepEqual(withStorageBinaryMetadata({ output_sha256: "abc" }), {
    output_sha256: "abc",
    storage_binary_upload_version: SUPABASE_STORAGE_BINARY_UPLOAD_VERSION,
  });
});
