import { log } from "@/lib/observability/logger";

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number; requestId?: string; route?: string } = {}
): Promise<Response> {
  const { timeoutMs = 15_000, requestId, route, ...rest } = init;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(input, { ...rest, signal: ctrl.signal });
    return res;
  } catch (e: any) {
    log.error("fetch_error", {
      request_id: requestId,
      route,
      error_message: e?.message || "fetch failed",
    });
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit & {
    retries?: number;
    timeoutMs?: number;
    requestId?: string;
    route?: string;
  } = {}
): Promise<Response> {
  const { retries = 2, ...rest } = init;
  let lastErr: any;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetchWithTimeout(input, rest);
      if (res.ok) return res;
      // Retry on common transient errors
      if (![408, 429, 500, 502, 503, 504].includes(res.status)) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e: any) {
      lastErr = e;
    }
    // backoff
    const delay = Math.min(1000 * 2 ** i, 8000);
    await new Promise((r) => setTimeout(r, delay));
  }
  throw lastErr;
}
