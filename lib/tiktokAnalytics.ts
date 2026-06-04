import "server-only";

import { asNumber, asRecord, asString } from "@/lib/tsSafe";
import { fetchTiktokUserInfo } from "@/lib/tiktokOAuth";

export type TiktokVideoMetric = {
  id: string;
  title: string;
  createTime: number | null;
  shareUrl: string;
  coverImageUrl: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
};

export type TiktokAnalyticsSnapshot = {
  totals: {
    followers: number;
    following: number;
    likes: number;
    likes_total: number;
    video_count: number;
    videos_public: number;
    postsPublished: number;
    video_views: number;
    views: number;
    impressions: number;
    engagements: number;
    likes_period: number;
    comments: number;
    shares: number;
    saves: number;
    profile_views: number;
    website_clicks: number;
    messages: number;
  };
  profile: {
    open_id: string;
    username: string;
    display_name: string;
    avatar_url: string;
    profile_deep_link: string;
    bio_description: string;
    is_verified: boolean;
  };
  videos: TiktokVideoMetric[];
  raw: Record<string, unknown>;
};

type FetchVideoListResult = {
  videos: TiktokVideoMetric[];
  rawPages: unknown[];
  error?: string;
};

function safeNum(value: unknown) {
  return Math.max(0, Math.round(asNumber(value) ?? 0));
}

function safeBool(value: unknown) {
  return value === true || String(value || "").toLowerCase() === "true";
}

function normalizeVideo(entry: unknown): TiktokVideoMetric {
  const rec = asRecord(entry);
  return {
    id: asString(rec.id) || "",
    title: asString(rec.title) || "",
    createTime: asNumber(rec.create_time),
    shareUrl: asString(rec.share_url) || "",
    coverImageUrl: asString(rec.cover_image_url) || "",
    viewCount: safeNum(rec.view_count),
    likeCount: safeNum(rec.like_count),
    commentCount: safeNum(rec.comment_count),
    shareCount: safeNum(rec.share_count),
  };
}

function tiktokApiError(data: unknown, fallback: string) {
  const rec = asRecord(data);
  const error = asRecord(rec.error);
  return asString(error.message) || asString(error.code) || asString(rec.message) || fallback;
}

async function fetchTiktokVideoListPage(accessToken: string, cursor?: string | number | null) {
  const fields = [
    "id",
    "title",
    "create_time",
    "share_url",
    "cover_image_url",
    "view_count",
    "like_count",
    "comment_count",
    "share_count",
  ].join(",");

  const body: Record<string, unknown> = { max_count: 20 };
  if (cursor !== undefined && cursor !== null && String(cursor).trim()) body.cursor = cursor;

  const res = await fetch(`https://open.tiktokapis.com/v2/video/list/?fields=${encodeURIComponent(fields)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const data: unknown = await res.json().catch(() => ({}));
  const rec = asRecord(data);
  const error = asRecord(rec.error);
  const code = asString(error.code);
  if (!res.ok || (code && code !== "ok")) {
    throw new Error(tiktokApiError(data, `TikTok video.list HTTP ${res.status}`));
  }

  return rec;
}

async function fetchTiktokVideoList(accessToken: string, maxPages = 3): Promise<FetchVideoListResult> {
  const videos: TiktokVideoMetric[] = [];
  const rawPages: unknown[] = [];
  let cursor: string | number | null = null;

  try {
    for (let page = 0; page < maxPages; page += 1) {
      const payload = await fetchTiktokVideoListPage(accessToken, cursor);
      rawPages.push(payload);
      const data = asRecord(payload.data);
      const pageVideos = Array.isArray(data.videos) ? data.videos.map(normalizeVideo) : [];
      videos.push(...pageVideos.filter((video) => video.id));

      const hasMore = Boolean(data.has_more);
      const nextCursor = data.cursor;
      if (!hasMore || nextCursor === undefined || nextCursor === null || String(nextCursor).trim() === "") break;
      cursor = nextCursor as string | number;
    }
    return { videos, rawPages };
  } catch (error) {
    return {
      videos,
      rawPages,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function fetchTiktokAnalyticsSnapshot({
  accessToken,
  start,
  end,
}: {
  accessToken: string;
  start: string | Date;
  end: string | Date;
}): Promise<TiktokAnalyticsSnapshot> {
  const [profileRaw, videoList] = await Promise.all([
    fetchTiktokUserInfo(accessToken),
    fetchTiktokVideoList(accessToken),
  ]);

  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const hasValidWindow = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs;

  const periodVideos = videoList.videos.filter((video) => {
    if (!hasValidWindow || !video.createTime) return true;
    const createdMs = video.createTime * 1000;
    return createdMs >= startMs && createdMs <= endMs;
  });

  const videoViews = periodVideos.reduce((sum, video) => sum + video.viewCount, 0);
  const periodLikes = periodVideos.reduce((sum, video) => sum + video.likeCount, 0);
  const comments = periodVideos.reduce((sum, video) => sum + video.commentCount, 0);
  const shares = periodVideos.reduce((sum, video) => sum + video.shareCount, 0);
  const engagements = periodLikes + comments + shares;

  const profile = {
    open_id: asString(profileRaw.open_id) || "",
    username: asString(profileRaw.username) || "",
    display_name: asString(profileRaw.display_name) || "",
    avatar_url: asString(profileRaw.avatar_url) || asString(profileRaw.avatar_url_100) || asString(profileRaw.avatar_large_url) || "",
    profile_deep_link: asString(profileRaw.profile_deep_link) || "",
    bio_description: asString(profileRaw.bio_description) || "",
    is_verified: safeBool(profileRaw.is_verified),
  };

  return {
    totals: {
      followers: safeNum(profileRaw.follower_count),
      following: safeNum(profileRaw.following_count),
      likes: periodLikes,
      likes_total: safeNum(profileRaw.likes_count),
      video_count: safeNum(profileRaw.video_count),
      videos_public: safeNum(profileRaw.video_count),
      postsPublished: periodVideos.length,
      video_views: videoViews,
      views: videoViews,
      impressions: videoViews,
      engagements,
      likes_period: periodLikes,
      comments,
      shares,
      saves: 0,
      profile_views: 0,
      website_clicks: 0,
      messages: 0,
    },
    profile,
    videos: periodVideos.slice(0, 10),
    raw: {
      profile: profileRaw,
      videoList: {
        pages: videoList.rawPages,
        error: videoList.error || null,
        fetched: videoList.videos.length,
        inPeriod: periodVideos.length,
      },
    },
  };
}
