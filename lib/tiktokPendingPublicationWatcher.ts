import "server-only";

import { encryptToken, tryDecryptToken } from "@/lib/oauthCrypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { refreshTiktokAccessToken } from "@/lib/tiktokOAuth";
import {
  fetchTiktokPublishStatus,
  getTiktokUserFacingError,
  type TiktokPublishStatus,
} from "@/lib/tiktokPublish";
import { asRecord, asString } from "@/lib/tsSafe";

type JsonRecord = Record<string, unknown>;

type PendingDeliveryRow = {
  user_id: string;
  publication_id: string;
  status?: string | null;
  created_at?: string | null;
};

type AppEventRow = {
  id: string | number;
  user_id: string;
  created_at?: string | null;
  payload?: unknown;
};

type WatcherOptions = {
  limit?: number;
  minCheckIntervalMs?: number;
};

const TERMINAL_SUCCESS = new Set(["PUBLISH_COMPLETE", "DONE", "SUCCESS"]);
const TERMINAL_FAILURE = new Set([
  "FAILED",
  "PUBLISH_FAILED",
  "ERROR",
  "PROCESSING_TIMEOUT",
]);
const TERMINAL_CANCELLED = new Set(["CANCELLED", "CANCELED"]);
const TIKTOK_PENDING_TIMEOUT_MS = 60 * 60 * 1000;

function clampLimit(value: unknown, fallback = 20) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

function dateMs(value: unknown) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function statusValue(resultLike: unknown) {
  const result = asRecord(resultLike);
  const diagnostics = asRecord(result.diagnostics);
  const diagnosticsStatus = asRecord(diagnostics.status);
  return String(
    result.tiktok_status ||
      result.status ||
      diagnosticsStatus.status ||
      "",
  )
    .trim()
    .toUpperCase();
}

function publishIdValue(resultLike: unknown) {
  const result = asRecord(resultLike);
  const diagnostics = asRecord(result.diagnostics);
  return String(
    result.external_id || result.publish_id || diagnostics.publish_id || "",
  ).trim();
}

function isCancelledResult(resultLike: unknown) {
  const result = asRecord(resultLike);
  return result.cancelled === true || TERMINAL_CANCELLED.has(statusValue(result));
}

function isTerminalResult(resultLike: unknown) {
  const status = statusValue(resultLike);
  return (
    TERMINAL_SUCCESS.has(status) ||
    TERMINAL_FAILURE.has(status) ||
    TERMINAL_CANCELLED.has(status)
  );
}

function isExpired(expiresAt: unknown, skewSeconds = 120) {
  const raw = asString(expiresAt) || "";
  if (!raw) return false;
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return false;
  return timestamp <= Date.now() + skewSeconds * 1000;
}

async function getLatestTiktokIntegration(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("integrations")
    .select(
      "status,resource_id,resource_label,display_name,access_token_enc,refresh_token_enc,scopes,meta,expires_at",
    )
    .eq("user_id", userId)
    .eq("provider", "tiktok")
    .eq("source", "tiktok")
    .eq("product", "tiktok")
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  return Array.isArray(data) ? data[0] ?? null : null;
}

async function getTiktokAccessToken(userId: string) {
  const row = asRecord(await getLatestTiktokIntegration(userId));
  let accessToken = tryDecryptToken(String(row.access_token_enc || "")) || "";
  const refreshToken = tryDecryptToken(String(row.refresh_token_enc || "")) || "";

  if (accessToken && !isExpired(row.expires_at, 120)) return accessToken;
  if (!refreshToken) return accessToken;

  const refreshed = await refreshTiktokAccessToken(refreshToken);
  const nextAccessToken = (asString(refreshed.access_token) || "").trim();
  const nextRefreshToken =
    (asString(refreshed.refresh_token) || "").trim() || refreshToken;
  const expiresIn = Number(refreshed.expires_in || 0);
  const refreshExpiresIn = Number(refreshed.refresh_expires_in || 0);
  const expiresAt =
    Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;
  const nextMeta = {
    ...asRecord(row.meta),
    refresh_expires_at:
      Number.isFinite(refreshExpiresIn) && refreshExpiresIn > 0
        ? new Date(Date.now() + refreshExpiresIn * 1000).toISOString()
        : asRecord(row.meta).refresh_expires_at || null,
    tiktok_token_refreshed_at: new Date().toISOString(),
  };

  if (nextAccessToken) {
    const { error } = await supabaseAdmin
      .from("integrations")
      .update({
        access_token_enc: encryptToken(nextAccessToken),
        refresh_token_enc: nextRefreshToken
          ? encryptToken(nextRefreshToken)
          : row.refresh_token_enc || null,
        expires_at: expiresAt || row.expires_at || null,
        meta: nextMeta,
      })
      .eq("user_id", userId)
      .eq("provider", "tiktok")
      .eq("source", "tiktok")
      .eq("product", "tiktok");
    if (error) throw error;
    accessToken = nextAccessToken;
  }

  return accessToken;
}

