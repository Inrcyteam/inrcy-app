export const GOOGLE_BUSINESS_LOCAL_POST_TIMEOUT_MS = 15_000;

export class GoogleBusinessPostTransportError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly retryable: boolean;
  /** A POST may have reached Google even though its response was lost. */
  readonly outcomeUnknown: boolean;

  constructor(
    code: string,
    message: string,
    options: {
      status?: number | null;
      retryable?: boolean;
      outcomeUnknown?: boolean;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "GoogleBusinessPostTransportError";
    this.code = code;
    this.status = Number.isFinite(options.status) ? Number(options.status) : null;
    this.retryable = options.retryable === true;
    this.outcomeUnknown = options.outcomeUnknown === true;
  }
}

export function isGoogleBusinessPostOutcomeUnknown(error: unknown) {
  if (error instanceof GoogleBusinessPostTransportError) {
    return error.outcomeUnknown;
  }
  return Boolean(
    error &&
      typeof error === "object" &&
      (error as Record<string, unknown>).outcomeUnknown === true,
  );
}

function providerMessage(value: unknown, fallback: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const record = value as Record<string, unknown>;
  const error =
    record.error && typeof record.error === "object" && !Array.isArray(record.error)
      ? (record.error as Record<string, unknown>)
      : {};
  return (
    String(error.message || "").trim() ||
    String(record.error_description || "").trim() ||
    fallback
  );
}

function parseJson(value: string) {
  if (!value) return {};
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}

function isRetryableGoogleHttpStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function validateGoogleBusinessEndpoint(value: string) {
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new GoogleBusinessPostTransportError(
      "gmb_local_post_endpoint_invalid",
      "Destination Google Business invalide.",
    );
  }
  if (
    endpoint.protocol !== "https:" ||
    endpoint.hostname !== "mybusiness.googleapis.com" ||
    !/^\/v4\/accounts\/[^/]+\/locations\/[^/]+\/localPosts$/.test(
      endpoint.pathname,
    )
  ) {
    throw new GoogleBusinessPostTransportError(
      "gmb_local_post_endpoint_invalid",
      "Destination Google Business non reconnue.",
    );
  }
  return endpoint.toString();
}

/**
 * Local Posts accept media by sourceUrl only. This function sends a small JSON
 * document; video bytes stay in shared storage and are pulled by Google.
 *
 * Creation has no provider idempotency key. We deliberately do not retry a
 * network/timeout failure: the outcome is ambiguous and a blind retry could
 * create a duplicate post. The durable channel worker must reconcile/decide.
 */
export async function postGoogleBusinessLocalPost(params: {
  endpoint: string;
  accessToken: string;
  payload: unknown;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}) {
  const endpoint = validateGoogleBusinessEndpoint(params.endpoint);
  const accessToken = String(params.accessToken || "").trim();
  if (!accessToken) {
    throw new GoogleBusinessPostTransportError(
      "gmb_access_token_missing",
      "Connexion Google Business expirée.",
    );
  }
  const requestedTimeout = Number(params.timeoutMs);
  const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0
    ? Math.max(100, Math.min(30_000, requestedTimeout))
    : GOOGLE_BUSINESS_LOCAL_POST_TIMEOUT_MS;
  let requestBody: string;
  try {
    requestBody = JSON.stringify(params.payload);
  } catch (error) {
    throw new GoogleBusinessPostTransportError(
      "gmb_local_post_payload_invalid",
      "Le contenu Google Business est invalide.",
      { cause: error },
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error("gmb_local_post_timeout")),
    timeoutMs,
  );
  let response: Response;
  let raw: string;
  try {
    response = await (params.fetchImpl || fetch)(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: requestBody,
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    raw = await response.text();
  } catch (error) {
    const timedOut = controller.signal.aborted;
    throw new GoogleBusinessPostTransportError(
      timedOut ? "gmb_local_post_timeout" : "gmb_local_post_network_error",
      timedOut
        ? "Google Business n'a pas répondu dans le délai prévu. L'état de la publication doit être vérifié avant toute relance."
        : "La réponse Google Business a été interrompue. L'état de la publication doit être vérifié avant toute relance.",
      {
        retryable: false,
        outcomeUnknown: true,
        cause: error,
      },
    );
  } finally {
    clearTimeout(timer);
  }

  const parsed = parseJson(raw);
  if (!response.ok) {
    throw new GoogleBusinessPostTransportError(
      "gmb_local_post_http_error",
      providerMessage(
        parsed,
        "Impossible de publier sur Google Business pour le moment.",
      ),
      {
        status: response.status,
        retryable: isRetryableGoogleHttpStatus(response.status),
        outcomeUnknown: false,
      },
    );
  }
  return parsed;
}
