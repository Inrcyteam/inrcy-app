type SentryLikeEvent = {
  message?: string;
  user?: Record<string, unknown>;
  request?: { headers?: Record<string, unknown> };
  exception?: { values?: Array<{ type?: string; value?: string }> };
  breadcrumbs?: Array<{ message?: string }>;
};

type FilterOptions = {
  scrubHeaders?: boolean;
};

function compactLower(value: unknown): string {
  return String(value || "").toLowerCase().trim();
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

export function filterSentryEvent<T extends SentryLikeEvent>(event: T, options: FilterOptions = {}): T | null {
  if (shouldDropNoisyEvent(event)) return null;

  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
    delete event.user.username;
  }

  if (options.scrubHeaders && event.request?.headers) {
    delete event.request.headers.authorization;
    delete event.request.headers.Authorization;
    delete event.request.headers.cookie;
    delete event.request.headers.Cookie;
  }

  return event;
}
