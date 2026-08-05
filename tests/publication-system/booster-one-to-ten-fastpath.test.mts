import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

const modal = read("app/dashboard/booster/publier/PublishModal.tsx");
const workspace = read(
  "app/dashboard/booster/publier/usePersistentMediaWorkspace.ts",
);
const publishRoute = read("app/api/booster/publish-now/route.ts");
const generationRoute = read("app/api/booster/generate/route.ts");
const aiPolicy = read("lib/aiGatewayPolicy.ts");
const asyncPublication = read("lib/boosterAsyncPublication.ts");
const migration = read(
  "ops/sql/2026-08-05_publication_realtime_load_hardening.sql",
);
const propulserMetrics = read("app/api/propulser/metrics/route.ts");

test("generation targets 30 seconds with one shared 45 second safety deadline", () => {
  assert.match(modal, /BOOSTER_GENERATION_TARGET_MS = 30_000/);
  assert.match(
    modal,
    /BOOSTER_GENERATION_SAFETY_BUDGET_MS\s*=\s*BOOSTER_GENERATION_TARGET_MS \+ 15_000/,
  );
  assert.match(modal, /generationDeadlineAt/);
  assert.match(modal, /controller\.abort\(\)/);
  assert.doesNotMatch(
    modal,
    /hasVideoForGeneration\s*&&\s*videoFile\s*&&\s*!videoAiContextRef\s*&&\s*!mediaPipelineCutoverEnabled/,
  );
  assert.match(
    generationRoute,
    /routeStartedAt \+ BOOSTER_GENERATION_SAFETY_BUDGET_MS/,
  );
  assert.match(
    generationRoute,
    /retries:\s*0,[\s\S]*timeoutMs:\s*transcriptionTimeoutMs/,
  );
  assert.match(
    aiPolicy,
    /"booster\.publish"[\s\S]*maxTimeoutMs:\s*42_000[\s\S]*defaultOperationMaxDurationMs:\s*45_000/,
  );
});

test("the click path waits for upload then performs one source-readiness snapshot", () => {
  assert.match(workspace, /persistProgress:\s*false/);
  assert.match(workspace, /synchronizing/);
  assert.match(modal, /await waitForPersistentWorkspaceIdle/);
  assert.match(modal, /await verifyPersistentWorkspaceSources/);
  assert.match(modal, /return activeWorkspaceId/);
  assert.doesNotMatch(modal, /preparePersistentAiMedia/);
  assert.doesNotMatch(modal, /preparePersistentPublicationMedia/);
});

test("publication isolates red channels and dispatches the ready subset for one or ten channels", () => {
  assert.match(modal, /const preflightFailedChannels = reviewItems/);
  assert.match(
    modal,
    /const publishableChannels = reviewItems[\s\S]*item\.blockers\.length === 0/,
  );
  assert.match(modal, /Publication parallèle sur/);
  assert.match(modal, /preflightFailedChannels,/);
  assert.match(
    publishRoute,
    /after\(async \(\) => \{[\s\S]*Promise\.allSettled\([\s\S]*queuedChannelRows\.map/,
  );
  assert.match(
    publishRoute,
    /usesOriginalSource && sourceDirectlyPublishable[\s\S]*return \[\]/,
  );
  assert.match(publishRoute, /enqueueBoosterPublication\(/);
  assert.match(
    publishRoute,
    /return NextResponse\.json\(ingress\.response, \{ status: 202 \}\)/,
  );
});

test("workers claim before uploads and patch status atomically", () => {
  const claim = publishRoute.indexOf("const channelExecution = await acquireExecutionIdempotencyLock");
  const upload = publishRoute.indexOf("const { imageSet: baseImageSet, uploadErrors } = await uploadImageSet");
  assert.ok(claim >= 0 && upload >= 0 && claim < upload);
  assert.match(asyncPublication, /inrcy_patch_app_event_payload/);
  assert.match(migration, /create or replace function public\.inrcy_patch_app_event_payload/);
});

test("dashboard metrics exclude publication payloads from their query", () => {
  assert.match(
    propulserMetrics,
    /\.in\("type", \["valorize", "review_mail", "promo_mail"\]\)/,
  );
  assert.match(migration, /app_events_propulser_metrics_user_created_idx/);
});
