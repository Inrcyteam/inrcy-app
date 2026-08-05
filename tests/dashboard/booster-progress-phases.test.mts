import assert from "node:assert/strict";
import test from "node:test";

import {
  GENERATION_PROGRESS_PHASES,
  PUBLICATION_PROGRESS_PHASES,
  getProgressPhaseCaps,
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
