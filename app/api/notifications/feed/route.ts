import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { toNotificationPayload } from "@/lib/notifications";

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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = data ?? [];

  if (rows.length === 0) {
    const seed = {
      user_id: user.id,
      category: "information",
      kind: "welcome",
      title: "Votre cloche iNrCy est activée",
      body: "Vous recevrez ici vos relances Performance / Action / Information, regroupées toutes les 48 h pour garder un cockpit vivant sans vous saturer.",
      cta_label: "Régler mes notifications",
      cta_url: "/dashboard?panel=notifications",
      dedupe_key: `welcome:${user.id}`,
      meta: { seeded: true },
    };
    await supabaseAdmin.from("notifications").insert(seed);
    const seeded = await supabaseAdmin
      .from("notifications")
      .select("id, user_id, category, kind, title, body, cta_label, cta_url, read_at, meta, dedupe_key, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);
    rows = seeded.data ?? [];
  }

  const items = rows.map((row) => toNotificationPayload(row as any));
  const unreadCount = items.filter((item) => item.unread).length;

  return NextResponse.json({ items, unreadCount });
}
