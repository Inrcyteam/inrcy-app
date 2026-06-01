import { NextResponse } from "next/server";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { cleanupBoosterVideoStorageFromPayloads, cleanupUnusedBoosterVideoStorage } from "@/lib/boosterVideoStorageCleanup";
import { enforceRateLimit } from "@/lib/rateLimit";
import { requireUser } from "@/lib/requireUser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;

    const rateLimited = await enforceRateLimit({
      name: "booster_video_storage_cleanup",
      identifier: user.id,
      limit: 20,
      window: "1 m",
      failClosed: false,
    });
    if (rateLimited) return rateLimited;

    const body = await req.json().catch(() => ({}));
    const payloads = Array.isArray(body?.payloads) ? body.payloads : [];
    const paths = Array.isArray(body?.paths) ? body.paths : [];

    const cleanupResults: Array<{ removed: string[]; kept: string[] }> = [];
    if (payloads.length) {
      cleanupResults.push(await cleanupBoosterVideoStorageFromPayloads(user.id, payloads));
    }
    if (paths.length) {
      cleanupResults.push(await cleanupUnusedBoosterVideoStorage(user.id, paths));
    }

    const removed = Array.from(new Set(cleanupResults.flatMap((result) => result.removed || [])));
    const kept = Array.from(new Set(cleanupResults.flatMap((result) => result.kept || [])));

    return NextResponse.json({ ok: true, removed, kept });
  } catch (error) {
    console.warn("[Booster] video storage cleanup failed", error);
    return jsonUserFacingError(error, { status: 500, fallback: "Nettoyage vidéo impossible." });
  }
}
