import assert from "node:assert/strict";
import test from "node:test";

import {
  UNIVERSAL_MEDIA_STANDARD_UPLOAD_MAX_BYTES,
  UNIVERSAL_MEDIA_TUS_CHUNK_SIZE_BYTES,
  buildDirectStorageResumableEndpoint,
  detectUniversalUploadMediaType,
  getUniversalMediaContentType,
  selectUniversalMediaUploadProtocol,
  targetAcceptsUniversalMediaType,
} from "../../lib/mediaUploadPolicy.ts";

test("le transport standard reste réservé aux fichiers de 6 Mo ou moins", () => {
  assert.equal(UNIVERSAL_MEDIA_STANDARD_UPLOAD_MAX_BYTES, 6 * 1024 * 1024);
  assert.equal(UNIVERSAL_MEDIA_TUS_CHUNK_SIZE_BYTES, 6 * 1024 * 1024);
  assert.equal(
    selectUniversalMediaUploadProtocol(UNIVERSAL_MEDIA_STANDARD_UPLOAD_MAX_BYTES),
    "signed",
  );
  assert.equal(
    selectUniversalMediaUploadProtocol(
      UNIVERSAL_MEDIA_STANDARD_UPLOAD_MAX_BYTES + 1,
    ),
    "tus",
  );
});

test("les formats courants sont reconnus même lorsque le navigateur fournit peu de MIME", () => {
  assert.equal(
    detectUniversalUploadMediaType({ name: "photo.HEIC", mimeType: "" }),
    "image",
  );
  assert.equal(
    detectUniversalUploadMediaType({ name: "visite.MKV", mimeType: "" }),
    "video",
  );
  assert.equal(
    detectUniversalUploadMediaType({ name: "sans-extension", mimeType: "video/mp4" }),
    "video",
  );
  assert.equal(
    getUniversalMediaContentType({
      name: "clip.mov",
      mimeType: "",
      mediaType: "video",
    }),
    "video/quicktime",
  );
});

test("les destinations n'acceptent jamais un type incohérent", () => {
  assert.equal(
    targetAcceptsUniversalMediaType("booster_prepared_image", "image"),
    true,
  );
  assert.equal(
    targetAcceptsUniversalMediaType("booster_prepared_image", "video"),
    false,
  );
  assert.equal(
    targetAcceptsUniversalMediaType("booster_video_source", "video"),
    true,
  );
  assert.equal(
    targetAcceptsUniversalMediaType("booster_video_source", "image"),
    false,
  );
  assert.equal(targetAcceptsUniversalMediaType("workspace_source", "image"), true);
  assert.equal(targetAcceptsUniversalMediaType("workspace_source", "video"), true);
});

test("l'endpoint TUS utilise le hostname Storage direct du projet", () => {
  assert.equal(
    buildDirectStorageResumableEndpoint("https://abcxyz.supabase.co"),
    "https://abcxyz.storage.supabase.co/storage/v1/upload/resumable",
  );
});
