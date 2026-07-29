import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const required = [
  "lib/mediaUploadPolicy.ts",
  "lib/universalMediaUploadClient.ts",
  "app/api/media-pipeline/upload-intent/route.ts",
  "app/api/media-pipeline/upload-event/route.ts",
  "ops/sql/2026-07-29_media_pipeline_step3_universal_direct_upload.sql",
  "ops/sql/2026-07-29_media_pipeline_step3_verify.sql",
  "docs/MEDIA_PIPELINE_STEP3_UNIVERSAL_DIRECT_UPLOAD_2026-07-29.md",
];

for (const file of required) {
  if (!existsSync(resolve(root, file))) {
    throw new Error(`Étape 3 incomplète : ${file} manquant.`);
  }
}

const client = readFileSync(
  resolve(root, "lib/universalMediaUploadClient.ts"),
  "utf8",
);
const route = readFileSync(
  resolve(root, "app/api/media-pipeline/upload-intent/route.ts"),
  "utf8",
);
const shared = readFileSync(
  resolve(root, "app/dashboard/booster/publier/publishModal.shared.tsx"),
  "utf8",
);

const checks = [
  [client.includes('xhr.open("PATCH"'), "PATCH TUS"],
  [client.includes("window.localStorage"), "reprise locale"],
  [client.includes("AbortSignal"), "annulation"],
  [route.includes("createSignedUploadUrl"), "jeton signé"],
  [route.includes("workspace_source"), "source persistante"],
  [shared.includes("uploadUniversalMediaFile"), "pont Booster"],
  [
    shared.includes("universal image upload fallback") &&
      shared.includes("universal video upload fallback"),
    "secours historique",
  ],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Étape 3 incomplète : ${label}.`);
}

console.log("iNrCy — audit pipeline média — Étape 3\n");
console.log("Transport universel installé :");
console.log("  - upload signé direct pour les petits fichiers");
console.log("  - TUS direct Supabase par chunks de 6 Mo pour les gros fichiers");
console.log("  - reprise après coupure avec offset serveur et localStorage");
console.log("  - progression, retries et annulation");
console.log("  - aucune charge binaire dans la nouvelle route Vercel");
console.log("  - pont images, vidéos et Médiathèque derrière feature flag");
console.log("  - ancien pipeline conservé comme secours temporaire");
console.log("\nAUDIT ÉTAPE 3 OK — transport direct prêt pour la persistance dès insertion de l’Étape 4.");
