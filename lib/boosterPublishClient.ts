type JsonRecord = Record<string, unknown>;

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type BoosterPublishRequestOptions = {
  fetchImpl?: FetchLike;
  sleepImpl?: (ms: number) => Promise<void>;
  maxAttempts?: number;
  maxPollingMs?: number;
};

const TRANSIENT_STATUS_CODES = new Set([425, 502, 503, 504]);

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function randomToken() {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    // Fallback below for older Android WebViews.
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function createBoosterPublishIdempotencyKey() {
  return `booster_manual:${randomToken()}`;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function readRetryDelayMs(response: Response, payload: JsonRecord, attempt: number) {
  const headerSeconds = Number(response.headers.get("Retry-After") || 0);
  const payloadSeconds = Number(payload.retryAfterSeconds || 0);
  const requestedSeconds = Math.max(headerSeconds, payloadSeconds);
  if (Number.isFinite(requestedSeconds) && requestedSeconds > 0) {
    // The UI must not freeze for a whole minute. A few seconds are enough to
    // recover a response lost by a mobile connection while the server keeps
    // the same idempotency lock.
    return Math.min(4_000, Math.max(1_000, requestedSeconds * 1_000));
  }
  return Math.min(4_000, 1_200 * (attempt + 1));
}

function buildConnectionInterruptedError() {
  return new Error(
    "Connexion interrompue pendant la publication. L’envoi peut encore être en cours : vérifiez iNr’Send avant de relancer.",
  );
}

async function pollQueuedPublication(
  publicationId: string,
  options: Required<Pick<BoosterPublishRequestOptions, "fetchImpl" | "sleepImpl">> & {
    maxPollingMs: number;
  },
) {
  const startedAt = Date.now();
  let consecutiveNetworkErrors = 0;

  while (Date.now() - startedAt < options.maxPollingMs) {
    const elapsed = Date.now() - startedAt;
    await options.sleepImpl(elapsed < 60_000 ? 2_000 : 5_000);

    try {
      const response = await options.fetchImpl(
        `/api/booster/publications/${encodeURIComponent(publicationId)}/status`,
        { method: "GET", cache: "no-store" },
      );
      const payload = asRecord(await response.json().catch(() => ({})));
      if (response.ok && payload.done === true) return payload;
      if (response.ok && payload.queued === true) {
        consecutiveNetworkErrors = 0;
        continue;
      }
      if (response.status === 404 && elapsed < 15_000) continue;
      if (response.status >= 500) {
        consecutiveNetworkErrors += 1;
        if (consecutiveNetworkErrors <= 5) continue;
      }
      throw new Error(
        String(
          payload.user_message ||
            payload.error ||
            "Impossible de vérifier la publication.",
        ),
      );
    } catch (error) {
      consecutiveNetworkErrors += 1;
      if (consecutiveNetworkErrors <= 5) continue;
      throw error instanceof Error ? error : buildConnectionInterruptedError();
    }
  }

  throw new Error(
    "La publication continue en arrière-plan. Consultez iNr’Send avant toute nouvelle tentative.",
  );
}

export async function postBoosterPublication(
  payload: Record<string, unknown>,
  options: BoosterPublishRequestOptions = {},
) {
  const fetchImpl = options.fetchImpl || globalThis.fetch.bind(globalThis);
  const sleepImpl = options.sleepImpl || sleep;
  const maxAttempts = Math.max(1, Math.min(4, options.maxAttempts || 3));
  const idempotencyKey = String(
    payload.idempotencyKey || payload.idempotency_key || createBoosterPublishIdempotencyKey(),
  ).trim();
  const origin = asRecord(payload.origin);
  const requestPayload = {
    ...payload,
    idempotencyKey,
    origin: {
      ...origin,
      idempotencyKey,
    },
  };

  let lastNetworkError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl("/api/booster/publish-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      });
    } catch (error) {
      lastNetworkError = error;
      if (attempt + 1 < maxAttempts) {
        await sleepImpl(Math.min(4_000, 1_200 * (attempt + 1)));
        continue;
      }
      throw buildConnectionInterruptedError();
    }

    const json = asRecord(await response.json().catch(() => ({})));
    if (response.ok) {
      if (json.queued === true && typeof json.publication_id === "string") {
        return pollQueuedPublication(String(json.publication_id), {
          fetchImpl,
          sleepImpl,
          maxPollingMs: Math.max(60_000, options.maxPollingMs || 8 * 60_000),
        });
      }
      return json;
    }

    const isPendingIdempotentExecution =
      response.status === 425 ||
      json.idempotencyPending === true ||
      String(json.code || "") === "execution_already_running";
    const isTransient =
      isPendingIdempotentExecution || TRANSIENT_STATUS_CODES.has(response.status);

    if (isTransient && attempt + 1 < maxAttempts) {
      await sleepImpl(readRetryDelayMs(response, json, attempt));
      continue;
    }

    if (isPendingIdempotentExecution) {
      throw new Error(
        String(
          json.message ||
            "La publication est toujours en cours. Consultez iNr’Send avant de relancer afin d’éviter un doublon.",
        ),
      );
    }

    if (TRANSIENT_STATUS_CODES.has(response.status)) {
      throw buildConnectionInterruptedError();
    }

    throw new Error(
      String(json.user_message || json.error || "La publication a échoué."),
    );
  }

  if (lastNetworkError) throw buildConnectionInterruptedError();
  throw new Error("La publication n’a pas pu être finalisée.");
}
