import assert from "node:assert/strict";
import test from "node:test";

import { getProviderPublicationErrorMessage } from "../../lib/publicationErrorFrench.ts";

test("TikTok file format errors are contextual and never video by default", () => {
  const code = "file_format_check_failed";
  const photo = getProviderPublicationErrorMessage("tiktok", code, {
    mediaKind: "photo",
  });
  const video = getProviderPublicationErrorMessage("tiktok", code, {
    mediaKind: "video",
  });
  const unknown = getProviderPublicationErrorMessage("tiktok", code);

  assert.match(photo || "", /photo/i);
  assert.doesNotMatch(photo || "", /vidéo/i);
  assert.match(video || "", /vidéo/i);
  assert.match(unknown || "", /média/i);
  assert.doesNotMatch(unknown || "", /vidéo/i);
});
