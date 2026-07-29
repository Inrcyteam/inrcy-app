import { NextResponse } from "next/server";
import { repairPendingImageNormalizationQueue } from "@/lib/mediaImageNormalizationQueue";
import { processImageNormalizationJobs } from "@/lib/mediaImageNormalizationWorker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

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

function readLimit(req: Request) {
  const requested = Number(new URL(req.url).searchParams.get("limit") || 2);
  return Number.isFinite(requested) ? requested : 2;
}

export async function POST(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  try {
    const repaired = await repairPendingImageNormalizationQueue({ limit: 20 });
    const processed = await processImageNormalizationJobs({
      limit: readLimit(req),
    });
    return NextResponse.json({
      success: true,
      repaired,
      processed,
    });
  } catch (error) {
    console.error("[media-pipeline] image normalization cron failed", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Traitement des images impossible.",
      },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  return POST(req);
}
