import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { AI_FEATURE_POLICIES } from "../../lib/aiGatewayPolicy.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

test("Booster and iNrAgent prompts keep enough headroom after multi-AI expansion", () => {
  assert.ok(AI_FEATURE_POLICIES["booster.publish"].maxInputChars >= 72_000);
  assert.ok(AI_FEATURE_POLICIES["agent.publish"].maxInputChars >= 72_000);
});

test("V2 multichannel budget allows one primary call and one targeted repair only", () => {
  assert.equal(AI_FEATURE_POLICIES["booster.publish"].defaultOperationMaxCalls, 2);
  assert.equal(AI_FEATURE_POLICIES["agent.publish"].defaultOperationMaxCalls, 2);
  assert.ok(AI_FEATURE_POLICIES["booster.publish"].defaultOperationMaxReservedOutputTokens >= 20_000);
  assert.ok(AI_FEATURE_POLICIES["agent.publish"].defaultOperationMaxReservedOutputTokens >= 20_000);
  assert.ok(AI_FEATURE_POLICIES["booster.publish"].defaultOperationMaxDurationMs < 120_000);
  assert.ok(AI_FEATURE_POLICIES["agent.publish"].defaultOperationMaxDurationMs < 120_000);
});

test("Gateway validates the exact effective prompt sent to prompt-only engines", () => {
  const client = read("lib/aiGatewayClient.ts");
  assert.match(client, /const effectiveSystemPrompt = routing\.jsonMode === "prompt-only"/);
  assert.match(client, /validatePayloadAgainstPolicy\(opts, max_output_tokens, effectiveSystemPrompt\)/);
  assert.match(client, /\[ai-gateway\] input policy exceeded/);
});

test("Booster bounds media context and keeps the root failure visible after the single repair", () => {
  const generation = read("lib/boosterPublishGeneration.ts");
  assert.match(generation, /MAX_BOOSTER_EXTRA_INSTRUCTIONS_CHARS = 8_000/);
  assert.match(generation, /compactPromptContext\(args\.extraInstructions\)/);
  assert.match(generation, /stage: "primary-single-pass"/);
  assert.match(generation, /stage: "targeted-repair-once"/);
  assert.match(generation, /if \(initialGenerationError && unsafeChannels\.length === channels\.length\)/);
  assert.match(generation, /generation attempt failed/);
});
