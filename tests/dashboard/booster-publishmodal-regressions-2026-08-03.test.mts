import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

const publishModal = read("app/dashboard/booster/publier/PublishModal.tsx");
const contentEditor = read(
  "app/dashboard/booster/publier/components/PublishContentEditorPanel.tsx",
);
const imagesPanel = read(
  "app/dashboard/booster/publier/components/PublishImagesPanel.tsx",
);
const videoAdapter = read(
  "app/dashboard/booster/publier/components/PublishVideoAdapterPanel.tsx",
);
const videoManager = read(
  "app/dashboard/booster/publier/components/BoosterVideoFormatManager.tsx",
);

test("channel titles keep raw spaces while the user is typing", () => {
  assert.ok(
    (contentEditor.match(/\{ title: e\.target\.value \},\s*\{ sanitize: false \}/g) || [])
      .length >= 2,
  );
  assert.doesNotMatch(publishModal, /\[ctaDefaults, postsByChannel\]/);
  assert.match(publishModal, /\}, \[ctaDefaults\]\);/);
});

test("block 4 exposes both channel removal and global video deletion", () => {
  assert.match(publishModal, /removeVideo=\{removeVideo\}/);
  assert.match(imagesPanel, /removeVideo: \(\) => void/);
  assert.match(imagesPanel, /onDeleteVideo=\{removeVideo\}/);
  assert.match(videoAdapter, /onDeleteVideo=\{onDeleteVideo\}/);
  assert.match(videoManager, /Supprimer la vidéo de toute la publication/);
  assert.match(videoManager, /Retirer du canal/);
  assert.doesNotMatch(videoManager, /\) : onDeleteVideo \? \(/);
});
