import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { AI_ENGINE_OPTIONS } from "../../lib/aiEnginePreference.ts";
import { AI_FEATURE_POLICIES } from "../../lib/aiGatewayPolicy.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

test("Step 6 ter separates hard rules from soft editorial preferences", () => {
  const profile = read("lib/aiWritingProfile.ts");
  assert.match(profile, /RÈGLES DURES/i);
  assert.match(profile, /PRÉFÉRENCES SOUPLES/i);
  assert.match(profile, /personnalité et une direction, pas une recette/i);
  assert.match(profile, /CTA séparé n'est pas obligatoire/i);
  assert.match(profile, /Ne jamais réécrire un bon texte uniquement pour le faire rentrer dans un gabarit/i);
});

test("all eight selectable engines receive explicit permission to keep a native editorial voice", () => {
  const profile = read("lib/aiWritingProfile.ts");
  assert.equal(AI_ENGINE_OPTIONS.length, 8);
  for (const engine of AI_ENGINE_OPTIONS) {
    assert.match(profile, new RegExp(`${engine.value}:`));
  }
  assert.match(profile, /Exploite ta propre voix et ton propre jugement éditorial/i);
  assert.match(profile, /Ne cherche pas à imiter ChatGPT, Claude, Gemini, Mistral, Grok, Perplexity, DeepSeek, Llama/i);
});

test("creative latitude follows the user's originality setting without changing hard constraints", () => {
  const profile = read("lib/aiWritingProfile.ts");
  assert.match(profile, /LIBERTÉ ÉLEVÉE/i);
  assert.match(profile, /LIBERTÉ MODÉRÉE/i);
  assert.match(profile, /LIBERTÉ ÉQUILIBRÉE/i);
  assert.match(profile, /ai_creativity/i);
});

test("Booster keeps airy paragraphs but removes fixed layout and emoji quotas", () => {
  const prompt = read("lib/boosterPrompt.ts");
  assert.match(prompt, /paragraphes courts pour TOUS les canaux/i);
  assert.match(prompt, /deux sauts de ligne consécutifs/i);
  assert.match(prompt, /laisser le moteur choisir librement le nombre de paragraphes utile/i);
  assert.match(prompt, /intensité, pas un quota numérique exact/i);
  assert.doesNotMatch(prompt, /3 à 5 emojis obligatoires/i);
  assert.doesNotMatch(prompt, /4 à 8 emojis obligatoires/i);
});

test("CTA is no longer a reason to rewrite an otherwise publishable Booster result", () => {
  const generation = read("lib/boosterPublishGeneration.ts");
  const prompt = read("lib/boosterPrompt.ts");
  assert.match(generation, /un CTA séparé est une préférence éditoriale, pas un motif de/i);
  assert.match(generation, /const missingChannels = channels\.filter\(\(channel\) => !hasCorePublishableContent/i);
  assert.match(prompt, /La clé cta doit toujours exister mais peut contenir ""/i);
  assert.match(generation, /La clé cta peut rester vide si un CTA séparé n'apporte rien/i);
});

test("anti-duplication only regenerates quasi copies instead of normal same-topic vocabulary", () => {
  const generation = read("lib/boosterPublishGeneration.ts");
  assert.match(generation, /jaccard >= 0\.92/);
  assert.match(generation, /lengthRatio >= 0\.86/);
  assert.match(generation, /Seules les copies quasi/i);
});

test("mail and campaign generators no longer force the same salutation-CTA-ending template", () => {
  const templates = read("lib/templateAiGeneration.ts");
  const mails = read("app/api/mails/generate-ai/route.ts");
  assert.match(templates, /Salutation, CTA séparé et formule de fin ne sont pas obligatoires/i);
  assert.match(templates, /ne reproduis pas automatiquement la structure du modèle de départ/i);
  assert.match(mails, /une salutation et une fin simple sont possibles mais pas obligatoires/i);
});

test("engine preference is passed into shared writing-freedom rules across writing modules", () => {
  const files = [
    "lib/boosterPrompt.ts",
    "lib/templateAiGeneration.ts",
    "app/api/mails/generate-ai/route.ts",
    "app/api/e-reputation/google/generate-reply/route.ts",
    "app/api/e-reputation/trustpilot/generate-reply/route.ts",
  ];
  for (const file of files) {
    const source = read(file);
    assert.match(source, /buildAiWritingProfileRules\([\s\S]*preferredEngine|buildAiWritingProfileRules\([\s\S]*getAiPreferredEngineFromBusiness/i, file);
  }
});

test("text generation capacities remain unchanged after creative freedom changes", () => {
  assert.equal(AI_FEATURE_POLICIES["booster.publish"].maxOutputTokens, 8000);
  assert.equal(AI_FEATURE_POLICIES["agent.publish"].maxOutputTokens, 8000);
  assert.equal(AI_FEATURE_POLICIES["booster.youtube-rescue"].maxOutputTokens, 8000);
  assert.equal(AI_FEATURE_POLICIES["templates.generate"].maxOutputTokens, 3000);

  const generation = read("lib/boosterPublishGeneration.ts");
  assert.match(generation, /siteChannel \? 6000 : 2000/);
  assert.match(generation, /youtube_shorts:\s*2100/);
  assert.match(generation, /site_web:\s*2200/);
});

test("iNrAgent publishing explicitly preserves the selected engine's native voice", () => {
  const agent = read("app/api/agent/actions/prepare-publish/route.ts");
  assert.match(agent, /Préserve la voix native du moteur IA choisi par l'établissement/i);
  assert.match(agent, /un CTA séparé reste facultatif/i);
});
