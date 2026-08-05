import { INR_MEDIA_VIDEO_SOURCE_MAX_BYTES } from "./mediaRules.ts";

export type PinterestFetch = typeof fetch;

export const PINTEREST_VIDEO_PROTOCOL_CHECKPOINT_VERSION = 1 as const;
export const PINTEREST_VIDEO_JSON_TIMEOUT_MS = 15_000;
export const PINTEREST_VIDEO_UPLOAD_TIMEOUT_MS = 4 * 60_000;
export const PINTEREST_VIDEO_REGISTRATION_FALLBACK_TTL_MS = 15 * 60_000;

export type PinterestVideoProtocolPhase =
  | "new"
  | "registering"
  | "registered"
  | "uploading"
  | "uploaded"
  | "polling"
  | "media_ready"
  | "creating_pin"
  | "completed"
  | "failed"
  | "expired"
  | "outcome_unknown";

export type PinterestVideoMutationPhase =
  | "register"
  | "upload"
  | "create_pin";

export type PinterestVideoProtocolFailure = {
  code: string;
  message: string;
  status: number | null;
  retryable: boolean;
  at: string;
};

export type PinterestVideoOutcomeUnknown = PinterestVideoProtocolFailure & {
  phase: PinterestVideoMutationPhase;
};

/**
 * JSON-safe state persisted by the durable publication worker.
 *
 * Upload credentials are retained only until the S3 upload is confirmed.
 * Access tokens and video bytes are deliberately never stored here.
 */
export type PinterestVideoProtocolCheckpoint = {
  version: typeof PINTEREST_VIDEO_PROTOCOL_CHECKPOINT_VERSION;
  operationId: string;
  sourceFingerprint: string;
  phase: PinterestVideoProtocolPhase;
  createdAt: string;
  updatedAt: string;
  mediaId?: string;
  uploadUrl?: string;
  uploadParameters?: Record<string, string>;
  uploadExpiresAt?: string;
  uploadConfirmedAt?: string;
  mediaStatus?: string;
  mediaReadyAt?: string;
  pollAttempts: number;
  nextPollAt?: string;
  pin?: Record<string, unknown>;
  pinId?: string;
  completedAt?: string;
  failure?: PinterestVideoProtocolFailure;
  outcomeUnknown?: PinterestVideoOutcomeUnknown;
};

export type PinterestVideoDurableStepState =
  | "continue"
  | "waiting"
  | "needs_video_file"
  | "completed"
  | "failed"
  | "expired"
  | "outcome_unknown";

export type PinterestVideoDurableStepResult = {
  state: PinterestVideoDurableStepState;
  checkpoint: PinterestVideoProtocolCheckpoint;
  retryAt?: string | null;
  result?: PinterestVideoProtocolResult;
};

export type PinterestVideoDurableProtocolArgs = {
  apiBaseUrl: string;
  accessToken: string;
  operationId: string;
  sourceFingerprint: string;
  boardId: string;
  title: string;
  description?: string;
  link?: string | null;
  coverImageUrl: string;
  /** File-backed Blob in production so a 300 MiB source stays outside the heap. */
  videoFile?: Blob;
  videoSize: number;
  videoContentType: string;
  videoFileName: string;
  checkpoint?: unknown;
  persistCheckpoint?: (
    checkpoint: PinterestVideoProtocolCheckpoint,
  ) => Promise<void>;
  fetchImpl?: PinterestFetch;
  now?: () => number;
  respectNextPollAt?: boolean;
  jsonTimeoutMs?: number;
  uploadTimeoutMs?: number;
};

export type PinterestVideoProtocolArgs = {
  apiBaseUrl: string;
  accessToken: string;
  boardId: string;
  title: string;
  description?: string;
  link?: string | null;
  coverImageUrl: string;
  /** File-backed Blob in production so large videos stay outside the heap. */
  videoFile?: Blob;
  /** Small compatibility input kept for isolated protocol tests/callers. */
  videoBytes?: Uint8Array;
  videoSize?: number;
  videoContentType: string;
  videoFileName: string;
  fetchImpl?: PinterestFetch;
  wait?: (ms: number) => Promise<void>;
  maxPollAttempts?: number;
};

export type PinterestVideoProtocolResult = {
  pin: Record<string, unknown>;
  mediaId: string;
  mediaStatus: string;
};

type PinterestRequestPhase = PinterestVideoMutationPhase | "poll";

class PinterestVideoRequestError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly retryable: boolean;
  readonly outcomeUnknown: boolean;
  readonly protocolPhase: PinterestRequestPhase;
  readonly pinterestCode: string | null;

  constructor(
    message: string,
    options: {
      code: string;
      phase: PinterestRequestPhase;
      status?: number | null;
      retryable?: boolean;
      outcomeUnknown?: boolean;
      pinterestCode?: string | null;
      cause?: unknown;
    },
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "PinterestVideoRequestError";
    this.code = options.code;
    this.protocolPhase = options.phase;
    this.status = Number.isFinite(options.status) ? Number(options.status) : null;
    this.retryable = options.retryable === true;
    this.outcomeUnknown = options.outcomeUnknown === true;
    this.pinterestCode = cleanText(options.pinterestCode, 160) || null;
  }
}

