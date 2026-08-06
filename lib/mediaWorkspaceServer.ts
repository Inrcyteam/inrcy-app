import { isImageNormalizationEnabled } from "@/lib/mediaImageNormalizationPolicy";
import { isVideoNormalizationEnabled } from "@/lib/mediaVideoNormalizationPolicy";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type WorkspaceMediaStatus = {
  mediaType: string;
  uploadStatus: string;
  processingStatus: string;
  publicationStatus: string;
};

const MUTABLE_WORKSPACE_STATUSES = [
  "draft",
  "active",
  "waiting_media",
  "ready",
  "failed",
] as const;

export async function refreshPublicationWorkspaceMediaStatus(params: {
  workspaceId: string;
  accountId: string;
}) {
  const mediaResult = await supabaseAdmin
    .from("publication_workspace_media")
    .select(
      "media_id,pro_media_library!inner(user_id,media_type,upload_status,processing_status,publication_status)",
    )
    .eq("workspace_id", params.workspaceId)
    .eq("pro_media_library.user_id", params.accountId);
  if (mediaResult.error) throw mediaResult.error;

  const imageNormalizationEnabled = isImageNormalizationEnabled();
  const videoNormalizationEnabled = isVideoNormalizationEnabled();
  const statuses: WorkspaceMediaStatus[] = (mediaResult.data || [])
    .map((row: any) => {
      const media = Array.isArray(row.pro_media_library)
        ? row.pro_media_library[0]
        : row.pro_media_library;
      return {
        mediaType: String(media?.media_type || ""),
        uploadStatus: String(media?.upload_status || "pending"),
        processingStatus: String(media?.processing_status || "not_requested"),
        publicationStatus: String(media?.publication_status || "not_requested"),
      };
    })
    .filter((status: WorkspaceMediaStatus) => Boolean(status.mediaType));

  const hasUploadFailure = statuses.some(
    (status) =>
      status.uploadStatus === "failed" || status.uploadStatus === "removed",
  );
  const hasTerminalProcessingFailure = statuses.some((status) => {
    const required =
      (status.mediaType === "image" && imageNormalizationEnabled) ||
      (status.mediaType === "video" && videoNormalizationEnabled);
    return (
      required &&
      !["ready", "legacy_ready"].includes(status.publicationStatus) &&
      (status.processingStatus === "failed_terminal" ||
        status.publicationStatus === "failed")
    );
  });
  const allUploadsReady = statuses.every(
    (status) => status.uploadStatus === "uploaded",
  );
  const allRequiredProcessingReady = statuses.every((status) => {
    const required =
      (status.mediaType === "image" && imageNormalizationEnabled) ||
      (status.mediaType === "video" && videoNormalizationEnabled);
    if (!required) return true;
    return ["ready", "legacy_ready"].includes(status.publicationStatus);
  });

  const nextStatus =
    statuses.length === 0
      ? "active"
      : hasUploadFailure || hasTerminalProcessingFailure
        ? "failed"
        : allUploadsReady && allRequiredProcessingReady
          ? "ready"
          : "waiting_media";

  const update = await supabaseAdmin
    .from("publication_workspaces")
    .update({ status: nextStatus })
    .eq("id", params.workspaceId)
    .eq("account_id", params.accountId)
    .in("status", [...MUTABLE_WORKSPACE_STATUSES])
    // Ne réécrit ni updated_at ni les abonnements Realtime quand le calcul
    // aboutit au statut déjà stocké. revision/metadata restent inchangées ici.
    .neq("status", nextStatus);
  if (update.error) throw update.error;
  return nextStatus;
}

export async function refreshPublicationWorkspaceStatusesForMedia(params: {
  mediaId: string;
  accountId: string;
}) {
  const links = await supabaseAdmin
    .from("publication_workspace_media")
    .select("workspace_id,publication_workspaces!inner(account_id)")
    .eq("media_id", params.mediaId)
    .eq("publication_workspaces.account_id", params.accountId);
  if (links.error) throw links.error;

  const workspaceIds: string[] = Array.from(
    new Set<string>(
      (links.data || [])
        .map((row: any) => String(row.workspace_id || ""))
        .filter(Boolean),
    ),
  );

  await Promise.all(
    workspaceIds.map((workspaceId) =>
      refreshPublicationWorkspaceMediaStatus({
        workspaceId,
        accountId: params.accountId,
      }),
    ),
  );
}
