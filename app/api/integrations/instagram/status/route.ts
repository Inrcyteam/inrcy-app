import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { asRecord, asString } from "@/lib/tsSafe";

export async function GET() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) return NextResponse.json({ connected: false }, { status: 200 });

  const { data: rows } = await supabase
    .from("integrations")
    .select("status,resource_id,resource_label,meta")
    .eq("user_id", user.id)
    .eq("provider", "instagram")
    .eq("source", "instagram")
    .eq("product", "instagram")
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  const row = (rows?.[0] as unknown) ?? null;
  const rowRec = asRecord(row);
  const status = asString(rowRec["status"]);
  const accountConnected = status === "account_connected" || status === "connected";
  const connected = status === "connected" && !!asString(rowRec["resource_id"]);

  const username = String(asString(rowRec["resource_label"]) || "");
  const profile_url = username ? `https://www.instagram.com/${username}/` : "";

  return NextResponse.json({
    accountConnected,
    connected,
    username: username || null,
    profile_url: profile_url || null,
  });
}
