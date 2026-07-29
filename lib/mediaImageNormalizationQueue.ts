import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  IMAGE_NORMALIZATION_PIPELINE_VERSION,
  isImageNormalizationEnabled,
} from "@/lib/mediaImageNormalizationPolicy";

type EnqueueImageNormalizationParams = {
  mediaId: string;
  accountId: string;
  workspaceId?: string | null;
};

export type ImageNormalizationEnqueueResult = {
  enabled: boolean;
  queued: boolean;
  reason?: string;
  jobId?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function enqueueImageNormalization(
  params: EnqueueImageNormalizationParams,
): Promise<ImageNormalizationEnqueueResult> {
  if (!isImageNormalizationEnabled()) {
    return { enabled: false, queued: false, reason: "feature_disabled" };
  }

  const mediaId = String(params.mediaId || "").trim();
  const accountId = String(params.accountId || "").trim();
  const workspaceId = String(params.workspaceId || "").trim() || null;
  if (!mediaId || !accountId) {
    throw new Error("image_normalization_scope_missing");
  }

  const result = await supabaseAdmin.rpc("inrcy_enqueue_image_normalization", {
    p_media_id: mediaId,
    p_account_id: accountId,
    p_workspace_id: workspaceId,
    p_pipeline_version: IMAGE_NORMALIZATION_PIPELINE_VERSION,
  });
  if (result.error) throw result.error;

  const payload = asRecord(result.data);
  return {
    enabled: true,
    queued: Boolean(payload.queued),
    reason: payload.reason ? String(payload.reason) : undefined,
    jobId: payload.jobId ? String(payload.jobId) : null,
  };
}

export async function repairPendingImageNormalizationQueue(params?: {
  limit?: number;
}) {
  if (!isImageNormalizationEnabled()) {
    return { enabled: false, scanned: 0, queued: 0, failed: 0 };
  }

  const limit = Math.max(1, Math.min(50, Math.round(params?.limit || 20)));
  const result = await supabaseAdmin
    .from("pro_media_library")
    .select("id,user_id,media_metadata,processing_status")
    .eq("media_type", "image")
    .eq("upload_status", "uploaded")
    .gte("pipeline_version", IMAGE_NORMALIZATION_PIPELINE_VERSION)
    .in("processing_status", ["not_requested", "failed_retryable"])
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (result.error) throw result.error;

  let queued = 0;
  let failed = 0;
  for (const row of result.data || []) {
    const metadata = asRecord(row.media_metadata);
    try {
      const enqueued = await enqueueImageNormalization({
        mediaId: String(row.id),
        accountId: String(row.user_id),
        workspaceId: metadata.workspace_id
          ? String(metadata.workspace_id)
          : null,
      });
      if (enqueued.queued) queued += 1;
    } catch (error) {
      failed += 1;
      console.error("[media-pipeline] image queue repair failed", {
        mediaId: row.id,
        error,
      });
    }
  }

  return {
    enabled: true,
    scanned: result.data?.length || 0,
    queued,
    failed,
  };
}
