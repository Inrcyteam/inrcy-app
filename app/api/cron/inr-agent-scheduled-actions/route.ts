import { NextResponse } from "next/server";
import { buildInternalCronHeaders, getAppOriginFromRequest, isAuthorizedCronRequest } from "@/lib/cronAuth";
import { processPendingMailCampaigns } from "@/lib/crmCampaigns";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 120;

const SCHEDULED_ACTION_SELECT = "id,user_id,automation_key,action_type,target_tool,source,title,summary,scheduled_at,timezone,channels,payload,status,attempt_count,last_error,executed_at,created_at,updated_at";
const STALE_RUNNING_MINUTES = 20;
const MAX_EXECUTION_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5 * 60 * 1000;

type ScheduledActionCronRow = {
  id: string;
  user_id: string;
  automation_key: string | null;
  action_type: string | null;
  target_tool: string | null;
  source: string | null;
  title: string | null;
  summary: string | null;
  scheduled_at: string | null;
  timezone: string | null;
  channels: string[] | null;
  payload: Record<string, unknown> | null;
  status: string | null;
  attempt_count: number | null;
  last_error: string | null;
  executed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ExecutionResult = {
  ok: boolean;
  status: "done" | "failed" | "retried" | "skipped";
  scheduledActionId: string;
  targetTool: string;
  error?: string | null;
  detail?: string | null;
  retriable?: boolean;
  nextRetryAt?: string | null;
  campaignId?: string | null;
  publicationId?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function trimDiagnosticText(value: unknown, maxLength = 1600) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    error?.code === "PGRST205" ||
    message.includes("inr_agent_scheduled_actions")
  );
}

function isRetriableHttpFailure(status: number | null, message?: string | null) {
  const text = String(message || "").toLowerCase();
  if (text.includes("aborted") || text.includes("timeout") || text.includes("fetch failed")) return true;
  if (!status) return true;
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function safeJsonParse(text: string): Record<string, unknown> {
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return {};
  }
}

function errorFromPayload(payload: Record<string, unknown>, fallback: string) {
  return (
    trimDiagnosticText(payload.error, 500) ||
    trimDiagnosticText(payload.message, 500) ||
    trimDiagnosticText(payload.detail, 500) ||
    fallback
  );
}

function mergeExecutionPayload(row: ScheduledActionCronRow, execution: Record<string, unknown>) {
  return {
    ...asRecord(row.payload),
    lastExecution: {
      ...execution,
      at: new Date().toISOString(),
    },
  };
}

function scheduledActionLabel(row: ScheduledActionCronRow) {
  const targetTool = String(row.target_tool || "").toLowerCase();
  const automationKey = String(row.automation_key || "").toLowerCase();
  const actionType = String(row.action_type || "").toLowerCase();

  if (targetTool === "booster" || actionType === "publication") return "Publication";
  if (automationKey === "grow" || targetTool === "propulser") return "Propulsion";
  if (automationKey === "loyalty" || targetTool === "fideliser") return "Fidélisation";
  if (targetTool === "mails" || actionType === "mailing") return "Mail";
  if (actionType === "campaign") return "Campagne mail";
  return "Action programmée";
}

async function notifyScheduledActionOutcome(row: ScheduledActionCronRow, args: {
  outcome: "done" | "failed";
  error?: string | null;
  campaignId?: string | null;
  publicationId?: string | null;
}) {
  const title = String(row.title || scheduledActionLabel(row) || "Action programmée").trim();
  const label = scheduledActionLabel(row);
  const isDone = args.outcome === "done";
  const notificationTitle = isDone
    ? `${label} exécutée par iNr’Agent`
    : `${label} en erreur`;
  const notificationBody = isDone
    ? `${title} a bien été exécutée au moment prévu.`
    : `${title} n’a pas pu être exécutée. ${trimDiagnosticText(args.error || row.last_error || "Consultez le planning iNr’Agent pour corriger l’action.", 500)}`;

  const { error } = await supabaseAdmin.from("notifications").insert({
    user_id: row.user_id,
    category: isDone ? "information" : "action",
    kind: isDone ? "inragent_scheduled_action_done" : "inragent_scheduled_action_failed",
    title: notificationTitle,
    body: notificationBody,
    cta_label: "Ouvrir iNr’Agent",
    cta_url: "/dashboard/agent",
    dedupe_key: `inragent_scheduled_action:${row.id}:${args.outcome}`,
    meta: {
      source: "inr_agent",
      scheduledActionId: row.id,
      outcome: args.outcome,
      automationKey: row.automation_key || null,
      actionType: row.action_type || null,
      targetTool: row.target_tool || null,
      campaignId: args.campaignId || null,
      publicationId: args.publicationId || null,
    },
  });

  if (error) {
    console.warn("[inr-agent-scheduled-actions] notification insert failed", error);
  }
}


