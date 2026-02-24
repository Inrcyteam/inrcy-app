import { NextResponse } from "next/server";
import { withApi } from "@/lib/observability/withApi";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireEnv } from "@/lib/env";
import { Redis } from "@upstash/redis";

/**
 * INTERNAL health check.
 *
 * Why this exists:
 * - Public /api/health must stay minimal and not leak infra details.
 * - Ops still needs a deep check for DB/KV availability.
 *
 * Security:
 * - Requires header: x-health-token: <HEALTHCHECK_TOKEN>
 * - Returns only non-sensitive status/latency.
 */

function assertInternalAuth(req: Request) {
  const token = req.headers.get("x-health-token") || "";
  const expected = requireEnv("HEALTHCHECK_TOKEN");
  if (!expected || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

function getRedis() {
  const url = requireEnv("KV_REST_API_URL");
  const token = requireEnv("KV_REST_API_TOKEN");
  const g = globalThis as any;
  if (!g.__inrcy_health_redis) {
    g.__inrcy_health_redis = new Redis({ url, token });
  }
  return g.__inrcy_health_redis as Redis;
}

export const GET = withApi(async (req) => {
  const authRes = assertInternalAuth(req);
  if (authRes) return authRes;

  const started = Date.now();

  // Supabase ping (light).
  let supabaseOk = true;
  let supabaseMs: number | null = null;
  try {
    const t0 = Date.now();
    const { error } = await supabaseAdmin.from("profiles").select("user_id").limit(1);
    supabaseMs = Date.now() - t0;
    supabaseOk = !error;
  } catch {
    supabaseOk = false;
  }

  // KV/Upstash ping.
  let kvOk = true;
  let kvMs: number | null = null;
  try {
    const t0 = Date.now();
    const redis = getRedis();
    await redis.ping();
    kvMs = Date.now() - t0;
  } catch {
    kvOk = false;
  }

  const ok = supabaseOk && kvOk;
  return NextResponse.json(
    {
      ok,
      ts: new Date().toISOString(),
      version:
        process.env.VERCEL_GIT_COMMIT_SHA ||
        process.env.NEXT_PUBLIC_COMMIT_SHA ||
        null,
      checks: {
        supabase: { ok: supabaseOk, ms: supabaseMs },
        kv: { ok: kvOk, ms: kvMs },
      },
      total_ms: Date.now() - started,
    },
    { status: ok ? 200 : 503 }
  );
}, { route: "/api/health/internal" });
