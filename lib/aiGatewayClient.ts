import "server-only";

import { fetchWithRetry } from "@/lib/observability/fetch";

type AiResponseJSON = Record<string, unknown>;

export type AiGatewayMode = "auto" | "gateway" | "openai-direct";
export type AiGenerationRuntime = "vercel-ai-gateway" | "openai-direct";

export type AiGenerateJsonOptions = {
  model?: string;
  system: string;
  input: string;
  images?: Array<{ dataUrl: string; detail?: "low" | "high" | "auto" }>;
  maxOutputTokens?: number;
  temperature?: number;
  retries?: number;
  timeoutMs?: number;
};

const DEFAULT_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

function cleanEnv(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveMode(): AiGatewayMode {
  const raw = cleanEnv(process.env.AI_GATEWAY_MODE).toLowerCase();
  if (raw === "gateway" || raw === "openai-direct") return raw;
  return "auto";
}

function getGatewayCredential(): string {
  return cleanEnv(process.env.AI_GATEWAY_API_KEY) || cleanEnv(process.env.VERCEL_OIDC_TOKEN);
}

function getOpenAiCredential(): string {
  return cleanEnv(process.env.OPENAI_API_KEY);
}

function normalizeGatewayBaseUrl(value: unknown): string {
  const raw = cleanEnv(value) || DEFAULT_GATEWAY_BASE_URL;
  return raw.replace(/\/+$/, "");
}

/**
 * AI Gateway expects provider/model identifiers. During the transition, old
 * OpenAI model names such as "gpt-4o-mini" remain accepted and are normalized
 * to "openai/gpt-4o-mini".
 */
export function normalizeGatewayModelId(value: unknown, defaultProvider = "openai"): string {
  const raw = cleanEnv(value);
  if (!raw) return `${defaultProvider}/${DEFAULT_OPENAI_MODEL}`;
  return raw.includes("/") ? raw : `${defaultProvider}/${raw}`;
}

function normalizeDirectOpenAiModelId(value: unknown): string {
  const raw = cleanEnv(value) || DEFAULT_OPENAI_MODEL;
  if (raw.startsWith("openai/")) return raw.slice("openai/".length);
  if (raw.includes("/")) {
    throw new Error(
      `Le modèle ${raw} nécessite Vercel AI Gateway. Configurez AI_GATEWAY_API_KEY ou VERCEL_OIDC_TOKEN.`,
    );
  }
  return raw;
}

export function getAiGenerationRuntime(): AiGenerationRuntime {
  const mode = resolveMode();
  const gatewayCredential = getGatewayCredential();

  if (mode === "gateway") return "vercel-ai-gateway";
  if (mode === "openai-direct") return "openai-direct";
  return gatewayCredential ? "vercel-ai-gateway" : "openai-direct";
}

export function hasAiGenerationCredentials(): boolean {
  const runtime = getAiGenerationRuntime();
  return runtime === "vercel-ai-gateway"
    ? Boolean(getGatewayCredential())
    : Boolean(getOpenAiCredential());
}

export function getAiGenerationRuntimeInfo() {
  const mode = resolveMode();
  const runtime = getAiGenerationRuntime();
  return {
    mode,
    runtime,
    gatewayConfigured: Boolean(getGatewayCredential()),
    gatewayAuth: cleanEnv(process.env.AI_GATEWAY_API_KEY)
      ? "api-key"
      : cleanEnv(process.env.VERCEL_OIDC_TOKEN)
        ? "oidc"
        : "none",
    openAiDirectConfigured: Boolean(getOpenAiCredential()),
    gatewayBaseUrl: normalizeGatewayBaseUrl(process.env.AI_GATEWAY_BASE_URL),
  } as const;
}

function resolveRequestedModel(opts: AiGenerateJsonOptions, hasImages: boolean): string {
  return (
    cleanEnv(opts.model) ||
    (hasImages ? cleanEnv(process.env.AI_GATEWAY_VISION_MODEL) : "") ||
    cleanEnv(process.env.AI_GATEWAY_MODEL) ||
    (hasImages ? cleanEnv(process.env.OPENAI_VISION_MODEL) : "") ||
    cleanEnv(process.env.OPENAI_MODEL) ||
    DEFAULT_OPENAI_MODEL
  );
}

function extractResponseText(json: any): string {
  const outputText = typeof json?.output_text === "string" ? json.output_text : "";
  const nestedTexts = Array.isArray(json?.output)
    ? json.output.flatMap((item: any) =>
        Array.isArray(item?.content)
          ? item.content
              .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
              .filter(Boolean)
          : [],
      )
    : [];
  return outputText || nestedTexts.join("\n").trim();
}

function parseJsonOutput<T extends AiResponseJSON>(contentText: string): T {
  try {
    return JSON.parse(contentText) as T;
  } catch {
    const start = contentText.indexOf("{");
    const end = contentText.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(contentText.slice(start, end + 1)) as T;
    }
    throw new Error("La génération n'a pas pu être finalisée. Merci de réessayer.");
  }
}

