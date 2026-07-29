import { NextResponse } from "next/server";
import { repairPendingVideoNormalizationQueue } from "@/lib/mediaVideoNormalizationQueue";
import { processVideoNormalizationJobs } from "@/lib/mediaVideoNormalizationWorker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorizedCron(req: Request) {
  const cronSecret =
    process.env.VERCEL_CRON_SECRET || process.env.CRON_SECRET || "";
  if (!cronSecret) return false;
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerSecret = (req.headers.get("x-cron-secret") || "").trim();
  const querySecret = new URL(req.url).searchParams.get("secret") || "";
  return (
    bearer === cronSecret ||
    headerSecret === cronSecret ||
    querySecret === cronSecret
  );
}

export async function POST(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  try {
    const repaired = await repairPendingVideoNormalizationQueue({ limit: 10 });
    const processed = await processVideoNormalizationJobs({ limit: 1 });
    return NextResponse.json({
      success: true,
      repaired,
      processed,
    });
  } catch (error) {
    console.error("[media-pipeline] video normalization cron failed", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Traitement des vidéos impossible.",
      },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  return POST(req);
}
