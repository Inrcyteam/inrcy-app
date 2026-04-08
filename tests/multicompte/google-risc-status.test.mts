import test from "node:test";
import assert from "node:assert/strict";
import { buildGoogleRiscStatusFromRows, emptyGoogleRiscStatus } from "../../lib/security/googleRiscTestables";

test("emptyGoogleRiscStatus retourne un état vierge", () => {
  assert.deepEqual(emptyGoogleRiscStatus(), {
    site_inrcy: { ga4: false, gsc: false },
    site_web: { ga4: false, gsc: false },
    gmb: false,
    gmail: false,
  });
});

test("buildGoogleRiscStatusFromRows sépare bien site iNrCy, site web, GMB et Gmail", () => {
  const status = buildGoogleRiscStatusFromRows([
    { source: "site_inrcy", product: "ga4", meta: { risc: { reauth_required: true } } },
    { source: "site_web", product: "gsc", meta: { risc: { reauth_required: true } } },
    { source: "gmb", product: "gmb", meta: { risc: { reauth_required: true } } },
    { source: "mailbox", product: "gmail", meta: { risc: { reauth_required: true } } },
    { source: "site_web", product: "ga4", meta: { risc: { reauth_required: false } } },
  ]);

  assert.equal(status.site_inrcy.ga4, true);
  assert.equal(status.site_inrcy.gsc, false);
  assert.equal(status.site_web.ga4, false);
  assert.equal(status.site_web.gsc, true);
  assert.equal(status.gmb, true);
  assert.equal(status.gmail, true);
});
