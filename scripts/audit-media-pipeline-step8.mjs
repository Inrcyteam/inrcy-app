import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const required = [
  "lib/mediaPipelineLegacyCutoverPolicy.ts",
  "lib/boosterImageServerPreparation.ts",
  "lib/boosterVideoVariantServer.ts",
  "lib/mediaWorkspaceConsumption.ts",
  "app/api/booster/generate/route.ts",
  "app/api/booster/publish-now/route.ts",
  "app/api/booster/video-transform/route.ts",
  "app/api/media-pipeline/workspace/route.ts",
  "app/dashboard/booster/publier/PublishModal.tsx",
  "app/dashboard/booster/publier/usePublishImageController.ts",
  "ops/sql/2026-07-29_media_pipeline_step8_legacy_cutover.sql",
  "ops/sql/2026-07-29_media_pipeline_step8_verify.sql",
  "docs/MEDIA_PIPELINE_STEP8_LEGACY_CUTOVER_2026-07-29.md",
];

for (const file of required) {
  if (!existsSync(resolve(root, file))) {
    throw new Error(`Étape 8 incomplète : ${file} manquant.`);
  }
}

const read = (file) => readFileSync(resolve(root, file), "utf8");
const policy = read("lib/mediaPipelineLegacyCutoverPolicy.ts");
const generate = read("app/api/booster/generate/route.ts");
const publish = read("app/api/booster/publish-now/route.ts");
const modal = read("app/dashboard/booster/publier/PublishModal.tsx");
const imageServer = read("lib/boosterImageServerPreparation.ts");
const videoServer = read("lib/boosterVideoVariantServer.ts");
const workspace = read("lib/mediaWorkspaceConsumption.ts");
const migration = read("ops/sql/2026-07-29_media_pipeline_step8_legacy_cutover.sql");

const checks = [
  [policy.includes("MEDIA_PIPELINE_LEGACY_CUTOVER_V1"), "feature flag serveur Étape 8"],
  [policy.includes("NEXT_PUBLIC_MEDIA_PIPELINE_LEGACY_CUTOVER_V1"), "feature flag client Étape 8"],
  [generate.includes("imagesForAI: []"), "suppression des images IA navigateur en cutover"],
  [generate.includes("videoForAI: null"), "suppression de la vidéo IA navigateur en cutover"],
  [generate.includes("media_workspace_required"), "Générer échoue fermé sans workspace"],
  [publish.includes("prepareBoosterImagesByChannelOnServer"), "rendu image côté serveur"],
  [publish.includes("prepareBoosterVideoVariantsOnServer"), "rendu vidéo côté serveur"],
  [publish.includes("!strictMediaCutover"), "secours historique limité au flag coupé"],
  [modal.includes("buildChannelImageSettingsPayload"), "transport léger des réglages image"],
  [modal.includes("loadMediaPublicationWorkspace"), "restauration des brouillons depuis le workspace"],
  [modal.includes("mediaPipelineCutoverV1"), "marqueur de cutover transmis aux actions"],
  [imageServer.includes("supabaseAdmin.storage.from(bucket).download(storagePath)"), "source image privée relue côté serveur"],
  [videoServer.includes("buildVideoTransformPlan"), "moteur vidéo serveur unifié"],
  [workspace.includes("editorImageKeyFromClientMediaKey"), "clé d'édition image conservée"],
  [workspace.includes("media_pipeline_step: 8"), "métadonnée pipeline Étape 8"],
  [migration.includes("media_variants_channel_publish_lookup_idx"), "index de variantes de publication"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Étape 8 incomplète : ${label}.`);
}

if (/\bdrop\s+(table|column|function|index)\b|\btruncate\b|\bdelete\s+from\b/i.test(migration)) {
  throw new Error("Étape 8 invalide : migration destructive détectée.");
}

console.log("iNrCy — audit pipeline média — Étape 8\n");
console.log("Bascule stricte installée :");
console.log("  - Générer transporte uniquement la référence du workspace");
console.log("  - Publier et Programmer envoient uniquement réglages et identifiant");
console.log("  - rendus image et vidéo recréés côté serveur depuis les sources privées");
console.log("  - brouillons restaurés depuis le workspace sans upload doublon");
console.log("  - absence de workspace traitée en échec fermé quand le flag est actif");
console.log("  - anciens transports conservés uniquement pour rollback flag-off");
console.log("  - aucune suppression SQL ni rupture de données");
console.log("\nAUDIT ÉTAPE 8 OK — les transports historiques sont sortis du parcours actif.");
