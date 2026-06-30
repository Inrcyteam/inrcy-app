import "server-only";

import { asNumber, asRecord, asString } from "@/lib/tsSafe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getTrustpilotAccessToken,
  getTrustpilotClientId,
  getTrustpilotIntegration,
  trustpilotPrivateGet,
} from "@/lib/trustpilotOAuth";

export type NormalizedTrustpilotReviewReply = {
  comment: string;
  updateTime: string | null;
};

export type NormalizedTrustpilotReview = {
  name: string;
  reviewId: string;
  reviewerName: string;
  rating: number;
  title: string | null;
  comment: string;
  createTime: string | null;
  updateTime: string | null;
  reply: NormalizedTrustpilotReviewReply | null;
  replyStatus: "answered" | "unanswered";
  isVerified: boolean;
  language: string | null;
  replyable: boolean;
  raw?: unknown;
};

export type TrustpilotReviewsPayload = {
  connected: boolean;
  configured: boolean;
  privateAccess: boolean;
  businessUnitId: string | null;
  businessName: string | null;
  profileUrl: string | null;
  reviewInviteUrl: string | null;
  trustScore: number | null;
  totalReviewCount: number;
  nextPageToken: string | null;
  reviews: NormalizedTrustpilotReview[];
};

export type TrustpilotReviewReplyPayload = {
  comment: string;
  updateTime: string | null;
};

type TrustpilotConfig = {
  businessUnitId: string | null;
  businessName: string | null;
  profileUrl: string | null;
  reviewInviteUrl: string | null;
  trustScore: number | null;
  totalReviewCount: number | null;
  businessUserId: string | null;
};

function clean(value: unknown, max = 3000) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max)
    .trim();
}

function numberOrNull(value: unknown) {
  const parsed = asNumber(value);
  return Number.isFinite(Number(parsed)) ? Number(parsed) : null;
}

function ratingToNumber(value: unknown) {
  const rating = Number(value);
  if (!Number.isFinite(rating)) return 0;
  return Math.min(5, Math.max(0, Math.round(rating)));
}

