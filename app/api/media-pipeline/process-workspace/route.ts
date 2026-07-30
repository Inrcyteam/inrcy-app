import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { enforceRateLimit } from "@/lib/rateLimit";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { enqueueImageNormalization } from "@/lib/mediaImageNormalizationQueue";
import { processImageNormalizationJobsForMedia } from "@/lib/mediaImageNormalizationWorker";
import { enqueueVideoNormalization } from "@/lib/mediaVideoNormalizationQueue";
import { processVideoNormalizationJobsForMedia } from "@/lib/mediaVideoNormalizationWorker";
import { refreshPublicationWorkspaceMediaStatus } from "@/lib/mediaWorkspaceServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type WorkspaceMediaRow = {
  id: string;
  media_type: string;
  upload_status: string;
  processing_status: string;
};

function cleanText(value: unknown, max = 100) {
  return String(value || "").trim().slice(0, max);
}

function jsonError(error: string, status = 400, code?: string) {
  return NextResponse.json(
    { ok: false, error, ...(code ? { code } : {}) },
    { status },
  );
}

export async function POST(request: Request) {
  try {
    const { errorResponse, activeUserId } = await requireUser();
    if (errorResponse) return errorResponse;

    const limited = await enforceRateLimit({
      name: "media_pipeline_process_workspace",
      identifier: activeUserId,
      limit: 20,
      fallbackLimit: 20,
      window: "5 m",
      failClosed: false,
    });
    if (limited) return limited;

    const body = await request.json().catch(() => null);
    const workspaceId = cleanText(body?.workspaceId, 80);
    if (!workspaceId) {
      return jsonError("Espace média manquant.", 400, "workspace_required");
    }

    const workspace = await supabaseAdmin
      .from("publication_workspaces")
      .select("id,account_id,status")
      .eq("id", workspaceId)
      .eq("account_id", activeUserId)
      .maybeSingle();
    if (workspace.error) throw workspace.error;
    if (!workspace.data) {
      return jsonError("Espace média introuvable.", 404, "workspace_not_found");
    }

    const mediaResult = await supabaseAdmin
      .from("publication_workspace_media")
      .select(
        "position,media_id,pro_media_library!inner(id,user_id,media_type,upload_status,processing_status)",
      )
      .eq("workspace_id", workspaceId)
      .eq("pro_media_library.user_id", activeUserId)
      .order("position", { ascending: true });
    if (mediaResult.error) throw mediaResult.error;

    const media = (mediaResult.data || [])
      .map((row: any) => {
        const item = Array.isArray(row.pro_media_library)
          ? row.pro_media_library[0]
          : row.pro_media_library;
        return item as WorkspaceMediaRow | null;
      })
      .filter(Boolean) as WorkspaceMediaRow[];

    const uploadedImages = media
      .filter(
        (item) =>
          item.media_type === "image" && item.upload_status === "uploaded",
      )
      .slice(0, 5);
    const uploadedVideos = media
      .filter(
        (item) =>
          item.media_type === "video" && item.upload_status === "uploaded",
      )
      .slice(0, 1);

    await Promise.all([
      ...uploadedImages.map((item) =>
        enqueueImageNormalization({
          mediaId: item.id,
          accountId: activeUserId,
          workspaceId,
        }),
      ),
      ...uploadedVideos.map((item) =>
        enqueueVideoNormalization({
          mediaId: item.id,
          accountId: activeUserId,
          workspaceId,
        }),
      ),
    ]);

    const requestId = randomUUID();
    const imageProcessing = uploadedImages.length
      ? await processImageNormalizationJobsForMedia({
          accountId: activeUserId,
          mediaIds: uploadedImages.map((item) => item.id),
          workerId: `image-workspace-${requestId}`,
          concurrency: 2,
        })
      : null;
    const videoProcessing = uploadedVideos.length
      ? await processVideoNormalizationJobsForMedia({
          accountId: activeUserId,
          mediaIds: uploadedVideos.map((item) => item.id),
          workerId: `video-workspace-${requestId}`,
        })
      : null;

    const workspaceStatus = await refreshPublicationWorkspaceMediaStatus({
      workspaceId,
      accountId: activeUserId,
    });

    return NextResponse.json({
      ok: true,
      workspaceId,
      workspaceStatus,
      mediaCount: media.length,
      imageProcessing,
      videoProcessing,
    });
  } catch (error) {
    console.error("[media-pipeline] immediate workspace processing failed", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Impossible de préparer immédiatement les médias.",
      },
      { status: 500 },
    );
  }
}
