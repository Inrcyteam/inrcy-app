export type AiGatewayJsonObject = Record<string, unknown>;

const PROMPT_ONLY_JSON_CONTRACT = [
  "CONTRAT TECHNIQUE DE SORTIE iNrCy :",
  "- Retourne uniquement un objet JSON valide.",
  "- Aucun bloc Markdown, aucune balise ```json, aucun commentaire et aucun texte avant ou après l'objet JSON.",
  "- Respecte exactement les clés demandées par la mission.",
  "- Dans les champs texte, conserve les vrais paragraphes demandés : une ligne vide entre deux paragraphes doit rester encodée dans la chaîne JSON et être restituable comme deux sauts de ligne consécutifs.",
  "- Ne compacte jamais plusieurs paragraphes en un seul bloc.",
].join("\n");

export function getPromptOnlyJsonContract(): string {
  return PROMPT_ONLY_JSON_CONTRACT;
}

export function appendPromptOnlyJsonContract(systemPrompt: unknown): string {
  const base = String(systemPrompt ?? "").trim();
  return base ? `${base}\n\n${PROMPT_ONLY_JSON_CONTRACT}` : PROMPT_ONLY_JSON_CONTRACT;
}

export function extractAiGatewayResponseText(json: unknown): string {
  const root = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const outputText = typeof root.output_text === "string" ? root.output_text : "";
  if (outputText.trim()) return outputText.trim();

  const output = Array.isArray(root.output) ? root.output : [];
  const nestedTexts: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as unknown[])
      : [];

    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const record = part as Record<string, unknown>;
      for (const key of ["text", "output_text"]) {
        const value = record[key];
        if (typeof value === "string" && value.trim()) nestedTexts.push(value);
      }
    }
  }

  return nestedTexts.join("\n").trim();
}

function stripBom(input: string): string {
  return input.replace(/^\uFEFF/, "").trim();
}

function collectFencedCandidates(input: string): string[] {
  const matches = input.matchAll(/```(?:json|javascript|js)?\s*([\s\S]*?)```/gi);
  return Array.from(matches, (match) => String(match[1] || "").trim()).filter(Boolean);
}

function collectBalancedObjectCandidates(input: string): string[] {
  const candidates: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]!;

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }

    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(input.slice(start, index + 1).trim());
        start = -1;
      }
    }
  }

  return candidates.filter(Boolean);
}

function asJsonObject(value: unknown): AiGatewayJsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as AiGatewayJsonObject;
}

function tryParseObject(candidate: string): AiGatewayJsonObject | null {
  try {
    let parsed: unknown = JSON.parse(candidate);

    // Quelques modèles peuvent exceptionnellement double-encoder l'objet JSON.
    if (typeof parsed === "string") {
      const nested = stripBom(parsed);
      if (nested.startsWith("{") && nested.endsWith("}")) parsed = JSON.parse(nested);
    }

    return asJsonObject(parsed);
  } catch {
    return null;
  }
}

/**
 * Parse robuste des sorties multi-fournisseurs.
 *
 * Accepte un objet JSON propre, un objet entouré de texte, un bloc ```json```
 * ou un objet double-encodé, mais refuse toujours les tableaux et primitives.
 * Les chaînes ne sont jamais normalisées : les \n et \n\n de contenu restent intacts.
 */
export function parseAiGatewayJsonObject<T extends AiGatewayJsonObject>(contentText: unknown): T {
  const raw = stripBom(String(contentText ?? ""));
  if (!raw) {
    throw new Error("La génération n'a pas pu être finalisée. Merci de réessayer.");
  }

  // Si la réponse complète est déjà du JSON valide mais ne respecte pas le
  // contrat objet (tableau/primitif), on la refuse sans extraire opportunément
  // un objet imbriqué qui masquerait une réponse de forme incorrecte.
  try {
    const parsedWhole = JSON.parse(raw);
    const wholeObject = asJsonObject(parsedWhole);
    if (wholeObject) return wholeObject as T;
    if (typeof parsedWhole === "string") {
      const nestedObject = tryParseObject(stripBom(parsedWhole));
      if (nestedObject) return nestedObject as T;
    }
    throw new Error("La génération n'a pas pu être finalisée. Merci de réessayer.");
  } catch (error) {
    if (error instanceof Error && error.message.includes("finalisée")) throw error;
    // JSON complet invalide : on tente ensuite les enveloppes tolérées.
  }

  const candidates = [
    ...collectFencedCandidates(raw),
    ...collectBalancedObjectCandidates(raw),
  ];

  const seen = new Set<string>();
  for (const candidate of candidates) {
    const clean = stripBom(candidate);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    const parsed = tryParseObject(clean);
    if (parsed) return parsed as T;
  }

  throw new Error("La génération n'a pas pu être finalisée. Merci de réessayer.");
}
