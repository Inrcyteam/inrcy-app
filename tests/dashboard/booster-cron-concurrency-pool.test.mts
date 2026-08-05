import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  runAsyncTaskPool,
  type AsyncTask,
} from "../../lib/asyncTaskPool.ts";

const cron = readFileSync(
  new URL("../../app/api/cron/booster-publications/route.ts", import.meta.url),
  "utf8",
);

test("the Booster cron uses one explicit six-task cap for all three lots", () => {
  assert.match(cron, /const BOOSTER_CRON_TASK_CONCURRENCY = 6;/);
  assert.match(
    cron,
    /const taskGroups = \[\s*preparationTasks,\s*dispatchTasks,\s*finalizationTasks,\s*\];/,
  );
  assert.match(
    cron,
    /runAsyncTaskPool\(\s*tasks,\s*BOOSTER_CRON_TASK_CONCURRENCY,\s*\)/,
  );
  assert.doesNotMatch(cron, /Promise\.allSettled\(/);
  assert.match(
    cron,
    /preparationJobs\.map\(\s*\(job\) => \(\) => dispatchPreparationJob/,
  );
  assert.match(
    cron,
    /dispatchJobs\.map\(\s*\(job\) => \(\) => dispatchChannelJob/,
  );
  assert.match(
    cron,
    /finalizationJobs\.map\(\(job\) => \{\s*return async \(\) => \{\s*await finalizeAsyncPublicationIfReady/,
  );
});

test("the pool never starts more than six tasks and preserves settled order", async () => {
  let active = 0;
  let maximumActive = 0;
  let releaseWave!: () => void;
  const wave = new Promise<void>((resolve) => {
    releaseWave = resolve;
  });
  const started: number[] = [];

  const tasks = Array.from({ length: 24 }, (_, index): AsyncTask<number> =>
    async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      started.push(index);
      await wave;
      active -= 1;
      if (index === 7) throw new Error("isolated failure");
      return index;
    },
  );

  const run = runAsyncTaskPool(tasks, 6);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(active, 6);
  assert.deepEqual(started, [0, 1, 2, 3, 4, 5]);

  releaseWave();
  const results = await run;

  assert.equal(maximumActive, 6);
  assert.equal(results.length, tasks.length);
  assert.deepEqual(results[0], { status: "fulfilled", value: 0 });
  assert.equal(results[7].status, "rejected");
  assert.deepEqual(results[23], { status: "fulfilled", value: 23 });
});

test("the pool rejects invalid concurrency instead of running unbounded", async () => {
  await assert.rejects(
    runAsyncTaskPool([async () => 1], 0),
    /positive integer/,
  );
});
