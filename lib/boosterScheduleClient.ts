import { fetchWithBrowserDeadline } from "./browserFetchDeadline.ts";

type JsonRecord = Record<string, unknown>;

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type BoosterScheduleRequestOptions = {
  fetchImpl?: FetchLike;
  sleepImpl?: (ms: number) => Promise<void>;
  maxAttempts?: number;
  maxRecoveryAttempts?: number;
  requestTimeoutMs?: number;
  recoveryTimeoutMs?: number;
};

export class BoosterScheduleError extends Error {
  readonly status: number;
  readonly payload: JsonRecord;

  constructor(message: string, status: number, payload: JsonRecord) {
    super(message);
    this.name = "BoosterScheduleError";
    this.status = status;
    this.payload = payload;
  }
}

const TRANSIENT_SCHEDULE_STATUSES = new Set([425, 502, 503, 504]);
const SCHEDULE_REQUEST_TIMEOUT_MS = 20_000;
const SCHEDULE_RECOVERY_TIMEOUT_MS = 5_000;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function fallbackUuidV4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function createBoosterScheduleRequestId() {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
    if (typeof globalThis.crypto?.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      globalThis.crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (value) =>
        value.toString(16).padStart(2, "0"),
      ).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch {}
  return fallbackUuidV4();
}

function reportScheduleResponseLoss(params: {
  recovered: boolean;
  requestId: string;
}) {
  console.warn("[booster-schedule] response lost", {
    recovered: params.recovered,
    requestId: params.requestId,
    browserOnline:
      typeof navigator === "undefined" ? null : navigator.onLine,
  });
  if (typeof window === "undefined") return;
  void import("@sentry/nextjs")
    .then((Sentry) => {
      Sentry.withScope((scope) => {
        scope.setLevel("warning");
        scope.setTag("booster.operation", "schedule");
        scope.setTag("booster.recovered", String(params.recovered));
        Sentry.captureMessage("booster_schedule_response_lost", "warning");
      });
    })
    .catch(() => undefined);
}

async function recoverScheduledAction(params: {
  requestId: string;
  fetchImpl: FetchLike;
  sleepImpl: (ms: number) => Promise<void>;
  maxAttempts: number;
  timeoutMs: number;
}): Promise<JsonRecord | null> {
  for (let attempt = 0; attempt < params.maxAttempts; attempt += 1) {
    if (attempt > 0) {
      await params.sleepImpl(Math.min(5_000, 800 * 2 ** (attempt - 1)));
    }
    try {
      const query = new URLSearchParams({ requestId: params.requestId });
      const response = await fetchWithBrowserDeadline({
        fetchImpl: params.fetchImpl,
        input: `/api/agent/scheduled-actions?${query}`,
        init: { method: "GET", cache: "no-store" },
        timeoutMs: params.timeoutMs,
        timeoutCode: "booster_schedule_recovery_timeout",
      });
      const json = asRecord(await response.json().catch(() => ({})));
      if (response.ok && Object.keys(asRecord(json.scheduledAction)).length) {
        return {
          ...json,
          recoveredAfterTransportLoss: true,
          scheduleRequestId: params.requestId,
        };
      }
      if ([400, 401, 403].includes(response.status)) break;
    } catch {
      // Une lecture de reçu ne crée jamais une seconde programmation.
    }
  }
  return null;
}

export async function postBoosterScheduledAction(
  payload: Record<string, unknown>,
  options: BoosterScheduleRequestOptions = {},
): Promise<JsonRecord> {
  const fetchImpl = options.fetchImpl || globalThis.fetch.bind(globalThis);
  const sleepImpl = options.sleepImpl || sleep;
  const maxAttempts = Math.max(1, Math.min(4, options.maxAttempts || 3));
  const maxRecoveryAttempts = Math.max(
    1,
    Math.min(10, options.maxRecoveryAttempts || 8),
  );
  const requestTimeoutMs = Math.max(
    1,
    Math.min(60_000, options.requestTimeoutMs || SCHEDULE_REQUEST_TIMEOUT_MS),
  );
  const recoveryTimeoutMs = Math.max(
    1,
    Math.min(
      15_000,
      options.recoveryTimeoutMs || SCHEDULE_RECOVERY_TIMEOUT_MS,
    ),
  );
  const requestId = String(
    payload.scheduleRequestId || createBoosterScheduleRequestId(),
  ).trim();
  const requestPayload = {
    ...payload,
    scheduleRequestId: requestId,
  };

  const recover = async (reportWhenMissing = true) => {
    const result = await recoverScheduledAction({
      requestId,
      fetchImpl,
      sleepImpl,
      maxAttempts: maxRecoveryAttempts,
      timeoutMs: recoveryTimeoutMs,
    });
    if (result || reportWhenMissing) {
      reportScheduleResponseLoss({
        recovered: Boolean(result),
        requestId,
      });
    }
    return result;
  };

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetchWithBrowserDeadline({
        fetchImpl,
        input: "/api/agent/scheduled-actions",
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestPayload),
        },
        timeoutMs: requestTimeoutMs,
        timeoutCode: "booster_schedule_request_timeout",
      });
    } catch {
      if (attempt + 1 < maxAttempts) {
        await sleepImpl(Math.min(4_000, 1_000 * (attempt + 1)));
        continue;
      }
      const recovered = await recover();
      if (recovered) return recovered;
      throw new Error(
        "Connexion interrompue pendant la programmation. iNrCy n’a lancé aucun nouvel enregistrement automatique ; vérifiez iNr’Agent avant de recommencer.",
      );
    }

    const json = asRecord(await response.json().catch(() => ({})));
    if (response.ok) return json;
    if (response.status === 409) {
      // Une première requête peut avoir inséré la ligne juste après le contrôle
      // initial de la nouvelle tentative. Seul le reçu portant exactement le
      // même UUID transforme alors ce conflit en succès idempotent.
      const recovered = await recover(false);
      if (recovered) return recovered;
    }
    if (
      TRANSIENT_SCHEDULE_STATUSES.has(response.status) &&
      attempt + 1 < maxAttempts
    ) {
      await sleepImpl(Math.min(4_000, 1_000 * (attempt + 1)));
      continue;
    }
    if (TRANSIENT_SCHEDULE_STATUSES.has(response.status)) {
      const recovered = await recover();
      if (recovered) return recovered;
    }
    throw new BoosterScheduleError(
      String(json.error || "Programmation de la publication impossible."),
      response.status,
      json,
    );
  }

  throw new Error("Programmation de la publication impossible.");
}
