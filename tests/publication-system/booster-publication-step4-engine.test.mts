import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { decidePublicationMedia } from "../../lib/boosterPublicationMediaDecision.ts";

test("the idempotent engine reuses, waits, prefers original, then prepares minimally", () => {
  assert.equal(decidePublicationMedia({ readyVariant: true }).action, "reuse_ready");
  assert.equal(decidePublicationMedia({ preparationInProgress: true }).action, "wait");
  assert.equal(decidePublicationMedia({ sourceCompatible: true }).action, "use_original");
  assert.equal(decidePublicationMedia({ sourceCompatible: false }).action, "prepare_minimal");
  assert.equal(decidePublicationMedia({ sourceCompatible: false, preparationPossible: false }).action, "block_channel");
});

test("publish-now no longer imposes a network variant when the original validates", () => {
  const route = readFileSync("app/api/booster/publish-now/route.ts", "utf8");
  assert.doesNotMatch(route, /requiresPreparedNetworkVideoVariant/);
  assert.match(route, /if \(sourceValidation\.ok\) \{\s*return \[\];\s*\}/);
  assert.match(route, /invalidVideoChannels\.forEach/);
  assert.match(route, /setPreflightFailure\(invalid\.channel/);
});
