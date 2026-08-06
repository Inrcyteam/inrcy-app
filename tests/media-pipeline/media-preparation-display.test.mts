import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  resolveMediaPreparationDisplayPhase,
  resolveMediaPreparationDisplayState,
} from "../../lib/mediaPreparationDisplay.ts";

const HEAVY_VIDEO_BYTES = 70_000_000;

test("the compression label is limited to the canonical stage of a heavy video", () => {
  assert.deepEqual(
    resolveMediaPreparationDisplayState([
      {
        mediaType: "video",
        sizeBytes: HEAVY_VIDEO_BYTES,
        processingStatus: "processing",
        processingProgress: 32.5,
      },
    ]),
    { phase: "compression", phaseProgress: 50 },
  );
  assert.equal(
    resolveMediaPreparationDisplayPhase([
      {
        mediaType: "video",
        sizeBytes: HEAVY_VIDEO_BYTES,
        processingStatus: "queued",
        processingProgress: 64,
      },
    ]),
    "compression",
  );
  assert.equal(
    resolveMediaPreparationDisplayPhase([
      {
        mediaType: "video",
        sizeBytes: HEAVY_VIDEO_BYTES,
        processingStatus: "processing",
        processingProgress: 65,
      },
    ]),
    "preparation",
  );
});

test("light videos, images and terminal heavy videos use the universal preparation label", () => {
  for (const row of [
    {
      mediaType: "video",
      sizeBytes: HEAVY_VIDEO_BYTES - 1,
      processingStatus: "processing",
      processingProgress: 20,
    },
    {
      mediaType: "image",
      sizeBytes: HEAVY_VIDEO_BYTES,
      processingStatus: "processing",
      processingProgress: 20,
    },
    {
      mediaType: "video",
      sizeBytes: HEAVY_VIDEO_BYTES,
      processingStatus: "ready",
      processingProgress: 100,
    },
    {
      mediaType: "video",
      sizeBytes: HEAVY_VIDEO_BYTES,
      processingStatus: "failed_terminal",
      processingProgress: 0,
    },
  ]) {
    assert.equal(resolveMediaPreparationDisplayPhase([row]), "preparation");
  }
});

test("the async publication scopes progress to the media families of preparing channels", () => {
  const source = readFileSync(
    new URL("../../lib/boosterAsyncPublication.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /parentPayload\.preparationRequest/);
  assert.match(source, /state\.status === "preparing"/);
  assert.match(source, /requestedMediaTypes/);
  assert.match(source, /phaseProgress/);
});

test("generation and publication expose compression then the universal media label", () => {
  const modal = readFileSync(
    new URL(
      "../../app/dashboard/booster/publier/PublishModal.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(modal, /"Compression des médias"/);
  assert.match(modal, /"Préparation des médias"/);
  assert.match(modal, /videoPreparationDisplayPhase/);
  assert.match(
    modal,
    /heavyVideoCompressionRequiredForPublish\s*&&\s*videoPreparationDisplayPhase\s*!==\s*"preparation"/,
  );
  assert.doesNotMatch(modal, /Préparation de la vidéo/);
});
