type JsonRecord = Record<string, unknown>;

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type BoosterPublishProgressStage =
  | "request_accepted"
  | "status_update"
  | "completed"
  | "released_to_background";

export type BoosterPublishProgressUpdate = {
  stage: BoosterPublishProgressStage;
  publicationId: string | null;
  payload: JsonRecord;
  pollAttempt: number;
};

type BoosterPublishRequestOptions = {
  fetchImpl?: FetchLike;
  sleepImpl?: (ms: number) => Promise<void>;
  maxAttempts?: number;
  maxPollingMs?: number;
  nowImpl?: () => number;
  onProgress?: (update: BoosterPublishProgressUpdate) => void;
};

export class BoosterPublishError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly payload: JsonRecord;
  readonly invalidChannels: unknown[];

  constructor(message: string, status: number, payload: JsonRecord) {
    super(message);
    this.name = "BoosterPublishError";
    this.status = status;
    this.code = String(payload.code || "").trim() || null;
    this.payload = payload;
    this.invalidChannels = Array.isArray(payload.invalidChannels)
      ? payload.invalidChannels
      : [];
  }
}

/**
 * Fenêtre visible standard. Une fois écoulée, le bilan est rendu avec les
 * canaux encore en traitement; le job durable continue côté serveur.
 */
export const BOOSTER_PUBLISH_RESULT_GRACE_MS = 60_000;

const TRANSIENT_STATUS_CODES = new Set([425, 502, 503, 504]);
const BOOSTER_PUBLISH_INITIAL_POLL_MS = 1_500;
const BOOSTER_PUBLISH_MAX_POLL_MS = 8_000;

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

function notifyProgress(
  callback: BoosterPublishRequestOptions["onProgress"],
  update: BoosterPublishProgressUpdate,
) {
  try {
    callback?.(update);
  } catch {
    // L'affichage de progression est secondaire : une erreur React/UI ne doit
    // jamais interrompre une publication déjà acceptée par le serveur.
  }
}

async function pollQueuedPublication(
  publicationId: string,
  initialPayload: JsonRecord,
  options: Required<
    Pick<BoosterPublishRequestOptions, "fetchImpl" | "sleepImpl" | "nowImpl">
  > & {
    maxPollingMs: number;
    onProgress?: BoosterPublishRequestOptions["onProgress"];
  },
) {
  const startedAt = options.nowImpl();
  let consecutiveNetworkErrors = 0;
  let pollAttempt = 0;
  let latestPayload: JsonRecord = {
    ...initialPayload,
    ok: true,
    queued: true,
    done: false,
    publication_id: publicationId,
  };

  while (options.nowImpl() - startedAt < options.maxPollingMs) {
    const elapsed = options.nowImpl() - startedAt;
    const remainingMs = Math.max(0, options.maxPollingMs - elapsed);
    const nextDelayMs = Math.min(
      BOOSTER_PUBLISH_MAX_POLL_MS,
      BOOSTER_PUBLISH_INITIAL_POLL_MS * 2 ** Math.min(3, pollAttempt),
    );
    pollAttempt += 1;
    await options.sleepImpl(Math.min(nextDelayMs, remainingMs));
    const elapsedAfterSleep = options.nowImpl() - startedAt;

    try {
      const response = await options.fetchImpl(
        `/api/booster/publications/${encodeURIComponent(publicationId)}/status`,
        { method: "GET", cache: "no-store" },
      );
      const payload = asRecord(await response.json().catch(() => ({})));
      if (response.ok && payload.done === true) {
        notifyProgress(options.onProgress, {
          stage: "completed",
          publicationId,
          payload,
          pollAttempt,
        });
        return payload;
      }
      if (response.ok && payload.queued === true) {
        latestPayload = { ...latestPayload, ...payload };
        consecutiveNetworkErrors = 0;
        notifyProgress(options.onProgress, {
          stage: "status_update",
          publicationId,
          payload: latestPayload,
          pollAttempt,
        });
        continue;
      }
      if (response.status === 404 && elapsedAfterSleep < 12_000) continue;
      if (response.status === 429 || response.status >= 500) {
        consecutiveNetworkErrors += 1;
        continue;
      }
      throw new BoosterPublishError(
        String(
          payload.user_message ||
            payload.error ||
            "Impossible de vérifier la publication.",
        ),
        response.status,
        payload,
      );
    } catch (error) {
      if (error instanceof BoosterPublishError) throw error;
      consecutiveNetworkErrors += 1;
      // The dispatch has already been accepted. A temporary status-read error
      // must never keep the publishing modal blocked for several minutes.
      if (consecutiveNetworkErrors <= 5) continue;
      break;
    }
  }

  const releasedPayload: JsonRecord = {
    ...latestPayload,
    ok: true,
    done: false,
    queued: true,
    asyncDispatch: true,
    publication_id: publicationId,
    releasedToBackground: true,
  };
  notifyProgress(options.onProgress, {
    stage: "released_to_background",
    publicationId,
    payload: releasedPayload,
    pollAttempt,
  });
  return releasedPayload;
}

export async function postBoosterPublication(
  payload: Record<string, unknown>,
  options: BoosterPublishRequestOptions = {},
) {
  const fetchImpl = options.fetchImpl || globalThis.fetch.bind(globalThis);
  const sleepImpl = options.sleepImpl || sleep;
  const nowImpl = options.nowImpl || Date.now;
  const requestStartedAt = nowImpl();
  const resultGraceMs = Math.max(
    0,
    options.maxPollingMs ?? BOOSTER_PUBLISH_RESULT_GRACE_MS,
  );
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
        notifyProgress(options.onProgress, {
          stage: "request_accepted",
          publicationId: String(json.publication_id),
          payload: json,
          pollAttempt: 0,
        });
        const elapsedBeforePollingMs = Math.max(
          0,
          nowImpl() - requestStartedAt,
        );
        return pollQueuedPublication(String(json.publication_id), json, {
          fetchImpl,
          sleepImpl,
          // La fenêtre de bilan inclut l'accusé initial. Les canaux encore
          // lents sont ensuite libérés vers le worker durable et restent
          // consultables dans iNr’Send.
          maxPollingMs: Math.max(
            0,
            resultGraceMs - elapsedBeforePollingMs,
          ),
          nowImpl,
          onProgress: options.onProgress,
        });
      }
      notifyProgress(options.onProgress, {
        stage: "completed",
        publicationId:
          typeof json.publication_id === "string"
            ? String(json.publication_id)
            : null,
        payload: json,
        pollAttempt: 0,
      });
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
      throw new BoosterPublishError(
        String(
          json.message ||
            "La publication est toujours en cours. Consultez iNr’Send avant de relancer afin d’éviter un doublon.",
        ),
        response.status,
        json,
      );
    }

    if (TRANSIENT_STATUS_CODES.has(response.status)) {
      throw buildConnectionInterruptedError();
    }

    throw new BoosterPublishError(
      String(json.user_message || json.error || "La publication a échoué."),
      response.status,
      json,
    );
  }

  if (lastNetworkError) throw buildConnectionInterruptedError();
  throw new Error("La publication n’a pas pu être finalisée.");
}
