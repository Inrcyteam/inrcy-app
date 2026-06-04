import "server-only";

import { asRecord, asString } from "@/lib/tsSafe";
import { fetchTiktokCreatorInfo } from "@/lib/tiktokOAuth";
import type { TiktokCommercialContent, TiktokDefaultSettings } from "@/lib/tiktokMockSettings";

export type TiktokPublishResult = {
  ok: boolean;
  publishId?: string | null;
  error?: string;
  raw?: unknown;
  creatorInfo?: Record<string, unknown>;
  privacyLevel?: string;
};

type TiktokPostInfo = {
  privacy_level: string;
  title?: string;
  description?: string;
  disable_duet?: boolean;
  disable_comment?: boolean;
  disable_stitch?: boolean;
  auto_add_music?: boolean;
  brand_content_toggle: boolean;
  brand_organic_toggle: boolean;
  is_aigc?: boolean;
};

function truncateUtf16(input: string, max: number) {
  return Array.from(String(input || "")).slice(0, max).join("");
}

function extractErrorMessage(data: unknown, fallback: string) {
  const rec = asRecord(data);
  const error = asRecord(rec.error);
  return asString(error.message) || asString(error.code) || asString(rec.message) || fallback;
}

function normalizePrivacyOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => (asString(entry) || "").trim()).filter(Boolean);
}

function pickPrivacyLevel(creatorInfo: Record<string, unknown>) {
  const options = normalizePrivacyOptions(creatorInfo.privacy_level_options);
  if (options.includes("SELF_ONLY")) return "SELF_ONLY";
  if (options.includes("MUTUAL_FOLLOW_FRIENDS")) return "MUTUAL_FOLLOW_FRIENDS";
  if (options.includes("FOLLOWER_OF_CREATOR")) return "FOLLOWER_OF_CREATOR";
  if (options.includes("PUBLIC_TO_EVERYONE")) return "PUBLIC_TO_EVERYONE";
  return "SELF_ONLY";
}

function commercialToggles(value: TiktokCommercialContent | undefined) {
  if (value === "branded") return { brand_content_toggle: true, brand_organic_toggle: false };
  if (value === "self") return { brand_content_toggle: false, brand_organic_toggle: true };
  return { brand_content_toggle: false, brand_organic_toggle: false };
}

function buildPostInfo({
  title,
  description,
  defaults,
  creatorInfo,
  isPhoto,
}: {
  title: string;
  description?: string;
  defaults: TiktokDefaultSettings;
  creatorInfo: Record<string, unknown>;
  isPhoto: boolean;
}): TiktokPostInfo {
  const toggles = commercialToggles(defaults.commercialContent);
  const postInfo: TiktokPostInfo = {
    privacy_level: pickPrivacyLevel(creatorInfo),
    disable_comment: !defaults.allowComments,
    ...toggles,
  };

  if (isPhoto) {
    postInfo.title = truncateUtf16(title, 90);
    postInfo.description = truncateUtf16(description || title, 4000);
    postInfo.auto_add_music = Boolean(defaults.photoAutoMusic);
  } else {
    postInfo.title = truncateUtf16(title, 2200);
    postInfo.disable_duet = !defaults.allowDuo;
    postInfo.disable_stitch = !defaults.allowStitch;
    postInfo.is_aigc = Boolean(defaults.aiContent);
  }

  return postInfo;
}

async function postTikTokJson(accessToken: string, url: string, body: unknown) {
  const res = await fetch(url, {
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
    return { ok: false, error: extractErrorMessage(data, `TikTok HTTP ${res.status}`), raw: data };
  }
  return { ok: true, raw: data, data: asRecord(rec.data) };
}

export function getTiktokUserFacingError(error: unknown) {
  const message = String(error || "").toLowerCase();
  if (message.includes("url_ownership_unverified")) return "TikTok refuse le média : le domaine média iNrCy doit être vérifié dans TikTok Developer.";
  if (message.includes("unaudited_client_can_only_post_to_private_accounts")) return "TikTok Sandbox impose un compte privé ou une visibilité privée avant l'audit.";
  if (message.includes("privacy_level_option_mismatch")) return "TikTok refuse le niveau de confidentialité. Reconnecte le compte TikTok puis réessaie.";
  if (message.includes("scope_not_authorized")) return "TikTok n'a pas autorisé le scope nécessaire. Reconnecte TikTok avec toutes les autorisations.";
  if (message.includes("access_token_invalid")) return "Connexion TikTok expirée. Reconnecte TikTok dans Canaux.";
  if (message.includes("spam_risk") || message.includes("rate_limit") || message.includes("quota")) return "TikTok limite temporairement la publication. Réessaie plus tard.";
  return String(error || "TikTok n'a pas accepté la publication.");
}

export async function tiktokDirectPostVideo({
  accessToken,
  videoUrl,
  title,
  defaults,
}: {
  accessToken: string;
  videoUrl: string;
  title: string;
  defaults: TiktokDefaultSettings;
}): Promise<TiktokPublishResult> {
  const creatorInfo = await fetchTiktokCreatorInfo(accessToken);
  const postInfo = buildPostInfo({ title, defaults, creatorInfo, isPhoto: false });

  const response = await postTikTokJson(accessToken, "https://open.tiktokapis.com/v2/post/publish/video/init/", {
    post_info: postInfo,
    source_info: {
      source: "PULL_FROM_URL",
      video_url: videoUrl,
    },
  });

  if (!response.ok) return { ok: false, error: getTiktokUserFacingError(response.error), raw: response.raw, creatorInfo, privacyLevel: postInfo.privacy_level };
  const data = asRecord(response.data);
  return { ok: true, publishId: asString(data.publish_id), raw: response.raw, creatorInfo, privacyLevel: postInfo.privacy_level };
}

export async function tiktokDirectPostPhotos({
  accessToken,
  imageUrls,
  title,
  description,
  defaults,
}: {
  accessToken: string;
  imageUrls: string[];
  title: string;
  description: string;
  defaults: TiktokDefaultSettings;
}): Promise<TiktokPublishResult> {
  const creatorInfo = await fetchTiktokCreatorInfo(accessToken);
  const postInfo = buildPostInfo({ title, description, defaults, creatorInfo, isPhoto: true });

  const response = await postTikTokJson(accessToken, "https://open.tiktokapis.com/v2/post/publish/content/init/", {
    media_type: "PHOTO",
    post_mode: "DIRECT_POST",
    post_info: postInfo,
    source_info: {
      source: "PULL_FROM_URL",
      photo_images: imageUrls.slice(0, 35),
      photo_cover_index: 0,
    },
  });

  if (!response.ok) return { ok: false, error: getTiktokUserFacingError(response.error), raw: response.raw, creatorInfo, privacyLevel: postInfo.privacy_level };
  const data = asRecord(response.data);
  return { ok: true, publishId: asString(data.publish_id), raw: response.raw, creatorInfo, privacyLevel: postInfo.privacy_level };
}
