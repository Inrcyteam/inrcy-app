import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getBoosterCronSweepPlan } from "../../lib/boosterCronScheduling.ts";

const cron = readFileSync(
  new URL("../../app/api/cron/booster-publications/route.ts", import.meta.url),
  "utf8",
);

function constantNumber(name: string) {
  const match = cron.match(new RegExp(`const ${name} = (\\d+);`));
  assert.ok(match, `Missing numeric bound ${name}`);
  return Number(match[1]);
}

test("stale recovery and parent reconciliation alternate without losing either safety net", () => {
  const plans = [0, 1, 2, 3].map((minute) =>
    getBoosterCronSweepPlan(minute * 60_000),
  );
  assert.deepEqual(
    plans.map((plan) => plan.runRecoverySweep),
    [true, false, true, false],
  );
  assert.deepEqual(
    plans.map((plan) => plan.runFinalizationSweep),
    [false, true, false, true],
  );
  assert.notEqual(plans[1].finalizationAscending, plans[3].finalizationAscending);
});

test("candidate projections never download the full transport payload", () => {
  const eventProjection = cron.match(
    /const ASYNC_EVENT_CANDIDATE_COLUMNS = \[([\s\S]*?)\]\.join\(","\);/,
  );
  const channelProjection = cron.match(
    /const ASYNC_CHANNEL_CANDIDATE_COLUMNS = \[([\s\S]*?)\]\.join\(","\);/,
  );
  assert.ok(eventProjection);
  assert.ok(channelProjection);
  assert.doesNotMatch(eventProjection[1], /["']payload["']/);
  assert.doesNotMatch(channelProjection[1], /["']payload["']/);
  assert.match(cron, /ASYNC_FINALIZATION_CANDIDATE_COLUMNS = "id,user_id,created_at"/);
  assert.match(
    cron,
    /Full transport payloads are fetched by primary key only after the compact/,
  );
  assert.match(
    cron,
    /\.select\("id,user_id,payload,created_at"\)[\s\S]*\.in\("id", ids\)[\s\S]*\.limit\(params\.limit\)/,
  );
});

test("candidate and exact-load batches stay bounded", () => {
  assert.equal(constantNumber("ASYNC_CHANNEL_CANDIDATE_LIMIT"), 50);
  assert.equal(constantNumber("ASYNC_PREPARATION_CANDIDATE_LIMIT"), 25);
  assert.equal(constantNumber("ASYNC_FINALIZATION_CANDIDATE_LIMIT"), 25);
  assert.match(
    cron,
    /const ASYNC_CHANNEL_EXACT_LOAD_LIMIT = ASYNC_CHANNEL_CANDIDATE_LIMIT \* 2/,
  );
  assert.match(
    cron,
    /ASYNC_PREPARATION_EXACT_LOAD_LIMIT =\s*ASYNC_PREPARATION_CANDIDATE_LIMIT \* 2/,
  );
  assert.equal((cron.match(/loadExactAsyncEventRows\(\{/g) || []).length, 2);
});

test("a parent already handled by preparation or dispatch is not finalized twice", () => {
  assert.match(
    cron,
    /const parentsAlreadyWorking = new Set\(\[[\s\S]*preparationJobs[\s\S]*dispatchJobs/,
  );
  assert.match(
    cron,
    /!parentsAlreadyWorking\.has\(candidateKey\(row\)\)/,
  );
});
