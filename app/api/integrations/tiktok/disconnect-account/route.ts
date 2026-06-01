import { NextResponse } from "next/server";

import { requireUser } from "@/lib/requireUser";
import { buildTiktokSettingsPatch } from "@/lib/tiktokMockSettings";
import { readTiktokSettings, saveTiktokSettings } from "@/lib/tiktokRouteStorage";

export async function POST() {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const { root, tiktok: current } = await readTiktokSettings(supabase, user.id);
  const next = buildTiktokSettingsPatch(current, {
    connected: false,
    accountConnected: false,
  });

  await saveTiktokSettings(supabase, user.id, root, next);
  return NextResponse.json({ ok: true, tiktok: next });
}