export class PinterestVideoOutcomeUnknownError extends Error {
  readonly code = "pinterest_video_outcome_unknown";
  readonly outcomeUnknown = true;
  readonly retryable = false;
  readonly pinterestVideoPhase: PinterestVideoMutationPhase;
  readonly pinterestVideoCheckpoint: PinterestVideoProtocolCheckpoint;

  constructor(checkpoint: PinterestVideoProtocolCheckpoint) {
    const outcome = checkpoint.outcomeUnknown;
    super(
      outcome?.message ||
        "Le résultat de la requête Pinterest doit être vérifié avant toute relance.",
    );
    this.name = "PinterestVideoOutcomeUnknownError";
    this.pinterestVideoPhase = outcome?.phase || "create_pin";
    this.pinterestVideoCheckpoint = cloneCheckpoint(checkpoint);
  }
}

export function isPinterestVideoOutcomeUnknown(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      (error as Record<string, unknown>).outcomeUnknown === true,
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function cleanText(value: unknown, maxLength: number) {
  return String(value || "").trim().slice(0, maxLength);
}

function timestamp(value: unknown) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function iso(nowMs: number) {
  return new Date(nowMs).toISOString();
}

function clampTimeout(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.max(100, Math.min(max, Math.round(parsed)))
    : fallback;
}

function normalizeApiBaseUrl(value: unknown) {
  let url: URL;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw new Error("Destination Pinterest invalide.");
  }
  if (url.protocol !== "https:") {
    throw new Error("Destination Pinterest invalide.");
  }
  return url.toString().replace(/\/+$/g, "");
}

function normalizeUploadUrl(value: unknown) {
  let url: URL;
  try {
    url = new URL(String(value || ""));
  } catch {
    return "";
  }
  return url.protocol === "https:" ? url.toString() : "";
}

function normalizeUploadParameters(value: unknown) {
  const result: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(asRecord(value)).slice(0, 40)) {
    const key = cleanText(rawKey, 160);
    if (!key || rawValue === null || rawValue === undefined) continue;
    const parameter = cleanText(rawValue, 20_000);
    if (parameter) result[key] = parameter;
  }
  return result;
}

