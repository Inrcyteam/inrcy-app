import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { canPublishVideoSourceDirectly } from "../../lib/mediaVideoSourceCompatibility.ts";
import {
  getVideoPublicationPolicy,
  validateVideoPublicationForChannel,
} from "../../lib/videoPublicationPolicy.ts";

const ROOT = process.cwd();
const MB = 1024 * 1024;

async function readSource(relativePath: string) {
  return await readFile(path.resolve(ROOT, relativePath), "utf8");
}

test("une source MP4 de 110 Mo reste publiable sous la limite source iNrCy", () => {
  assert.equal(
    canPublishVideoSourceDirectly({
      name: "video-110-mo.mp4",
      mimeType: "video/mp4",
      sizeBytes: 110 * MB,
      maxBytes: 300 * MB,
    }),
    true,
  );
  assert.equal(
    canPublishVideoSourceDirectly({
      name: "video-301-mo.mp4",
      mimeType: "video/mp4",
      sizeBytes: 301 * MB,
      maxBytes: 300 * MB,
    }),
    false,
  );
  assert.equal(
    canPublishVideoSourceDirectly({
      name: "taille-inconnue.mp4",
      mimeType: "video/mp4",
      maxBytes: 300 * MB,
    }),
    false,
  );
});

test("les limites vidéo sont contrôlées canal par canal", () => {
  assert.equal(getVideoPublicationPolicy("tiktok").maxBytes, 300 * MB);
  assert.equal(getVideoPublicationPolicy("tiktok").maxDurationSeconds, null);
  assert.equal(getVideoPublicationPolicy("linkedin").maxDurationSeconds, 30 * 60);
  assert.equal(getVideoPublicationPolicy("instagram").maxDurationSeconds, 15 * 60);
  assert.equal(getVideoPublicationPolicy("pinterest").maxDurationSeconds, 5 * 60);

  assert.equal(
    validateVideoPublicationForChannel({
      channel: "tiktok",
      name: "video.mp4",
      type: "video/mp4",
      storagePath: "videos/video.mp4",
      sizeBytes: 110 * MB,
      durationSeconds: 600,
    }).ok,
    true,
  );
  assert.equal(
    validateVideoPublicationForChannel({
      channel: "tiktok",
      name: "video.mp4",
      type: "video/mp4",
      storagePath: "videos/video.mp4",
      sizeBytes: 110 * MB,
      durationSeconds: 717,
    }).ok,
    true,
  );
  assert.equal(
    validateVideoPublicationForChannel({
      channel: "pinterest",
      name: "video.mp4",
      type: "video/mp4",
      storagePath: "videos/video.mp4",
      sizeBytes: 110 * MB,
      durationSeconds: 301,
    }).ok,
    false,
  );
  assert.equal(
    validateVideoPublicationForChannel({
      channel: "linkedin",
      name: "video.mp4",
      type: "video/mp4",
      storagePath: "videos/video.mp4",
      sizeBytes: 110 * MB,
    }).ok,
    false,
  );
});

test("les uploads ne forcent plus une compression globale au-dessus de 40 Mo", async () => {
  const rules = await readSource("lib/mediaRules.ts");
  const intent = await readSource("app/api/media-pipeline/upload-intent/route.ts");
  const event = await readSource("app/api/media-pipeline/upload-event/route.ts");
  const workspace = await readSource("lib/mediaWorkspaceConsumption.ts");
  const hook = await readSource(
    "app/dashboard/booster/publier/usePersistentMediaWorkspace.ts",
  );

  assert.match(
    rules,
    /INR_MEDIA_VIDEO_PUBLISH_MAX_BYTES\s*=\s*[\r\n\s]*INR_MEDIA_VIDEO_SOURCE_MAX_BYTES/,
  );
  assert.match(
    rules,
    /INR_MEDIA_VIDEO_PUBLISH_MAX_MB_LABEL\s*=\s*[\r\n\s]*INR_MEDIA_VIDEO_SOURCE_MAX_MB_LABEL/,
  );
  for (const source of [intent, event, workspace, hook]) {
    assert.match(source, /maxBytes:\s*INR_MEDIA_VIDEO_PUBLISH_MAX_BYTES/);
  }
  assert.doesNotMatch(hook, /background video prewarm skipped/);
  assert.match(hook, /request\.mediaType === "image"/);
  assert.doesNotMatch(
    hook,
    /request\.mediaType === "image" \|\| request\.mediaType === "video"/,
  );
});

test("la préparation réseau et la validation par canal précèdent la publication", async () => {
  const modal = await readSource(
    "app/dashboard/booster/publier/PublishModal.tsx",
  );
  const controller = await readSource(
    "app/dashboard/booster/publier/usePublishVideoController.ts",
  );
  const prewarm = await readSource(
    "app/api/media-pipeline/workspace/prewarm/route.ts",
  );
  const publish = await readSource("app/api/booster/publish-now/route.ts");
  const policy = await readSource("lib/videoPublicationPolicy.ts");
  const variants = await readSource("lib/boosterVideoVariantServer.ts");

  assert.match(modal, /async function ensureCutoverVideoVariantsReady/);
  assert.match(modal, /Vérification de la vidéo pour les réseaux/);
  assert.match(modal, /Vérification de la vidéo pour la programmation/);
  assert.match(controller, /validateVideoPublicationForChannel/);
  assert.match(prewarm, /invalidSignatures/);
  assert.match(prewarm, /invalidChannels/);
  assert.match(prewarm, /validateVideoPublicationForChannel/);
  assert.match(publish, /preflightFailuresByChannel/);
  assert.match(publish, /setPreflightFailure/);
  assert.match(publish, /buildBoosterPublicationDispatchPlan/);
  assert.match(publish, /validateVideoPublicationForChannel/);
  assert.match(policy, /maxDurationSeconds:\s*null/);
  assert.match(
    policy,
    /PINTEREST_VIDEO_MAX_DURATION_SECONDS\s*=\s*5\s*\*\s*60/,
  );
  assert.match(
    policy,
    /maxDurationSeconds:\s*PINTEREST_VIDEO_MAX_DURATION_SECONDS/,
  );
  assert.match(
    variants,
    /ok:\s*false,[\s\S]{0,140}fallbackToOriginal:\s*sourceCanPublishDirectly/,
  );
});

test("Pinterest ne conserve plus l'ancien plafond interne de 40 Mo", async () => {
  const pinterest = await readSource("lib/pinterestPublish.ts");
  assert.match(pinterest, /getVideoPublicationPolicy\("pinterest"\)/);
  assert.doesNotMatch(pinterest, /40\s*\*\s*1024\s*\*\s*1024/);
  assert.doesNotMatch(pinterest, /40 Mo/);
});
