import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("les workers Storage évitent les copies binaires inutiles", () => {
  const imageWorker = read("lib/mediaImageNormalizationWorker.ts");
  const videoWorker = read("lib/mediaVideoNormalizationWorker.ts");
  assert.match(imageWorker, /toExactStorageArrayBuffer\(params\.normalized\.buffer\)/);
  assert.match(videoWorker, /createReadStream\(params\.normalized\.filePath\)/);
  assert.match(videoWorker, /duplex:\s*"half"/);
  assert.doesNotMatch(videoWorker, /readFile\(params\.normalized\.filePath\)/);
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

test("la génération vidéo utilise les captures locales tandis que programmer exige le workspace", () => {
  const modal = read("app/dashboard/booster/publier/PublishModal.tsx");
  const generate = read("app/api/booster/generate/route.ts");
  assert.match(
    modal,
    /shouldPrepareMediaForAi[\s\S]*waitForPersistentWorkspaceReadiness\([\s\S]*"generate"/,
  );
  assert.match(modal, /getOrPrepareVideoFramesForAI\(videoFile\)/);
  assert.doesNotMatch(modal, /transcribeVideoAudioForAI\(/);
  assert.doesNotMatch(modal, /directOriginalAvailable/);
  assert.match(
    modal,
    /mediaPipelineCutoverV1:\s*true,[\s\S]{0,100}allowOriginalVideoFallback:\s*false/,
  );
  assert.match(generate, /workspace_verified_client_video_context/);
  assert.match(generate, /existingVideoFrames\.length/);
});

test("les événements de progression ne publient jamais uploaded", () => {
  const uploadClient = read("lib/universalMediaUploadClient.ts");
  assert.match(uploadClient, /progressPersistenceChain/);
  assert.match(uploadClient, /if \(normalized >= 100\) return/);
  assert.match(uploadClient, /event: "uploading"/);
  assert.match(uploadClient, /await progressPersistenceChain\.catch/);
});
