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
  updated_at?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function clean(value: unknown) {
  return String(value ?? "").trim();
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
}) {
  const limit = Math.max(1, Math.round(params.limit || 1));
  const failedRetryableRows = params.failedRetryableRows
    .filter(
      (row) =>
        clean(row.processing_status) === "failed_retryable" &&
        isRequestedNormalizationRepair(row),
    )
    .sort(compareOldestFirst);
  const notRequestedRows = params.notRequestedRows
    .filter(
      (row) =>
        clean(row.processing_status) === "not_requested" &&
        isRequestedNormalizationRepair(row),
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
  limit: number;
}) {
  const limit = Math.max(1, Math.round(params.limit || 1));
  const select =
    "id,user_id,media_metadata,processing_status,updated_at";
  const baseQuery = () =>
    params.supabase
      .from("pro_media_library")
      .select(select)
      .eq("media_type", params.mediaType)
      .eq("upload_status", "uploaded")
      .gte("pipeline_version", params.minimumPipelineVersion);

  // Deux requêtes simples et indexables valent mieux qu'un OR JSONB global.
  // La première utilise l'index historique de reprise. La seconde est alignée
  // avec l'index partiel ajouté par le hardening du 5 août.
  const [failedRetryableResult, notRequestedResult] = await Promise.all([
    baseQuery()
      .eq("processing_status", "failed_retryable")
      .order("updated_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(limit),
    baseQuery()
      .eq("processing_status", "not_requested")
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
  });
}
