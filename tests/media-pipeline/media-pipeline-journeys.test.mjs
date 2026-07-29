import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const read = (file) => readFileSync(resolve(ROOT, file), "utf8");

const imageController = () =>
  read("app/dashboard/booster/publier/usePublishImageController.ts");
const videoController = () =>
  read("app/dashboard/booster/publier/usePublishVideoController.ts");
const modal = () => read("app/dashboard/booster/publier/PublishModal.tsx");
const shared = () =>
  read("app/dashboard/booster/publier/publishModal.shared.tsx");

test("baseline image : insertion, conversion, brouillon et publication sont cartographiés", () => {
  assert.match(
    imageController(),
    /incoming\.map\(\(file\)\s*=>\s*convertHeicOrHeifImageFile\(file\)\)/,
  );
  assert.match(shared(), /fetch\("\/api\/booster\/convert-image"/);
  assert.match(imageController(), /async function uploadPublicationDraftImages\(\)/);
  assert.match(imageController(), /uploadBoosterImageFileDirect\(/);
  assert.match(shared(), /fetch\("\/api\/booster\/upload-prepared"/);
  assert.match(imageController(), /const uploadOriginalImagesForPublication\s*=\s*async/);
  assert.match(shared(), /export async function uploadPreparedImages\(/);
});

test("baseline génération : les médias IA sont préparés avant /api/booster/generate", () => {
  const source = modal();
  assert.match(source, /getOrPrepareAiImagePayload/);
  assert.match(source, /getOrPrepareVideoFramesForAI/);
  assert.match(source, /buildBoosterGenerationRequest/);
  assert.match(source, /fetch\("\/api\/booster\/generate"/);
  assert.match(
    read("lib/boosterGenerationTransportClient.ts"),
    /transport:\s*"multipart"/,
  );
});

test("baseline publication immédiate prépare les médias avant trackEvent publish", () => {
  const source = modal();
  const uploadImageIndex = source.indexOf("uploadOriginalImagesForPublication(");
  const uploadVideoIndex = source.indexOf("uploadPublicationVideoForPublish()");
  const publishIndex = source.indexOf('trackEvent("publish"');
  assert.ok(uploadImageIndex >= 0 && uploadImageIndex < publishIndex);
  assert.ok(uploadVideoIndex >= 0 && uploadVideoIndex < publishIndex);
  assert.match(source, /preparePublicationVideoVariants\(/);
});

test("baseline programmation prépare les mêmes médias avant scheduled-actions", () => {
  const source = modal();
  const scheduleIndex = source.indexOf('fetch("/api/agent/scheduled-actions"');
  assert.ok(scheduleIndex >= 0, "La route de programmation doit exister");
  const beforeSchedule = source.slice(Math.max(0, scheduleIndex - 16000), scheduleIndex);
  assert.match(beforeSchedule, /buildChannelImagesPayload\(/);
  assert.match(beforeSchedule, /uploadOriginalImagesForPublication\(/);
  assert.match(beforeSchedule, /uploadPreparedImages\(/);
  assert.match(beforeSchedule, /uploadPublicationVideoForPublish\(\)/);
});

test("baseline brouillon persiste puis restaure images et vidéo", () => {
  const source = modal();
  assert.match(source, /uploadPublicationDraftImages\(\)/);
  assert.match(source, /buildPublicationDraftVideoPayload\(\)/);
  assert.match(imageController(), /restorePublicationDraftImages/);
  assert.match(videoController(), /normalizeRestoredVideoVariants/);
});

test("ajouter un média reste indépendant d'une régénération automatique", () => {
  const imageSource = imageController();
  const videoSource = modal().slice(
    modal().indexOf("const addVideoFile"),
    modal().indexOf("const onVideoChange"),
  );
  assert.doesNotMatch(imageSource.slice(imageSource.indexOf("const addImageFiles"), imageSource.indexOf("const onImagesChange")), /\/api\/booster\/generate/);
  assert.doesNotMatch(videoSource, /\/api\/booster\/generate/);
});
