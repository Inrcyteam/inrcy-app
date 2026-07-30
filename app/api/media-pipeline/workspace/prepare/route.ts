import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { enforceRateLimit } from "@/lib/rateLimit";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { enqueueImageNormalization } from "@/lib/mediaImageNormalizationQueue";
import { enqueueVideoNormalization } from "@/lib/mediaVideoNormalizationQueue";
import { processImageNormalizationJobs } from "@/lib/mediaImageNormalizationWorker";
import { processVideoNormalizationJobs } from "@/lib/mediaVideoNormalizationWorker";
import { refreshPublicationWorkspaceMediaStatus } from "@/lib/mediaWorkspaceServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type WorkspaceMedia = {
  mediaId: string;
  mediaType: "image" | "video";
  position: number;
  uploadStatus: string;
  uploadProgress: number;
  processingStatus: string;
  processingProgress: number;
  processingErrorCode: string | null;
  processingErrorMessage: string | null;
  publicationStatus: string;
  bucket: string;
  storagePath: string;
  fileName: string;
  clientMediaKey: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
};

function cleanText(value: unknown, fallback = "", max = 500) {
  return String(value ?? fallback).trim().slice(0, max);
}

function jsonError(error: string, status = 400, code?: string) {
  return NextResponse.json(
    { ok: false, error, ...(code ? { code } : {}) },
    { status },
  );
}

async function loadOwnedWorkspaceMedia(params: {
  workspaceId: string;
  accountId: string;
}) {
  const workspaceResult = await supabaseAdmin
    .from("publication_workspaces")
    .select("id,account_id,status,revision")
    .eq("id", params.workspaceId)
    .eq("account_id", params.accountId)
    .maybeSingle();
  if (workspaceResult.error) throw workspaceResult.error;
  if (!workspaceResult.data) return null;

  const mediaResult = await supabaseAdmin
    .from("publication_workspace_media")
    .select(
      "position,media_id,pro_media_library!inner(id,user_id,media_type,upload_status,upload_progress,processing_status,processing_progress,processing_error_code,processing_error_message,publication_status,bucket_name,storage_path,original_file_name,client_media_key,mime_type,size_bytes,width,height,duration_seconds)",
    )
    .eq("workspace_id", params.workspaceId)
    .eq("pro_media_library.user_id", params.accountId)
    .order("position", { ascending: true });
  if (mediaResult.error) throw mediaResult.error;

  const media: WorkspaceMedia[] = (mediaResult.data || []).map((row: any) => {
    const item = Array.isArray(row.pro_media_library)
      ? row.pro_media_library[0]
      : row.pro_media_library;
    return {
      mediaId: String(row.media_id || item?.id || ""),
      mediaType: item?.media_type === "video" ? "video" : "image",
      position: Number(row.position || 0),
      uploadStatus: String(item?.upload_status || "pending"),
      uploadProgress: Number(item?.upload_progress || 0),
      processingStatus: String(item?.processing_status || "not_requested"),
      processingProgress: Number(item?.processing_progress || 0),
      processingErrorCode: item?.processing_error_code
        ? String(item.processing_error_code)
        : null,
      processingErrorMessage: item?.processing_error_message
        ? String(item.processing_error_message)
        : null,
      publicationStatus: String(item?.publication_status || "not_requested"),
      bucket: String(item?.bucket_name || ""),
      storagePath: String(item?.storage_path || ""),
      fileName: String(item?.original_file_name || "media-inrcy"),
      clientMediaKey: String(item?.client_media_key || ""),
      mimeType: String(item?.mime_type || "application/octet-stream"),
      sizeBytes: Number(item?.size_bytes || 0),
      width: Number(item?.width || 0) || null,
      height: Number(item?.height || 0) || null,
      durationSeconds: Number(item?.duration_seconds || 0) || null,
    };
  });

  return {
    workspace: workspaceResult.data,
    media,
  };
}

function isTerminalMediaFailure(media: WorkspaceMedia) {
  return (
    media.uploadStatus === "failed" ||
    media.uploadStatus === "removed" ||
    media.processingStatus === "failed_terminal" ||
    media.publicationStatus === "failed" ||
    media.publicationStatus === "removed"
  );
}

