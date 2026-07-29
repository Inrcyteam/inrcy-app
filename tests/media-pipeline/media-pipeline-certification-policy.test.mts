import assert from "node:assert/strict";
import test from "node:test";
import {
  MEDIA_PIPELINE_ALL_FLAG_KEYS,
  MEDIA_PIPELINE_CERTIFICATION_VERSION,
  buildMediaPipelineCertificationSnapshot,
} from "../../lib/mediaPipelineCertification.ts";

function envWith(...enabled: string[]) {
  return Object.fromEntries(
    MEDIA_PIPELINE_ALL_FLAG_KEYS.map((key) => [
      key,
      enabled.includes(key) ? "true" : "false",
    ]),
  );
}

const serverFoundation = [
  "MEDIA_PIPELINE_UPLOADS_V1",
  "MEDIA_PIPELINE_WORKSPACE_V1",
  "MEDIA_PIPELINE_IMAGE_NORMALIZATION_V1",
  "MEDIA_PIPELINE_VIDEO_NORMALIZATION_V1",
];
const clientWorkspace = [
  "NEXT_PUBLIC_MEDIA_PIPELINE_UPLOADS_V1",
  "NEXT_PUBLIC_MEDIA_PIPELINE_WORKSPACE_V1",
];
const unified = [
  "MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1",
  "NEXT_PUBLIC_MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1",
];
const cutover = [
  "MEDIA_PIPELINE_LEGACY_CUTOVER_V1",
  "NEXT_PUBLIC_MEDIA_PIPELINE_LEGACY_CUTOVER_V1",
];

test("la certification reste inactive quand tous les flags sont coupés", () => {
  const snapshot = buildMediaPipelineCertificationSnapshot(envWith());
  assert.equal(MEDIA_PIPELINE_CERTIFICATION_VERSION, 1);
  assert.equal(snapshot.stage, "disabled");
  assert.deepEqual(snapshot.errors, []);
  assert.equal(snapshot.fullCutoverEnabled, false);
});

test("le socle serveur est reconnu sans exposer le nouveau client", () => {
  const snapshot = buildMediaPipelineCertificationSnapshot(
    envWith(...serverFoundation),
  );
  assert.equal(snapshot.stage, "server_foundation");
  assert.deepEqual(snapshot.errors, []);
});

test("le canary workspace exige upload et workspace des deux côtés", () => {
  const snapshot = buildMediaPipelineCertificationSnapshot(
    envWith(...serverFoundation, ...clientWorkspace),
  );
  assert.equal(snapshot.stage, "workspace_canary");
  assert.deepEqual(snapshot.errors, []);
});

test("le canary unifié garde encore le cutover coupé", () => {
  const snapshot = buildMediaPipelineCertificationSnapshot(
    envWith(...serverFoundation, ...clientWorkspace, ...unified),
  );
  assert.equal(snapshot.stage, "unified_canary");
  assert.equal(snapshot.cutoverPrerequisitesReady, true);
  assert.equal(snapshot.fullCutoverEnabled, false);
});

test("la bascule finale exige les dix flags cohérents", () => {
  const snapshot = buildMediaPipelineCertificationSnapshot(
    envWith(...serverFoundation, ...clientWorkspace, ...unified, ...cutover),
  );
  assert.equal(snapshot.stage, "full_cutover");
  assert.equal(snapshot.fullCutoverEnabled, true);
  assert.deepEqual(snapshot.errors, []);
});

test("un flag client en avance sur le serveur est refusé", () => {
  const snapshot = buildMediaPipelineCertificationSnapshot(
    envWith("NEXT_PUBLIC_MEDIA_PIPELINE_UPLOADS_V1"),
  );
  assert.equal(snapshot.stage, "invalid");
  assert.ok(
    snapshot.errors.some((error) =>
      error.includes("NEXT_PUBLIC_MEDIA_PIPELINE_UPLOADS_V1 exige MEDIA_PIPELINE_UPLOADS_V1"),
    ),
  );
});

test("le cutover serveur ne peut pas contourner la consommation unifiée", () => {
  const snapshot = buildMediaPipelineCertificationSnapshot(
    envWith(...serverFoundation, "MEDIA_PIPELINE_LEGACY_CUTOVER_V1"),
  );
  assert.equal(snapshot.stage, "invalid");
  assert.ok(
    snapshot.errors.some((error) =>
      error.includes("MEDIA_PIPELINE_LEGACY_CUTOVER_V1 exige MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1"),
    ),
  );
});

test("seule la valeur littérale true active un flag", () => {
  const env = envWith();
  env.MEDIA_PIPELINE_UPLOADS_V1 = "TRUE";
  const snapshot = buildMediaPipelineCertificationSnapshot(env);
  assert.equal(snapshot.stage, "disabled");
});