function decodeBase64Text(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

export function getPinterestUploadExpiration(
  uploadParametersValue: unknown,
  registeredAtMs: number,
) {
  const uploadParameters = normalizeUploadParameters(uploadParametersValue);
  const policy = asString(uploadParameters.policy);
  if (policy) {
    try {
      const decoded = asRecord(JSON.parse(decodeBase64Text(policy)));
      const policyExpiration = timestamp(decoded.expiration);
      if (policyExpiration !== null) return policyExpiration;
    } catch {
      // Pinterest normally returns an AWS policy with an explicit expiration.
      // A conservative fallback prevents stale credentials from being reused.
    }
  }
  return registeredAtMs + PINTEREST_VIDEO_REGISTRATION_FALLBACK_TTL_MS;
}

function normalizeFailure(value: unknown): PinterestVideoProtocolFailure | undefined {
  const record = asRecord(value);
  const code = cleanText(record.code, 160);
  const message = cleanText(record.message, 1200);
  const at = cleanText(record.at, 80);
  if (!code || !message || timestamp(at) === null) return undefined;
  const statusValue = Number(record.status);
  return {
    code,
    message,
    status:
      record.status !== null &&
      record.status !== undefined &&
      Number.isFinite(statusValue) &&
      statusValue >= 100
        ? statusValue
        : null,
    retryable: record.retryable === true,
    at,
  };
}

function normalizeOutcomeUnknown(value: unknown): PinterestVideoOutcomeUnknown | undefined {
  const record = asRecord(value);
  const failure = normalizeFailure(record);
  const phase = cleanText(record.phase, 40) as PinterestVideoMutationPhase;
  if (!failure || !["register", "upload", "create_pin"].includes(phase)) {
    return undefined;
  }
  return { ...failure, phase };
}

const CHECKPOINT_PHASES = new Set<PinterestVideoProtocolPhase>([
  "new",
  "registering",
  "registered",
  "uploading",
  "uploaded",
  "polling",
  "media_ready",
  "creating_pin",
  "completed",
  "failed",
  "expired",
  "outcome_unknown",
]);

export function normalizePinterestVideoCheckpoint(
  value: unknown,
  identity: { operationId: string; sourceFingerprint: string },
): PinterestVideoProtocolCheckpoint | null {
  const record = asRecord(value);
  if (!Object.keys(record).length) return null;

  const operationId = cleanText(identity.operationId, 240);
  const sourceFingerprint = cleanText(identity.sourceFingerprint, 1000);
  if (
    Number(record.version) !== PINTEREST_VIDEO_PROTOCOL_CHECKPOINT_VERSION ||
    cleanText(record.operationId, 240) !== operationId ||
    cleanText(record.sourceFingerprint, 1000) !== sourceFingerprint
  ) {
    throw new Error(
      "Le checkpoint Pinterest ne correspond pas à cette publication vidéo.",
    );
  }

  const phase = cleanText(record.phase, 40) as PinterestVideoProtocolPhase;
  const createdAt = cleanText(record.createdAt, 80);
  const updatedAt = cleanText(record.updatedAt, 80);
  if (
    !CHECKPOINT_PHASES.has(phase) ||
    timestamp(createdAt) === null ||
    timestamp(updatedAt) === null
  ) {
    throw new Error("Le checkpoint Pinterest est invalide.");
  }

  const checkpoint: PinterestVideoProtocolCheckpoint = {
    version: PINTEREST_VIDEO_PROTOCOL_CHECKPOINT_VERSION,
    operationId,
    sourceFingerprint,
    phase,
    createdAt,
    updatedAt,
    pollAttempts: Math.max(0, Math.round(Number(record.pollAttempts || 0))),
  };
  const mediaId = cleanText(record.mediaId, 240);
  const uploadUrl = normalizeUploadUrl(record.uploadUrl);
  const uploadParameters = normalizeUploadParameters(record.uploadParameters);
  const uploadExpiresAt = cleanText(record.uploadExpiresAt, 80);
  const uploadConfirmedAt = cleanText(record.uploadConfirmedAt, 80);
  const mediaStatus = cleanText(record.mediaStatus, 80).toLowerCase();
  const mediaReadyAt = cleanText(record.mediaReadyAt, 80);
  const nextPollAt = cleanText(record.nextPollAt, 80);
  const pin = asRecord(record.pin);
  const pinId = cleanText(record.pinId, 240);
  const completedAt = cleanText(record.completedAt, 80);
  const failure = normalizeFailure(record.failure);
  const outcomeUnknown = normalizeOutcomeUnknown(record.outcomeUnknown);

  if (mediaId) checkpoint.mediaId = mediaId;
  if (uploadUrl) checkpoint.uploadUrl = uploadUrl;
  if (Object.keys(uploadParameters).length) checkpoint.uploadParameters = uploadParameters;
  if (timestamp(uploadExpiresAt) !== null) checkpoint.uploadExpiresAt = uploadExpiresAt;
  if (timestamp(uploadConfirmedAt) !== null) checkpoint.uploadConfirmedAt = uploadConfirmedAt;
  if (mediaStatus) checkpoint.mediaStatus = mediaStatus;
  if (timestamp(mediaReadyAt) !== null) checkpoint.mediaReadyAt = mediaReadyAt;
  if (timestamp(nextPollAt) !== null) checkpoint.nextPollAt = nextPollAt;
  if (Object.keys(pin).length) checkpoint.pin = pin;
  if (pinId) checkpoint.pinId = pinId;
  if (timestamp(completedAt) !== null) checkpoint.completedAt = completedAt;
  if (failure) checkpoint.failure = failure;
  if (outcomeUnknown) checkpoint.outcomeUnknown = outcomeUnknown;
  return checkpoint;
}

function cloneCheckpoint(
  checkpoint: PinterestVideoProtocolCheckpoint,
): PinterestVideoProtocolCheckpoint {
  return {
    ...checkpoint,
    ...(checkpoint.uploadParameters
      ? { uploadParameters: { ...checkpoint.uploadParameters } }
      : {}),
    ...(checkpoint.pin ? { pin: { ...checkpoint.pin } } : {}),
    ...(checkpoint.failure ? { failure: { ...checkpoint.failure } } : {}),
    ...(checkpoint.outcomeUnknown
      ? { outcomeUnknown: { ...checkpoint.outcomeUnknown } }
      : {}),
  };
}

function createCheckpoint(
  operationIdValue: unknown,
  sourceFingerprintValue: unknown,
  nowMs: number,
): PinterestVideoProtocolCheckpoint {
  const operationId = cleanText(operationIdValue, 240);
  const sourceFingerprint = cleanText(sourceFingerprintValue, 1000);
  if (!operationId || !sourceFingerprint) {
    throw new Error(
      "Pinterest nécessite un identifiant d'opération et une empreinte média durables.",
    );
  }
  return {
    version: PINTEREST_VIDEO_PROTOCOL_CHECKPOINT_VERSION,
    operationId,
    sourceFingerprint,
    phase: "new",
    createdAt: iso(nowMs),
    updatedAt: iso(nowMs),
    pollAttempts: 0,
  };
}

function nextCheckpoint(
  checkpoint: PinterestVideoProtocolCheckpoint,
  nowMs: number,
  patch: Partial<PinterestVideoProtocolCheckpoint>,
) {
  return {
    ...checkpoint,
    ...patch,
    version: PINTEREST_VIDEO_PROTOCOL_CHECKPOINT_VERSION,
    operationId: checkpoint.operationId,
    sourceFingerprint: checkpoint.sourceFingerprint,
    createdAt: checkpoint.createdAt,
    updatedAt: iso(nowMs),
  } satisfies PinterestVideoProtocolCheckpoint;
}

async function persistCheckpoint(
  checkpoint: PinterestVideoProtocolCheckpoint,
  persist?: (checkpoint: PinterestVideoProtocolCheckpoint) => Promise<void>,
) {
  const copy = cloneCheckpoint(checkpoint);
  if (persist) await persist(copy);
  return copy;
}

function isRetryableStatus(status: number | null) {
  return status === null || status === 408 || status === 425 || status === 429 || status >= 500;
}

function isAmbiguousMutationStatus(status: number | null) {
  return status === null || status === 408 || status === 425 || status >= 500;
}

function providerErrorDetails(payload: unknown, fallback: string) {
  const record = asRecord(payload);
  const nested = asRecord(record.error);
  return {
    message:
      asString(record.message) ||
      asString(record.error_description) ||
      asString(nested.message) ||
      asString(record.error) ||
      fallback,
    pinterestCode:
      asString(record.code) ||
      asString(record.error_code) ||
      asString(record.error_type) ||
      asString(nested.code) ||
      null,
  };
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { message: raw };
  }
}

