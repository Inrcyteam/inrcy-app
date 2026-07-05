import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../../lib/multicompte/server.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("../../lib/multicompte/client.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../../app/api/multicompte/active-account/route.ts", import.meta.url), "utf8");
const requireUser = readFileSync(new URL("../../lib/requireUser.ts", import.meta.url), "utf8");
const browserCache = readFileSync(new URL("../../lib/browserAccountCache.ts", import.meta.url), "utf8");

test("l'étape 3 sépare authUserId et activeUserId côté serveur", () => {
  assert.match(server, /authUserId:\s*user\.id/);
  assert.match(server, /activeUserId:\s*activeAccount\.id/);
  assert.match(server, /resolveInrcyAccountScopeForUser/);
});

test("l'étape 3 valide l'établissement actif avant d'écrire le cookie", () => {
  assert.match(route, /listAccessibleInrcyAccounts/);
  assert.match(route, /accounts\.some\(\(account\) => account\.id === accountId\)/);
  assert.match(route, /response\.cookies\.set\(ACTIVE_INRCY_ACCOUNT_COOKIE/);
});

test("l'étape 3 conserve le fallback historique auth uid = user_id", () => {
  assert.match(server, /resolveActiveInrcyAccount\(user\.id, accounts, requestedAccountId\)/);
  assert.match(client, /pickDefaultAccount\(accounts, authUser\.id\)/);
});

test("requireUser expose maintenant le scope actif sans casser l'ancien user", () => {
  assert.match(requireUser, /user:\s*data\.user/);
  assert.match(requireUser, /authUserId:\s*data\.user\.id/);
  assert.match(requireUser, /activeUserId:\s*accountScope\.activeUserId/);
});

test("le cache navigateur continue d'utiliser le même cookie historique inrcy_uid", () => {
  assert.match(browserCache, /ACTIVE_USER_COOKIE\s*=\s*ACTIVE_INRCY_ACCOUNT_COOKIE/);
  assert.match(browserCache, /ACTIVE_USER_STORAGE_KEY\s*=\s*ACTIVE_INRCY_ACCOUNT_STORAGE_KEY/);
});
