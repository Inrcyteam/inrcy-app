import assert from "node:assert/strict";
import test from "node:test";

import { planVideoNormalizationExecution } from "../../lib/mediaVideoNormalizationExecutionPlan.ts";

test("light sources keep the AI-first path", () => {
  const plan = planVideoNormalizationExecution({
    mission: "publication_preparation",
    requestedKeys: [
      "canonical",
      "thumbnail",
      "ai_preview",
      "frame_01",
      "frame_02",
      "frame_03",
      "audio_track",
    ],
    readyKeys: new Set(),
  });

  assert.equal(plan.mission, "ai_preparation");
  assert.equal(plan.continuesWithPendingOutputs, true);
  assert.deepEqual(plan.keys, [
    "thumbnail",
    "ai_preview",
    "frame_01",
    "frame_02",
    "frame_03",
    "audio_track",
  ]);
  assert.ok(!plan.keys.includes("canonical"));
});

test("heavy sources produce the canonical before captures and audio", () => {
  const plan = planVideoNormalizationExecution({
    mission: "publication_preparation",
    requestedKeys: [
      "canonical",
      "thumbnail",
      "frame_01",
      "frame_02",
      "frame_03",
      "audio_track",
    ],
    readyKeys: new Set(),
    requiresCanonicalFirst: true,
  });

  assert.equal(plan.mission, "publication_preparation");
  assert.equal(plan.continuesWithPendingOutputs, true);
  assert.deepEqual(plan.keys, ["canonical"]);
});

test("a heavy publication-only request also separates its thumbnail", () => {
  const plan = planVideoNormalizationExecution({
    mission: "publication_preparation",
    requestedKeys: ["canonical", "thumbnail"],
    readyKeys: new Set(),
    requiresCanonicalFirst: true,
  });

  assert.deepEqual(plan.keys, ["canonical"]);
  assert.equal(plan.continuesWithPendingOutputs, true);
});

test("a publication-only request remains a single canonical stage", () => {
  const plan = planVideoNormalizationExecution({
    mission: "publication_preparation",
    requestedKeys: ["canonical", "thumbnail"],
    readyKeys: new Set(),
  });

  assert.equal(plan.mission, "publication_preparation");
  assert.equal(plan.continuesWithPendingOutputs, false);
  assert.deepEqual(plan.keys, ["canonical", "thumbnail"]);
});

test("ready AI derivatives are not recomputed before publication", () => {
  const requestedKeys = [
    "canonical",
    "thumbnail",
    "ai_preview",
    "frame_01",
    "frame_02",
    "frame_03",
    "audio_track",
  ] as const;
  const plan = planVideoNormalizationExecution({
    mission: "publication_preparation",
    requestedKeys,
    readyKeys: new Set(requestedKeys.filter((key) => key !== "canonical")),
  });

  assert.equal(plan.mission, "publication_preparation");
  assert.equal(plan.continuesWithPendingOutputs, false);
  assert.deepEqual(plan.keys, [...requestedKeys]);
});
