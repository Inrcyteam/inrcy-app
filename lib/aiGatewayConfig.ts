import "server-only";

const DEFAULT_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1";
const DEFAULT_GATEWAY_TRANSCRIPTION_URL = "https://ai-gateway.vercel.sh/v4/ai/transcription-model";
const DEFAULT_GATEWAY_MODEL = "openai/gpt-4o-mini";

export function cleanAiGatewayEnv(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function getAiGatewayCredential(): string {
  return cleanAiGatewayEnv(process.env.AI_GATEWAY_API_KEY) || cleanAiGatewayEnv(process.env.VERCEL_OIDC_TOKEN);
}

export function normalizeAiGatewayBaseUrl(value: unknown): string {
  const raw = cleanAiGatewayEnv(value) || DEFAULT_GATEWAY_BASE_URL;
  return raw.replace(/\/+$/, "");
}

export function getAiGatewayTranscriptionUrl(): string {
  return (
    cleanAiGatewayEnv(process.env.AI_GATEWAY_TRANSCRIPTION_URL) ||
    DEFAULT_GATEWAY_TRANSCRIPTION_URL
  ).replace(/\/+$/, "");
}

/**
 * AI Gateway attend des identifiants provider/model. Les anciens noms sans
 * préfixe restent tolérés pour les variables d'environnement historiques.
 */
export function normalizeGatewayModelId(value: unknown, defaultProvider = "openai"): string {
  const raw = cleanAiGatewayEnv(value);
  if (!raw) return DEFAULT_GATEWAY_MODEL;
  return raw.includes("/") ? raw : `${defaultProvider}/${raw}`;
}
