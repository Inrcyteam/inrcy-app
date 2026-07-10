import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "lib", "scripts", "ops"];
const IGNORE_DIRS = new Set(["node_modules", ".next", ".git"]);
const SELF = "scripts/audit-ai-gateway.mjs";

function walk(dir) {
  const abs = resolve(ROOT, dir);
  const out = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const child = resolve(abs, entry.name);
    if (entry.isDirectory()) out.push(...walk(relative(ROOT, child)));
    else if (entry.isFile()) out.push(child);
  }
  return out;
}

const files = SCAN_DIRS.flatMap((dir) => {
  try {
    return statSync(resolve(ROOT, dir)).isDirectory() ? walk(dir) : [];
  } catch {
    return [];
  }
}).filter((file) => relative(ROOT, file).replaceAll("\\", "/") !== SELF);

const rules = [
  {
    id: "neutral-ai-consumer",
    label: "Imports/usages de aiGenerateJSON",
    regex: /aiGenerateJSON/g,
  },
  {
    id: "legacy-openai-consumer",
    label: "Imports/usages legacy de openaiGenerateJSON",
    regex: /openaiGenerateJSON/g,
  },
  {
    id: "direct-openai-endpoint",
    label: "Références directes à api.openai.com",
    regex: /api\.openai\.com/g,
  },
  {
    id: "direct-other-ai-provider-endpoint",
    label: "Références directes à d'autres endpoints fournisseurs IA",
    regex: /api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.mistral\.ai|api\.x\.ai|api\.perplexity\.ai|api\.deepseek\.com/g,
  },
  {
    id: "openai-env",
    label: "Variables d'environnement OPENAI_*",
    regex: /OPENAI_[A-Z_]+/g,
  },
  {
    id: "gateway-env",
    label: "Variables d'environnement AI_GATEWAY_*",
    regex: /AI_GATEWAY_[A-Z_]+/g,
  },
  {
    id: "preferred-engine",
    label: "Références au moteur IA préférentiel",
    regex: /ai_preferred_engine|getAiPreferredEngineFromBusiness/g,
  },
  {
    id: "vercel-gateway-endpoint",
    label: "Références endpoint Vercel AI Gateway",
    regex: /ai-gateway\.vercel\.sh/g,
  },
];

const findings = new Map(rules.map((rule) => [rule.id, []]));
const sourceTexts = new Map();

for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const rel = relative(ROOT, file).replaceAll("\\", "/");
  sourceTexts.set(rel, text);
  const lines = text.split(/\r?\n/);
  for (const rule of rules) {
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      rule.regex.lastIndex = 0;
      if (!rule.regex.test(line)) continue;
      findings.get(rule.id).push({ file: rel, line: index + 1, text: line.trim().slice(0, 220) });
    }
  }
}

console.log("iNrCy — audit statique AI Gateway Étape 6 bis\n");
for (const rule of rules) {
  const rows = findings.get(rule.id) || [];
  const uniqueFiles = new Set(rows.map((row) => row.file));
  console.log(`${rule.label}: ${rows.length} occurrence(s), ${uniqueFiles.size} fichier(s)`);
  for (const row of rows.slice(0, 40)) {
    console.log(`  - ${row.file}:${row.line}  ${row.text}`);
  }
  if (rows.length > 40) console.log(`  ... ${rows.length - 40} occurrence(s) supplémentaire(s)`);
  console.log("");
}

const violations = [];

for (const row of findings.get("direct-openai-endpoint") || []) {
  violations.push(`Endpoint OpenAI direct interdit: ${row.file}:${row.line}`);
}

for (const row of findings.get("direct-other-ai-provider-endpoint") || []) {
  violations.push(`Endpoint fournisseur IA direct interdit: ${row.file}:${row.line}`);
}

for (const [file, text] of sourceTexts) {
  if (!/\.(?:ts|tsx|mts|mjs|js)$/.test(file)) continue;
  const callRegex = /aiGenerateJSON(?:<[^;\n]+?>)?\s*\(\s*\{/g;
  let match;
  while ((match = callRegex.exec(text))) {
    const line = text.slice(0, match.index).split(/\r?\n/).length;
    const block = text.slice(match.index, match.index + 900);
    if (!/\bfeature\s*:/.test(block)) {
      violations.push(`Appel aiGenerateJSON sans tag feature: ${file}:${line}`);
    }
    if (!/\bengine\s*:|\bmodel\s*:/.test(block)) {
      violations.push(`Appel aiGenerateJSON sans routage moteur/modèle explicite: ${file}:${line}`);
    }
    if (!/\baccountId\s*(?::|[,}])/.test(block)) {
      violations.push(`Appel aiGenerateJSON sans compte actif pour garde-fous économiques: ${file}:${line}`);
    }
  }
}

const legacyConsumers = findings.get("legacy-openai-consumer") || [];
if (legacyConsumers.length) {
  for (const row of legacyConsumers) {
    violations.push(`Consommateur legacy openaiGenerateJSON: ${row.file}:${row.line}`);
  }
}

const directEndpoints = findings.get("direct-openai-endpoint") || [];
const gatewayRefs = findings.get("vercel-gateway-endpoint") || [];
const neutralConsumers = findings.get("neutral-ai-consumer") || [];

console.log("Résumé migration:");
console.log(`  - Couche neutre aiGenerateJSON présente: ${neutralConsumers.length ? "OUI" : "NON"}`);
console.log(`  - Consommateurs legacy openaiGenerateJSON: ${legacyConsumers.length ? "OUI" : "NON"}`);
console.log(`  - Texte, vision et transcription Gateway + garde-fous économiques verrouillés: ${violations.length ? "NON" : "OUI"}`);
console.log(`  - Référence Vercel AI Gateway présente: ${gatewayRefs.length ? "OUI" : "NON"}`);
console.log(`  - Endpoint OpenAI direct total: ${directEndpoints.length} (aucun autorisé)`);

if (violations.length) {
  console.error("\nÉCHEC AUDIT — violations Étape 6 bis:");
  for (const violation of violations) console.error(`  - ${violation}`);
  process.exitCode = 1;
} else {
  console.log("\nAUDIT OK — aucun contournement fournisseur et aucun appel IA non rattaché à un compte actif détecté.");
}
