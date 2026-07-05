import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  b64urlJsonDecode,
  b64urlJsonEncode,
  makeOAuthState,
  verifyOAuthState,
} from "../../lib/security.ts";

function read(relativePath: string) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

function integrationRouteFiles(kind: "start" | "callback") {
  const root = fileURLToPath(new URL("../../app/api/integrations", import.meta.url));
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name, kind, "route.ts"))
    .filter((file) => {
      try {
        return readFileSync(file, "utf8").includes(kind === "start" ? "makeOAuthState" : "verifyOAuthState");
      } catch {
        return false;
      }
    });
}

const multicompteServer = read("lib/multicompte/server.ts");
const requireUser = read("lib/requireUser.ts");
const tabSync = read("app/dashboard/_components/ActiveAccountTabSync.tsx");
const dashboardLayout = read("app/dashboard/layout.tsx");
const finalMigration = read("ops/sql/2026-07-05_multicompte_step6_final_hardening.sql");
const finalCheck = read("ops/checks/2026-07-05_multicompte_step6_final_check.sql");
const agentClient = read("app/dashboard/agent/AgentClient.tsx");
const templateAttachmentPicker = read("app/dashboard/_components/TemplateAttachmentPicker.tsx");
const mailboxClient = read("app/dashboard/mails/MailboxClient.tsx");
const multicompteClient = read("lib/multicompte/client.ts");
const accountDeletion = read("lib/deleteUserAccount.ts");
const loyaltyAwardRoute = read("app/api/loyalty/award/route.ts");
const dashboardClient = read("app/dashboard/DashboardClient.tsx");

test("le cookie OAuth est lié à tout le state, y compris l'établissement", () => {
  const accountId = "11111111-1111-4111-8111-111111111111";
  const created = makeOAuthState("step6_test", "/dashboard", { accountId });
  const request = new Request("https://inrcy.test/callback", {
    headers: { cookie: `${created.cookieName}=${encodeURIComponent(created.cookieValue)}` },
  });

  const valid = verifyOAuthState<{ accountId?: string }>(request, "step6_test", created.stateB64);
  assert.equal(valid.ok, true);
  if (valid.ok) assert.equal(valid.state.accountId, accountId);

  const decoded = b64urlJsonDecode<Record<string, unknown>>(created.stateB64);
  assert.ok(decoded);
  const tampered = b64urlJsonEncode({
    ...decoded,
    accountId: "22222222-2222-4222-8222-222222222222",
  });
  const rejected = verifyOAuthState(request, "step6_test", tampered);
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.reason, "state_mismatch");
});

test("les anciens cookies OAuth nonce-only restent acceptés pendant la transition", () => {
  const created = makeOAuthState("step6_legacy", "/dashboard", {
    accountId: "11111111-1111-4111-8111-111111111111",
  });
  const request = new Request("https://inrcy.test/callback", {
    headers: { cookie: `${created.cookieName}=${encodeURIComponent(created.nonce)}` },
  });
  assert.equal(verifyOAuthState(request, "step6_legacy", created.stateB64).ok, true);
});

test("tous les départs OAuth lient le state et le cookie à l'établissement actif", () => {
  const files = integrationRouteFiles("start");
  assert.ok(files.length >= 10, `départs OAuth détectés: ${files.length}`);
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /makeOAuthState\([\s\S]*accountId/, file);
    assert.match(source, /cookieValue/, file);
    assert.doesNotMatch(source, /cookies\.set\([^\n]*,\s*nonce\s*,/, file);
  }
});

test("tous les callbacks OAuth résolvent l'établissement figé dans le state", () => {
  const files = integrationRouteFiles("callback");
  assert.ok(files.length >= 10, `callbacks OAuth détectés: ${files.length}`);
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /resolveOAuthBoundInrcyAccountId/, file);
    assert.doesNotMatch(source, /resolveActiveInrcyAccountId/, file);
  }
});

