import { NextResponse } from "next/server";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST() {
  const { errorResponse, activeUserId } = await requireUser();
  if (errorResponse) return errorResponse;

  const { error } = await supabaseAdmin
    .from("notifications")
    .delete()
    .eq("user_id", activeUserId);

  if (error) return jsonUserFacingError(error, { status: 500 });
  return NextResponse.json({ ok: true });
}
