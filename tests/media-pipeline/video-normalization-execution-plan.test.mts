import assert from "node:assert/strict";
import test from "node:test";

import { planVideoNormalizationExecution } from "../../lib/mediaVideoNormalizationExecutionPlan.ts";

const AI_OUTPUTS = [
  "thumbnail",
  "frame_01",
  "frame_02",
  "frame_03",
  "audio_track",
] as const;

test("AI preparation extracts only lightweight artifacts from the original", () => {
  const plan = planVideoNormalizationExecution({
    mission: "ai_preparation",
    requestedKeys: AI_OUTPUTS,
    readyKeys: new Set(),
  });

  assert.equal(plan.mission, "ai_preparation");
  assert.equal(plan.continuesWithPendingOutputs, false);
  assert.deepEqual(plan.keys, AI_OUTPUTS);
});

test("publication preparation only requests the universal thumbnail", () => {
  const plan = planVideoNormalizationExecution({
    mission: "publication_preparation",
    requestedKeys: ["thumbnail"],
    readyKeys: new Set(),
  });

  assert.equal(plan.mission, "publication_preparation");
  assert.equal(plan.continuesWithPendingOutputs, false);
  assert.deepEqual(plan.keys, ["thumbnail"]);
});

test("obsolete compressed outputs from persisted jobs are ignored", () => {
  const plan = planVideoNormalizationExecution({
    mission: "publication_preparation",
    requestedKeys: ["canonical", "ai_preview", ...AI_OUTPUTS],
    readyKeys: new Set(),
  });

  assert.deepEqual(plan.keys, AI_OUTPUTS);
  assert.ok(!plan.keys.includes("canonical"));
  assert.ok(!plan.keys.includes("ai_preview"));
});

test("ready artifacts are never recomputed", () => {
  const plan = planVideoNormalizationExecution({
    mission: "ai_preparation",
    requestedKeys: AI_OUTPUTS,
    readyKeys: new Set(["thumbnail", "frame_01", "audio_track"]),
  });

  assert.deepEqual(plan.keys, ["frame_02", "frame_03"]);
});
