import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const generationSource = readFileSync(
  new URL("../../app/dashboard/booster/publier/components/PublishIntentPanel.tsx", import.meta.url),
  "utf8",
);
const publicationSource = readFileSync(
  new URL("../../app/dashboard/_components/PublishExecutionProgress.tsx", import.meta.url),
  "utf8",
);

test("generation and publication progress bars remain clean without phase graduations", () => {
  assert.doesNotMatch(generationSource, /generationPhaseCaps/);
  assert.doesNotMatch(publicationSource, /publishProgressMarker|phaseCaps/);
  assert.match(generationSource, /generationProgress}%/);
  assert.match(publicationSource, /publishProgressFill/);
});

test("the internal explanatory helper below generation progress is removed", () => {
  assert.doesNotMatch(generationSource, /Chaque phase avance jusqu’à son propre plafond/);
  assert.doesNotMatch(generationSource, /uniquement lorsque les contenus sont prêts dans l’éditeur/);
});