async function pinterestJsonRequest(params: {
  fetchImpl: PinterestFetch;
  apiBaseUrl: string;
  accessToken: string;
  path: string;
  method: "GET" | "POST";
  body?: unknown;
  phase: PinterestRequestPhase;
  timeoutMs: number;
}) {
  const cleanBase = normalizeApiBaseUrl(params.apiBaseUrl);
  const cleanPath = params.path.startsWith("/") ? params.path : `/${params.path}`;
  const hasBody = params.body !== undefined && params.method !== "GET";
  const mutation = params.method === "POST";
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error(`pinterest_${params.phase}_timeout`)),
    params.timeoutMs,
  );
  try {
    let response: Response;
    let payload: unknown;
    try {
      response = await params.fetchImpl(`${cleanBase}/v5${cleanPath}`, {
        method: params.method,
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          Accept: "application/json",
          ...(hasBody ? { "Content-Type": "application/json" } : {}),
        },
        body: hasBody ? JSON.stringify(params.body) : undefined,
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      payload = await readResponsePayload(response);
    } catch (error) {
      const timedOut = controller.signal.aborted;
      throw new PinterestVideoRequestError(
        timedOut
          ? "Pinterest n'a pas répondu dans le délai prévu."
          : "La réponse Pinterest a été interrompue.",
        {
          code: timedOut
            ? `pinterest_${params.phase}_timeout`
            : `pinterest_${params.phase}_network_error`,
          phase: params.phase,
          retryable: !mutation,
          outcomeUnknown: mutation,
          cause: error,
        },
      );
    }

    if (!response.ok) {
      const details = providerErrorDetails(
        payload,
        `Pinterest a refusé l'action (${response.status}).`,
      );
      throw new PinterestVideoRequestError(details.message, {
        code: `pinterest_${params.phase}_http_error`,
        phase: params.phase,
        status: response.status,
        retryable: isRetryableStatus(response.status),
        outcomeUnknown:
          mutation && isAmbiguousMutationStatus(response.status),
        pinterestCode: details.pinterestCode,
      });
    }
    return asRecord(payload);
  } finally {
    clearTimeout(timeout);
  }
}

