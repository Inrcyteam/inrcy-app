import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { processPendingTiktokPublications } from "@/lib/tiktokPendingPublicationWatcher";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "Non autorisé." }, { status: 401 });
  }

  try {
    const result = await processPendingTiktokPublications({ limit: 75 });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[tiktok-publication-cron] watcher failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Suivi TikTok impossible.",
      },
      { status: 500 },
    );
  }
}
