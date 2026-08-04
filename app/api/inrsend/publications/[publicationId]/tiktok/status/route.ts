import { NextResponse } from "next/server";

import { encryptToken, tryDecryptToken } from "@/lib/oauthCrypto";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { refreshTiktokAccessToken } from "@/lib/tiktokOAuth";
import { fetchTiktokPublishStatus, getTiktokUserFacingError } from "@/lib/tiktokPublish";
import { asRecord, asString } from "@/lib/tsSafe";

export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type AppEventRow = {
  id: string | number;
  payload?: unknown;
};

const TIKTOK_LOCAL_CANCEL_MESSAGE =
  "Publication annulée dans iNrSend. Le suivi automatique est arrêté. Une tentative déjà acceptée par TikTok ne peut pas être interrompue à distance.";

function isTiktokCancelledResult(resultLike: unknown) {
  const result = asRecord(resultLike);
  const status = String(result.tiktok_status || result.status || "").toUpperCase();
  return result.cancelled === true || status === "CANCELLED" || status === "CANCELED";
}

function buildCancelledEventState(payloadLike: unknown) {
  const payload = asRecord(payloadLike);
  const results = asRecord(payload.results);
  const current = asRecord(results.tiktok);
  const diagnostics = asRecord(current.diagnostics);
  const message = isTiktokCancelledResult(current)
    ? String(current.tiktok_status_message || TIKTOK_LOCAL_CANCEL_MESSAGE)
    : TIKTOK_LOCAL_CANCEL_MESSAGE;
  const cancelledAt = String(
    current.tiktok_cancelled_at ||
      current.cancelled_at ||
      diagnostics.cancelled_at ||
      new Date().toISOString(),
  );
  const nextResult: JsonRecord = {
    ...current,
    status: "cancelled",
    cancelled: true,
    cancelled_at: cancelledAt,
    error: null,
    warning: false,
    warning_message: null,
    tiktok_status: "CANCELLED",
    tiktok_status_label: "Annulé",
    tiktok_status_message: message,
    tiktok_cancelled_at: cancelledAt,
    tiktok_status_fetch_failed: false,
    tiktok_stalled: false,
    diagnostics: {
      ...diagnostics,
      cancelled: true,
      cancelled_at: cancelledAt,
    },
  };
  const nextPayload: JsonRecord = {
    ...payload,
    results: {
      ...results,
      tiktok: nextResult,
    },
  };
  return { nextPayload, nextResult };
}

async function getTiktokDeliveryStatus(userId: string, publicationId: string) {
  const { data, error } = await supabaseAdmin
    .from("publication_deliveries")
    .select("status")
    .eq("user_id", userId)
    .eq("publication_id", publicationId)
    .eq("channel", "tiktok")
    .maybeSingle();

  if (error) throw error;
  return String(data?.status || "").toLowerCase();
}

