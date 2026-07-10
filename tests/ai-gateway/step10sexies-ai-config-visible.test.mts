import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

test("Step 10 sexies makes tone, style, commercial level and main goal visibly influential", () => {
  const writing = read("lib/aiWritingProfile.ts");

  for (const marker of [
    "TONE_EXECUTION_DIRECTIVES",
    "TEXT_STYLE_EXECUTION_DIRECTIVES",
    "COMMERCIAL_EXECUTION_DIRECTIVES",
    "MAIN_GOAL_EXECUTION_DIRECTIVES",
    "PREFERRED_ANGLE_EXECUTION_DIRECTIVES",
    "VOICE_EXECUTION_DIRECTIVES",
    "ADDRESS_EXECUTION_DIRECTIVES",
  ]) {
    assert.match(writing, new RegExp(marker));
  }

  assert.match(writing, /PRÉFÉRENCES SOUPLES MAIS VISIBLES/i);
  assert.match(writing, /EXÉCUTION CONFIG IA/i);
  assert.match(writing, /CONFIG IA À RENDRE VISIBLE/i);
  assert.match(writing, /sans imposer de gabarit ni devenir des motifs de rejet technique/i);
});

test("Step 10 sexies gives Booster a real non-blocking emoji policy per requested channel", () => {
  const prompt = read("lib/boosterPrompt.ts");

  assert.match(prompt, /CHANNEL_EMOJI_TARGETS/);
  assert.match(prompt, /buildBoosterEmojiDirective/);
  assert.match(prompt, /POLITIQUE EMOJIS/);
  assert.match(prompt, /EMOJIS BEAUCOUP — INTENSITÉ VISIBLE|BEAUCOUP/);
  assert.match(prompt, /inrcy_site: "0 emoji malgré le niveau Beaucoup/i);
  assert.match(prompt, /linkedin: "1–3 emojis maximum/i);
  assert.match(prompt, /tiktok: "4–8 emojis visibles/i);
  assert.match(prompt, /jamais un motif de 502 ou de réparation à eux seuls/i);
});

test("Step 10 sexies keeps the full liked-example allowance in the compact Booster payload", () => {
  const prompt = read("lib/boosterPrompt.ts");
  assert.match(prompt, /exemple_aime: cleanText\(preferences\.likedExample, 1200\)/);
  assert.doesNotMatch(prompt, /exemple_aime: cleanText\(preferences\.likedExample, 700\)/);
});

test("Step 10 sexies does not add tone, emoji or commercial preferences to repair triggers", () => {
  const generation = read("lib/boosterPublishGeneration.ts");
  const repairTriggerBlock = generation.match(
    /const REPAIR_TRIGGER_ISSUES = new Set<ChannelQualityIssue>\(\[([\s\S]*?)\]\);/,
  );
  assert.ok(repairTriggerBlock, "repair trigger block must exist");
  const block = repairTriggerBlock[1];
  assert.doesNotMatch(block, /emoji|tone|commercial|goal|style/i);
  assert.match(block, /"missing"/);
  assert.match(block, /"meta_leak"/);
  assert.match(block, /"language_mismatch"/);
});
