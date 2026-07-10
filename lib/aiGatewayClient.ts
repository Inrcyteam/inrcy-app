import "server-only";

import { fetchWithRetry } from "@/lib/observability/fetch";
import {
  cleanAiGatewayEnv,
  getAiGatewayCredential,
  normalizeAiGatewayBaseUrl,
  normalizeGatewayModelId,
} from "@/lib/aiGatewayConfig";
import {
  resolveAiEngineRequestRouting,
  type AiJsonMode,
  type AiPreferredEngine,
} from "@/lib/aiEnginePreference";
import {
  assertAllowedAiGatewayModel,
  getAiFeaturePolicy,
  reserveAiOperationBudget,
  type AiGenerationFeature,
  type AiOperationBudget,
} from "@/lib/aiGatewayPolicy";
import {
  recordAiGatewayAccountUsage,
  reserveAiGatewayAccountAttempt,
} from "@/lib/aiGatewayAccountGuard";
import {
  appendPromptOnlyJsonContract,
  extractAiGatewayResponseText,
  parseAiGatewayJsonObject,
} from "@/lib/aiGatewayResponse";

export type { AiGenerationFeature, AiOperationBudget } from "@/lib/aiGatewayPolicy";


type AiResponseJSON = Record<string, unknown>;

export type AiJsonResponseSchema = {
  /** Stable schema name sent to the Responses API. */
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type AiGatewayMode = "auto" | "gateway";
export type AiGenerationRuntime = "vercel-ai-gateway";

type AiGenerateJsonBaseOptions = {
  feature: AiGenerationFeature;
  /** Établissement / compte actif iNrCy. Utilisé uniquement pour les garde-fous économiques. */
  accountId?: string;
  /** Budget partagé entre plusieurs sous-appels d'une même action utilisateur. */
  budget?: AiOperationBudget;
  system: string;
  input: string;
  images?: Array<{ dataUrl: string; detail?: "low" | "high" | "auto" }>;
  maxOutputTokens?: number;
  temperature?: number;
  retries?: number;
  timeoutMs?: number;
  /** Optional JSON Schema for reliable multi-provider structured output. */
  responseSchema?: AiJsonResponseSchema;
};

type AiGenerateJsonRouting =
  | { engine: AiPreferredEngine; model?: never }
  | { model: string; engine?: never };

export type AiGenerateJsonOptions = AiGenerateJsonBaseOptions & AiGenerateJsonRouting;

function resolveMode(): AiGatewayMode {
  const raw = cleanAiGatewayEnv(process.env.AI_GATEWAY_MODE).toLowerCase();
  return raw === "gateway" ? "gateway" : "auto";
}

export { normalizeGatewayModelId } from "@/lib/aiGatewayConfig";

export function getAiGenerationRuntime(): AiGenerationRuntime {
  return "vercel-ai-gateway";
}

export function hasAiGenerationCredentials(): boolean {
  return Boolean(getAiGatewayCredential());
}

export function getAiGenerationRuntimeInfo() {
  return {
    mode: resolveMode(),
    runtime: getAiGenerationRuntime(),
    gatewayConfigured: Boolean(getAiGatewayCredential()),
    gatewayAuth: cleanAiGatewayEnv(process.env.AI_GATEWAY_API_KEY)
      ? "api-key"
      : cleanAiGatewayEnv(process.env.VERCEL_OIDC_TOKEN)
        ? "oidc"
        : "none",
    gatewayBaseUrl: normalizeAiGatewayBaseUrl(process.env.AI_GATEWAY_BASE_URL),
  } as const;
}

type ResolvedAiRequestRouting = {
  model: string;
  jsonMode: AiJsonMode;
  usedVisionFallback: boolean;
};

function resolveRequestedRouting(
  opts: AiGenerateJsonOptions,
  hasImages: boolean,
): ResolvedAiRequestRouting {
  if ("model" in opts && cleanAiGatewayEnv(opts.model)) {
    return {
      model: cleanAiGatewayEnv(opts.model),
      jsonMode: "strict",
      usedVisionFallback: false,
    };
  }

  if ("engine" in opts && opts.engine) {
    return resolveAiEngineRequestRouting(
      opts.engine,
      hasImages,
      cleanAiGatewayEnv(process.env.AI_GATEWAY_VISION_MODEL),
    );
  }

  // Le type TypeScript empêche normalement ce cas. On garde un garde-fou runtime.
  return {
    model:
      (hasImages ? cleanAiGatewayEnv(process.env.AI_GATEWAY_VISION_MODEL) : "") ||
      cleanAiGatewayEnv(process.env.AI_GATEWAY_MODEL) ||
      "openai/gpt-4o-mini",
    jsonMode: "strict",
    usedVisionFallback: false,
  };
}


function normalizeJsonSchemaName(value: unknown): string {
  const normalized = String(value || "inrcy_response")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 64);
  return normalized || "inrcy_response";
}

