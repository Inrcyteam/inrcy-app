import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  scrollIntoViewWhenAvailable,
  settleOptionalMediaEnrichment,
} from "../../app/dashboard/booster/publier/publishModal.clientResilience.ts";

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("a stalled local decoder expires without rejecting generation", async () => {
  const startedAt = Date.now();
  const result = await settleOptionalMediaEnrichment(
    () => new Promise<string>(() => undefined),
    15,
  );

  assert.deepEqual(result, { ok: false, reason: "timeout" });
  assert.ok(Date.now() - startedAt < 250, "the optional decoder must be bounded");
});

test("a local media exception becomes a settled optional failure", async () => {
  const failure = new Error("canvas decoder unavailable");
  const result = await settleOptionalMediaEnrichment(
    async () => {
      throw failure;
    },
    100,
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "error");
    assert.equal(result.error, failure);
  }
});

test("generated-content scroll retries until React mounts the ref", () => {
  const frames: Array<FrameRequestCallback> = [];
  const cancelled: number[] = [];
  const scrollCalls: ScrollIntoViewOptions[] = [];
  let nextHandle = 0;
  let targetReady = false;

  scrollIntoViewWhenAvailable({
    getTarget: () =>
      targetReady
        ? {
            scrollIntoView: (options) => {
              scrollCalls.push(options as ScrollIntoViewOptions);
            },
          }
        : null,
    requestFrame: (callback) => {
      frames.push(callback);
      nextHandle += 1;
      return nextHandle;
    },
    cancelFrame: (handle) => cancelled.push(handle),
    options: { behavior: "smooth", block: "start" },
    maxAttempts: 8,
  });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const frame = frames.shift();
    assert.ok(frame, `retry frame ${attempt + 1} should be scheduled`);
    frame(16 * attempt);
  }
  assert.equal(scrollCalls.length, 0);

  targetReady = true;
  const finalFrame = frames.shift();
  assert.ok(finalFrame, "a final retry should still be pending");
  finalFrame(80);

  assert.deepEqual(scrollCalls, [{ behavior: "smooth", block: "start" }]);
  assert.deepEqual(cancelled, []);
});

test("PublishModal bounds both legacy image and video enrichment and opens content first", () => {
  const modal = read("app/dashboard/booster/publier/PublishModal.tsx");
  const generationStart = modal.indexOf("const onGenerate = async");
  const generationEnd = modal.indexOf(
    "const onDuplicateContentToAllChannels",
    generationStart,
  );
  const generation = modal.slice(generationStart, generationEnd);
  const successStart = generation.indexOf(
    '"Installation des contenus dans l’éditeur"',
  );
  const success = generation.slice(successStart);

  assert.match(modal, /BOOSTER_LOCAL_MEDIA_ENRICHMENT_BUDGET_MS = 2_500/);
  assert.match(
    generation,
    /settleOptionalMediaEnrichment\([\s\S]*getOrPrepareAiImagePayload/,
  );
  assert.match(
    generation,
    /settleOptionalMediaEnrichment\([\s\S]*getOrPrepareVideoFramesForAI/,
  );
  assert.doesNotMatch(
    generation,
    /await Promise\.allSettled\([\s\S]{0,180}getOrPrepare(?:AiImagePayload|VideoFramesForAI)/,
  );
  assert.match(modal, /scrollIntoViewWhenAvailable\([\s\S]*maxAttempts: 24/);
  assert.match(
    success,
    /setPostsByChannel\([\s\S]*setContentWorkspaceOpen\(true\)[\s\S]*scrollToContentWorkspace\(\)[\s\S]*setGenerationMediaWarning\(/,
    "content must open and receive focus before an optional orange media warning",
  );
  assert.doesNotMatch(
    generation,
    /Impossible de préparer ou d’analyser les images|Impossible de préparer l’analyse vidéo/,
  );
});
