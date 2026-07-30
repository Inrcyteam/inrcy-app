import assert from "node:assert/strict";
import test from "node:test";

import {
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

  assert.equal((result.summary as any)?.successCount, 1);
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

  assert.equal((result.summary as any)?.successCount, 1);
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
