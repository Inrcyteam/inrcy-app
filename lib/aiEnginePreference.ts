export type AiPreferredEngine =
  | "openai"
  | "anthropic"
  | "google"
  | "mistral"
  | "xai"
  | "perplexity"
  | "deepseek"
  | "meta";

export type AiJsonMode = "strict" | "prompt-only";

export type AiEngineOption = {
  value: AiPreferredEngine;
  label: string;
  shortLabel: string;
  description: string;
  model: string;
  supportsVision: boolean;
  jsonMode: AiJsonMode;
};

/**
 * Le professionnel choisit un moteur, pas un identifiant de modèle technique.
 * iNrCy garde ainsi la possibilité de faire évoluer le modèle associé à un
 * moteur sans migrer les profils Supabase ni modifier l'interface.
 *
 * Les identifiants ci-dessous sont centralisés pour permettre une évolution
 * du catalogue sans toucher aux profils utilisateurs.
 */
export const AI_ENGINE_OPTIONS: readonly AiEngineOption[] = [
  {
    value: "openai",
    label: "OpenAI — ChatGPT",
    shortLabel: "ChatGPT",
    description: "Polyvalent, rapide et très économique pour les contenus multicanaux.",
    model: "openai/gpt-4o-mini",
    supportsVision: true,
    jsonMode: "strict",
  },
  {
    value: "anthropic",
    label: "Anthropic — Claude",
    shortLabel: "Claude",
    description: "Écriture naturelle, nuancée et attentive au style.",
    model: "anthropic/claude-3.5-haiku",
    supportsVision: true,
    jsonMode: "strict",
  },
  {
    value: "google",
    label: "Google — Gemini",
    shortLabel: "Gemini",
    description: "Rapide, multimodal et efficace sur les longs contextes.",
    model: "google/gemini-2.5-flash-lite",
    supportsVision: true,
    jsonMode: "strict",
  },
  {
    value: "mistral",
    label: "Mistral AI — Mistral",
    shortLabel: "Mistral",
    description: "Alternative européenne puissante, multilingue et multimodale.",
    model: "mistral/mistral-medium-3.5",
    supportsVision: true,
    jsonMode: "strict",
  },
  {
    value: "xai",
    label: "xAI — Grok",
    shortLabel: "Grok",
    description: "Direct, rapide et créatif pour varier les approches éditoriales.",
    model: "xai/grok-4.1-fast-non-reasoning",
    supportsVision: true,
    jsonMode: "strict",
  },
  {
    value: "perplexity",
    label: "Perplexity — Sonar",
    shortLabel: "Perplexity",
    description: "Recherche web intégrée et contenus ancrés dans des informations récentes.",
    model: "perplexity/sonar",
    supportsVision: true,
    jsonMode: "prompt-only",
  },
  {
    value: "deepseek",
    label: "DeepSeek",
    shortLabel: "DeepSeek",
    description: "Très bon rapport coût-performance pour les tâches de génération et d'instruction.",
    model: "deepseek/deepseek-v3.2",
    supportsVision: false,
    jsonMode: "prompt-only",
  },
  {
    value: "meta",
    label: "Meta — Llama",
    shortLabel: "Llama",
    description: "Modèle ouvert, multimodal et performant pour diversifier les contenus.",
    model: "meta/llama-4-maverick",
    supportsVision: true,
    jsonMode: "prompt-only",
  },
] as const;

export const DEFAULT_AI_PREFERRED_ENGINE: AiPreferredEngine = "openai";

export const DEFAULT_AI_VISION_FALLBACK_MODEL = "google/gemini-2.5-flash-lite";

export type AiEngineRequestRouting = {
  model: string;
  jsonMode: AiJsonMode;
  usedVisionFallback: boolean;
};


const AI_ENGINE_VALUES = new Set<AiPreferredEngine>(
  AI_ENGINE_OPTIONS.map((option) => option.value),
);

export function normalizeAiPreferredEngine(value: unknown): AiPreferredEngine {
  const raw = String(value ?? "").trim().toLowerCase();
  if (AI_ENGINE_VALUES.has(raw as AiPreferredEngine)) return raw as AiPreferredEngine;

  // Migration douce d'anciennes valeurs, marques ou libellés éventuels.
  if (["chatgpt", "gpt", "open-ai"].includes(raw)) return "openai";
  if (["claude", "anthropic-ai"].includes(raw)) return "anthropic";
  if (["gemini", "google-ai"].includes(raw)) return "google";
  if (["mistral-ai", "mistral ai", "le-chat", "le chat"].includes(raw)) return "mistral";
  if (["grok", "x-ai"].includes(raw)) return "xai";
  if (["sonar", "perplexity-ai"].includes(raw)) return "perplexity";
  if (["deep-seek", "deepseek-ai"].includes(raw)) return "deepseek";
  if (["llama", "meta-ai", "meta ai"].includes(raw)) return "meta";

  return DEFAULT_AI_PREFERRED_ENGINE;
}

export function getAiEngineOption(value: unknown): AiEngineOption {
  const engine = normalizeAiPreferredEngine(value);
  return AI_ENGINE_OPTIONS.find((option) => option.value === engine) || AI_ENGINE_OPTIONS[0];
}

export function getAiEngineModel(value: unknown): string {
  return getAiEngineOption(value).model;
}

export function getAiEngineSupportsVision(value: unknown): boolean {
  return getAiEngineOption(value).supportsVision;
}

export function getAiEngineJsonMode(value: unknown): AiJsonMode {
  return getAiEngineOption(value).jsonMode;
}

export function resolveAiEngineRequestRouting(
  value: unknown,
  hasImages: boolean,
  visionFallbackModel = DEFAULT_AI_VISION_FALLBACK_MODEL,
): AiEngineRequestRouting {
  const option = getAiEngineOption(value);
  if (hasImages && !option.supportsVision) {
    return {
      model: visionFallbackModel || DEFAULT_AI_VISION_FALLBACK_MODEL,
      jsonMode: "strict",
      usedVisionFallback: true,
    };
  }

  return {
    model: option.model,
    jsonMode: option.jsonMode,
    usedVisionFallback: false,
  };
}

export function getAiPreferredEngineFromBusiness(
  business: Record<string, unknown> | null | undefined,
): AiPreferredEngine {
  return normalizeAiPreferredEngine(business?.ai_preferred_engine);
}
