
import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { asRecord, asString } from "@/lib/tsSafe";

function isExpired(expiresAt: unknown, skewSeconds = 60) {
  const iso = asString(expiresAt);
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return t <= Date.now() + skewSeconds * 1000;
}

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return NextResponse.json({ connected: false }, { status: 200 });
  }

  const { data: rows, error } = await supabase
    .from("integrations")
    .select("id,status,resource_id,resource_label,meta,expires_at,updated_at,created_at")
    .eq("user_id", authData.user.id)
    .eq("provider", "facebook")
    .eq("source", "facebook")
    .eq("product", "facebook")
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    return NextResponse.json({ connected: false, error: error.message }, { status: 200 });
  }

  const rec = rows?.[0] ?? null;
  const r = asRecord(rec);
  const status = asString(r["status"]);
  const expired = isExpired(r["expires_at"]);

  const accountConnected = status === "account_connected" || status === "connected";
  const pageConnected = !expired && status === "connected" && !!asString(r["resource_id"]);

  return NextResponse.json({
    accountConnected,
    pageConnected,
    expired,
    resource_id: asString(r["resource_id"]) || null,
    resource_label: asString(r["resource_label"]) || null,
  });
}
