import { NextResponse } from "next/server";
import { rowToInrAgentScheduledAction } from "@/lib/inrAgentScheduledActions";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const SCHEDULED_ACTION_SELECT = "id, automation_key, action_type, target_tool, source, title, summary, scheduled_at, timezone, channels, payload, status, attempt_count, last_error, executed_at, created_at, updated_at";

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

function sanitizeFutureDate(value: unknown) {
  const date = new Date(String(value || ""));
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const record = asRecord(body);
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (record?.status === "cancelled") updates.status = "cancelled";
  if (typeof record?.title === "string" && record.title.trim()) updates.title = record.title.trim().slice(0, 180);
  if (typeof record?.summary === "string") updates.summary = record.summary.trim().slice(0, 500);
  if (record && "scheduledAt" in record) {
    const scheduledAt = sanitizeFutureDate(record.scheduledAt);
    if (!scheduledAt) return NextResponse.json({ error: "Date de programmation invalide" }, { status: 400 });
    updates.scheduled_at = scheduledAt;
  }

  const { data, error } = await supabaseAdmin
    .from("inr_agent_scheduled_actions")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select(SCHEDULED_ACTION_SELECT)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ error: "La table inr_agent_scheduled_actions doit être créée dans Supabase.", tableMissing: true }, { status: 500 });
    }

    console.warn("[inr-agent-scheduled-actions] update failed", error);
    return NextResponse.json({ error: "Modification de l’action programmée impossible" }, { status: 500 });
  }

  if (!data) return NextResponse.json({ error: "Action programmée introuvable" }, { status: 404 });
  return NextResponse.json({ scheduledAction: rowToInrAgentScheduledAction(data), tableMissing: false });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;
  const { id } = await ctx.params;

  const { data, error } = await supabaseAdmin
    .from("inr_agent_scheduled_actions")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select(SCHEDULED_ACTION_SELECT)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ error: "La table inr_agent_scheduled_actions doit être créée dans Supabase.", tableMissing: true }, { status: 500 });
    }

    console.warn("[inr-agent-scheduled-actions] cancel failed", error);
    return NextResponse.json({ error: "Annulation de l’action programmée impossible" }, { status: 500 });
  }

  if (!data) return NextResponse.json({ error: "Action programmée introuvable" }, { status: 404 });
  return NextResponse.json({ scheduledAction: rowToInrAgentScheduledAction(data), cancelled: true, tableMissing: false });
}
