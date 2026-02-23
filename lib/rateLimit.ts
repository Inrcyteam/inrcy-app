import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { NextResponse } from "next/server";

import { requireEnv } from "@/lib/env";

type Window = `${number} ${"ms" | "s" | "m" | "h" | "d"}`;

/**
 * Upstash-backed rate limiting.
 *
 * Env required (Vercel/Upstash KV integration):
 * - KV_REST_API_URL
 * - KV_REST_API_TOKEN
 *
 * Tip: if you use Vercel KV, these are auto-provisioned.
 */
function getRedis() {
  const url = requireEnv("KV_REST_API_URL");
  const token = requireEnv("KV_REST_API_TOKEN");
  // cache across hot reloads / lambdas
  const g = globalThis as any;
  if (!g.__inrcy_redis) {
    g.__inrcy_redis = new Redis({ url, token });
  }
  return g.__inrcy_redis as Redis;
}

type RateLimitConfig = {
  /** unique name for the limiter (e.g. "booster_generate") */
  name: string;
  /** identifier (user id is ideal; fallback to ip) */
  identifier: string;
  /** max requests in window */
  limit: number;
  /** e.g. "1 m", "10 s", "1 h" */
  window: Window;
};

function getLimiter(name: string, limit: number, window: Window) {
  const g = globalThis as any;
  g.__inrcy_limiters ||= {};
  const key = `${name}:${limit}:${window}`;
  if (!g.__inrcy_limiters[key]) {
    g.__inrcy_limiters[key] = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(limit, window),
      analytics: true,
      prefix: `inrcy_rl:${name}`,
    });
  }
  return g.__inrcy_limiters[key] as Ratelimit;
}

/**
 * Enforce a rate limit for an API route.
 * Returns `null` if allowed, otherwise a NextResponse(429).
 */
export async function enforceRateLimit(config: RateLimitConfig): Promise<NextResponse | null> {
  // If KV not configured yet, do not block (but keep app functional).
  // You can remove this try/catch once KV is mandatory.
  try {
    const limiter = getLimiter(config.name, config.limit, config.window);
    const res = await limiter.limit(config.identifier);

    if (res.success) return null;

    const retryAfterSec = Math.max(1, Math.ceil(res.reset / 1000));
    return NextResponse.json(
      {
        error: "Rate limit exceeded",
        name: config.name,
        limit: config.limit,
        window: config.window,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSec),
        },
      }
    );
  } catch {
    return null;
  }
}
