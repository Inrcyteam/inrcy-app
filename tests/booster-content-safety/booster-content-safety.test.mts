import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  hasAiGeneratedCitationArtifacts,
  sanitizeAiGeneratedEditorialText,
} from "../../lib/aiGeneratedTextSafety.ts";

test("AI citation markers are removed without flattening paragraphs", () => {
  const input = `Premier conseil utile[1].\n\nDeuxième conseil[2][4][8] avec une phrase propre 【3†source】.`;
  const cleaned = sanitizeAiGeneratedEditorialText(input);

  assert.equal(
    cleaned,
    "Premier conseil utile.\n\nDeuxième conseil avec une phrase propre.",
  );
  assert.equal(hasAiGeneratedCitationArtifacts(cleaned), false);
});

test("a trailing sources or references block is removed", () => {
  const input = `Publication prête à diffuser.\n\nSources:\n[1] https://example.test\n[2] Une étude externe`;
  assert.equal(
    sanitizeAiGeneratedEditorialText(input),
    "Publication prête à diffuser.",
  );
});

test("ordinary numbers and useful brackets are preserved", () => {
  const input = "Découvrez nos 5 conseils, disponibles de 9 h à 18 h, avec l'offre [PRO].";
  assert.equal(sanitizeAiGeneratedEditorialText(input), input);
});

test("the shared Booster prompt requires proofreading and forbids citations", () => {
  const source = readFileSync(new URL("../../lib/boosterPrompt.ts", import.meta.url), "utf8");
  assert.match(source, /Orthographe, grammaire, conjugaison, accords, ponctuation et typographie/);
  assert.match(source, /Aucune citation, note de bas de page, référence, bibliographie/);
  assert.match(source, /\[1\][\s\S]*\[2\]\[4\]/);
});

test("Sonar receives the dedicated no-source and no-invented-local-fact rule", () => {
  const boosterPrompt = readFileSync(new URL("../../lib/boosterPrompt.ts", import.meta.url), "utf8");
  const writingProfile = readFileSync(new URL("../../lib/aiWritingProfile.ts", import.meta.url), "utf8");

  assert.match(boosterPrompt, /SÉCURITÉ SONAR/);
  assert.match(boosterPrompt, /ne restitue jamais de citations, sources ou références de recherche/);
  assert.match(boosterPrompt, /nom de quartier, lieu précis, entreprise ou fait local absent/);
  assert.match(writingProfile, /ne restitue jamais de citations, sources, références ou marqueurs comme \[1\]/);
});

test("generated Booster posts are sanitized before channel formatting and length capping", () => {
  const source = readFileSync(new URL("../../lib/boosterPublishGeneration.ts", import.meta.url), "utf8");
  assert.match(source, /sanitizeAiGeneratedEditorialText\(raw\?\.title\)/);
  assert.match(source, /sanitizeAiGeneratedEditorialText\(raw\?\.content\)/);
  assert.match(source, /sanitizeAiGeneratedEditorialText\(raw\?\.cta\)/);
  assert.match(source, /limitBoosterGeneratedContent\(/);
});
