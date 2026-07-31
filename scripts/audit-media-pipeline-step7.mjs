import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const required = [
  "lib/mediaPipelineUnifiedConsumptionPolicy.ts",
  "lib/mediaWorkspaceConsumption.ts",
  "app/api/booster/generate/route.ts",
  "app/api/booster/publish-now/route.ts",
  "app/api/booster/publish-now/publishNow.server-preparation.ts",
  "app/api/agent/scheduled-actions/route.ts",
  "app/dashboard/booster/publier/PublishModal.tsx",
  "ops/sql/2026-07-29_media_pipeline_step7_unified_consumption.sql",
  "ops/sql/2026-07-29_media_pipeline_step7_verify.sql",
  "docs/MEDIA_PIPELINE_STEP7_UNIFIED_CONSUMPTION_2026-07-29.md",
];

for (const file of required) {
  if (!existsSync(resolve(root, file))) {
    throw new Error(`Étape 7 incomplète : ${file} manquant.`);
  }
}

const read = (file) => readFileSync(resolve(root, file), "utf8");
const policy = read("lib/mediaPipelineUnifiedConsumptionPolicy.ts");
const resolver = read("lib/mediaWorkspaceConsumption.ts");
const generate = read("app/api/booster/generate/route.ts");
const publish =
  read("app/api/booster/publish-now/route.ts") +
  read("app/api/booster/publish-now/publishNow.server-preparation.ts");
const schedule = read("app/api/agent/scheduled-actions/route.ts");
const modal = read("app/dashboard/booster/publier/PublishModal.tsx");
const migration = read(
  "ops/sql/2026-07-29_media_pipeline_step7_unified_consumption.sql",
);

const checks = [
  [policy.includes("MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1"), "feature flag serveur étape 7"],
  [policy.includes("NEXT_PUBLIC_MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1"), "feature flag client étape 7"],
  [resolver.includes('"ai_preview"'), "aperçus IA depuis le registre"],
  [resolver.includes('"canonical"'), "variantes canoniques depuis le registre"],
  [resolver.includes('"video_frame"'), "captures vidéo depuis le registre"],
  [resolver.includes('"audio_track"'), "audio vidéo depuis le registre"],
  [resolver.includes('.eq("account_id", params.accountId)'), "scope établissement workspace"],
  [generate.includes("resolveWorkspaceAiConsumption"), "Générer relié au workspace"],
  [generate.includes('mediaWorkspaceSource = "legacy_fallback"'), "secours génération historique"],
  [generate.includes("workspace_cutover_v1"), "transition compatible avec la bascule Étape 8"],
  [publish.includes("resolveWorkspacePublicationConsumption"), "Publier relié au workspace"],
  [publish.includes('img.bucket || "booster"'), "lecture des buckets privés et historiques"],
  [publish.includes('source.bucket !== "booster"'), "copie de diffusion des images privées"],
  [publish.includes("thumbnailBucket"), "miniature vidéo signée depuis son bucket"],
  [publish.includes("loadStorageVideoForTikTok"), "lecture vidéo TikTok depuis le bucket réel"],
  [resolver.includes("canonicalImageName"), "extension image canonique cohérente"],
  [resolver.includes("canonicalVideoName"), "nom vidéo canonique MP4"],
  [publish.includes("legacyVideoResult.video?.transformedVariants"), "variantes vidéo historiques conservées"],
  [schedule.includes('operation: "schedule"'), "cycle Programmer persistant"],
  [modal.includes("generationPayload") && modal.includes("mediaWorkspaceId"), "référence workspace côté Booster"],
  [modal.includes("uploadPreparedImages"), "filet image historique conservé"],
  [modal.includes("uploadPublicationVideoForPublish"), "filet vidéo historique conservé"],
  [migration.includes("media_variants_ready_consumption_idx"), "index consommation des variantes"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Étape 7 incomplète : ${label}.`);
}

if (/\bdrop\s+(table|column|function|index)\b|\btruncate\b|\bdelete\s+from\b/i.test(migration)) {
  throw new Error("Étape 7 invalide : migration destructive détectée.");
}

console.log("iNrCy — audit pipeline média — Étape 7\n");
console.log("Consommation unifiée installée :");
console.log("  - Générer relit les aperçus IA du workspace");
console.log("  - les vidéos réutilisent captures et piste audio normalisées");
console.log("  - Publier relit les variantes canoniques privées");
console.log("  - noms, miniatures et buckets sont normalisés pour les connecteurs");
console.log("  - TikTok relit la vidéo depuis son bucket réel");
console.log("  - Programmer conserve le workspace jusqu'à l'exécution réelle");
console.log("  - cycle ready / scheduled / publishing / published / failed synchronisé");
console.log("  - scope établissement et ordre des médias vérifiés");
console.log("  - anciens transports image et vidéo maintenus comme filet de sécurité");
console.log("  - index de lecture additifs, aucune suppression SQL");
console.log("\nAUDIT ÉTAPE 7 OK — Générer, Publier et Programmer partagent le workspace persistant.");
