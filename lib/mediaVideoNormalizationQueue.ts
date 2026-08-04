import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  BOOSTER_VIDEO_PREPARATION_KEYS,
  type BoosterPreparationMission,
} from "@/lib/boosterMediaPipelineMissions";
import {
  VIDEO_NORMALIZATION_PIPELINE_VERSION,
  isVideoNormalizationEnabled,
} from "@/lib/mediaVideoNormalizationPolicy";

type EnqueueVideoNormalizationParams = {
  mediaId: string;
  accountId: string;
  workspaceId?: string | null;
  mission?: BoosterPreparationMission;
};

export type VideoNormalizationEnqueueResult = {
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

async function persistPreparationMission(params: {
  accountId: string;
  mediaId: string;
  jobId: string | null;
  mission?: BoosterPreparationMission;
}) {
  if (!params.mission) return;

  const requiredOutputs =
    BOOSTER_VIDEO_PREPARATION_KEYS[params.mission];
  const operations: PromiseLike<unknown>[] = [];

  if (params.jobId) {
    const currentJob = await supabaseAdmin
      .from("media_processing_jobs")
      .select("payload")
      .eq("id", params.jobId)
      .eq("account_id", params.accountId)
      .maybeSingle();
    if (currentJob.error) throw currentJob.error;
    operations.push(
      supabaseAdmin
        .from("media_processing_jobs")
        .update({
          payload: {
            ...asRecord(currentJob.data?.payload),
            pipelineMission: params.mission,
            requiredOutputs: [...requiredOutputs],
          },
        })
        .eq("id", params.jobId)
        .eq("account_id", params.accountId),
    );
  }

  const currentMedia = await supabaseAdmin
    .from("pro_media_library")
    .select("media_metadata")
    .eq("id", params.mediaId)
    .eq("user_id", params.accountId)
    .maybeSingle();
  if (currentMedia.error) throw currentMedia.error;
  operations.push(
    supabaseAdmin
      .from("pro_media_library")
      .update({
        media_metadata: {
          ...asRecord(currentMedia.data?.media_metadata),
          pipeline_mission: params.mission,
          preparation_scope: params.mission,
          preparation_required_outputs: [...requiredOutputs],
        },
      })
      .eq("id", params.mediaId)
      .eq("user_id", params.accountId),
  );

  const results = await Promise.all(operations);
  for (const result of results) {
    const error = (result as { error?: unknown })?.error;
    if (error) throw error;
  }
}

export async function enqueueVideoNormalization(
  params: EnqueueVideoNormalizationParams,
): Promise<VideoNormalizationEnqueueResult> {
  if (!isVideoNormalizationEnabled()) {
    return { enabled: false, queued: false, reason: "feature_disabled" };
  }

  const mediaId = String(params.mediaId || "").trim();
  const accountId = String(params.accountId || "").trim();
  const workspaceId = String(params.workspaceId || "").trim() || null;
  if (!mediaId || !accountId) {
    throw new Error("video_normalization_scope_missing");
  }

  const result = await supabaseAdmin.rpc("inrcy_enqueue_video_normalization", {
    p_media_id: mediaId,
    p_account_id: accountId,
    p_workspace_id: workspaceId,
    p_pipeline_version: VIDEO_NORMALIZATION_PIPELINE_VERSION,
  });
  if (result.error) throw result.error;

  const payload = asRecord(result.data);
  const jobId = payload.jobId ? String(payload.jobId) : null;
  await persistPreparationMission({
    accountId,
    mediaId,
    jobId,
    mission: params.mission,
  });
  return {
    enabled: true,
    queued: Boolean(payload.queued),
    reason: payload.reason ? String(payload.reason) : undefined,
    jobId,
  };
}

export async function repairPendingVideoNormalizationQueue(params?: {
  limit?: number;
}) {
  if (!isVideoNormalizationEnabled()) {
    return { enabled: false, scanned: 0, queued: 0, failed: 0 };
  }

  const limit = Math.max(1, Math.min(20, Math.round(params?.limit || 10)));
  const result = await supabaseAdmin
    .from("pro_media_library")
    .select("id,user_id,media_metadata,processing_status")
    .eq("media_type", "video")
    .eq("upload_status", "uploaded")
    .gte("pipeline_version", VIDEO_NORMALIZATION_PIPELINE_VERSION)
    .in("processing_status", ["not_requested", "failed_retryable"])
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (result.error) throw result.error;

  let queued = 0;
  let failed = 0;
  for (const row of result.data || []) {
    const metadata = asRecord(row.media_metadata);
    if (
      metadata.pipeline_mission === "source_metadata" &&
      metadata.preparation_scope === "source_only" &&
      String(row.processing_status || "") === "not_requested"
    ) {
      continue;
    }
    const mission =
      metadata.pipeline_mission === "ai_preparation" ||
      metadata.pipeline_mission === "publication_preparation"
        ? metadata.pipeline_mission
        : undefined;
    try {
      const enqueued = await enqueueVideoNormalization({
        mediaId: String(row.id),
        accountId: String(row.user_id),
        workspaceId: metadata.workspace_id
          ? String(metadata.workspace_id)
          : null,
        mission,
      });
      if (enqueued.queued) queued += 1;
    } catch (error) {
      failed += 1;
      console.error("[media-pipeline] video queue repair failed", {
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
