import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { defaultNotificationPreferences } from "@/lib/notifications";

export const runtime = "nodejs";

export async function GET() {
  const { user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const defaults = defaultNotificationPreferences(user.id);
  const { data, error } = await supabaseAdmin
    .from("notification_preferences")
    .upsert(defaults, { onConflict: "user_id", ignoreDuplicates: false })
    .select("user_id, performance_enabled, action_enabled, information_enabled, digest_every_hours, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ preferences: data });
}

export async function PUT(req: Request) {
  const { user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => ({}));
  const payload = {
    user_id: user.id,
    performance_enabled: body?.performance_enabled !== false,
    action_enabled: body?.action_enabled !== false,
    information_enabled: body?.information_enabled !== false,
    digest_every_hours: Math.max(24, Math.min(168, Number(body?.digest_every_hours) || 48)),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("notification_preferences")
    .upsert(payload, { onConflict: "user_id" })
    .select("user_id, performance_enabled, action_enabled, information_enabled, digest_every_hours, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, preferences: data });
}
