import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../../ops/sql/2026-07-05_multicompte_step2_scope_security.sql", import.meta.url),
  "utf8",
);

const check = readFileSync(
  new URL("../../ops/checks/2026-07-05_multicompte_step2_check.sql", import.meta.url),
  "utf8",
);

test("l'étape 2 garde subscriptions au niveau AUTH général", () => {
  assert.match(migration, /t\.relname <> 'subscriptions'/i);
  assert.match(migration, /subscriptions est explicitement exclue/i);
});

test("l'étape 2 repointe les FK user_id métier vers inrcy_accounts", () => {
  assert.match(migration, /REFERENCES public\.inrcy_accounts\(id\)/i);
  assert.match(migration, /validate constraint/i);
  assert.match(migration, /c\.confrelid = 'auth\.users'::regclass/i);
});

test("l'étape 2 remplace la RLS directe par le contrôle d'accès établissement", () => {
  assert.match(migration, /public\.inrcy_can_access_account\(user_id\)/i);
  assert.match(migration, /alter policy/i);
});

test("l'étape 2 sécurise les chemins Storage par account_id", () => {
  assert.match(migration, /inrcy_can_access_account_text/i);
  assert.match(migration, /bucket_id = 'inrcy-pro-media'/i);
  assert.match(migration, /bucket_id = 'inrbox_attachments'/i);
});

test("le check post-migration cherche les FK et policies résiduelles", () => {
  assert.match(check, /anomaly_account_fk_still_on_auth_users/i);
  assert.match(check, /pg_policies/i);
  assert.match(check, /anomaly_historical_auth_without_main_account_access/i);
});
