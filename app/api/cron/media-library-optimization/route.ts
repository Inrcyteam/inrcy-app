import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { processMediaLibraryOptimizationJobs } from "@/lib/mediaLibraryOptimizationWorker";

export const runtime = "nodejs";
export const maxDuration = 1_800;

export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await processMediaLibraryOptimizationJobs({ limit: 1 });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[media-library-optimization] cron failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Worker indisponible.",
      },
      { status: 500 },
    );
  }
}

export const GET = POST;
