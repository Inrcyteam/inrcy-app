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
  assert.match(generation, /collectChannelQualityIssues\(/);
  assert.match(generation, /hasCorePublishableContent\(channel, post\)/);
  assert.doesNotMatch(generation, /missingCta|cta_missing|missing_cta/);
  assert.match(prompt, /La clé cta doit toujours exister mais peut contenir ""/i);
  assert.match(prompt, /Le CTA préféré est une orientation, pas une obligation/i);
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
  ];
  for (const file of files) {
    const source = read(file);
    assert.match(
      source,
      /buildAiWritingProfileRules\([\s\S]*preferredEngine|buildAiWritingProfileRules\([\s\S]*getAiPreferredEngineFromBusiness|buildCompactAiWritingDirective\([\s\S]*preferences\.engine/i,
      file,
    );
  }
});

test("text generation capacities remain unchanged after creative freedom changes", () => {
  assert.equal(AI_FEATURE_POLICIES["booster.publish"].maxOutputTokens, 10_000);
  assert.equal(AI_FEATURE_POLICIES["agent.publish"].maxOutputTokens, 10_000);
  assert.equal(AI_FEATURE_POLICIES["templates.generate"].maxOutputTokens, 3000);

  const generation = read("lib/boosterPublishGeneration.ts");
  assert.match(generation, /siteChannel \? 6000 : 2000/);
  assert.match(generation, /youtube_shorts:\s*950/);
  assert.match(generation, /site_web:\s*1100/);
  assert.match(generation, /Math\.min\(10_000, Math\.max\(minimum, contentBudget\)\)/);
});

test("iNrAgent publishing explicitly preserves the selected engine's native voice", () => {
  const agent = read("app/api/agent/actions/prepare-publish/route.ts");
  assert.match(agent, /Préserve la voix native du moteur IA choisi par l'établissement/i);
  assert.match(agent, /un CTA séparé reste facultatif/i);
});


test("creative synonym reformulations and normal same-topic overlap are advisory only", () => {
  const generation = read("lib/boosterPublishGeneration.ts");
  assert.match(
    generation,
    /const REPAIR_TRIGGER_ISSUES = new Set<ChannelQualityIssue>\(\[[\s\S]*"missing"[\s\S]*"meta_leak"[\s\S]*"language_mismatch"[\s\S]*"too_short_editorial"[\s\S]*\]\);/,
  );
  assert.match(generation, /advisoryChannels/);
  assert.match(generation, /!REPAIR_TRIGGER_ISSUES\.has\(issue\)/);
  assert.match(generation, /L'ancrage lexical exact est volontairement non bloquant/i);
  assert.match(generation, /unsafe channels after single repair/);
  assert.doesNotMatch(generation, /attempt > 0/);
});


test("detailed Booster length is a strong editorial target but never a final 502 condition", () => {
  const prompt = read("lib/boosterPrompt.ts");
  const generation = read("lib/boosterPublishGeneration.ts");

  assert.match(prompt, /detailed: "DÉTAILLÉ"/i);
  assert.match(prompt, /PRIORITÉ ÉDITORIALE/i);
  assert.match(prompt, /site_web: "1600–2600 car\."/i);
  assert.match(prompt, /youtube_shorts: "900–1700 car\."/i);
  assert.match(prompt, /Les plages ci-dessous pilotent réellement la quantité de texte attendue/i);

  assert.match(generation, /CHANNEL_DETAILED_ENRICHMENT_MIN/);
  assert.match(generation, /too_short_editorial/);
  assert.match(generation, /Une longueur éditoriale encore inférieure à la cible ne provoque jamais/i);
  assert.match(generation, /improvesLength/);
});
