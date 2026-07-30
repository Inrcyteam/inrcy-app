export type BoosterGenerationErrorPayload = Record<string, unknown>;

const NON_RETRYABLE_GENERATION_CODES = new Set([
  "booster_generation_burst_limit",
  "rate_limit_burst",
  "rate_limiter_unavailable",
  "ai_quota_reached",
  "ai_quota_unavailable",
  "ai_gateway_account_limit_reached",
  "ai_gateway_guard_unavailable",
  "ai_operation_budget_exceeded",
  "ai_gateway_auth",
]);

const RETRYABLE_PROVIDER_CODES = new Set([
  "ai_gateway_rate_limit",
  "ai_gateway_unavailable",
  "ai_gateway_request_failed",
  "ai_gateway_invalid_request",
  "ai_operation_deadline_exceeded",
]);

export function getBoosterGenerationErrorCode(
  payload: BoosterGenerationErrorPayload,
): string {
  return String(payload.error_code || payload.code || "").trim();
}

export function isAutomaticBoosterGenerationRetryEligible(
  status: number,
  payload: BoosterGenerationErrorPayload,
): boolean {
  const code = getBoosterGenerationErrorCode(payload);
  if (NON_RETRYABLE_GENERATION_CODES.has(code)) return false;
  if (RETRYABLE_PROVIDER_CODES.has(code)) return true;

  // A generic 429 may be the user's anti-burst limit or product quota.
  // It must never trigger an immediate second user request.
  return [502, 503, 504].includes(status);
}

function parseRetryAfterSeconds(value: string | null): number | null {
  const seconds = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function payloadMessage(payload: BoosterGenerationErrorPayload): string {
  return String(payload.user_message || payload.error || "").trim();
}

export function getBoosterGenerationSpecialErrorMessage(args: {
  status: number;
  payload: BoosterGenerationErrorPayload;
  retryAfterHeader?: string | null;
}): string | null {
  const code = getBoosterGenerationErrorCode(args.payload);
  const retryAfterSeconds = parseRetryAfterSeconds(
    args.retryAfterHeader || null,
  );

  if (code === "booster_generation_burst_limit" || code === "rate_limit_burst") {
    if (retryAfterSeconds) {
      return `Vous avez lancé plusieurs générations très rapidement. Patientez ${retryAfterSeconds} seconde${retryAfterSeconds > 1 ? "s" : ""} puis réessayez.`;
    }
    return "Vous avez lancé plusieurs générations très rapidement. Patientez quelques instants puis réessayez.";
  }

  if (code === "ai_quota_reached") {
    return (
      payloadMessage(args.payload) ||
      "Votre quota IA est atteint pour cette période. Vous pourrez réessayer après son renouvellement."
    );
  }

  if (code === "ai_quota_unavailable") {
    return (
      payloadMessage(args.payload) ||
      "La vérification de votre quota IA est momentanément indisponible. Merci de réessayer dans quelques minutes."
    );
  }

  if (code === "rate_limiter_unavailable") {
    return (
      payloadMessage(args.payload) ||
      "La protection anti-abus est momentanément indisponible. Merci de réessayer dans quelques minutes."
    );
  }

  if (code === "ai_gateway_rate_limit") {
    return (
      payloadMessage(args.payload) ||
      "Ce moteur IA est temporairement très sollicité. Réessayez dans quelques minutes ou choisissez un autre moteur IA."
    );
  }

  if (args.status === 429) {
    return (
      payloadMessage(args.payload) ||
      "La génération est temporairement limitée. Patientez quelques instants puis réessayez."
    );
  }

  return null;
}
