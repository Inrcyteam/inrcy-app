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

test("generation progress phases are ordered and capped at 100", () => {
  assert.equal(GENERATION_PROGRESS_PHASES.length, 9);
  assertOrderedCaps(GENERATION_PROGRESS_PHASES);
  assert.deepEqual(getProgressPhaseCaps(GENERATION_PROGRESS_PHASES), [
    7, 22, 40, 50, 72, 86, 95, 99, 100,
  ]);
});

test("publication progress keeps iNr'Send as the final visible phase", () => {
  assert.equal(PUBLICATION_PROGRESS_PHASES.length, 9);
  assertOrderedCaps(PUBLICATION_PROGRESS_PHASES);
  const inrSendPhase = PUBLICATION_PROGRESS_PHASES.at(-2);
  assert.equal(inrSendPhase?.key, "inrsend_recording");
  assert.equal(inrSendPhase?.start, 96);
  assert.equal(inrSendPhase?.cap, 99);
});

test("the UI groups technical publication work into four factual stages", () => {
  assert.deepEqual(
    PUBLICATION_PROGRESS_STAGES.map((stage) => stage.label),
    [
      "Demande prise en charge",
      "Finalisation des médias",
      "Envoi parallèle",
      "Confirmations et bilan",
    ],
  );
  assert.equal(getPublicationProgressStage("verification").index, 1);
  assert.equal(getPublicationProgressStage("media_preparation").index, 2);
  assert.equal(getPublicationProgressStage("file_preparation").index, 2);
  assert.equal(getPublicationProgressStage("channel_dispatch").index, 3);
  assert.equal(getPublicationProgressStage("publication_finalization").index, 3);
  assert.equal(getPublicationProgressStage("status_collection").index, 4);
  assert.equal(getPublicationProgressStage("complete").index, 4);
  assert.equal(getPublicationProgressStageForValue(0).index, 1);
  assert.equal(getPublicationProgressStageForValue(7).index, 1);
  assert.equal(getPublicationProgressStageForValue(8).index, 2);
  assert.equal(getPublicationProgressStageForValue(57).index, 2);
  assert.equal(getPublicationProgressStageForValue(58).index, 3);
  assert.equal(getPublicationProgressStageForValue(91).index, 3);
  assert.equal(getPublicationProgressStageForValue(92).index, 4);
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
  assert.equal(mapProgressRange(6, 6, 24, 9, 26), 9);
  assert.equal(mapProgressRange(15, 6, 24, 9, 26), 18);
  assert.equal(mapProgressRange(24, 6, 24, 9, 26), 26);
  assert.equal(mapProgressRange(100, 6, 24, 9, 26), 26);
});
