import { NextResponse } from "next/server";

import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const PENDING_AGENT_ACTION_STATUSES = [
  "prepared",
  "pending_validation",
  "pending",
  "draft",
];

function isMissingTableError(
  error: { code?: string; message?: string } | null | undefined,
) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    error?.code === "PGRST205" ||
    message.includes("inr_agent_actions")
  );
}

export async function GET() {
  const { user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const { count, error } = await supabaseAdmin
    .from("inr_agent_actions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("validation_required", true)
    .in("status", PENDING_AGENT_ACTION_STATUSES);

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ count: 0, tableMissing: true });
    }

    console.warn("[inr-agent-pending-count] read failed", error);
    return NextResponse.json(
      { error: "Lecture du compteur iNr’Agent impossible" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    count: typeof count === "number" && Number.isFinite(count) ? count : 0,
    tableMissing: false,
  });
}
