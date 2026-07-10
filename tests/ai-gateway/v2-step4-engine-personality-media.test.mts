import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { AI_ENGINE_OPTIONS } from "../../lib/aiEnginePreference.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

test("V2 step 4 gives every selectable engine an explicit native editorial signature", () => {
  const source = read("lib/aiWritingProfile.ts");
  assert.match(source, /ENGINE_NATIVE_FREEDOM/);
  assert.match(source, /ENGINE_NATIVE_BOUNDARIES/);
  assert.match(source, /ENGINE_TEMPERATURE_PROFILES/);

  for (const option of AI_ENGINE_OPTIONS) {
    assert.match(source, new RegExp(`\\b${option.value}\\s*:`), option.value);
  }
  assert.match(source, /MOTEUR-AUTEUR/);
  assert.match(source, /phrase libre = mission/);
  assert.match(source, /Configuration IA = préférences du pro/);
});

test("V2 step 4 calibrates creativity by engine instead of forcing one temperature on all providers", () => {
  const writing = read("lib/aiWritingProfile.ts");
  const booster = read("lib/boosterPublishGeneration.ts");
  const mails = read("app/api/mails/generate-ai/route.ts");
  const templates = read("lib/templateAiGeneration.ts");
  const googleReviews = read("app/api/e-reputation/google/generate-reply/route.ts");

  assert.match(writing, /export function getAiEngineTemperature/);
  assert.match(booster, /getAiEngineTemperature\(/);
  assert.match(mails, /getAiEngineTemperature\(generationProfile, preferredEngine, "content"\)/);
  assert.match(templates, /getAiEngineTemperature\(generationProfile, preferredEngine, "content"\)/);
  assert.match(googleReviews, /getAiEngineTemperature\(generationProfile, preferredEngine, "reply"\)/);
  assert.doesNotMatch(booster, /function getCreativityTemperature/);
});

test("V2 step 4 keeps the selected non-vision engine as final writer", () => {
  const media = read("lib/aiMediaUnderstanding.ts");
  const booster = read("lib/boosterPublishGeneration.ts");

  assert.match(media, /engineOption\.supportsVision/);
  assert.match(media, /model: visionModel/);
  assert.match(media, /Ta mission s'arrête à l'observation/);
  assert.match(media, /le moteur choisi reste l'auteur final/i);
  assert.match(media, /imagesForWriter: undefined/);

  assert.match(booster, /prepareMediaForSelectedWriter\(/);
  assert.match(booster, /engine: baseGenerationProfile\.preferences\.engine/);
  assert.match(booster, /imagesForAI: preparedMedia\.imagesForWriter/);
  assert.match(booster, /engine: args\.generationProfile\.preferences\.engine/);
});

test("V2 step 4 uses one bounded neutral vision pass and preserves a graceful writer fallback", () => {
  const policy = read("lib/aiGatewayPolicy.ts");
  const media = read("lib/aiMediaUnderstanding.ts");

  assert.match(policy, /"booster\.media-understanding"/);
  assert.match(policy, /defaultOperationMaxCalls: 1/);
  assert.match(media, /retries: 0/);
  assert.match(media, /timeoutMs: 28_000/);
  assert.match(media, /analyse visuelle automatique n'est pas disponible/);
  assert.match(media, /ne déduis aucun détail visuel/);
});

test("V2 step 4 aligns creative variation with the professional preferred angle", () => {
  const prompt = read("lib/boosterPrompt.ts");
  const route = read("app/api/booster/generate/route.ts");

  assert.match(prompt, /PREFERRED_ANGLE_VARIATIONS/);
  assert.match(prompt, /pickBoosterHiddenAngle\(generationProfile\.preferences\.preferredAngle\)/);
  assert.doesNotMatch(route, /pickBoosterHiddenAngle\(\)/);
});
