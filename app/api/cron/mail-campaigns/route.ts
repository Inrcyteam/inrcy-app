import { NextResponse } from "next/server";
import { processPendingMailCampaigns } from "@/lib/crmCampaigns";

export const runtime = "nodejs";

function isAuthorizedCron(req: Request) {
  const cronSecret = process.env.VERCEL_CRON_SECRET || process.env.CRON_SECRET || "";
  if (!cronSecret) return false;
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerSecret = (req.headers.get("x-cron-secret") || "").trim();
  const querySecret = new URL(req.url).searchParams.get("secret") || "";
  return bearer === cronSecret || headerSecret === cronSecret || querySecret === cronSecret;
}

export async function POST(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  try {
    const summary = await processPendingMailCampaigns({ maxCampaigns: 10 });
    return NextResponse.json({ success: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Traitement des campagnes impossible.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
