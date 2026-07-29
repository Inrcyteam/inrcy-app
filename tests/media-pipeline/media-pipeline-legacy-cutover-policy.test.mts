import assert from "node:assert/strict";
import test from "node:test";
import {
  MEDIA_PIPELINE_LEGACY_CUTOVER_VERSION,
  isLegacyMediaTransportCutoverClientEnabled,
  isLegacyMediaTransportCutoverEnabled,
} from "../../lib/mediaPipelineLegacyCutoverPolicy.ts";

const SERVER_KEYS = [
  "MEDIA_PIPELINE_UPLOADS_V1",
  "MEDIA_PIPELINE_WORKSPACE_V1",
  "MEDIA_PIPELINE_IMAGE_NORMALIZATION_V1",
  "MEDIA_PIPELINE_VIDEO_NORMALIZATION_V1",
  "MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1",
  "MEDIA_PIPELINE_LEGACY_CUTOVER_V1",
] as const;

const CLIENT_KEYS = [
  "NEXT_PUBLIC_MEDIA_PIPELINE_UPLOADS_V1",
  "NEXT_PUBLIC_MEDIA_PIPELINE_WORKSPACE_V1",
  "NEXT_PUBLIC_MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1",
  "NEXT_PUBLIC_MEDIA_PIPELINE_LEGACY_CUTOVER_V1",
] as const;

const ALL_KEYS = [...SERVER_KEYS, ...CLIENT_KEYS] as const;

function withCleanEnv(run: () => void) {
  const previous = Object.fromEntries(ALL_KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of ALL_KEYS) delete process.env[key];
    run();
  } finally {
    for (const key of ALL_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("la bascule serveur exige toutes les étapes média précédentes", () => {
  withCleanEnv(() => {
    assert.equal(MEDIA_PIPELINE_LEGACY_CUTOVER_VERSION, 1);
    assert.equal(isLegacyMediaTransportCutoverEnabled(), false);
    for (const key of SERVER_KEYS.slice(0, -1)) process.env[key] = "true";
    assert.equal(isLegacyMediaTransportCutoverEnabled(), false);
    process.env.MEDIA_PIPELINE_LEGACY_CUTOVER_V1 = "true";
    assert.equal(isLegacyMediaTransportCutoverEnabled(), true);
  });
});

test("un seul prérequis serveur manquant maintient le transport historique", () => {
  withCleanEnv(() => {
    for (const key of SERVER_KEYS) process.env[key] = "true";
    delete process.env.MEDIA_PIPELINE_VIDEO_NORMALIZATION_V1;
    assert.equal(isLegacyMediaTransportCutoverEnabled(), false);
  });
});

test("la bascule client exige upload, workspace, consommation et cutover publics", () => {
  withCleanEnv(() => {
    for (const key of CLIENT_KEYS) process.env[key] = "true";
    assert.equal(isLegacyMediaTransportCutoverClientEnabled(), true);
    delete process.env.NEXT_PUBLIC_MEDIA_PIPELINE_WORKSPACE_V1;
    assert.equal(isLegacyMediaTransportCutoverClientEnabled(), false);
  });
});
