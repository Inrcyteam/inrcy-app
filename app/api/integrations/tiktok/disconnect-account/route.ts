import { NextResponse } from "next/server";

import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { clearAllToolCaches } from "@/lib/statsCache";
import { tryDecryptToken } from "@/lib/oauthCrypto";
import { buildTiktokSettingsPatch } from "@/lib/tiktokMockSettings";
import { readTiktokSettings, saveTiktokSettings } from "@/lib/tiktokRouteStorage";

async function revokeTiktokToken(token: string) {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) return;

  await fetch("https://open.tiktokapis.com/v2/oauth/revoke/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      token,
    }).toString(),
    cache: "no-store",
  }).catch(() => null);
}

export async function POST() {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const { data: integration } = await supabaseAdmin
    .from("integrations")
    .select("access_token_enc")
    .eq("user_id", user.id)
    .eq("provider", "tiktok")
    .eq("source", "tiktok")
    .eq("product", "tiktok")
    .maybeSingle();

  const token = tryDecryptToken(integration?.access_token_enc);
  if (token) await revokeTiktokToken(token);

  await supabaseAdmin
    .from("integrations")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", "tiktok")
    .eq("source", "tiktok")
    .eq("product", "tiktok");

  const { root, tiktok: current } = await readTiktokSettings(supabaseAdmin, user.id);
  const next = buildTiktokSettingsPatch(current, {
    connected: false,
    accountConnected: false,
    username: "",
    displayName: "",
    profileUrl: "",
    avatarUrl: "",
    openId: "",
    scopes: "",
    expiresAt: null,
    mode: "oauth",
    stats: {
      followerCount: null,
      followingCount: null,
      likesCount: null,
      videoCount: null,
    },
  });

  await saveTiktokSettings(supabaseAdmin, user.id, root, next);
  await clearAllToolCaches(supabase, user.id);
  return NextResponse.json({ ok: true, tiktok: next });
}
