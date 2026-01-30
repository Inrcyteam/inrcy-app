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
    .select("id,status,resource_id,resource_label")
    .eq("user_id", authData.user.id)
    .eq("provider", "facebook")
    .eq("source", "facebook")
    .eq("product", "facebook")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ connected: false, error: error.message }, { status: 200 });
  }

  return NextResponse.json({
    connected: !!data && data.status === "connected",
    resource_id: (data as any)?.resource_id ?? null,
    resource_label: (data as any)?.resource_label ?? null,
  });
}
