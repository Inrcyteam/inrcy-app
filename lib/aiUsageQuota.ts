import "server-only";

import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

import { requireEnv } from "@/lib/env";
import { shouldBypassUpstashInCurrentEnv } from "@/lib/upstashMode";
import { ADMIN_USER_IDS } from "@/lib/roles";
import type { MailAttachmentRef } from "@/lib/mailAttachmentRefs";

type AiQuotaAction = "booster" | "template" | "mail";

type ConsumeAiCreditsArgs = {
  supabase: any;
  userId: string;
  action: AiQuotaAction;
  credits: number;
};

const AI_QUOTA_LIMITS = {
  day: 30,
  week: 150,
  month: 450,
} as const;

const AI_QUOTA_PERIODS = {
  day: 24 * 60 * 60,
  week: 7 * 24 * 60 * 60,
  month: 30 * 24 * 60 * 60,
} as const;

function getRedis() {
  const url = requireEnv("KV_REST_API_URL");
  const token = requireEnv("KV_REST_API_TOKEN");
  const g = globalThis as any;
  if (!g.__inrcy_redis) {
    g.__inrcy_redis = new Redis({ url, token });
  }
  return g.__inrcy_redis as Redis;
}

export async function isAdminUserForAi(supabase: any, userId: string) {
  if (!userId) return false;
  if (ADMIN_USER_IDS.includes(userId as any)) return true;
  try {
    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    return String((data as any)?.role || "") === "admin";
  } catch {
    return false;
  }
}

function buildQuotaError(period: keyof typeof AI_QUOTA_LIMITS) {
  if (period === "day") {
    return "Vous avez atteint votre quota IA du jour sur ce compte. Pour préserver la qualité du service, les générations IA sont temporairement mises en pause. Réessayez demain.";
  }
  if (period === "week") {
    return "Vous avez atteint votre quota IA de la semaine sur ce compte. Les générations IA seront de nouveau disponibles au prochain renouvellement hebdomadaire.";
  }
  return "Vous avez atteint votre quota IA du mois sur ce compte. Les générations IA seront de nouveau disponibles au prochain renouvellement mensuel. Si besoin, contactez iNrCy.";
}

async function getWindowState(args: {
  redis: Redis;
  userId: string;
  period: keyof typeof AI_QUOTA_LIMITS;
}) {
  const key = `inrcy_aiq:${args.period}:${args.userId}`;
  const countRaw = await args.redis.get<number | null>(key);
  const count = Number(countRaw || 0);
  const ttl = await args.redis.ttl(key);
  return { key, count, ttl: ttl && ttl > 0 ? ttl : AI_QUOTA_PERIODS[args.period] };
}

export async function consumeAiCredits(args: ConsumeAiCreditsArgs): Promise<NextResponse | null> {
  if (shouldBypassUpstashInCurrentEnv()) return null;
  if (!args.userId) return null;
  if (await isAdminUserForAi(args.supabase, args.userId)) return null;

  try {
    const redis = getRedis();
    const periods: Array<keyof typeof AI_QUOTA_LIMITS> = ["day", "week", "month"];
    const credits = Math.max(1, Math.floor(args.credits || 1));

    const states = await Promise.all(periods.map((period) => getWindowState({ redis, userId: args.userId, period })));

    for (let index = 0; index < periods.length; index += 1) {
      const period = periods[index];
      const state = states[index];
      const limit = AI_QUOTA_LIMITS[period];
      if (state.count + credits > limit) {
        return NextResponse.json(
          {
            error: buildQuotaError(period),
            code: "ai_quota_reached",
            quota_period: period,
            quota_limit: limit,
            credits_requested: credits,
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(state.ttl),
            },
          },
        );
      }
    }

    for (let index = 0; index < periods.length; index += 1) {
      const period = periods[index];
      const state = states[index];
      const nextCount = await redis.incrby(state.key, credits);
      if (nextCount === credits) {
        await redis.expire(state.key, AI_QUOTA_PERIODS[period]);
      }
    }

    return null;
  } catch {
    return NextResponse.json(
      {
        error: "Le contrôle du quota IA est momentanément indisponible. Merci de réessayer dans quelques minutes.",
        code: "ai_quota_unavailable",
      },
      { status: 503, headers: { "Retry-After": "300" } },
    );
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
  if (kinds.includes("video")) return 5;
  if (kinds.includes("image")) return 3;
  if (kinds.includes("document")) return 2;
  return 1;
}

export function computeTemplateAiCredits(refs: MailAttachmentRef[]) {
  const kinds = refs.map(attachmentKind);
  if (kinds.includes("video")) return 6;
  if (kinds.includes("image")) return 4;
  if (kinds.includes("document")) return 3;
  return 2;
}

export function computeBoosterAiCredits(args: {
  mediaType?: unknown;
  imagesForAI?: Array<unknown>;
  videoForAI?: unknown;
}) {
  const mediaType = args.mediaType === "video" ? "video" : "images";
  const hasVideo = mediaType === "video" && !!args.videoForAI;
  const hasImages = Array.isArray(args.imagesForAI) && args.imagesForAI.length > 0;
  if (hasVideo) return 8;
  if (hasImages) return 6;
  return 4;
}