async function ensureCancelledEventState({
  userId,
  event,
}: {
  userId: string;
  event: AppEventRow | null;
}) {
  const state = buildCancelledEventState(event?.payload);
  if (event?.id) {
    const { error } = await supabaseAdmin
      .from("app_events")
      .update({ payload: state.nextPayload })
      .eq("id", event.id)
      .eq("user_id", userId);
    if (error) throw error;
  }
  return {
    ...state,
    message: String(state.nextResult.tiktok_status_message || TIKTOK_LOCAL_CANCEL_MESSAGE),
    stalled: false,
    cancelled: true,
  };
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
    .select("status,resource_id,resource_label,display_name,access_token_enc,refresh_token_enc,scopes,meta,expires_at")
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

async function getTiktokAccessToken(userId: string, rowLike: unknown) {
  const row = asRecord(rowLike);
  let accessToken = tryDecryptToken(String(row.access_token_enc || "")) || "";
  const refreshToken = tryDecryptToken(String(row.refresh_token_enc || "")) || "";

  if (accessToken && !isExpired(row.expires_at, 120)) return accessToken;
  if (!refreshToken) return accessToken;

  const refreshed = await refreshTiktokAccessToken(refreshToken);
  const nextAccessToken = (asString(refreshed.access_token) || "").trim();
  const nextRefreshToken = (asString(refreshed.refresh_token) || "").trim() || refreshToken;
  const expiresIn = Number(refreshed.expires_in || 0);
  const refreshExpiresIn = Number(refreshed.refresh_expires_in || 0);
  const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : null;
  const nextMeta = {
    ...asRecord(row.meta),
    refresh_expires_at: Number.isFinite(refreshExpiresIn) && refreshExpiresIn > 0
      ? new Date(Date.now() + refreshExpiresIn * 1000).toISOString()
      : asRecord(row.meta).refresh_expires_at || null,
    tiktok_token_refreshed_at: new Date().toISOString(),
  };

  if (nextAccessToken) {
    await supabaseAdmin
      .from("integrations")
      .update({
        access_token_enc: encryptToken(nextAccessToken),
        refresh_token_enc: nextRefreshToken ? encryptToken(nextRefreshToken) : row.refresh_token_enc || null,
        expires_at: expiresAt || row.expires_at || null,
        meta: nextMeta,
      })
      .eq("user_id", userId)
      .eq("provider", "tiktok")
      .eq("source", "tiktok")
      .eq("product", "tiktok");
    accessToken = nextAccessToken;
  }

  return accessToken;
}

function tiktokStatusLabel(
  status: string | null | undefined,
  statusFetchFailed = false,
  stalled = false,
) {
  if (statusFetchFailed) return "Vérification impossible";
  if (stalled) return "Traitement prolongé";
  const value = String(status || "").toUpperCase();
  if (value === "PUBLISH_COMPLETE" || value === "DONE" || value === "SUCCESS") return "Publié";
  if (value === "FAILED" || value === "PUBLISH_FAILED" || value === "ERROR") return "Échec";
  if (value === "PROCESSING_UPLOAD") return "Upload TikTok en cours";
  if (value === "PROCESSING_DOWNLOAD") return "Téléchargement TikTok en cours";
  if (value.includes("PROCESS")) return "En traitement";
  return value || "En traitement";
}

function formatBytes(value: number | null | undefined) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${Math.round(bytes)} octets`;
}

function tiktokStatusMessage(
  status: Awaited<ReturnType<typeof fetchTiktokPublishStatus>>,
  stalled = false,
) {
  if (status.statusFetchFailed) {
    return getTiktokUserFacingError(status.failReason || status.providerErrorCode || "tiktok_status_fetch_failed");
  }
  if (status.failed) {
    return getTiktokUserFacingError(status.failReason || status.status || "tiktok_publish_failed");
  }
  if (status.complete) {
    return "TikTok confirme que la publication est terminée. Si la visibilité est privée, elle peut apparaître uniquement sur le compte connecté.";
  }
  if (stalled) {
    return "TikTok conserve la publication en traitement sans progression récente. iNrSend continue le suivi ; vérifiez le compte avant toute relance pour éviter un doublon.";
  }
  const uploaded = formatBytes(status.uploadedBytes);
  if (String(status.status || "").toUpperCase() === "PROCESSING_UPLOAD" && uploaded) {
    return `TikTok a reçu ${uploaded} et traite encore la vidéo. iNrSend vérifiera automatiquement la suite.`;
  }
  return "TikTok traite encore la publication. iNrSend vérifiera automatiquement son résultat.";
}

function dateMs(value: unknown) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : null;
}

async function loadAppEvent(userId: string, publicationId: string) {
  const { data, error } = await supabaseAdmin
    .from("app_events")
    .select("id,payload")
    .eq("user_id", userId)
    .eq("module", "booster")
    .eq("type", "publish")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return ((data || []) as AppEventRow[]).find((row) => String(asRecord(row.payload).publication_id || "") === publicationId) || null;
}

async function persistTiktokStatus({
  userId,
  publicationId,
  publishId,
  status,
}: {
  userId: string;
  publicationId: string;
  publishId: string;
  status: Awaited<ReturnType<typeof fetchTiktokPublishStatus>>;
}) {
  const event = await loadAppEvent(userId, publicationId);
  const payload = asRecord(event?.payload);
  const results = asRecord(payload.results);
  const current = asRecord(results.tiktok);
  if (isTiktokCancelledResult(current)) {
    return ensureCancelledEventState({ userId, event });
  }
  const diagnostics = asRecord(current.diagnostics);
  const nowIso = new Date().toISOString();
  const previousStatus = String(current.tiktok_status || asRecord(diagnostics.status).status || "").toUpperCase();
  const previousUploadedBytes = Number(current.tiktok_uploaded_bytes ?? asRecord(diagnostics.status).uploadedBytes ?? -1);
  const previousDownloadedBytes = Number(current.tiktok_downloaded_bytes ?? asRecord(diagnostics.status).downloadedBytes ?? -1);
  const nextUploadedBytes = status.uploadedBytes ?? null;
  const nextDownloadedBytes = status.downloadedBytes ?? null;
  const progressChanged =
    Boolean(status.status && String(status.status).toUpperCase() !== previousStatus) ||
    (nextUploadedBytes !== null && nextUploadedBytes !== previousUploadedBytes) ||
    (nextDownloadedBytes !== null && nextDownloadedBytes !== previousDownloadedBytes);
  const submittedAt = String(current.tiktok_submitted_at || diagnostics.submitted_at || nowIso);
  const previousProgressAt = String(current.tiktok_status_progress_at || diagnostics.status_progress_at || submittedAt);
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
  const message = tiktokStatusMessage(status, stalled);
  const nextResult: JsonRecord = {
    ...current,
    ok: status.complete ? true : status.failed ? false : current.ok !== false,
    external_id: publishId,
    share_url: status.shareUrl || current.share_url || null,
    external_url: status.shareUrl || current.share_url || current.external_url || current.profile_url || null,
    tiktok_status: status.status || current.tiktok_status || null,
    tiktok_status_label: tiktokStatusLabel(status.status, Boolean(status.statusFetchFailed), stalled),
    tiktok_status_message: message,
    tiktok_status_checked_at: nowIso,
    tiktok_submitted_at: submittedAt,
    tiktok_status_progress_at: progressAt,
    tiktok_status_fetch_failed: Boolean(status.statusFetchFailed),
    tiktok_status_fetch_error: status.statusFetchFailed ? status.failReason || status.providerErrorCode || null : null,
    tiktok_fail_reason: status.failed ? status.failReason || null : null,
    tiktok_provider_error_code: status.providerErrorCode || null,
    tiktok_uploaded_bytes: nextUploadedBytes,
    tiktok_downloaded_bytes: nextDownloadedBytes,
    tiktok_public_post_ids: status.publiclyAvailablePostIds?.length
      ? status.publiclyAvailablePostIds
      : current.tiktok_public_post_ids || [],
    tiktok_stalled: stalled,
    warning: Boolean(status.pending || status.statusFetchFailed),
    warning_message: status.pending || status.statusFetchFailed ? message : null,
    error: status.failed ? message : null,
    diagnostics: {
      ...diagnostics,
      publish_id: publishId,
      status,
      share_url: status.shareUrl || diagnostics.share_url || null,
      submitted_at: submittedAt,
      status_progress_at: progressAt,
      status_checked_at: nowIso,
      stalled,
    },
  };

  const nextPayload: JsonRecord = {
    ...payload,
    results: {
      ...results,
      tiktok: nextResult,
    },
  };

  if (event?.id) {
    await supabaseAdmin.from("app_events").update({ payload: nextPayload }).eq("id", event.id).eq("user_id", userId);
  }

  const { error: deliveryUpdateError } = await supabaseAdmin
    .from("publication_deliveries")
    .update({
      status: status.failed ? "failed" : status.complete ? "delivered" : "processing",
      error: status.failed ? message : null,
    })
    .eq("user_id", userId)
    .eq("publication_id", publicationId)
    .eq("channel", "tiktok")
    .neq("status", "deleted");
  if (deliveryUpdateError) throw deliveryUpdateError;

  if (await getTiktokDeliveryStatus(userId, publicationId) === "deleted") {
    const latestEvent = await loadAppEvent(userId, publicationId);
    return ensureCancelledEventState({ userId, event: latestEvent });
  }

  return { nextPayload, nextResult, message, stalled, cancelled: false };
}

async function handler(_request: Request, context: { params: Promise<{ publicationId: string }> }) {
  try {
    const { user, errorResponse, activeUserId } = await requireUser();
    if (errorResponse) return errorResponse;

    const params = await context.params;
    const publicationId = String(params.publicationId || "").trim();
    if (!publicationId) return jsonUserFacingError("Paramètres invalides.", { status: 400, code: "invalid_input" });

    const { data: delivery, error: deliveryError } = await supabaseAdmin
      .from("publication_deliveries")
      .select("status,error,channel")
      .eq("user_id", activeUserId)
      .eq("publication_id", publicationId)
      .eq("channel", "tiktok")
      .maybeSingle();

    if (deliveryError) throw deliveryError;

    const event = await loadAppEvent(activeUserId, publicationId);
    const eventPayload = asRecord(event?.payload);
    const eventResult = asRecord(asRecord(eventPayload.results).tiktok);
    const diagnostics = asRecord(eventResult.diagnostics);
    const publishId = String(eventResult.external_id || diagnostics.publish_id || "").trim();

    if (isTiktokCancelledResult(eventResult) || String(delivery?.status || "").toLowerCase() === "deleted") {
      const cancelledState = await ensureCancelledEventState({ userId: activeUserId, event });
      return NextResponse.json({
        ok: true,
        cancelled: true,
        publication_id: publicationId,
        channel: "tiktok",
        publish_id: publishId || null,
        status: {
          ok: true,
          status: "CANCELLED",
          pending: false,
          complete: false,
          failed: false,
        },
        status_label: "Annulé",
        message: cancelledState.message,
        result: cancelledState.nextResult,
        payload: cancelledState.nextPayload,
      });
    }

    if (!publishId) {
      return jsonUserFacingError("Identifiant TikTok introuvable pour cette publication.", { status: 404, code: "missing_tiktok_publish_id" });
    }

    const integration = await getLatestTiktokIntegration(activeUserId);
    const accessToken = await getTiktokAccessToken(activeUserId, integration);
    if (!accessToken) {
      return jsonUserFacingError("Connexion TikTok expirée. Reconnecte TikTok dans Canaux.", { status: 401, code: "tiktok_reconnect_required" });
    }

    const status = await fetchTiktokPublishStatus(accessToken, publishId);
    const persisted = await persistTiktokStatus({ userId: activeUserId, publicationId, publishId, status });

    return NextResponse.json({
      ok: status.ok,
      publication_id: publicationId,
      channel: "tiktok",
      publish_id: publishId,
      status,
      status_label: persisted.cancelled
        ? "Annulé"
        : tiktokStatusLabel(status.status, Boolean(status.statusFetchFailed), persisted.stalled),
      message: persisted.message,
      result: persisted.nextResult,
      payload: persisted.nextPayload,
      cancelled: persisted.cancelled,
    });
  } catch (e: unknown) {
    return jsonUserFacingError(e, {
      status: 500,
      fallback: "Impossible de vérifier le statut TikTok pour le moment.",
      code: "tiktok_status_check_failed",
    });
  }
}

export const GET = handler;
export const POST = handler;
