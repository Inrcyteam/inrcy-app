import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("les workers Storage n'envoient plus de Buffer Node brut", () => {
  const imageWorker = read("lib/mediaImageNormalizationWorker.ts");
  const videoWorker = read("lib/mediaVideoNormalizationWorker.ts");
  assert.match(imageWorker, /toExactStorageArrayBuffer\(params\.normalized\.buffer\)/);
  assert.match(videoWorker, /toExactStorageArrayBuffer\(buffer\)/);
  assert.match(imageWorker, /withStorageBinaryMetadata/);
  assert.match(videoWorker, /withStorageBinaryMetadata/);
});

test("les images historiques illisibles sont réparées depuis leur source", () => {
  const consumption = read("lib/mediaWorkspaceConsumption.ts");
  assert.match(consumption, /normalizeImageBuffer/);
  assert.match(consumption, /repairImageVariantsFromSource/);
  assert.match(consumption, /repaired_from_source_at/);
  assert.match(consumption, /assertStoredImageVariantIsValid/);
  assert.match(consumption, /toExactStorageArrayBuffer\(output\.buffer\)/);
});

test("la génération vidéo déclenche sa mission IA tandis que publier garde le fast path source", () => {
  const modal = read("app/dashboard/booster/publier/PublishModal.tsx");
  const generate = read("app/api/booster/generate/route.ts");
  assert.match(
    modal,
    /purpose === "generate"[\s\S]*preparePersistentAiMedia\(\)[\s\S]*preparePersistentPublicationMedia\(\)/,
  );
  assert.match(modal, /allUploaded && directVideoSource && purpose !== "generate"/);
  assert.match(modal, /Vidéo sécurisée · prête à être utilisée/);
  assert.match(generate, /workspace_verified_client_ai_preview/);
  assert.match(generate, /existingVideoFrames\.length/);
});

test("les événements de progression ne publient jamais uploaded", () => {
  const uploadClient = read("lib/universalMediaUploadClient.ts");
  assert.match(uploadClient, /progressPersistenceChain/);
  assert.match(uploadClient, /if \(normalized >= 100\) return/);
  assert.match(uploadClient, /event: "uploading"/);
  assert.match(uploadClient, /await progressPersistenceChain\.catch/);
});
