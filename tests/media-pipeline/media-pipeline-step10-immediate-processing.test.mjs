import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Générer déclenche immédiatement le traitement du workspace au lieu d'attendre le cron", () => {
  const modal = read("app/dashboard/booster/publier/PublishModal.tsx");
  const client = read("lib/mediaWorkspaceClient.ts");

  assert.match(modal, /triggerMediaPublicationWorkspaceProcessing/);
  assert.match(modal, /processingKick/);
  assert.match(modal, /Préparation serveur : \$\{readyCount\}\/\$\{expectedCount\}/);
  assert.doesNotMatch(modal, /onProgress\?\.\(32, `Préparation des \$\{mediaLabel\}/);
  assert.match(client, /\/api\/media-pipeline\/process-workspace/);
});

test("la route immédiate reste authentifiée, limitée et scoped établissement", () => {
  const route = read("app/api/media-pipeline/process-workspace/route.ts");

  assert.match(route, /requireUser\(\)/);
  assert.match(route, /enforceRateLimit/);
  assert.match(route, /\.eq\("account_id", activeUserId\)/);
  assert.match(route, /\.eq\("pro_media_library\.user_id", activeUserId\)/);
  assert.match(route, /maxDuration = 300/);
});

test("les 5 images sont ciblées directement et le cron reste un filet de sécurité", () => {
  const route = read("app/api/media-pipeline/process-workspace/route.ts");
  const imageWorker = read("lib/mediaImageNormalizationWorker.ts");
  const claim = read("lib/mediaProcessingTargetedClaim.ts");
  const vercel = read("vercel.json");

  assert.match(route, /processImageNormalizationJobsForMedia/);
  assert.match(route, /concurrency: 2/);
  assert.match(imageWorker, /mediaIds[\s\S]*slice\(0, 5\)/);
  assert.match(claim, /\.eq\("media_id", mediaId\)/);
  assert.match(claim, /\.eq\("attempt_count", attemptCount\)/);
  assert.match(vercel, /media-image-normalization/);
});

test("le workspace expose la progression réelle et les erreurs terminales", () => {
  const workspaceRoute = read("app/api/media-pipeline/workspace/route.ts");
  const workspaceClient = read("lib/mediaWorkspaceClient.ts");
  const modal = read("app/dashboard/booster/publier/PublishModal.tsx");

  assert.match(workspaceRoute, /processing_progress/);
  assert.match(workspaceRoute, /processing_error_message/);
  assert.match(workspaceClient, /processingProgress\?: number/);
  assert.match(modal, /failed_terminal/);
  assert.match(modal, /processingProgress/);
});

test("la vidéo utilise le même déclenchement immédiat avec FFmpeg embarqué", () => {
  const route = read("app/api/media-pipeline/process-workspace/route.ts");
  const videoWorker = read("lib/mediaVideoNormalizationWorker.ts");
  const vercel = JSON.parse(read("vercel.json"));

  assert.match(route, /processVideoNormalizationJobsForMedia/);
  assert.match(videoWorker, /VIDEO_NORMALIZATION_JOB_TYPE/);
  assert.equal(
    vercel.functions["app/api/media-pipeline/process-workspace/route.ts"].includeFiles,
    "node_modules/ffmpeg-static/**/*",
  );
});
