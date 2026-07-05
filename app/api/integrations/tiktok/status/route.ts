import { NextResponse } from "next/server";

import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { readTiktokSettingsWithOAuth } from "@/lib/tiktokRouteStorage";

export async function GET() {
  const { user, errorResponse, activeUserId } = await requireUser();
  if (errorResponse) return errorResponse;

  const { tiktok } = await readTiktokSettingsWithOAuth(supabaseAdmin, activeUserId);
  return NextResponse.json({ ok: true, tiktok });
}
