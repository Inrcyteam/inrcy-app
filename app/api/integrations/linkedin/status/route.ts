import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

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
    .eq("provider", "linkedin")
    .eq("source", "linkedin")
    .eq("product", "linkedin")
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  const row = (rows?.[0] as unknown) ?? null;
const accountConnected = (row as unknown)?.status === "connected";
  const connected = (row as unknown)?.status === "connected";

  return NextResponse.json({
    accountConnected,
    connected,
    display_name: (row as unknown)?.resource_label || null,
    profile_url: (row as unknown)?.meta?.profile_url || null,
  });
}
