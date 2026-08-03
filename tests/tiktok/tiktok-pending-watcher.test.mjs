import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const watcher = readFileSync(
  new URL("../../lib/tiktokPendingPublicationWatcher.ts", import.meta.url),
  "utf8",
);
const cronRoute = readFileSync(
  new URL("../../app/api/cron/tiktok-publications/route.ts", import.meta.url),
  "utf8",
);
const vercelConfig = JSON.parse(
  readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"),
);
const resultModal = readFileSync(
  new URL(
    "../../app/dashboard/_components/PublishExecutionResultModal.tsx",
    import.meta.url,
  ),
  "utf8",
);
const dashboardLayer = readFileSync(
  new URL(
    "../../app/dashboard/_components/DashboardBoosterModalLayer.tsx",
    import.meta.url,
  ),
  "utf8",
);
const agentExecutionHook = readFileSync(
  new URL(
    "../../app/dashboard/agent/_hooks/useAgentActionExecution.ts",
    import.meta.url,
  ),
  "utf8",
);
const mediaRoute = readFileSync(
  new URL("../../app/api/media/tiktok/route.ts", import.meta.url),
  "utf8",
);
const imagePreparation = readFileSync(
  new URL("../../lib/boosterImageServerPreparation.ts", import.meta.url),
  "utf8",
);

test("pending TikTok publications are checked by a server cron", () => {
  assert.match(watcher, /syncPendingTiktokPublications/);
  assert.match(watcher, /publication_deliveries/);
  assert.match(watcher, /\.eq\("status", "processing"\)/);
  assert.match(watcher, /fetchTiktokPublishStatus/);
  assert.match(watcher, /status\.complete/);
  assert.match(watcher, /status\.failed/);
  assert.match(watcher, /statusFetchFailed: true/);
  assert.match(watcher, /MISSING_PUBLISH_ID/);
  assert.match(cronRoute, /isAuthorizedCronRequest/);
  assert.match(cronRoute, /syncPendingTiktokPublications/);
});

test("Vercel invokes the TikTok watcher every minute", () => {
  const cron = vercelConfig.crons.find(
    (entry) => entry.path === "/api/cron/tiktok-publications",
  );
  assert.ok(cron);
  assert.equal(cron.schedule, "*/1 * * * *");
});

test("the Booster result modal follows TikTok without requiring iNrSend to stay open", () => {
  assert.match(resultModal, /tiktokPollInFlightRef/);
  assert.match(resultModal, /\/tiktok\/status/);
  assert.match(resultModal, /schedule\(8_000\)/);
  assert.match(resultModal, /PUBLISH_COMPLETE/);
  assert.match(resultModal, /setLiveSummary/);
  assert.match(dashboardLayer, /publicationId:/);
  assert.match(dashboardLayer, /result\?\.publication_id/);
  assert.match(agentExecutionHook, /publicationId:/);
  assert.match(agentExecutionHook, /publishResult/);
});

test("TikTok media pulls are observable in Vercel logs", () => {
  assert.match(mediaRoute, /\[tiktok-media\] media served/);
  assert.match(mediaRoute, /\[tiktok-media\] storage download failed/);
  assert.match(mediaRoute, /\[tiktok-media\] photo preparation failed/);
  assert.doesNotMatch(mediaRoute, /sig,\s*$/m);
});

test("TikTok photos use a cached baseline JPEG instead of progressive JPEG", () => {
  assert.match(mediaRoute, /TIKTOK_PHOTO_CACHE_VERSION/);
  assert.match(mediaRoute, /tiktokPreparedPhotoPath/);
  assert.match(mediaRoute, /meta\.isProgressive/);
  assert.match(mediaRoute, /progressive:\s*false/);
  assert.match(mediaRoute, /chromaSubsampling:\s*"4:2:0"/);
  assert.match(mediaRoute, /optimiseCoding:\s*false/);
  assert.doesNotMatch(mediaRoute, /mozjpeg:\s*true/);
  assert.doesNotMatch(mediaRoute, /progressive:\s*true/);
  assert.match(imagePreparation, /TIKTOK_CHANNEL_IMAGE_VARIANT_PIPELINE_VERSION = 9/);
  assert.match(imagePreparation, /channel === "tiktok"/);
  assert.match(imagePreparation, /progressive:\s*false/);
});

test("the TikTok watcher terminates stale jobs and rotates a wider candidate window", () => {
  assert.match(watcher, /TIKTOK_PENDING_TIMEOUT_MS = 60 \* 60 \* 1000/);
  assert.match(watcher, /PROCESSING_TIMEOUT/);
  assert.match(watcher, /processing_timeout/);
  assert.match(watcher, /status_check_count/);
  assert.match(watcher, /scanLimit/);
  assert.match(watcher, /orderedUserDeliveries/);
  assert.match(watcher, /stage: "missing_event"/);
  assert.match(watcher, /update\(\{ status: "failed", error: message \}\)/);
});

test("TikTok media delivery supports byte ranges and bypasses stale CDN bodies", () => {
  assert.match(mediaRoute, /parseTikTokByteRange/);
  assert.match(mediaRoute, /Accept-Ranges/);
  assert.match(mediaRoute, /Content-Range/);
  assert.match(mediaRoute, /status: responseStatus/);
  assert.match(mediaRoute, /responseStatus = byteRange \? 206 : 200/);
  assert.match(mediaRoute, /Vercel-CDN-Cache-Control/);
  assert.match(mediaRoute, /no-store, no-transform/);
});
