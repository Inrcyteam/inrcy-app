import assert from "node:assert/strict";
import test from "node:test";

import {
  GENERATION_PROGRESS_PHASES,
  PUBLICATION_PROGRESS_PHASES,
  PUBLICATION_PROGRESS_STAGES,
  getProgressPhaseCaps,
  getPublicationProgressStage,
  getPublicationProgressStageForValue,
  mapProgressRange,
  resolvePublicationBilanProgress,
} from "../../lib/boosterProgressPhases.ts";

function assertOrderedCaps(phases: readonly { start: number; cap: number }[]) {
  let previousCap = 0;
  for (const phase of phases) {
    assert.ok(phase.start >= previousCap, "phase starts must not overlap backwards");
    assert.ok(phase.cap >= phase.start, "phase cap must be after its start");
    previousCap = phase.cap;
  }
  assert.equal(previousCap, 100);
}

test("generation progress ends on a patient 95-99% phase before completion", () => {
  assert.equal(GENERATION_PROGRESS_PHASES.length, 10);
  assertOrderedCaps(GENERATION_PROGRESS_PHASES);
  assert.deepEqual(getProgressPhaseCaps(GENERATION_PROGRESS_PHASES), [
    7, 20, 38, 48, 68, 82, 92, 95, 99, 100,
  ]);
  const finalWait = GENERATION_PROGRESS_PHASES.at(-2);
  assert.equal(finalWait?.key, "final_wait");
  assert.equal(finalWait?.label, "Encore quelques secondes…");
  assert.equal(finalWait?.start, 95);
  assert.equal(finalWait?.cap, 99);
});

test("publication progress exposes complete factual stages and a 96-99% patient phase", () => {
  assert.equal(PUBLICATION_PROGRESS_PHASES.length, 11);
  assertOrderedCaps(PUBLICATION_PROGRESS_PHASES);
  const inrSendPhase = PUBLICATION_PROGRESS_PHASES.at(-3);
  const finalWait = PUBLICATION_PROGRESS_PHASES.at(-2);
  assert.equal(inrSendPhase?.key, "inrsend_recording");
  assert.equal(inrSendPhase?.start, 94);
  assert.equal(inrSendPhase?.cap, 96);
  assert.equal(finalWait?.key, "final_wait");
  assert.equal(finalWait?.start, 96);
  assert.equal(finalWait?.cap, 99);
});

test("the UI exposes ten chronological publication stages", () => {
  assert.deepEqual(
    PUBLICATION_PROGRESS_STAGES.map((stage) => stage.label),
    [
      "Demande prise en charge",
      "Vérification des canaux",
      "Vérification des médias",
      "Préparation des médias",
      "Préparation des envois",
      "Publication sur les canaux",
      "Confirmation des plateformes",
      "Enregistrement dans iNr’Send",
      "Un peu de patience…",
      "Publication terminée",
    ],
  );
  assert.equal(getPublicationProgressStage("verification").index, 1);
  assert.equal(getPublicationProgressStage("channel_verification").index, 2);
  assert.equal(getPublicationProgressStage("media_verification").index, 3);
  assert.equal(getPublicationProgressStage("media_preparation").index, 4);
  assert.equal(getPublicationProgressStage("file_preparation").index, 5);
  assert.equal(getPublicationProgressStage("channel_dispatch").index, 6);
  assert.equal(getPublicationProgressStage("publication_finalization").index, 6);
  assert.equal(getPublicationProgressStage("status_collection").index, 7);
  assert.equal(getPublicationProgressStage("inrsend_recording").index, 8);
  assert.equal(getPublicationProgressStage("final_wait").index, 9);
  assert.equal(getPublicationProgressStage("complete").index, 10);
  assert.equal(getPublicationProgressStageForValue(0).index, 1);
  assert.equal(getPublicationProgressStageForValue(5).index, 2);
  assert.equal(getPublicationProgressStageForValue(12).index, 3);
  assert.equal(getPublicationProgressStageForValue(22).index, 4);
  assert.equal(getPublicationProgressStageForValue(40).index, 5);
  assert.equal(getPublicationProgressStageForValue(50).index, 6);
  assert.equal(getPublicationProgressStageForValue(82).index, 7);
  assert.equal(getPublicationProgressStageForValue(94).index, 8);
  assert.equal(getPublicationProgressStageForValue(96).index, 9);
  assert.equal(getPublicationProgressStageForValue(100).index, 10);
});

test("the 30-second bilan reaches 100 even while channels finish in background", () => {
  assert.deepEqual(resolvePublicationBilanProgress(3), {
    pendingCount: 3,
    progress: 100,
    backgroundFinalization: true,
  });
  assert.deepEqual(resolvePublicationBilanProgress(0), {
    pendingCount: 0,
    progress: 100,
    backgroundFinalization: false,
  });
});

test("raw progress can be mapped inside a phase without crossing its cap", () => {
  assert.equal(mapProgressRange(0, 0, 100, 23, 39), 23);
  assert.equal(mapProgressRange(50, 0, 100, 23, 39), 31);
  assert.equal(mapProgressRange(100, 0, 100, 23, 39), 39);
});
