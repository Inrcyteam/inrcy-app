import { NextResponse } from "next/server";

import { encryptToken, tryDecryptToken } from "@/lib/oauthCrypto";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { asRecord, asString } from "@/lib/tsSafe";
import {
  fetchYoutubeMineChannel,
  isYoutubeShortsIntegrationActive,
  readYoutubeShortsIntegration,
  refreshYoutubeShortsAccessToken,
} from "@/lib/youtubeShortsOAuth";

function isExpired(expiresAt: unknown, skewSeconds = 120) {
  const raw = asString(expiresAt);
  if (!raw) return false;
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp)
    ? timestamp <= Date.now() + skewSeconds * 1000
    : false;
}

async function getYoutubeAccessToken(userId: string, rowLike: unknown) {
  const row = asRecord(rowLike);
  let accessToken = tryDecryptToken(String(row.access_token_enc || "")) || "";
  const refreshToken =
    tryDecryptToken(String(row.refresh_token_enc || "")) || "";

  if (accessToken && !isExpired(row.expires_at)) return accessToken;
  if (!refreshToken) return accessToken;

  const refreshed = await refreshYoutubeShortsAccessToken(refreshToken);
  const nextAccessToken = (asString(refreshed.access_token) || "").trim();
  if (!nextAccessToken) return accessToken;
  const expiresIn = Number(refreshed.expires_in || 0);
  const expiresAt =
    Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : row.expires_at || null;

  await supabaseAdmin
    .from("integrations")
    .update({
      access_token_enc: encryptToken(nextAccessToken),
      expires_at: expiresAt,
      meta: {
        ...asRecord(row.meta),
        youtube_token_refreshed_at: new Date().toISOString(),
      },
    })
    .eq("user_id", userId)
    .eq("provider", "youtube")
    .eq("source", "youtube_shorts")
    .eq("product", "youtube_shorts");

  accessToken = nextAccessToken;
  return accessToken;
}

export async function GET() {
  const { errorResponse, activeUserId } = await requireUser();
  if (errorResponse) return errorResponse;

  const integration = await readYoutubeShortsIntegration(
    supabaseAdmin,
    activeUserId,
  );
  if (!isYoutubeShortsIntegrationActive(integration)) {
    return NextResponse.json(
      { ok: false, error: "YouTube à connecter avant publication." },
      { status: 409 },
    );
  }

  try {
    const accessToken = await getYoutubeAccessToken(activeUserId, integration);
    if (!accessToken) {
      return NextResponse.json(
        {
          ok: false,
          error: "Connexion YouTube expirée. Reconnectez YouTube dans Canaux.",
        },
        { status: 401 },
      );
    }

    const channel = await fetchYoutubeMineChannel(accessToken);
    if (!channel) {
      return NextResponse.json(
        { ok: false, error: "Aucune chaîne YouTube trouvée." },
        { status: 404 },
      );
    }

    const nextMeta = {
      ...asRecord(asRecord(integration).meta),
      channel_id: channel.channelId,
      channel_title: channel.channelTitle,
      channel_handle: channel.channelHandle,
      channel_url: channel.channelUrl,
      thumbnail_url: channel.thumbnailUrl || null,
      long_uploads_status: channel.longUploadsStatus,
      youtube_capabilities_checked_at: new Date().toISOString(),
    };
    await supabaseAdmin
      .from("integrations")
      .update({ meta: nextMeta })
      .eq("user_id", activeUserId)
      .eq("provider", "youtube")
      .eq("source", "youtube_shorts")
      .eq("product", "youtube_shorts");

    return NextResponse.json({
      ok: true,
      creatorInfo: {
        channelId: channel.channelId,
        channelTitle: channel.channelTitle,
        longUploadsStatus: channel.longUploadsStatus,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Impossible de vérifier les limites YouTube.",
      },
      { status: 502 },
    );
  }
}
