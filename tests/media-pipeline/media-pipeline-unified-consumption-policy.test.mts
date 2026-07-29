import assert from "node:assert/strict";
import test from "node:test";
import {
  MEDIA_PIPELINE_UNIFIED_CONSUMPTION_VERSION,
  isMediaPipelineUnifiedPurpose,
  isUnifiedMediaConsumptionClientEnabled,
  isUnifiedMediaConsumptionEnabled,
} from "../../lib/mediaPipelineUnifiedConsumptionPolicy.ts";

const ENV_KEYS = [
  "MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1",
  "NEXT_PUBLIC_MEDIA_PIPELINE_UPLOADS_V1",
  "NEXT_PUBLIC_MEDIA_PIPELINE_WORKSPACE_V1",
  "NEXT_PUBLIC_MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1",
] as const;

function withCleanEnv(run: () => void) {
  const previous = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  );
  try {
    for (const key of ENV_KEYS) delete process.env[key];
    run();
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("la consommation unifiée reste derrière un flag serveur indépendant", () => {
  withCleanEnv(() => {
    assert.equal(MEDIA_PIPELINE_UNIFIED_CONSUMPTION_VERSION, 1);
    assert.equal(isUnifiedMediaConsumptionEnabled(), false);
    process.env.MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1 = "true";
    assert.equal(isUnifiedMediaConsumptionEnabled(), true);
    process.env.MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1 = "TRUE";
    assert.equal(isUnifiedMediaConsumptionEnabled(), false);
  });
});

test("le client exige upload, workspace et consommation unifiée", () => {
  withCleanEnv(() => {
    process.env.NEXT_PUBLIC_MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1 = "true";
    assert.equal(isUnifiedMediaConsumptionClientEnabled(), false);
    process.env.NEXT_PUBLIC_MEDIA_PIPELINE_UPLOADS_V1 = "true";
    assert.equal(isUnifiedMediaConsumptionClientEnabled(), false);
    process.env.NEXT_PUBLIC_MEDIA_PIPELINE_WORKSPACE_V1 = "true";
    assert.equal(isUnifiedMediaConsumptionClientEnabled(), true);
  });
});

test("les trois usages Générer, Publier et Programmer sont explicites", () => {
  assert.equal(isMediaPipelineUnifiedPurpose("ai"), true);
  assert.equal(isMediaPipelineUnifiedPurpose("publish"), true);
  assert.equal(isMediaPipelineUnifiedPurpose("schedule"), true);
  assert.equal(isMediaPipelineUnifiedPurpose("upload"), false);
});
