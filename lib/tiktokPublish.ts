import "server-only";

import { asRecord, asString } from "@/lib/tsSafe";
import { fetchTiktokCreatorInfo } from "@/lib/tiktokOAuth";
import type { TiktokCommercialContent } from "@/lib/tiktokSettings";

export type TiktokPublishStatus = {
  ok: boolean;
  status?: string | null;
  failReason?: string | null;
  shareUrl?: string | null;
  raw?: unknown;
  complete: boolean;
  failed: boolean;
  pending: boolean;
};

export type TiktokPublishResult = {
  ok: boolean;
  publishId?: string | null;
  error?: string;
  raw?: unknown;
  creatorInfo?: Record<string, unknown>;
  privacyLevel?: string;
  status?: TiktokPublishStatus | null;
  shareUrl?: string | null;
};

export type TiktokPublicationSettings = {
  privacyLevel: string;
  allowComments: boolean;
  allowDuo: boolean;
  allowStitch: boolean;
  commercialContent?: TiktokCommercialContent;
  aiContent?: boolean;
  photoAutoMusic?: boolean;
  musicUsageConfirmed?: boolean;
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function validatePublicationSettings({
  settings,
  creatorInfo,
  isPhoto,
  videoDurationSeconds,
}: {
  settings: TiktokPublicationSettings | null | undefined;
  creatorInfo: Record<string, unknown>;
  isPhoto: boolean;
  videoDurationSeconds?: number | null;
}) {
  if (!settings || !(asString(settings.privacyLevel) || "").trim()) {
    throw new Error("Validez les paramètres TikTok avant publication.");
  }
  if (!settings.musicUsageConfirmed) {
    throw new Error("Confirmez les règles TikTok et la Music Usage Confirmation avant publication.");
  }
  if (!["none", "self", "branded", "both"].includes(String(settings.commercialContent || ""))) {
    throw new Error("Choisissez la déclaration de contenu commercial TikTok avant publication.");
  }

  const options = normalizePrivacyOptions(creatorInfo.privacy_level_options);
  if (options.length && !options.includes(settings.privacyLevel)) {
    throw new Error("TikTok refuse ce niveau de confidentialité pour ce compte.");
  }

  if (settings.allowComments && creatorInfo.comment_disabled === true) {
    throw new Error("Les commentaires sont désactivés côté TikTok pour ce compte.");
  }
  if (!isPhoto && settings.allowDuo && creatorInfo.duet_disabled === true) {
    throw new Error("Le Duo est désactivé côté TikTok pour ce compte.");
  }
  if (!isPhoto && settings.allowStitch && creatorInfo.stitch_disabled === true) {
    throw new Error("Le Stitch est désactivé côté TikTok pour ce compte.");
  }

  const maxVideoDuration = Number(creatorInfo.max_video_post_duration_sec || 0);
  const actualDuration = Number(videoDurationSeconds || 0);
  if (!isPhoto && Number.isFinite(maxVideoDuration) && maxVideoDuration > 0 && Number.isFinite(actualDuration) && actualDuration > maxVideoDuration) {
    throw new Error("Cette vidéo dépasse la durée maximale autorisée par TikTok pour ce compte.");
  }
}

function commercialToggles(value: TiktokCommercialContent | undefined) {
  if (value === "both") return { brand_content_toggle: true, brand_organic_toggle: true };
  if (value === "branded") return { brand_content_toggle: true, brand_organic_toggle: false };
  if (value === "self") return { brand_content_toggle: false, brand_organic_toggle: true };
  return { brand_content_toggle: false, brand_organic_toggle: false };
}

function buildPostInfo({
  title,
  description,
  publicationSettings,
  creatorInfo,
  isPhoto,
  videoDurationSeconds,
}: {
  title: string;
  description?: string;
  publicationSettings: TiktokPublicationSettings;
  creatorInfo: Record<string, unknown>;
  isPhoto: boolean;
  videoDurationSeconds?: number | null;
}): TiktokPostInfo {
  validatePublicationSettings({ settings: publicationSettings, creatorInfo, isPhoto, videoDurationSeconds });
  const toggles = commercialToggles(publicationSettings.commercialContent);
  const postInfo: TiktokPostInfo = {
    privacy_level: publicationSettings.privacyLevel,
    disable_comment: !publicationSettings.allowComments,
    ...toggles,
  };

  if (isPhoto) {
    postInfo.title = truncateUtf16(title, 90);
    postInfo.description = truncateUtf16(description || title, 4000);
    postInfo.auto_add_music = Boolean(publicationSettings.photoAutoMusic);
  } else {
    postInfo.title = truncateUtf16(title, 2200);
    postInfo.disable_duet = !publicationSettings.allowDuo;
    postInfo.disable_stitch = !publicationSettings.allowStitch;
    postInfo.is_aigc = Boolean(publicationSettings.aiContent);
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

async function uploadTikTokVideoChunk({
  uploadUrl,
  videoBuffer,
  contentType,
}: {
  uploadUrl: string;
  videoBuffer: Buffer;
  contentType?: string | null;
}) {
  const size = videoBuffer.length;
  if (!uploadUrl || size <= 0) {
    return { ok: false, error: "TikTok n'a pas renvoyé d'URL d'upload vidéo.", raw: null as unknown };
  }

  const uploadContentType = contentType && contentType.startsWith("video/") ? contentType : "video/mp4";
  const uploadBody = new Blob([new Uint8Array(videoBuffer)], { type: uploadContentType });

  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": uploadContentType,
      "Content-Length": String(size),
      "Content-Range": `bytes 0-${size - 1}/${size}`,
    },
    body: uploadBody,
    cache: "no-store",
  });

  const raw = await res.text().catch(() => "");
  if (!res.ok) {
    return {
      ok: false,
      error: raw || `TikTok upload vidéo HTTP ${res.status}`,
      raw,
    };
  }

  return { ok: true, raw };
}

