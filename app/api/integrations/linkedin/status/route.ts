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
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) return NextResponse.json({ connected: false }, { status: 200 });

  const { data: rows } = await supabase
    .from("integrations")
    .select("status,resource_id,resource_label,meta,expires_at")
    .eq("user_id", user.id)
    .eq("provider", "linkedin")
    .eq("source", "linkedin")
    .eq("product", "linkedin")
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  const row = (rows?.[0] as unknown) ?? null;
  const rowRec = asRecord(row);
  const status = asString(rowRec["status"]);
  const accountConnectedRaw = status === "connected";
  const expired = isExpired(rowRec["expires_at"]);
  const needs_reconnect = accountConnectedRaw && expired;
  const accountConnected = accountConnectedRaw;
  const connected = accountConnectedRaw && !expired;

  const meta = asRecord(rowRec["meta"]);

  return NextResponse.json({
    accountConnected,
    connected,
    needs_reconnect,
    display_name: asString(rowRec["resource_label"]),
    profile_url: asString(meta["profile_url"]),
  });
}
