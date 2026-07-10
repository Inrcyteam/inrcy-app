import test from "node:test";
import assert from "node:assert/strict";

import {
  AI_ENGINE_OPTIONS,
  DEFAULT_AI_PREFERRED_ENGINE,
  getAiEngineJsonMode,
  getAiEngineModel,
  getAiEngineSupportsVision,
  getAiPreferredEngineFromBusiness,
  normalizeAiPreferredEngine,
  resolveAiEngineRequestRouting,
} from "../../lib/aiEnginePreference.ts";

test("default engine preserves existing OpenAI behavior", () => {
  assert.equal(DEFAULT_AI_PREFERRED_ENGINE, "openai");
  assert.equal(normalizeAiPreferredEngine(undefined), "openai");
  assert.equal(getAiPreferredEngineFromBusiness(null), "openai");
});

test("legacy labels migrate to provider engine codes", () => {
  assert.equal(normalizeAiPreferredEngine("ChatGPT"), "openai");
  assert.equal(normalizeAiPreferredEngine("Claude"), "anthropic");
  assert.equal(normalizeAiPreferredEngine("Gemini"), "google");
  assert.equal(normalizeAiPreferredEngine("Mistral AI"), "mistral");
  assert.equal(normalizeAiPreferredEngine("Grok"), "xai");
  assert.equal(normalizeAiPreferredEngine("Sonar"), "perplexity");
  assert.equal(normalizeAiPreferredEngine("Deep-Seek"), "deepseek");
  assert.equal(normalizeAiPreferredEngine("Llama"), "meta");
});

test("the eight selectable engines map to provider/model Gateway identifiers", () => {
  assert.equal(AI_ENGINE_OPTIONS.length, 8);
  assert.deepEqual(
    AI_ENGINE_OPTIONS.map((option) => option.value),
    ["openai", "anthropic", "google", "mistral", "xai", "perplexity", "deepseek", "meta"],
  );

  for (const option of AI_ENGINE_OPTIONS) {
    assert.match(option.model, /^[a-z0-9-]+\/[a-z0-9.-]+$/i);
    assert.equal(getAiEngineModel(option.value), option.model);
  }
});

test("vision capability is explicit so image flows never select a text-only model blindly", () => {
  assert.equal(getAiEngineSupportsVision("deepseek"), false);
  for (const engine of ["openai", "anthropic", "google", "mistral", "xai", "perplexity", "meta"] as const) {
    assert.equal(getAiEngineSupportsVision(engine), true);
  }
});

test("prompt-only JSON compatibility is explicit for engines with heterogeneous provider support", () => {
  assert.equal(getAiEngineJsonMode("perplexity"), "prompt-only");
  assert.equal(getAiEngineJsonMode("deepseek"), "prompt-only");
  assert.equal(getAiEngineJsonMode("meta"), "prompt-only");
  assert.equal(getAiEngineJsonMode("openai"), "strict");
});


test("DeepSeek image requests are routed through a compatible vision fallback", () => {
  assert.deepEqual(resolveAiEngineRequestRouting("deepseek", false), {
    model: "deepseek/deepseek-v3.2",
    jsonMode: "prompt-only",
    usedVisionFallback: false,
  });
  assert.deepEqual(resolveAiEngineRequestRouting("deepseek", true), {
    model: "google/gemini-2.5-flash-lite",
    jsonMode: "strict",
    usedVisionFallback: true,
  });
  assert.deepEqual(resolveAiEngineRequestRouting("deepseek", true, "openai/gpt-4o-mini"), {
    model: "openai/gpt-4o-mini",
    jsonMode: "strict",
    usedVisionFallback: true,
  });
});