function normalizeStatus(value: unknown) {
  return String(asString(value) || "").trim().toUpperCase();
}

function extractShareUrl(data: Record<string, unknown>) {
  return (
    asString(data.share_url) ||
    asString(data.post_url) ||
    asString(data.video_url) ||
    asString(data.public_url) ||
    asString(data.url) ||
    null
  );
}

function extractStatusFailReason(data: Record<string, unknown>, raw: unknown) {
  const direct =
    asString(data.fail_reason) ||
    asString(data.error_message) ||
    asString(data.message) ||
    asString(data.reason) ||
    "";
  if (direct.trim()) return direct.trim();
  const rec = asRecord(raw);
  const err = asRecord(rec.error);
  return (asString(err.message) || asString(err.code) || "").trim() || null;
}

export function getTiktokUserFacingError(error: unknown) {
  const message = String(error || "").toLowerCase();
  if (message.includes("url_ownership_unverified")) return "TikTok refuse le média : le domaine ou le préfixe d'URL iNrCy utilisé pour les médias doit être vérifié dans TikTok Developer.";
  if (message.includes("unaudited_client_can_only_post_to_private_accounts")) return "TikTok impose un compte privé et une visibilité privée tant que l'audit Direct Post n'est pas validé.";
  if (message.includes("privacy_level_option_mismatch")) return "TikTok refuse le niveau de confidentialité. Reconnecte le compte TikTok puis réessaie.";
  if (message.includes("scope_not_authorized")) return "TikTok n'a pas autorisé le scope nécessaire. Reconnecte TikTok avec toutes les autorisations.";
  if (message.includes("access_token_invalid")) return "Connexion TikTok expirée. Reconnecte TikTok dans Canaux.";
  if (message.includes("spam_risk") || message.includes("rate_limit") || message.includes("quota")) return "TikTok limite temporairement la publication. Réessaie plus tard.";
  if (message.includes("video_pull_failed")) return "TikTok n'arrive pas à récupérer la vidéo depuis l'URL iNrCy. Le nouvel envoi utilise un upload direct fichier pour éviter ce blocage.";
  if (message.includes("file_format_check_failed")) return "TikTok refuse le format vidéo. Réessaie avec une vidéo MP4/H.264 courte et légère.";
  if (message.includes("duration_check_failed")) return "TikTok refuse la durée de cette vidéo. Réessaie avec une vidéo plus courte.";
  if (message.includes("frame_rate_check_failed")) return "TikTok refuse la fréquence d'image de cette vidéo. Réessaie avec une vidéo standard en 30 fps.";
  if (message.includes("photo_pull_failed")) return "TikTok n'arrive pas à récupérer la photo depuis l'URL iNrCy. Vérifie que le domaine/prefixe média est bien vérifié dans TikTok Developer, puis réessaie avec une image simple.";
  if (message.includes("picture_size_check_failed")) return "TikTok refuse la photo car ses dimensions ne respectent pas ses contraintes. iNrCy sert une version JPEG verticale optimisée ; réessaie avec le dernier correctif.";
  if (message.includes("photo") && (message.includes("not") || message.includes("failed"))) return "TikTok n'a pas accepté cette publication photo. Vérifie le format des images, le domaine média vérifié et réessaie.";
  if (message.includes("publish_cancelled") || message.includes("user_cancelled")) return "TikTok a annulé la publication. Réessaie depuis iNrCy.";
  return String(error || "TikTok n'a pas accepté la publication.");
}

