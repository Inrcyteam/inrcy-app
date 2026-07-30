import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("normal publication reuses a prepared variant or safely publishes the compatible original", async () => {
  const [modal, prewarm, publish, workspaceHook] = await Promise.all([
    read("app/dashboard/booster/publier/PublishModal.tsx"),
    read("app/api/media-pipeline/workspace/prewarm/route.ts"),
    read("app/api/booster/publish-now/route.ts"),
    read("app/dashboard/booster/publier/usePersistentMediaWorkspace.ts"),
  ]);

  assert.match(modal, /generateMissingVideoVariants:\s*false,[\s\S]{0,100}allowOriginalVideoFallback:\s*true/);
  assert.match(modal, /generateMissingVideoVariants:\s*true,[\s\S]{0,100}allowOriginalVideoFallback:\s*false/);
  assert.match(prewarm, /allowOriginalVideoFallback && sourceValidation\.ok/);
  assert.match(prewarm, /const ready = invalidChannels\.length === 0/);
  assert.match(publish, /if \(sourceValidation\.ok\) return \[\]/);
  assert.match(publish, /if \(!variantValidation\.ok\)[\s\S]{0,100}return sourceValidation\.ok \? publicationVideo : null/);
  assert.doesNotMatch(publish, /if \(!variantResult\.ok \|\| invalidVideoChannels\.length > 0\)/);
  assert.doesNotMatch(workspaceHook, /background video prewarm skipped/);
});
