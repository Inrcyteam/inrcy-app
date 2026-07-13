import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  INR_SEARCH_CONTENT_MAX_LENGTH,
  limitBoosterChannelContent,
} from "../../lib/boosterChannelRules.ts";

const root = process.cwd();
const read = (relativePath: string) =>
  readFile(join(root, relativePath), "utf8");

test("iNrSearch content is capped at 300 characters before publication", () => {
  const longText = "x".repeat(INR_SEARCH_CONTENT_MAX_LENGTH + 40);
  assert.equal(
    limitBoosterChannelContent("inr_search", longText).length,
    INR_SEARCH_CONTENT_MAX_LENGTH,
  );
  assert.equal(limitBoosterChannelContent("facebook", longText), longText);
});

test("Booster exposes iNrSearch in content, generation and image channel flows", async () => {
  const [modal, imageController, contentEditor, mediaPanel, shared, prompt, generation] =
    await Promise.all([
      read("app/dashboard/booster/publier/PublishModal.tsx"),
      read("app/dashboard/booster/publier/usePublishImageController.ts"),
      read("app/dashboard/booster/publier/components/PublishContentEditorPanel.tsx"),
      read("app/dashboard/booster/publier/components/PublishImagesPanel.tsx"),
      read("app/dashboard/booster/publier/publishModal.shared.tsx"),
      read("lib/boosterPrompt.ts"),
      read("lib/boosterPublishGeneration.ts"),
    ]);

  assert.match(modal, /CHANNEL_KEYS: ChannelKey\[\] = BOOSTER_CHANNEL_ORDER/);
  assert.match(modal, /CHANNEL_KEYS\.filter\(\(channel\) => channels\[channel\] && connected\[channel\]\)/);
  assert.match(imageController, /BOOSTER_CHANNEL_ORDER\.filter/);
  assert.match(contentEditor, /Phrase courte iNr'Search/);
  assert.match(mediaPanel, /flexWrap: "nowrap"/);
  assert.match(mediaPanel, /calc\(\(100% - 54px\) \/ 10\)/);
  assert.match(shared, /content: INR_SEARCH_CONTENT_MAX_LENGTH/);
  assert.match(shared, /"site_web",\s*"gmb",\s*"inr_search"/);
  assert.match(prompt, /INR_SEARCH_CONTENT_MAX_LENGTH/);
  assert.match(generation, /inr_search:\s*12/);
  assert.match(generation, /limitBoosterChannelContent/);
});

test("the immediate and iNrSend publication paths enforce the same iNrSearch limit", async () => {
  const [publishRoute, inrSend] = await Promise.all([
    read("app/api/booster/publish-now/route.ts"),
    read("lib/inrsend/publicationChannelActions.ts"),
  ]);

  assert.match(publishRoute, /limitBoosterChannelContent/);
  assert.match(inrSend, /limitBoosterChannelContent/);
});
