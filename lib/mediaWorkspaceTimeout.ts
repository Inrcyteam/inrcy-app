export const MEDIA_WORKSPACE_MUTATION_TIMEOUT_MS = 10_000;
export const MEDIA_WORKSPACE_READ_TIMEOUT_MS = 8_000;
export const MEDIA_WORKSPACE_READINESS_TIMEOUT_MS = 35_000;

export const MEDIA_WORKSPACE_TIMEOUT_CODE =
  "media_workspace_temporarily_unavailable";

const DEFAULT_TIMEOUT_MESSAGE =
  "Supabase met trop de temps à répondre pendant la sécurisation des médias. Réessayez dans quelques secondes.";

export class MediaWorkspaceTimeoutError extends Error {
  readonly code = MEDIA_WORKSPACE_TIMEOUT_CODE;
  readonly retryable = true;
  readonly phase: string;

  constructor(message = DEFAULT_TIMEOUT_MESSAGE, phase = "media_workspace") {
    super(message);
    this.name = "MediaWorkspaceTimeoutError";
    this.phase = phase;
  }
}

export function isMediaWorkspaceRetryableHttpStatus(status: number) {
  return status === 429 || (status >= 500 && status <= 599);
}

export class MediaWorkspaceHttpError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;

  constructor(status: number, message: string) {
    super(message);
    this.name = "MediaWorkspaceHttpError";
    this.status = status;
    this.code = `media_workspace_http_${status}`;
    this.retryable = isMediaWorkspaceRetryableHttpStatus(status);
  }
}

/**
 * Browser fetch rejects with a TypeError for transport failures. Caller
 * aborts and ordinary application errors are permanent for the current
 * request and must not be hidden behind another polling attempt.
 */
export function isMediaWorkspaceRetryableFetchError(error: unknown) {
  if (
    error instanceof MediaWorkspaceTimeoutError ||
    String((error as { code?: unknown } | null)?.code || "") ===
      MEDIA_WORKSPACE_TIMEOUT_CODE
  ) {
    return true;
  }

  if (String((error as { name?: unknown } | null)?.name || "") === "AbortError") {
    return false;
  }

  return (
    error instanceof TypeError ||
    String((error as { name?: unknown } | null)?.name || "") === "TypeError"
  );
}

export function isMediaWorkspacePollingRetryableError(error: unknown) {
  if (error instanceof MediaWorkspaceHttpError) return error.retryable;
  return isMediaWorkspaceRetryableFetchError(error);
}

type MediaWorkspaceDeadlineOptions = {
  signal?: AbortSignal;
  timeoutMs: number;
  phase?: string;
  timeoutMessage?: string;
};

function abortReason(signal: AbortSignal) {
  if (signal.reason instanceof Error) return signal.reason;
  if (typeof DOMException !== "undefined") {
    return new DOMException("Opération annulée.", "AbortError");
  }
  const error = new Error("Opération annulée.");
  error.name = "AbortError";
  return error;
}

/**
 * Compose le signal de l'appelant avec un délai local, sans annuler le signal
 * parent. La course explicite garantit aussi une sortie si l'opération appelée
 * oublie d'écouter le signal (par exemple une ancienne promesse de synchronisation).
 */
export async function withMediaWorkspaceDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: MediaWorkspaceDeadlineOptions,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutMs = Math.max(1, Math.floor(options.timeoutMs));

  const abortFromParent = () => {
    if (!controller.signal.aborted && options.signal) {
      controller.abort(options.signal.reason);
    }
  };

  if (options.signal?.aborted) {
    abortFromParent();
  } else {
    options.signal?.addEventListener("abort", abortFromParent, { once: true });
  }

  const timer = setTimeout(() => {
    timedOut = true;
    if (!controller.signal.aborted) {
      controller.abort(new Error("media_workspace_deadline_exceeded"));
    }
  }, timeoutMs);

  const createTimeoutError = () =>
    new MediaWorkspaceTimeoutError(
      options.timeoutMessage || DEFAULT_TIMEOUT_MESSAGE,
      options.phase,
    );

  const deadline = new Promise<never>((_resolve, reject) => {
    const rejectForAbort = () => {
      if (timedOut) {
        reject(createTimeoutError());
        return;
      }
      reject(abortReason(controller.signal));
    };
    if (controller.signal.aborted) rejectForAbort();
    else controller.signal.addEventListener("abort", rejectForAbort, { once: true });
  });

  try {
    const running = Promise.resolve()
      .then(() => operation(controller.signal))
      .catch((error) => {
        if (timedOut) throw createTimeoutError();
        throw error;
      });
    return await Promise.race([
      running,
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abortFromParent);
  }
}
