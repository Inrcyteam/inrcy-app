import "server-only";

import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

import { requireEnv } from "@/lib/env";
import { shouldBypassUpstashInCurrentEnv } from "@/lib/upstashMode";
import { ADMIN_USER_IDS } from "@/lib/roles";
import type { MailAttachmentRef } from "@/lib/mailAttachmentRefs";

type AiQuotaAction = "booster" | "template" | "mail" | "review_reply" | "agent_stats" | "transcription";

type ReserveAiCreditsArgs = {
  supabase: any;
  userId: string;
  action: AiQuotaAction;
  credits: number;
};

export type AiCreditReservation = {
  id: string;
  userId: string;
  action: AiQuotaAction;
  credits: number;
  state: "reserved" | "committed" | "rolled_back" | "bypassed";
};

export type AiCreditReservationResult = {
  reservation: AiCreditReservation | null;
  errorResponse: NextResponse | null;
};

// Quota produit : il mesure des unités d'action utilisateur, jamais le nombre
// de canaux ni les sous-appels techniques. Une action texte vaut 1 unité, une
// action avec compréhension image 2, une action vidéo 3.
export const AI_QUOTA_UNIT_MODEL = {
  text: 1,
  image: 2,
  video: 3,
  channelCountMultiplier: false,
} as const;

const DEFAULT_AI_QUOTA_LIMITS = {
  week: 200,
  month: 500,
} as const;

const AI_QUOTA_PERIODS = {
  week: 7 * 24 * 60 * 60,
  month: 30 * 24 * 60 * 60,
} as const;

type QuotaPeriod = keyof typeof DEFAULT_AI_QUOTA_LIMITS;
const QUOTA_PERIODS: QuotaPeriod[] = ["week", "month"];

