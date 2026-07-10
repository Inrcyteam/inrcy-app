#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const BASE_URL = String(process.env.AI_GATEWAY_BASE_URL || "https://ai-gateway.vercel.sh/v1").replace(/\/+$/, "");
const API_KEY = String(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || "").trim();
const RUN_VISION = /^(1|true|yes)$/i.test(String(process.env.AI_GATEWAY_LIVE_QA_VISION || ""));
const SOURCE = resolve(process.cwd(), "lib/aiEnginePreference.ts");
const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nH0AAAAASUVORK5CYII=";

function parseEngineOptions(source) {
  const regex = /\{\s*value:\s*"([^"]+)"[\s\S]*?shortLabel:\s*"([^"]+)"[\s\S]*?model:\s*"([^"]+)"[\s\S]*?supportsVision:\s*(true|false)[\s\S]*?jsonMode:\s*"([^"]+)"[\s\S]*?\}/g;
  return Array.from(source.matchAll(regex), (match) => ({
    engine: match[1], label: match[2], model: match[3],
    supportsVision: match[4] === "true", jsonMode: match[5],
  }));
}

function extractText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text.trim();
  return (Array.isArray(payload?.output) ? payload.output : [])
    .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    .map((part) => typeof part?.text === "string" ? part.text : typeof part?.output_text === "string" ? part.output_text : "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function parseObject(text) {
  const candidates = [text, ...Array.from(text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi), (m) => m[1])];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(String(candidate || "").trim());
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  throw new Error("JSON objet illisible");
}

async function callModel(engine, withVision = false) {
  const promptOnlyContract = engine.jsonMode === "prompt-only"
    ? "\n\nRetourne uniquement un objet JSON valide, sans Markdown ni texte avant/après."
    : "";
  const body = {
    model: engine.model,
    max_output_tokens: 180,
    ...(engine.jsonMode === "strict"
      ? {
          text: {
            format: {
              type: "json_schema",
              name: "inrcy_live_smoke",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  ok: { type: "boolean" },
                  mode: { type: "string" },
                },
                required: ["ok", "mode"],
                additionalProperties: false,
              },
            },
          },
        }
      : {}),
    input: [
      { role: "system", content: [{ type: "input_text", text: `Tu exécutes un smoke test technique iNrCy.${promptOnlyContract}` }] },
      {
        role: "user",
        content: [
          { type: "input_text", text: withVision
            ? 'Réponds avec exactement un objet JSON contenant {"ok":true,"mode":"vision"}. Analyse simplement que l’image est reçue.'
            : 'Réponds avec exactement un objet JSON contenant {"ok":true,"mode":"text"}.' },
          ...(withVision ? [{ type: "input_image", image_url: TINY_PNG, detail: "low" }] : []),
        ],
      },
    ],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  const startedAt = Date.now();
  try {
    const response = await fetch(`${BASE_URL}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${raw.slice(0, 240)}`);
    const payload = JSON.parse(raw);
    const parsed = parseObject(extractText(payload));
    if (parsed.ok !== true) throw new Error(`Réponse inattendue: ${JSON.stringify(parsed).slice(0, 200)}`);
    return { durationMs: Date.now() - startedAt, usage: payload.usage || null };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  if (!API_KEY) {
    throw new Error("AI_GATEWAY_API_KEY ou VERCEL_OIDC_TOKEN manquant. Aucun appel live n'a été lancé.");
  }
  const source = await readFile(SOURCE, "utf8");
  const engines = parseEngineOptions(source);
  if (engines.length !== 8) throw new Error(`8 moteurs attendus, ${engines.length} détectés.`);

  console.log(`[AI Gateway live QA] ${engines.length} moteurs — vision ${RUN_VISION ? "activée" : "désactivée"}`);
  const failures = [];
  for (const engine of engines) {
    try {
      const text = await callModel(engine, false);
      console.log(`  ✓ ${engine.label} texte (${text.durationMs} ms)`);
      if (RUN_VISION && engine.supportsVision) {
        const vision = await callModel(engine, true);
        console.log(`    ✓ vision (${vision.durationMs} ms)`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${engine.label}: ${message}`);
      console.error(`  ✗ ${engine.label}: ${message}`);
    }
  }

  if (failures.length) {
    console.error(`\n[AI Gateway live QA] ECHEC ${failures.length}/${engines.length}`);
    process.exitCode = 1;
  } else {
    console.log("\n[AI Gateway live QA] OK — tous les moteurs testés répondent au contrat JSON iNrCy.");
  }
}

main().catch((error) => {
  console.error("[AI Gateway live QA] ERREUR", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
