import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("tous les parcours de creation applicatifs provisionnent Bubble Access", () => {
  for (const path of [
    "app/api/public/trial-signup/route.ts",
    "app/api/admin/create-trial/route.ts",
    "app/api/multicompte/accounts/route.ts",
  ]) {
    assert.match(read(path), /provisionNewAccountBubbleAccess\(/, path);
  }
});

test("le provisioning canonique applique les valeurs par defaut", () => {
  const source = read("lib/appBubbleAccessProvisioning.ts");
  assert.match(source, /createDefaultBubbleAccessRows\(accountId\)/);
  assert.match(source, /upsert\(rows, \{ onConflict: "user_id,bubble_key" \}\)/);
});

test("la migration Supabase conserve Site iNrCy en opt-in", () => {
  const sql = read("ops/sql/2026-07-26_site_inrcy_opt_in_new_accounts.sql");
  assert.match(sql, /\(new\.id, 'site_inrcy', false\)/);
  assert.match(sql, /\(new\.id, 'pinterest', true\)/);
  assert.match(sql, /after insert on public\.inrcy_accounts/i);
  assert.match(sql, /zzzz_inrcy_seed_new_account_bubble_access/);
});

test("la migration Pinterest Standard active les comptes existants et futurs sans ouvrir Site iNrCy", () => {
  const sql = read("ops/sql/2026-07-27_app_bubble_access_pinterest_enabled.sql");
  assert.match(sql, /select account\.id, 'pinterest', true/i);
  assert.match(sql, /on conflict \(user_id, bubble_key\) do update\s+set enabled = true/i);
  assert.match(sql, /\(new\.id, 'pinterest', true\)/);
  assert.match(sql, /\(new\.id, 'site_inrcy', false\)/);
  assert.doesNotMatch(sql, /update\s+public\.app_bubble_access\s+set\s+enabled\s*=\s*true\s+where\s+enabled/i);
});