export async function fetchTiktokPublishStatus(accessToken: string, publishId: string): Promise<TiktokPublishStatus> {
  const cleanPublishId = String(publishId || "").trim();
  if (!cleanPublishId) {
    return {
      ok: false,
      status: "MISSING_PUBLISH_ID",
      failReason: "TikTok n'a pas renvoyé d'identifiant de suivi.",
      complete: false,
      failed: true,
      pending: false,
    };
  }

  const response = await postTikTokJson(accessToken, "https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
    publish_id: cleanPublishId,
  });

  if (!response.ok) {
    return {
      ok: true,
      status: "STATUS_FETCH_PENDING",
      failReason: null,
      raw: response.raw,
      complete: false,
      failed: false,
      pending: true,
    };
  }

  const data = asRecord(response.data);
  const status =
    normalizeStatus(data.status) ||
    normalizeStatus(data.publish_status) ||
    normalizeStatus(data.state) ||
    "PROCESSING";
  const failed = status === "FAILED" || status === "PUBLISH_FAILED" || status === "ERROR";
  const complete = status === "PUBLISH_COMPLETE" || status === "DONE" || status === "SUCCESS";
  const failReason = failed ? extractStatusFailReason(data, response.raw) || "TikTok a refusé la publication." : null;

  return {
    ok: !failed,
    status,
    failReason,
    shareUrl: extractShareUrl(data),
    raw: response.raw,
    complete,
    failed,
    pending: !complete && !failed,
  };
}

async function waitForTiktokInitialStatus(accessToken: string, publishId: string) {
  let lastStatus: TiktokPublishStatus | null = null;

  // TikTok traite les publications de façon asynchrone. Dès que /init renvoie
  // un publish_id, l'envoi est accepté côté TikTok. On fait seulement quelques
  // contrôles rapides pour capter un échec immédiat, puis on laisse l'interface
  // afficher un succès d'envoi avec état "en traitement".
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt > 0) await sleep(1500);
    lastStatus = await fetchTiktokPublishStatus(accessToken, publishId);
    if (lastStatus.complete || lastStatus.failed) return lastStatus;
  }

  return lastStatus || {
    ok: true,
    status: "PROCESSING",
    failReason: null,
    complete: false,
    failed: false,
    pending: true,
  };
}

function statusToError(status: TiktokPublishStatus | null) {
  if (!status) return "TikTok n'a pas confirmé la publication.";
  if (status.failReason) return getTiktokUserFacingError(status.failReason);
  if (status.pending) return "TikTok traite encore la publication. Vérifiez le compte TikTok dans quelques instants.";
  return getTiktokUserFacingError(status.status || "tiktok_publish_not_complete");
}