async function resetStaleRunningActions() {
  const staleBefore = new Date(Date.now() - STALE_RUNNING_MINUTES * 60 * 1000).toISOString();
  const { error } = await supabaseAdmin
    .from("inr_agent_scheduled_actions")
    .update({
      status: "scheduled",
      last_error: "Reprise automatique après interruption de l’exécution.",
      updated_at: new Date().toISOString(),
    })
    .eq("status", "running")
    .lt("updated_at", staleBefore);

  if (error && !isMissingTableError(error)) {
    console.warn("[inr-agent-scheduled-actions] stale running reset failed", error);
  }
}

async function claimAction(row: ScheduledActionCronRow) {
  const attemptCount = Math.max(0, Number(row.attempt_count || 0)) + 1;
  const { data, error } = await supabaseAdmin
    .from("inr_agent_scheduled_actions")
    .update({
      status: "running",
      attempt_count: attemptCount,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("status", "scheduled")
    .select(SCHEDULED_ACTION_SELECT)
    .maybeSingle();

  if (error) throw error;
  return data as ScheduledActionCronRow | null;
}

async function markDone(row: ScheduledActionCronRow, execution: Record<string, unknown>) {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("inr_agent_scheduled_actions")
    .update({
      status: "done",
      executed_at: now,
      last_error: null,
      payload: mergeExecutionPayload(row, { ...execution, status: "done" }),
      updated_at: now,
    })
    .eq("id", row.id);

  if (error) throw error;
}

async function markFailedOrRetry(row: ScheduledActionCronRow, args: { error: string; detail?: string | null; retriable: boolean; httpStatus?: number | null; payload?: Record<string, unknown> }) {
  const now = new Date();
  const attemptCount = Math.max(1, Number(row.attempt_count || 1));
  const shouldRetry = args.retriable && attemptCount < MAX_EXECUTION_ATTEMPTS;
  const nextRetryAt = shouldRetry ? new Date(now.getTime() + RETRY_DELAY_MS).toISOString() : null;
  const status = shouldRetry ? "scheduled" : "failed";
  const { error } = await supabaseAdmin
    .from("inr_agent_scheduled_actions")
    .update({
      status,
      scheduled_at: nextRetryAt || row.scheduled_at,
      last_error: args.error,
      payload: mergeExecutionPayload(row, {
        status,
        error: args.error,
        detail: args.detail || null,
        httpStatus: args.httpStatus || null,
        retriable: args.retriable,
        nextRetryAt,
        attemptCount,
        response: args.payload || null,
      }),
      updated_at: now.toISOString(),
    })
    .eq("id", row.id);

  if (error) throw error;
  return { status, nextRetryAt };
}

async function postInternalJson(args: { origin: string; userId: string; path: string; body: Record<string, unknown>; timeoutMs: number }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    const response = await fetch(`${args.origin}${args.path}`, {
      method: "POST",
      headers: buildInternalCronHeaders(args.userId),
      body: JSON.stringify(args.body),
      cache: "no-store",
      signal: controller.signal,
    });
    const responseText = await response.text().catch(() => "");
    const payload = safeJsonParse(responseText);
    return { response, responseText, payload };
  } finally {
    clearTimeout(timeout);
  }
}

async function executeMailCampaign(row: ScheduledActionCronRow, origin: string, timeoutMs: number): Promise<ExecutionResult> {
  const payload = asRecord(row.payload);
  const campaign = asRecord(payload.campaign);
  if (!Object.keys(campaign).length) {
    return {
      ok: false,
      status: "failed",
      scheduledActionId: row.id,
      targetTool: String(row.target_tool || "mails"),
      error: "Campagne programmée incomplète.",
      detail: "Le payload ne contient pas de bloc campaign.",
      retriable: false,
    };
  }

  const metadata = {
    ...asRecord(campaign.metadata),
    source: "inr_agent",
    label: "iNr'Agent",
    agentActionId: row.id,
    automationKey: String(row.automation_key || ""),
    targetTool: String(row.target_tool || "mails"),
    actionType: String(row.action_type || "campaign"),
  };

  try {
    const { response, responseText, payload: responsePayload } = await postInternalJson({
      origin,
      userId: row.user_id,
      path: "/api/crm/campaigns",
      timeoutMs,
      body: {
        ...campaign,
        metadata,
      },
    });

    if (!response.ok) {
      const error = errorFromPayload(responsePayload, response.statusText || "Création de campagne impossible.");
      const detail = trimDiagnosticText(responsePayload.detail, 900) || trimDiagnosticText(responseText, 900) || null;
      return {
        ok: false,
        status: "failed",
        scheduledActionId: row.id,
        targetTool: String(row.target_tool || "mails"),
        error,
        detail,
        retriable: isRetriableHttpFailure(response.status, error),
      };
    }

    const campaignId = typeof responsePayload.campaignId === "string" ? responsePayload.campaignId : null;
    if (!campaignId) {
      return {
        ok: false,
        status: "failed",
        scheduledActionId: row.id,
        targetTool: String(row.target_tool || "mails"),
        error: "Campagne créée mais identifiant introuvable.",
        detail: "La route /api/crm/campaigns n’a pas renvoyé campaignId.",
        retriable: true,
      };
    }

    try {
      await processPendingMailCampaigns({ campaignIds: [campaignId], maxCampaigns: 1 });
    } catch (dispatchError) {
      console.warn("[inr-agent-scheduled-actions] immediate campaign dispatch failed", dispatchError);
    }

    return {
      ok: true,
      status: "done",
      scheduledActionId: row.id,
      targetTool: String(row.target_tool || "mails"),
      campaignId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Campagne programmée impossible.";
    return {
      ok: false,
      status: "failed",
      scheduledActionId: row.id,
      targetTool: String(row.target_tool || "mails"),
      error: message,
      detail: error instanceof Error ? error.stack?.slice(0, 1600) || null : null,
      retriable: isRetriableHttpFailure(null, message),
    };
  }
}

async function executePublication(row: ScheduledActionCronRow, origin: string, timeoutMs: number): Promise<ExecutionResult> {
  const payload = asRecord(row.payload);
  const publishPayload = asRecord(payload.publishPayload);
  if (!Object.keys(publishPayload).length) {
    return {
      ok: false,
      status: "failed",
      scheduledActionId: row.id,
      targetTool: String(row.target_tool || "booster"),
      error: "Publication programmée incomplète.",
      detail: "Le payload ne contient pas de bloc publishPayload.",
      retriable: false,
    };
  }

  try {
    const { response, responseText, payload: responsePayload } = await postInternalJson({
      origin,
      userId: row.user_id,
      path: "/api/booster/publish-now",
      timeoutMs,
      body: {
        ...publishPayload,
        source: "inr_agent",
        origin: {
          ...asRecord(publishPayload.origin),
          source: "inr_agent",
          agentActionId: row.id,
          automationKey: "publish",
        },
      },
    });

    const okFlag = responsePayload.ok !== false;
    if (!response.ok || !okFlag) {
      const error = errorFromPayload(responsePayload, response.statusText || "Publication impossible.");
      const detail = trimDiagnosticText(responsePayload.detail, 900) || trimDiagnosticText(responseText, 900) || null;
      return {
        ok: false,
        status: "failed",
        scheduledActionId: row.id,
        targetTool: String(row.target_tool || "booster"),
        error,
        detail,
        retriable: response.ok ? false : isRetriableHttpFailure(response.status, error),
      };
    }

    const publicationId = typeof responsePayload.publication_id === "string" ? responsePayload.publication_id : null;
    return {
      ok: true,
      status: "done",
      scheduledActionId: row.id,
      targetTool: String(row.target_tool || "booster"),
      publicationId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Publication programmée impossible.";
    return {
      ok: false,
      status: "failed",
      scheduledActionId: row.id,
      targetTool: String(row.target_tool || "booster"),
      error: message,
      detail: error instanceof Error ? error.stack?.slice(0, 1600) || null : null,
      retriable: isRetriableHttpFailure(null, message),
    };
  }
}

async function executeScheduledAction(row: ScheduledActionCronRow, origin: string, timeoutMs: number): Promise<ExecutionResult> {
  const targetTool = String(row.target_tool || "").toLowerCase();
  const actionType = String(row.action_type || "").toLowerCase();
  const payload = asRecord(row.payload);
  const kind = String(payload.kind || "").toLowerCase();

  if (targetTool === "booster" || actionType === "publication" || kind === "manual_publish_schedule") {
    return executePublication(row, origin, timeoutMs);
  }

  if (
    targetTool === "mails" ||
    targetTool === "propulser" ||
    targetTool === "fideliser" ||
    actionType === "campaign" ||
    actionType === "mailing" ||
    kind === "mail_campaign"
  ) {
    return executeMailCampaign(row, origin, timeoutMs);
  }

  return {
    ok: false,
    status: "failed",
    scheduledActionId: row.id,
    targetTool: targetTool || "agent",
    error: "Type d’action programmée non pris en charge.",
    detail: `target_tool=${targetTool || "?"}, action_type=${actionType || "?"}, kind=${kind || "?"}`,
    retriable: false,
  };
}

async function processDueScheduledActions(args: { origin: string; maxRows: number; timeoutMs: number; dryRun: boolean }) {
  await resetStaleRunningActions();

  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("inr_agent_scheduled_actions")
    .select(SCHEDULED_ACTION_SELECT)
    .eq("status", "scheduled")
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(args.maxRows);

  if (error) {
    if (isMissingTableError(error)) {
      return { tableMissing: true, results: [] as ExecutionResult[] };
    }
    throw error;
  }

  const rows = (Array.isArray(data) ? data : []) as ScheduledActionCronRow[];
  const results: ExecutionResult[] = [];

  for (const row of rows) {
    if (args.dryRun) {
      results.push({
        ok: true,
        status: "skipped",
        scheduledActionId: row.id,
        targetTool: String(row.target_tool || "agent"),
        detail: "dry_run",
      });
      continue;
    }

    let claimed: ScheduledActionCronRow | null = null;
    try {
      claimed = await claimAction(row);
    } catch (claimError) {
      const message = claimError instanceof Error ? claimError.message : "Verrouillage impossible.";
      results.push({
        ok: false,
        status: "failed",
        scheduledActionId: row.id,
        targetTool: String(row.target_tool || "agent"),
        error: message,
        retriable: true,
      });
      continue;
    }

    if (!claimed) {
      results.push({
        ok: true,
        status: "skipped",
        scheduledActionId: row.id,
        targetTool: String(row.target_tool || "agent"),
        detail: "already_claimed",
      });
      continue;
    }

    const result = await executeScheduledAction(claimed, args.origin, args.timeoutMs);
    try {
      if (result.ok) {
        await markDone(claimed, {
          targetTool: result.targetTool,
          campaignId: result.campaignId || null,
          publicationId: result.publicationId || null,
        });
        await notifyScheduledActionOutcome(claimed, {
          outcome: "done",
          campaignId: result.campaignId || null,
          publicationId: result.publicationId || null,
        });
      } else {
        const failure = await markFailedOrRetry(claimed, {
          error: result.error || "Action programmée impossible.",
          detail: result.detail || null,
          retriable: result.retriable === true,
        });
        result.status = failure.status === "scheduled" ? "retried" : "failed";
        result.nextRetryAt = failure.nextRetryAt;
        if (result.status === "failed") {
          await notifyScheduledActionOutcome(claimed, {
            outcome: "failed",
            error: result.error || "Action programmée impossible.",
          });
        }
      }
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : "Mise à jour du statut impossible.";
      results.push({ ...result, ok: false, status: "failed", error: message, retriable: true });
      continue;
    }

    results.push(result);
  }

  return { tableMissing: false, results };
}

export async function POST(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const maxRows = Math.min(50, Math.max(1, Number(url.searchParams.get("max") || 20)));
  const timeoutMs = Math.min(120_000, Math.max(15_000, Number(url.searchParams.get("timeoutMs") || 60_000)));
  const origin = getAppOriginFromRequest(req);

  try {
    const { tableMissing, results } = await processDueScheduledActions({ origin, maxRows, timeoutMs, dryRun });
    const summary = results.reduce<Record<string, number>>((acc, result) => {
      acc[result.status] = (acc[result.status] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      success: !tableMissing,
      tableMissing,
      dryRun,
      processed: results.length,
      summary,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Traitement des actions programmées impossible.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
