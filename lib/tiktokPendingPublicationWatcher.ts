import "server-only";

import {
  buildAsyncPublicationAggregate,
  type BoosterAsyncChannelKey,
} from "@/lib/boosterAsyncPublication";
import { isBoosterPublicationChannel } from "@/lib/boosterPublicationPolicy";
import { encryptToken, tryDecryptToken } from "@/lib/oauthCrypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { refreshTiktokAccessToken } from "@/lib/tiktokOAuth";
import { fetchTiktokPublishStatus, getTiktokUserFacingError } from "@/lib/tiktokPublish";
import { asRecord, asString } from "@/lib/tsSafe";

type JsonRecord = Record<string, unknown>;
type EventRow = {
  id: string | number;
  user_id: string;
  payload: unknown;
  created_at?: string | null;
};
type PendingDeliveryRow = {
  publication_id: string;
  user_id: string;
  created_at?: string | null;
};

const TERMINAL_STATUSES = new Set([
  "PUBLISH_COMPLETE",
  "DONE",
  "SUCCESS",
  "FAILED",
  "PUBLISH_FAILED",
  "ERROR",
  "CANCELLED",
  "CANCELED",
]);
const WATCHER_CONCURRENCY = 4;

function publicationChannels(
  payload: JsonRecord,
  results: JsonRecord,
): BoosterAsyncChannelKey[] {
  const summaryEntries = Array.isArray(asRecord(payload.summary).entries)
    ? (asRecord(payload.summary).entries as unknown[])
    : [];
  const candidates = Array.isArray(payload.attemptedChannels)
    ? payload.attemptedChannels
    : summaryEntries.length > 0
      ? summaryEntries.map((entry) => asRecord(entry).channel)
      : Object.keys(results);
  return Array.from(
    new Set(
      candidates
        .map((value) => String(value || "").trim())
        .filter(isBoosterPublicationChannel),
    ),
  );
}

function isExpired(expiresAt: unknown, skewSeconds = 120) {
  const timestamp = Date.parse(String(expiresAt || ""));
  return Number.isFinite(timestamp) && timestamp <= Date.now() + skewSeconds * 1000;
}

async function getTiktokAccessToken(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("integrations")
    .select("access_token_enc,refresh_token_enc,meta,expires_at")
    .eq("user_id", userId)
    .eq("provider", "tiktok")
    .eq("source", "tiktok")
    .eq("product", "tiktok")
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  const row = asRecord(Array.isArray(data) ? data[0] : null);
  let accessToken = tryDecryptToken(String(row.access_token_enc || "")) || "";
  const refreshToken = tryDecryptToken(String(row.refresh_token_enc || "")) || "";

  if (accessToken && !isExpired(row.expires_at)) return accessToken;
  if (!refreshToken) return accessToken;

  const refreshed = await refreshTiktokAccessToken(refreshToken);
  const nextAccessToken = (asString(refreshed.access_token) || "").trim();
  if (!nextAccessToken) return accessToken;

  const nextRefreshToken = (asString(refreshed.refresh_token) || "").trim() || refreshToken;
  const expiresIn = Number(refreshed.expires_in || 0);
  const refreshExpiresIn = Number(refreshed.refresh_expires_in || 0);
  const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : row.expires_at || null;
  const nextMeta = {
    ...asRecord(row.meta),
    refresh_expires_at: Number.isFinite(refreshExpiresIn) && refreshExpiresIn > 0
      ? new Date(Date.now() + refreshExpiresIn * 1000).toISOString()
      : asRecord(row.meta).refresh_expires_at || null,
    tiktok_token_refreshed_at: new Date().toISOString(),
  };

  const { error: updateError } = await supabaseAdmin
    .from("integrations")
    .update({
      access_token_enc: encryptToken(nextAccessToken),
      refresh_token_enc: encryptToken(nextRefreshToken),
      expires_at: expiresAt,
      meta: nextMeta,
    })
    .eq("user_id", userId)
    .eq("provider", "tiktok")
    .eq("source", "tiktok")
    .eq("product", "tiktok");
  if (updateError) throw updateError;

  accessToken = nextAccessToken;
  return accessToken;
}

