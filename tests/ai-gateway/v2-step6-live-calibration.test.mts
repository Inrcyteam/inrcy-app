import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { evaluateGeneration, computeCrossEngineDiversity } from "../../scripts/lib/ai-live-qa-evaluator.mjs";
import { buildCalibrationRecommendations } from "../../scripts/lib/ai-calibration-recommendations.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

test("V2 step 6 live matrix covers channel count, media, languages, profile depth and creativity", () => {
  const live = read("scripts/qa-ai-gateway-live.mjs");
  assert.match(live, /one-fr-minimal-classic-text/);
  assert.match(live, /five-es-full-creative-text/);
  assert.match(live, /all-en-full-balanced-text/);
  assert.match(live, /all-fr-full-creative-image/);
  assert.match(live, /five-es-minimal-classic-video/);
  assert.match(live, /one-en-full-creative-image/);
  assert.match(live, /ALL_CHANNELS/);
  assert.match(live, /FIVE_CHANNELS/);
  assert.match(live, /RUN_MATRIX/);
  assert.match(live, /RUN_FULL_MATRIX/);
  assert.match(live, /\/api\/internal\/ai-live-qa/);
  assert.match(live, /scenario\.creativity/);
});

test("V2 step 6 measures real quality, repair rate, usage, latency, cost and cross-engine diversity", () => {
  const live = read("scripts/qa-ai-gateway-live.mjs");
  const evaluator = read("scripts/lib/ai-live-qa-evaluator.mjs");
  assert.match(live, /repairUsed/);
  assert.match(live, /usage/);
  assert.match(live, /durationMs/);
  assert.match(live, /costMicroUsd/);
  assert.match(live, /outputTokenUtilization/);
  assert.match(live, /computeCrossEngineDiversity/);
  assert.match(evaluator, /preferenceAdherence/);
  assert.match(evaluator, /channelCompliance/);
  assert.match(evaluator, /languageScore/);
  assert.match(evaluator, /ideaAnchor/);
  assert.match(evaluator, /crossChannelDiversity/);
});

test("V2 step 6 deterministic evaluator flags missing channels and scores a healthy output", () => {
  const scenario = {
    language: "fr",
    idea: "terrasse réalisée à Arras",
    preferences: { addressMode: "vous", emojiLevel: "none", voice: "nous" },
  };
  const missing = evaluateGeneration({ output: { versions: {} }, channels: ["facebook"], scenario });
  assert.deepEqual(missing.invalidChannels, ["facebook"]);
  assert.equal(missing.completeness, 0);

  const healthy = evaluateGeneration({
    output: {
      versions: {
        facebook: {
          title: "Une terrasse pensée pour votre extérieur",
          content: "À Arras, nous présentons une terrasse réalisée avec soin pour accompagner un projet extérieur concret. Vous profitez d'un espace plus agréable, avec une attention portée au travail et aux finitions. Cette réalisation illustre notre approche de terrain et notre volonté de rester proches de vos besoins.",
          cta: "",
          hashtags: [],
        },
      },
    },
    channels: ["facebook"],
    scenario,
  });
  assert.equal(healthy.invalidChannels.length, 0);
  assert.ok(healthy.totalScore >= 0.7);
});

test("V2 step 6 computes bounded per-engine calibration recommendations", () => {
  const report = {
    reportId: "test",
    crossEngineDiversity: { openai: 0.42, anthropic: 0.72 },
    results: [
      {
        engine: "openai",
        success: true,
        repairUsed: false,
        durationMs: 12_000,
        outputTokenUtilization: 0.25,
        quality: { totalScore: 0.9, preferenceAdherence: 0.9, completeness: 1 },
      },
      {
        engine: "anthropic",
        success: false,
        repairUsed: false,
        durationMs: 60_000,
      },
    ],
  };
  const recommendation = buildCalibrationRecommendations(report);
  assert.equal(recommendation.calibration.openai.temperatureOffset, 0.05);
  assert.equal(recommendation.calibration.openai.outputTokenMultiplier, 0.92);
  assert.equal(recommendation.calibration.openai.timeoutMultiplier, 0.95);
  assert.equal(recommendation.calibration.anthropic.temperatureOffset, -0.06);
  for (const value of Object.values(recommendation.calibration) as Array<Record<string, number>>) {
    assert.ok(value.temperatureOffset >= -0.2 && value.temperatureOffset <= 0.2);
    assert.ok(value.outputTokenMultiplier >= 0.75 && value.outputTokenMultiplier <= 1.35);
    assert.ok(value.timeoutMultiplier >= 0.75 && value.timeoutMultiplier <= 1.35);
  }
});

test("V2 step 6 runtime consumes bounded calibration without replacing engine personalities", () => {
  const calibration = read("lib/aiEngineCalibration.ts");
  const writing = read("lib/aiWritingProfile.ts");
  const booster = read("lib/boosterPublishGeneration.ts");

  assert.match(calibration, /AI_ENGINE_CALIBRATION_JSON/);
  assert.match(calibration, /temperatureOffset/);
  assert.match(calibration, /outputTokenMultiplier/);
  assert.match(calibration, /timeoutMultiplier/);
  assert.match(calibration, /-0\.2/);
  assert.match(calibration, /1\.35/);
  assert.match(writing, /applyAiEngineTemperatureCalibration/);
  assert.match(booster, /applyAiEngineOutputTokenCalibration/);
  assert.match(booster, /applyAiEngineTimeoutCalibration/);
  assert.match(writing, /ENGINE_NATIVE_FREEDOM/);
});

test("V2 step 6 keeps non-vision writers as authors during live image QA", () => {
  const live = read("scripts/qa-ai-gateway-live.mjs");
  const route = read("app/api/internal/ai-live-qa/route.ts");
  const media = read("lib/aiMediaUnderstanding.ts");
  assert.match(live, /\/api\/internal\/ai-live-qa/);
  assert.match(route, /generateSharedBoosterPosts\s*\(/);
  assert.match(media, /prepareMediaForSelectedWriter/);
  assert.match(media, /usedNeutralVisionAnalysis/);
});

test("V2 step 6 cross-engine diversity returns a score per engine when comparable outputs exist", () => {
  const results = [
    { engine: "openai", scenarioId: "s", success: true, output: { versions: { facebook: { title: "A", content: "terrasse locale pratique et soignée", cta: "", hashtags: [] } } } },
    { engine: "anthropic", scenarioId: "s", success: true, output: { versions: { facebook: { title: "B", content: "un extérieur pensé comme une histoire de détails", cta: "", hashtags: [] } } } },
  ];
  const scores = computeCrossEngineDiversity(results);
  assert.ok(scores.openai > 0);
  assert.ok(scores.anthropic > 0);
});
