import assert from "node:assert/strict";
import test from "node:test";

import {
  DashboardRefreshHttpError,
  DashboardRefreshPausedError,
  resetDashboardRefreshOrchestratorForTests,
  runSharedDashboardRefresh,
} from "../../lib/dashboardRefreshOrchestrator.ts";

test("dashboard refreshes are globally serialized and recent values are reused", async () => {
  resetDashboardRefreshOrchestratorForTests();
  const timeline: string[] = [];

  const first = runSharedDashboardRefresh("stats:google", async () => {
    timeline.push("first:start");
    await new Promise((resolve) => setTimeout(resolve, 15));
    timeline.push("first:end");
    return 1;
  });
  const second = runSharedDashboardRefresh("metrics:google", async () => {
    timeline.push("second:start");
    timeline.push("second:end");
    return 2;
  });

  assert.deepEqual(await Promise.all([first, second]), [1, 2]);
  assert.deepEqual(timeline, ["first:start", "first:end", "second:start", "second:end"]);

  let reruns = 0;
  const reused = await runSharedDashboardRefresh("stats:google", async () => {
    reruns += 1;
    return 3;
  }, { reuseMs: 30_000 });
  assert.equal(reused, 1);
  assert.equal(reruns, 0);
});

test("a 429 pauses every heavy dashboard refresh", async () => {
  resetDashboardRefreshOrchestratorForTests();

  await assert.rejects(
    runSharedDashboardRefresh("stats:facebook", async () => {
      throw new DashboardRefreshHttpError(429, "Too many requests");
    }, { pauseAfter429Ms: 5_000 }),
    DashboardRefreshHttpError,
  );

  await assert.rejects(
    runSharedDashboardRefresh("metrics:instagram", async () => 1),
    DashboardRefreshPausedError,
  );
});
