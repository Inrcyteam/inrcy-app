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

test("multichannel recovery budget matches the recovery pipeline instead of stopping at eight calls", () => {
  assert.ok(AI_FEATURE_POLICIES["booster.publish"].defaultOperationMaxCalls >= 12);
  assert.ok(AI_FEATURE_POLICIES["booster.publish"].defaultOperationMaxReservedOutputTokens >= 64_000);
  assert.ok(AI_FEATURE_POLICIES["agent.publish"].defaultOperationMaxCalls >= 11);
});

test("Gateway validates the exact effective prompt sent to prompt-only engines", () => {
  const client = read("lib/aiGatewayClient.ts");
  assert.match(client, /const effectiveSystemPrompt = routing\.jsonMode === "prompt-only"/);
  assert.match(client, /validatePayloadAgainstPolicy\(opts, max_output_tokens, effectiveSystemPrompt\)/);
  assert.match(client, /\[ai-gateway\] input policy exceeded/);
});

test("Booster bounds long media context and does not hide a complete generation failure as unsafe channels", () => {
  const generation = read("lib/boosterPublishGeneration.ts");
  assert.match(generation, /MAX_BOOSTER_EXTRA_INSTRUCTIONS_CHARS = 8_000/);
  assert.match(generation, /compactPromptContext\(args\.extraInstructions\)/);
  assert.match(generation, /if \(!Object\.keys\(versions\)\.length && firstFailure\)/);
  assert.match(generation, /if \(initialGenerationError && unsafeChannels\.length === channels\.length\)/);
  assert.match(generation, /generation attempt failed/);
});
