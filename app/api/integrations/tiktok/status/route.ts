import { NextResponse } from "next/server";

import { requireUser } from "@/lib/requireUser";
import { readTiktokSettings } from "@/lib/tiktokRouteStorage";

export async function GET() {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const { tiktok } = await readTiktokSettings(supabase, user.id);
  return NextResponse.json({ ok: true, tiktok });
}
