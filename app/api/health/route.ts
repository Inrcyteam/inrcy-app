import { NextResponse } from "next/server";
import { withApi } from "@/lib/observability/withApi";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const GET = withApi(async () => {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // Env sanity
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  for (const k of required) {
    checks[`env_${k}`] = { ok: Boolean(process.env[k]) };
  }

  // Supabase ping (very light)
  try {
    const { error } = await supabaseAdmin.from("profiles").select("user_id").limit(1);
    checks.supabase = { ok: !error, detail: error?.message };
  } catch (e: any) {
    checks.supabase = { ok: false, detail: e?.message || "error" };
  }

  const ok = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    {
      ok,
      checks,
      ts: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 }
  );
}, { route: "/api/health" });
