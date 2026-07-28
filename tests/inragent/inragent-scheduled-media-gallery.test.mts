import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (relativePath: string) =>
  readFileSync(resolve(ROOT, relativePath), "utf8");

const client = read("app/dashboard/agent/AgentClient.tsx");
const api = read("app/api/agent/actions/route.ts");

test("iNrAgent appends scheduled images without replacing the selected image", () => {
  assert.match(
    client,
    /type PublishMediaMutation = "append" \| "replace" \| "remove"/,
  );
  assert.match(
    client,
    /mutation === "append"[\s\S]*?nextImages = \[\.\.\.channelImages, media\]\.slice\([\s\S]*?INR_MEDIA_PUBLICATION_MAX_IMAGE_COUNT/,
  );
  assert.match(
    client,
    /item\.media_type === "image" \? "append" : "replace"/,
  );
  assert.match(
    client,
    /uploadPublishMedia\([\s\S]*?= "append"/,
  );
});

test("image adaptation replaces only the active image and video replaces the gallery", () => {
  assert.match(client, /uploadPublishMedia\(renderedFile, "replace"\)/);
  assert.match(
    client,
    /transformedVariants,[\s\S]*?},[\s\S]*?"replace",[\s\S]*?\);/,
  );
  assert.match(
    client,
    /mediaKind === "video"[\s\S]*?imagesByChannel\[displayKey\] = \[\]/,
  );
});

test("the image gallery is capped at five in the UI and API", () => {
  assert.match(client, /publishImageLimitReached/);
  assert.match(client, /Maximum de \$\{INR_MEDIA_PUBLICATION_MAX_IMAGE_COUNT\} images atteint/);
  assert.match(api, /mediaOperation: "append" \| "replace" \| "remove"/);
  assert.match(
    api,
    /readCurrentChannelImages\(targetChannel\)\.length >=[\s\S]*?INR_MEDIA_PUBLICATION_MAX_IMAGE_COUNT/,
  );
  assert.match(api, /status: 409/);
});

test("removing an image removes only the active index", () => {
  assert.match(
    client,
    /currentImages\.filter\(\(_, index\) => index !== removeIndex\)/,
  );
  assert.match(
    api,
    /currentImages\.filter\(\(_, index\) => index !== removeIndex\)/,
  );
  assert.match(client, /mediaIndex: publishMediaActiveIndex/);
});
