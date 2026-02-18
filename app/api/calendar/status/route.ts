import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ connected: false }, { status: 401 });

  const { data } = await supabase
    .from("integrations")
    .select("id,status")
    .eq("user_id", auth.user.id)
    .eq("provider", "google")
    .eq("category", "calendar")
    .eq("status", "connected")
    .limit(1);

  return NextResponse.json({ connected: Boolean(data?.[0]) });
}
