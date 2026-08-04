import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { syncPendingTiktokPublications } from "@/lib/tiktokPendingPublicationWatcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function readLimit(req: Request) {
  const value = Number(new URL(req.url).searchParams.get("limit") || 20);
  if (!Number.isFinite(value)) return 20;
  return Math.max(1, Math.min(50, Math.floor(value)));
}

async function handler(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  try {
    const result = await syncPendingTiktokPublications({
      limit: readLimit(req),
      minCheckIntervalMs: 45_000,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[tiktok-watcher] cron failed", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Suivi automatique TikTok impossible.",
      },
      { status: 500 },
    );
  }
}

export const GET = handler;
export const POST = handler;
