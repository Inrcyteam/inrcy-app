import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

test("Step 10 nonies hides advanced publishing blocks until generation or manual creation", () => {
  const modal = read("app/dashboard/booster/publier/PublishModal.tsx");

  assert.match(modal, /const \[contentWorkspaceOpen, setContentWorkspaceOpen\] = useState\(false\)/);
  assert.match(modal, /\{contentWorkspaceOpen \? \(/);
  assert.match(modal, /<PublishContentEditorPanel/);
  assert.match(modal, /<PublishImagesPanel/);
  assert.match(modal, /<PublishPreviewPanel/);
  assert.match(modal, /<PublishFooterActions/);
});

test("Step 10 nonies opens empty manual content without disabling later AI generation", () => {
  const modal = read("app/dashboard/booster/publier/PublishModal.tsx");
  const panel = read(
    "app/dashboard/booster/publier/components/PublishIntentPanel.tsx",
  );

  assert.match(modal, /const onCreateManually = \(\) => \{/);
  assert.match(modal, /setContentWorkspaceOpen\(true\)/);
  assert.match(modal, /onCreateManually=\{onCreateManually\}/);
  assert.match(panel, /onCreateManually:\s*\(\) => void/);
  assert.match(panel, /Créer manuellement/);

  const buttons = panel.match(
    /Générer avec iNrCy[\s\S]*?Réinitialiser[\s\S]*?Créer manuellement/,
  );
  assert.ok(buttons, "The three actions stay ordered: AI, reset, manual");
  assert.match(panel, /onClick=\{onGenerate\}/);
});

test("Step 10 nonies protects existing manual text before an AI replacement", () => {
  const modal = read("app/dashboard/booster/publier/PublishModal.tsx");

  assert.match(modal, /if \(hasWrittenChannelContent\)/);
  assert.match(modal, /Générer de nouveaux contenus \?/);
  assert.match(modal, /Les textes déjà saisis ou générés seront remplacés/);
  assert.match(modal, /Conserver mes textes/);
  assert.match(modal, /Générer et remplacer/);
});

test("Step 10 nonies restores advanced blocks for drafts with content and closes them on reset", () => {
  const modal = read("app/dashboard/booster/publier/PublishModal.tsx");

  assert.match(modal, /if \(hasWrittenChannelContent\) setContentWorkspaceOpen\(true\)/);
  assert.match(modal, /setContentWorkspaceOpen\(false\)/);
  assert.match(modal, /setPostsByChannel\(\{\}\)/);
});

test("Step 10 nonies numbers the five publishing blocks in order", () => {
  const sources = [
    read("app/dashboard/booster/publier/components/PublishChannelSelector.tsx"),
    read("app/dashboard/booster/publier/components/PublishIntentPanel.tsx"),
    read("app/dashboard/booster/publier/components/PublishContentEditorPanel.tsx"),
    read("app/dashboard/booster/publier/components/PublishImagesPanel.tsx"),
    read("app/dashboard/booster/publier/components/PublishPreviewPanel.tsx"),
  ];

  sources.forEach((source, index) => {
    assert.match(source, new RegExp(`>\\s*${index + 1}\\s*<\\/span>`));
  });
});
