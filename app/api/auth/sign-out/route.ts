import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

/**
 * Uses a regular route instead of a Server Action so an old blocked-account
 * page cannot submit an obsolete action id after a deployment.
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServer();
  try {
    await supabase.auth.signOut();
  } catch {
    // The local session should still be sent to the login page if Supabase is
    // temporarily unavailable.
  }

  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
