import "server-only";

import { Redis } from "@upstash/redis";

import { shouldBypassUpstashInCurrentEnv } from "@/lib/upstashMode";
import type { AiGenerationFeature } from "@/lib/aiGatewayPolicy";

export class AiGatewayAccountLimitError extends Error {
  code = "ai_gateway_account_limit_reached" as const;

  constructor(message = "La limite de sécurité IA de ce compte est atteinte. Merci de réessayer plus tard.") {
    super(message);
    this.name = "AiGatewayAccountLimitError";
  }
}

type AiGatewayUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type GuardWindow = "day" | "month";

type GuardLimits = {
  dayCalls: number;
  dayOutputTokens: number;
  monthCalls: number;
  monthOutputTokens: number;
};

const DEFAULT_LIMITS: GuardLimits = {
  dayCalls: 300,
  dayOutputTokens: 250_000,
  monthCalls: 6000,
  monthOutputTokens: 5_000_000,
};

const WINDOW_TTL_SECONDS: Record<GuardWindow, number> = {
  day: 2 * 24 * 60 * 60,
  month: 40 * 24 * 60 * 60,
};

function cleanId(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 180) : "";
}

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getLimits(): GuardLimits {
  return {
    dayCalls: positiveInt(process.env.AI_GATEWAY_MAX_CALLS_PER_ACCOUNT_DAY, DEFAULT_LIMITS.dayCalls),
    dayOutputTokens: positiveInt(
      process.env.AI_GATEWAY_MAX_OUTPUT_TOKENS_PER_ACCOUNT_DAY,
      DEFAULT_LIMITS.dayOutputTokens,
    ),
    monthCalls: positiveInt(process.env.AI_GATEWAY_MAX_CALLS_PER_ACCOUNT_MONTH, DEFAULT_LIMITS.monthCalls),
    monthOutputTokens: positiveInt(
      process.env.AI_GATEWAY_MAX_OUTPUT_TOKENS_PER_ACCOUNT_MONTH,
      DEFAULT_LIMITS.monthOutputTokens,
    ),
  };
}

function getRedis(): Redis | null {
  if (shouldBypassUpstashInCurrentEnv()) return null;
  const url = String(process.env.KV_REST_API_URL || "").trim();
  const token = String(process.env.KV_REST_API_TOKEN || "").trim();
  if (!url || !token) return null;

  const g = globalThis as typeof globalThis & { __inrcy_ai_gateway_guard_redis?: Redis };
  if (!g.__inrcy_ai_gateway_guard_redis) {
    g.__inrcy_ai_gateway_guard_redis = new Redis({ url, token });
  }
  return g.__inrcy_ai_gateway_guard_redis;
}

function getUtcWindowId(window: GuardWindow, now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  if (window === "month") return `${year}-${month}`;
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildKey(args: {
  window: GuardWindow;
  accountId: string;
  metric: "calls" | "input" | "output" | "total";
}) {
  return `inrcy_aig:${args.window}:${getUtcWindowId(args.window)}:${args.accountId}:${args.metric}`;
}

async function ensureExpiry(redis: Redis, key: string, nextValue: number, window: GuardWindow) {
  if (nextValue === 1) {
    await redis.expire(key, WINDOW_TTL_SECONDS[window]);
  }
}

async function readNumber(redis: Redis, key: string): Promise<number> {
  const value = await redis.get<number | string | null>(key);
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Réserve une tentative HTTP réelle vers le Gateway. L'incrément atomique Redis
 * empêche deux requêtes concurrentes de dépasser silencieusement la limite d'appels.
 * Le garde-fou est fail-open uniquement si Upstash est volontairement désactivé.
 */
export async function reserveAiGatewayAccountAttempt(accountIdRaw: unknown): Promise<void> {
  const accountId = cleanId(accountIdRaw);
  if (!accountId) return;

  const redis = getRedis();
  if (!redis) return;

  const limits = getLimits();
  const windows: Array<{ window: GuardWindow; callLimit: number; outputLimit: number }> = [
    { window: "day", callLimit: limits.dayCalls, outputLimit: limits.dayOutputTokens },
    { window: "month", callLimit: limits.monthCalls, outputLimit: limits.monthOutputTokens },
  ];

  for (const entry of windows) {
    const outputKey = buildKey({ window: entry.window, accountId, metric: "output" });
    const usedOutputTokens = await readNumber(redis, outputKey);
    if (usedOutputTokens >= entry.outputLimit) {
      throw new AiGatewayAccountLimitError(
        entry.window === "day"
          ? "La limite de sécurité IA quotidienne de ce compte est atteinte. Réessayez demain."
          : "La limite de sécurité IA mensuelle de ce compte est atteinte. Contactez iNrCy si nécessaire.",
      );
    }
  }

  for (const entry of windows) {
    const callKey = buildKey({ window: entry.window, accountId, metric: "calls" });
    const nextCalls = Number(await redis.incr(callKey));
    await ensureExpiry(redis, callKey, nextCalls, entry.window);
    if (nextCalls > entry.callLimit) {
      throw new AiGatewayAccountLimitError(
        entry.window === "day"
          ? "La limite de sécurité IA quotidienne de ce compte est atteinte. Réessayez demain."
          : "La limite de sécurité IA mensuelle de ce compte est atteinte. Contactez iNrCy si nécessaire.",
      );
    }
  }
}

export async function recordAiGatewayAccountUsage(args: {
  accountId: unknown;
  feature: AiGenerationFeature;
  model: string;
  usage: AiGatewayUsage;
}): Promise<void> {
  const accountId = cleanId(args.accountId);
  if (!accountId) return;

  const redis = getRedis();
  if (!redis) return;

  const safeUsage: AiGatewayUsage = {
    inputTokens: Math.max(0, Math.floor(Number(args.usage.inputTokens || 0))),
    outputTokens: Math.max(0, Math.floor(Number(args.usage.outputTokens || 0))),
    totalTokens: Math.max(0, Math.floor(Number(args.usage.totalTokens || 0))),
  };

  for (const window of ["day", "month"] as const) {
    for (const [metric, amount] of [
      ["input", safeUsage.inputTokens],
      ["output", safeUsage.outputTokens],
      ["total", safeUsage.totalTokens],
    ] as const) {
      if (!amount) continue;
      const key = buildKey({ window, accountId, metric });
      const nextValue = Number(await redis.incrby(key, amount));
      if (nextValue === amount) {
        await redis.expire(key, WINDOW_TTL_SECONDS[window]);
      }
    }
  }

  // Petit compteur par fonctionnalité pour diagnostic économique interne.
  const featureKey = `inrcy_aig:day:${getUtcWindowId("day")}:${accountId}:feature:${args.feature}`;
  const featureCalls = Number(await redis.incr(featureKey));
  await ensureExpiry(redis, featureKey, featureCalls, "day");

  const modelKey = `inrcy_aig:day:${getUtcWindowId("day")}:${accountId}:model:${args.model}`;
  const modelCalls = Number(await redis.incr(modelKey));
  await ensureExpiry(redis, modelKey, modelCalls, "day");
}

export function getAiGatewayAccountGuardDefaults(): GuardLimits {
  return { ...DEFAULT_LIMITS };
}