test("la résolution serveur des comptes est fail-closed et vérifie l'appartenance OAuth", () => {
  assert.match(multicompteServer, /INRCY_ACCOUNT_SCOPE_UNAVAILABLE/);
  assert.match(multicompteServer, /INRCY_ACCOUNT_SCOPE_MISSING/);
  assert.match(multicompteServer, /resolveOAuthBoundInrcyAccountId/);
  assert.match(multicompteServer, /INRCY_ACCOUNT_ACCESS_DENIED/);
  assert.doesNotMatch(multicompteServer, /return \[pickDefaultAccount\(\[\], authUserId\)\]/);
});

test("requireUser refuse proprement un scope établissement indisponible", () => {
  assert.match(requireUser, /account_scope_unavailable/);
  assert.match(requireUser, /status:\s*503/);
});

test("les onglets se resynchronisent après une bascule d'établissement", () => {
  assert.match(tabSync, /ACTIVE_INRCY_ACCOUNT_STORAGE_KEY/);
  assert.match(tabSync, /addEventListener\("storage"/);
  assert.match(tabSync, /purgeAllBrowserAccountCaches/);
  assert.match(tabSync, /window\.location\.reload\(\)/);
  assert.match(dashboardLayout, /<ActiveAccountTabSync\s*\/>/);
});



test("les résolutions client et la suppression RGPD échouent fermées si le scope est incomplet", () => {
  assert.match(multicompteClient, /INRCY_ACCOUNT_SCOPE_UNAVAILABLE/);
  assert.match(multicompteClient, /INRCY_ACCOUNT_SCOPE_MISSING/);
  assert.doesNotMatch(multicompteClient, /return \[pickDefaultAccount\(\[\], authUserId\)\]/);

  assert.match(accountDeletion, /INRCY_ACCOUNT_DELETE_SCOPE_UNAVAILABLE/);
  assert.match(accountDeletion, /INRCY_ACCOUNT_DELETE_SCOPE_INCOMPLETE/);
  assert.doesNotMatch(accountDeletion, /catch\s*\{\s*return \[authUserId\]/);
});

test("les pièces jointes iNrAgent, modèles et Mails utilisent l'établissement actif", () => {
  for (const source of [agentClient, templateAttachmentPicker, mailboxClient]) {
    assert.match(source, /resolveActiveBrowserUserId/);
  }
  assert.doesNotMatch(agentClient, /const userId = auth\?\.user\?\.id \|\| null/);
  assert.doesNotMatch(templateAttachmentPicker, /const userId = auth\?\.user\?\.id \|\| null/);
  assert.doesNotMatch(mailboxClient, /const userId = auth\?\.user\?\.id(?: \|\| null)?;/);
  assert.match(mailboxClient, /user_id:\s*userId/);
  assert.match(mailboxClient, /\.eq\("user_id", userId\)/);
});

test("la migration finale répare le socle sans créer d'abonnement secondaire", () => {
  assert.match(finalMigration, /insert into public\.inrcy_accounts/i);
  assert.match(finalMigration, /insert into public\.inrcy_account_members/i);
  assert.match(finalMigration, /insert into public\.inrcy_multi_account_config/i);
  assert.match(finalMigration, /insert into public\.profiles/i);
  assert.doesNotMatch(finalMigration, /insert into public\.subscriptions/i);
});

test("le check final couvre isolation, quota, RLS et absence d'abonnement secondaire", () => {
  assert.match(finalCheck, /anomaly_secondary_account_with_subscription/i);
  assert.match(finalCheck, /anomaly_business_fk_still_targets_auth_users/i);
  assert.match(finalCheck, /anomaly_direct_auth_uid_rls/i);
  assert.match(finalCheck, /anomaly_quota_below_account_count/i);
  assert.match(finalCheck, /anomaly_missing_access_function/i);
});

test("les recompenses UI et le bootstrap dashboard suivent l'etablissement actif", () => {
  assert.match(loyaltyAwardRoute, /resolveActiveInrcyAccountId/);
  assert.match(loyaltyAwardRoute, /awardInertiaActionForUser/);
  assert.doesNotMatch(loyaltyAwardRoute, /rpc\(\s*["']award_inertia_action["']/);

  assert.match(dashboardClient, /\/api\/multicompte\/accounts/);
  assert.doesNotMatch(dashboardClient, /setActiveBrowserUserId\(user\.id\)/);
  assert.doesNotMatch(dashboardClient, /setActiveBrowserUserId\(nextUserId\)/);
});
