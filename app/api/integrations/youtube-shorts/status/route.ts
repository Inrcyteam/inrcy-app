import { NextResponse } from "next/server";

import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { readYoutubeShortsSettingsWithOAuth } from "@/lib/youtubeShortsOAuth";

export async function GET() {
  const { user, errorResponse, activeUserId } = await requireUser();
  if (errorResponse) return errorResponse;

  const { youtubeShorts, integration } = await readYoutubeShortsSettingsWithOAuth(supabaseAdmin, activeUserId);
  return NextResponse.json({ ok: true, youtube_shorts: youtubeShorts, integration_status: integration?.status ?? null });
}
