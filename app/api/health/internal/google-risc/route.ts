import { NextResponse } from "next/server";
import { withApi } from "@/lib/observability/withApi";
import { requireEnv } from "@/lib/env";
import { getGoogleRiscHealthReport } from "@/lib/security/googleRisc";

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
  const report = await getGoogleRiscHealthReport();
  return NextResponse.json(report, { status: report.ok ? 200 : 503 });
}, { route: "/api/health/internal/google-risc" });
