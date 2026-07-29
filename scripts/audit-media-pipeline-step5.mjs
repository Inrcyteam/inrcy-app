import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const required = [
  "lib/mediaImageNormalizationPolicy.ts",
  "lib/mediaImageNormalizer.ts",
  "lib/mediaImageNormalizationQueue.ts",
  "lib/mediaImageNormalizationWorker.ts",
  "app/api/cron/media-image-normalization/route.ts",
  "ops/sql/2026-07-29_media_pipeline_step5_image_normalization.sql",
  "ops/sql/2026-07-29_media_pipeline_step5_verify.sql",
  "docs/MEDIA_PIPELINE_STEP5_IMAGE_NORMALIZATION_2026-07-29.md",
];

for (const file of required) {
  if (!existsSync(resolve(root, file))) {
    throw new Error(`Étape 5 incomplète : ${file} manquant.`);
  }
}

const policy = readFileSync(
  resolve(root, "lib/mediaImageNormalizationPolicy.ts"),
  "utf8",
);
const normalizer = readFileSync(
  resolve(root, "lib/mediaImageNormalizer.ts"),
  "utf8",
);
const queue = readFileSync(
  resolve(root, "lib/mediaImageNormalizationQueue.ts"),
  "utf8",
);
const worker = readFileSync(
  resolve(root, "lib/mediaImageNormalizationWorker.ts"),
  "utf8",
);
const uploadEvent = readFileSync(
  resolve(root, "app/api/media-pipeline/upload-event/route.ts"),
  "utf8",
);
const uploadIntent = readFileSync(
  resolve(root, "app/api/media-pipeline/upload-intent/route.ts"),
  "utf8",
);
const workspace = readFileSync(
  resolve(root, "lib/mediaWorkspaceServer.ts"),
  "utf8",
);
const cron = readFileSync(
  resolve(root, "app/api/cron/media-image-normalization/route.ts"),
  "utf8",
);
const migration = readFileSync(
  resolve(root, "ops/sql/2026-07-29_media_pipeline_step5_image_normalization.sql"),
  "utf8",
);
const vercel = readFileSync(resolve(root, "vercel.json"), "utf8");

const checks = [
  [policy.includes("MEDIA_PIPELINE_IMAGE_NORMALIZATION_V1"), "feature flag serveur étape 5"],
  [normalizer.includes('purpose: "canonical"'), "variante canonique"],
  [normalizer.includes('purpose: "ai_preview"'), "aperçu IA"],
  [normalizer.includes('purpose: "thumbnail"'), "miniature"],
  [normalizer.includes(".rotate()"), "rotation EXIF"],
  [normalizer.includes('fit: "inside"'), "normalisation sans recadrage"],
  [normalizer.includes("metadata_stripped: true"), "suppression des métadonnées sensibles"],
  [queue.includes("inrcy_enqueue_image_normalization"), "mise en file idempotente"],
  [worker.includes("inrcy_claim_image_normalization_jobs"), "claim atomique worker"],
  [worker.includes("content_hash_sha256"), "empreinte source"],
  [worker.includes("failed_retryable"), "retries persistants"],
  [uploadEvent.includes("enqueueImageNormalization"), "déclenchement après upload"],
  [uploadIntent.includes("alreadyUploaded && mediaType === \"image\""), "réparation des reprises déjà uploadées"],
  [workspace.includes("allRequiredProcessingReady"), "workspace en attente de la normalisation"],
  [cron.includes("VERCEL_CRON_SECRET"), "route cron protégée"],
  [vercel.includes("/api/cron/media-image-normalization"), "cron chaque minute"],
  [migration.includes("for update skip locked"), "concurrence SQL sécurisée"],
  [migration.includes("to service_role"), "fonctions réservées au backend"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Étape 5 incomplète : ${label}.`);
}

if (/\bdrop\s+(table|column)\b|\btruncate\b/i.test(migration)) {
  throw new Error("Étape 5 invalide : migration destructive détectée.");
}

if (/\.formData\s*\(|request\.arrayBuffer\s*\(/.test(cron)) {
  throw new Error("Étape 5 invalide : le worker ne doit pas recevoir le binaire du navigateur.");
}

console.log("iNrCy — audit pipeline média — Étape 5\n");
console.log("Normalisation image installée :");
console.log("  - file persistante et idempotente après upload");
console.log("  - worker Sharp protégé par CRON_SECRET");
console.log("  - claim SQL SKIP LOCKED et reprise des leases expirés");
console.log("  - rotation EXIF, redimensionnement sans recadrage et métadonnées retirées");
console.log("  - variante canonique, aperçu IA et miniature dans le bucket privé");
console.log("  - transparence conservée sur la version canonique");
console.log("  - HEIC avec secours heic-convert");
console.log("  - retries persistants et statut workspace synchronisé");
console.log("  - ancien pipeline de publication toujours intact");
console.log("\nAUDIT ÉTAPE 5 OK — normalisation automatique des images prête derrière feature flag.");
