import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type TargetedProcessingJob = {
  id: string;
  account_id: string;
  media_id: string;
  workspace_id: string | null;
  variant_id: string | null;
  status: string;
  progress: number;
  attempt_count: number;
  max_attempts: number;
  payload: Record<string, unknown> | null;
};

type ClaimTargetedProcessingJobParams = {
  accountId: string;
  mediaId: string;
  jobType: string;
  workerId: string;
  leaseSeconds: number;
};

type CandidateJob = TargetedProcessingJob & {
  available_at: string | null;
  lock_expires_at: string | null;
  started_at: string | null;
};

function parseTimestamp(value: unknown) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export async function claimTargetedProcessingJob(
  params: ClaimTargetedProcessingJobParams,
): Promise<TargetedProcessingJob | null> {
  const accountId = String(params.accountId || "").trim();
  const mediaId = String(params.mediaId || "").trim();
  const jobType = String(params.jobType || "").trim();
  const workerId = String(params.workerId || "").trim().slice(0, 180);
  if (!accountId || !mediaId || !jobType || !workerId) {
    throw new Error("targeted_processing_scope_missing");
  }

  const candidateResult = await supabaseAdmin
    .from("media_processing_jobs")
    .select(
      "id,account_id,media_id,workspace_id,variant_id,status,progress,attempt_count,max_attempts,payload,available_at,lock_expires_at,started_at",
    )
    .eq("account_id", accountId)
    .eq("media_id", mediaId)
    .eq("job_type", jobType)
    .in("status", ["queued", "retry_wait", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (candidateResult.error) throw candidateResult.error;
  if (!candidateResult.data) return null;

  const candidate = candidateResult.data as CandidateJob;
  const attemptCount = Math.max(0, Number(candidate.attempt_count || 0));
  const maxAttempts = Math.max(1, Number(candidate.max_attempts || 1));
  if (attemptCount >= maxAttempts) return null;

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const status = String(candidate.status || "");
  if (status === "processing") {
    const lockExpiresAt = parseTimestamp(candidate.lock_expires_at);
    if (!lockExpiresAt || lockExpiresAt > nowMs) return null;
  } else {
    const availableAt = parseTimestamp(candidate.available_at);
    if (availableAt && availableAt > nowMs) return null;
  }

  const baseUpdateQuery = supabaseAdmin
    .from("media_processing_jobs")
    .update({
      status: "processing",
      attempt_count: attemptCount + 1,
      progress: Math.max(1, Number(candidate.progress || 0)),
      locked_at: nowIso,
      lock_expires_at: new Date(
        nowMs + Math.max(60, Math.min(3_600, params.leaseSeconds)) * 1_000,
      ).toISOString(),
      locked_by: workerId,
      started_at: candidate.started_at || nowIso,
      error_code: null,
      error_message: null,
      updated_at: nowIso,
    })
    .eq("id", candidate.id)
    .eq("account_id", accountId)
    .eq("status", status)
    .eq("attempt_count", attemptCount);

  const updateQuery =
    status === "processing"
      ? baseUpdateQuery.lte("lock_expires_at", nowIso)
      : baseUpdateQuery.lte("available_at", nowIso);

  const claimedResult = await updateQuery
    .select(
      "id,account_id,media_id,workspace_id,variant_id,status,progress,attempt_count,max_attempts,payload",
    )
    .maybeSingle();
  if (claimedResult.error) throw claimedResult.error;
  return (claimedResult.data as TargetedProcessingJob | null) || null;
}
