import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { NextResponse } from "next/server";

import { requireEnv } from "@/lib/env";
import { shouldBypassUpstashInCurrentEnv } from "@/lib/upstashMode";

type Window = `${number} ${"ms" | "s" | "m" | "h" | "d"}`;

type LocalLimitState = {
  count: number;
  resetAt: number;
};

function windowToMs(window: Window) {
  const match = /^(\d+)\s+(ms|s|m|h|d)$/.exec(window);
  if (!match) return 60_000;
  const amount = Number(match[1]);
  const multiplier = {
    ms: 1,
    s: 1_000,
    m: 60_000,
    h: 60 * 60_000,
    d: 24 * 60 * 60_000,
  }[match[2] as "ms" | "s" | "m" | "h" | "d"];
  return Math.max(1, amount * multiplier);
}

function localLimitResponse(args: {
  name: string;
  identifier: string;
  limit: number;
  windowMs: number;
  error: string;
  periodSeconds?: number;
}) {
  const g = globalThis as typeof globalThis & {
    __inrcy_local_limit_fallback?: Map<string, LocalLimitState>;
  };
  const states = (g.__inrcy_local_limit_fallback ||= new Map());
  const now = Date.now();

  // Best-effort cleanup for warm serverless instances. Redis remains authoritative.
  if (states.size > 5_000) {
    for (const [key, state] of states) {
      if (state.resetAt <= now) states.delete(key);
    }
  }

  const limit = Math.max(1, Math.floor(args.limit));
  const key = `${args.name}:${args.identifier}`;
  const current = states.get(key);
  const state = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + args.windowMs }
    : current;
  state.count += 1;
  states.set(key, state);

  if (state.count <= limit) return null;
  const retryAfter = Math.max(1, Math.ceil((state.resetAt - now) / 1_000));
  return NextResponse.json(
    {
      error: args.error,
      name: args.name,
      limit,
      ...(args.periodSeconds ? { periodSeconds: args.periodSeconds } : {}),
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-InrCy-Limit-Mode": "emergency-local",
      },
    },
  );
}

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
  /** lower emergency limit used if Redis is temporarily unavailable */
  fallbackLimit?: number;
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
      analytics: false,
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
  if (shouldBypassUpstashInCurrentEnv()) {
    if (process.env.NODE_ENV !== "production") return null;
    if (config.failClosed) {
      return NextResponse.json(
        { error: "Le service est momentanément indisponible. Merci de réessayer dans quelques minutes." },
        { status: 503, headers: { "Retry-After": "5" } },
      );
    }
    return localLimitResponse({
      name: config.name,
      identifier: config.identifier,
      limit: config.fallbackLimit || config.limit,
      windowMs: windowToMs(config.window),
      error: "Trop de tentatives en peu de temps. Merci de réessayer dans quelques instants.",
    });
  }

  try {
    const limiter = getLimiter(config.name, config.limit, config.window);
    const res = await limiter.limit(config.identifier);

    if (res.success) return null;

    const retryAfterSec = Math.max(1, Math.ceil((res.reset - Date.now()) / 1000));
    return NextResponse.json(
      {
        error: "Trop de tentatives en peu de temps. Merci de réessayer dans quelques instants.",
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
        { error: "Le service est momentanément indisponible. Merci de réessayer dans quelques minutes." },
        {
          status: 503,
          headers: {
            "Retry-After": "5",
          },
        }
      );
    }
    return localLimitResponse({
      name: config.name,
      identifier: config.identifier,
      limit: config.fallbackLimit || config.limit,
      windowMs: windowToMs(config.window),
      error: "Trop de tentatives en peu de temps. Merci de réessayer dans quelques instants.",
    });
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
  /** lower emergency limit used if Redis is temporarily unavailable */
  fallbackLimit?: number;
  /** if true, block when KV is unavailable */
  failClosed?: boolean;
};

/**
 * Simple KV-backed quota (counter with TTL).
 * Returns `null` if allowed, otherwise a NextResponse(429).
 */
export async function enforceQuota(config: QuotaConfig): Promise<NextResponse | null> {
  if (shouldBypassUpstashInCurrentEnv()) {
    if (process.env.NODE_ENV !== "production") return null;
    if (config.failClosed) {
      return NextResponse.json(
        { error: "Le service est momentanément indisponible. Merci de réessayer dans quelques minutes." },
        { status: 503, headers: { "Retry-After": "5" } },
      );
    }
    return localLimitResponse({
      name: config.name,
      identifier: config.identifier,
      limit: config.fallbackLimit || config.limit,
      windowMs: config.periodSeconds * 1_000,
      periodSeconds: config.periodSeconds,
      error: "Le quota de cette action a été atteint. Merci de réessayer plus tard.",
    });
  }

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
        error: "Le quota de cette action a été atteint. Merci de réessayer plus tard.",
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
        { error: "Le service est momentanément indisponible. Merci de réessayer dans quelques minutes." },
        {
          status: 503,
          headers: {
            "Retry-After": "5",
          },
        }
      );
    }
    return localLimitResponse({
      name: config.name,
      identifier: config.identifier,
      limit: config.fallbackLimit || config.limit,
      windowMs: config.periodSeconds * 1_000,
      periodSeconds: config.periodSeconds,
      error: "Le quota de cette action a été atteint. Merci de réessayer plus tard.",
    });
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
