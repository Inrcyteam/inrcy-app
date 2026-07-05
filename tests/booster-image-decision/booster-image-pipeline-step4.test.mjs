import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("Step 4 persists explicit Adapter provenance instead of relying on opening the modal", async () => {
  const shared = await read("app/dashboard/booster/publier/publishModal.shared.tsx");
  const controller = await read("app/dashboard/booster/publier/usePublishImageController.ts");

  assert.match(shared, /customizedImageKeys\?: string\[\]/);
  assert.match(controller, /areBoosterImageTransformsEquivalent/);
  assert.match(controller, /customizedImageKeys\.add\(imageKey\)/);
  assert.match(controller, /customizedImageKeys\.delete\(imageKey\)/);
});

test("Step 4 gives explicit customization priority in preview and publication preparation", async () => {
  const panel = await read("app/dashboard/booster/publier/components/PublishImagesPanel.tsx");
  const controller = await read("app/dashboard/booster/publier/usePublishImageController.ts");

  assert.match(panel, /customized: explicitlyCustomized/);
  assert.match(controller, /customized: explicitlyCustomized/);
  assert.match(controller, /imageDecisionMode: displayPlan\.decision\.mode/);
  assert.match(controller, /isCustomized: displayPlan\.decision\.mode === "customized"/);
});

test("Step 4 keeps manual Instagram carousel framing inside the shared sequence ratio", async () => {
  const controller = await read("app/dashboard/booster/publier/usePublishImageController.ts");

  assert.match(
    controller,
    /channel === "instagram" && sequenceTargetRatio[\s\S]*buildAutomaticRenderPreset\(channel, sequenceTargetRatio\)/,
  );
  assert.match(controller, /activeEditorSequenceTargetRatio/);
  const panel = await read("app/dashboard/booster/publier/components/PublishImagesPanel.tsx");
  assert.match(
    panel,
    /decision\.mode === "customized"[\s\S]*activeImageSequenceTargetRatio/,
  );
});

test("Step 4 keeps Adapter provenance in drafts, scheduled payloads and editable attachments", async () => {
  const controller = await read("app/dashboard/booster/publier/usePublishImageController.ts");
  const route = await read("app/api/booster/publish-now/route.ts");

  assert.match(controller, /customizedImageKeys: \(editor\.customizedImageKeys \|\| \[\]\)\.filter/);
  assert.match(controller, /customizedImageKeys: actualCustomizedImageKeys/);
  assert.match(route, /imageDecisionMode/);
  assert.match(route, /isCustomized: raw\.isCustomized === true/);
});