function isMediaReady(media: WorkspaceMedia) {
  return (
    media.uploadStatus === "uploaded" &&
    media.processingStatus === "ready" &&
    (media.publicationStatus === "ready" ||
      media.publicationStatus === "legacy_ready")
  );
}

async function repairCompletedStorageUploads(params: {
  accountId: string;
  workspaceId: string;
  media: WorkspaceMedia[];
}) {
  let repaired = 0;
  for (const item of params.media) {
    if (
      !["pending", "uploading"].includes(item.uploadStatus) ||
      !item.bucket ||
      !item.storagePath ||
      item.sizeBytes <= 0
    ) {
      continue;
    }

    const cleanPath = item.storagePath.replace(/^\/+/, "");
    const segments = cleanPath.split("/").filter(Boolean);
    const objectName = segments.pop() || "";
    const folder = segments.join("/");
    if (!objectName) continue;

    const listed = await supabaseAdmin.storage.from(item.bucket).list(folder, {
      limit: 20,
      search: objectName,
    });
    if (listed.error) {
      console.warn("[media-pipeline] workspace upload repair listing failed", {
        workspaceId: params.workspaceId,
        mediaId: item.mediaId,
        error: listed.error,
      });
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
    if (!stored || !Number.isFinite(storedSize) || storedSize !== item.sizeBytes) {
      continue;
    }

    const now = new Date().toISOString();
    const updated = await supabaseAdmin
      .from("pro_media_library")
      .update({
        upload_status: "uploaded",
        upload_progress: 100,
        uploaded_at: now,
        upload_error_code: null,
        upload_error_message: null,
      })
      .eq("id", item.mediaId)
      .eq("user_id", params.accountId)
      .in("upload_status", ["pending", "uploading"])
      .select("id")
      .maybeSingle();
    if (updated.error) throw updated.error;
    if (updated.data) repaired += 1;
  }

  if (repaired > 0) {
    await refreshPublicationWorkspaceMediaStatus({
      workspaceId: params.workspaceId,
      accountId: params.accountId,
    });
  }
  return repaired;
}

function buildStatus(media: WorkspaceMedia[]) {
  const failed = media.find(isTerminalMediaFailure);
  if (failed) {
    return {
      status: "failed" as const,
      message:
        failed.processingErrorMessage ||
        (failed.uploadStatus === "failed"
          ? "L’envoi du média a échoué. Retirez-le puis ajoutez-le de nouveau."
          : "La préparation du média a échoué. Retirez-le puis ajoutez-le de nouveau."),
    };
  }
  if (media.length > 0 && media.every(isMediaReady)) {
    return { status: "ready" as const, message: null };
  }
  if (media.some((item) => item.uploadStatus !== "uploaded")) {
    return {
      status: "uploading" as const,
      message: "L’envoi du média vers le stockage sécurisé est encore en cours.",
    };
  }
  return {
    status: "processing" as const,
    message: "Le média est en cours de préparation sur le serveur.",
  };
}

async function enqueueWorkspaceMedia(params: {
  accountId: string;
  workspaceId: string;
  media: WorkspaceMedia[];
}) {
  let processingEnabled = true;
  for (const item of params.media) {
    if (
      item.uploadStatus !== "uploaded" ||
      isMediaReady(item) ||
      isTerminalMediaFailure(item)
    ) {
      continue;
    }

    if (item.mediaType === "video") {
      const result = await enqueueVideoNormalization({
        mediaId: item.mediaId,
        accountId: params.accountId,
        workspaceId: params.workspaceId,
      });
      processingEnabled = processingEnabled && result.enabled;
    } else {
      const result = await enqueueImageNormalization({
        mediaId: item.mediaId,
        accountId: params.accountId,
        workspaceId: params.workspaceId,
      });
      processingEnabled = processingEnabled && result.enabled;
    }
  }
  return processingEnabled;
}

async function prioritizeWorkspaceJobs(params: {
  accountId: string;
  mediaIds: string[];
}) {
  if (!params.mediaIds.length) return;
  const result = await supabaseAdmin
    .from("media_processing_jobs")
    .update({
      priority: 10_000,
      available_at: new Date().toISOString(),
    })
    .eq("account_id", params.accountId)
    .in("media_id", params.mediaIds)
    .in("status", ["queued", "retry_wait"]);
  if (result.error) throw result.error;
}

export async function POST(request: Request) {
  try {
    const { errorResponse, activeUserId } = await requireUser();
    if (errorResponse) return errorResponse;

    const limited = await enforceRateLimit({
      name: "media_pipeline_workspace_prepare",
      identifier: activeUserId,
      limit: 36,
      fallbackLimit: 36,
      window: "5 m",
      failClosed: false,
    });
    if (limited) return limited;

    const body = await request.json().catch(() => null);
    const workspaceId = cleanText(body?.workspaceId, "", 80);
    if (!workspaceId) {
      return jsonError("Espace média manquant.", 400, "workspace_required");
    }

    let graph = await loadOwnedWorkspaceMedia({
      workspaceId,
      accountId: activeUserId,
    });
    if (!graph) {
      return jsonError(
        "Espace média introuvable pour cet établissement.",
        404,
        "workspace_not_found",
      );
    }

    const repairedUploads = await repairCompletedStorageUploads({
      accountId: activeUserId,
      workspaceId,
      media: graph.media,
    });
    if (repairedUploads > 0) {
      graph = await loadOwnedWorkspaceMedia({
        workspaceId,
        accountId: activeUserId,
      });
      if (!graph) {
        return jsonError(
          "Espace média introuvable après la réparation de l’upload.",
          404,
          "workspace_not_found",
        );
      }
    }

    const initialStatus = buildStatus(graph.media);
    if (initialStatus.status === "ready" || initialStatus.status === "failed") {
      return NextResponse.json({
        ok: true,
        workspaceId,
        status: initialStatus.status,
        message: initialStatus.message,
        media: graph.media,
      });
    }

    if (initialStatus.status === "uploading") {
      return NextResponse.json({
        ok: true,
        workspaceId,
        status: initialStatus.status,
        message: initialStatus.message,
        media: graph.media,
      });
    }

    const processingEnabled = await enqueueWorkspaceMedia({
      accountId: activeUserId,
      workspaceId,
      media: graph.media,
    });
    if (!processingEnabled) {
      return jsonError(
        "La préparation média serveur n’est pas activée. Vérifiez les variables du pipeline média.",
        503,
        "media_processing_disabled",
      );
    }

    const pending = graph.media.filter(
      (item) =>
        item.uploadStatus === "uploaded" &&
        !isMediaReady(item) &&
        !isTerminalMediaFailure(item),
    );
    await prioritizeWorkspaceJobs({
      accountId: activeUserId,
      mediaIds: pending.map((item) => item.mediaId).filter(Boolean),
    });

    const requestId = randomUUID();
    const pendingImages = pending.filter((item) => item.mediaType === "image");
    const pendingVideos = pending.filter((item) => item.mediaType === "video");

    if (pendingImages.length) {
      await processImageNormalizationJobs({
        limit: Math.min(2, pendingImages.length),
        workerId: `workspace-prepare-image-${requestId}`,
      });
    }
    if (pendingVideos.length) {
      await processVideoNormalizationJobs({
        limit: 1,
        workerId: `workspace-prepare-video-${requestId}`,
      });
    }

    await refreshPublicationWorkspaceMediaStatus({
      workspaceId,
      accountId: activeUserId,
    });

    graph = await loadOwnedWorkspaceMedia({
      workspaceId,
      accountId: activeUserId,
    });
    if (!graph) {
      return jsonError(
        "Espace média introuvable après sa préparation.",
        404,
        "workspace_not_found",
      );
    }

    const finalStatus = buildStatus(graph.media);
    return NextResponse.json({
      ok: true,
      workspaceId,
      status: finalStatus.status,
      message: finalStatus.message,
      media: graph.media,
    });
  } catch (error) {
    console.error("[media-pipeline] workspace prepare failed", error);
    return jsonError(
      error instanceof Error
        ? error.message
        : "Impossible de préparer le média sur le serveur.",
      500,
      "workspace_prepare_failed",
    );
  }
}
