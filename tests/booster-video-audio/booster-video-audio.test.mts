import assert from "node:assert/strict";
import test from "node:test";

import { encodeMonoPcm16Wav } from "../../lib/boosterVideoAudioClient.ts";

test("encodeMonoPcm16Wav produit un WAV mono PCM 16 bits valide", async () => {
  const blob = encodeMonoPcm16Wav(new Float32Array([-1, -0.5, 0, 0.5, 1]), 16_000);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...bytes.slice(start, start + length));

  assert.equal(ascii(0, 4), "RIFF");
  assert.equal(ascii(8, 4), "WAVE");
  assert.equal(ascii(12, 4), "fmt ");
  assert.equal(ascii(36, 4), "data");
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 16_000);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(blob.type, "audio/wav");
  assert.equal(blob.size, 44 + 5 * 2);
});
