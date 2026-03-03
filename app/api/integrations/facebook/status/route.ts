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

  const { data, error } = await supabase
    .from("integrations")
    .select("id,status,resource_id,resource_label,meta,expires_at")
    .eq("user_id", authData.user.id)
    .eq("provider", "facebook")
    .eq("source", "facebook")
    .eq("product", "facebook")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ connected: false, error: error.message }, { status: 200 });
  }

  const rec = asRecord(data);
  const meta = asRecord(rec["meta"]);

  const status = asString(rec["status"]) ?? null;
  const accountConnectedRaw = status === "account_connected" || status === "connected";
  const expired = isExpired(rec["expires_at"]);
  const needs_reconnect = accountConnectedRaw && expired;

  // Si expiré, on ne considère pas la page comme connectée (évite les appels API qui cassent).
  const accountConnected = accountConnectedRaw;
  const pageConnected = !expired && status === "connected" && !!asString(rec["resource_id"]);

  return NextResponse.json({
    status,
    accountConnected,
    pageConnected,
    // Compat (ancien)
    connected: pageConnected,
    needs_reconnect,
    resource_id: asString(rec["resource_id"]) ?? null,
    resource_label: asString(rec["resource_label"]) ?? null,
    page_url: asString(meta["page_url"]) ?? null,
    user_email: asString(meta["user_email"]) ?? null,
    pages_found: meta["pages_found"] ?? null,
  });
}
