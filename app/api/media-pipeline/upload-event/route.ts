import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { enforceRateLimit } from "@/lib/rateLimit";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { clampUniversalUploadProgress } from "@/lib/mediaUploadPolicy";
import {
  enqueueImageNormalization,
  type ImageNormalizationEnqueueResult,
} from "@/lib/mediaImageNormalizationQueue";
import {
  enqueueVideoNormalization,
  type VideoNormalizationEnqueueResult,
} from "@/lib/mediaVideoNormalizationQueue";
import { refreshPublicationWorkspaceStatusesForMedia } from "@/lib/mediaWorkspaceServer";

export const runtime = "nodejs";

type UploadEvent = "uploading" | "uploaded" | "failed" | "removed";

function cleanText(value: unknown, fallback = "", max = 2_000) {
  return String(value ?? fallback).trim().slice(0, max);
}

function cleanMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).slice(0, 80),
  );
}

function isUploadEvent(value: unknown): value is UploadEvent {
  return ["uploading", "uploaded", "failed", "removed"].includes(
    String(value || ""),
  );
}

export async function POST(request: Request) {
  try {
    const { errorResponse, activeUserId } = await requireUser();
    if (errorResponse) return errorResponse;

    const limited = await enforceRateLimit({
      name: "media_pipeline_upload_event",
      identifier: activeUserId,
      limit: 240,
      fallbackLimit: 240,
      window: "2 m",
      failClosed: false,
    });
    if (limited) return limited;

    const body = await request.json().catch(() => null);
    const mediaId = cleanText(body?.mediaId, "", 80);
    const event = body?.event;
    if (!mediaId || !isUploadEvent(event)) {
      return NextResponse.json(
        { ok: false, error: "Événement d’upload invalide." },
        { status: 400 },
      );
    }

    const current = await supabaseAdmin
      .from("pro_media_library")
      .select("id,user_id,media_type,media_metadata")
      .eq("id", mediaId)
      .eq("user_id", activeUserId)
      .maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) {
      return NextResponse.json(
        { ok: false, error: "Média introuvable pour cet établissement." },
        { status: 404 },
      );
    }

    const progress = clampUniversalUploadProgress(Number(body?.progress || 0));
    const now = new Date().toISOString();
    const metadata = {
      ...(current.data.media_metadata || {}),
      ...cleanMetadata(body?.metadata),
    };
    const patch: Record<string, unknown> = { media_metadata: metadata };

    if (event === "uploading") {
      patch.upload_status = "uploading";
      patch.upload_progress = Math.min(99, progress);
      patch.upload_started_at = now;
      patch.upload_error_code = null;
      patch.upload_error_message = null;
    } else if (event === "uploaded") {
      patch.upload_status = "uploaded";
      patch.upload_progress = 100;
      patch.uploaded_at = now;
      patch.upload_error_code = null;
      patch.upload_error_message = null;
      if (Number.isFinite(Number(body?.sizeBytes)) && Number(body.sizeBytes) > 0) {
        patch.size_bytes = Math.round(Number(body.sizeBytes));
      }
      const detectedMimeType = cleanText(body?.detectedMimeType, "", 120);
      if (detectedMimeType) patch.detected_mime_type = detectedMimeType;
    } else if (event === "failed") {
      patch.upload_status = "failed";
      patch.upload_progress = 0;
      patch.upload_error_code = "upload_failed";
      patch.upload_error_message = cleanText(
        body?.errorMessage,
        "Envoi du média interrompu.",
      );
    } else {
      patch.upload_status = "removed";
      patch.upload_progress = 0;
      patch.publication_status = "removed";
      patch.upload_error_code = "upload_cancelled";
      patch.upload_error_message = cleanText(
        body?.errorMessage,
        "Envoi du média annulé.",
      );
    }

    const updated = await supabaseAdmin
      .from("pro_media_library")
      .update(patch)
      .eq("id", mediaId)
      .eq("user_id", activeUserId)
      .select(
        "id,upload_status,upload_progress,uploaded_at,upload_error_code,upload_error_message",
      )
      .single();
    if (updated.error) throw updated.error;

    let imageNormalization: ImageNormalizationEnqueueResult | null = null;
    let videoNormalization: VideoNormalizationEnqueueResult | null = null;
    if (event === "uploaded" && current.data.media_type === "image") {
      const workspaceId = cleanText(
        current.data.media_metadata?.workspace_id,
        "",
        80,
      );
      try {
        imageNormalization = await enqueueImageNormalization({
          mediaId,
          accountId: activeUserId,
          workspaceId: workspaceId || null,
        });
      } catch (queueError) {
        console.error("[media-pipeline] image normalization enqueue failed", {
          mediaId,
          accountId: activeUserId,
          error: queueError,
        });
        imageNormalization = {
          enabled: true,
          queued: false,
          reason: "enqueue_failed",
        };
      }
    }

    if (event === "uploaded" && current.data.media_type === "video") {
      const workspaceId = cleanText(
        current.data.media_metadata?.workspace_id,
        "",
        80,
      );
      try {
        videoNormalization = await enqueueVideoNormalization({
          mediaId,
          accountId: activeUserId,
          workspaceId: workspaceId || null,
        });
      } catch (queueError) {
        console.error("[media-pipeline] video normalization enqueue failed", {
          mediaId,
          accountId: activeUserId,
          error: queueError,
        });
        videoNormalization = {
          enabled: true,
          queued: false,
          reason: "enqueue_failed",
        };
      }
    }

    await refreshPublicationWorkspaceStatusesForMedia({
      mediaId,
      accountId: activeUserId,
    });

    return NextResponse.json({
      ok: true,
      media: updated.data,
      imageNormalization,
      videoNormalization,
    });
  } catch (error) {
    console.error("[media-pipeline] upload event failed", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Impossible de mettre à jour l’upload.",
      },
      { status: 500 },
    );
  }
}
