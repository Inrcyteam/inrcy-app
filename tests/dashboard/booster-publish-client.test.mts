import assert from "node:assert/strict";
import test from "node:test";

import {
  BOOSTER_PUBLISH_RESULT_GRACE_MS,
  createBoosterPublishIdempotencyKey,
  postBoosterPublication,
} from "../../lib/boosterPublishClient.ts";

test("publication retries a lost mobile response with the same idempotency key", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  let attempt = 0;
  const result = await postBoosterPublication(
    { channels: ["facebook"], origin: { source: "booster_manual" } },
    {
      sleepImpl: async () => undefined,
      fetchImpl: async (_input, init) => {
        bodies.push(JSON.parse(String(init?.body || "{}")));
        attempt += 1;
        if (attempt === 1) throw new TypeError("Failed to fetch");
        return new Response(
          JSON.stringify({ ok: true, summary: { successCount: 1 } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  );

  assert.equal((result.summary as Record<string, unknown> | undefined)?.successCount, 1);
  assert.equal(bodies.length, 2);
  assert.ok(String(bodies[0]?.idempotencyKey || "").startsWith("booster_manual:"));
  assert.equal(bodies[0]?.idempotencyKey, bodies[1]?.idempotencyKey);
  assert.equal(
    (bodies[0]?.origin as Record<string, unknown>)?.idempotencyKey,
    bodies[0]?.idempotencyKey,
  );
});

test("publication reuses the same lock while the first server execution is still running", async () => {
  const keys: string[] = [];
  let attempt = 0;
  const result = await postBoosterPublication(
    { channels: ["instagram"] },
    {
      sleepImpl: async () => undefined,
      fetchImpl: async (_input, init) => {
        const body = JSON.parse(String(init?.body || "{}"));
        keys.push(String(body.idempotencyKey || ""));
        attempt += 1;
        if (attempt === 1) {
          return new Response(JSON.stringify({ error: "timeout" }), {
            status: 504,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (attempt === 2) {
          return new Response(
            JSON.stringify({
              ok: false,
              idempotencyPending: true,
              code: "execution_already_running",
              retryAfterSeconds: 60,
            }),
            { status: 425, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({ ok: true, idempotent: true, summary: { successCount: 1 } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  );

  assert.equal((result.summary as Record<string, unknown> | undefined)?.successCount, 1);
  assert.equal(new Set(keys).size, 1);
});

test("final mobile network failure warns that the send may still be running", async () => {
  await assert.rejects(
    postBoosterPublication(
      { channels: ["gmb"] },
      {
        maxAttempts: 2,
        sleepImpl: async () => undefined,
        fetchImpl: async () => {
          throw new TypeError("NetworkError");
        },
      },
    ),
    /iNr’Send avant de relancer/,
  );
});

test("idempotency keys stay scoped to manual Booster publishing", () => {
  assert.match(createBoosterPublishIdempotencyKey(), /^booster_manual:/);
});


test("queued publication returns immediately when every channel finishes before the grace window", async () => {
  let now = 0;
  let statusCalls = 0;
  const progressStages: string[] = [];
  const progressPendingCounts: number[] = [];
  const result = await postBoosterPublication(
    { channels: ["facebook", "linkedin"] },
    {
      maxAttempts: 1,
      nowImpl: () => now,
      sleepImpl: async (ms) => {
        now += ms;
      },
      onProgress: (update) => {
        progressStages.push(update.stage);
        const summary = update.payload.summary as
          | Record<string, unknown>
          | undefined;
        if (summary && Number.isFinite(Number(summary.pendingCount))) {
          progressPendingCounts.push(Number(summary.pendingCount));
        }
      },
      fetchImpl: async (input, init) => {
        if (String(input) === "/api/booster/publish-now") {
          return new Response(
            JSON.stringify({
              ok: true,
              queued: true,
              publication_id: "11111111-1111-4111-8111-111111111111",
            }),
            { status: 202, headers: { "Content-Type": "application/json" } },
          );
        }
        assert.equal(init?.method, "GET");
        statusCalls += 1;
        if (statusCalls === 1) {
          return new Response(
            JSON.stringify({
              ok: true,
              queued: true,
              done: false,
              summary: { successCount: 1, failureCount: 0, pendingCount: 1 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            ok: true,
            queued: false,
            done: true,
            summary: { successCount: 2, failureCount: 0, pendingCount: 0 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  );

  assert.equal((result.summary as Record<string, unknown>)?.successCount, 2);
  assert.equal(result.done, true);
  assert.equal(result.releasedToBackground, undefined);
  assert.equal(now, 4_500);
  assert.deepEqual(progressStages, [
    "request_accepted",
    "status_update",
    "completed",
  ]);
  assert.deepEqual(progressPendingCounts, [1, 0]);
});

test("queued publication caps the normal visible wait at 60 seconds and preserves the partial balance", async () => {
  let now = 0;
  let statusCalls = 0;
  const progressStages: string[] = [];
  const result = await postBoosterPublication(
    { channels: ["site", "inr_search", "facebook", "linkedin", "instagram", "gmb", "pinterest", "youtube_shorts", "tiktok", "wordpress"] },
    {
      maxAttempts: 1,
      nowImpl: () => now,
      sleepImpl: async (ms) => {
        now += ms;
      },
      onProgress: (update) => progressStages.push(update.stage),
      fetchImpl: async (input) => {
        if (String(input) === "/api/booster/publish-now") {
          return new Response(
            JSON.stringify({
              ok: true,
              queued: true,
              publication_id: "22222222-2222-4222-8222-222222222222",
            }),
            { status: 202, headers: { "Content-Type": "application/json" } },
          );
        }
        statusCalls += 1;
        return new Response(
          JSON.stringify({
            ok: true,
            queued: true,
            done: false,
            summary: {
              total: 10,
              successCount: 8,
              failureCount: 0,
              pendingCount: 2,
              entries: [],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  );

  assert.equal(BOOSTER_PUBLISH_RESULT_GRACE_MS, 60_000);
  assert.equal(now, BOOSTER_PUBLISH_RESULT_GRACE_MS);
  assert.equal(statusCalls, 10);
  assert.equal(result.done, false);
  assert.equal(result.releasedToBackground, true);
  assert.equal((result.summary as Record<string, unknown>)?.successCount, 8);
  assert.equal((result.summary as Record<string, unknown>)?.pendingCount, 2);
  assert.equal(progressStages[0], "request_accepted");
  assert.equal(progressStages.at(-1), "released_to_background");
  assert.equal(
    progressStages.filter((stage) => stage === "status_update").length,
    statusCalls,
  );
});

test("the initial queued acknowledgement is included in the visible balance window", async () => {
  let now = 0;
  const result = await postBoosterPublication(
    { channels: ["instagram", "tiktok"] },
    {
      maxAttempts: 1,
      nowImpl: () => now,
      sleepImpl: async (ms) => {
        now += ms;
      },
      fetchImpl: async (input) => {
        if (String(input) === "/api/booster/publish-now") {
          now += 4_000;
          return new Response(
            JSON.stringify({
              ok: true,
              queued: true,
              publication_id: "33333333-3333-4333-8333-333333333333",
              summary: {
                total: 2,
                successCount: 0,
                failureCount: 0,
                pendingCount: 2,
                entries: [],
              },
            }),
            { status: 202, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            ok: true,
            queued: true,
            done: false,
            summary: {
              total: 2,
              successCount: 1,
              failureCount: 0,
              pendingCount: 1,
              entries: [],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  );

  assert.equal(now, BOOSTER_PUBLISH_RESULT_GRACE_MS);
  assert.equal(result.releasedToBackground, true);
  assert.equal((result.summary as Record<string, unknown>)?.pendingCount, 1);
});
