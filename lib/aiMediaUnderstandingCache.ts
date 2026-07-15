import "server-only";

import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import { requireEnv } from "@/lib/env";
import { shouldBypassUpstashInCurrentEnv } from "@/lib/upstashMode";
export type VisionAnalysisCacheSource = "hit" | "miss" | "disabled";

type CacheableVisionImage = {
  dataUrl: string;
  detail: "low" | "high" | "auto";
};

type VisionAnalysisCacheEntry = {
  factsContext: string;
  visionModel: string;
  createdAt: number;
};

const CACHE_NAMESPACE = "inrcy:ai-media:facts";
const CACHE_VERSION = "v1";
const CACHE_TTL_SECONDS = 6 * 60 * 60;
const MAX_FACTS_CONTEXT_LENGTH = 5_000;

function getRedis(): Redis | null {
  if (shouldBypassUpstashInCurrentEnv()) return null;

  try {
    const url = requireEnv("KV_REST_API_URL");
    const token = requireEnv("KV_REST_API_TOKEN");
    const globalCache = globalThis as typeof globalThis & {
      __inrcy_ai_media_cache_redis?: Redis;
    };
    if (!globalCache.__inrcy_ai_media_cache_redis) {
      globalCache.__inrcy_ai_media_cache_redis = new Redis({ url, token });
    }
    return globalCache.__inrcy_ai_media_cache_redis;
  } catch {
    return null;
  }
}

function parseCacheValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parseEntry(value: unknown, expectedModel: string): VisionAnalysisCacheEntry | null {
  const parsed = parseCacheValue(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const factsContext = String(record.factsContext || "").trim();
  const visionModel = String(record.visionModel || "").trim();
  const createdAt = Number(record.createdAt || 0);

  if (!factsContext || factsContext.length > MAX_FACTS_CONTEXT_LENGTH) return null;
  if (!visionModel || visionModel !== expectedModel) return null;
  if (!Number.isFinite(createdAt) || createdAt <= 0) return null;

  return { factsContext, visionModel, createdAt };
}

export function buildVisionAnalysisCacheKey(args: {
  accountId: string;
  idea: string;
  visionModel: string;
  promptVersion: string;
  images: CacheableVisionImage[];
}): string | null {
  const accountId = String(args.accountId || "").trim();
  const visionModel = String(args.visionModel || "").trim();
  const promptVersion = String(args.promptVersion || "").trim();
  if (!accountId || !visionModel || !promptVersion || !args.images.length) return null;

  const hash = createHash("sha256");
  hash.update(CACHE_VERSION);
  hash.update("\u0000account\u0000");
  hash.update(accountId);
  hash.update("\u0000model\u0000");
  hash.update(visionModel);
  hash.update("\u0000prompt\u0000");
  hash.update(promptVersion);
  hash.update("\u0000idea\u0000");
  hash.update(args.idea);

  for (const image of args.images) {
    hash.update("\u0000image\u0000");
    hash.update(image.detail);
    hash.update("\u0000");
    hash.update(image.dataUrl);
  }

  return `${CACHE_NAMESPACE}:${CACHE_VERSION}:${hash.digest("hex")}`;
}

export async function readVisionAnalysisCache(args: {
  cacheKey: string | null;
  visionModel: string;
}): Promise<{ source: VisionAnalysisCacheSource; factsContext?: string }> {
  if (!args.cacheKey) return { source: "disabled" };
  const redis = getRedis();
  if (!redis) return { source: "disabled" };

  try {
    const cached = await redis.get(args.cacheKey);
    const entry = parseEntry(cached, args.visionModel);
    if (!entry) return { source: "miss" };
    return { source: "hit", factsContext: entry.factsContext };
  } catch {
    return { source: "miss" };
  }
}

export async function writeVisionAnalysisCache(args: {
  cacheKey: string | null;
  factsContext: string;
  visionModel: string;
}): Promise<void> {
  if (!args.cacheKey) return;
  const factsContext = String(args.factsContext || "").trim();
  if (!factsContext || factsContext.length > MAX_FACTS_CONTEXT_LENGTH) return;
  const redis = getRedis();
  if (!redis) return;

  const entry: VisionAnalysisCacheEntry = {
    factsContext,
    visionModel: args.visionModel,
    createdAt: Date.now(),
  };

  try {
    await redis.set(args.cacheKey, JSON.stringify(entry), {
      ex: CACHE_TTL_SECONDS,
    });
  } catch {
    // Le cache reste une optimisation. L'analyse visuelle produite est déjà utilisable.
  }
}
