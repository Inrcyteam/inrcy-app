import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("normal publication keeps compatible originals and requires explicit adaptations", async () => {
  const [modal, prewarm, publishRoute, channelContext, workspaceHook] = await Promise.all([
    read("app/dashboard/booster/publier/PublishModal.tsx"),
    read("app/api/media-pipeline/workspace/prewarm/route.ts"),
    read("app/api/booster/publish-now/route.ts"),
    read("app/api/booster/publish-now/publishNow.channel-context.ts"),
    read("app/dashboard/booster/publier/usePersistentMediaWorkspace.ts"),
  ]);
  const publish = `${publishRoute}\n${channelContext}`;

  assert.doesNotMatch(modal, /startBackgroundVideoPrewarm/);
  assert.match(
    modal,
    /const directOriginalAvailable =[\s\S]*canPublishVideoSourceDirectly/,
  );
  assert.match(modal, /generateMissingVideoVariants:\s*false,[\s\S]{0,140}allowOriginalVideoFallback:\s*true/);
  assert.doesNotMatch(modal, /prepareCutoverVideoVariants/);
  const immediatePublish = modal.slice(
    modal.indexOf("const runPublish = async"),
    modal.indexOf("const onSavePublicationDraft = async"),
  );
  assert.doesNotMatch(
    immediatePublish,
    /ensureCutoverVideoVariantsReady|prewarmPersistentMediaWorkspace/,
  );
  assert.match(modal, /deferTechnicalPreparationUntilPublish=/);
  assert.match(
    prewarm,
    /allowsOriginalVideoFallback\(request\.channel\)[\s\S]{0,120}sourceValidation\.ok/,
  );
  assert.match(prewarm, /const ready = invalidChannels\.length === 0/);
  assert.doesNotMatch(publishRoute, /requiresPreparedNetworkVideoVariant/);
  assert.match(
    publishRoute,
    /usesOriginalSource && sourceDirectlyPublishable[\s\S]*return \[\]/,
  );
  assert.match(publishRoute, /reason:\s*"video_variant_required"/);
  assert.match(publish, /const usesOriginalSource = settings\.format === "original"/);
  assert.match(
    publish,
    /if \(usesOriginalSource\) \{\s*return sourceValidation\.ok \? publicationVideo : null;\s*\}/,
  );
  assert.match(
    publish,
    /if \(!variant\?\.publicUrl \|\| !variant\?\.storagePath\) \{\s*return null;\s*\}/,
  );
  assert.doesNotMatch(publish, /preparePublicationVariants\(true\)/);
  assert.doesNotMatch(publish, /if \(!variantResult\.ok \|\| invalidVideoChannels\.length > 0\)/);
  assert.doesNotMatch(workspaceHook, /background video prewarm skipped/);
});
