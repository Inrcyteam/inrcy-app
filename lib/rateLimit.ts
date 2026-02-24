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
  /**
   * If true, block when the rate limiter backend is unavailable.
   * Use this for expensive endpoints to protect costs/abuse.
   */
  failClosed?: boolean;
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
    if (config.failClosed) {
      return NextResponse.json(
        { error: "Rate limiter unavailable" },
        {
          status: 503,
          headers: {
            "Retry-After": "5",
          },
        }
      );
    }
    return null;
  }
}

type QuotaConfig = {
  /** unique name for the quota counter (e.g. "booster_generate_day") */
  name: string;
  /** identifier (user id is ideal; fallback to ip) */
  identifier: string;
  /** max allowed in period */
  limit: number;
  /** period in seconds (e.g. 86400 for day) */
  periodSeconds: number;
  /** if true, block when KV is unavailable */
  failClosed?: boolean;
};

/**
 * Simple KV-backed quota (counter with TTL).
 * Returns `null` if allowed, otherwise a NextResponse(429).
 */
export async function enforceQuota(config: QuotaConfig): Promise<NextResponse | null> {
  try {
    const redis = getRedis();
    const key = `inrcy_q:${config.name}:${config.identifier}`;

    // Atomic-ish: INCR + set expiry only when first seen.
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, config.periodSeconds);
    }

    if (count <= config.limit) return null;

    // Best-effort: fetch remaining TTL
    const ttl = await redis.ttl(key);
    const retryAfter = ttl && ttl > 0 ? String(ttl) : "60";

    return NextResponse.json(
      {
        error: "Quota exceeded",
        name: config.name,
        limit: config.limit,
        periodSeconds: config.periodSeconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": retryAfter,
        },
      }
    );
  } catch {
    if (config.failClosed) {
      return NextResponse.json(
        { error: "Quota backend unavailable" },
        {
          status: 503,
          headers: {
            "Retry-After": "5",
          },
        }
      );
    }
    return null;
  }
}

/** Best-effort client IP extraction for serverless/edge (Vercel). */
export function getClientIp(req: Request): string {
  const h = req.headers;
  const xff = h.get("x-forwarded-for");
  if (xff) {
    // may contain multiple: client, proxy1, proxy2
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = h.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}
