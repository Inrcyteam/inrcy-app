import { NextRequest, NextResponse } from "next/server";

import { enforceRateLimit } from "./lib/rateLimit";

function getIp(req: NextRequest): string {
  // Vercel provides req.ip, but keep fallbacks for local/dev/proxies.
  const direct = (req as any).ip as string | undefined;
  if (direct) return direct;

  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";

  const xrip = req.headers.get("x-real-ip");
  if (xrip) return xrip;

  return "unknown";
}

function isOauthCallback(pathname: string): boolean {
  // These routes already have per-route rate limits (Step A).
  return pathname.startsWith("/api/integrations/") && pathname.endsWith("/callback");
}

function pickLimit(pathname: string, method: string) {
  const m = method.toUpperCase();
  const isWrite = m !== "GET" && m !== "HEAD" && m !== "OPTIONS";

  // Tighter limits for expensive endpoints
  if (
    pathname === "/api/booster/generate" ||
    pathname === "/api/templates/render" ||
    pathname.startsWith("/api/inbox/")
  ) {
    return isWrite
      ? { tokens: 10, windowSeconds: 60, name: "expensive-write" }
      : { tokens: 30, windowSeconds: 60, name: "expensive-read" };
  }

  // Default limits
  return isWrite
    ? { tokens: 30, windowSeconds: 60, name: "write" }
    : { tokens: 120, windowSeconds: 60, name: "read" };
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip callback routes (already protected at route-level)
  if (isOauthCallback(pathname)) {
    return NextResponse.next();
  }

  const ip = getIp(req);
  const lim = pickLimit(pathname, req.method);
  // NOTE: enforceRateLimit() takes a single config object.
  // We keep a stable identifier per IP + path so users don't share buckets.
  // FAIL-OPEN: If Upstash / env vars / network fails, we allow the request.
  try {
    const res = await enforceRateLimit({
      name: `mw:${lim.name}`,
      identifier: `${pathname}:${ip}`,
      limit: lim.tokens,
      window: `${lim.windowSeconds} s`,
    });
    if (res) return res;
  } catch (err) {
    // Edge runtime: keep it simple and do not block traffic if rate limiting is unavailable.
    console.warn("[rateLimit] middleware disabled (fail-open)", err);
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
