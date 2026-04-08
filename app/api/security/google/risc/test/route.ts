import { NextResponse } from "next/server";
import { withApi } from "@/lib/observability/withApi";
import { requireEnv } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function assertInternalAuth(req: Request) {
  const token = req.headers.get("x-health-token") || "";
  const expected = requireEnv("HEALTHCHECK_TOKEN");
  if (!expected || token !== expected) {
    return NextResponse.json({ error: "Accès non autorisé." }, { status: 401 });
  }
  return null;
}

export const POST = withApi(async (req) => {
  const authRes = assertInternalAuth(req);
  if (authRes) return authRes;

  const requestId = req.headers.get("x-request-id") || null;
  let inserted = false;
  try {
    const { error } = await supabaseAdmin.from("security_events_google").insert({
      provider: "google",
      request_id: requestId,
      jti: `internal-test-${Date.now()}`,
      event_types: ["internal_test"],
      matched_by: "none",
      action: "logged_only",
      payload: { internal_test: true },
      received_at: new Date().toISOString(),
    });
    inserted = !error;
  } catch {
    inserted = false;
  }

  return NextResponse.json({ ok: inserted, inserted, checked_at: new Date().toISOString() }, { status: inserted ? 200 : 503 });
}, { route: "/api/security/google/risc/test" });
