import { getClientIp } from "@/lib/rateLimit";

export function getRequestId(req: Request): string | undefined {
  // Middleware sets this on all requests.
  return req.headers.get("x-request-id") ?? undefined;
}

export function getRequestMeta(req: Request) {
  const url = new URL(req.url);
  return {
    method: req.method,
    pathname: url.pathname,
    ip: getClientIp(req),
  };
}
