import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

const publishRoute = read("app/api/booster/publish-now/route.ts");
const asyncLib = read("lib/boosterAsyncPublication.ts");
const client = read("lib/boosterPublishClient.ts");
const cron = read("app/api/cron/booster-publications/route.ts");
const statusRoute = read("app/api/booster/publications/[publicationId]/status/route.ts");
const history = read("app/api/inrsend/history/route.ts");
const vercel = read("vercel.json");

test("publication creates one durable technical task per channel and returns 202", () => {
  assert.match(publishRoute, /BOOSTER_ASYNC_CHANNEL_EVENT_TYPE/);
  assert.match(publishRoute, /channelEventIds/);
  assert.match(publishRoute, /_asyncChannelDispatch: true/);
  assert.match(publishRoute, /after\(async \(\) =>/);
  assert.match(publishRoute, /\{ status: 202 \}/);
});

test("each channel has its own idempotent worker and final aggregate", () => {
  assert.match(publishRoute, /BOOSTER_ASYNC_CHANNEL_SCOPE/);
  assert.match(publishRoute, /idempotencyKey: `\$\{publicationId\}:\$\{channel\}`/);
  assert.match(publishRoute, /updateAsyncChannelEvent/);
  assert.match(publishRoute, /finalizeAsyncPublicationIfReady/);
  assert.match(asyncLib, /channelEventIds/);
  assert.match(asyncLib, /finalPayloadBase/);
  assert.match(asyncLib, /results,/);
  assert.match(asyncLib, /summary,/);
});

test("the client polls publication status instead of waiting on one long request", () => {
  assert.match(client, /pollQueuedPublication/);
  assert.match(client, /json\.queued === true/);
  assert.match(client, /\/api\/booster\/publications\/\$\{encodeURIComponent\(publicationId\)\}\/status/);
  assert.match(statusRoute, /readAsyncPublicationStatus/);
  assert.doesNotMatch(statusRoute, /finalizeAsyncPublicationIfReady/);
});

test("status reads are shared with recovery finalization and channel fan-in stays linear", () => {
  assert.match(asyncLib, /One coherent parent\/children snapshot/);
  assert.match(asyncLib, /hasPendingAsyncChannelEvent/);
  assert.match(asyncLib, /\.not\("payload->>status", "in"/);
  assert.match(asyncLib, /\.limit\(1\)/);
  assert.match(asyncLib, /_asyncFinalizationClaimId/);
  assert.match(asyncLib, /\.eq\(FINALIZATION_CLAIM_ID_PATH, params\.claimId\)/);
});

test("a one-minute cron recovers queued jobs and only stale processing workers", () => {
  assert.match(cron, /publish_async_channel|BOOSTER_ASYNC_CHANNEL_EVENT_TYPE/);
  assert.match(cron, /queuedChannelQuery/);
  assert.match(cron, /processingChannelQuery/);
  assert.match(
    cron,
    /\.eq\("payload->>status", "queued"\)[\s\S]*?\.limit\(50\)/,
  );
  assert.match(
    cron,
    /\.eq\("payload->>status", "processing"\)[\s\S]*?\.lt\("payload->>updatedAt", channelRecoveryCutoffIso\)/,
  );
  assert.match(cron, /BOOSTER_ASYNC_CHANNEL_LOCK_TTL_MS/);
  assert.match(cron, /PROCESSING_RECOVERY_GRACE_MS/);
  assert.match(vercel, /\/api\/cron\/booster-publications/);
  assert.match(vercel, /\*\/1 \* \* \* \*/);
});

test("technical async events stay hidden from iNrSend until finalization", () => {
  assert.match(history, /"publish_async_job"/);
  assert.match(history, /"publish_async_channel"/);
  assert.match(history, /payloadStatus === "partial"/);
  assert.match(history, /payloadStatus === "failed"/);
});
