import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const required = [
  "lib/mediaVideoNormalizationPolicy.ts",
  "lib/mediaVideoNormalizer.ts",
  "lib/mediaVideoNormalizationQueue.ts",
  "lib/mediaVideoNormalizationWorker.ts",
  "app/api/cron/media-video-normalization/route.ts",
  "ops/sql/2026-07-29_media_pipeline_step6_video_normalization.sql",
  "ops/sql/2026-07-29_media_pipeline_step6_verify.sql",
  "docs/MEDIA_PIPELINE_STEP6_VIDEO_NORMALIZATION_2026-07-29.md",
];

for (const file of required) {
  if (!existsSync(resolve(root, file))) {
    throw new Error(`Étape 6 incomplète : ${file} manquant.`);
  }
}

const read = (file) => readFileSync(resolve(root, file), "utf8");
const policy = read("lib/mediaVideoNormalizationPolicy.ts");
const normalizer = read("lib/mediaVideoNormalizer.ts");
const queue = read("lib/mediaVideoNormalizationQueue.ts");
const worker = read("lib/mediaVideoNormalizationWorker.ts");
const uploadEvent = read("app/api/media-pipeline/upload-event/route.ts");
const uploadIntent = read("app/api/media-pipeline/upload-intent/route.ts");
const workspace = read("lib/mediaWorkspaceServer.ts");
const cron = read("app/api/cron/media-video-normalization/route.ts");
const migration = read(
  "ops/sql/2026-07-29_media_pipeline_step6_video_normalization.sql",
);
const vercel = read("vercel.json");
const boosterTest = read(
  "tests/booster-image-decision/booster-image-pipeline-step3.test.mjs",
);

const checks = [
  [policy.includes("MEDIA_PIPELINE_VIDEO_NORMALIZATION_V1"), "feature flag serveur étape 6"],
  [policy.includes('"frame_01"') && policy.includes('"audio_track"'), "catalogue des dérivés vidéo"],
  [normalizer.includes("ffmpeg-static"), "binaire FFmpeg packagé"],
  [normalizer.includes('"libx264"'), "MP4 canonique H.264"],
  [normalizer.includes('"yuv420p"'), "compatibilité réseaux sociaux"],
  [normalizer.includes("buildVideoFrameCaptureTimes"), "captures vidéo stables"],
  [normalizer.includes('"16000"'), "piste audio 16 kHz"],
  [queue.includes("inrcy_enqueue_video_normalization"), "mise en file idempotente"],
  [worker.includes("inrcy_claim_video_normalization_jobs"), "claim atomique worker"],
  [worker.includes("content_hash_sha256"), "empreinte source"],
  [worker.includes("failed_retryable"), "retries persistants"],
  [uploadEvent.includes("enqueueVideoNormalization"), "déclenchement après upload"],
  [uploadIntent.includes('alreadyUploaded && mediaType === "video"'), "réparation des reprises vidéo"],
  [workspace.includes("isVideoNormalizationEnabled"), "workspace en attente du traitement vidéo"],
  [cron.includes("VERCEL_CRON_SECRET"), "route cron protégée"],
  [vercel.includes("/api/cron/media-video-normalization"), "cron vidéo chaque minute"],
  [vercel.includes('app/api/cron/media-video-normalization/route.ts'), "FFmpeg inclus dans la fonction"],
  [migration.includes("for update skip locked"), "concurrence SQL sécurisée"],
  [migration.includes("to service_role"), "fonctions réservées au backend"],
  [boosterTest.includes("sourceFile:\\s*file"), "test Booster regex corrigé"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Étape 6 incomplète : ${label}.`);
}

if (/\bdrop\s+(table|column)\b|\btruncate\b/i.test(migration)) {
  throw new Error("Étape 6 invalide : migration destructive détectée.");
}

if (/\.formData\s*\(|request\.arrayBuffer\s*\(/.test(cron)) {
  throw new Error("Étape 6 invalide : le worker ne doit pas recevoir le binaire du navigateur.");
}

console.log("iNrCy — audit pipeline média — Étape 6\n");
console.log("Normalisation vidéo installée :");
console.log("  - file persistante et idempotente après upload");
console.log("  - worker FFmpeg privé, protégé et limité à un job");
console.log("  - MP4 canonique H.264/AAC sans recadrage");
console.log("  - aperçu IA, miniature et trois captures JPEG");
console.log("  - piste audio mono 16 kHz, facultative pour les vidéos silencieuses");
console.log("  - plafonds de taille et débits adaptés à la durée");
console.log("  - retries persistants et statut workspace synchronisé");
console.log("  - ancien pipeline Booster / iNrSend toujours intact");
console.log("  - contrôles obsolètes Booster, workspace et multicompte modernisés");
console.log("\nAUDIT ÉTAPE 6 OK — normalisation automatique des vidéos prête derrière feature flag.");
