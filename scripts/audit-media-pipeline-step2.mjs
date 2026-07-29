import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const files = {
  migration: "ops/sql/2026-07-29_media_pipeline_step2_universal_registry.sql",
  model: "lib/mediaPipelineRegistry.ts",
  verification: "ops/sql/2026-07-29_media_pipeline_step2_verify.sql",
  documentation: "docs/MEDIA_PIPELINE_STEP2_UNIVERSAL_REGISTRY_2026-07-29.md",
  schemaTest: "tests/media-pipeline/media-pipeline-registry-schema.test.mjs",
  modelTest: "tests/media-pipeline/media-pipeline-registry-model.test.mts",
};

const missing = Object.values(files).filter((file) => !existsSync(resolve(ROOT, file)));
if (missing.length > 0) {
  console.error("ÉCHEC AUDIT ÉTAPE 2 — fichiers absents :");
  for (const file of missing) console.error(`  - ${file}`);
  process.exit(1);
}

const migration = readFileSync(resolve(ROOT, files.migration), "utf8");
const model = readFileSync(resolve(ROOT, files.model), "utf8");
const violations = [];

function requirePattern(source, pattern, label) {
  if (!pattern.test(source)) violations.push(label);
}

for (const table of [
  "publication_workspaces",
  "publication_workspace_media",
  "media_variants",
  "media_processing_jobs",
]) {
  requirePattern(
    migration,
    new RegExp(`create table if not exists public\\.${table}`, "i"),
    `Table ${table} absente`,
  );
  requirePattern(
    migration,
    new RegExp(`alter table public\\.${table} enable row level security`, "i"),
    `RLS absente sur ${table}`,
  );
}

requirePattern(
  migration,
  /account_id\s+uuid\s+generated\s+always\s+as\s*\(user_id\)\s+stored/i,
  "Alias account_id non destructif absent",
);
requirePattern(migration, /legacy_ready/i, "Compatibilité historique legacy_ready absente");
requirePattern(migration, /pg_advisory_xact_lock/i, "Verrou concurrent du contrat média absent");
requirePattern(migration, /media_variants_signature_uidx/i, "Déduplication des variantes absente");
requirePattern(migration, /media_processing_jobs_idempotency_uidx/i, "Idempotence des jobs absente");
requirePattern(migration, /INRCY_MEDIA_CROSS_ACCOUNT_LINK_DENIED/i, "Protection cross-account absente");

requirePattern(model, /MEDIA_WORKSPACE_MAX_IMAGES\s*=\s*5/, "Contrat TypeScript 5 images absent");
requirePattern(model, /MEDIA_WORKSPACE_MAX_VIDEOS\s*=\s*1/, "Contrat TypeScript 1 vidéo absent");
requirePattern(model, /validateWorkspaceMediaContract/, "Validateur TypeScript absent");
requirePattern(model, /isMediaReadyForPurpose/, "Contrôle de disponibilité absent");

if (/drop\s+table|drop\s+column|truncate\s+/i.test(migration)) {
  violations.push("La migration contient une opération destructive");
}

console.log("iNrCy — audit pipeline média — Étape 2\n");
console.log("Socle ajouté :");
console.log("  - pro_media_library enrichie sans renommage ni suppression");
console.log("  - publication_workspaces");
console.log("  - publication_workspace_media");
console.log("  - media_variants");
console.log("  - media_processing_jobs");
console.log("  - RLS établissement et contrôles cross-account");
console.log("  - contrat SQL + TypeScript : 5 images OU 1 vidéo");
console.log("  - aucun parcours runtime Booster basculé");

if (violations.length > 0) {
  console.error("\nÉCHEC AUDIT ÉTAPE 2 :");
  for (const violation of violations) console.error(`  - ${violation}`);
  process.exitCode = 1;
} else {
  console.log("\nAUDIT ÉTAPE 2 OK — registre universel prêt, migration additive et comportement de production inchangé.");
}
