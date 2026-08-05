import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { resolveInrSearchMinimalStatus } from "../../lib/inrSearchMinimalStatusPolicy.ts";

const ROOT = process.cwd();
const read = (file: string) => readFileSync(resolve(ROOT, file), "utf8");

test("le statut minimal conserve les décisions publiques utiles", () => {
  const published = resolveInrSearchMinimalStatus({
    accountId: "account-1",
    inrSearch: { enabled: true, slug: "Ma Société Arras" },
    eligibility: { allowed: true, reason: "published", subscriptionStatus: "active" },
  });
  assert.equal(published.published, true);
  assert.equal(published.reason, "published");
  assert.equal(published.slug, "ma-societe-arras");
  assert.match(published.publicUrl, /\/entreprises\/ma-societe-arras$/);

  assert.equal(resolveInrSearchMinimalStatus({
    accountId: "account-1",
    inrSearch: { enabled: true, slug: "" },
  }).reason, "slug_missing");
  assert.equal(resolveInrSearchMinimalStatus({
    accountId: "account-1",
    inrSearch: { enabled: false, slug: "ma-societe" },
  }).reason, "page_disabled");
  assert.equal(resolveInrSearchMinimalStatus({
    accountId: "account-1",
    inrSearch: { enabled: true, slug: "ma-societe" },
    eligibility: { allowed: false, reason: "subscription_inactive" },
  }).reason, "subscription_inactive");
  assert.equal(resolveInrSearchMinimalStatus({
    accountId: "account-1",
    inrSearch: { enabled: true, slug: "ma-societe" },
    eligibility: { allowed: false, reason: "bubble_disabled" },
  }).reason, "bubble_disabled");
});

test("settings et analytics n'appellent plus le chargeur public lourd", () => {
  const settings = read("app/api/inr-search/settings/route.ts");
  const analytics = read("app/api/inr-search/analytics/route.ts");
  const minimal = read("lib/inrSearchMinimalStatus.ts");

  for (const source of [settings, analytics]) {
    assert.match(source, /getInrSearchMinimalPublicStatus/);
    assert.doesNotMatch(source, /getInrSearchPublicStatus/);
    assert.doesNotMatch(source, /loadInrSearchPublicPage/);
  }
  assert.doesNotMatch(minimal, /app_events/);
  assert.doesNotMatch(minimal, /loadInrSearchPublicPage/);
  assert.doesNotMatch(minimal, /createSafeStorageSignedUrl|probeStorageObject/);
});

test("le panneau réglages se rafraîchit sur reprise utilisateur sans poll permanent", () => {
  const panel = read(
    "app/dashboard/settings/_components/InrSearchSettingsContent.tsx",
  );
  assert.doesNotMatch(panel, /setInterval\(/);
  assert.match(panel, /loadInFlightRef/);
  assert.match(panel, /lastLoadStartedAtRef/);
  assert.match(panel, /window\.addEventListener\("focus", refresh\)/);
  assert.match(panel, /document\.addEventListener\("visibilitychange", refresh\)/);
});
