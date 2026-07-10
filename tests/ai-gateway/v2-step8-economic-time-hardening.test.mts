import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

test("V2 step 8 reserves Gateway capacity atomically across concurrent calls", () => {
  const guard = read("lib/aiGatewayAccountGuard.ts");
  assert.match(guard, /RESERVE_ATTEMPT_SCRIPT/);
  assert.match(guard, /COMMIT_ATTEMPT_SCRIPT/);
  assert.match(guard, /ROLLBACK_ATTEMPT_SCRIPT/);
  assert.match(guard, /reserved_calls/);
  assert.match(guard, /reserved_input/);
  assert.match(guard, /reserved_output/);
  assert.match(guard, /reserved_cost_microusd/);
  assert.match(guard, /redis as any\)\.eval\(/);
  assert.match(guard, /commitAiGatewayAccountAttempt/);
  assert.match(guard, /rollbackAiGatewayAccountAttempt/);
});

test("V2 step 8 monetary protection never silently becomes zero when model pricing is missing", () => {
  const economics = read("lib/aiGatewayEconomics.ts");
  const client = read("lib/aiGatewayClient.ts");
  assert.match(economics, /conservative_fallback/);
  assert.match(economics, /DEFAULT_FALLBACK_GUARD_PRICING/);
  assert.match(economics, /resolveAiGatewayGuardPricing/);
  assert.match(client, /conservative guard pricing active/);
  assert.doesNotMatch(economics, /if \(!pricing\) return 0/);
});

test("V2 step 8 applies one hard deadline across media, primary generation and repair", () => {
  const booster = read("lib/boosterPublishGeneration.ts");
  const media = read("lib/aiMediaUnderstanding.ts");
  const client = read("lib/aiGatewayClient.ts");
  const fetch = read("lib/observability/fetch.ts");
  assert.match(booster, /operationDeadlineAt = budget\.startedAt \+ budget\.maxDurationMs/);
  assert.match(booster, /deadlineAt: operationDeadlineAt/);
  assert.match(media, /deadlineAt: args\.deadlineAt/);
  assert.match(client, /hardDeadlineAt/);
  assert.match(fetch, /deadlineAt\?: number/);
  assert.match(fetch, /FetchDeadlineExceededError/);
});

test("V2 step 8 prevents technical primary failures from triggering a repair cascade", () => {
  const booster = read("lib/boosterPublishGeneration.ts");
  const client = read("lib/aiGatewayClient.ts");
  assert.match(booster, /ai_gateway_unavailable/);
  assert.match(booster, /500\|502\|503\|504/);
  assert.match(client, /retryStatuses: \[408, 500, 502, 503, 504\]/);
  assert.doesNotMatch(client, /retryStatuses: \[[^\]]*429/);
});

test("V2 step 8 makes user quota semantics explicit and independent from channel count", () => {
  const quota = read("lib/aiUsageQuota.ts");
  const route = read("app/api/booster/generate/route.ts");
  assert.match(quota, /AI_QUOTA_UNIT_MODEL/);
  assert.match(quota, /channelCountMultiplier: false/);
  assert.match(quota, /quota_model: "media_weighted_action"/);
  assert.match(quota, /channel_count_multiplier: false/);
  assert.doesNotMatch(route, /credits:\s*channels\.length/);
});

test("V2 step 8 exposes guard outages and operation deadlines as typed service errors", () => {
  const guard = read("lib/aiGatewayAccountGuard.ts");
  const apiErrors = read("lib/apiUserFacingErrors.ts");
  assert.match(guard, /ai_gateway_guard_unavailable/);
  assert.match(apiErrors, /ai_gateway_guard_unavailable/);
  assert.match(apiErrors, /ai_operation_deadline_exceeded/);
  assert.match(apiErrors, /return 504/);
});
