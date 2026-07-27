import { NextResponse } from "next/server";
import { scanConnectedMailboxesForFeedback } from "@/lib/mailBounceScanner";
import { captureApiException } from "@/lib/observability/sentry";

export const runtime = "nodejs";
export const maxDuration = 120;

function isAuthorizedCron(req: Request) {
  const secret = process.env.VERCEL_CRON_SECRET || process.env.CRON_SECRET || "";
  if (!secret) return false;
  const authorization = req.headers.get("authorization") || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  return bearer === secret || req.headers.get("x-cron-secret") === secret || new URL(req.url).searchParams.get("secret") === secret;
}

async function run(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  try {
    const summary = await scanConnectedMailboxesForFeedback({ maxAccounts: 8 });
    return NextResponse.json({ success: true, summary });
  } catch (error) {
    captureApiException(req, error, { area: "inrsend", operation: "mail bounce scan", statusCode: 500 });
    return NextResponse.json({ error: "Analyse des retours mail impossible." }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
