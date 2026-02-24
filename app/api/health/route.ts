import { NextResponse } from "next/server";
import { withApi } from "@/lib/observability/withApi";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const GET = withApi(async () => {
  // Public health check MUST NOT leak env state, secrets presence, or internal error details.
  // Keep it simple: a very light DB ping + build/version metadata.

  let supabaseOk = true;
  try {
    const { error } = await supabaseAdmin.from("profiles").select("user_id").limit(1);
    supabaseOk = !error;
  } catch {
    supabaseOk = false;
  }

  const ok = supabaseOk;
  return NextResponse.json(
    {
      ok,
      ts: new Date().toISOString(),
      // Useful for ops, harmless for public exposure.
      version:
        process.env.VERCEL_GIT_COMMIT_SHA ||
        process.env.NEXT_PUBLIC_COMMIT_SHA ||
        null,
    },
    { status: ok ? 200 : 503 }
  );
}, { route: "/api/health" });
