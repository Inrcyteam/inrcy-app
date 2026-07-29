import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const MIGRATION = "ops/sql/2026-07-29_media_pipeline_step2_universal_registry.sql";
const sql = readFileSync(resolve(ROOT, MIGRATION), "utf8");

function assertSql(pattern, message) {
  assert.match(sql, pattern, `${message} (${MIGRATION})`);
}

function extractCreateTableBody(table) {
  const marker = `create table if not exists public.${table} (`;
  const start = sql.toLowerCase().indexOf(marker.toLowerCase());
  assert.ok(start >= 0, `Table ${table} introuvable`);
  let depth = 0;
  let quote = false;
  const bodyStart = start + marker.length;
  for (let index = bodyStart; index < sql.length; index += 1) {
    const char = sql[index];
    const previous = sql[index - 1];
    if (char === "'" && previous !== "\\") quote = !quote;
    if (quote) continue;
    if (char === "(") depth += 1;
    if (char === ")") {
      if (depth === 0) return sql.slice(bodyStart, index);
      depth -= 1;
    }
  }
  assert.fail(`Fin de CREATE TABLE ${table} introuvable`);
}

function topLevelDefinitions(body) {
  const definitions = [];
  let current = "";
  let depth = 0;
  let quote = false;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    const previous = body[index - 1];
    if (char === "'" && previous !== "\\") quote = !quote;
    if (!quote && char === "(") depth += 1;
    if (!quote && char === ")") depth -= 1;
    if (!quote && depth === 0 && char === ",") {
      definitions.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) definitions.push(current.trim());
  return definitions;
}

test("la migration étape 2 est additive et transactionnelle", () => {
  assertSql(/^begin;/m, "La migration doit démarrer dans une transaction");
  assertSql(/^commit;/m, "La migration doit terminer la transaction");
  assert.doesNotMatch(sql, /drop\s+table/i);
  assert.doesNotMatch(sql, /drop\s+column/i);
  assert.doesNotMatch(sql, /truncate\s+/i);
});

test("pro_media_library devient un registre universel sans casser user_id", () => {
  assertSql(
    /account_id\s+uuid\s+generated\s+always\s+as\s*\(user_id\)\s+stored/i,
    "account_id doit rester un alias généré non destructif",
  );
  assertSql(/upload_status\s+text\s+not null\s+default 'uploaded'/i, "Statut d'upload manquant");
  assertSql(/upload_progress\s+smallint\s+not null\s+default 100/i, "Progression d'upload historique manquante");
  assertSql(/upload_protocol\s+text/i, "Protocole d'upload manquant");
  assertSql(/client_media_key\s+text/i, "Clé d'idempotence média manquante");
  assertSql(/processing_status\s+text\s+not null\s+default 'not_requested'/i, "Statut de traitement manquant");
  assertSql(/publication_status\s+text\s+not null\s+default 'legacy_ready'/i, "Compatibilité des médias historiques manquante");
  assertSql(/canonical_storage_path\s+text/i, "Chemin canonique manquant");
  assertSql(/content_hash_sha256\s+text/i, "Empreinte du média manquante");
  assertSql(/pipeline_version\s+integer\s+not null\s+default 0/i, "Version historique du pipeline manquante");
  assertSql(
    /foreign key \(user_id\)\s+references public\.inrcy_accounts\(id\)/i,
    "user_id doit référencer le compte métier pour les établissements secondaires",
  );
  assertSql(/INRCY_MEDIA_ACCOUNT_IMMUTABLE/i, "Le compte d'un média doit être immuable");
});

test("les quatre briques de données du pipeline sont présentes", () => {
  for (const table of [
    "publication_workspaces",
    "publication_workspace_media",
    "media_variants",
    "media_processing_jobs",
  ]) {
    assertSql(
      new RegExp(`create table if not exists public\\.${table}\\s*\\(`, "i"),
      `Table ${table} manquante`,
    );
    assertSql(
      new RegExp(`alter table public\\.${table} enable row level security`, "i"),
      `RLS manquante sur ${table}`,
    );
  }
});

test("la base impose 5 images ou 1 vidéo avec cohérence de compte", () => {
  assertSql(/position\s+between\s+0\s+and\s+4/i, "Les cinq positions image ne sont pas bornées");
  assertSql(/pg_advisory_xact_lock/i, "La concurrence d'ajout média n'est pas sérialisée");
  assertSql(/v_existing_count\s*>=\s*5/i, "La limite de cinq images n'est pas imposée");
  assertSql(/v_media_type\s*=\s*'video'/i, "Le contrat vidéo n'est pas contrôlé");
  assertSql(/v_existing_count\s*>\s*0/i, "La vidéo unique n'est pas imposée");
  assertSql(/INRCY_MEDIA_CROSS_ACCOUNT_LINK_DENIED/i, "Le lien cross-account n'est pas bloqué");
});

test("les variantes et jobs sont idempotents et préparés pour un worker", () => {
  assertSql(/pro_media_library_account_client_media_key_uidx/i, "Déduplication de création média manquante");
  assertSql(/media_variants_signature_uidx/i, "Index de signature variante manquant");
  assertSql(/media_processing_jobs_idempotency_uidx/i, "Index d'idempotence job manquant");
  assertSql(/media_processing_jobs_claim_idx/i, "Index de claim worker manquant");
  assertSql(/lock_expires_at\s+timestamptz/i, "Lease worker manquante");
  assertSql(/attempt_count\s+integer\s+not null\s+default 0/i, "Compteur de tentatives manquant");
  assertSql(/max_attempts\s+integer\s+not null\s+default 5/i, "Maximum de tentatives manquant");
});

test("les droits sont fail-closed pour les sorties worker", () => {
  assertSql(/grant select on public\.media_variants to authenticated/i, "Lecture des variantes manquante");
  assertSql(/grant select on public\.media_processing_jobs to authenticated/i, "Lecture des jobs manquante");
  assert.doesNotMatch(sql, /grant\s+(?:all|insert|update|delete)[^;]*media_processing_jobs\s+to\s+authenticated/i);
  assert.doesNotMatch(sql, /grant\s+(?:all|insert|update|delete)[^;]*media_variants\s+to\s+authenticated/i);
  assertSql(/using \(public\.inrcy_can_access_account\(account_id\)\)/i, "Scope établissement manquant");
});


test("les nouvelles tables ne contiennent aucune colonne dupliquée", () => {
  for (const table of [
    "publication_workspaces",
    "publication_workspace_media",
    "media_variants",
    "media_processing_jobs",
  ]) {
    const columnNames = topLevelDefinitions(extractCreateTableBody(table))
      .filter((definition) => !/^(constraint|primary\s+key|unique|check|foreign\s+key)\b/i.test(definition))
      .map((definition) => definition.split(/\s+/)[0].replaceAll('"', ""));
    assert.equal(
      new Set(columnNames).size,
      columnNames.length,
      `Colonne dupliquée dans ${table}: ${columnNames.join(", ")}`,
    );
  }
});
