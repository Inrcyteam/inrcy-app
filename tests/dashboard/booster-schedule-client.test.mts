import assert from "node:assert/strict";
import test from "node:test";

import {
  createBoosterScheduleRequestId,
  postBoosterScheduledAction,
} from "../../lib/boosterScheduleClient.ts";

test("la programmation réessaie avec le même UUID et ne crée qu'une action", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  let attempt = 0;
  const result = await postBoosterScheduledAction(
    { scheduledAt: "2026-08-08T10:00:00.000Z", channels: ["facebook"] },
    {
      sleepImpl: async () => undefined,
      fetchImpl: async (_input, init) => {
        bodies.push(JSON.parse(String(init?.body || "{}")));
        attempt += 1;
        if (attempt === 1) throw new TypeError("Load failed");
        return new Response(
          JSON.stringify({
            scheduledAction: { id: bodies[0].scheduleRequestId },
            idempotent: true,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  );

  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].scheduleRequestId, bodies[1].scheduleRequestId);
  assert.match(
    String(bodies[0].scheduleRequestId),
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  assert.equal(
    (result.scheduledAction as Record<string, unknown>).id,
    bodies[0].scheduleRequestId,
  );
});

test("une réponse POST perdue est récupérée en lecture sans nouvelle programmation", async () => {
  let postCalls = 0;
  let recoveryReads = 0;
  const result = await postBoosterScheduledAction(
    { scheduledAt: "2026-08-08T11:00:00.000Z", channels: ["linkedin"] },
    {
      maxAttempts: 1,
      sleepImpl: async () => undefined,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url === "/api/agent/scheduled-actions") {
          postCalls += 1;
          throw new TypeError("NetworkError when attempting to fetch resource");
        }
        recoveryReads += 1;
        return new Response(
          JSON.stringify({
            scheduledAction: {
              id: new URL(`https://app.inrcy.com${url}`).searchParams.get(
                "requestId",
              ),
              status: "scheduled",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  );

  assert.equal(postCalls, 1);
  assert.equal(recoveryReads, 1);
  assert.equal(result.recoveredAfterTransportLoss, true);
  assert.equal(
    (result.scheduledAction as Record<string, unknown>).status,
    "scheduled",
  );
});

test("un conflit concurrent est accepté seulement si le même UUID existe", async () => {
  let requestId = "";
  let postCalls = 0;
  let recoveryReads = 0;
  const result = await postBoosterScheduledAction(
    { scheduledAt: "2026-08-08T12:00:00.000Z", channels: ["pinterest"] },
    {
      maxAttempts: 1,
      maxRecoveryAttempts: 1,
      sleepImpl: async () => undefined,
      fetchImpl: async (input, init) => {
        const url = String(input);
        if (url === "/api/agent/scheduled-actions") {
          postCalls += 1;
          requestId = String(
            JSON.parse(String(init?.body || "{}")).scheduleRequestId || "",
          );
          return new Response(
            JSON.stringify({ error: "Programmation similaire détectée" }),
            { status: 409, headers: { "Content-Type": "application/json" } },
          );
        }
        recoveryReads += 1;
        return new Response(
          JSON.stringify({
            scheduledAction: { id: requestId, status: "scheduled" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  );

  assert.equal(postCalls, 1);
  assert.equal(recoveryReads, 1);
  assert.equal(result.recoveredAfterTransportLoss, true);
  assert.equal(
    (result.scheduledAction as Record<string, unknown>).id,
    requestId,
  );
});

test("une connexion suspendue déclenche la récupération du reçu", async () => {
  let recoveryReads = 0;
  const result = await postBoosterScheduledAction(
    { scheduledAt: "2026-08-08T13:00:00.000Z", channels: ["youtube_shorts"] },
    {
      maxAttempts: 1,
      maxRecoveryAttempts: 1,
      requestTimeoutMs: 5,
      recoveryTimeoutMs: 50,
      sleepImpl: async () => undefined,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url === "/api/agent/scheduled-actions") {
          return await new Promise<Response>(() => undefined);
        }
        recoveryReads += 1;
        const requestId = new URL(`https://app.inrcy.com${url}`).searchParams.get(
          "requestId",
        );
        return new Response(
          JSON.stringify({
            scheduledAction: { id: requestId, status: "scheduled" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  );

  assert.equal(recoveryReads, 1);
  assert.equal(result.recoveredAfterTransportLoss, true);
});

test("le générateur d'identifiant reste compatible avec les navigateurs modernes", () => {
  assert.match(
    createBoosterScheduleRequestId(),
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
});
