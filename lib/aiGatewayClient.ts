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
  AiOperationDeadlineExceededError,
  assertAllowedAiGatewayModel,
  getAiFeaturePolicy,
  reserveAiOperationBudget,
  type AiGenerationFeature,
  type AiOperationBudget,
} from "@/lib/aiGatewayPolicy";
import {
  commitAiGatewayAccountAttempt,
  recordAiGatewayAccountFailure,
  reserveAiGatewayAccountAttempt,
  rollbackAiGatewayAccountAttempt,
  type AiGatewayAccountAttemptReservation,
} from "@/lib/aiGatewayAccountGuard";
import {
  estimateAiGatewayCostMicroUsd,
  estimateInputTokensWithImages,
  resolveAiGatewayGuardPricing,
} from "@/lib/aiGatewayEconomics";
import {
  appendPromptOnlyJsonContract,
  extractAiGatewayResponseText,
  parseAiGatewayJsonObject,
} from "@/lib/aiGatewayResponse";
import { recordAiGatewayOperationCall } from "@/lib/aiGatewayOperationTelemetry";

export type { AiGenerationFeature, AiOperationBudget } from "@/lib/aiGatewayPolicy";

export class AiGatewayHttpError extends Error {
  code: "ai_gateway_rate_limit" | "ai_gateway_auth" | "ai_gateway_unavailable" | "ai_gateway_request_failed";
  status: number;
  retryAfterSeconds?: number;

  constructor(status: number, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "AiGatewayHttpError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
    this.code = status === 429
      ? "ai_gateway_rate_limit"
      : status === 401 || status === 403
        ? "ai_gateway_auth"
        : status >= 500
          ? "ai_gateway_unavailable"
          : "ai_gateway_request_failed";
  }
}


type AiResponseJSON = Record<string, unknown>;

export type AiJsonResponseSchema = {
  /** Stable schema name sent to the Responses API. */
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

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
  /** Deadline absolue partagée par une action utilisateur et ses sous-appels. */
  deadlineAt?: number;
  /** Optional JSON Schema for reliable multi-provider structured output. */
  responseSchema?: AiJsonResponseSchema;
};

type AiGenerateJsonRouting =
  | { engine: AiPreferredEngine; model?: never }
  | { model: string; engine?: never };

export type AiGenerateJsonOptions = AiGenerateJsonBaseOptions & AiGenerateJsonRouting;

const warnedFallbackPricingModels = new Set<string>();

function warnIfFallbackGuardPricing(model: string) {
  const resolution = resolveAiGatewayGuardPricing(model);
  if (resolution.source !== "conservative_fallback" || warnedFallbackPricingModels.has(model)) return;
  warnedFallbackPricingModels.add(model);
  console.warn("[ai-gateway] conservative guard pricing active", {
    model,
    pricingSource: resolution.source,
    message: "AI_GATEWAY_MODEL_PRICING_JSON absent/incomplet pour ce modèle ; iNrCy conserve un garde-fou monétaire conservateur.",
  });
}

function resolveHardDeadlineAt(opts: AiGenerateJsonOptions, policyMaxDurationMs: number): number {
  const candidates = [
    Number(opts.deadlineAt || 0),
    opts.budget ? opts.budget.startedAt + opts.budget.maxDurationMs : 0,
  ].filter((value) => Number.isFinite(value) && value > 0);
  return candidates.length ? Math.min(...candidates) : Date.now() + policyMaxDurationMs;
}

function resolveRemainingTimeoutMs(deadlineAt: number, requestedTimeoutMs: number) {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 750) {
    throw new AiOperationDeadlineExceededError();
  }
  return Math.max(500, Math.min(requestedTimeoutMs, remaining - 250));
}

export { normalizeGatewayModelId } from "@/lib/aiGatewayConfig";

export function hasAiGenerationCredentials(): boolean {
  return Boolean(getAiGatewayCredential());
}

type ResolvedAiRequestRouting = {
  model: string;
  jsonMode: AiJsonMode;
};

