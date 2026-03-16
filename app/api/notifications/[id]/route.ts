import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;
  const { id } = await ctx.params;

  const { error } = await supabaseAdmin
    .from("notifications")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
