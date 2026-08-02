import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

test("AI Gateway 404 falls back immediately instead of retrying the same missing route or model", () => {
  const client = read("lib/aiGatewayClient.ts");
  const fallback = read("lib/aiGenerationFallback.ts");

  assert.match(client, /status === 404 \|\| status >= 500/);
  assert.match(client, /retryStatuses: \[408, 500, 502, 503, 504\]/);
  assert.doesNotMatch(client, /retryStatuses: \[404,/);
  assert.match(client, /basculer immédiatement vers le moteur de secours/);
  assert.match(fallback, /\[404, 408, 500, 502, 503, 504\]\.includes\(status\)/);
});

test("provider not-found errors never become a misleading business-resource message", () => {
  const apiErrors = read("lib/apiUserFacingErrors.ts");
  assert.match(apiErrors, /code === "ai_gateway_unavailable" \|\| code === "ai_gateway_request_failed"/);
  assert.match(apiErrors, /Ce moteur IA est temporairement indisponible/);
  assert.match(apiErrors, /if \(code === "ai_gateway_request_failed"\) return 503/);
});
