import { NextResponse } from "next/server";

import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { clearAllToolCaches } from "@/lib/statsCache";
import { revokeGoogleTokensBestEffort, shouldRevokeGoogleTokensForDisconnect } from "@/lib/googleOAuthRevoke";
import { isYoutubeUsingDedicatedOAuthClient, readYoutubeShortsSettings, saveYoutubeShortsSettings } from "@/lib/youtubeShortsOAuth";

export async function POST() {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const { data: integration } = await supabaseAdmin
    .from("integrations")
    .select("id,provider_account_id,email_address,access_token_enc,refresh_token_enc")
    .eq("user_id", user.id)
    .eq("provider", "youtube")
    .eq("source", "youtube_shorts")
    .eq("product", "youtube_shorts")
    .maybeSingle();

  const canRevokeGoogleAuth = isYoutubeUsingDedicatedOAuthClient()
    ? true
    : await shouldRevokeGoogleTokensForDisconnect({
        userId: user.id,
        rows: integration ? [integration] : [],
        context: "youtube_disconnect",
      });

  if (canRevokeGoogleAuth && integration) {
    await revokeGoogleTokensBestEffort({
      integrationId: String(integration.id || ""),
      accessTokenEnc: integration.access_token_enc || null,
      refreshTokenEnc: integration.refresh_token_enc || null,
      context: "youtube_disconnect",
    });
  }

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
