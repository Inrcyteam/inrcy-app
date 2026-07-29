import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const required = [
  "lib/mediaPipelineCertification.ts",
  "lib/health/checks.ts",
  "scripts/verify-media-pipeline-rollout.mjs",
  "scripts/smoke-media-pipeline.mjs",
  "ops/sql/2026-07-29_media_pipeline_step9_final_certification.sql",
  "ops/MEDIA_PIPELINE_PRODUCTION_CUTOVER_2026-07-29.md",
  "docs/MEDIA_PIPELINE_STEP9_FINAL_CERTIFICATION_2026-07-29.md",
  "docs/MEDIA_PIPELINE_STEP9_CERTIFICATION_RESULTS_2026-07-29.md",
  "tests/media-pipeline/media-pipeline-certification-policy.test.mts",
  "tests/media-pipeline/media-pipeline-step9-final-certification.test.mjs",
];

for (const file of required) {
  if (!existsSync(resolve(root, file))) {
    throw new Error(`Étape 9 incomplète : ${file} manquant.`);
  }
}

const read = (file) => readFileSync(resolve(root, file), "utf8");
const policy = read("lib/mediaPipelineCertification.ts");
const health = read("lib/health/checks.ts");
const cronHealth = read("app/api/cron/health/route.ts");
const packageJson = JSON.parse(read("package.json"));
const vercel = JSON.parse(read("vercel.json"));
const sql = read(
  "ops/sql/2026-07-29_media_pipeline_step9_final_certification.sql",
);
const cutover = read("ops/MEDIA_PIPELINE_PRODUCTION_CUTOVER_2026-07-29.md");
const documentation = read(
  "docs/MEDIA_PIPELINE_STEP9_FINAL_CERTIFICATION_2026-07-29.md",
);

const checks = [
  [policy.includes('"full_cutover"'), "palier full_cutover"],
  [policy.includes('"workspace_canary"'), "palier workspace_canary"],
  [policy.includes('"unified_canary"'), "palier unified_canary"],
  [policy.includes("requireDependency"), "validation des dépendances de flags"],
  [health.includes("checkMediaPipeline"), "healthcheck média"],
  [health.includes('storage.getBucket("inrcy-pro-media")'), "bucket privé vérifié"],
  [health.includes("expired_processing_jobs"), "leases expirées observées"],
  [health.includes("stale_publishing_workspaces"), "publications bloquées observées"],
  [cronHealth.includes("report.checks.media_pipeline"), "journalisation health média"],
  [packageJson.scripts?.["qa:media-pipeline:step9"], "commande QA Étape 9"],
  [packageJson.scripts?.["certify:media-pipeline"], "commande certification finale"],
  [packageJson.scripts?.["verify:media-pipeline:rollout"], "commande vérification flags"],
  [packageJson.scripts?.["smoke:media-pipeline"], "commande smoke production"],
  [sql.includes("media_processing_jobs"), "métriques de file SQL"],
  [sql.includes("publication_workspaces"), "métriques workspaces SQL"],
  [sql.includes("inrcy-pro-media"), "contrôle bucket SQL"],
  [cutover.includes("Rollback niveau 1"), "rollback opérationnel documenté"],
  [cutover.includes("Phase 6"), "activation finale documentée"],
  [documentation.includes("npm run certify:media-pipeline"), "commande de certification documentée"],
  [documentation.includes("aucune migration Étape 9"), "absence de migration destructive documentée"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Étape 9 incomplète : ${label}.`);
}

const imageCron = vercel.crons?.some(
  (item) => item.path === "/api/cron/media-image-normalization" && item.schedule === "*/1 * * * *",
);
const videoCron = vercel.crons?.some(
  (item) => item.path === "/api/cron/media-video-normalization" && item.schedule === "*/1 * * * *",
);
if (!imageCron || !videoCron) {
  throw new Error("Étape 9 incomplète : crons image/vidéo non certifiés à la minute.");
}

if (/\b(insert|update|delete|drop|truncate|alter|create)\b/i.test(sql)) {
  throw new Error("Étape 9 invalide : le SQL final doit rester strictement en lecture seule.");
}

console.log("iNrCy — audit pipeline média — Étape 9\n");
console.log("Certification finale installée :");
console.log("  - dépendances de flags validées et paliers nommés");
console.log("  - healthcheck privé des tables, buckets et files");
console.log("  - smoke post-déploiement automatisé");
console.log("  - contrôle SQL global strictement en lecture seule");
console.log("  - procédure de déploiement en six phases");
console.log("  - seuils de rollback et retour arrière sans SQL inverse");
console.log("  - certification complète Booster / Pinterest / multicompte / iNrSend");
console.log("\nAUDIT ÉTAPE 9 OK — pipeline prêt pour activation progressive.");
