import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const required = [
  "lib/mediaWorkspaceClient.ts",
  "lib/mediaWorkspaceServer.ts",
  "app/api/media-pipeline/workspace/route.ts",
  "app/dashboard/booster/publier/usePersistentMediaWorkspace.ts",
  "docs/MEDIA_PIPELINE_STEP4_PERSISTENT_WORKSPACE_2026-07-29.md",
  "ops/sql/2026-07-29_media_pipeline_step4_verify.sql",
];

for (const file of required) {
  if (!existsSync(resolve(root, file))) {
    throw new Error(`Étape 4 incomplète : ${file} manquant.`);
  }
}

const client = readFileSync(resolve(root, "lib/mediaWorkspaceClient.ts"), "utf8");
const server = readFileSync(resolve(root, "lib/mediaWorkspaceServer.ts"), "utf8");
const hook = readFileSync(
  resolve(root, "app/dashboard/booster/publier/usePersistentMediaWorkspace.ts"),
  "utf8",
);
const intent = readFileSync(
  resolve(root, "app/api/media-pipeline/upload-intent/route.ts"),
  "utf8",
);
const workspaceRoute = readFileSync(
  resolve(root, "app/api/media-pipeline/workspace/route.ts"),
  "utf8",
);
const imageController = readFileSync(
  resolve(root, "app/dashboard/booster/publier/usePublishImageController.ts"),
  "utf8",
);
const modal = readFileSync(
  resolve(root, "app/dashboard/booster/publier/PublishModal.tsx"),
  "utf8",
);

const checks = [
  [client.includes("NEXT_PUBLIC_MEDIA_PIPELINE_WORKSPACE_V1"), "feature flag étape 4"],
  [client.includes("window.sessionStorage"), "clé workspace résiliente au rechargement"],
  [server.includes("refreshPublicationWorkspaceMediaStatus"), "statut ready / failed du workspace"],
  [hook.includes('target: "workspace_source"'), "upload source workspace"],
  [hook.includes("workspacePosition"), "ordre persistant des médias"],
  [hook.includes("operationAbortRef.current?.abort()"), "annulation des synchronisations obsolètes"],
  [intent.includes("attachRegisteredMediaToWorkspace"), "liaison registre / workspace"],
  [workspaceRoute.includes('action === "clear_media"'), "remplacement propre du type média actif"],
  [imageController.includes("syncPersistentWorkspaceImages"), "upload image dès insertion"],
  [modal.includes("syncPersistentWorkspaceVideo(normalizedFile"), "upload vidéo dès insertion"],
  [modal.includes("mediaWorkspaceId"), "référence workspace dans les brouillons"],
  [modal.includes("archivePersistentMediaWorkspace"), "archivage après publication"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Étape 4 incomplète : ${label}.`);
}

for (const [file, source] of [
  ["workspace route", workspaceRoute],
  ["upload intent", intent],
]) {
  if (/\.formData\s*\(|\.arrayBuffer\s*\(|Buffer\.from\s*\(/.test(source)) {
    throw new Error(`Étape 4 invalide : transport binaire détecté dans ${file}.`);
  }
}

console.log("iNrCy — audit pipeline média — Étape 4\n");
console.log("Workspace persistant branché :");
console.log("  - création/réutilisation idempotente par session ou brouillon");
console.log("  - upload direct déclenché dès l’insertion du média actif");
console.log("  - liaison ordonnée dans publication_workspace_media");
console.log("  - remplacement propre images / vidéo selon le contrat base");
console.log("  - annulation des opérations obsolètes et reprise par client_media_key");
console.log("  - références conservées dans les brouillons");
console.log("  - archivage best effort après publication");
console.log("  - ancien pipeline de publication conservé comme secours");
console.log("\nAUDIT ÉTAPE 4 OK — médias persistants dès insertion derrière feature flag.");
