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
    .select("id,status")
    .eq("user_id", authData.user.id)
    .eq("provider", "google")
    .eq("source", "gmb")
    .eq("product", "gmb")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ connected: false, error: error.message }, { status: 200 });
  }

  return NextResponse.json({ connected: !!data && data.status === "connected" });
}
