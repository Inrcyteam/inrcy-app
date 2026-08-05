import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(
  new URL("../../app/dashboard/booster/publier/publishModal.shared.tsx", import.meta.url),
  "utf8",
);
const legacyRoute = readFileSync(
  new URL("../../app/api/booster/upload-video/route.ts", import.meta.url),
  "utf8",
);

test("a failed large TUS transfer never restarts as a monolithic signed upload", () => {
  assert.match(
    client,
    /file\.size > UNIVERSAL_MEDIA_STANDARD_UPLOAD_MAX_BYTES[\s\S]*throw error/,
  );
});

test("the legacy multipart endpoint refuses large video bodies before arrayBuffer", () => {
  const guard = legacyRoute.indexOf(
    "file.size > LEGACY_MULTIPART_VIDEO_MAX_BYTES",
  );
  const materialization = legacyRoute.indexOf("file.arrayBuffer()");
  assert.ok(guard > 0);
  assert.ok(materialization > guard);
  assert.match(legacyRoute, /direct_resumable_upload_required/);
});
