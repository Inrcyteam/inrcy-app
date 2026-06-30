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

function tiktokStatusLabel(status: string | null | undefined) {
  const value = String(status || "").toUpperCase();
  if (value === "PUBLISH_COMPLETE" || value === "DONE" || value === "SUCCESS") return "Publié";
  if (value === "FAILED" || value === "PUBLISH_FAILED" || value === "ERROR") return "Échec";
  if (value.includes("UPLOAD")) return "Upload en cours";
  if (value.includes("DOWNLOAD")) return "Traitement TikTok";
  if (value.includes("PROCESS")) return "En traitement";
  return value || "En traitement";
}

function tiktokStatusMessage(status: Awaited<ReturnType<typeof fetchTiktokPublishStatus>>) {
  if (status.failed) {
    return getTiktokUserFacingError(status.failReason || status.status || "tiktok_publish_failed");
  }
  if (status.complete) {
    return "TikTok confirme que la publication est terminée. Si la visibilité est privée, elle peut apparaître uniquement sur le compte connecté.";
  }
  return "TikTok traite encore la publication. Relancez la vérification dans quelques instants.";
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
  const diagnostics = asRecord(current.diagnostics);
  const message = tiktokStatusMessage(status);
  const nextResult: JsonRecord = {
    ...current,
    ok: !status.failed,
    external_id: publishId,
    share_url: status.shareUrl || current.share_url || null,
    external_url: status.shareUrl || current.share_url || current.external_url || current.profile_url || null,
    tiktok_status: status.status || current.tiktok_status || null,
    tiktok_status_label: tiktokStatusLabel(status.status),
    tiktok_status_checked_at: new Date().toISOString(),
    warning: status.pending,
    warning_message: status.pending ? message : null,
    error: status.failed ? message : null,
    diagnostics: {
      ...diagnostics,
      publish_id: publishId,
      status,
      share_url: status.shareUrl || diagnostics.share_url || null,
      status_checked_at: new Date().toISOString(),
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
    await supabaseAdmin.from("app_events").update({ payload: nextPayload }).eq("id", event.id);
  }

  await supabaseAdmin
    .from("publication_deliveries")
    .update({
      status: status.failed ? "failed" : status.complete ? "delivered" : "processing",
      error: status.failed ? message : null,
    })
    .eq("user_id", userId)
    .eq("publication_id", publicationId)
    .eq("channel", "tiktok");

  return { nextPayload, nextResult, message };
}

async function handler(_request: Request, context: { params: Promise<{ publicationId: string }> }) {
  try {
    const { user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;

    const params = await context.params;
    const publicationId = String(params.publicationId || "").trim();
    if (!publicationId) return jsonUserFacingError("Paramètres invalides.", { status: 400, code: "invalid_input" });

    const { data: delivery, error: deliveryError } = await supabaseAdmin
      .from("publication_deliveries")
      .select("status,error,channel")
      .eq("user_id", user.id)
      .eq("publication_id", publicationId)
      .eq("channel", "tiktok")
      .maybeSingle();

    if (deliveryError) throw deliveryError;

    const event = await loadAppEvent(user.id, publicationId);
    const eventPayload = asRecord(event?.payload);
    const eventResult = asRecord(asRecord(eventPayload.results).tiktok);
    const diagnostics = asRecord(eventResult.diagnostics);
    const publishId = String(eventResult.external_id || diagnostics.publish_id || "").trim();

    if (!publishId) {
      return jsonUserFacingError("Identifiant TikTok introuvable pour cette publication.", { status: 404, code: "missing_tiktok_publish_id" });
    }

    const integration = await getLatestTiktokIntegration(user.id);
    const accessToken = await getTiktokAccessToken(user.id, integration);
    if (!accessToken) {
      return jsonUserFacingError("Connexion TikTok expirée. Reconnecte TikTok dans Canaux.", { status: 401, code: "tiktok_reconnect_required" });
    }

    const status = await fetchTiktokPublishStatus(accessToken, publishId);
    const persisted = await persistTiktokStatus({ userId: user.id, publicationId, publishId, status });

    return NextResponse.json({
      ok: !status.failed,
      publication_id: publicationId,
      channel: "tiktok",
      publish_id: publishId,
      status,
      status_label: tiktokStatusLabel(status.status),
      message: persisted.message,
      result: persisted.nextResult,
      payload: persisted.nextPayload,
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
