import "server-only";

import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function requireUser() {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    return {
      supabase: null as any,
      user: null as any,
      errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { supabase, user: data.user, errorResponse: null as NextResponse | null };
}
