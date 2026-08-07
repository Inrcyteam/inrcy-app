import { NextRequest, NextResponse } from "next/server";
import {
  MEDIA_LIBRARY_OPTIMIZATION_JOB_TYPES,
  type MediaLibraryOptimizationJobType,
} from "@/lib/mediaLibraryOptimizationPolicy";
import { processMediaLibraryOptimizationForMedia } from "@/lib/mediaLibraryOptimizationWorker";
import { requireUser } from "@/lib/requireUser";

export const runtime = "nodejs";
export const maxDuration = 1_800;

export async function POST(request: NextRequest) {
  const { errorResponse, activeUserId } = await requireUser();
  if (errorResponse) return errorResponse;

  const body = await request.json().catch(() => ({}));
  const mediaId = String(body?.mediaId || "").trim().slice(0, 80);
  const jobType = String(body?.jobType || "").trim() as MediaLibraryOptimizationJobType;
  if (!mediaId || !MEDIA_LIBRARY_OPTIMIZATION_JOB_TYPES.includes(jobType)) {
    return NextResponse.json(
      { ok: false, error: "Tâche d’optimisation invalide." },
      { status: 400 },
    );
  }

  try {
    const result = await processMediaLibraryOptimizationForMedia({
      accountId: activeUserId,
      mediaId,
      jobType,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[media-library-optimization] direct worker failed", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Optimisation momentanément indisponible.",
      },
      { status: 500 },
    );
  }
}
