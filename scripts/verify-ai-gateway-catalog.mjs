#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = process.cwd();
const SOURCE = resolve(ROOT, "lib/aiEnginePreference.ts");
const CATALOG_URL = "https://ai-gateway.vercel.sh/v1/models";
const MIN_REQUIRED_OUTPUT_TOKENS = 8000;

function parseEngineOptions(source) {
  const regex = /\{\s*value:\s*"([^"]+)"[\s\S]*?shortLabel:\s*"([^"]+)"[\s\S]*?model:\s*"([^"]+)"[\s\S]*?supportsVision:\s*(true|false)[\s\S]*?jsonMode:\s*"([^"]+)"[\s\S]*?\}/g;
  return Array.from(source.matchAll(regex), (match) => ({
    engine: match[1],
    label: match[2],
    model: match[3],
    supportsVision: match[4] === "true",
    jsonMode: match[5],
  }));
}

async function main() {
  const source = await readFile(SOURCE, "utf8");
  const engines = parseEngineOptions(source);
  if (engines.length !== 8) {
    throw new Error(`Catalogue iNrCy invalide : 8 moteurs attendus, ${engines.length} détectés.`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  let response;
  try {
    response = await fetch(CATALOG_URL, {
      headers: { Accept: "application/json", "User-Agent": "iNrCy-AI-Gateway-QA/step6" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) throw new Error(`Catalogue Vercel indisponible (${response.status}).`);
  const payload = await response.json();
  const models = new Map((Array.isArray(payload?.data) ? payload.data : []).map((model) => [model.id, model]));

  const issues = [];
  for (const engine of engines) {
    const model = models.get(engine.model);
    if (!model) {
      issues.push(`${engine.label}: modèle absent du catalogue (${engine.model})`);
      continue;
    }
    if (model.type !== "language") issues.push(`${engine.label}: type inattendu ${model.type}`);

    const maxTokens = Number(model.max_tokens || 0);
    if (maxTokens < MIN_REQUIRED_OUTPUT_TOKENS) {
      issues.push(`${engine.label}: max_tokens=${maxTokens}, minimum iNrCy=${MIN_REQUIRED_OUTPUT_TOKENS}`);
    }

    const tags = new Set(Array.isArray(model.tags) ? model.tags : []);
    if (engine.supportsVision && !tags.has("vision")) {
      issues.push(`${engine.label}: iNrCy attend la vision mais le catalogue ne l'annonce pas`);
    }
    if (!engine.supportsVision && tags.has("vision")) {
      issues.push(`${engine.label}: le catalogue annonce désormais la vision ; revoir le fallback iNrCy`);
    }
  }

  if (issues.length) {
    console.error("\n[AI Gateway catalog QA] ECHEC");
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exitCode = 1;
    return;
  }

  console.log("[AI Gateway catalog QA] OK");
  console.log(`  - ${engines.length}/8 modèles iNrCy présents dans le catalogue officiel Vercel`);
  console.log(`  - Tous acceptent au moins ${MIN_REQUIRED_OUTPUT_TOKENS} tokens de sortie`);
  console.log("  - Capacités vision cohérentes avec le routage iNrCy");
  for (const engine of engines) {
    const model = models.get(engine.model);
    console.log(`  - ${engine.label}: ${engine.model} (max ${model.max_tokens}, vision ${engine.supportsVision ? "oui" : "non"})`);
  }
}

main().catch((error) => {
  console.error("[AI Gateway catalog QA] ERREUR", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