function getOutputDiagnostics(json: any) {
  const output = Array.isArray(json?.output) ? json.output : [];
  return {
    responseStatus: typeof json?.status === "string" ? json.status : undefined,
    incompleteReason:
      typeof json?.incomplete_details?.reason === "string"
        ? json.incomplete_details.reason
        : undefined,
    outputItemTypes: output
      .map((item: any) => (typeof item?.type === "string" ? item.type : "unknown"))
      .slice(0, 12),
    contentPartTypes: output
      .flatMap((item: any) => (Array.isArray(item?.content) ? item.content : []))
      .map((part: any) => (typeof part?.type === "string" ? part.type : "unknown"))
      .slice(0, 20),
  };
}

function parseUsage(json: any) {
  const usage = json?.usage && typeof json.usage === "object" ? json.usage : {};
  const inputTokens = Math.max(0, Math.floor(Number(usage.input_tokens ?? usage.prompt_tokens ?? 0) || 0));
  const outputTokens = Math.max(0, Math.floor(Number(usage.output_tokens ?? usage.completion_tokens ?? 0) || 0));
  const totalTokens = Math.max(
    0,
    Math.floor(Number(usage.total_tokens ?? inputTokens + outputTokens) || inputTokens + outputTokens),
  );
  return { inputTokens, outputTokens, totalTokens };
}

function validatePayloadAgainstPolicy(
  opts: AiGenerateJsonOptions,
  maxOutputTokens: number,
  effectiveSystemPrompt: string,
) {
  const policy = getAiFeaturePolicy(opts.feature);
  const systemChars = String(effectiveSystemPrompt || "").length;
  const inputCharsOnly = String(opts.input || "").length;
  const inputChars = systemChars + inputCharsOnly;
  if (inputChars > policy.maxInputChars) {
    console.error("[ai-gateway] input policy exceeded", {
      feature: opts.feature,
      accountId: opts.accountId || undefined,
      systemChars,
      inputChars: inputCharsOnly,
      totalChars: inputChars,
      maxInputChars: policy.maxInputChars,
    });
    throw new Error(
      `La demande IA est trop volumineuse pour cette action (${inputChars}/${policy.maxInputChars} caractères).`,
    );
  }

  const images = Array.isArray(opts.images) ? opts.images : [];
  if (images.length > policy.maxImages) {
    throw new Error(`Trop d'images ont été envoyées à l'IA pour cette action (maximum ${policy.maxImages}).`);
  }

  const imageDataChars = images.reduce((sum, image) => sum + String(image?.dataUrl || "").length, 0);
  if (imageDataChars > policy.maxImageDataChars) {
    throw new Error("Les médias envoyés à l'IA sont trop volumineux pour cette action.");
  }

  reserveAiOperationBudget(opts.budget, maxOutputTokens);
}

/**
 * Point d'entrée unique de génération IA iNrCy — Étape 6.
 *
 * Toute génération texte/vision passe obligatoirement par Vercel AI Gateway.
 * Les modèles, retries, volumes, budgets d'opération et garde-fous par compte
 * sont contrôlés ici. La transcription brute utilise elle aussi le Gateway via
 * lib/aiGatewayTranscription.ts.
 */