/**
 * Point d'entrée neutre de génération IA iNrCy.
 *
 * - AI_GATEWAY_MODE=gateway : Vercel AI Gateway obligatoire.
 * - AI_GATEWAY_MODE=openai-direct : OpenAI direct obligatoire (transition).
 * - AI_GATEWAY_MODE=auto (défaut) : Gateway si configuré, sinon OpenAI direct.
 *
 * Les prompts métier et le contrat JSON restent inchangés.
 */
export async function aiGenerateJSON<T extends AiResponseJSON>(opts: AiGenerateJsonOptions): Promise<T> {
  const hasImages = Array.isArray(opts.images) && opts.images.length > 0;
  const runtime = getAiGenerationRuntime();
  const requestedModel = resolveRequestedModel(opts, hasImages);

  const credential = runtime === "vercel-ai-gateway" ? getGatewayCredential() : getOpenAiCredential();
  if (!credential) {
    throw new Error(
      runtime === "vercel-ai-gateway"
        ? "Configuration AI Gateway manquante."
        : "Configuration IA manquante.",
    );
  }

  const baseUrl = runtime === "vercel-ai-gateway"
    ? normalizeGatewayBaseUrl(process.env.AI_GATEWAY_BASE_URL)
    : "https://api.openai.com/v1";
  const model = runtime === "vercel-ai-gateway"
    ? normalizeGatewayModelId(requestedModel)
    : normalizeDirectOpenAiModelId(requestedModel);

  const max_output_tokens = Math.max(128, Math.min(8000, opts.maxOutputTokens ?? 700));
  const temperature = typeof opts.temperature === "number"
    ? Math.max(0, Math.min(2, opts.temperature))
    : undefined;

  const userContent: Array<Record<string, unknown>> = [
    { type: "input_text", text: opts.input },
    ...((opts.images || []).map((image) => ({
      type: "input_image",
      image_url: image.dataUrl,
      detail: image.detail || "low",
    }))),
  ];

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
      text: {
        format: { type: "json_object" },
      },
      input: [
        { role: "system", content: [{ type: "input_text", text: opts.system }] },
        { role: "user", content: userContent },
      ],
    }),
    retries: opts.retries ?? 2,
    timeoutMs: opts.timeoutMs ?? 30_000,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const label = runtime === "vercel-ai-gateway" ? "AI Gateway" : "Service IA";
    throw new Error(`${label} error (${res.status}): ${text || res.statusText}`);
  }

  const json = (await res.json()) as any;
  const contentText = extractResponseText(json);

  if (!contentText) {
    const status = typeof json?.status === "string" ? ` (${json.status})` : "";
    throw new Error(`Service IA : contenu de sortie manquant${status}`);
  }

  return parseJsonOutput<T>(contentText);
}
