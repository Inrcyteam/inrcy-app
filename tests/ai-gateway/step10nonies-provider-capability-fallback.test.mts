import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

test("400/409/422 only trigger fallback for model or provider capability errors", () => {
  const fallback = read("lib/aiGenerationFallback.ts");
  assert.match(fallback, /\[400, 409, 422\]\.includes\(status\)/);
  assert.match(fallback, /PROVIDER_CAPABILITY_ERROR_PATTERNS/);
  assert.match(fallback, /unsupported .*parameter/);
  assert.match(fallback, /json schema/);
  assert.match(fallback, /model.*does not support/);
  assert.match(fallback, /context length/);
  assert.match(fallback, /reason: "provider_incompatible"/);
});

test("ordinary invalid payload errors remain ineligible and do not cascade", () => {
  const fallback = read("lib/aiGenerationFallback.ts");
  assert.match(fallback, /if \(!\[400, 409, 422\]\.includes\(status\)\) return false/);
  assert.match(fallback, /if \(!normalized\) return false/);
  assert.match(fallback, /return \{ eligible: false, skipGatewayModelFallback: false, reason: "transport_error" \}/);
});


test("ordinary 400/409/422 errors have an honest dedicated user-facing code", () => {
  const client = read("lib/aiGatewayClient.ts");
  const apiErrors = read("lib/apiUserFacingErrors.ts");
  assert.match(client, /\[400, 409, 422\]\.includes\(status\)[\s\S]*?ai_gateway_invalid_request/);
  assert.match(apiErrors, /code === "ai_gateway_invalid_request"/);
  assert.match(apiErrors, /Les moteurs IA disponibles n’ont pas pu traiter cette demande/);
  assert.match(apiErrors, /if \(code === "ai_gateway_invalid_request"\) return 502/);
});
