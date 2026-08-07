import assert from "node:assert/strict";
import test from "node:test";

import { BOOSTER_VIDEO_PREPARATION_KEYS } from "../../lib/boosterMediaPipelineMissions.ts";
import { planVideoNormalizationFailure } from "../../lib/mediaVideoNormalizationFailurePlan.ts";

const PUBLICATION_KEYS = [...BOOSTER_VIDEO_PREPARATION_KEYS.publication_preparation];
const AI_KEYS = [...BOOSTER_VIDEO_PREPARATION_KEYS.ai_preparation];
const UNION_KEYS = Array.from(new Set([...AI_KEYS, ...PUBLICATION_KEYS]));

test("publication thumbnail timeout preserves the attempt and enters backoff", () => {
  const plan = planVideoNormalizationFailure({
    claimedKeys: PUBLICATION_KEYS,
    latestKeys: PUBLICATION_KEYS,
    retryableError: true,
    attemptCount: 2,
    maxAttempts: 4,
  });

  assert.equal(plan.status, "retry_wait");
  assert.equal(plan.attemptCount, 2);
  assert.equal(plan.hasLateRequest, false);
  assert.deepEqual(plan.addedKeys, []);
});

test("publication thumbnail terminal failure does not create another mission", () => {
  const plan = planVideoNormalizationFailure({
    claimedKeys: PUBLICATION_KEYS,
    latestKeys: PUBLICATION_KEYS,
    retryableError: false,
    attemptCount: 1,
    maxAttempts: 4,
  });

  assert.equal(plan.status, "failed");
  assert.equal(plan.attemptCount, 1);
  assert.equal(plan.hasLateRequest, false);
});

test("the preclaimed AI/publication union is not mistaken for a late request", () => {
  for (const retryableError of [true, false]) {
    const plan = planVideoNormalizationFailure({
      claimedKeys: UNION_KEYS,
      latestKeys: UNION_KEYS,
      retryableError,
      attemptCount: 3,
      maxAttempts: 5,
    });

    assert.equal(plan.status, retryableError ? "retry_wait" : "failed");
    assert.equal(plan.attemptCount, 3);
    assert.equal(plan.hasLateRequest, false);
  }
});

test("publication arriving after the complete AI claim queues the canonical MP4", () => {
  const plan = planVideoNormalizationFailure({
    claimedKeys: AI_KEYS,
    latestKeys: UNION_KEYS,
    retryableError: false,
    attemptCount: 4,
    maxAttempts: 4,
  });

  assert.equal(plan.status, "queued");
  assert.equal(plan.attemptCount, 0);
  assert.equal(plan.hasLateRequest, true);
  assert.deepEqual(plan.addedKeys, ["canonical"]);
});

test("AI outputs arriving after a publication claim remain in the follow-up union", () => {
  const plan = planVideoNormalizationFailure({
    claimedKeys: PUBLICATION_KEYS,
    latestKeys: UNION_KEYS,
    retryableError: false,
    attemptCount: 2,
    maxAttempts: 4,
  });

  assert.equal(plan.status, "queued");
  assert.equal(plan.attemptCount, 0);
  assert.deepEqual(plan.addedKeys, [
    "frame_01",
    "frame_02",
    "frame_03",
    "audio_track",
  ]);
});