async function uploadPinterestVideoFile(params: {
  fetchImpl: PinterestFetch;
  uploadUrl: string;
  uploadParameters: Record<string, string>;
  videoFile: Blob;
  videoSize: number;
  videoFileName: string;
  timeoutMs: number;
}) {
  const uploadFile = params.videoFile;
  const videoSize = params.videoSize;
  if (uploadFile.size !== Number(videoSize)) {
    throw new Error("La taille de la vidéo Pinterest préparée est incohérente.");
  }
  const form = new FormData();
  for (const [key, value] of Object.entries(params.uploadParameters)) {
    form.append(key, value);
  }
  form.append("file", uploadFile, params.videoFileName || "video-inrcy.mp4");

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("pinterest_upload_timeout")),
    params.timeoutMs,
  );
  try {
    let response: Response;
    try {
      response = await params.fetchImpl(params.uploadUrl, {
        method: "POST",
        body: form,
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
    } catch (error) {
      const timedOut = controller.signal.aborted;
      throw new PinterestVideoRequestError(
        timedOut
          ? "L'upload Pinterest n'a pas répondu dans le délai prévu."
          : "La réponse de l'upload Pinterest a été interrompue.",
        {
          code: timedOut
            ? "pinterest_upload_timeout"
            : "pinterest_upload_network_error",
          phase: "upload",
          retryable: false,
          outcomeUnknown: true,
          cause: error,
        },
      );
    }

    if (!response.ok) {
      let payload: unknown = {};
      try {
        payload = await readResponsePayload(response);
      } catch (error) {
        throw new PinterestVideoRequestError(
          "La réponse de l'upload Pinterest a été interrompue.",
          {
            code: "pinterest_upload_response_interrupted",
            phase: "upload",
            retryable: false,
            outcomeUnknown: true,
            cause: error,
          },
        );
      }
      const details = providerErrorDetails(
        payload,
        `L'upload vidéo Pinterest a échoué (${response.status}).`,
      );
      throw new PinterestVideoRequestError(details.message, {
        code: "pinterest_upload_http_error",
        phase: "upload",
        status: response.status,
        retryable: isRetryableStatus(response.status),
        outcomeUnknown: isAmbiguousMutationStatus(response.status),
        pinterestCode: details.pinterestCode,
      });
    }
    await response.body?.cancel().catch(() => undefined);
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeMediaStatus(payload: Record<string, unknown>) {
  return String(payload.status || payload.media_status || payload.state || "")
    .trim()
    .toLowerCase();
}

function isMediaReady(status: string) {
  return ["succeeded", "success", "ready", "complete", "completed"].includes(status);
}

function isMediaFailed(status: string) {
  return ["failed", "failure", "error", "rejected"].includes(status);
}

function getMediaFailureMessage(payload: Record<string, unknown>) {
  const failure = asRecord(payload.failure_reason || payload.error);
  return (
    asString(payload.message) ||
    asString(payload.error_message) ||
    asString(failure.message) ||
    "Pinterest n'a pas pu traiter la vidéo."
  );
}

function requestError(value: unknown, phase: PinterestRequestPhase) {
  if (value instanceof PinterestVideoRequestError) return value;
  return new PinterestVideoRequestError(
    value instanceof Error ? value.message : String(value || "Erreur Pinterest."),
    {
      code: `pinterest_${phase}_error`,
      phase,
      retryable: false,
      outcomeUnknown: false,
      cause: value,
    },
  );
}

function failureFromError(
  errorValue: unknown,
  phase: PinterestRequestPhase,
  nowMs: number,
): PinterestVideoProtocolFailure {
  const error = requestError(errorValue, phase);
  return {
    code: error.code,
    message: error.message,
    status: error.status,
    retryable: error.retryable,
    at: iso(nowMs),
  };
}

function outcomeFromError(
  errorValue: unknown,
  phase: PinterestVideoMutationPhase,
  nowMs: number,
): PinterestVideoOutcomeUnknown {
  const failure = failureFromError(errorValue, phase, nowMs);
  return { ...failure, retryable: false, phase };
}

function failureResult(
  checkpoint: PinterestVideoProtocolCheckpoint,
): PinterestVideoDurableStepResult {
  return {
    state: checkpoint.phase === "expired" ? "expired" : "failed",
    checkpoint,
  };
}

async function persistTerminalFailure(params: {
  checkpoint: PinterestVideoProtocolCheckpoint;
  nowMs: number;
  phase: PinterestRequestPhase;
  error: unknown;
  persist?: (checkpoint: PinterestVideoProtocolCheckpoint) => Promise<void>;
}) {
  const failed = nextCheckpoint(params.checkpoint, params.nowMs, {
    phase: "failed",
    failure: failureFromError(params.error, params.phase, params.nowMs),
  });
  return failureResult(await persistCheckpoint(failed, params.persist));
}

async function persistOutcomeUnknown(params: {
  checkpoint: PinterestVideoProtocolCheckpoint;
  nowMs: number;
  phase: PinterestVideoMutationPhase;
  error: unknown;
  persist?: (checkpoint: PinterestVideoProtocolCheckpoint) => Promise<void>;
}) {
  const unknown = nextCheckpoint(params.checkpoint, params.nowMs, {
    phase: "outcome_unknown",
    outcomeUnknown: outcomeFromError(params.error, params.phase, params.nowMs),
  });
  return {
    state: "outcome_unknown",
    checkpoint: await persistCheckpoint(unknown, params.persist),
  } satisfies PinterestVideoDurableStepResult;
}

function validateProtocolInput(params: PinterestVideoDurableProtocolArgs) {
  if (!cleanText(params.accessToken, 10_000)) {
    throw new Error("Pinterest à connecter. Rendez-vous dans Canaux.");
  }
  if (!cleanText(params.boardId, 240)) {
    throw new Error("Choisissez un tableau Pinterest avant de publier.");
  }
  if (!normalizeUploadUrl(params.coverImageUrl)) {
    throw new Error("Pinterest nécessite une image de couverture publique valide.");
  }
  const videoSize = Number(params.videoSize);
  if (!Number.isSafeInteger(videoSize) || videoSize <= 0) {
    throw new Error("La taille de la vidéo Pinterest est invalide.");
  }
  if (videoSize > INR_MEDIA_VIDEO_SOURCE_MAX_BYTES) {
    throw new Error("La vidéo Pinterest dépasse 300 Mo.");
  }
  normalizeApiBaseUrl(params.apiBaseUrl);
}

function resultFromCheckpoint(
  checkpoint: PinterestVideoProtocolCheckpoint,
): PinterestVideoProtocolResult | undefined {
  if (
    checkpoint.phase !== "completed" ||
    !checkpoint.mediaId ||
    !checkpoint.pin
  ) {
    return undefined;
  }
  return {
    pin: { ...checkpoint.pin },
    mediaId: checkpoint.mediaId,
    mediaStatus: checkpoint.mediaStatus || "succeeded",
  };
}

function pollDelayMs(attempt: number) {
  return Math.min(5_000, 1_200 + Math.max(0, attempt - 1) * 250);
}

/**
 * Advances exactly one provider phase/request.
 *
 * The callback is awaited before every non-idempotent request. If the process
 * dies after that durable intent checkpoint, the next invocation observes an
 * in-flight phase and returns `outcome_unknown` without repeating the request.
 */
export async function advancePinterestVideoProtocol(
  params: PinterestVideoDurableProtocolArgs,
): Promise<PinterestVideoDurableStepResult> {
  validateProtocolInput(params);
  const now = params.now || Date.now;
  const nowMs = now();
  const operationId = cleanText(params.operationId, 240);
  const sourceFingerprint = cleanText(params.sourceFingerprint, 1000);
  let checkpoint =
    normalizePinterestVideoCheckpoint(params.checkpoint, {
      operationId,
      sourceFingerprint,
    }) || createCheckpoint(operationId, sourceFingerprint, nowMs);

  const persist = params.persistCheckpoint;
  const fetchImpl = params.fetchImpl || fetch;
  const jsonTimeoutMs = clampTimeout(
    params.jsonTimeoutMs,
    PINTEREST_VIDEO_JSON_TIMEOUT_MS,
    30_000,
  );
  const uploadTimeoutMs = clampTimeout(
    params.uploadTimeoutMs,
    PINTEREST_VIDEO_UPLOAD_TIMEOUT_MS,
    10 * 60_000,
  );

  if (checkpoint.phase === "completed") {
    return {
      state: "completed",
      checkpoint,
      result: resultFromCheckpoint(checkpoint),
    };
  }
  if (checkpoint.phase === "failed" || checkpoint.phase === "expired") {
    return failureResult(checkpoint);
  }
  if (checkpoint.phase === "outcome_unknown") {
    return { state: "outcome_unknown", checkpoint };
  }

  const interruptedPhase: Partial<
    Record<PinterestVideoProtocolPhase, PinterestVideoMutationPhase>
  > = {
    registering: "register",
    uploading: "upload",
    creating_pin: "create_pin",
  };
  const interrupted = interruptedPhase[checkpoint.phase];
  if (interrupted) {
    return await persistOutcomeUnknown({
      checkpoint,
      nowMs,
      phase: interrupted,
      error: new PinterestVideoRequestError(
        "Le processus Pinterest a redémarré pendant une requête non idempotente. Son résultat doit être vérifié avant toute relance.",
        {
          code: "pinterest_mutation_interrupted",
          phase: interrupted,
          retryable: false,
          outcomeUnknown: true,
        },
      ),
      persist,
    });
  }

  if (checkpoint.phase === "new") {
    const intent = await persistCheckpoint(
      nextCheckpoint(checkpoint, nowMs, { phase: "registering" }),
      persist,
    );
    try {
      const registration = await pinterestJsonRequest({
        fetchImpl,
        apiBaseUrl: params.apiBaseUrl,
        accessToken: params.accessToken,
        path: "/media",
        method: "POST",
        body: { media_type: "video" },
        phase: "register",
        timeoutMs: jsonTimeoutMs,
      });
      const mediaId = asString(registration.media_id) || asString(registration.id);
      const uploadUrl = normalizeUploadUrl(registration.upload_url);
      const uploadParameters = normalizeUploadParameters(
        registration.upload_parameters,
      );
      if (!mediaId) {
        return await persistOutcomeUnknown({
          checkpoint: intent,
          nowMs: now(),
          phase: "register",
          error: new PinterestVideoRequestError(
            "Pinterest a confirmé l'enregistrement sans renvoyer l'identifiant média. Une relance pourrait créer un doublon technique.",
            {
              code: "pinterest_registration_media_id_missing",
              phase: "register",
              outcomeUnknown: true,
            },
          ),
          persist,
        });
      }
      if (!uploadUrl || !Object.keys(uploadParameters).length) {
        return await persistTerminalFailure({
          checkpoint: intent,
          nowMs: now(),
          phase: "register",
          error: new Error(
            "Pinterest n'a pas renvoyé les informations nécessaires à l'upload vidéo.",
          ),
          persist,
        });
      }
      const confirmedAt = now();
      checkpoint = nextCheckpoint(intent, confirmedAt, {
        phase: "registered",
        mediaId,
        uploadUrl,
        uploadParameters,
        uploadExpiresAt: iso(
          getPinterestUploadExpiration(uploadParameters, confirmedAt),
        ),
      });
      return {
        state: "continue",
        checkpoint: await persistCheckpoint(checkpoint, persist),
      };
    } catch (error) {
      const typed = requestError(error, "register");
      if (typed.outcomeUnknown) {
        return await persistOutcomeUnknown({
          checkpoint: intent,
          nowMs: now(),
          phase: "register",
          error: typed,
          persist,
        });
      }
      return await persistTerminalFailure({
        checkpoint: intent,
        nowMs: now(),
        phase: "register",
        error: typed,
        persist,
      });
    }
  }

  if (checkpoint.phase === "registered") {
    const expiresAt = timestamp(checkpoint.uploadExpiresAt);
    if (expiresAt === null || nowMs >= expiresAt - 5_000) {
      const expired = nextCheckpoint(checkpoint, nowMs, {
        phase: "expired",
        failure: {
          code: "pinterest_upload_registration_expired",
          message:
            "Les identifiants d'upload Pinterest ont expiré avant l'envoi. Une nouvelle inscription doit être décidée explicitement.",
          status: null,
          retryable: false,
          at: iso(nowMs),
        },
      });
      return failureResult(await persistCheckpoint(expired, persist));
    }
    if (!params.videoFile) {
      return { state: "needs_video_file", checkpoint };
    }
    if (
      !checkpoint.mediaId ||
      !checkpoint.uploadUrl ||
      !checkpoint.uploadParameters
    ) {
      return await persistTerminalFailure({
        checkpoint,
        nowMs,
        phase: "upload",
        error: new Error("Le checkpoint d'upload Pinterest est incomplet."),
        persist,
      });
    }

    const intent = await persistCheckpoint(
      nextCheckpoint(checkpoint, nowMs, { phase: "uploading" }),
      persist,
    );
    try {
      await uploadPinterestVideoFile({
        fetchImpl,
        uploadUrl: checkpoint.uploadUrl,
        uploadParameters: checkpoint.uploadParameters,
        videoFile: params.videoFile,
        videoSize: Number(params.videoSize),
        videoFileName: params.videoFileName,
        timeoutMs: uploadTimeoutMs,
      });
      const confirmedAt = now();
      checkpoint = nextCheckpoint(intent, confirmedAt, {
        phase: "uploaded",
        uploadConfirmedAt: iso(confirmedAt),
        mediaStatus: "uploaded",
        // Signed S3 fields are no longer useful after the confirmed 2xx/204.
        uploadUrl: undefined,
        uploadParameters: undefined,
        uploadExpiresAt: undefined,
      });
      return {
        state: "continue",
        checkpoint: await persistCheckpoint(checkpoint, persist),
      };
    } catch (error) {
      const typed = requestError(error, "upload");
      if (typed.outcomeUnknown) {
        return await persistOutcomeUnknown({
          checkpoint: intent,
          nowMs: now(),
          phase: "upload",
          error: typed,
          persist,
        });
      }
      return await persistTerminalFailure({
        checkpoint: intent,
        nowMs: now(),
        phase: "upload",
        error: typed,
        persist,
      });
    }
  }

  if (checkpoint.phase === "uploaded" || checkpoint.phase === "polling") {
    if (!checkpoint.mediaId) {
      return await persistTerminalFailure({
        checkpoint,
        nowMs,
        phase: "poll",
        error: new Error("L'identifiant média Pinterest est absent."),
        persist,
      });
    }
    const nextPollAt = timestamp(checkpoint.nextPollAt);
    if (
      params.respectNextPollAt !== false &&
      nextPollAt !== null &&
      nowMs < nextPollAt
    ) {
      return {
        state: "waiting",
        checkpoint,
        retryAt: checkpoint.nextPollAt || null,
      };
    }

    const pollAttempts = checkpoint.pollAttempts + 1;
    try {
      const media = await pinterestJsonRequest({
        fetchImpl,
        apiBaseUrl: params.apiBaseUrl,
        accessToken: params.accessToken,
        path: `/media/${encodeURIComponent(checkpoint.mediaId)}`,
        method: "GET",
        phase: "poll",
        timeoutMs: jsonTimeoutMs,
      });
      const mediaStatus = normalizeMediaStatus(media) || "processing";
      const polledAt = now();
      if (isMediaReady(mediaStatus)) {
        checkpoint = nextCheckpoint(checkpoint, polledAt, {
          phase: "media_ready",
          mediaStatus,
          mediaReadyAt: iso(polledAt),
          pollAttempts,
          nextPollAt: undefined,
          failure: undefined,
        });
        return {
          state: "continue",
          checkpoint: await persistCheckpoint(checkpoint, persist),
        };
      }
      if (isMediaFailed(mediaStatus)) {
        return await persistTerminalFailure({
          checkpoint: nextCheckpoint(checkpoint, polledAt, {
            mediaStatus,
            pollAttempts,
            nextPollAt: undefined,
          }),
          nowMs: polledAt,
          phase: "poll",
          error: new Error(getMediaFailureMessage(media)),
          persist,
        });
      }
      const retryAt = iso(polledAt + pollDelayMs(pollAttempts));
      checkpoint = nextCheckpoint(checkpoint, polledAt, {
        phase: "polling",
        mediaStatus,
        pollAttempts,
        nextPollAt: retryAt,
      });
      return {
        state: "waiting",
        checkpoint: await persistCheckpoint(checkpoint, persist),
        retryAt,
      };
    } catch (error) {
      const typed = requestError(error, "poll");
      const polledAt = now();
      if (!typed.retryable) {
        return await persistTerminalFailure({
          checkpoint,
          nowMs: polledAt,
          phase: "poll",
          error: typed,
          persist,
        });
      }
      const retryAt = iso(polledAt + pollDelayMs(pollAttempts));
      checkpoint = nextCheckpoint(checkpoint, polledAt, {
        phase: "polling",
        pollAttempts,
        nextPollAt: retryAt,
        failure: failureFromError(typed, "poll", polledAt),
      });
      return {
        state: "waiting",
        checkpoint: await persistCheckpoint(checkpoint, persist),
        retryAt,
      };
    }
  }

  if (checkpoint.phase === "media_ready") {
    if (!checkpoint.mediaId) {
      return await persistTerminalFailure({
        checkpoint,
        nowMs,
        phase: "create_pin",
        error: new Error("L'identifiant média Pinterest est absent."),
        persist,
      });
    }
    const intent = await persistCheckpoint(
      nextCheckpoint(checkpoint, nowMs, { phase: "creating_pin" }),
      persist,
    );
    const payload: Record<string, unknown> = {
      board_id: params.boardId,
      title: params.title,
      description: params.description || "",
      media_source: {
        source_type: "video_id",
        media_id: checkpoint.mediaId,
        cover_image_url: params.coverImageUrl,
      },
    };
    if (params.link) payload.link = params.link;

    try {
      const pin = await pinterestJsonRequest({
        fetchImpl,
        apiBaseUrl: params.apiBaseUrl,
        accessToken: params.accessToken,
        path: "/pins",
        method: "POST",
        body: payload,
        phase: "create_pin",
        timeoutMs: jsonTimeoutMs,
      });
      const pinId = asString(pin.id) || asString(pin.pin_id);
      if (!pinId) {
        return await persistOutcomeUnknown({
          checkpoint: intent,
          nowMs: now(),
          phase: "create_pin",
          error: new PinterestVideoRequestError(
            "Pinterest a accepté la création sans renvoyer l'identifiant du Pin. Une relance pourrait publier en double.",
            {
              code: "pinterest_pin_id_missing",
              phase: "create_pin",
              outcomeUnknown: true,
            },
          ),
          persist,
        });
      }
      const completedAt = now();
      checkpoint = nextCheckpoint(intent, completedAt, {
        phase: "completed",
        pin,
        pinId,
        completedAt: iso(completedAt),
        failure: undefined,
      });
      checkpoint = await persistCheckpoint(checkpoint, persist);
      return {
        state: "completed",
        checkpoint,
        result: resultFromCheckpoint(checkpoint),
      };
    } catch (error) {
      const typed = requestError(error, "create_pin");
      if (typed.outcomeUnknown) {
        return await persistOutcomeUnknown({
          checkpoint: intent,
          nowMs: now(),
          phase: "create_pin",
          error: typed,
          persist,
        });
      }
      return await persistTerminalFailure({
        checkpoint: intent,
        nowMs: now(),
        phase: "create_pin",
        error: typed,
        persist,
      });
    }
  }

  return await persistTerminalFailure({
    checkpoint,
    nowMs,
    phase: "poll",
    error: new Error(`Phase Pinterest non reconnue : ${checkpoint.phase}.`),
    persist,
  });
}

function errorFromCheckpoint(checkpoint: PinterestVideoProtocolCheckpoint) {
  if (checkpoint.phase === "outcome_unknown") {
    return new PinterestVideoOutcomeUnknownError(checkpoint);
  }
  const failure = checkpoint.failure;
  const error = new Error(
    failure?.message || "Pinterest n'a pas pu finaliser la publication vidéo.",
  ) as Error & {
    code?: string;
    status?: number | null;
    retryable?: boolean;
    pinterestVideoCheckpoint?: PinterestVideoProtocolCheckpoint;
  };
  error.code = failure?.code;
  error.status = failure?.status;
  error.retryable = failure?.retryable === true;
  error.pinterestVideoCheckpoint = cloneCheckpoint(checkpoint);
  return error;
}

/**
 * Backward-compatible, single-invocation convenience wrapper.
 * Durable workers should call `advancePinterestVideoProtocol` and persist every
 * returned checkpoint in their channel event instead.
 */
export async function publishPinterestVideoWithProtocol({
  apiBaseUrl,
  accessToken,
  boardId,
  title,
  description,
  link,
  coverImageUrl,
  videoFile,
  videoBytes,
  videoSize,
  videoContentType,
  videoFileName,
  fetchImpl = fetch,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  maxPollAttempts = 24,
}: PinterestVideoProtocolArgs): Promise<PinterestVideoProtocolResult> {
  let uploadFile = videoFile;
  if (!uploadFile) {
    if (!videoBytes?.byteLength) {
      throw new Error("La vidéo Pinterest à envoyer est vide.");
    }
    const exactBytes = new ArrayBuffer(videoBytes.byteLength);
    new Uint8Array(exactBytes).set(videoBytes);
    uploadFile = new Blob([exactBytes], {
      type: videoContentType || "video/mp4",
    });
  }
  const exactVideoSize = Number(videoSize || uploadFile.size);
  const operationId = `legacy-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const sourceFingerprint = [
    videoFileName,
    videoContentType,
    exactVideoSize,
  ].join(":");
  const pollAttemptLimit =
    Number.isFinite(Number(maxPollAttempts)) && Number(maxPollAttempts) > 0
      ? Math.max(1, Math.min(480, Math.round(Number(maxPollAttempts))))
      : 24;
  let checkpoint: PinterestVideoProtocolCheckpoint | undefined;

  for (;;) {
    const step = await advancePinterestVideoProtocol({
      apiBaseUrl,
      accessToken,
      operationId,
      sourceFingerprint,
      boardId,
      title,
      description,
      link,
      coverImageUrl,
      videoFile: uploadFile,
      videoSize: exactVideoSize,
      videoContentType,
      videoFileName,
      checkpoint,
      fetchImpl,
      // This wrapper owns the wait. Durable workers keep the default and let
      // the cron wake the checkpoint at `nextPollAt`.
      respectNextPollAt: false,
      persistCheckpoint: async (next) => {
        checkpoint = next;
      },
    });
    checkpoint = step.checkpoint;

    if (step.state === "completed" && step.result) return step.result;
    if (step.state === "outcome_unknown") throw errorFromCheckpoint(checkpoint);
    if (step.state === "failed" || step.state === "expired") {
      throw errorFromCheckpoint(checkpoint);
    }
    if (step.state === "needs_video_file") {
      throw new Error("La vidéo Pinterest préparée n'est plus disponible.");
    }
    if (step.state === "waiting") {
      if (checkpoint.pollAttempts >= pollAttemptLimit) {
        throw new Error(
          "Pinterest traite encore la vidéo. Réessayez la publication dans quelques instants.",
        );
      }
      const retryAt = timestamp(step.retryAt);
      await wait(
        retryAt === null ? pollDelayMs(checkpoint.pollAttempts) : Math.max(0, retryAt - Date.now()),
      );
    }
  }
}
