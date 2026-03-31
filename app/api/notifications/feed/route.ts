import { NextResponse } from "next/server";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { toNotificationPayload, type NotificationRow } from "@/lib/notifications";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const url = new URL(req.url);
  const limit = Math.max(5, Math.min(50, Number(url.searchParams.get("limit") || 12)));

  const { data: pref } = await supabaseAdmin
    .from("notification_preferences")
    .select("in_app_enabled")
    .eq("user_id", user.id)
    .maybeSingle();

  if (pref && pref.in_app_enabled === false) {
    return NextResponse.json({ items: [], unreadCount: 0 });
  }

  const { data, error } = await supabaseAdmin
    .from("notifications")
    .select("id, user_id, category, kind, title, body, cta_label, cta_url, read_at, meta, dedupe_key, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return jsonUserFacingError(error, { status: 500 });

  const rows = data ?? [];

  const items = rows.map((row) => toNotificationPayload(row as NotificationRow));
  const unreadCount = items.filter((item) => item.unread).length;

  return NextResponse.json({ items, unreadCount });
}
