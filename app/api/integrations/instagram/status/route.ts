import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) return NextResponse.json({ connected: false }, { status: 200 });

  const { data: row } = await supabase
    .from("stats_integrations")
    .select("status,resource_id,resource_label,meta")
    .eq("user_id", user.id)
    .eq("provider", "instagram")
    .eq("source", "instagram")
    .eq("product", "instagram")
    .maybeSingle();

  const accountConnected = (row as any)?.status === "account_connected" || (row as any)?.status === "connected";
  const connected = (row as any)?.status === "connected" && !!(row as any)?.resource_id;

  const username = String((row as any)?.resource_label || "");
  const profile_url = username ? `https://www.instagram.com/${username}/` : "";

  return NextResponse.json({
    accountConnected,
    connected,
    username: username || null,
    profile_url: profile_url || null,
  });
}
