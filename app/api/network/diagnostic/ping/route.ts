import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildPayload(req: NextRequest) {
  return {
    ok: true,
    service: "inrcy-diagnostic-ping",
    timestamp: new Date().toISOString(),
    requestId: req.headers.get("x-request-id") || null,
  };
}

export async function GET(req: NextRequest) {
  return Response.json(buildPayload(req), {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "x-inrcy-diagnostic": "1",
    },
  });
}

export async function HEAD() {
  return new Response(null, {
    status: 204,
    headers: {
      "cache-control": "no-store",
      "x-inrcy-diagnostic": "1",
    },
  });
}