function positiveInt(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getAiQuotaLimits() {
  return {
    week: positiveInt(process.env.AI_QUOTA_CREDITS_WEEK, DEFAULT_AI_QUOTA_LIMITS.week),
    month: positiveInt(process.env.AI_QUOTA_CREDITS_MONTH, DEFAULT_AI_QUOTA_LIMITS.month),
  } as const;
}

function getRedis() {
  const url = requireEnv("KV_REST_API_URL");
  const token = requireEnv("KV_REST_API_TOKEN");
  const g = globalThis as any;
  if (!g.__inrcy_redis) g.__inrcy_redis = new Redis({ url, token });
  return g.__inrcy_redis as Redis;
}

export async function isAdminUserForAi(supabase: any, userId: string) {
  if (!userId) return false;
  if (ADMIN_USER_IDS.includes(userId as any)) return true;
  try {
    const { data } = await supabase.from("profiles").select("role").eq("user_id", userId).maybeSingle();
    return String((data as any)?.role || "") === "admin";
  } catch {
    return false;
  }
}

function quotaKey(kind: "used" | "reserved", period: QuotaPeriod, userId: string) {
  return `inrcy_aiq:v2:${kind}:${period}:${userId}`;
}

function reservationKey(userId: string, reservationId: string) {
  return `inrcy_aiq:v2:reservation:${userId}:${reservationId}`;
}

function buildQuotaError(period: QuotaPeriod) {
  if (period === "week") return "Vous avez atteint votre quota IA hebdomadaire sur ce compte. Réessayez après le prochain renouvellement.";
  return "Vous avez atteint votre quota IA mensuel sur ce compte. Réessayez après le prochain renouvellement ou contactez iNrCy.";
}

function newReservationId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

const RESERVE_SCRIPT = `
local credits = tonumber(ARGV[1])
local markerTtl = tonumber(ARGV[2])
for i=1,2 do
  local used = tonumber(redis.call('GET', KEYS[i]) or '0')
  local reserved = tonumber(redis.call('GET', KEYS[i+2]) or '0')
  local limit = tonumber(ARGV[i+2])
  if used + reserved + credits > limit then
    local ttl = redis.call('TTL', KEYS[i])
    if ttl < 1 then ttl = redis.call('TTL', KEYS[i+2]) end
    if ttl < 1 then ttl = tonumber(ARGV[i+4]) end
    return {0, i, used, reserved, ttl}
  end
end
for i=1,2 do
  local nextReserved = redis.call('INCRBY', KEYS[i+2], credits)
  redis.call('EXPIRE', KEYS[i+2], markerTtl)
end
redis.call('SET', KEYS[5], 'reserved', 'EX', markerTtl)
return {1, 0, 0, 0, markerTtl}
`;

const COMMIT_SCRIPT = `
local credits = tonumber(ARGV[1])
local state = redis.call('GET', KEYS[5])
if state ~= 'reserved' then return 0 end
for i=1,2 do
  local reserved = tonumber(redis.call('GET', KEYS[i+2]) or '0')
  local nextReserved = reserved - credits
  if nextReserved > 0 then redis.call('SET', KEYS[i+2], nextReserved, 'KEEPTTL') else redis.call('DEL', KEYS[i+2]) end
  local nextUsed = redis.call('INCRBY', KEYS[i], credits)
  if nextUsed == credits or redis.call('TTL', KEYS[i]) < 1 then redis.call('EXPIRE', KEYS[i], tonumber(ARGV[i+1])) end
end
redis.call('SET', KEYS[5], 'committed', 'EX', 3600)
return 1
`;

const ROLLBACK_SCRIPT = `
local credits = tonumber(ARGV[1])
local state = redis.call('GET', KEYS[3])
if state ~= 'reserved' then return 0 end
for i=1,2 do
  local reserved = tonumber(redis.call('GET', KEYS[i]) or '0')
  local nextReserved = reserved - credits
  if nextReserved > 0 then redis.call('SET', KEYS[i], nextReserved, 'KEEPTTL') else redis.call('DEL', KEYS[i]) end
end
redis.call('SET', KEYS[3], 'rolled_back', 'EX', 3600)
return 1
`;

function quotaKeys(userId: string, id: string) {
  const used = QUOTA_PERIODS.map((period) => quotaKey("used", period, userId));
  const reserved = QUOTA_PERIODS.map((period) => quotaKey("reserved", period, userId));
  return { used, reserved, marker: reservationKey(userId, id) };
}

export async function reserveAiCredits(args: ReserveAiCreditsArgs): Promise<AiCreditReservationResult> {
  if (shouldBypassUpstashInCurrentEnv() || !args.userId || await isAdminUserForAi(args.supabase, args.userId)) {
    return { reservation: null, errorResponse: null };
  }

  const credits = Math.max(1, Math.floor(args.credits || 1));
  const id = newReservationId();
  const reservation: AiCreditReservation = { id, userId: args.userId, action: args.action, credits, state: "reserved" };

  try {
    const redis = getRedis();
    const limits = getAiQuotaLimits();
    const keys = quotaKeys(args.userId, id);
    const result = await (redis as any).eval(
      RESERVE_SCRIPT,
      [...keys.used, ...keys.reserved, keys.marker],
      [credits, 15 * 60, limits.week, limits.month, AI_QUOTA_PERIODS.week, AI_QUOTA_PERIODS.month],
    ) as Array<number | string>;

    if (Number(result?.[0]) !== 1) {
      const periodIndex = Math.max(1, Math.min(2, Number(result?.[1]) || 1)) - 1;
      const period = QUOTA_PERIODS[periodIndex];
      const used = Number(result?.[2] || 0);
      const reserved = Number(result?.[3] || 0);
      const retryAfter = Math.max(60, Number(result?.[4] || AI_QUOTA_PERIODS[period]));
      const limit = limits[period];
      return {
        reservation: null,
        errorResponse: NextResponse.json({
          error: buildQuotaError(period),
          code: "ai_quota_reached",
          quota_period: period,
          quota_limit: limit,
          quota_used: used,
          quota_reserved: reserved,
          quota_remaining: Math.max(0, limit - used - reserved),
          credits_requested: credits,
          quota_unit: "ai_action_unit",
          quota_model: "media_weighted_action",
          channel_count_multiplier: false,
          action_unit_cost: credits,
        }, { status: 429, headers: { "Retry-After": String(retryAfter) } }),
      };
    }

    return { reservation, errorResponse: null };
  } catch {
    return {
      reservation: null,
      errorResponse: NextResponse.json({
        error: "Le contrôle du quota IA est momentanément indisponible. Merci de réessayer dans quelques minutes.",
        code: "ai_quota_unavailable",
      }, { status: 503, headers: { "Retry-After": "300" } }),
    };
  }
}

export async function commitAiCredits(reservation: AiCreditReservation | null | undefined): Promise<void> {
  if (!reservation || reservation.state !== "reserved") return;
  try {
    const redis = getRedis();
    const keys = quotaKeys(reservation.userId, reservation.id);
    await (redis as any).eval(
      COMMIT_SCRIPT,
      [...keys.used, ...keys.reserved, keys.marker],
      [reservation.credits, AI_QUOTA_PERIODS.week, AI_QUOTA_PERIODS.month],
    );
    reservation.state = "committed";
  } catch (error) {
    console.warn("[ai-quota] commit unavailable", { action: reservation.action, message: error instanceof Error ? error.message : String(error) });
  }
}

export async function rollbackAiCredits(reservation: AiCreditReservation | null | undefined): Promise<void> {
  if (!reservation || reservation.state !== "reserved") return;
  try {
    const redis = getRedis();
    const keys = quotaKeys(reservation.userId, reservation.id);
    await (redis as any).eval(ROLLBACK_SCRIPT, [...keys.reserved, keys.marker], [reservation.credits]);
    reservation.state = "rolled_back";
  } catch (error) {
    console.warn("[ai-quota] rollback unavailable", { action: reservation.action, message: error instanceof Error ? error.message : String(error) });
  }
}


function attachmentKind(ref: MailAttachmentRef) {
  const name = String(ref?.name || ref?.path || "").toLowerCase();
  const type = String(ref?.type || "").toLowerCase();
  if (type.startsWith("video/") || /\.(mp4|mov|webm|m4v)$/i.test(name)) return "video" as const;
  if (type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(name)) return "image" as const;
  return "document" as const;
}

export function computeMailAiCredits(refs: MailAttachmentRef[]) {
  const kinds = refs.map(attachmentKind);
  if (kinds.includes("video")) return 3;
  if (kinds.includes("image")) return 2;
  return 1;
}

export function computeTemplateAiCredits(refs: MailAttachmentRef[]) {
  const kinds = refs.map(attachmentKind);
  if (kinds.includes("video")) return 3;
  if (kinds.includes("image")) return 2;
  return 1;
}

export function computeBoosterAiCredits(args: { mediaType?: unknown; imagesForAI?: Array<unknown>; videoForAI?: unknown }) {
  const mediaType = args.mediaType === "video" ? "video" : "images";
  const hasVideo = mediaType === "video" && !!args.videoForAI;
  const hasImages = Array.isArray(args.imagesForAI) && args.imagesForAI.length > 0;
  if (hasVideo) return AI_QUOTA_UNIT_MODEL.video;
  if (hasImages) return AI_QUOTA_UNIT_MODEL.image;
  return AI_QUOTA_UNIT_MODEL.text;
}

export function computeReviewReplyAiCredits(_args: { rating?: unknown; comment?: unknown; existingReply?: unknown }) {
  return 1;
}