function statusLabel(status: string | null | undefined, fetchFailed: boolean) {
  if (fetchFailed) return "Vérification temporairement impossible";
  const value = String(status || "").toUpperCase();
  if (value === "PUBLISH_COMPLETE" || value === "DONE" || value === "SUCCESS") return "Publié";
  if (value === "FAILED" || value === "PUBLISH_FAILED" || value === "ERROR") return "Échec";
  if (value === "PROCESSING_UPLOAD") return "Upload TikTok en cours";
  if (value === "PROCESSING_DOWNLOAD") return "Téléchargement TikTok en cours";
  return "En traitement";
}

function statusMessage(status: Awaited<ReturnType<typeof fetchTiktokPublishStatus>>) {
  if (status.failed) return getTiktokUserFacingError(status.failReason || status.status || "tiktok_publish_failed");
  if (status.statusFetchFailed) return getTiktokUserFacingError(status.failReason || status.providerErrorCode || "internal_error");
  if (status.complete) return "TikTok confirme que la publication est terminée.";
  return "TikTok traite encore la publication. iNrSend poursuit automatiquement le suivi.";
}

function isPendingTikTokResult(resultLike: unknown) {
  const result = asRecord(resultLike);
  const publishId = String(result.external_id || asRecord(result.diagnostics).publish_id || "").trim();
  const status = String(result.tiktok_status || asRecord(asRecord(result.diagnostics).status).status || "").toUpperCase();
  return Boolean(
    publishId &&
      result.cancelled !== true &&
      !TERMINAL_STATUSES.has(status) &&
      result.status !== "cancelled",
  );
}

async function persistStatus(row: EventRow, publicationId: string, status: Awaited<ReturnType<typeof fetchTiktokPublishStatus>>) {
  const payload = asRecord(row.payload);
  const results = asRecord(payload.results);
  const current = asRecord(results.tiktok);
  const diagnostics = asRecord(current.diagnostics);
  const publishId = String(current.external_id || diagnostics.publish_id || "").trim();
  const nowIso = new Date().toISOString();
  const message = statusMessage(status);
  const nextResult: JsonRecord = {
    ...current,
    ok: status.failed ? false : true,
    status: status.failed ? "failed" : status.complete ? "delivered" : "processing",
    external_id: publishId,
    share_url: status.shareUrl || current.share_url || null,
    external_url: status.shareUrl || current.external_url || current.profile_url || null,
    tiktok_status: status.status || current.tiktok_status || "PROCESSING",
    tiktok_status_label: statusLabel(status.status, Boolean(status.statusFetchFailed)),
    tiktok_status_message: message,
    tiktok_status_checked_at: nowIso,
    tiktok_status_progress_at: nowIso,
    tiktok_status_fetch_failed: Boolean(status.statusFetchFailed),
    tiktok_status_fetch_error: status.statusFetchFailed ? status.failReason || status.providerErrorCode || null : null,
    tiktok_fail_reason: status.failed ? status.failReason || null : null,
    tiktok_provider_error_code: status.providerErrorCode || null,
    tiktok_uploaded_bytes: status.uploadedBytes ?? current.tiktok_uploaded_bytes ?? null,
    tiktok_downloaded_bytes: status.downloadedBytes ?? current.tiktok_downloaded_bytes ?? null,
    tiktok_public_post_ids: status.publiclyAvailablePostIds?.length
      ? status.publiclyAvailablePostIds
      : current.tiktok_public_post_ids || [],
    warning: Boolean(status.pending || status.statusFetchFailed),
    warning_message: status.pending || status.statusFetchFailed ? message : null,
    error: status.failed ? message : null,
    diagnostics: {
      ...diagnostics,
      publish_id: publishId,
      status,
      share_url: status.shareUrl || diagnostics.share_url || null,
      status_checked_at: nowIso,
    },
  };
  const nextResults = { ...results, tiktok: nextResult };
  const selectedChannels = publicationChannels(payload, nextResults);
  const aggregate = buildAsyncPublicationAggregate(
    nextResults,
    selectedChannels,
  );
  const terminal = status.complete || status.failed;
  const nextPayload = {
    ...payload,
    attemptedChannels: selectedChannels,
    channels: aggregate.summary.successChannels,
    results: nextResults,
    summary: aggregate.summary,
    status: aggregate.status,
    outcome: aggregate.outcome,
    updatedAt: nowIso,
    ...(terminal
      ? { completedAt: nowIso, externalCompletedAt: nowIso }
      : {}),
  };

  const { error: eventError } = await supabaseAdmin
    .from("app_events")
    .update({ payload: nextPayload })
    .eq("id", row.id)
    .eq("user_id", row.user_id);
  if (eventError) throw eventError;

  const { error: deliveryError } = await supabaseAdmin
    .from("publication_deliveries")
    .update({
      status: status.failed ? "failed" : status.complete ? "delivered" : "processing",
      error: status.failed ? message : null,
    })
    .eq("user_id", row.user_id)
    .eq("publication_id", publicationId)
    .eq("channel", "tiktok")
    .neq("status", "deleted");
  if (deliveryError) throw deliveryError;
}

