import { NextResponse } from "next/server";
import { rowToInrAgentAction, sanitizeInrAgentActionStatus, summarizeInrAgentActions } from "@/lib/inrAgentActions";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isMissingTableError(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42P01" || error?.code === "PGRST205" || message.includes("inr_agent_actions");
}

const ACTION_SELECT = "id, action_type, target_tool, title, summary, preview_text, target_channels, status, scheduled_for, created_at, updated_at";

export async function GET() {
  const { user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const { data, error } = await supabaseAdmin
    .from("inr_agent_actions")
    .select(ACTION_SELECT)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ actions: [], stats: summarizeInrAgentActions([]), tableMissing: true });
    }
    console.warn("[inr-agent-actions] read failed", error);
    return NextResponse.json({ error: "Lecture des actions iNr'Agent impossible" }, { status: 500 });
  }

  const actions = Array.isArray(data) ? data.map((row) => rowToInrAgentAction(row)) : [];
  return NextResponse.json({ actions, stats: summarizeInrAgentActions(actions), tableMissing: false });
}

export async function PATCH(request: Request) {
  const { user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const actionId = typeof (body as { actionId?: unknown } | null)?.actionId === "string" ? (body as { actionId: string }).actionId : "";
  const status = sanitizeInrAgentActionStatus((body as { status?: unknown } | null)?.status);

  if (!actionId || !status || !["validated", "refused", "scheduled", "pending"].includes(status)) {
    return NextResponse.json({ error: "Action ou statut invalide" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("inr_agent_actions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", actionId)
    .eq("user_id", user.id)
    .select(ACTION_SELECT)
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ error: "La table inr_agent_actions doit être créée dans Supabase.", tableMissing: true }, { status: 500 });
    }
    console.warn("[inr-agent-actions] update failed", error);
    return NextResponse.json({ error: "Mise à jour de l'action iNr'Agent impossible" }, { status: 500 });
  }

  const action = rowToInrAgentAction(data);
  return NextResponse.json({ action, saved: true });
}
