import "server-only";

import { log } from "@/lib/observability/logger";
import {
  FACEBOOK_RECONNECT_USER_MESSAGE,
  GOOGLE_BUSINESS_RECONNECT_USER_MESSAGE,
  INSTAGRAM_RECONNECT_USER_MESSAGE,
  LINKEDIN_RECONNECT_USER_MESSAGE,
  getSimpleFrenchErrorMessage,
} from "@/lib/userFacingErrors";

export type PublishDiagnosticChannel = "facebook" | "instagram" | "linkedin" | "gmb" | "inrcy_site" | "site_web";

const CHANNEL_LABELS: Record<PublishDiagnosticChannel, string> = {
  inrcy_site: "Site iNrCy",
  site_web: "Site web",
  gmb: "Google Business",
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
};

const CHANNEL_FALLBACKS: Record<PublishDiagnosticChannel, string> = {
  inrcy_site: "Le site iNrCy n'a pas pu publier. Merci de réessayer.",
  site_web: "Le site web n'a pas pu publier. Merci de réessayer.",
  gmb: "Google Business n'a pas pu publier. Merci de réessayer.",
  facebook: "Facebook n'a pas pu publier. Merci de réessayer.",
  instagram: "Instagram n'a pas pu publier. Merci de réessayer.",
  linkedin: "LinkedIn n'a pas pu publier. Merci de réessayer.",
};

const CHANNEL_RECONNECTS: Partial<Record<PublishDiagnosticChannel, string>> = {
  gmb: GOOGLE_BUSINESS_RECONNECT_USER_MESSAGE,
  facebook: FACEBOOK_RECONNECT_USER_MESSAGE,
  instagram: INSTAGRAM_RECONNECT_USER_MESSAGE,
  linkedin: LINKEDIN_RECONNECT_USER_MESSAGE,
};

function stringifyError(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof Error) return input.message || String(input);
  try {
    return JSON.stringify(input);
  } catch {
    return String(input || "");
  }
}

function sanitizeDiagnostics(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[truncated]";
  if (value == null) return value;
  if (typeof value === "string") {
    const redacted = value
      .replace(/([?&](?:access_token|token|refresh_token|signature|sig)=)[^&\s]+/gi, "$1[redacted]")
      .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[redacted]");
    return redacted.length > 1500 ? `${redacted.slice(0, 1500)}…` : redacted;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 12).map((item) => sanitizeDiagnostics(item, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/(token|secret|password|cookie|authorization|access_token|refresh_token)/i.test(key)) continue;
    out[key] = sanitizeDiagnostics(child, depth + 1);
  }
  return out;
}

export function getPublishChannelUserMessage(
  channel: PublishDiagnosticChannel,
  error: unknown,
  fallback?: string,
): string {
  const raw = stringifyError(error).trim();
  const label = CHANNEL_LABELS[channel] || channel;
  const fallbackMessage = fallback || CHANNEL_FALLBACKS[channel] || "La publication n'a pas pu aboutir.";
  const message = getSimpleFrenchErrorMessage(`${label} ${raw}`, fallbackMessage);

  // Si l'erreur brute indique clairement une connexion/tokens invalides mais que le mapper
  // global est passé à côté, on garde un message court et actionnable.
  const lower = raw.toLowerCase();
  const reconnectMessage = CHANNEL_RECONNECTS[channel];
  if (
    reconnectMessage
    && /(authorization|autorisation|authorisation|unauthorized|unauthorised|not authorized|permission|scope|access token|oauth|token expired|expired token|invalid_grant|refresh token|session has expired|\(#?(10|190|200)\)|\b401\b|\b403\b)/i.test(lower)
  ) {
    return reconnectMessage;
  }

  return message;
}

export function logPublishChannelFailure(params: {
  route: string;
  channel: PublishDiagnosticChannel;
  userId?: string | null;
  publicationId?: string | null;
  error: unknown;
  userMessage?: string | null;
  diagnostics?: unknown;
  stage?: string;
}) {
  const rawError = stringifyError(params.error).slice(0, 1000);
  log.warn("channel_publish_failed", {
    route: params.route,
    channel: params.channel,
    user_id: params.userId || undefined,
    publication_id: params.publicationId || undefined,
    stage: params.stage || undefined,
    error: rawError,
    user_message: params.userMessage || undefined,
    diagnostics: params.diagnostics ? sanitizeDiagnostics(params.diagnostics) : undefined,
  });
}
