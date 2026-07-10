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

function validatePayloadAgainstPolicy(opts: AiGenerateJsonOptions, maxOutputTokens: number) {
  const policy = getAiFeaturePolicy(opts.feature);
  const inputChars = String(opts.system || "").length + String(opts.input || "").length;
  if (inputChars > policy.maxInputChars) {
    throw new Error("La demande IA est trop volumineuse pour cette action. Réduisez le contenu puis réessayez.");
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

  validatePayloadAgainstPolicy(opts, max_output_tokens);

  const userContent: Array<Record<string, unknown>> = [
    { type: "input_text", text: opts.input },
    ...((opts.images || []).map((image) => ({
      type: "input_image",
      image_url: image.dataUrl,
      detail: image.detail || "low",
    }))),
  ];

  const requestStartedAt = Date.now();
  const effectiveSystemPrompt = routing.jsonMode === "prompt-only"
    ? appendPromptOnlyJsonContract(opts.system)
    : opts.system;

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
      ...(routing.jsonMode === "strict"
        ? {
            text: {
              format: { type: "json_object" },
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

  return parseAiGatewayJsonObject<T>(contentText);
}