export async function aiGenerateJSON<T extends AiResponseJSON>(opts: AiGenerateJsonOptions): Promise<T> {
  const credential = getAiGatewayCredential();
  if (!credential) {
    throw new Error("Configuration AI Gateway manquante.");
  }

  const policy = getAiFeaturePolicy(opts.feature);
  const hasImages = Array.isArray(opts.images) && opts.images.length > 0;
  const routing = resolveRequestedRouting(opts, hasImages);
  const model = normalizeGatewayModelId(routing.model);
  assertAllowedAiGatewayModel(model, process.env.AI_GATEWAY_ALLOWED_MODELS);

  const baseUrl = normalizeAiGatewayBaseUrl(process.env.AI_GATEWAY_BASE_URL);
  const max_output_tokens = Math.max(
    128,
    Math.min(policy.maxOutputTokens, 8000, opts.maxOutputTokens ?? 700),
  );
  const temperature = typeof opts.temperature === "number"
    ? Math.max(0, Math.min(2, opts.temperature))
    : undefined;
  const retries = Math.max(0, Math.min(policy.maxRetries, Math.floor(opts.retries ?? policy.maxRetries)));
  const timeoutMs = Math.max(
    5000,
    Math.min(policy.maxTimeoutMs, Math.floor(opts.timeoutMs ?? policy.maxTimeoutMs)),
  );

  // Pour les moteurs sans mode JSON strict natif, le contrat JSON est ajouté au
  // système. On valide donc la taille RÉELLEMENT envoyée au Gateway, pas seulement
  // le prompt d'origine.
  const effectiveSystemPrompt = routing.jsonMode === "prompt-only"
    ? [
        appendPromptOnlyJsonContract(opts.system),
        opts.responseSchema
          ? `SCHÉMA JSON OBLIGATOIRE (respecte exactement cette structure) :\n${JSON.stringify(opts.responseSchema.schema)}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n")
    : opts.system;

  validatePayloadAgainstPolicy(opts, max_output_tokens, effectiveSystemPrompt);

  const structuredFormat =
    opts.responseSchema && routing.jsonMode === "strict"
      ? {
          type: "json_schema",
          name: normalizeJsonSchemaName(opts.responseSchema.name),
          strict: opts.responseSchema.strict !== false,
          schema: opts.responseSchema.schema,
        }
      : routing.jsonMode === "strict"
        ? { type: "json_object" }
        : undefined;

  const userContent: Array<Record<string, unknown>> = [
    { type: "input_text", text: opts.input },
    ...((opts.images || []).map((image) => ({
      type: "input_image",
      image_url: image.dataUrl,
      detail: image.detail || "low",
    }))),
  ];

  const requestStartedAt = Date.now();

  const res = await fetchWithRetry(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${credential}`,
    },
    body: JSON.stringify({
      model,
      max_output_tokens,
      ...(temperature === undefined ? {} : { temperature }),
      ...(structuredFormat
        ? {
            text: {
              format: structuredFormat,
            },
          }
        : {}),
      input: [
        { role: "system", content: [{ type: "input_text", text: effectiveSystemPrompt }] },
        { role: "user", content: userContent },
      ],
    }),
    retries,
    timeoutMs,
    // 429 ne doit pas être rejoué immédiatement : cela amplifie les rate limits
    // des fournisseurs et déclenche des cascades de reprises coûteuses.
    retryStatuses: [408, 500, 502, 503, 504],
    onAttempt: async () => {
      await reserveAiGatewayAccountAttempt(opts.accountId);
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[ai-gateway] generation failed", {
      feature: opts.feature,
      model,
      engine: "engine" in opts ? opts.engine : undefined,
      accountId: opts.accountId || undefined,
      hasImages,
      usedVisionFallback: routing.usedVisionFallback,
      retries,
      structuredOutput: Boolean(structuredFormat),
      status: res.status,
      durationMs: Date.now() - requestStartedAt,
    });
    throw new Error(`AI Gateway error (${res.status}): ${text || res.statusText}`);
  }

  const json = (await res.json()) as any;
  const usage = parseUsage(json);
  const contentText = extractAiGatewayResponseText(json);

  // La télémétrie économique ne doit jamais casser une réponse IA valide.
  void recordAiGatewayAccountUsage({
    accountId: opts.accountId,
    feature: opts.feature,
    model,
    usage,
  }).catch((error) => {
    console.warn("[ai-gateway] usage telemetry unavailable", {
      feature: opts.feature,
      model,
      message: error instanceof Error ? error.message : String(error),
    });
  });

  console.info("[ai-gateway] generation usage", {
    feature: opts.feature,
    model,
    engine: "engine" in opts ? opts.engine : undefined,
    accountId: opts.accountId || undefined,
    hasImages,
    usedVisionFallback: routing.usedVisionFallback,
    structuredOutput: Boolean(structuredFormat),
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    durationMs: Date.now() - requestStartedAt,
  });

  if (!contentText) {
    const status = typeof json?.status === "string" ? ` (${json.status})` : "";
    console.error("[ai-gateway] empty output", {
      feature: opts.feature,
      model,
      engine: "engine" in opts ? opts.engine : undefined,
      accountId: opts.accountId || undefined,
      hasImages,
      usedVisionFallback: routing.usedVisionFallback,
      durationMs: Date.now() - requestStartedAt,
    });
    throw new Error(`Service IA : contenu de sortie manquant${status}`);
  }

  try {
    return parseAiGatewayJsonObject<T>(contentText);
  } catch (error) {
    console.error("[ai-gateway] invalid structured output", {
      feature: opts.feature,
      model,
      engine: "engine" in opts ? opts.engine : undefined,
      accountId: opts.accountId || undefined,
      structuredOutput: Boolean(structuredFormat),
      contentChars: contentText.length,
      ...getOutputDiagnostics(json),
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
