import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { canPublishVideoSourceDirectly } from "../../lib/mediaVideoSourceCompatibility.ts";
import {
  buildTikTokVideoUploadPlan,
  TIKTOK_DEFAULT_CHUNK_BYTES,
} from "../../lib/tiktokUploadPlan.ts";

const ROOT = process.cwd();
const MB = 1024 * 1024;

async function readSource(relativePath: string) {
  return await readFile(path.resolve(ROOT, relativePath), "utf8");
}

test("MP4 et M4V utilisent directement la source stockée", () => {
  assert.equal(
    canPublishVideoSourceDirectly({
      name: "publication.MP4",
      mimeType: "video/mp4",
    }),
    true,
  );
  assert.equal(
    canPublishVideoSourceDirectly({
      storagePath: "users/u/source/video.m4v",
      mimeType: "application/octet-stream",
    }),
    true,
  );
  assert.equal(
    canPublishVideoSourceDirectly({
      name: "camera.mov",
      mimeType: "video/quicktime",
    }),
    false,
  );
});

test("TikTok reçoit une vidéo de 30 Mo en un morceau", () => {
  assert.deepEqual(buildTikTokVideoUploadPlan(30 * MB), {
    chunkSize: 30 * MB,
    totalChunkCount: 1,
  });
});

test("TikTok reçoit une vidéo de 160 Mo en cinq morceaux séquentiels", () => {
  assert.deepEqual(buildTikTokVideoUploadPlan(160 * MB), {
    chunkSize: TIKTOK_DEFAULT_CHUNK_BYTES,
    totalChunkCount: 5,
  });
});

test("TikTok garde un dernier morceau conforme pour une source de 300 Mo", () => {
  const size = 300 * MB;
  const plan = buildTikTokVideoUploadPlan(size);
  const lastChunkSize =
    size - plan.chunkSize * (plan.totalChunkCount - 1);

  assert.equal(plan.totalChunkCount, 9);
  assert.ok(lastChunkSize >= 5 * MB);
  assert.ok(lastChunkSize <= 64 * MB);
});

test("publier et programmer réutilisent le préchauffage et génèrent les variantes une seule fois", async () => {
  const modal = await readSource(
    "app/dashboard/booster/publier/PublishModal.tsx",
  );
  const uploadEvent = await readSource(
    "app/api/media-pipeline/upload-event/route.ts",
  );
  const publishRoute = await readSource(
    "app/api/booster/publish-now/route.ts",
  );

  assert.match(modal, /if \(allUploaded && directVideoSource\)/);
  assert.match(modal, /Vidéo sécurisée/);
  assert.match(modal, /async function prepareCutoverVideoVariants/);
  assert.match(modal, /startBackgroundVideoPrewarm/);
  assert.equal(
    (modal.match(/prewarmPersistentMediaWorkspace\(/g) || []).length,
    3,
  );
  assert.match(modal, /generateMissingVideoVariants:\s*true/);
  assert.match(
    modal,
    /shouldRetryVideoVariantGeneration[\s\S]*generateMissingVideoVariants:\s*true/,
  );
  assert.match(uploadEvent, /!directVideoSource/);
  assert.match(uploadEvent, /reason:\s*"source_direct_ready"/);
  assert.doesNotMatch(publishRoute, /oversizedPublicationVideo/);
});
