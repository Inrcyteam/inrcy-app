import { NextResponse } from "next/server";
import {
  scheduledActionToDbRow,
  rowToInrAgentScheduledAction,
  type InrAgentScheduledActionSource,
} from "@/lib/inrAgentScheduledActions";
import { INR_AGENT_AUTOMATION_KEYS, type InrAgentAutomationKey } from "@/lib/inrAgentSettings";
import { INR_AGENT_ACTION_TYPES, INR_AGENT_TARGET_TOOLS, type InrAgentActionType, type InrAgentTargetTool } from "@/lib/inrAgentActions";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const SCHEDULED_ACTION_SELECT = "id, automation_key, action_type, target_tool, source, title, summary, scheduled_at, timezone, channels, payload, status, attempt_count, last_error, executed_at, created_at, updated_at";
const VISIBLE_SCHEDULED_STATUSES = ["scheduled", "running", "failed", "done", "cancelled"];

function isMissingTableError(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    error?.code === "PGRST205" ||
    message.includes("inr_agent_scheduled_actions")
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function includesValue<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value as T[number]);
}

function sanitizeText(value: unknown, fallback: string, maxLength = 180) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return (text || fallback).slice(0, maxLength);
}

function sanitizeStringArray(input: unknown) {
  if (!Array.isArray(input)) return [];
  return Array.from(new Set(input.filter((value): value is string => typeof value === "string" && value.trim().length > 0)));
}

function sanitizeFutureDate(value: unknown) {
  const date = new Date(String(value || ""));
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

export async function GET() {
  const { user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const { data, error } = await supabaseAdmin
    .from("inr_agent_scheduled_actions")
    .select(SCHEDULED_ACTION_SELECT)
    .eq("user_id", user.id)
    .in("status", VISIBLE_SCHEDULED_STATUSES)
    .order("updated_at", { ascending: false })
    .limit(150);

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ scheduledActions: [], tableMissing: true });
    }

    console.warn("[inr-agent-scheduled-actions] read failed", error);
    return NextResponse.json({ error: "Lecture des actions programmées impossible" }, { status: 500 });
  }

  const scheduledActions = Array.isArray(data) ? data.map(rowToInrAgentScheduledAction) : [];
  return NextResponse.json({ scheduledActions, tableMissing: false });
}

export async function POST(request: Request) {
  const { user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const record = asRecord(body);
  const scheduledAt = sanitizeFutureDate(record?.scheduledAt ?? record?.scheduled_at);
  if (!scheduledAt) {
    return NextResponse.json({ error: "Date de programmation invalide" }, { status: 400 });
  }

  const automationKey = includesValue(INR_AGENT_AUTOMATION_KEYS, record?.automationKey)
    ? record.automationKey as InrAgentAutomationKey
    : null;
  const actionType = includesValue(INR_AGENT_ACTION_TYPES, record?.actionType)
    ? record.actionType as InrAgentActionType
    : "custom";
  const targetTool = includesValue(INR_AGENT_TARGET_TOOLS, record?.targetTool)
    ? record.targetTool as InrAgentTargetTool
    : "agent";
  const source: InrAgentScheduledActionSource = record?.source === "automatic" ? "automatic" : "manual";

  const row = scheduledActionToDbRow({
    userId: user.id,
    automationKey,
    actionType,
    targetTool,
    source,
    title: sanitizeText(record?.title, "Action programmée"),
    summary: sanitizeText(record?.summary, "", 500),
    scheduledAt,
    timezone: sanitizeText(record?.timezone, "Europe/Paris", 80),
    channels: sanitizeStringArray(record?.channels),
    payload: asRecord(record?.payload) || {},
  });

  const { data, error } = await supabaseAdmin
    .from("inr_agent_scheduled_actions")
    .insert(row)
    .select(SCHEDULED_ACTION_SELECT)
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ error: "La table inr_agent_scheduled_actions doit être créée dans Supabase.", tableMissing: true }, { status: 500 });
    }

    console.warn("[inr-agent-scheduled-actions] insert failed", error);
    return NextResponse.json({ error: "Programmation de l’action impossible" }, { status: 500 });
  }

  return NextResponse.json({ scheduledAction: rowToInrAgentScheduledAction(data), tableMissing: false });
}
