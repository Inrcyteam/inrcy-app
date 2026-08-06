export const NORMALIZATION_REPAIR_PREPARATION_MISSIONS = [
  "ai_preparation",
  "publication_preparation",
] as const;

export type NormalizationRepairPreparationMission =
  (typeof NORMALIZATION_REPAIR_PREPARATION_MISSIONS)[number];

export type NormalizationRepairRow = {
  id?: unknown;
  user_id?: unknown;
  media_metadata?: unknown;
  processing_status?: unknown;
  pipeline_version?: unknown;
  updated_at?: unknown;
};

export type ExpiredNormalizationLeaseRepair = {
  available: boolean;
  recovered: number;
  terminalized: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function count(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
}

function hasMinimumPipelineVersion(
  row: NormalizationRepairRow,
  minimumPipelineVersion: number,
) {
  if (minimumPipelineVersion <= 0) return true;
  const pipelineVersion = Number(row.pipeline_version);
  return (
    Number.isFinite(pipelineVersion) &&
    pipelineVersion >= minimumPipelineVersion
  );
}

function isMissingLeaseRepairRpc(error: unknown) {
  const record = asRecord(error);
  const code = clean(record.code);
  const message = clean(record.message).toLowerCase();
  return (
    code === "PGRST202" ||
    code === "42883" ||
    (message.includes("inrcy_repair_expired_media_processing_jobs") &&
      (message.includes("not found") || message.includes("does not exist")))
  );
}

/**
 * LibÃ¨re les leases expirÃ©es avant le scan de rÃ©paration classique. Le RPC
 * remet les jobs encore rejouables en `retry_wait` et terminalise ceux dont le
 * budget est Ã©puisÃ© ; un job `processing` ne peut donc plus rester zombie.
 */
export async function repairExpiredNormalizationLeases(params: {
  supabase: any;
  jobType: "image_normalize_v1" | "video_normalize_v1";
  limit: number;
}): Promise<ExpiredNormalizationLeaseRepair> {
  const result = await params.supabase.rpc(
    "inrcy_repair_expired_media_processing_jobs",
    {
      p_job_type: params.jobType,
      p_limit: Math.max(1, Math.min(100, Math.round(params.limit || 1))),
    },
  );
  if (result.error) {
    // CompatibilitÃ© de dÃ©ploiement : l'ancien claim sait encore reprendre les
    // jobs non Ã©puisÃ©s pendant la courte fenÃªtre code -> migration.
    if (isMissingLeaseRepairRpc(result.error)) {
      return { available: false, recovered: 0, terminalized: 0 };
    }
    throw result.error;
  }
  const payload = asRecord(result.data);
  return {
    available: true,
    recovered: count(payload.recovered),
    terminalized: count(payload.terminalized),
  };
}

function compareOldestFirst(
  left: NormalizationRepairRow,
  right: NormalizationRepairRow,
) {
  const byDate = clean(left.updated_at).localeCompare(clean(right.updated_at));
  if (byDate !== 0) return byDate;
  return clean(left.id).localeCompare(clean(right.id));
}

export function isRequestedNormalizationRepair(
  row: NormalizationRepairRow,
) {
  const status = clean(row.processing_status);
  if (status === "failed_retryable") return true;
  if (status !== "not_requested") return false;

  const mission = clean(asRecord(row.media_metadata).pipeline_mission);
  return NORMALIZATION_REPAIR_PREPARATION_MISSIONS.includes(
    mission as NormalizationRepairPreparationMission,
  );
}

/**
 * Conserve au moins une place pour chaque classe de reprise quand elles sont
 * toutes les deux présentes. Une longue file `not_requested` ne peut donc plus
 * affamer les erreurs rejouables, et l'inverse reste vrai.
 */
export function selectNormalizationRepairCandidates(params: {
  failedRetryableRows: NormalizationRepairRow[];
  notRequestedRows: NormalizationRepairRow[];
  limit: number;
  minimumPipelineVersion?: number;
  minimumRequestedPipelineVersion?: number;
}) {
  const limit = Math.max(1, Math.round(params.limit || 1));
  const minimumPipelineVersion = Math.max(
    0,
    Math.round(params.minimumPipelineVersion || 0),
  );
  const minimumRequestedPipelineVersion = Math.max(
    0,
    Math.round(
      params.minimumRequestedPipelineVersion ?? minimumPipelineVersion,
    ),
  );
  const failedRetryableRows = params.failedRetryableRows
    .filter(
      (row) =>
        clean(row.processing_status) === "failed_retryable" &&
        isRequestedNormalizationRepair(row) &&
        hasMinimumPipelineVersion(row, minimumPipelineVersion),
    )
    .sort(compareOldestFirst);
  const notRequestedRows = params.notRequestedRows
    .filter(
      (row) =>
        clean(row.processing_status) === "not_requested" &&
        isRequestedNormalizationRepair(row) &&
        hasMinimumPipelineVersion(row, minimumRequestedPipelineVersion),
    )
    .sort(compareOldestFirst);

  if (limit === 1) {
    return (failedRetryableRows[0]
      ? [failedRetryableRows[0]]
      : notRequestedRows.slice(0, 1)) as NormalizationRepairRow[];
  }

  const selected: NormalizationRepairRow[] = [];
  if (failedRetryableRows.length) selected.push(failedRetryableRows.shift()!);
  if (notRequestedRows.length) selected.push(notRequestedRows.shift()!);

  const remaining = [...failedRetryableRows, ...notRequestedRows].sort(
    compareOldestFirst,
  );
  selected.push(...remaining.slice(0, Math.max(0, limit - selected.length)));

  const seen = new Set<string>();
  return selected.filter((row) => {
    const id = clean(row.id);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export async function loadNormalizationRepairCandidates(params: {
  supabase: any;
  mediaType: "image" | "video";
  minimumPipelineVersion: number;
  minimumRequestedPipelineVersion?: number;
  limit: number;
}) {
  const limit = Math.max(1, Math.round(params.limit || 1));
  const minimumPipelineVersion = Math.max(
    1,
    Math.round(params.minimumPipelineVersion || 1),
  );
  const minimumRequestedPipelineVersion = Math.max(
    1,
    Math.min(
      minimumPipelineVersion,
      Math.round(
        params.minimumRequestedPipelineVersion ?? minimumPipelineVersion,
      ),
    ),
  );
  try {
    await repairExpiredNormalizationLeases({
      supabase: params.supabase,
      jobType:
        params.mediaType === "video"
          ? "video_normalize_v1"
          : "image_normalize_v1",
      limit,
    });
  } catch (error) {
      // Le sweep est un filet de sÃ©curitÃ© : une indisponibilitÃ© ponctuelle du
      // RPC ne doit pas empÃªcher le claim historique de traiter les jobs sains.
    console.error("[media-pipeline] expired lease repair failed", error);
  }
  const select =
    "id,user_id,media_metadata,processing_status,pipeline_version,updated_at";
  const baseQuery = () =>
    params.supabase
      .from("pro_media_library")
      .select(select)
      .eq("media_type", params.mediaType)
      .eq("upload_status", "uploaded");

  // Deux requêtes simples et indexables valent mieux qu'un OR JSONB global.
  // La première utilise l'index historique de reprise. La seconde est alignée
  // avec l'index partiel ajouté par le hardening du 5 août.
  // Retryable failures stay on the current worker version. An explicitly
  // requested durable intent may come from the preceding ingress version;
  // the current enqueue RPC upgrades it while holding the media row lock.
  const [failedRetryableResult, notRequestedResult] = await Promise.all([
    baseQuery()
      .eq("processing_status", "failed_retryable")
      .gte("pipeline_version", minimumPipelineVersion)
      .order("updated_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(limit),
    baseQuery()
      .eq("processing_status", "not_requested")
      .gte("pipeline_version", minimumRequestedPipelineVersion)
      .in(
        "media_metadata->>pipeline_mission",
        NORMALIZATION_REPAIR_PREPARATION_MISSIONS,
      )
      .order("updated_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(limit),
  ]);

  if (failedRetryableResult.error) throw failedRetryableResult.error;
  if (notRequestedResult.error) throw notRequestedResult.error;

  return selectNormalizationRepairCandidates({
    failedRetryableRows: Array.isArray(failedRetryableResult.data)
      ? failedRetryableResult.data
      : [],
    notRequestedRows: Array.isArray(notRequestedResult.data)
      ? notRequestedResult.data
      : [],
    limit,
    minimumPipelineVersion,
    minimumRequestedPipelineVersion,
  });
}
