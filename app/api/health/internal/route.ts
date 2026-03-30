import { NextResponse } from "next/server";
import { withApi } from "@/lib/observability/withApi";
import { requireEnv } from "@/lib/env";
import { runDeepHealthChecks } from "@/lib/health/checks";

/**
 * INTERNAL health check.
 *
 * Why this exists:
 * - Public /api/health must stay minimal and not leak infra details.
 * - Ops still needs a deep check for DB/KV/Stripe/SMTP availability.
 *
 * Security:
 * - Requires header: x-health-token: <HEALTHCHECK_TOKEN>
 * - Returns only non-sensitive status/latency.
 */

function assertInternalAuth(req: Request) {
  const token = req.headers.get("x-health-token") || "";
  const expected = requireEnv("HEALTHCHECK_TOKEN");
  if (!expected || token !== expected) {
    return NextResponse.json({ error: "Accès non autorisé." }, { status: 401 });
  }
  return null;
}

export const GET = withApi(async (req) => {
  const authRes = assertInternalAuth(req);
  if (authRes) return authRes;

  const report = await runDeepHealthChecks();
  return NextResponse.json(report, { status: report.ok ? 200 : 503 });
}, { route: "/api/health/internal" });
