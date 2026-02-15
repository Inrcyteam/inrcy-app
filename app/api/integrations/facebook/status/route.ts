import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return NextResponse.json({ connected: false }, { status: 200 });
  }

  const { data, error } = await supabase
    .from("stats_integrations")
    .select("id,status,resource_id,resource_label,meta")
    .eq("user_id", authData.user.id)
    .eq("provider", "facebook")
    .eq("source", "facebook")
    .eq("product", "facebook")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ connected: false, error: error.message }, { status: 200 });
  }

  const status = (data as any)?.status ?? null;
  const accountConnected = status === "account_connected" || status === "connected";
  const pageConnected = status === "connected" && !!(data as any)?.resource_id;

  return NextResponse.json({
    status,
    accountConnected,
    pageConnected,
    // Compat (ancien)
    connected: pageConnected,
    resource_id: (data as any)?.resource_id ?? null,
    resource_label: (data as any)?.resource_label ?? null,
    page_url: (data as any)?.meta?.page_url ?? null,
    user_email: (data as any)?.meta?.user_email ?? null,
    pages_found: (data as any)?.meta?.pages_found ?? null,
  });
}
