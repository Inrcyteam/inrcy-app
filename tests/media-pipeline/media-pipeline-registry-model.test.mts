import assert from "node:assert/strict";
import test from "node:test";

import {
  LEGACY_MEDIA_PIPELINE_VERSION,
  MEDIA_WORKSPACE_MAX_IMAGES,
  MEDIA_WORKSPACE_MAX_VIDEOS,
  UNIVERSAL_MEDIA_PIPELINE_VERSION,
  clampMediaProgress,
  isMediaJobTerminal,
  isMediaReadyForPurpose,
  validateWorkspaceMediaContract,
} from "../../lib/mediaPipelineRegistry.ts";

test("le registre conserve le contrat 5 images ou 1 vidéo", () => {
  assert.equal(MEDIA_WORKSPACE_MAX_IMAGES, 5);
  assert.equal(MEDIA_WORKSPACE_MAX_VIDEOS, 1);

  assert.deepEqual(validateWorkspaceMediaContract([]), {
    ok: true,
    mediaType: null,
  });
  assert.deepEqual(validateWorkspaceMediaContract(["image", "image"]), {
    ok: true,
    mediaType: "image",
  });
  assert.deepEqual(validateWorkspaceMediaContract(["video"]), {
    ok: true,
    mediaType: "video",
  });

  assert.equal(
    validateWorkspaceMediaContract([
      "image",
      "image",
      "image",
      "image",
      "image",
      "image",
    ]).ok,
    false,
  );
  assert.equal(validateWorkspaceMediaContract(["video", "video"]).ok, false);
  assert.equal(validateWorkspaceMediaContract(["image", "video"]).ok, false);
});

test("les médias historiques restent publiables sans prétendre être normalisés", () => {
  assert.equal(LEGACY_MEDIA_PIPELINE_VERSION, 0);
  assert.equal(UNIVERSAL_MEDIA_PIPELINE_VERSION, 1);

  assert.equal(
    isMediaReadyForPurpose(
      {
        uploadStatus: "uploaded",
        aiStatus: null,
        publicationStatus: "legacy_ready",
      },
      "publish",
    ),
    true,
  );

  assert.equal(
    isMediaReadyForPurpose(
      {
        uploadStatus: "uploaded",
        aiStatus: null,
        publicationStatus: "legacy_ready",
      },
      "schedule",
    ),
    true,
  );

  assert.equal(
    isMediaReadyForPurpose(
      {
        uploadStatus: "uploaded",
        aiStatus: null,
        publicationStatus: "legacy_ready",
      },
      "ai",
    ),
    false,
  );
});

test("un média non uploadé ne peut être utilisé par aucune action", () => {
  for (const purpose of ["ai", "publish", "schedule"] as const) {
    assert.equal(
      isMediaReadyForPurpose(
        {
          uploadStatus: "uploading",
          aiStatus: "ready",
          publicationStatus: "ready",
        },
        purpose,
      ),
      false,
    );
  }
});

test("les progressions et états terminaux sont déterministes", () => {
  assert.equal(clampMediaProgress(-30), 0);
  assert.equal(clampMediaProgress(41.6), 42);
  assert.equal(clampMediaProgress(500), 100);
  assert.equal(clampMediaProgress(Number.NaN), 0);

  assert.equal(isMediaJobTerminal("queued"), false);
  assert.equal(isMediaJobTerminal("processing"), false);
  assert.equal(isMediaJobTerminal("succeeded"), true);
  assert.equal(isMediaJobTerminal("failed"), true);
  assert.equal(isMediaJobTerminal("cancelled"), true);
});