export async function processPendingTiktokPublications({ limit = 75 }: { limit?: number } = {}) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const normalizedLimit = Math.max(1, Math.min(100, Math.round(limit || 75)));
  // `publication_deliveries` is the small, indexed source of pending work.
  // Loading 500 seven-day JSON app_events every minute was one of the main
  // avoidable Supabase CPU consumers.
  const { data: deliveryData, error: deliveryError } = await supabaseAdmin
    .from("publication_deliveries")
    .select("publication_id,user_id,created_at")
    .eq("channel", "tiktok")
    .eq("status", "processing")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(normalizedLimit);
  if (deliveryError) throw deliveryError;

  const deliveries = (deliveryData || []) as PendingDeliveryRow[];
  const deliveryKeys = new Set(
    deliveries.map(
      (row) => `${String(row.user_id)}:${String(row.publication_id)}`,
    ),
  );
  const publicationIds = Array.from(
    new Set(
      deliveries.map((row) => String(row.publication_id || "").trim()),
    ),
  ).filter(Boolean);
  const { data: eventData, error: eventError } = publicationIds.length
    ? await supabaseAdmin
        .from("app_events")
        .select("id,user_id,payload,created_at")
        .eq("module", "booster")
        .eq("type", "publish")
        .in("id", publicationIds)
    : { data: [], error: null };
  if (eventError) throw eventError;

  const candidates = ((eventData || []) as EventRow[])
    .map((row) => {
      const payload = asRecord(row.payload);
      const publicationId = String(payload.publication_id || "").trim();
      const result = asRecord(asRecord(payload.results).tiktok);
      return { row, publicationId, result };
    })
    .filter(
      (entry) =>
        entry.publicationId &&
        deliveryKeys.has(`${entry.row.user_id}:${entry.publicationId}`) &&
        isPendingTikTokResult(entry.result),
    )
    .slice(0, normalizedLimit);

  const tokenCache = new Map<string, Promise<string>>();
  const getToken = (userId: string) => {
    const existing = tokenCache.get(userId);
    if (existing) return existing;
    const promise = getTiktokAccessToken(userId);
    tokenCache.set(userId, promise);
    return promise;
  };

  let completed = 0;
  let failed = 0;
  let pending = 0;
  let errors = 0;

  let cursor = 0;
  const processNext = async (): Promise<void> => {
    while (cursor < candidates.length) {
      const candidate = candidates[cursor];
      cursor += 1;
      try {
        const token = await getToken(candidate.row.user_id);
        if (!token) {
          errors += 1;
          continue;
        }
        const publishId = String(
          candidate.result.external_id ||
            asRecord(candidate.result.diagnostics).publish_id ||
            "",
        ).trim();
        const status = await fetchTiktokPublishStatus(token, publishId);
        await persistStatus(candidate.row, candidate.publicationId, status);
        if (status.complete) completed += 1;
        else if (status.failed) failed += 1;
        else pending += 1;
      } catch (watchError) {
        errors += 1;
        console.warn("[tiktok-publication-watcher] status refresh failed", {
          publicationId: candidate.publicationId,
          message:
            watchError instanceof Error
              ? watchError.message
              : String(watchError || ""),
        });
      }
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(WATCHER_CONCURRENCY, candidates.length) },
      () => processNext(),
    ),
  );

  return {
    scanned: candidates.length,
    completed,
    failed,
    pending,
    errors,
  };
}
