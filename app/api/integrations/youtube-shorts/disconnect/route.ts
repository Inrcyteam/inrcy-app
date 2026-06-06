import { NextResponse } from "next/server";

import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { clearAllToolCaches } from "@/lib/statsCache";
import { tryDecryptToken } from "@/lib/oauthCrypto";
import { readYoutubeShortsSettings, saveYoutubeShortsSettings } from "@/lib/youtubeShortsOAuth";

async function revokeGoogleToken(token: string) {
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString(),
    cache: "no-store",
  }).catch(() => null);
}

export async function POST() {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const { data: integration } = await supabaseAdmin
    .from("integrations")
    .select("access_token_enc,refresh_token_enc")
    .eq("user_id", user.id)
    .eq("provider", "youtube")
    .eq("source", "youtube_shorts")
    .eq("product", "youtube_shorts")
    .maybeSingle();

  const refreshToken = tryDecryptToken(integration?.refresh_token_enc);
  const accessToken = tryDecryptToken(integration?.access_token_enc);
  const tokenToRevoke = refreshToken || accessToken;
  if (tokenToRevoke) await revokeGoogleToken(tokenToRevoke);

  await supabaseAdmin
    .from("integrations")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", "youtube")
    .eq("source", "youtube_shorts")
    .eq("product", "youtube_shorts");

  const { root, youtubeShorts: current } = await readYoutubeShortsSettings(supabaseAdmin, user.id);
  const next = {
    ...current,
    connected: false,
    accountConnected: false,
    channelUrl: "",
    channelHandle: "",
    channelName: "",
    channelId: "",
    accountEmail: "",
    accountName: "",
    avatarUrl: "",
    scopes: "",
    expiresAt: null,
    stats: {
      subscriberCount: null,
      videoCount: null,
      viewCount: null,
    },
  };
  await saveYoutubeShortsSettings(supabaseAdmin, user.id, root, next);
  await clearAllToolCaches(supabase, user.id);

  return NextResponse.json({ ok: true, youtube_shorts: next });
}
