import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

function assertBefore(source: string, first: RegExp, second: RegExp, message: string) {
  const firstMatch = source.match(first);
  const secondMatch = source.match(second);
  assert.ok(firstMatch?.index !== undefined, `Missing first marker: ${first}`);
  assert.ok(secondMatch?.index !== undefined, `Missing second marker: ${second}`);
  assert.ok(firstMatch.index < secondMatch.index, message);
}

const route = read("app/api/booster/publish-now/route.ts");
const foundations = read("app/api/booster/publish-now/publishNow.foundations.ts");
const channelContext = read(
  "app/api/booster/publish-now/publishNow.channel-context.ts",
);
const asyncPublication = read("lib/boosterAsyncPublication.ts");
const statusRoute = read(
  "app/api/booster/publications/[publicationId]/status/route.ts",
);
const recoveryCron = read("app/api/cron/booster-publications/route.ts");
const executionIdempotency = read("lib/executionIdempotency.ts");

const channelMarkers = [
  'ch === "inrcy_site"',
  'ch === "site_web"',
  'ch === "inr_search"',
  'ch === "gmb"',
  'ch === "facebook"',
  'ch === "instagram"',
  'ch === "linkedin"',
  'ch === "tiktok"',
  'ch === "youtube_shorts"',
  'ch === "pinterest"',
];

test("publish-now keeps user auth, rate limiting and cron-only async dispatch", () => {
  assert.match(route, /isAuthorizedCronRequest\(req\)/);
  assert.match(route, /getCronUserIdFromRequest\(req\)/);
  assert.match(route, /requireUser\(\)/);
  assert.match(route, /name:\s*"booster_publish"/);
  assert.match(route, /limit:\s*20/);
  assert.match(route, /internalAsyncRequested && !internalAsyncDispatch/);
  assert.match(route, /code:\s*"async_dispatch_unauthorized"/);
  assert.match(route, /selected\.length !== 1/);
  assert.match(route, /code:\s*"async_dispatch_invalid"/);
});