function resolveRequestedRouting(
  opts: AiGenerateJsonOptions,
  hasImages: boolean,
): ResolvedAiRequestRouting {
  if ("model" in opts && cleanAiGatewayEnv(opts.model)) {
    return {
      model: cleanAiGatewayEnv(opts.model),
      jsonMode: "strict",
    };
  }

  if ("engine" in opts && opts.engine) {
    return resolveAiEngineRequestRouting(opts.engine, hasImages);
  }

  // Le type TypeScript empêche normalement ce cas. On garde un garde-fou runtime.
  return {
    model:
      (hasImages ? cleanAiGatewayEnv(process.env.AI_GATEWAY_VISION_MODEL) : "") ||
      cleanAiGatewayEnv(process.env.AI_GATEWAY_MODEL) ||
      "openai/gpt-4o-mini",
    jsonMode: "strict",
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
    Math.min(policy.maxOutputTokens, opts.maxOutputTokens ?? 700),
  );
  const temperature = typeof opts.temperature === "number"
    ? Math.max(0, Math.min(2, opts.temperature))
    : undefined;
  const retries = Math.max(0, Math.min(policy.maxRetries, Math.floor(opts.retries ?? policy.maxRetries)));
  const requestedTimeoutMs = Math.max(
    5000,
    Math.min(policy.maxTimeoutMs, Math.floor(opts.timeoutMs ?? policy.maxTimeoutMs)),
  );
  const hardDeadlineAt = resolveHardDeadlineAt(opts, policy.defaultOperationMaxDurationMs);
  const timeoutMs = resolveRemainingTimeoutMs(hardDeadlineAt, requestedTimeoutMs);

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
  const estimatedInputTokens = estimateInputTokensWithImages({
    textChars: String(effectiveSystemPrompt || "").length + String(opts.input || "").length,
    imageCount: opts.images?.length || 0,
    imageDetail: opts.images?.some((image) => image.detail === "high") ? "high" : "low",
  });
  warnIfFallbackGuardPricing(model);
  const estimatedCostMicroUsd = estimateAiGatewayCostMicroUsd(model, {
    inputTokens: estimatedInputTokens,
    outputTokens: max_output_tokens,
  });

  const attemptReservations = new Map<number, AiGatewayAccountAttemptReservation | null>();
  let successfulReservation: AiGatewayAccountAttemptReservation | null = null;
  let httpAttempts = 0;

  let res: Response;
  try {
    res = await fetchWithRetry(`${baseUrl}/responses`, {
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
    deadlineAt: hardDeadlineAt,
    // 429 ne doit pas être rejoué immédiatement : cela amplifie les rate limits.
    // Une seule reprise réseau bornée est possible sur erreurs transitoires.
    retryStatuses: [408, 500, 502, 503, 504],
    onAttempt: async (attempt) => {
      httpAttempts = Math.max(httpAttempts, attempt + 1);
      const reservation = await reserveAiGatewayAccountAttempt(opts.accountId, {
        estimatedInputTokens,
        reservedOutputTokens: max_output_tokens,
        estimatedCostMicroUsd,
      });
      attemptReservations.set(attempt, reservation);
    },
    onAttemptSettled: async ({ attempt, response }) => {
      const reservation = attemptReservations.get(attempt) || null;
      if (response?.ok) {
        successfulReservation = reservation;
        return;
      }
      await rollbackAiGatewayAccountAttempt(reservation).catch((error) => {
        console.warn("[ai-gateway] attempt reservation rollback unavailable", {
          feature: opts.feature,
          model,
          attempt,
          message: error instanceof Error ? error.message : String(error),
        });
      });
    },
    });
  } catch (error) {
    const failedDurationMs = Date.now() - requestStartedAt;
    await recordAiGatewayAccountFailure({
      accountId: opts.accountId,
      feature: opts.feature,
      model,
      status: 0,
    }).catch(() => undefined);
    recordAiGatewayOperationCall({
      feature: opts.feature,
      engine: "engine" in opts ? opts.engine : undefined,
      model,
      status: "failure",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      reservedOutputTokens: max_output_tokens,
      costMicroUsd: 0,
      pricingSource: resolveAiGatewayGuardPricing(model).source,
      usageEstimated: false,
      durationMs: failedDurationMs,
      hasImages,
      httpAttempts,
    });
    console.error("[ai-gateway] generation transport failed", {
      feature: opts.feature,
      model,
      engine: "engine" in opts ? opts.engine : undefined,
      accountId: opts.accountId || undefined,
      hasImages,
      httpAttempts,
      durationMs: failedDurationMs,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const retryAfterHeader = Number.parseInt(String(res.headers.get("Retry-After") || ""), 10);
    const retryAfterSeconds = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? retryAfterHeader : undefined;
    await recordAiGatewayAccountFailure({
      accountId: opts.accountId,
      feature: opts.feature,
      model,
      status: res.status,
    }).catch(() => undefined);
    const failedDurationMs = Date.now() - requestStartedAt;
    console.error("[ai-gateway] generation failed", {
      feature: opts.feature,
      model,
      engine: "engine" in opts ? opts.engine : undefined,
      accountId: opts.accountId || undefined,
      hasImages,
      retries,
      structuredOutput: Boolean(structuredFormat),
      status: res.status,
      durationMs: failedDurationMs,
    });
    recordAiGatewayOperationCall({
      feature: opts.feature,
      engine: "engine" in opts ? opts.engine : undefined,
      model,
      status: "failure",
      statusCode: res.status,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      reservedOutputTokens: max_output_tokens,
      costMicroUsd: 0,
      pricingSource: resolveAiGatewayGuardPricing(model).source,
      usageEstimated: false,
      durationMs: failedDurationMs,
      hasImages,
      httpAttempts,
    });
    const safeDetail = String(text || res.statusText || "").trim().slice(0, 500);
    throw new AiGatewayHttpError(
      res.status,
      `AI Gateway error (${res.status}): ${safeDetail || "Erreur fournisseur"}`,
      retryAfterSeconds,
    );
  }

  let json: any;
  try {
    json = await res.json();
  } catch (error) {
    // Le fournisseur a accepté et exécuté l'appel : on ne libère pas le budget
    // économique comme si rien n'avait été consommé. On commit l'estimation réservée.
    await commitAiGatewayAccountAttempt({
      reservation: successfulReservation,
      feature: opts.feature,
      model,
      usage: {
        inputTokens: estimatedInputTokens,
        outputTokens: max_output_tokens,
        totalTokens: estimatedInputTokens + max_output_tokens,
      },
    }).catch(() => undefined);
    throw error;
  }
  const usage = parseUsage(json);
  const usageForGuard = usage.totalTokens > 0
    ? usage
    : {
        inputTokens: estimatedInputTokens,
        outputTokens: max_output_tokens,
        totalTokens: estimatedInputTokens + max_output_tokens,
      };
  const contentText = extractAiGatewayResponseText(json);

  // Commit économique atomique : la capacité réservée est remplacée par
  // l'usage réel. Si le fournisseur omet usage, iNrCy conserve l'estimation
  // réservée au lieu de rendre le garde-fou aveugle.
  await commitAiGatewayAccountAttempt({
    reservation: successfulReservation,
    feature: opts.feature,
    model,
    usage: usageForGuard,
  }).catch((error) => {
    console.error("[ai-gateway] atomic usage commit unavailable", {
      feature: opts.feature,
      model,
      message: error instanceof Error ? error.message : String(error),
    });
  });

  const actualCostMicroUsd = estimateAiGatewayCostMicroUsd(model, usageForGuard);
  const pricingSource = resolveAiGatewayGuardPricing(model).source;
  recordAiGatewayOperationCall({
    feature: opts.feature,
    engine: "engine" in opts ? opts.engine : undefined,
    model,
    status: "success",
    inputTokens: usageForGuard.inputTokens,
    outputTokens: usageForGuard.outputTokens,
    totalTokens: usageForGuard.totalTokens,
    reservedOutputTokens: max_output_tokens,
    costMicroUsd: actualCostMicroUsd,
    pricingSource,
    usageEstimated: usage.totalTokens <= 0,
    durationMs: Date.now() - requestStartedAt,
    hasImages,
    httpAttempts,
  });

  console.info("[ai-gateway] generation usage", {
    feature: opts.feature,
    model,
    engine: "engine" in opts ? opts.engine : undefined,
    accountId: opts.accountId || undefined,
    hasImages,
    structuredOutput: Boolean(structuredFormat),
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    guardUsageEstimated: usage.totalTokens <= 0,
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
