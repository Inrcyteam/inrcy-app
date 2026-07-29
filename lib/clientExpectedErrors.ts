const RATE_LIMIT_PATTERNS = [
  "trop de tentatives en peu de temps",
  "too many requests",
  "rate limit exceeded",
  "ratelimit exceeded",
] as const;

const TRANSIENT_NETWORK_PATTERNS = [
  "load failed",
  "failed to fetch",
  "networkerror when attempting to fetch resource",
  "network request failed",
  "the internet connection appears to be offline",
] as const;

function messageFromUnknown(value: unknown): string {
  if (value instanceof Error) return value.message || value.name;
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const candidate = value as { message?: unknown; error?: unknown; reason?: unknown };
    if (typeof candidate.message === "string") return candidate.message;
    if (typeof candidate.error === "string") return candidate.error;
    if (candidate.reason !== undefined) return messageFromUnknown(candidate.reason);
  }
  return "";
}

function normalizedMessage(value: unknown): string {
  return messageFromUnknown(value).toLowerCase().trim();
}

export function isExpectedRateLimitError(value: unknown): boolean {
  const message = normalizedMessage(value);
  return Boolean(message) && RATE_LIMIT_PATTERNS.some((pattern) => message.includes(pattern));
}

export function isTransientBrowserNetworkError(value: unknown): boolean {
  const message = normalizedMessage(value);
  return Boolean(message) && TRANSIENT_NETWORK_PATTERNS.some((pattern) => message.includes(pattern));
}

/**
 * Background dashboard refreshes are best effort. A temporary Safari/network
 * interruption must not be promoted to a Sentry error when the UI already
 * keeps its last confirmed state.
 */
export function reportHandledClientError(error: unknown, context?: string): void {
  if (isExpectedRateLimitError(error) || isTransientBrowserNetworkError(error)) {
    return;
  }

  if (context) console.error(`[${context}]`, error);
  else console.error(error);
}

/**
 * A 429 is an expected control-flow response, not an application crash.
 * Some fire-and-forget UI actions can still surface it as an unhandled promise
 * rejection. Stop that browser-level noise while preserving the original
 * limiter and the error handling already displayed by the calling UI.
 */
export function installExpectedClientRejectionGuard(): void {
  if (typeof window === "undefined") return;

  const globalState = window as typeof window & {
    __inrcyExpectedRejectionGuardInstalled?: boolean;
  };
  if (globalState.__inrcyExpectedRejectionGuardInstalled) return;
  globalState.__inrcyExpectedRejectionGuardInstalled = true;

  window.addEventListener("unhandledrejection", (event) => {
    if (!isExpectedRateLimitError(event.reason)) return;

    event.preventDefault();
  });
}