function arrayFrom(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function getNestedString(value: unknown, ...path: string[]) {
  let cursor: unknown = value;
  for (const key of path) cursor = asRecord(cursor)[key];
  return asString(cursor) || "";
}

function firstString(...values: unknown[]) {
  return values.map((value) => asString(value)).find((value) => Boolean(value && value.trim()))?.trim() || null;
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = numberOrNull(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

async function trustpilotPublicGet<T = any>(path: string): Promise<T> {
  const apiKey = getTrustpilotClientId();
  if (!apiKey) throw new Error("Clé API Trustpilot manquante.");

  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const res = await fetch(`https://api.trustpilot.com/v1${cleanPath}`, {
    method: "GET",
    headers: { apikey: apiKey },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const rec = asRecord(json);
    throw new Error(asString(rec.message) || asString(rec.error_description) || asString(rec.error) || "Appel Trustpilot impossible.");
  }
  return json as T;
}

async function trustpilotPrivateSend<T = any>(path: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const res = await fetch(`https://api.trustpilot.com/v1${cleanPath}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const rec = asRecord(json);
    throw new Error(asString(rec.message) || asString(rec.error_description) || asString(rec.error) || "Appel Trustpilot impossible.");
  }
  return json as T;
}

function normalizeTrustpilotReview(rawReview: unknown, replyable: boolean): NormalizedTrustpilotReview {
  const review = asRecord(rawReview);
  const consumer = asRecord(review.consumer);
  const reply = asRecord(review.companyReply);
  const replyComment = clean(reply.text || reply.comment, 4096);
  const title = clean(review.title, 180);
  const text = clean(review.text || review.comment, 3000);
  const reviewId = asString(review.id) || asString(review.reviewId) || "";
  const reviewerName = clean(consumer.displayName || review.consumerName || review.reviewerName, 140) || "Client Trustpilot";

  return {
    name: reviewId,
    reviewId,
    reviewerName,
    rating: ratingToNumber(review.stars || review.rating || review.starRating),
    title: title || null,
    comment: [title, text].filter(Boolean).join("\n\n") || "Avis sans commentaire écrit.",
    createTime: firstString(review.createdAt, review.createTime),
    updateTime: firstString(review.updatedAt, review.updateTime, review.createdAt, review.createTime),
    reply: replyComment
      ? {
          comment: replyComment,
          updateTime: firstString(reply.updatedAt, reply.updateTime, reply.createdAt, reply.createTime),
        }
      : null,
    replyStatus: replyComment ? "answered" : "unanswered",
    isVerified: Boolean(review.isVerified || review.verified || review.reviewVerificationLevel === "invited"),
    language: firstString(review.language),
    replyable: replyable && Boolean(reviewId),
    raw: rawReview,
  };
}

async function loadTrustpilotConfig(userId: string): Promise<TrustpilotConfig> {
  const [{ data: cfg }, integrationRaw] = await Promise.all([
    supabaseAdmin.from("pro_tools_configs").select("settings").eq("user_id", userId).maybeSingle(),
    getTrustpilotIntegration(userId).catch(() => ({})),
  ]);
  const settings = asRecord(asRecord(asRecord(cfg).settings).trustpilot);
  const integration = asRecord(integrationRaw);
  const meta = asRecord(integration.meta);

  return {
    businessUnitId: firstString(integration.resource_id, meta.business_unit_id, settings.businessUnitId, settings.business_unit_id),
    businessName: firstString(integration.resource_label, meta.business_name, settings.businessName, settings.name),
    profileUrl: firstString(meta.profile_url, settings.profileUrl, settings.url),
    reviewInviteUrl: firstString(meta.review_invite_url, settings.reviewInviteUrl, settings.inviteUrl),
    trustScore: firstNumber(meta.trust_score, settings.trustScore),
    totalReviewCount: firstNumber(meta.number_of_reviews, settings.numberOfReviews),
    businessUserId: firstString(
      meta.business_user_id,
      meta.author_business_user_id,
      settings.businessUserId,
      settings.authorBusinessUserId,
      process.env.TRUSTPILOT_AUTHOR_BUSINESS_USER_ID,
    ),
  };
}

function getReviewsArray(payload: unknown) {
  const rec = asRecord(payload);
  return arrayFrom(rec.reviews || rec.items || rec.serviceReviews);
}

function getTotalCount(payload: unknown, fallback: number | null, loaded: number) {
  const rec = asRecord(payload);
  return firstNumber(rec.total, rec.totalReviews, rec.totalReviewCount, rec.count, getNestedString(rec, "summary", "numberOfReviews"), fallback) ?? loaded;
}

function getNextToken(payload: unknown, page: number, perPage: number, total: number, loaded: number) {
  const rec = asRecord(payload);
  const token = firstString(rec.nextPageToken, rec.nextToken, rec.cursor);
  if (token) return token;
  if (loaded >= perPage && page * perPage < total) return String(page + 1);
  return null;
}

export async function listTrustpilotReviewsForUser(
  userId: string,
  options: { pageSize?: number; pageToken?: string | null } = {},
): Promise<TrustpilotReviewsPayload> {
  const config = await loadTrustpilotConfig(userId);
  if (!config.businessUnitId) {
    return {
      connected: false,
      configured: false,
      privateAccess: false,
      businessUnitId: null,
      businessName: config.businessName,
      profileUrl: config.profileUrl,
      reviewInviteUrl: config.reviewInviteUrl,
      trustScore: config.trustScore,
      totalReviewCount: 0,
      nextPageToken: null,
      reviews: [],
    };
  }

  const pageSize = Math.min(Math.max(Number(options.pageSize || 50), 1), 100);
  const page = Math.max(1, Number(options.pageToken || 1) || 1);
  const accessToken = await getTrustpilotAccessToken(userId).catch(() => "");
  const privateAccess = Boolean(accessToken);
  const path = privateAccess
    ? `/private/business-units/${encodeURIComponent(config.businessUnitId)}/reviews?page=${page}&perPage=${pageSize}`
    : `/business-units/${encodeURIComponent(config.businessUnitId)}/reviews?page=${page}&perPage=${pageSize}`;

  const payload = privateAccess
    ? await trustpilotPrivateGet(path, accessToken)
    : await trustpilotPublicGet(path);
  const rawReviews = getReviewsArray(payload);
  const reviews = rawReviews.map((review) => normalizeTrustpilotReview(review, privateAccess));
  const totalReviewCount = getTotalCount(payload, config.totalReviewCount, reviews.length);

  return {
    connected: true,
    configured: true,
    privateAccess,
    businessUnitId: config.businessUnitId,
    businessName: config.businessName,
    profileUrl: config.profileUrl,
    reviewInviteUrl: config.reviewInviteUrl,
    trustScore: config.trustScore,
    totalReviewCount,
    nextPageToken: getNextToken(payload, page, pageSize, totalReviewCount, reviews.length),
    reviews,
  };
}

export async function trustpilotReplyToReview(userId: string, reviewId: string, comment: string): Promise<TrustpilotReviewReplyPayload> {
  const cleanReviewId = clean(reviewId, 140);
  const cleanComment = clean(comment, 4096);
  if (!cleanReviewId) throw new Error("Avis Trustpilot invalide.");
  if (cleanComment.length < 2) throw new Error("La réponse ne peut pas être vide.");

  const [accessToken, config] = await Promise.all([
    getTrustpilotAccessToken(userId),
    loadTrustpilotConfig(userId),
  ]);
  if (!accessToken) throw new Error("Trustpilot doit être connecté en OAuth pour répondre aux avis.");
  if (!config.businessUserId) {
    throw new Error("L'identifiant utilisateur Business Trustpilot est manquant pour publier la réponse.");
  }

  const payload = await trustpilotPrivateSend(`/private/reviews/${encodeURIComponent(cleanReviewId)}/reply`, accessToken, {
    method: "POST",
    body: JSON.stringify({ authorBusinessUserId: config.businessUserId, message: cleanComment }),
  });
  const rec = asRecord(payload);
  const reply = asRecord(rec.reply || rec.companyReply || rec);

  return {
    comment: clean(reply.text || reply.comment || reply.message || cleanComment, 4096),
    updateTime: firstString(reply.updatedAt, reply.updateTime, reply.createdAt, reply.createTime, new Date().toISOString()),
  };
}

export async function trustpilotDeleteReviewReply(userId: string, reviewId: string) {
  const cleanReviewId = clean(reviewId, 140);
  if (!cleanReviewId) throw new Error("Avis Trustpilot invalide.");

  const accessToken = await getTrustpilotAccessToken(userId);
  if (!accessToken) throw new Error("Trustpilot doit être connecté en OAuth pour supprimer une réponse.");

  await trustpilotPrivateSend(`/private/reviews/${encodeURIComponent(cleanReviewId)}/reply`, accessToken, {
    method: "DELETE",
  });
}
