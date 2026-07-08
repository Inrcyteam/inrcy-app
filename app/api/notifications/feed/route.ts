import { NextResponse } from "next/server";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { toNotificationPayload, type NotificationRow } from "@/lib/notifications";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { user, errorResponse, activeUserId } = await requireUser();
  if (errorResponse) return errorResponse;

  const url = new URL(req.url);
  const limit = Math.max(5, Math.min(50, Number(url.searchParams.get("limit") || 12)));

  const { data: pref } = await supabaseAdmin
    .from("notification_preferences")
    .select("in_app_enabled")
    .eq("user_id", activeUserId)
    .maybeSingle();

  if (pref && pref.in_app_enabled === false) {
    return NextResponse.json({ items: [], unreadCount: 0, totalCount: 0 });
  }

  const [feedResult, countResult] = await Promise.all([
    supabaseAdmin
      .from("notifications")
      .select("id, user_id, category, kind, title, body, cta_label, cta_url, read_at, meta, dedupe_key, created_at")
      .eq("user_id", activeUserId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabaseAdmin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", activeUserId),
  ]);

  if (feedResult.error) return jsonUserFacingError(feedResult.error, { status: 500 });

  const rows = feedResult.data ?? [];
  const items = rows.map((row) => toNotificationPayload(row as NotificationRow));
  const unreadCount = items.filter((item) => item.unread).length;
  const totalCount = countResult.error
    ? items.length
    : Math.max(0, Number(countResult.count ?? items.length));

  return NextResponse.json({ items, unreadCount, totalCount });
}
