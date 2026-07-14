type SentryLikeEvent = {
  message?: string;
  user?: Record<string, unknown>;
  request?: {
    url?: string;
    query_string?: unknown;
    headers?: Record<string, unknown>;
    data?: unknown;
  };
  exception?: { values?: Array<{ type?: string; value?: string }> };
  breadcrumbs?: Array<{ message?: string }>;
  extra?: Record<string, unknown>;
};

type FilterOptions = {
  scrubHeaders?: boolean;
};

function compactLower(value: unknown): string {
  return String(value || "").toLowerCase().trim();
}

const SENSITIVE_QUERY_KEYS = /^(code|state|token|access_token|refresh_token|id_token|key|secret|password|signature|sig)$/i;

function scrubUrl(value: unknown): unknown {
  if (typeof value !== "string" || !value) return value;

  try {
    const url = new URL(value);
    for (const key of Array.from(url.searchParams.keys())) {
      if (SENSITIVE_QUERY_KEYS.test(key)) url.searchParams.set(key, "[Filtered]");
    }
    return url.toString();
  } catch {
    return value.replace(/([?&](?:code|state|token|access_token|refresh_token|id_token|key|secret|password|signature|sig)=)[^&]*/gi, "$1[Filtered]");
  }
}

function scrubQueryString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return value.replace(/(^|&)(code|state|token|access_token|refresh_token|id_token|key|secret|password|signature|sig)=[^&]*/gi, "$1$2=[Filtered]");
}

function collectEventText(event: SentryLikeEvent): string {
  const parts: string[] = [];
  if (event.message) parts.push(String(event.message));
  for (const item of event.exception?.values || []) {
    if (item.type) parts.push(String(item.type));
    if (item.value) parts.push(String(item.value));
  }
  for (const crumb of event.breadcrumbs || []) {
    if (crumb.message) parts.push(String(crumb.message));
  }
  return compactLower(parts.join(" | "));
}

function shouldDropNoisyEvent(event: SentryLikeEvent): boolean {
  const text = collectEventText(event);
  if (!text) return false;

  return [
    "the message port closed before a response was received",
    "unchecked runtime.lasterror",
    "resizeobserver loop completed with undelivered notifications",
    "resizeobserver loop limit exceeded",
    "non-error promise rejection captured with value: cancelled",
  ].some((needle) => text.includes(needle)) ||
    /^aborterror\b/.test(text) ||
    text === "aborted" ||
    text.includes("error | aborted") ||
    text.includes("abortincoming") ||
    text.includes("request aborted") ||
    text.includes("socket hang up");
}

export function filterSentryEvent<T>(event: T, options: FilterOptions = {}): T | null {
  const mutableEvent = event as unknown as SentryLikeEvent;

  if (shouldDropNoisyEvent(mutableEvent)) return null;

  if (mutableEvent.user) {
    delete mutableEvent.user.email;
    delete mutableEvent.user.ip_address;
    delete mutableEvent.user.username;
  }

  if (options.scrubHeaders && mutableEvent.request?.headers) {
    delete mutableEvent.request.headers.authorization;
    delete mutableEvent.request.headers.Authorization;
    delete mutableEvent.request.headers.cookie;
    delete mutableEvent.request.headers.Cookie;
  }

  if (mutableEvent.request) {
    mutableEvent.request.url = scrubUrl(mutableEvent.request.url) as string | undefined;
    mutableEvent.request.query_string = scrubQueryString(mutableEvent.request.query_string);
    // Request bodies are not needed to diagnose a server error and may contain
    // client names, email addresses, message content or document data.
    delete mutableEvent.request.data;
  }

  if (mutableEvent.extra) {
    for (const key of Object.keys(mutableEvent.extra)) {
      if (/(body|payload|form|email|phone|content|html|token|secret|password)/i.test(key)) {
        delete mutableEvent.extra[key];
      }
    }
  }

  return event;
}
