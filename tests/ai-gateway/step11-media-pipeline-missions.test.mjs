import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const hookSource = read(
  "app/dashboard/booster/publier/usePersistentMediaWorkspace.ts",
);
const modalSource = read(
  "app/dashboard/booster/publier/PublishModal.tsx",
);
const uploadEventSource = read(
  "app/api/media-pipeline/upload-event/route.ts",
);
const uploadIntentSource = read(
  "app/api/media-pipeline/upload-intent/route.ts",
);
const prepareRouteSource = read(
  "app/api/media-pipeline/workspace/prepare/route.ts",
);
const missionSource = read("lib/boosterMediaPipelineMissions.ts");
const sourcePreviewSource = read(
  "app/api/media-pipeline/workspace/source-preview/route.ts",
);
const imageWorkerSource = read("lib/mediaImageNormalizationWorker.ts");
const videoWorkerSource = read("lib/mediaVideoNormalizationWorker.ts");

test("étape 2 expose exactement les trois missions média", () => {
  for (const mission of [
    "source_metadata",
    "ai_preparation",
    "publication_preparation",
  ]) {
    assert.match(missionSource, new RegExp(`"${mission}"`));
  }
  assert.match(
    missionSource,
    /ai_preparation:\s*\["ai_preview"\][\s\S]*publication_preparation:\s*\["canonical"\]/,
  );
  assert.match(
    missionSource,
    /ai_preparation:\s*\[[\s\S]*"frame_01"[\s\S]*"audio_track"[\s\S]*publication_preparation:\s*\["canonical", "thumbnail"\]/,
  );
});

test("l'ajout ne lance plus de préparation IA ou publication", () => {
  const scheduleStart = hookSource.indexOf("const scheduleSync");
  const preparationStart = hookSource.indexOf("const runPreparationMission");
  assert.ok(scheduleStart >= 0 && preparationStart > scheduleStart);
  const scheduleSource = hookSource.slice(scheduleStart, preparationStart);
  assert.doesNotMatch(scheduleSource, /prepareMediaPublicationWorkspace\s*\(/);
  assert.doesNotMatch(scheduleSource, /prewarmMediaPublicationWorkspace\s*\(/);
  assert.match(scheduleSource, /buildBoosterSourceMediaMetadata/);
  assert.match(scheduleSource, /source_metadata:\s*sourceMetadata/);
});

test("les deux préparations sont explicites et idempotentes côté client", () => {
  assert.match(hookSource, /prepareAiMedia/);
  assert.match(hookSource, /preparePublicationMedia/);
  assert.match(hookSource, /activePreparationRef/);
  assert.match(hookSource, /missionReadyRef/);
});

test("la vidéo n'est plus analysée au moment de son ajout", () => {
  const addStart = modalSource.indexOf("const addVideoFile");
  const addEnd = modalSource.indexOf("const onVideoChange", addStart);
  assert.ok(addStart >= 0 && addEnd > addStart);
  const addSource = modalSource.slice(addStart, addEnd);
  assert.doesNotMatch(addSource, /getOrPrepareVideoFramesForAI/);
  assert.doesNotMatch(addSource, /getOrPrepareVideoAudioFileForAI/);

  assert.match(
    modalSource,
    /purpose === "generate"\s*\? await preparePersistentAiMedia\(\)/,
  );
  assert.match(
    modalSource,
    /hasVideoForGeneration[\s\S]*?!mediaPipelineCutoverEnabled/,
  );
});

test("l'upload workspace persiste les métadonnées sans normaliser", () => {
  assert.match(uploadIntentSource, /width:\s*sourceRegistry\.width/);
  assert.match(uploadIntentSource, /height:\s*sourceRegistry\.height/);
  assert.match(
    uploadIntentSource,
    /duration_seconds:\s*sourceRegistry\.durationSeconds/,
  );
  assert.doesNotMatch(
    uploadIntentSource,
    /reused image normalization enqueue failed/,
  );
  assert.match(uploadEventSource, /sourceMetadataOnly/);
  assert.match(uploadEventSource, /reason:\s*"source_metadata_only"/);
});

test("le serveur distingue préparation IA et préparation publication", () => {
  assert.match(prepareRouteSource, /type PreparationMission/);
  assert.match(prepareRouteSource, /mission === "ai_preparation"/);
  assert.match(prepareRouteSource, /isDirectPublicationVideo/);
  assert.match(prepareRouteSource, /hasAiArtifacts/);
  assert.match(prepareRouteSource, /mission,/);
  assert.match(prepareRouteSource, /alignReadyMissionStatuses/);
  assert.match(imageWorkerSource, /requiredImagePurposes/);
  assert.match(videoWorkerSource, /requiredVideoKeys/);
});

test("la miniature d'interface reste une mission source sans canonique", () => {
  assert.match(sourcePreviewSource, /normalizeImageThumbnailBuffer/);
  assert.match(sourcePreviewSource, /mission:\s*"source_metadata"/);
  assert.match(sourcePreviewSource, /interface_only:\s*true/);
  assert.doesNotMatch(sourcePreviewSource, /purpose:\s*"canonical"/);
  assert.doesNotMatch(sourcePreviewSource, /purpose:\s*"ai_preview"/);
});
