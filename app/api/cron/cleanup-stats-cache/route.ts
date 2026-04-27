import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase
    .from("stats_cache")
    .delete()
    .lt("expires_at", new Date().toISOString());

  if (error) {
    console.error("Cleanup stats_cache error:", error);
    return NextResponse.json({ ok: false });
  }

  return NextResponse.json({ ok: true });
}