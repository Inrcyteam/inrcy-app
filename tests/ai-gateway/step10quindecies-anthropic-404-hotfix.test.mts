import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

test("Claude uses the current Haiku model supported by Vercel AI Gateway Responses", () => {
  const engines = read("lib/aiEnginePreference.ts");
  const policy = read("lib/aiGatewayPolicy.ts");

  assert.match(engines, /anthropic\/claude-haiku-4\.5/);
  assert.match(policy, /anthropic\/claude-haiku-4\.5/);
  assert.doesNotMatch(engines, /anthropic\/claude-3\.5-haiku/);
  assert.doesNotMatch(policy, /anthropic\/claude-3\.5-haiku/);
});

test("a full AI Gateway endpoint in env is normalized back to a base URL", () => {
  const config = read("lib/aiGatewayConfig.ts");

  assert.match(config, /replace\(\/\\\/chat\\\/completions\$\/i, ""\)/);
  assert.match(config, /replace\(\/\\\/responses\$\/i, ""\)/);
  assert.match(config, /responses\/responses/);
  assert.match(config, /chat\/completions\/responses/);
});

test("provider error details are logged privately and 404 remains eligible for fallback", () => {
  const client = read("lib/aiGatewayClient.ts");
  const fallback = read("lib/aiGenerationFallback.ts");

  assert.match(client, /detail: safeDetail \|\| undefined/);
  assert.match(fallback, /code === "ai_gateway_unavailable"/);
  assert.match(fallback, /\[404, 408, 500, 502, 503, 504\]\.includes\(status\)/);
});
