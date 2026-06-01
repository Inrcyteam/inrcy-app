import { NextResponse } from "next/server";

import { requireUser } from "@/lib/requireUser";
import { buildTiktokSettingsPatch, normalizeTiktokProfileUrl, TIKTOK_DEFAULT_MOCK_ACCOUNT } from "@/lib/tiktokMockSettings";
import { readTiktokSettings, saveTiktokSettings } from "@/lib/tiktokRouteStorage";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function POST(request: Request) {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const body = asRecord(await request.json().catch(() => ({})));
  const { root, tiktok: current } = await readTiktokSettings(supabase, user.id);
  const requestedUrl = typeof body.profileUrl === "string" && body.profileUrl.trim() ? body.profileUrl : current.profileUrl || TIKTOK_DEFAULT_MOCK_ACCOUNT.profileUrl;
  const normalized = normalizeTiktokProfileUrl(requestedUrl);

  const next = buildTiktokSettingsPatch(current, {
    connected: true,
    accountConnected: true,
    username: typeof body.username === "string" && body.username.trim() ? body.username.trim() : current.username || TIKTOK_DEFAULT_MOCK_ACCOUNT.username,
    profileUrl: normalized.ok ? normalized.url : TIKTOK_DEFAULT_MOCK_ACCOUNT.profileUrl,
    mode: "mock",
  });

  await saveTiktokSettings(supabase, user.id, root, next);
  return NextResponse.json({ ok: true, tiktok: next });
}
