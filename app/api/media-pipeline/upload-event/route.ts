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
import { canPublishVideoSourceDirectly } from "@/lib/mediaVideoSourceCompatibility";

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

async function verifyStoredUpload(params: {
  bucket: string;
  storagePath: string;
  expectedSize: number;
}) {
  const cleanPath = String(params.storagePath || "").replace(/^\/+/, "");
  const segments = cleanPath.split("/").filter(Boolean);
  const objectName = segments.pop() || "";
  const folder = segments.join("/");
  if (!params.bucket || !objectName || params.expectedSize <= 0) return false;

  const retryDelays = [0, 250, 650, 1_200];
  let lastError: unknown = null;
  for (const delayMs of retryDelays) {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    const listed = await supabaseAdmin.storage.from(params.bucket).list(folder, {
      limit: 20,
      search: objectName,
    });
    if (listed.error) {
      lastError = listed.error;
      continue;
    }
    const stored = (listed.data || []).find(
      (entry: any) => String(entry?.name || "") === objectName,
    ) as any;
    const metadata =
      stored?.metadata && typeof stored.metadata === "object"
        ? stored.metadata
        : {};
    const storedSize = Number(
      metadata.size ??
        metadata.contentLength ??
        metadata.content_length ??
        stored?.size ??
        0,
    );
    if (
      Boolean(stored) &&
      Number.isFinite(storedSize) &&
      storedSize === params.expectedSize
    ) {
      return true;
    }
  }
  if (lastError) throw lastError;
  return false;
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
      .select(
        "id,user_id,media_type,media_metadata,bucket_name,storage_path,size_bytes,original_file_name,mime_type",
      )
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
    const directVideoSource =
      current.data.media_type === "video" &&
      canPublishVideoSourceDirectly({
        name: current.data.original_file_name,
        mimeType: current.data.mime_type,
        storagePath: current.data.storage_path,
      });

    if (event === "uploaded") {
      const verified = await verifyStoredUpload({
        bucket: String(current.data.bucket_name || ""),
        storagePath: String(current.data.storage_path || ""),
        expectedSize: Number(current.data.size_bytes || 0),
      });
      if (!verified) {
        return NextResponse.json(
          {
            ok: false,
            code: "upload_storage_unverified",
            error:
              "Le stockage n’a pas encore confirmé le fichier complet. L’envoi peut reprendre sans recommencer.",
          },
          { status: 409 },
        );
      }
    }

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
      if (directVideoSource) {
        patch.processing_status = "ready";
        patch.processing_progress = 100;
        patch.publication_status = "ready";
        patch.detected_mime_type =
          cleanText(current.data.mime_type, "video/mp4", 120) || "video/mp4";
        patch.processing_error_code = null;
        patch.processing_error_message = null;
        patch.processing_completed_at = now;
      }
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

    if (
      event === "uploaded" &&
      current.data.media_type === "video" &&
      !directVideoSource
    ) {
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
    } else if (event === "uploaded" && directVideoSource) {
      videoNormalization = {
        enabled: true,
        queued: false,
        reason: "source_direct_ready",
      };
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
