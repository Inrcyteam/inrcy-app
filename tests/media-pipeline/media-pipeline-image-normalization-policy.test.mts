import assert from "node:assert/strict";
import test from "node:test";
import {
  IMAGE_AI_PREVIEW_MAX_SIDE,
  IMAGE_CANONICAL_MAX_SIDE,
  IMAGE_THUMBNAIL_MAX_SIDE,
  buildImageNormalizationStoragePath,
  getImageNormalizationRetryDelaySeconds,
  getImageNormalizationSignature,
  isHeicMimeOrName,
} from "../../lib/mediaImageNormalizationPolicy.ts";

test("les trois tailles de normalisation restent hiérarchisées", () => {
  assert.equal(IMAGE_CANONICAL_MAX_SIDE, 4096);
  assert.equal(IMAGE_AI_PREVIEW_MAX_SIDE, 1280);
  assert.equal(IMAGE_THUMBNAIL_MAX_SIDE, 480);
});

test("les signatures et chemins sont stables et privés par compte", () => {
  assert.equal(
    getImageNormalizationSignature("canonical"),
    "inrcy:image:canonical:v1",
  );
  assert.equal(
    buildImageNormalizationStoragePath({
      accountId: "account-123",
      mediaId: "media-456",
      purpose: "ai_preview",
      extension: "jpg",
    }),
    "users/account-123/normalized/image/v1/media-456/ai_preview.jpg",
  );
});

test("le backoff image augmente puis reste plafonné", () => {
  assert.equal(getImageNormalizationRetryDelaySeconds(1), 30);
  assert.equal(getImageNormalizationRetryDelaySeconds(2), 60);
  assert.equal(getImageNormalizationRetryDelaySeconds(8), 900);
});

test("HEIC et HEIF sont reconnus par MIME ou extension", () => {
  assert.equal(isHeicMimeOrName("image/heic"), true);
  assert.equal(isHeicMimeOrName("", "photo.HEIF"), true);
  assert.equal(isHeicMimeOrName("image/jpeg", "photo.jpg"), false);
});
