import assert from "node:assert/strict";
import test from "node:test";

import { buildMediaLibraryDownloadFileName } from "../../lib/mediaLibraryFileName.ts";
import { isInrMediaVideoFile } from "../../lib/mediaRules.ts";

test("une copie compressÃ©e garde son vrai nom MP4 malgrÃ© un titre sans extension", () => {
  const name = buildMediaLibraryDownloadFileName({
    media_type: "video",
    original_file_name:
      "0_Social_Media_Lower_Thirds_1280x720-compresse-75mo.mp4",
    storage_path: "users/pro/media/opaque-id.mp4",
    title: "0_Social_Media_Lower_Thirds_1280x720 â€” compressÃ©",
  });

  assert.equal(
    name,
    "0_Social_Media_Lower_Thirds_1280x720-compresse-75mo.mp4",
  );
  assert.equal(isInrMediaVideoFile({ name, type: "video/mp4" }), true);
});

test("le chemin Storage est utilisÃ© avant le titre quand le nom original manque", () => {
  const name = buildMediaLibraryDownloadFileName({
    media_type: "video",
    storage_path: "users/pro/optimised/copied-video.mp4",
    title: "Copie compressÃ©e",
  });

  assert.equal(name, "copied-video.mp4");
  assert.equal(isInrMediaVideoFile({ name, type: "video/mp4" }), true);
});

test("une ancienne ligne sans extension reÃ§oit un nom MP4 valide", () => {
  const name = buildMediaLibraryDownloadFileName({
    media_type: "video",
    storage_path: "",
    title: "VidÃ©o historique compressÃ©e",
  });

  assert.equal(name, "VidÃ©o historique compressÃ©e.mp4");
  assert.equal(isInrMediaVideoFile({ name, type: "video/mp4" }), true);
});