function formatBytes(value: number | null | undefined) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${Math.round(bytes)} octets`;
}

function statusLabel(
  status: string | null | undefined,
  statusFetchFailed = false,
  stalled = false,
) {
  if (String(status || "").toUpperCase() === "PROCESSING_TIMEOUT")
    return "Délai dépassé";
  if (statusFetchFailed) return "Vérification impossible";
  if (stalled) return "Traitement prolongé";
  const value = String(status || "").toUpperCase();
  if (TERMINAL_SUCCESS.has(value)) return "Publié";
  if (TERMINAL_FAILURE.has(value)) return "Échec";
  if (value === "PROCESSING_UPLOAD") return "Upload TikTok en cours";
  if (value === "PROCESSING_DOWNLOAD") return "Téléchargement TikTok en cours";
  if (value.includes("PROCESS")) return "En traitement";
  return value || "En traitement";
}

function statusMessage(
  status: TiktokPublishStatus,
  stalled = false,
  timedOut = false,
) {
  if (timedOut) {
    return "TikTok n’a pas finalisé la publication après 60 minutes. Le suivi automatique est arrêté sans nouvelle republication pour éviter un doublon.";
  }
  if (status.statusFetchFailed) {
    return getTiktokUserFacingError(
      status.failReason ||
        status.providerErrorCode ||
        "tiktok_status_fetch_failed",
    );
  }
  if (status.failed) {
    return getTiktokUserFacingError(
      status.failReason || status.status || "tiktok_publish_failed",
    );
  }
  if (status.complete) {
    return "TikTok confirme que la publication est terminée. Si la visibilité est privée, elle peut apparaître uniquement sur le compte connecté.";
  }
  if (stalled) {
    return "TikTok conserve la publication en traitement sans progression récente. iNrSend continue le suivi ; vérifiez le compte avant toute relance pour éviter un doublon.";
  }
  const uploaded = formatBytes(status.uploadedBytes);
  if (
    String(status.status || "").toUpperCase() === "PROCESSING_UPLOAD" &&
    uploaded
  ) {
    return `TikTok a reçu ${uploaded} et traite encore la vidéo. iNrSend vérifiera automatiquement la suite.`;
  }
  return "TikTok traite encore la publication. iNrSend vérifiera automatiquement son résultat.";
}

async function loadEventsForUser(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("app_events")
    .select("id,user_id,created_at,payload")
    .eq("user_id", userId)
    .eq("module", "booster")
    .eq("type", "publish")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return (data || []) as AppEventRow[];
}

async function persistStatus({
  event,
  publicationId,
  publishId,
  status,
}: {
  event: AppEventRow;
  publicationId: string;
  publishId: string;
  status: TiktokPublishStatus;
}) {
  const payload = asRecord(event.payload);
  const results = asRecord(payload.results);
  const current = asRecord(results.tiktok);
  if (isCancelledResult(current)) return { terminal: true, cancelled: true };

  const diagnostics = asRecord(current.diagnostics);
  const previousDiagnosticsStatus = asRecord(diagnostics.status);
  const nowIso = new Date().toISOString();
  const previousStatus = String(
    current.tiktok_status || previousDiagnosticsStatus.status || "",
  ).toUpperCase();
  const previousUploadedBytes = Number(
    current.tiktok_uploaded_bytes ??
      previousDiagnosticsStatus.uploadedBytes ??
      -1,
  );
  const previousDownloadedBytes = Number(
    current.tiktok_downloaded_bytes ??
      previousDiagnosticsStatus.downloadedBytes ??
      -1,
  );
  const nextUploadedBytes = status.uploadedBytes ?? null;
  const nextDownloadedBytes = status.downloadedBytes ?? null;
  const progressChanged =
    Boolean(status.status && String(status.status).toUpperCase() !== previousStatus) ||
    (nextUploadedBytes !== null && nextUploadedBytes !== previousUploadedBytes) ||
    (nextDownloadedBytes !== null &&
      nextDownloadedBytes !== previousDownloadedBytes);
  const submittedAt = String(
    current.tiktok_submitted_at || diagnostics.submitted_at || nowIso,
  );
  const previousProgressAt = String(
    current.tiktok_status_progress_at ||
      diagnostics.status_progress_at ||
      submittedAt,
  );
  const progressAt = progressChanged ? nowIso : previousProgressAt;
  const submittedAtMs = dateMs(submittedAt);
  const progressAtMs = dateMs(progressAt);
  const nowMs = Date.now();
  const stalled = Boolean(
    status.pending &&
      !status.statusFetchFailed &&
      submittedAtMs !== null &&
      progressAtMs !== null &&
      nowMs - submittedAtMs >= 15 * 60 * 1000 &&
      nowMs - progressAtMs >= 10 * 60 * 1000,
  );
  const timedOut = Boolean(
    status.pending &&
      submittedAtMs !== null &&
      nowMs - submittedAtMs >= TIKTOK_PENDING_TIMEOUT_MS,
  );
  const currentTiktokStatus =
    typeof current.tiktok_status === "string"
      ? current.tiktok_status
      : null;
  const effectiveStatus: string | null = timedOut
    ? "PROCESSING_TIMEOUT"
    : status.status || currentTiktokStatus;
  const effectiveFailed = Boolean(status.failed || timedOut);
  const effectivePending = Boolean(status.pending && !timedOut);
  const checkCount =
    Math.max(
      0,
      Number(
        current.tiktok_status_check_count ??
          diagnostics.status_check_count ??
          0,
      ) || 0,
    ) + 1;
  const processingDurationSeconds = submittedAtMs === null
    ? null
    : Math.max(0, Math.floor((nowMs - submittedAtMs) / 1000));
  const message = statusMessage(status, stalled, timedOut);

  const nextResult: JsonRecord = {
    ...current,
    ok: status.complete ? true : effectiveFailed ? false : current.ok !== false,
    external_id: publishId,
    share_url: status.shareUrl || current.share_url || null,
    external_url:
      status.shareUrl ||
      current.share_url ||
      current.external_url ||
      current.profile_url ||
      null,
    tiktok_status: effectiveStatus,
    tiktok_status_label: statusLabel(
      effectiveStatus,
      Boolean(status.statusFetchFailed),
      stalled,
    ),
    tiktok_status_message: message,
    tiktok_status_checked_at: nowIso,
    tiktok_submitted_at: submittedAt,
    tiktok_status_progress_at: progressAt,
    tiktok_status_fetch_failed: Boolean(status.statusFetchFailed),
    tiktok_status_fetch_error: status.statusFetchFailed
      ? status.failReason || status.providerErrorCode || null
      : null,
    tiktok_fail_reason: effectiveFailed
      ? timedOut
        ? "processing_timeout"
        : status.failReason || null
      : null,
    tiktok_provider_error_code: timedOut
      ? "processing_timeout"
      : status.providerErrorCode || null,
    tiktok_uploaded_bytes: nextUploadedBytes,
    tiktok_downloaded_bytes: nextDownloadedBytes,
    tiktok_public_post_ids: status.publiclyAvailablePostIds?.length
      ? status.publiclyAvailablePostIds
      : current.tiktok_public_post_ids || [],
    tiktok_stalled: stalled,
    tiktok_timed_out: timedOut,
    tiktok_status_check_count: checkCount,
    tiktok_processing_duration_seconds: processingDurationSeconds,
    warning: Boolean(effectivePending || status.statusFetchFailed),
    warning_message:
      effectivePending || status.statusFetchFailed ? message : null,
    error: effectiveFailed ? message : null,
    diagnostics: {
      ...diagnostics,
      publish_id: publishId,
      status,
      share_url: status.shareUrl || diagnostics.share_url || null,
      submitted_at: submittedAt,
      status_progress_at: progressAt,
      status_checked_at: nowIso,
      stalled,
      timed_out: timedOut,
      status_check_count: checkCount,
      processing_duration_seconds: processingDurationSeconds,
      watcher: "vercel_cron",
    },
  };

  const nextPayload: JsonRecord = {
    ...payload,
    results: {
      ...results,
      tiktok: nextResult,
    },
  };

  const { error: eventUpdateError } = await supabaseAdmin
    .from("app_events")
    .update({ payload: nextPayload })
    .eq("id", event.id)
    .eq("user_id", event.user_id);
  if (eventUpdateError) throw eventUpdateError;

  const { error: deliveryUpdateError } = await supabaseAdmin
    .from("publication_deliveries")
    .update({
      status: effectiveFailed
        ? "failed"
        : status.complete
          ? "delivered"
          : "processing",
      error: effectiveFailed ? message : null,
    })
    .eq("user_id", event.user_id)
    .eq("publication_id", publicationId)
    .eq("channel", "tiktok")
    .eq("status", "processing");
  if (deliveryUpdateError) throw deliveryUpdateError;

  return {
    terminal: status.complete || effectiveFailed,
    complete: status.complete,
    failed: effectiveFailed,
    pending: effectivePending,
    status: effectiveStatus,
    stalled,
    timedOut,
  };
}

export async function syncPendingTiktokPublications(
  options: WatcherOptions = {},
) {
  const limit = clampLimit(options.limit, 20);
  const minCheckIntervalMs = Math.max(
    15_000,
    Number(options.minCheckIntervalMs || 45_000),
  );

  const scanLimit = Math.min(250, Math.max(limit, limit * 5));
  const { data: deliveriesData, error: deliveriesError } = await supabaseAdmin
    .from("publication_deliveries")
    .select("user_id,publication_id,status,created_at")
    .eq("channel", "tiktok")
    .eq("status", "processing")
    .order("created_at", { ascending: true })
    .limit(scanLimit);

  if (deliveriesError) throw deliveriesError;
  const deliveries = (deliveriesData || []) as PendingDeliveryRow[];
  if (!deliveries.length) {
    return {
      scanned: 0,
      checked: 0,
      completed: 0,
      failed: 0,
      pending: 0,
      skipped: 0,
      errors: [] as Array<Record<string, unknown>>,
    };
  }

  const deliveriesByUser = new Map<string, PendingDeliveryRow[]>();
  for (const delivery of deliveries) {
    const userId = String(delivery.user_id || "").trim();
    const publicationId = String(delivery.publication_id || "").trim();
    if (!userId || !publicationId) continue;
    const list = deliveriesByUser.get(userId) || [];
    list.push({ ...delivery, user_id: userId, publication_id: publicationId });
    deliveriesByUser.set(userId, list);
  }

  const tokenCache = new Map<string, Promise<string>>();
  const summary = {
    scanned: deliveries.length,
    checked: 0,
    completed: 0,
    failed: 0,
    pending: 0,
    skipped: 0,
    errors: [] as Array<Record<string, unknown>>,
  };

  for (const [userId, userDeliveries] of deliveriesByUser.entries()) {
    let events: AppEventRow[] = [];
    try {
      events = await loadEventsForUser(userId);
    } catch (error) {
      summary.errors.push({
        userId,
        stage: "load_events",
        error: error instanceof Error ? error.message : String(error || ""),
      });
      continue;
    }

    const eventsByPublication = new Map<string, AppEventRow>();
    for (const event of events) {
      const publicationId = String(
        asRecord(event.payload).publication_id || "",
      ).trim();
      if (publicationId && !eventsByPublication.has(publicationId)) {
        eventsByPublication.set(publicationId, event);
      }
    }

    const orderedUserDeliveries = [...userDeliveries].sort((left, right) => {
      const leftEvent = eventsByPublication.get(left.publication_id);
      const rightEvent = eventsByPublication.get(right.publication_id);
      const leftResult = asRecord(
        asRecord(asRecord(leftEvent?.payload).results).tiktok,
      );
      const rightResult = asRecord(
        asRecord(asRecord(rightEvent?.payload).results).tiktok,
      );
      const leftCheckedAt = dateMs(leftResult.tiktok_status_checked_at) ?? 0;
      const rightCheckedAt = dateMs(rightResult.tiktok_status_checked_at) ?? 0;
      return leftCheckedAt - rightCheckedAt;
    });

    for (const delivery of orderedUserDeliveries) {
      const publicationId = delivery.publication_id;
      const event = eventsByPublication.get(publicationId);
      if (!event) {
        const message =
          "Historique iNrSend introuvable pour la publication TikTok. Le suivi automatique est arrêté.";
        const { error: deliveryUpdateError } = await supabaseAdmin
          .from("publication_deliveries")
          .update({ status: "failed", error: message })
          .eq("user_id", userId)
          .eq("publication_id", publicationId)
          .eq("channel", "tiktok")
          .eq("status", "processing");
        if (deliveryUpdateError) {
          summary.errors.push({
            userId,
            publicationId,
            stage: "missing_event_delivery_update",
            error: deliveryUpdateError.message,
          });
        }
        summary.failed += 1;
        summary.errors.push({
          userId,
          publicationId,
          stage: "missing_event",
          error: message,
        });
        continue;
      }

      const result = asRecord(asRecord(asRecord(event.payload).results).tiktok);
      if (isTerminalResult(result)) {
        const currentStatus = statusValue(result);
        const deliveryStatus = TERMINAL_SUCCESS.has(currentStatus)
          ? "delivered"
          : TERMINAL_FAILURE.has(currentStatus)
            ? "failed"
            : "deleted";
        await supabaseAdmin
          .from("publication_deliveries")
          .update({ status: deliveryStatus })
          .eq("user_id", userId)
          .eq("publication_id", publicationId)
          .eq("channel", "tiktok")
          .eq("status", "processing");
        summary.skipped += 1;
        continue;
      }

      const checkedAt = dateMs(result.tiktok_status_checked_at);
      if (
        checkedAt !== null &&
        Date.now() - checkedAt < minCheckIntervalMs
      ) {
        summary.skipped += 1;
        continue;
      }

      if (summary.checked >= limit) {
        summary.skipped += 1;
        continue;
      }

      const publishId = publishIdValue(result);
      if (!publishId) {
        const message =
          "TikTok n'a pas renvoyé d'identifiant de suivi. Relancez uniquement ce canal depuis iNrSend.";
        const nowIso = new Date().toISOString();
        const payload = asRecord(event.payload);
        const results = asRecord(payload.results);
        const diagnostics = asRecord(result.diagnostics);
        const nextResult: JsonRecord = {
          ...result,
          ok: false,
          error: message,
          warning: false,
          warning_message: null,
          tiktok_status: "MISSING_PUBLISH_ID",
          tiktok_status_label: "Échec",
          tiktok_status_message: message,
          tiktok_status_checked_at: nowIso,
          tiktok_fail_reason: "missing_publish_id",
          tiktok_provider_error_code: "missing_publish_id",
          diagnostics: {
            ...diagnostics,
            status_checked_at: nowIso,
            watcher: "vercel_cron",
            code: "missing_publish_id",
          },
        };
        const { error: eventUpdateError } = await supabaseAdmin
          .from("app_events")
          .update({
            payload: {
              ...payload,
              results: {
                ...results,
                tiktok: nextResult,
              },
            },
          })
          .eq("id", event.id)
          .eq("user_id", event.user_id);
        if (eventUpdateError) {
          summary.errors.push({
            userId,
            publicationId,
            stage: "missing_publish_id_event_update",
            error: eventUpdateError.message,
          });
        }
        await supabaseAdmin
          .from("publication_deliveries")
          .update({ status: "failed", error: message })
          .eq("user_id", userId)
          .eq("publication_id", publicationId)
          .eq("channel", "tiktok")
          .eq("status", "processing");
        summary.failed += 1;
        summary.errors.push({
          userId,
          publicationId,
          stage: "missing_publish_id",
          error: message,
        });
        continue;
      }

      try {
        let accessTokenPromise = tokenCache.get(userId);
        if (!accessTokenPromise) {
          accessTokenPromise = getTiktokAccessToken(userId);
          tokenCache.set(userId, accessTokenPromise);
        }
        const accessToken = await accessTokenPromise;
        if (!accessToken) {
          throw new Error(
            "Connexion TikTok expirée. Reconnectez TikTok dans Canaux.",
          );
        }

        const status = await fetchTiktokPublishStatus(accessToken, publishId);
        const persisted = await persistStatus({
          event,
          publicationId,
          publishId,
          status,
        });
        summary.checked += 1;
        if (persisted.complete) summary.completed += 1;
        else if (persisted.failed) summary.failed += 1;
        else summary.pending += 1;

        console.info("[tiktok-watcher] status synchronized", {
          publicationId,
          publishIdSuffix: publishId.slice(-12),
          status: status.status || null,
          complete: status.complete,
          failed: status.failed,
          pending: status.pending,
          statusFetchFailed: Boolean(status.statusFetchFailed),
        });
      } catch (error) {
        const message = getTiktokUserFacingError(
          error instanceof Error ? error.message : String(error || ""),
        );
        try {
          await persistStatus({
            event,
            publicationId,
            publishId,
            status: {
              ok: false,
              status: "STATUS_FETCH_ERROR",
              failReason: message,
              complete: false,
              failed: false,
              pending: true,
              statusFetchFailed: true,
              retryable: true,
              providerErrorCode: "status_sync_error",
            },
          });
        } catch (persistError) {
          console.error("[tiktok-watcher] status error persistence failed", {
            userId,
            publicationId,
            publishIdSuffix: publishId.slice(-12),
            error: persistError,
          });
        }
        summary.errors.push({
          userId,
          publicationId,
          publishIdSuffix: publishId.slice(-12),
          stage: "status_sync",
          error: message,
        });
        console.error("[tiktok-watcher] status synchronization failed", {
          userId,
          publicationId,
          publishIdSuffix: publishId.slice(-12),
          error,
        });
      }
    }
  }

  return summary;
}