test("strict media cutover consumes the workspace and never silently falls back", () => {
  assert.match(route, /resolveWorkspacePublicationConsumption\(/);
  assert.match(route, /body\.mediaPipelineCutoverV1 === true/);
  assert.match(route, /isLegacyMediaTransportCutoverEnabled\(\)/);
  assert.match(route, /code:\s*"media_workspace_required"/);
  assert.match(route, /code:\s*"workspace_media_mismatch"/);
  assert.match(route, /if \(strictMediaCutover\) \{[\s\S]*return NextResponse\.json/);
  assert.match(route, /consumptionSource:\s*strictMediaCutover\s*\?\s*"workspace_cutover_v1"/);
});

test("server image preparation must cover every selected image channel", () => {
  assert.match(route, /prepareBoosterImagesByChannelOnServer\(/);
  assert.match(route, /channels:\s*imageChannels/);
  assert.match(route, /workspaceId:\s*mediaWorkspaceId/);
  assert.match(route, /imageChannels\.forEach\(/);
  assert.match(route, /code:\s*"workspace_image_preparation_failed"/);
  assert.match(route, /pickCompleteChannelImageUrls/);
  assert.match(channelContext, /never borrow a fallback from another channel/i);
});

test("video publication keeps the request path fast and isolates invalid channels", () => {
  assert.match(route, /prepareBoosterVideoVariantsOnServer\(/);
  assert.match(route, /preparePublicationVariants\(false\)/);
  assert.doesNotMatch(route, /preparePublicationVariants\(true\)/);
  assert.match(route, /buildVideoTransformSignature\(/);
  assert.match(route, /validateVideoPublicationForChannel\(/);
  assert.match(route, /canPublishVideoSourceDirectly\(/);
  assert.doesNotMatch(route, /requiresPreparedNetworkVideoVariant\(/);
  assert.match(route, /preflightFailuresByChannel/);
  assert.match(route, /buildBoosterPublicationDispatchPlan\(/);
  assert.match(route, /if \(sourceValidation\.ok\) \{\s*return \[\];\s*\}/);
});

test("scheduled duplicate protection runs before parent idempotency acquisition", () => {
  assert.match(route, /findSimilarUpcomingScheduledPublication\(/);
  assert.match(route, /IMMEDIATE_PUBLISH_DUPLICATE_LOOKAHEAD_MINUTES/);
  assert.match(route, /skipScheduledDuplicateCheck !== true/);
  assert.match(route, /allowDuplicateImmediatePublish !== true/);
  assert.match(route, /code:\s*"scheduled_publication_duplicate"/);
  assertBefore(
    route,
    /findSimilarUpcomingScheduledPublication\(/,
    /acquireExecutionIdempotencyLock\(\{/,
    "duplicate detection must happen before acquiring the parent lock",
  );
});

test("parent idempotency replays completed executions and blocks concurrent retries", () => {
  assert.match(foundations, /PUBLISH_IDEMPOTENCY_SCOPE = "booster_publish"/);
  assert.match(foundations, /PUBLISH_IDEMPOTENCY_TTL_MS = 30 \* 60 \* 1000/);
  assert.match(route, /buildCompletedExecutionResponse\(publishIdempotency\.lock\)/);
  assert.match(route, /buildRunningExecutionResponse\(publishIdempotency\.lock\)/);
  assert.match(route, /status:\s*425/);
  assert.match(route, /"Retry-After":\s*"60"/);
  assert.match(executionIdempotency, /status:\s*"running"/);
  assert.match(executionIdempotency, /status:\s*"completed"/);
  assert.match(executionIdempotency, /status:\s*"failed"/);
});

test("the parent request persists the publication and queued deliveries before dispatch", () => {
  assert.match(route, /\.from\("publications"\)[\s\S]*\.insert\(publicationInsert\)/);
  assert.match(route, /const deliveries = channelPreflightPlan\.entries\.map/);
  assert.match(route, /status:\s*entry\.status/);
  assert.match(route, /error:\s*entry\.result/);
  assert.match(route, /\.from\("publication_deliveries"\)[\s\S]*\.insert\(deliveries\)/);
  assertBefore(
    route,
    /\.from\("publications"\)[\s\S]*?\.insert\(publicationInsert\)/,
    /type:\s*BOOSTER_ASYNC_JOB_EVENT_TYPE/,
    "publication persistence must precede async job creation",
  );
});

test("async fan-out creates one technical event per channel and strips workspace transport", () => {
  assert.match(route, /const channelEventIds = Object\.fromEntries/);
  assert.match(route, /BOOSTER_ASYNC_JOB_EVENT_TYPE/);
  assert.match(route, /BOOSTER_ASYNC_CHANNEL_EVENT_TYPE/);
  assert.match(route, /channels:\s*\[channel\]/);
  assert.match(route, /mediaWorkspaceId:\s*undefined/);
  assert.match(route, /mediaWorkspaceClientKey:\s*undefined/);
  assert.match(route, /mediaPipelineCutoverV1:\s*false/);
  assert.match(route, /images:\s*\[\]/);
  assert.match(route, /imagesByChannel:\s*\{[\s\S]*preparedImagesByChannel\[channel\]/);
  assert.match(route, /const queuedChannelRows = channelRows\.filter/);
  assert.match(route, /payload:\s*preflightFailure/);
  assert.match(route, /status:\s*"failed"/);
  assert.match(route, /status:\s*"queued"/);
  assert.match(route, /after\(async \(\) =>/);
  assert.match(route, /\{ status:\s*202 \}/);
});

test("each async channel worker owns an independent lock and durable delivery state", () => {
  assert.match(route, /scope:\s*BOOSTER_ASYNC_CHANNEL_SCOPE/);
  assert.match(route, /idempotencyKey:\s*`\$\{publicationId\}:\$\{channel\}`/);
  assert.match(route, /BOOSTER_ASYNC_CHANNEL_LOCK_TTL_MS/);
  assert.match(route, /status:\s*"processing"/);
  assert.match(route, /updateAsyncChannelEvent\(/);
  assert.match(route, /finalizeAsyncPublicationIfReady\(/);
  assert.match(recoveryCron, /BOOSTER_ASYNC_CHANNEL_LOCK_TTL_MS/);
  assert.match(recoveryCron, /PROCESSING_RECOVERY_GRACE_MS/);
  assert.match(recoveryCron, /MAX_ASYNC_DISPATCH_ATTEMPTS/);
  assert.match(recoveryCron, /async_dispatch_exhausted/);
});

test("all ten supported channels keep an explicit server branch", () => {
  for (const marker of channelMarkers) {
    assert.ok(route.includes(marker), `missing channel branch: ${marker}`);
  }
  assert.match(route, /facebookPublishVideoToPage|facebookPublishToPage/);
  assert.match(route, /instagramPublishVideoWithTokenFallback|instagramPublishPhotoWithTokenFallback/);
  assert.match(route, /linkedinPublishVideo|linkedinPublishMultiImage|linkedinPublishText/);
  assert.match(route, /tiktokDirectPostVideoFileUpload|tiktokDirectPostPhotos/);
  assert.match(route, /uploadYoutubeShort/);
  assert.match(route, /createPinterestVideoPin|createPinterestImagePin/);
  assert.match(route, /gmbCreateLocalPost/);
});

test("channel completion updates delivery, event, lock and aggregate finalization", () => {
  assert.match(route, /const channelResult = Object\.keys\(asRecord\(results\[channel\]\)\)\.length/);
  assert.match(route, /code:\s*"missing_channel_result"/);
  assert.match(route, /status:\s*channelSucceeded \? "completed" : "failed"/);
  assert.match(route, /completeExecutionIdempotencyLock\(\{/);
  assert.match(route, /finalizeAsyncPublicationIfReady\(\{/);
  assert.match(route, /finalized:\s*finalization\.finalized === true/);
});

test("final aggregation never increments business events when every channel failed", () => {
  assert.match(route, /const summary = buildResultsSummary\(results, selected\)/);
  assert.match(route, /if \(summary\.successCount <= 0\)/);
  assert.match(route, /failureStage:\s*"publish_results"/);
  assert.match(route, /failExecutionIdempotencyLock\(\{/);
  assert.match(route, /channels:\s*summary\.successChannels/);
  assertBefore(
    route,
    /if \(summary\.successCount <= 0\)/,
    /Log publication \/ valorisation event uniquement après succès réel/,
    "the all-failed guard must precede the final business event",
  );
});

test("successful and partial publications finalize workspace and parent lock once", () => {
  assert.match(route, /syncMediaWorkspaceLifecycle\("published"/);
  assert.match(route, /successfulChannels:\s*summary\.successChannels/);
  assert.match(route, /completeExecutionIdempotencyLock\(\{[\s\S]*result:\s*responsePayload/);
  assert.match(asyncPublication, /finalStatus = summary\.allFailed[\s\S]*"partial"/);
  assert.match(asyncPublication, /summary\.allFailed[\s\S]*failExecutionIdempotencyLock/);
  assert.match(asyncPublication, /completeExecutionIdempotencyLock\(\{/);
  assert.match(asyncPublication, /channel events are purely technical/i);
  assert.match(asyncPublication, /\.delete\(\)[\s\S]*BOOSTER_ASYNC_CHANNEL_EVENT_TYPE/);
});

test("unhandled async channel exceptions still close all durable state", () => {
  assert.match(route, /if \(asyncFailureContext\)/);
  assert.match(route, /code:\s*"async_channel_unhandled_exception"/);
  assert.match(route, /publication_deliveries"\)[\s\S]*status:\s*"failed"/);
  assert.match(route, /updateAsyncChannelEvent\(\{/);
  assert.match(route, /completeExecutionIdempotencyLock\(\{/);
  assert.match(route, /finalizeAsyncPublicationIfReady\(\{/);
});

test("status polling reads the async aggregate instead of rerunning publication", () => {
  assert.match(statusRoute, /readAsyncPublicationStatus\(/);
  assert.match(asyncPublication, /export async function readAsyncPublicationStatus/);
  assert.match(asyncPublication, /pendingCount/);
  assert.match(asyncPublication, /TERMINAL_CHANNEL_STATUSES/);
  assert.match(asyncPublication, /type !== BOOSTER_ASYNC_JOB_EVENT_TYPE/);
});
