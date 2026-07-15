import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const client = await readFile(
  new URL("../../lib/boosterVideoAudioClient.ts", import.meta.url),
  "utf8",
);
const uploadRoute = await readFile(
  new URL("../../app/api/booster/transcription-upload-url/route.ts", import.meta.url),
  "utf8",
);
const transcribeRoute = await readFile(
  new URL("../../app/api/booster/transcribe/route.ts", import.meta.url),
  "utf8",
);

test("les audios dépassant le seuil Function passent par un upload signé direct", () => {
  assert.match(client, /const DIRECT_FUNCTION_AUDIO_BYTES = 3_750_000/);
  assert.match(client, /uploadToSignedUrl\(prepared\.storagePath/);
  assert.match(client, /mode: "storage"/);
  assert.match(uploadRoute, /createSignedUploadUrl\(storagePath\)/);
  assert.match(uploadRoute, /booster-transcription-audio/);
});

test("le serveur valide la propriété du fichier temporaire et le supprime toujours", () => {
  assert.match(transcribeRoute, /isOwnedTemporaryAudioPath\(storagePathEntry, activeUserId\)/);
  assert.match(transcribeRoute, /downloadTemporaryAudio\(storagePathEntry, activeUserId\)/);
  assert.match(
    transcribeRoute,
    /finally \{[\s\S]*temporaryAudioStoragePath[\s\S]*\.remove\(\[temporaryAudioStoragePath\]\)/,
  );
});
