export type WorkspaceAiMediaType = "images" | "video" | "mixed" | "none";
export type WorkspaceAiFamily = "images" | "video";
export type WorkspaceAiFamilyState =
  | "absent"
  | "ready"
  | "partial"
  | "unavailable";

export type WorkspaceAiFamilyFailure = {
  code: string;
  message: string;
  mediaId?: string;
};

export type WorkspaceAiFamilyDiagnostic = {
  state: WorkspaceAiFamilyState;
  requestedCount: number;
  resolvedCount: number;
  code: string | null;
  message: string | null;
  failures: WorkspaceAiFamilyFailure[];
};

export type WorkspaceAiConsumptionDiagnostics = {
  images: WorkspaceAiFamilyDiagnostic;
  video: WorkspaceAiFamilyDiagnostic;
};

export const WORKSPACE_AI_PRIMARY_FAMILY_BUDGET_MS = 10_000;
export const WORKSPACE_AI_SECONDARY_FAMILY_BUDGET_MS = 4_000;

function positiveCount(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function cleanFailure(
  value: WorkspaceAiFamilyFailure,
): WorkspaceAiFamilyFailure {
  const mediaId = String(value.mediaId || "").trim();
  return {
    code: String(value.code || "workspace_ai_family_unavailable")
      .trim()
      .slice(0, 160),
    message: String(value.message || "Contexte média IA indisponible.")
      .trim()
      .slice(0, 1_200),
    ...(mediaId ? { mediaId: mediaId.slice(0, 240) } : {}),
  };
}

export function buildWorkspaceAiFamilyDiagnostic(params: {
  requestedCount: number;
  resolvedCount: number;
  failures?: readonly WorkspaceAiFamilyFailure[];
}): WorkspaceAiFamilyDiagnostic {
  const requestedCount = positiveCount(params.requestedCount);
  const resolvedCount = Math.min(
    requestedCount,
    positiveCount(params.resolvedCount),
  );
  const failures = (params.failures || []).map(cleanFailure).slice(0, 5);
  if (!requestedCount) {
    return {
      state: "absent",
      requestedCount: 0,
      resolvedCount: 0,
      code: null,
      message: null,
      failures: [],
    };
  }
  const firstFailure = failures[0] || null;
  if (resolvedCount >= requestedCount) {
    return {
      state: "ready",
      requestedCount,
      resolvedCount,
      code: null,
      message: null,
      failures: [],
    };
  }
  return {
    state: resolvedCount > 0 ? "partial" : "unavailable",
    requestedCount,
    resolvedCount,
    code: firstFailure?.code || "workspace_ai_family_incomplete",
    message:
      firstFailure?.message ||
      "Une partie du contexte média IA n'est pas encore exploitable.",
    failures,
  };
}

export function getWorkspaceAiMediaType(params: {
  imageCount: number;
  hasVideo: boolean;
}): WorkspaceAiMediaType {
  const hasImages = positiveCount(params.imageCount) > 0;
  return hasImages && params.hasVideo
    ? "mixed"
    : params.hasVideo
      ? "video"
      : hasImages
        ? "images"
        : "none";
}

export function workspaceAiFamilyFailure(
  family: WorkspaceAiFamily,
  error: unknown,
  fallbackCode = `workspace_ai_${family}_unavailable`,
): WorkspaceAiFamilyFailure {
  const record =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  return cleanFailure({
    code: String(record.code || fallbackCode),
    message:
      error instanceof Error
        ? error.message
        : String(error || `Contexte IA ${family} indisponible.`),
  });
}

/**
 * A family is enrichment, not a global lock. The timeout settles as a
 * diagnostic value so a ready sibling family can still feed generation.
 */
export async function resolveWorkspaceAiFamilyWithinBudget<T>(params: {
  family: WorkspaceAiFamily;
  task: Promise<T>;
  budgetMs: number;
}): Promise<
  | { ok: true; value: T }
  | { ok: false; failure: WorkspaceAiFamilyFailure }
> {
  const budgetMs = Math.max(50, Math.min(15_000, Math.round(params.budgetMs)));
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      params.task.then(
        (value) => ({ ok: true as const, value }),
        (error) => ({
          ok: false as const,
          failure: workspaceAiFamilyFailure(params.family, error),
        }),
      ),
      new Promise<{ ok: false; failure: WorkspaceAiFamilyFailure }>(
        (resolve) => {
          timeout = setTimeout(
            () =>
              resolve({
                ok: false,
                failure: {
                  code: `workspace_ai_${params.family}_deadline_exceeded`,
                  message: `Le contexte IA ${
                    params.family === "images" ? "images" : "vidéo"
                  } n'était pas prêt dans son budget et a été ignoré pour cette génération.`,
                },
              }),
            budgetMs,
          );
        },
      ),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function workspaceAiFamilyBudget(params: {
  family: WorkspaceAiFamily;
  preferredFamily?: WorkspaceAiFamily | null;
  remainingMs?: number | null;
}) {
  const configured =
    params.family === params.preferredFamily
      ? WORKSPACE_AI_PRIMARY_FAMILY_BUDGET_MS
      : WORKSPACE_AI_SECONDARY_FAMILY_BUDGET_MS;
  const remaining =
    params.remainingMs === null || params.remainingMs === undefined
      ? Number.NaN
      : Number(params.remainingMs);
  if (!Number.isFinite(remaining)) return configured;
  // Keep at least six seconds for context/quota + the single multichannel call.
  return Math.max(50, Math.min(configured, remaining - 6_000));
}
