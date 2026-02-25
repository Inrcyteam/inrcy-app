import { NextResponse } from "next/server";
import { log } from "@/lib/observability/logger";
import { getRequestId, getRequestMeta } from "@/lib/observability/request";

type Handler = (_req: Request) => Promise<Response>;

function withRequestIdHeader(res: Response, request_id?: string): Response {
  if (!request_id) return res;

  try {
    // In most cases, Response headers are mutable in Next route handlers.
    res.headers.set("x-request-id", request_id);
    return res;
  } catch {
    // Fallback: clone the response with a new Headers object
    const headers = new Headers(res.headers);
    headers.set("x-request-id", request_id);

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  }
}

export function withApi(handler: Handler, opts?: { route?: string }) {
  return async function wrapped(_req: Request): Promise<Response> {
    const started = Date.now();
    const request_id = getRequestId(_req);
    const meta = getRequestMeta(_req);
    const route = opts?.route ?? meta.pathname;

    try {
      const res = await handler(_req);
      const duration_ms = Date.now() - started;
      const status_code = (res as any)?.status ?? 200;

      log.info("api_request", {
        request_id,
        route,
        method: meta.method,
        status_code,
        duration_ms,
        ip: meta.ip,
      });

      return withRequestIdHeader(res, request_id);
    } catch (e: any) {
      const duration_ms = Date.now() - started;
      const message = e?.message || "Unhandled exception";

      log.error("api_error", {
        request_id,
        route,
        method: meta.method,
        status_code: 500,
        duration_ms,
        ip: meta.ip,
        error_message: message,
      });

      const body =
        process.env.NODE_ENV === "production"
          ? { error: "Server error", request_id }
          : { error: "Server error", request_id, message };

      const out = NextResponse.json(body, { status: 500 });
      out.headers.set("x-request-id", request_id || "");
      return out;
    }
  };
}