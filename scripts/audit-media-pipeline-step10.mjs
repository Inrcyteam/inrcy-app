import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const read = (file) => readFileSync(resolve(ROOT, file), "utf8");

const requiredFiles = [
  "app/api/media-pipeline/workspace/prewarm/route.ts",
  "app/api/media-pipeline/upload-event/route.ts",
  "app/api/cron/media-orphan-cleanup/route.ts",
  "app/dashboard/booster/publier/usePersistentMediaWorkspace.ts",
  "app/api/booster/publish-now/publishNow.server-preparation.ts",
  "lib/mediaImageNormalizer.ts",
  "lib/boosterImageServerPreparation.ts",
  "lib/boosterVideoVariantServer.ts",
  "ops/sql/2026-07-30_media_pipeline_step10_performance_hardening.sql",
  "ops/sql/2026-07-30_media_pipeline_step10_verify.sql",
  "docs/MEDIA_PIPELINE_STEP10_FINAL_HARDENING_2026-07-30.md",
];

for (const file of requiredFiles) {
  if (!existsSync(resolve(ROOT, file))) {
    throw new Error(`Étape 10 incomplète : ${file} manquant.`);
  }
}

if (existsSync(resolve(ROOT, "app/api/booster/convert-image/route.ts"))) {
  throw new Error(
    "Étape 10 invalide : la conversion HEIC/HEIF transite encore par Vercel.",
  );
}

const workspace = read(
  "app/dashboard/booster/publier/usePersistentMediaWorkspace.ts",
  "app/api/booster/publish-now/publishNow.server-preparation.ts",
);
const imageVariants = read("lib/boosterImageServerPreparation.ts");
const imageNormalizer = read("lib/mediaImageNormalizer.ts");
const videoVariants = read("lib/boosterVideoVariantServer.ts");
const publishRoute =
  read("app/api/booster/publish-now/route.ts") +
  read("app/api/booster/publish-now/publishNow.server-preparation.ts");
const uploadEvent = read("app/api/media-pipeline/upload-event/route.ts");
const cleanup = read("app/api/cron/media-orphan-cleanup/route.ts");
const sql = read(
  "ops/sql/2026-07-30_media_pipeline_step10_performance_hardening.sql",
);
const packageJson = JSON.parse(read("package.json"));
const vercel = JSON.parse(read("vercel.json"));

const checks = [
  [
    /mediaType\s*===\s*"video"\s*\?\s*1\s*:\s*3/.test(workspace),
    "trois uploads image en parallèle",
  ],
  [
    workspace.includes("queueBackgroundPreparation"),
    "normalisation lancée pendant l'upload",
  ],
  [workspace.includes("prewarmWorkspace"), "préchauffage client"],
  [
    imageNormalizer.includes('from "bmp-js"') &&
      imageNormalizer.includes('"bmp-js"'),
    "décodage réel des sources BMP",
  ],
  [
    imageVariants.includes('"channel_publish"') &&
      imageVariants.includes("workspace-channel-images"),
    "cache persistant des variantes image",
  ],
  [
    videoVariants.includes('"channel_publish"') &&
      videoVariants.includes("workspace-channel-videos"),
    "cache persistant des variantes vidéo",
  ],
  [
    publishRoute.includes("preparePublicationVariants(false)") &&
      !publishRoute.includes("preparePublicationVariants(true)") &&
      publishRoute.includes("preflightFailuresByChannel") &&
      publishRoute.includes("if (sourceValidation.ok) return []"),
    "publication vidéo rapide avec isolation par canal et génération hors requête",
  ],
  [
    publishRoute.includes("publicationReady === true"),
    "chemin rapide des images déjà préparées",
  ],
  [uploadEvent.includes("verifyStoredUpload"), "confirmation serveur du stockage"],
  [
    cleanup.includes("original_retention_until") &&
      cleanup.includes("publication_workspace_media"),
    "nettoyage différé et réversible",
  ],
  [sql.includes("314572800"), "limite stockage 300 Mo"],
  [
    sql.includes("40894464") &&
      sql.includes("processing_status = 'not_requested'"),
    "migration de reprise historique conservée",
  ],
  [sql.includes("'audio/mpeg'"), "artefact audio temporaire autorisé"],
  [
    sql.includes('drop policy if exists "inrcy_pro_media_insert_own"') &&
      sql.includes("revoke insert, update, delete"),
    "écritures sensibles réservées au serveur",
  ],
  [packageJson.dependencies?.next === "^16.2.11", "Next.js corrigé"],
  [packageJson.dependencies?.sharp === "0.35.3", "Sharp corrigé et verrouillé"],
  [
    packageJson.overrides?.sharp === "0.35.3",
    "Sharp corrigé dans les dépendances transitives",
  ],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Étape 10 incomplète : ${label}.`);
}

const orphanCron = vercel.crons?.some(
  (item) =>
    item.path === "/api/cron/media-orphan-cleanup" &&
    item.schedule === "17 * * * *",
);
const prewarmFfmpeg =
  vercel.functions?.["app/api/media-pipeline/workspace/prewarm/route.ts"]
    ?.includeFiles;
if (!orphanCron || !/ffmpeg-static/.test(String(prewarmFfmpeg || ""))) {
  throw new Error("Étape 10 incomplète : cron ou binaire FFmpeg absent.");
}

console.log("iNrCy — audit pipeline média — Étape 10\n");
console.log("  - HEIC/HEIF hors fonctions Vercel");
console.log("  - uploads directs et parallèles");
console.log("  - préparation anticipée et cache persistant par canal");
console.log("  - contrôle vidéo rapide puis une seule récupération si nécessaire");
console.log("  - preuve serveur des uploads et nettoyage différé");
console.log("  - limites Storage alignées sur le produit");
console.log("\nAUDIT ÉTAPE 10 OK — pipeline média final durci.");