export async function tiktokDirectPostVideo({
  accessToken,
  videoUrl,
  title,
  publicationSettings,
  videoDurationSeconds,
}: {
  accessToken: string;
  videoUrl: string;
  title: string;
  publicationSettings: TiktokPublicationSettings;
  videoDurationSeconds?: number | null;
}): Promise<TiktokPublishResult> {
  const creatorInfo = await fetchTiktokCreatorInfo(accessToken);
  const postInfo = buildPostInfo({ title, publicationSettings, creatorInfo, isPhoto: false, videoDurationSeconds });

  const response = await postTikTokJson(accessToken, "https://open.tiktokapis.com/v2/post/publish/video/init/", {
    post_info: postInfo,
    source_info: {
      source: "PULL_FROM_URL",
      video_url: videoUrl,
    },
  });

  if (!response.ok) return { ok: false, error: getTiktokUserFacingError(response.error), raw: response.raw, creatorInfo, privacyLevel: postInfo.privacy_level };
  const data = asRecord(response.data);
  const publishId = asString(data.publish_id);
  const status = await waitForTiktokInitialStatus(accessToken, publishId || "");

  if (status.failed) {
    return {
      ok: false,
      publishId,
      error: statusToError(status),
      raw: response.raw,
      creatorInfo,
      privacyLevel: postInfo.privacy_level,
      status,
    };
  }

  return { ok: true, publishId, raw: response.raw, creatorInfo, privacyLevel: postInfo.privacy_level, status, shareUrl: status.shareUrl || null };
}

export async function tiktokDirectPostVideoFileUpload({
  accessToken,
  videoBuffer,
  contentType,
  title,
  publicationSettings,
  videoDurationSeconds,
}: {
  accessToken: string;
  videoBuffer: Buffer;
  contentType?: string | null;
  title: string;
  publicationSettings: TiktokPublicationSettings;
  videoDurationSeconds?: number | null;
}): Promise<TiktokPublishResult> {
  const creatorInfo = await fetchTiktokCreatorInfo(accessToken);
  const postInfo = buildPostInfo({ title, publicationSettings, creatorInfo, isPhoto: false, videoDurationSeconds });
  const videoSize = videoBuffer.length;

  if (!videoSize) {
    return {
      ok: false,
      error: "Vidéo TikTok vide ou introuvable.",
      creatorInfo,
      privacyLevel: postInfo.privacy_level,
    };
  }

  const response = await postTikTokJson(accessToken, "https://open.tiktokapis.com/v2/post/publish/video/init/", {
    post_info: postInfo,
    source_info: {
      source: "FILE_UPLOAD",
      video_size: videoSize,
      chunk_size: videoSize,
      total_chunk_count: 1,
    },
  });

  if (!response.ok) return { ok: false, error: getTiktokUserFacingError(response.error), raw: response.raw, creatorInfo, privacyLevel: postInfo.privacy_level };

  const data = asRecord(response.data);
  const publishId = asString(data.publish_id);
  const uploadUrl = asString(data.upload_url);
  const upload = await uploadTikTokVideoChunk({ uploadUrl: uploadUrl || "", videoBuffer, contentType });
  if (!upload.ok) {
    return {
      ok: false,
      publishId,
      error: getTiktokUserFacingError(upload.error || "tiktok_video_upload_failed"),
      raw: { init: response.raw, upload: upload.raw },
      creatorInfo,
      privacyLevel: postInfo.privacy_level,
    };
  }

  const status = await waitForTiktokInitialStatus(accessToken, publishId || "");

  if (status.failed) {
    return {
      ok: false,
      publishId,
      error: statusToError(status),
      raw: { init: response.raw, upload: upload.raw },
      creatorInfo,
      privacyLevel: postInfo.privacy_level,
      status,
    };
  }

  return {
    ok: true,
    publishId,
    raw: { init: response.raw, upload: upload.raw },
    creatorInfo,
    privacyLevel: postInfo.privacy_level,
    status,
    shareUrl: status.shareUrl || null,
  };
}

export async function tiktokDirectPostPhotos({
  accessToken,
  imageUrls,
  title,
  description,
  publicationSettings,
}: {
  accessToken: string;
  imageUrls: string[];
  title: string;
  description: string;
  publicationSettings: TiktokPublicationSettings;
}): Promise<TiktokPublishResult> {
  const creatorInfo = await fetchTiktokCreatorInfo(accessToken);
  const postInfo = buildPostInfo({ title, description, publicationSettings, creatorInfo, isPhoto: true });

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
  const publishId = asString(data.publish_id);
  const status = await waitForTiktokInitialStatus(accessToken, publishId || "");

  if (status.failed) {
    return {
      ok: false,
      publishId,
      error: statusToError(status),
      raw: response.raw,
      creatorInfo,
      privacyLevel: postInfo.privacy_level,
      status,
    };
  }

  return { ok: true, publishId, raw: response.raw, creatorInfo, privacyLevel: postInfo.privacy_level, status, shareUrl: status.shareUrl || null };
}
