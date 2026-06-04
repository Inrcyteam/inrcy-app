import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { enforceRateLimit } from "@/lib/rateLimit";
import { encryptToken, tryDecryptToken } from "@/lib/oauthCrypto";
import { randomUUID } from "crypto";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  facebookPublishToPage,
  facebookPublishVideoToPage,
} from "@/lib/facebookPublish";
import {
  instagramPublishCarouselWithTokenFallback,
  instagramPublishPhotoWithTokenFallback,
  instagramPublishVideoWithTokenFallback,
  isInstagramAuthorizationErrorResult,
} from "@/lib/instagramPublish";
import {
  linkedinPublishImage,
  linkedinPublishMultiImage,
  linkedinPublishText,
  linkedinPublishVideo,
} from "@/lib/linkedinPublish";
import { getGmbToken, gmbCreateLocalPost } from "@/lib/googleBusiness";
import {
  optimizeForGoogleBusiness,
  optimizeForInstagram,
  optimizeForSiteCard,
  optimizeForSocialFeed,
} from "@/lib/imageOptimizer";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import {
  GOOGLE_BUSINESS_RECONNECT_USER_MESSAGE,
  INSTAGRAM_RECONNECT_USER_MESSAGE,
  getSimpleFrenchErrorMessage,
  isInstagramAuthorizationLikeMessage,
} from "@/lib/userFacingErrors";
import {
  getPublishChannelUserMessage,
  logPublishChannelFailure,
} from "@/lib/channelPublishDiagnostics";
import { hasActiveInrcySite } from "@/lib/inrcySite";
import {
  buildBoosterGmbSummary,
  buildBoosterInstagramCaption,
  buildBoosterMessage,
  getBoosterGmbCallToAction,
} from "@/lib/boosterCta";
import { getLinkedInAccessToken } from "@/lib/linkedinOAuth";
import { normalizeTiktokSettings } from "@/lib/tiktokMockSettings";
import { isTiktokIntegrationActive } from "@/lib/tiktokRouteStorage";
import { buildTiktokMediaProxyUrl } from "@/lib/tiktokMediaUrl";
import { refreshTiktokAccessToken } from "@/lib/tiktokOAuth";
import { tiktokDirectPostPhotos, tiktokDirectPostVideo } from "@/lib/tiktokPublish";
import { buildVideoSettingsByChannel } from "@/lib/boosterVideoSettings";
import { getVariantForChannel, type BoosterVideoTransformedVariant } from "@/lib/boosterVideoTransforms";
import {
  sanitizeBoosterSiteText,
  stripSiteTextFormatting,
} from "@/lib/boosterFormatting";

type ChannelKey =
  | "inrcy_site"
  | "site_web"
  | "gmb"
  | "facebook"
  | "instagram"
  | "linkedin"
  | "tiktok";

type JsonRecord = Record<string, unknown>;
const asRecord = (v: unknown): JsonRecord =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as JsonRecord) : {};
const errMessage = (e: unknown, fallback: string) =>
  getSimpleFrenchErrorMessage(e, fallback);

const CHANNEL_LABELS: Record<ChannelKey, string> = {
  inrcy_site: "Site iNrCy",
  site_web: "Site web",
  gmb: "Google Business",
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
};

function buildResultsSummary(
  results: Record<string, any>,
  selected: ChannelKey[],
) {
  const entries = selected.map((channel) => {
    const value = results[channel] || {};
    return {
      channel,
      label: CHANNEL_LABELS[channel] || channel,
      ok: value?.ok !== false,
      error: value?.ok === false ? String(value?.error || "erreur") : null,
      warning: value?.warning ? String(value.warning) : null,
      warning_message: value?.warning_message
        ? String(value.warning_message)
        : null,
    };
  });

  const successes = entries.filter((entry) => entry.ok);
  const failures = entries.filter((entry) => !entry.ok);

  return {
    total: entries.length,
    successCount: successes.length,
    failureCount: failures.length,
    allSucceeded: failures.length === 0,
    allFailed: successes.length === 0,
    entries,
    successChannels: successes.map((entry) => entry.channel),
    failedChannels: failures.map((entry) => entry.channel),
  };
}

function slugify(input: string): string {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
}

type ImagePayload = {
  name: string;
  type: string;
  dataUrl?: string; // base64 data URL
  storagePath?: string; // Supabase Storage path (bucket: booster)
  publicUrl?: string;
  renderedUrl?: string;
  originalUrl?: string;
  originalPublicUrl?: string;
  originalStoragePath?: string;
  originalName?: string;
  originalType?: string;
  imageKey?: string;
  transform?: unknown;
  imageMeta?: unknown;
};

type PublicationMediaType = "images" | "video";
type ChannelMediaMode = "video" | "images" | "none";

type VideoPayload = {
  name?: string;
  type?: string;
  size?: number;
  lastModified?: number;
  duration?: number | null;
  storagePath?: string;
  publicUrl?: string;
  url?: string;
  thumbnailUrl?: string | null;
  thumbnailStoragePath?: string | null;
};

type PersistedVideoAttachment = {
  name: string;
  type: string;
  size: number;
  duration: number | null;
  url: string;
  publicUrl: string;
  storagePath: string | null;
  thumbnailUrl: string | null;
  thumbnailStoragePath: string | null;
  transformedVariants?: BoosterVideoTransformedVariant[];
  transformedVariant?: BoosterVideoTransformedVariant | null;
  sourceVideo?: PersistedVideoAttachment | null;
};

const BOOSTER_MAX_VIDEO_BYTES = 40 * 1024 * 1024;

function normalizePublicationMediaType(value: unknown): PublicationMediaType {
  return value === "video" ? "video" : "images";
}

function normalizeChannelMediaMode(
  value: unknown,
  fallback: ChannelMediaMode,
): ChannelMediaMode {
  return value === "video" || value === "images" || value === "none"
    ? value
    : fallback;
}

type EditableImageAttachment = {
  name: string;
  type?: string | null;
  url: string;
  renderedUrl: string;
  publicUrl: string;
  originalUrl?: string | null;
  originalPublicUrl?: string | null;
  originalStoragePath?: string | null;
  originalName?: string | null;
  originalType?: string | null;
  imageKey?: string | null;
  transform?: unknown;
  imageMeta?: unknown;
};

type PostPayload = {
  title: string;
  content: string;
  cta: string;
  ctaMode?: string;
  ctaUrl?: string;
  ctaPhone?: string;
  hashtags?: string[];
};

type PostByChannel = Partial<Record<ChannelKey, PostPayload>>;
type ImagesByChannel = Partial<Record<ChannelKey, ImagePayload[]>>;
type ImageSet = {
  images: string[];
  publishableUrls: string[];
  instagramPublishableUrls: string[];
  socialFeedPublishableUrls: string[];
  siteCardPublishableUrls: string[];
  gmbPublishableUrls: string[];
  storagePaths: string[];
  publishableStoragePaths: string[];
  socialFeedStoragePaths: string[];
  editableAttachments?: EditableImageAttachment[];
};

type ResolvedImageInput = {
  mime: string;
  buffer: Buffer;
  originalPublicUrl: string | null;
  originalPublishableUrl: string | null;
  storagePath?: string;
};

function dataUrlToBuffer(dataUrl: string) {
  const match = /^data:(.+?);base64,(.+)$/.exec(dataUrl || "");
  if (!match) return null;
  const mime = match[1];
  const b64 = match[2];
  return { mime, buffer: Buffer.from(b64, "base64") };
}

function normalizeHashtag(input: string): string {
  return String(input || "")
    .trim()
    .replace(/^#+/, "")
    .replace(/[^\p{L}\p{N}_]/gu, "")
    .slice(0, 40);
}

function isExpired(expiresAt: unknown, skewSeconds = 60) {
  const iso = String(expiresAt || "").trim();
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return t <= Date.now() + skewSeconds * 1000;
}

function buildInstagramPublishTokenCandidates(
  igRowLike: unknown,
  fbRowLike?: unknown,
) {
  const candidates: Array<{ source: string; accessToken: string }> = [];
  const seen = new Set<string>();

  const push = (source: string, rawEncrypted: unknown) => {
    const token = tryDecryptToken(String(rawEncrypted || "")) || "";
    if (!token || seen.has(token)) return;
    seen.add(token);
    candidates.push({ source, accessToken: token });
  };

  const ig = asRecord(igRowLike);
  const igMeta = asRecord(ig["meta"]);
  push("instagram.access_token_enc", ig["access_token_enc"]);
  push("instagram.meta.page_access_token_enc", igMeta["page_access_token_enc"]);
  push(
    "instagram.meta.standard_user_access_token_enc",
    igMeta["standard_user_access_token_enc"],
  );
  push(
    "instagram.meta.business_user_access_token_enc",
    igMeta["business_user_access_token_enc"],
  );
  push("instagram.meta.user_access_token_enc", igMeta["user_access_token_enc"]);
  push("instagram.meta.user_access_token", igMeta["user_access_token"]);

  const fb = asRecord(fbRowLike);
  const fbMeta = asRecord(fb["meta"]);
  push("facebook.access_token_enc", fb["access_token_enc"]);
  push("facebook.meta.page_access_token_enc", fbMeta["page_access_token_enc"]);
  push("facebook.meta.user_access_token_enc", fbMeta["user_access_token_enc"]);

  return candidates;
}

async function buildUrlsFromStoragePath(
  path: string,
): Promise<{ publicUrl: string | null; signedUrl: string | null }> {
  const publicUrl =
    supabaseAdmin.storage.from("booster").getPublicUrl(path)?.data?.publicUrl ||
    null;
  const signed = await supabaseAdmin.storage
    .from("booster")
    .createSignedUrl(path, 60 * 60 * 24);
  return {
    publicUrl,
    signedUrl: signed?.data?.signedUrl || publicUrl,
  };
}

async function normalizeVideoPayload(
  input: unknown,
): Promise<{ video: PersistedVideoAttachment | null; error?: string }> {
  const raw = asRecord(input);
  if (!Object.keys(raw).length) return { video: null };

  const storagePath = String(raw["storagePath"] || "").trim();
  const directPublicUrl = String(raw["publicUrl"] || raw["url"] || "").trim();
  let publicUrl = directPublicUrl;

  if (!publicUrl && storagePath) {
    const urls = await buildUrlsFromStoragePath(storagePath);
    publicUrl = urls.publicUrl || urls.signedUrl || "";
  }

  if (!publicUrl)
    return { video: null, error: "Vidéo introuvable. Merci de la renvoyer." };

  const size = Number(raw["size"] || 0);
  if (Number.isFinite(size) && size > BOOSTER_MAX_VIDEO_BYTES) {
    return {
      video: null,
      error: "Vidéo trop lourde. Taille maximale : 40 Mo.",
    };
  }

  const durationRaw = Number(raw["duration"] || 0);
  const duration =
    Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : null;
  const transformedVariants = Array.isArray(raw["transformedVariants"])
    ? (raw["transformedVariants"] as BoosterVideoTransformedVariant[]).filter((variant: any) =>
        variant &&
        typeof variant === "object" &&
        typeof variant.publicUrl === "string" &&
        typeof variant.storagePath === "string" &&
        typeof variant.signature === "string",
      )
    : [];

  return {
    video: {
      name: String(raw["name"] || "video-inrcy.mp4"),
      type: String(raw["type"] || "video/mp4"),
      size: Number.isFinite(size) && size > 0 ? size : 0,
      duration,
      url: publicUrl,
      publicUrl,
      storagePath: storagePath || null,
      thumbnailUrl:
        String(
          raw["thumbnailUrl"] || raw["video_thumbnail_url"] || "",
        ).trim() || null,
      thumbnailStoragePath:
        String(raw["thumbnailStoragePath"] || "").trim() || null,
      transformedVariants,
    },
  };
}

async function canGoogleFetchImageUrl(url: string): Promise<boolean> {
  const target = String(url || "").trim();
  if (!target) return false;

  const attempts: Array<"HEAD" | "GET"> = ["HEAD", "GET"];
  for (const method of attempts) {
    try {
      const response = await fetch(target, {
        method,
        redirect: "follow",
        cache: "no-store",
      });
      if (!response.ok) continue;
      const contentType = String(
        response.headers.get("content-type") || "",
      ).toLowerCase();
      if (contentType.startsWith("image/")) return true;
      if (method === "GET") return false;
    } catch {
      // Ignore and try the next strategy.
    }
  }

  return false;
}

async function getGoogleBusinessPublishableUrl(
  path: string,
): Promise<string | null> {
  const urls = await buildUrlsFromStoragePath(path);
  if (urls.publicUrl && (await canGoogleFetchImageUrl(urls.publicUrl))) {
    return urls.publicUrl;
  }
  if (urls.signedUrl && (await canGoogleFetchImageUrl(urls.signedUrl))) {
    return urls.signedUrl;
  }
  return urls.publicUrl || urls.signedUrl || null;
}

function isGoogleBusinessImageError(error: unknown) {
  const message = errMessage(error, "").toLowerCase();
  return [
    "image",
    "images",
    "photo",
    "media",
    "sourceurl",
    "url",
    "fetch",
    "download",
    "content-type",
    "content type",
    "invalid media",
    "mediaitem",
  ].some((needle) => message.includes(needle));
}

async function resolveImageInput(
  img: ImagePayload,
): Promise<ResolvedImageInput | null> {
  if (img?.storagePath) {
    const download = await supabaseAdmin.storage
      .from("booster")
      .download(img.storagePath);
    if (download.error || !download.data) {
      throw new Error(
        download.error?.message || "Impossible de relire l'image préparée.",
      );
    }

    const arrayBuffer = await download.data.arrayBuffer();
    const mime = download.data.type || img.type || "application/octet-stream";
    const urls = await buildUrlsFromStoragePath(img.storagePath);
    return {
      mime,
      buffer: Buffer.from(arrayBuffer),
      originalPublicUrl: img.publicUrl || urls.publicUrl,
      originalPublishableUrl: urls.signedUrl || img.publicUrl || urls.publicUrl,
      storagePath: img.storagePath,
    };
  }

  if (img?.dataUrl) {
    const parsed = dataUrlToBuffer(img.dataUrl);
    if (!parsed) return null;
    return {
      mime: parsed.mime || img.type || "application/octet-stream",
      buffer: parsed.buffer,
      originalPublicUrl: null,
      originalPublishableUrl: null,
    };
  }

  if (img?.publicUrl) {
    const res = await fetch(img.publicUrl);
    if (!res.ok) {
      throw new Error(`Impossible de télécharger l'image (${res.status}).`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return {
      mime:
        res.headers.get("content-type") ||
        img.type ||
        "application/octet-stream",
      buffer: Buffer.from(arrayBuffer),
      originalPublicUrl: img.publicUrl,
      originalPublishableUrl: img.publicUrl,
    };
  }

  return null;
}

type ImageOptimizationFormats = {
  instagram?: boolean;
  socialFeed?: boolean;
  siteCard?: boolean;
  gmb?: boolean;
};

const EMPTY_IMAGE_FORMATS: ImageOptimizationFormats = {};

function getRequiredImageFormatsForChannel(
  channel: ChannelKey,
): ImageOptimizationFormats {
  if (channel === "instagram") return { instagram: true };
  if (channel === "facebook" || channel === "linkedin" || channel === "tiktok")
    return { socialFeed: true };
  if (channel === "gmb") return { gmb: true };
  // Site iNrCy / Site web use the original prepared image in the article payload.
  // Avoid generating social/Instagram/GMB derivatives when they are not needed.
  return EMPTY_IMAGE_FORMATS;
}

function mergeImageFormats(
  ...formatsList: ImageOptimizationFormats[]
): ImageOptimizationFormats {
  return formatsList.reduce<ImageOptimizationFormats>(
    (acc, formats) => ({
      instagram: Boolean(acc.instagram || formats.instagram),
      socialFeed: Boolean(acc.socialFeed || formats.socialFeed),
      siteCard: Boolean(acc.siteCard || formats.siteCard),
      gmb: Boolean(acc.gmb || formats.gmb),
    }),
    {},
  );
}

function buildEditableImageAttachments(
  rawImages: ImagePayload[],
  imageSet: ImageSet,
): EditableImageAttachment[] {
  return imageSet.images.map((renderedUrl, index) => {
    const raw = rawImages[index] || ({} as ImagePayload);
    const originalUrl = String(
      raw.originalPublicUrl ||
        raw.originalUrl ||
        raw.publicUrl ||
        renderedUrl ||
        "",
    ).trim();
    const name =
      String(raw.originalName || raw.name || `image-${index + 1}.jpg`).trim() ||
      `image-${index + 1}.jpg`;
    const type =
      String(raw.originalType || raw.type || "image/jpeg").trim() ||
      "image/jpeg";
    return {
      name,
      type,
      url: renderedUrl,
      renderedUrl,
      publicUrl: renderedUrl,
      originalUrl: originalUrl || null,
      originalPublicUrl: originalUrl || null,
      originalStoragePath: String(raw.originalStoragePath || "").trim() || null,
      originalName: String(raw.originalName || raw.name || "").trim() || null,
      originalType: String(raw.originalType || raw.type || "").trim() || null,
      imageKey: String(raw.imageKey || "").trim() || null,
      transform: raw.transform || null,
      imageMeta: raw.imageMeta || null,
    };
  });
}

async function uploadImageSet(
  userId: string,
  images: ImagePayload[],
  formats: ImageOptimizationFormats = EMPTY_IMAGE_FORMATS,
): Promise<{
  imageSet: ImageSet;
  uploadErrors: Array<{ name: string; reason: string; stage: string }>;
}> {
  const uploadedUrls: string[] = [];
  const publishableUrls: string[] = [];
  const instagramPublishableUrls: string[] = [];
  const socialFeedPublishableUrls: string[] = [];
  const siteCardPublishableUrls: string[] = [];
  const gmbPublishableUrls: string[] = [];
  const storagePaths: string[] = [];
  const publishableStoragePaths: string[] = [];
  const socialFeedStoragePaths: string[] = [];
  const uploadErrors: Array<{ name: string; reason: string; stage: string }> =
    [];

  for (const img of images.slice(0, 5)) {
    let source: ResolvedImageInput | null = null;
    try {
      source = await resolveImageInput(img);
    } catch (e) {
      uploadErrors.push({
        name: img?.name || "image",
        reason: errMessage(e, "Impossible de préparer l'image."),
        stage: "resolve",
      });
      continue;
    }

    if (!source) {
      uploadErrors.push({
        name: img?.name || "image",
        reason:
          "Invalid image payload (expected dataUrl, storagePath or publicUrl)",
        stage: "parse",
      });
      continue;
    }

    const parsed = { mime: source.mime, buffer: source.buffer };
    let originalPublicUrl = source.originalPublicUrl;
    let originalPublishableUrl = source.originalPublishableUrl;
    let sourceStoragePath = source.storagePath || "";

    if (!source.storagePath) {
      const ext = (img.name || "image").split(".").pop() || "jpg";
      const path = `${userId}/${randomUUID()}.${ext}`;

      const up = await supabaseAdmin.storage
        .from("booster")
        .upload(path, parsed.buffer, {
          contentType: parsed.mime || img.type || "application/octet-stream",
          upsert: false,
        });

      if (up.error) {
        console.error("[Booster] Storage upload error:", up.error.message, {
          path,
          name: img.name,
        });
        uploadErrors.push({
          name: img?.name || "image",
          reason: up.error.message,
          stage: "upload",
        });
        continue;
      }

      const urls = await buildUrlsFromStoragePath(path);
      originalPublicUrl = urls.publicUrl;
      originalPublishableUrl = urls.signedUrl;
      sourceStoragePath = path;
    }

    if (originalPublicUrl) {
      uploadedUrls.push(originalPublicUrl);
    } else {
      uploadErrors.push({
        name: img?.name || "image",
        reason: "Original image public URL unavailable",
        stage: "publicUrl",
      });
    }

    if (sourceStoragePath) {
      storagePaths.push(sourceStoragePath);
      publishableStoragePaths.push(sourceStoragePath);
    }

    if (originalPublishableUrl) {
      publishableUrls.push(originalPublishableUrl);
    } else if (originalPublicUrl) {
      publishableUrls.push(originalPublicUrl);
      uploadErrors.push({
        name: img?.name || "image",
        reason: "Signed URL unavailable, fell back to publicUrl",
        stage: "signedUrl",
      });
    } else {
      uploadErrors.push({
        name: img?.name || "image",
        reason: "Original image publishable URL unavailable",
        stage: "signedUrl",
      });
    }

    if (formats.instagram) {
      try {
        const optimized = await optimizeForInstagram(parsed.buffer);
        const igPath = `${userId}/instagram/${randomUUID()}.${optimized.extension}`;
        const igUpload = await supabaseAdmin.storage
          .from("booster")
          .upload(igPath, optimized.buffer, {
            contentType: optimized.mime,
            upsert: false,
          });

        if (igUpload.error) {
          uploadErrors.push({
            name: img?.name || "image",
            reason: igUpload.error.message,
            stage: "instagramUpload",
          });
        } else {
          const igSigned = await supabaseAdmin.storage
            .from("booster")
            .createSignedUrl(igPath, 60 * 60 * 24);
          const igPublic = supabaseAdmin.storage
            .from("booster")
            .getPublicUrl(igPath);
          if (igSigned?.data?.signedUrl) {
            instagramPublishableUrls.push(igSigned.data.signedUrl);
          } else if (igPublic?.data?.publicUrl) {
            instagramPublishableUrls.push(igPublic.data.publicUrl);
          } else {
            uploadErrors.push({
              name: img?.name || "image",
              reason: "Instagram optimized image URL unavailable",
              stage: "instagramUpload",
            });
          }
        }
      } catch (optErr) {
        uploadErrors.push({
          name: img?.name || "image",
          reason: errMessage(optErr, "Instagram image optimization failed"),
          stage: "instagramOptimize",
        });
      }
    }

    if (formats.socialFeed) {
      try {
        const optimized = await optimizeForSocialFeed(parsed.buffer);
        const socialPath = `${userId}/social-feed/${randomUUID()}.${optimized.extension}`;
        const socialUpload = await supabaseAdmin.storage
          .from("booster")
          .upload(socialPath, optimized.buffer, {
            contentType: optimized.mime,
            upsert: false,
          });

        if (socialUpload.error) {
          uploadErrors.push({
            name: img?.name || "image",
            reason: socialUpload.error.message,
            stage: "socialFeedUpload",
          });
        } else {
          const socialSigned = await supabaseAdmin.storage
            .from("booster")
            .createSignedUrl(socialPath, 60 * 60 * 24);
          const socialPublic = supabaseAdmin.storage
            .from("booster")
            .getPublicUrl(socialPath);
          if (socialSigned?.data?.signedUrl) {
            socialFeedPublishableUrls.push(socialSigned.data.signedUrl);
            socialFeedStoragePaths.push(socialPath);
          } else if (socialPublic?.data?.publicUrl) {
            socialFeedPublishableUrls.push(socialPublic.data.publicUrl);
            socialFeedStoragePaths.push(socialPath);
          } else {
            uploadErrors.push({
              name: img?.name || "image",
              reason: "Social feed optimized image URL unavailable",
              stage: "socialFeedUpload",
            });
          }
        }
      } catch (optErr) {
        uploadErrors.push({
          name: img?.name || "image",
          reason: errMessage(optErr, "Social feed image optimization failed"),
          stage: "socialFeedOptimize",
        });
      }
    }

    if (formats.siteCard) {
      try {
        const optimized = await optimizeForSiteCard(parsed.buffer);
        const sitePath = `${userId}/site-card/${randomUUID()}.${optimized.extension}`;
        const siteUpload = await supabaseAdmin.storage
          .from("booster")
          .upload(sitePath, optimized.buffer, {
            contentType: optimized.mime,
            upsert: false,
          });

        if (siteUpload.error) {
          uploadErrors.push({
            name: img?.name || "image",
            reason: siteUpload.error.message,
            stage: "siteCardUpload",
          });
        } else {
          const siteSigned = await supabaseAdmin.storage
            .from("booster")
            .createSignedUrl(sitePath, 60 * 60 * 24);
          const sitePublic = supabaseAdmin.storage
            .from("booster")
            .getPublicUrl(sitePath);
          if (siteSigned?.data?.signedUrl) {
            siteCardPublishableUrls.push(siteSigned.data.signedUrl);
          } else if (sitePublic?.data?.publicUrl) {
            siteCardPublishableUrls.push(sitePublic.data.publicUrl);
          } else {
            uploadErrors.push({
              name: img?.name || "image",
              reason: "Site card optimized image URL unavailable",
              stage: "siteCardUpload",
            });
          }
        }
      } catch (optErr) {
        uploadErrors.push({
          name: img?.name || "image",
          reason: errMessage(optErr, "Site card image optimization failed"),
          stage: "siteCardOptimize",
        });
      }
    }

    if (formats.gmb) {
      try {
        const optimized = await optimizeForGoogleBusiness(parsed.buffer);
        const gmbPath = `${userId}/gmb/${randomUUID()}.${optimized.extension}`;
        const gmbUpload = await supabaseAdmin.storage
          .from("booster")
          .upload(gmbPath, optimized.buffer, {
            contentType: optimized.mime,
            upsert: false,
          });

        if (gmbUpload.error) {
          uploadErrors.push({
            name: img?.name || "image",
            reason: gmbUpload.error.message,
            stage: "gmbUpload",
          });
        } else {
          const gmbUrl = await getGoogleBusinessPublishableUrl(gmbPath);
          if (gmbUrl) {
            gmbPublishableUrls.push(gmbUrl);
          } else {
            uploadErrors.push({
              name: img?.name || "image",
              reason: "Google Business optimized image URL unavailable",
              stage: "gmbUpload",
            });
          }
        }
      } catch (optErr) {
        uploadErrors.push({
          name: img?.name || "image",
          reason: errMessage(
            optErr,
            "Google Business image optimization failed",
          ),
          stage: "gmbOptimize",
        });
      }
    }
  }

  return {
    imageSet: {
      images: uploadedUrls,
      publishableUrls,
      instagramPublishableUrls,
      socialFeedPublishableUrls,
      siteCardPublishableUrls,
      gmbPublishableUrls,
      storagePaths,
      publishableStoragePaths,
      socialFeedStoragePaths,
    },
    uploadErrors,
  };
}

async function getLatestIntegrationRow(
  userId: string,
  provider: string,
  source: string,
  product: string,
  columns: string,
) {
  const { data, error } = await supabaseAdmin
    .from("integrations")
    .select(columns)
    .eq("user_id", userId)
    .eq("provider", provider)
    .eq("source", source)
    .eq("product", product)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  return Array.isArray(data) ? (data[0] ?? null) : null;
}

export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;
    const userId = user.id;

    const rl = await enforceRateLimit({
      name: "booster_publish",
      identifier: userId,
      limit: 20,
      window: "1 m",
    });
    if (rl) return rl;
    const body = await req.json().catch(() => null);
    if (!body)
      return NextResponse.json(
        { error: "Données invalides." },
        { status: 400 },
      );

    const channels = (
      Array.isArray(body.channels) ? body.channels : []
    ) as ChannelKey[];
    const post = (body.post || {}) as PostPayload;
    const postByChannel = ((body.postByChannel || {}) as PostByChannel) || {};
    const idea = String(body.idea || "").trim();
    const mediaType = normalizePublicationMediaType(body.mediaType);
    const selected = Array.from(new Set(channels)).filter(Boolean);
    const rawModeByChannel = (body.mediaModeByChannel || {}) as Record<
      string,
      unknown
    >;
    const defaultMediaMode: ChannelMediaMode =
      mediaType === "video" ? "video" : "images";
    const mediaModeByChannel = Object.fromEntries(
      selected.map((channel) => [
        channel,
        normalizeChannelMediaMode(rawModeByChannel[channel], defaultMediaMode),
      ]),
    ) as Partial<Record<ChannelKey, ChannelMediaMode>>;
    const videoSettingsByChannel = buildVideoSettingsByChannel({
      channels: selected,
      videoSettingsByChannel: body.videoSettingsByChannel,
      videoFormatByChannel: body.videoFormatByChannel,
      videoAdaptationModeByChannel: body.videoAdaptationModeByChannel,
    });
    const hasAnyImageChannel = selected.some(
      (channel) => mediaModeByChannel[channel] === "images",
    );
    const hasAnyVideoChannel = selected.some(
      (channel) => mediaModeByChannel[channel] === "video",
    );
    const images = hasAnyImageChannel
      ? ((Array.isArray(body.images) ? body.images : []) as ImagePayload[])
      : [];
    const imagesByChannel = hasAnyImageChannel
      ? ((body.imagesByChannel || {}) as ImagesByChannel) || {}
      : {};
    const imageSettingsByChannel = hasAnyImageChannel
      ? ((body.imageSettingsByChannel || {}) as Record<string, unknown>)
      : {};
    const { video: publicationVideo, error: videoPayloadError } =
      hasAnyVideoChannel
        ? await normalizeVideoPayload(body.video)
        : {
            video: null as PersistedVideoAttachment | null,
            error: undefined as string | undefined,
          };
    const getPublicationVideoForChannel = (channel: ChannelKey): PersistedVideoAttachment | null => {
      if (!publicationVideo) return null;
      const settings = videoSettingsByChannel[channel];
      if (!settings) return publicationVideo;
      const variant = getVariantForChannel(
        publicationVideo.transformedVariants,
        channel as any,
        settings.format,
        settings.adaptationMode,
      );
      if (!variant?.publicUrl) return publicationVideo;

      return {
        ...publicationVideo,
        name: `${publicationVideo.name} — ${variant.target?.label || settings.format}`,
        type: variant.contentType || publicationVideo.type || "video/mp4",
        size: Number(variant.size || publicationVideo.size || 0),
        duration: variant.duration ?? publicationVideo.duration ?? null,
        url: variant.publicUrl,
        publicUrl: variant.publicUrl,
        storagePath: variant.storagePath || publicationVideo.storagePath || null,
        transformedVariant: variant,
        sourceVideo: { ...publicationVideo, sourceVideo: null, transformedVariant: null },
      };
    };

    const buildPublicationVideoByChannel = () => {
      if (!publicationVideo) return {} as Partial<Record<ChannelKey, PersistedVideoAttachment>>;
      return Object.fromEntries(
        selected
          .filter((channel) => mediaModeByChannel[channel] === "video")
          .map((channel) => [channel, getPublicationVideoForChannel(channel)]),
      ) as Partial<Record<ChannelKey, PersistedVideoAttachment>>;
    };

    const workflowToolRaw = String(body.workflowTool || "")
      .trim()
      .toLowerCase();
    const workflowActionRaw = String(body.workflowAction || "")
      .trim()
      .toLowerCase();
    const workflowTrackTypeRaw = String(body.workflowTrackType || "")
      .trim()
      .toLowerCase();
    const isValorisation =
      workflowToolRaw === "propulser" &&
      (workflowActionRaw === "valoriser" ||
        workflowTrackTypeRaw === "valorize");
    const eventModule = isValorisation ? "propulser" : "booster";
    const eventType = isValorisation ? "valorize" : "publish";
    const workflowAction = isValorisation ? "valoriser" : "publier";
    const hadAnyImageInput =
      hasAnyImageChannel &&
      (images.length > 0 ||
        Object.values(imagesByChannel).some(
          (value) => Array.isArray(value) && value.length > 0,
        ));

    if (hasAnyVideoChannel && videoPayloadError) {
      return NextResponse.json(
        { ok: false, error: videoPayloadError },
        { status: 400 },
      );
    }
    if (hasAnyVideoChannel && !publicationVideo) {
      return NextResponse.json(
        { ok: false, error: "Ajoutez une vidéo avant de publier." },
        { status: 400 },
      );
    }

    if (!selected.length) {
      return NextResponse.json(
        { error: "Sélectionnez au moins 1 canal." },
        { status: 400 },
      );
    }

    const fallbackTitle = String(post.title || "").trim();
    const fallbackContent = String(post.content || "").trim();
    const fallbackCta = String(post.cta || "").trim();
    const fallbackHashtags = Array.isArray(post.hashtags)
      ? post.hashtags
          .map((h) => normalizeHashtag(String(h || "")))
          .filter(Boolean)
          .slice(0, 20)
      : [];

    const getChannelPost = (channel: ChannelKey): PostPayload => {
      const raw = ((channel === "inrcy_site"
        ? postByChannel?.inrcy_site || postByChannel?.site_web
        : channel === "site_web"
          ? postByChannel?.site_web || postByChannel?.inrcy_site
          : postByChannel?.[channel]) || {}) as PostPayload;
      const isSiteChannel = channel === "inrcy_site" || channel === "site_web";
      const rawTitle = String(raw.title || fallbackTitle || "").trim();
      const rawContent = String(raw.content || fallbackContent || "").trim();
      const rawCta = String(raw.cta || fallbackCta || "").trim();
      const title = isSiteChannel
        ? sanitizeBoosterSiteText(rawTitle)
        : stripSiteTextFormatting(rawTitle);
      const content = isSiteChannel
        ? sanitizeBoosterSiteText(rawContent)
        : stripSiteTextFormatting(rawContent);
      const cta = stripSiteTextFormatting(rawCta);
      const ctaMode = String(raw.ctaMode || "").trim();
      const ctaUrl = String(raw.ctaUrl || "").trim();
      const ctaPhone = String(raw.ctaPhone || "").trim();
      const hashtags = Array.isArray(raw.hashtags)
        ? raw.hashtags
            .map((h) => normalizeHashtag(String(h || "")))
            .filter(Boolean)
            .slice(0, 20)
        : fallbackHashtags;
      return { title, content, cta, ctaMode, ctaUrl, ctaPhone, hashtags };
    };

    const firstPost = getChannelPost(selected[0]);

    const selectedImageFormats = hasAnyImageChannel
      ? mergeImageFormats(
          ...selected
            .filter((channel) => mediaModeByChannel[channel] === "images")
            .map((channel) => getRequiredImageFormatsForChannel(channel)),
        )
      : EMPTY_IMAGE_FORMATS;

    // 1) Upload images to Supabase Storage (bucket: booster) + collect diagnostics.
    // Only prepare the image derivatives required by the selected channels.
    const { imageSet: baseImageSet, uploadErrors } = await uploadImageSet(
      userId,
      images,
      selectedImageFormats,
    );
    const uploadedUrls = baseImageSet.images;
    const publishableUrls = baseImageSet.publishableUrls;
    const instagramPublishableUrls = baseImageSet.instagramPublishableUrls;
    const socialFeedPublishableUrls = baseImageSet.socialFeedPublishableUrls;
    const siteCardPublishableUrls = baseImageSet.siteCardPublishableUrls;
    const gmbPublishableUrls = baseImageSet.gmbPublishableUrls;

    const channelImageSets: Partial<Record<ChannelKey, ImageSet>> = {};
    for (const channel of selected) {
      const rawChannelImages = Array.isArray(imagesByChannel?.[channel])
        ? (imagesByChannel[channel] as ImagePayload[])
        : [];
      const channelImagesToUpload =
        channel === "gmb" ? rawChannelImages.slice(0, 1) : rawChannelImages;
      if (!channelImagesToUpload.length) continue;
      const { imageSet, uploadErrors: channelErrors } = await uploadImageSet(
        userId,
        channelImagesToUpload,
        getRequiredImageFormatsForChannel(channel),
      );
      channelImageSets[channel] = {
        ...imageSet,
        editableAttachments: buildEditableImageAttachments(
          channelImagesToUpload,
          imageSet,
        ),
      };
      uploadErrors.push(
        ...channelErrors.map((entry) => ({
          ...entry,
          stage: `${channel}:${entry.stage}`,
        })),
      );
    }

    const fallbackImageSet =
      selected
        .map((channel) => channelImageSets[channel])
        .find((value): value is ImageSet =>
          Boolean(
            value &&
            (value.images.length ||
              value.publishableUrls.length ||
              value.instagramPublishableUrls.length ||
              value.socialFeedPublishableUrls.length ||
              value.siteCardPublishableUrls.length ||
              value.gmbPublishableUrls.length),
          ),
        ) || null;

    const publicationImageSet = baseImageSet.images.length
      ? baseImageSet
      : fallbackImageSet || baseImageSet;

    // Hard fail only if images were provided somewhere but none could be uploaded/prepared.
    if (
      hadAnyImageInput &&
      !publicationImageSet.images.length &&
      !publicationImageSet.publishableUrls.length &&
      !publicationImageSet.instagramPublishableUrls.length &&
      !publicationImageSet.socialFeedPublishableUrls.length &&
      !publicationImageSet.siteCardPublishableUrls.length &&
      !publicationImageSet.gmbPublishableUrls.length
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Les images sélectionnées n'ont pas pu être envoyées. Merci de réessayer.",
          uploadErrors,
        },
        { status: 400 },
      );
    }
    // 2) Persist publication
    const publicationId = randomUUID();
    const publicationVideoByChannel = buildPublicationVideoByChannel();

    const publicationInsert: JsonRecord = {
      id: publicationId,
      user_id: userId,
      title: firstPost.title,
      content: firstPost.content,
      cta: firstPost.cta,
      hashtags: firstPost.hashtags,
      images: hasAnyImageChannel ? uploadedUrls : [],
      idea,
    };

    // Champs ajoutés par ops/sql/2026-05-29_booster_video_publication_columns.sql.
    // On ne les ajoute que pour une vidéo pour ne pas casser les anciennes bases tant que le SQL n'est pas appliqué.
    if (hasAnyVideoChannel && publicationVideo) {
      publicationInsert.media_type = "video";
      publicationInsert.video_url = publicationVideo.publicUrl;
      publicationInsert.video_path = publicationVideo.storagePath;
      publicationInsert.video_mime = publicationVideo.type;
      publicationInsert.video_size = publicationVideo.size;
      publicationInsert.video_duration_seconds = publicationVideo.duration;
      publicationInsert.video_thumbnail_url = publicationVideo.thumbnailUrl;
      publicationInsert.media_metadata = { video: publicationVideo, videoByChannel: publicationVideoByChannel };
    }

    const { error: pubErr } = await supabaseAdmin
      .from("publications")
      .insert(publicationInsert);

    if (pubErr) {
      return NextResponse.json(
        {
          error: "Impossible d'enregistrer la publication pour le moment.",
          uploadErrors,
        },
        { status: 500 },
      );
    }

    // 3) Create deliveries
    const deliveries = selected.map((ch) => ({
      id: randomUUID(),
      publication_id: publicationId,
      user_id: userId,
      channel: ch,
      status: "queued" as const,
    }));

    await supabaseAdmin.from("publication_deliveries").insert(deliveries);

    // 4) Publish now
    const results: Record<string, unknown> = {};

    const [fbRow, gmbRow, igRow, liRow, tiktokRow] = await Promise.all([
      getLatestIntegrationRow(
        userId,
        "facebook",
        "facebook",
        "facebook",
        "status,resource_id,access_token_enc,expires_at",
      ),
      getLatestIntegrationRow(
        userId,
        "google",
        "gmb",
        "gmb",
        "status,resource_id,meta,expires_at",
      ),
      getLatestIntegrationRow(
        userId,
        "instagram",
        "instagram",
        "instagram",
        "status,resource_id,access_token_enc,resource_label,meta,expires_at",
      ),
      getLatestIntegrationRow(
        userId,
        "linkedin",
        "linkedin",
        "linkedin",
        "status,resource_id,access_token_enc,meta,expires_at",
      ),
      getLatestIntegrationRow(
        userId,
        "tiktok",
        "tiktok",
        "tiktok",
        "status,resource_id,resource_label,display_name,access_token_enc,refresh_token_enc,scopes,meta,expires_at",
      ),
    ]);

    // Internal channel configuration (URLs)
    const [profileRes, inrcyCfgRes, proCfgRes] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("inrcy_site_ownership,phone")
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("inrcy_site_configs")
        .select("site_url")
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("pro_tools_configs")
        .select("settings")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    const profile = asRecord(profileRes.data);
    const inrcyCfg = asRecord(inrcyCfgRes.data);
    const proCfg = asRecord(proCfgRes.data);
    const proSettings = asRecord(proCfg["settings"]);
    const proSiteWeb = asRecord(proSettings["site_web"]);

    const ownership = String(profile["inrcy_site_ownership"] ?? "none");
    const businessPhone = String(profile["phone"] ?? "").trim();
    const inrcySiteUrl = String(inrcyCfg["site_url"] ?? "").trim();
    const siteWebUrl = String(proSiteWeb["url"] ?? "").trim();

    const externalImageUrls = (
      publicationImageSet.publishableUrls.length
        ? publicationImageSet.publishableUrls
        : publicationImageSet.images
    ).slice(0, 5);
    const socialFeedImageUrls = (
      publicationImageSet.socialFeedPublishableUrls.length
        ? publicationImageSet.socialFeedPublishableUrls
        : externalImageUrls
    ).slice(0, 5);
    const instagramImageUrls = (
      publicationImageSet.instagramPublishableUrls.length
        ? publicationImageSet.instagramPublishableUrls
        : socialFeedImageUrls.length
          ? socialFeedImageUrls
          : externalImageUrls
    ).slice(0, 5);
    const gmbImageUrls = (
      publicationImageSet.gmbPublishableUrls.length
        ? publicationImageSet.gmbPublishableUrls
        : publicationImageSet.publishableUrls.length
          ? publicationImageSet.publishableUrls
          : publicationImageSet.images
    ).slice(0, 5);

    const getChannelImageSet = (channel: ChannelKey): ImageSet =>
      channelImageSets[channel] || baseImageSet;

    async function setDelivery(channel: ChannelKey, patch: JsonRecord) {
      const nextStatus = String(patch.status ?? "").trim();
      const nextError = String(patch.error ?? patch.last_error ?? "").trim();
      const payload: JsonRecord = {};
      if (nextStatus) payload.status = nextStatus;
      payload.error = nextError || null;

      const { error } = await supabaseAdmin
        .from("publication_deliveries")
        .update(payload)
        .eq("publication_id", publicationId)
        .eq("user_id", userId)
        .eq("channel", channel);

      if (error) {
        console.error("[Booster] publication_deliveries update failed", {
          channel,
          payload,
          error: error.message,
        });
      }
    }

    async function getTiktokAccessToken(rowLike: unknown) {
      const row = asRecord(rowLike);
      let accessToken = tryDecryptToken(String(row.access_token_enc || "")) || "";
      const refreshToken = tryDecryptToken(String(row.refresh_token_enc || "")) || "";

      if (accessToken && !isExpired(row.expires_at, 120)) return accessToken;
      if (!refreshToken) return accessToken;

      const refreshed = await refreshTiktokAccessToken(refreshToken);
      const nextAccessToken = String(refreshed.access_token || "").trim();
      const nextRefreshToken = String(refreshed.refresh_token || "").trim() || refreshToken;
      const expiresIn = Number(refreshed.expires_in || 0);
      const refreshExpiresIn = Number(refreshed.refresh_expires_in || 0);
      const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : null;
      const nextMeta = {
        ...asRecord(row.meta),
        refresh_expires_at: Number.isFinite(refreshExpiresIn) && refreshExpiresIn > 0
          ? new Date(Date.now() + refreshExpiresIn * 1000).toISOString()
          : asRecord(row.meta).refresh_expires_at || null,
        tiktok_token_refreshed_at: new Date().toISOString(),
      };

      if (nextAccessToken) {
        await supabaseAdmin
          .from("integrations")
          .update({
            access_token_enc: encryptToken(nextAccessToken),
            refresh_token_enc: nextRefreshToken ? encryptToken(nextRefreshToken) : row.refresh_token_enc || null,
            expires_at: expiresAt || row.expires_at || null,
            meta: nextMeta,
          })
          .eq("user_id", userId)
          .eq("provider", "tiktok")
          .eq("source", "tiktok")
          .eq("product", "tiktok");
        accessToken = nextAccessToken;
      }

      return accessToken;
    }

    for (const ch of selected) {
      try {
        const channelPost = getChannelPost(ch);
        const canonMessage = buildBoosterMessage(ch, channelPost, {
          websiteUrl: siteWebUrl || inrcySiteUrl,
          phone: businessPhone,
        });
        const channelVideo = mediaModeByChannel[ch] === "video" ? getPublicationVideoForChannel(ch) : null;

        if (ch === "inrcy_site" || ch === "site_web") {
          // We treat "publication" as an "article/actu" for the site.
          // This creates a record that your iNrCy site renderer (or your pro's website connector)
          // can consume to display the article.
          const targetUrl = ch === "inrcy_site" ? inrcySiteUrl : siteWebUrl;
          if (
            ch === "inrcy_site" &&
            (!hasActiveInrcySite(ownership) || !targetUrl)
          ) {
            await setDelivery(ch, {
              status: "failed",
              error: "Le site iNrCy n'est pas encore correctement configuré.",
            });
            results[ch] = {
              ok: false,
              error: "Le site iNrCy n'est pas encore correctement configuré.",
            };
            continue;
          }
          if (ch === "site_web" && !targetUrl) {
            await setDelivery(ch, {
              status: "failed",
              error: "Le site web n'est pas encore correctement configuré.",
            });
            results[ch] = {
              ok: false,
              error: "Le site web n'est pas encore correctement configuré.",
            };
            continue;
          }

          const articleId = randomUUID();
          const slug = slugify(channelPost.title) || "actu";
          const externalUrl = targetUrl
            ? `${targetUrl.replace(/\/+$/g, "")}/actu/${slug}-${articleId}`
            : null;

          // IMPORTANT: keep this insert compatible with your current `public.site_articles` table.
          // Your table currently contains at least: id, created_at, user_id, source, title, content.
          // (If you later add more columns, you can extend this insert.)
          const { error: artErr } = await supabaseAdmin
            .from("site_articles")
            .insert({
              id: articleId,
              user_id: userId,
              source: ch,
              title: channelPost.title,
              content: channelPost.content,
              cta: channelPost.cta,
              hashtags: channelPost.hashtags,
              images:
                mediaModeByChannel[ch] === "images"
                  ? (() => {
                      const channelImageSet = getChannelImageSet(ch);
                      // For website embeds, always prefer the original uploaded assets.
                      // They preserve the real framing and avoid publishing the blurred
                      // site-card derivative inside the iframe media slot.
                      return channelImageSet.images.length
                        ? channelImageSet.images
                        : channelImageSet.socialFeedPublishableUrls.length
                          ? channelImageSet.socialFeedPublishableUrls
                          : channelImageSet.siteCardPublishableUrls;
                    })()
                  : [],
              ...(mediaModeByChannel[ch] === "video" && channelVideo
                ? {
                    media_type: "video",
                    video_url: channelVideo.publicUrl,
                    video_path: channelVideo.storagePath,
                    video_mime: channelVideo.type,
                    video_size: channelVideo.size,
                    video_duration_seconds: channelVideo.duration,
                    video_thumbnail_url: channelVideo.thumbnailUrl,
                    media_metadata: { video: channelVideo },
                  }
                : {}),
              external_url: externalUrl, // ✅ si tu veux (optionnel)
              site_url: targetUrl || null, // ✅ si tu veux (optionnel)
            });

          if (artErr) {
            const siteUserError = getPublishChannelUserMessage(
              ch,
              artErr,
              "Impossible de créer l'article pour le moment.",
            );
            logPublishChannelFailure({
              route: "booster_publish_now",
              channel: ch,
              userId,
              publicationId,
              stage: "site_article",
              error: artErr,
              userMessage: siteUserError,
            });
            await setDelivery(ch, { status: "failed", error: siteUserError });
            results[ch] = {
              ok: false,
              error: siteUserError,
              raw_error: artErr.message || String(artErr),
            };
            continue;
          }

          await setDelivery(ch, {
            status: "delivered",
            error: null,
          });
          results[ch] = {
            ok: true,
            external_id: articleId,
            external_url: externalUrl,
          };
          continue;
        }

        if (ch === "facebook") {
          const fb = asRecord(fbRow);
          const pageId = String(fb["resource_id"] ?? "");
          const pageTokenRaw = String(fb["access_token_enc"] ?? "");
          const pageToken = tryDecryptToken(pageTokenRaw) || "";
          const fbMeta = asRecord(fb["meta"]);
          const fbExpired =
            isExpired(fb["expires_at"]) &&
            !String(fbMeta["selected"] ?? "") &&
            !pageId;
          if (
            String(fb["status"] ?? "") !== "connected" ||
            !pageId ||
            !pageToken ||
            fbExpired
          ) {
            const facebookUserError = fbExpired
              ? getPublishChannelUserMessage("facebook", "token expired")
              : "Facebook à connecter. Rendez-vous dans Canaux.";
            logPublishChannelFailure({
              route: "booster_publish_now",
              channel: "facebook",
              userId,
              publicationId,
              stage: "precheck",
              error: fbExpired ? "token_expired" : "not_connected",
              userMessage: facebookUserError,
            });
            await setDelivery(ch, {
              status: "failed",
              error: facebookUserError,
            });
            results[ch] = { ok: false, error: facebookUserError };
            continue;
          }

          const resp =
            mediaModeByChannel[ch] === "video" && channelVideo
              ? await facebookPublishVideoToPage({
                  pageId,
                  pageAccessToken: pageToken,
                  description: canonMessage,
                  title: channelPost.title || undefined,
                  videoUrl: channelVideo.publicUrl,
                })
              : await facebookPublishToPage({
                  pageId,
                  pageAccessToken: pageToken,
                  message: canonMessage,
                  imageUrls: (getChannelImageSet(ch).socialFeedPublishableUrls
                    .length
                    ? getChannelImageSet(ch).socialFeedPublishableUrls
                    : socialFeedImageUrls
                  ).slice(0, 5),
                });

          if (!resp.ok) {
            const facebookUserError = getPublishChannelUserMessage(
              "facebook",
              resp.error,
            );
            logPublishChannelFailure({
              route: "booster_publish_now",
              channel: "facebook",
              userId,
              publicationId,
              stage: "publish",
              error: resp.error,
              userMessage: facebookUserError,
              diagnostics: resp,
            });
            await setDelivery(ch, {
              status: "failed",
              error: facebookUserError,
            });
            results[ch] = {
              ok: false,
              error: facebookUserError,
              raw_error: resp.error,
              diagnostics: resp,
            };
            continue;
          }

          await setDelivery(ch, { status: "delivered", error: null });

          results[ch] = {
            ok: true,
            external_id: resp.postId,
            diagnostics: resp,
          };
          continue;
        }

        if (ch === "instagram") {
          const ig = asRecord(igRow);
          const igUserId = String(ig["resource_id"] ?? "");
          const igTokenRaw = String(ig["access_token_enc"] ?? "");
          const igToken = tryDecryptToken(igTokenRaw) || "";
          const igMeta = asRecord(ig["meta"]);
          const igExpired =
            isExpired(ig["expires_at"]) &&
            !String(igMeta["page_id"] ?? "") &&
            !igUserId;
          if (
            String(ig["status"] ?? "") !== "connected" ||
            !igUserId ||
            !igToken ||
            igExpired
          ) {
            const instagramUserError = igExpired
              ? INSTAGRAM_RECONNECT_USER_MESSAGE
              : "Instagram à connecter. Rendez-vous dans Canaux.";
            logPublishChannelFailure({
              route: "booster_publish_now",
              channel: "instagram",
              userId,
              publicationId,
              stage: "precheck",
              error: igExpired ? "token_expired" : "not_connected",
              userMessage: instagramUserError,
            });
            await setDelivery(ch, {
              status: "failed",
              error: instagramUserError,
            });
            results[ch] = { ok: false, error: instagramUserError };
            continue;
          }

          const instagramCaption = buildBoosterInstagramCaption(channelPost, {
            websiteUrl: siteWebUrl || inrcySiteUrl,
            phone: businessPhone,
          });
          const instagramTokenCandidates = buildInstagramPublishTokenCandidates(
            ig,
            fbRow,
          );
          let resp;
          if (mediaModeByChannel[ch] === "video" && channelVideo) {
            resp = await instagramPublishVideoWithTokenFallback({
              igUserId,
              accessToken: igToken,
              tokenCandidates: instagramTokenCandidates,
              caption: instagramCaption,
              videoUrl: channelVideo.publicUrl,
            });
          } else {
            const instagramImages = (
              getChannelImageSet(ch).instagramPublishableUrls.length
                ? getChannelImageSet(ch).instagramPublishableUrls
                : instagramImageUrls
            )
              .filter(Boolean)
              .slice(0, 10);
            if (!instagramImages.length) {
              await setDelivery(ch, {
                status: "failed",
                error: "Instagram nécessite au moins 1 image",
              });
              results[ch] = {
                ok: false,
                error: "Instagram a besoin d'au moins une image pour publier.",
              };
              continue;
            }
            resp =
              instagramImages.length > 1
                ? await instagramPublishCarouselWithTokenFallback({
                    igUserId,
                    accessToken: igToken,
                    tokenCandidates: instagramTokenCandidates,
                    caption: instagramCaption,
                    imageUrls: instagramImages,
                  })
                : await instagramPublishPhotoWithTokenFallback({
                    igUserId,
                    accessToken: igToken,
                    tokenCandidates: instagramTokenCandidates,
                    caption: instagramCaption,
                    imageUrl: instagramImages[0],
                  });
          }

          if (!resp.ok) {
            const instagramUserError =
              isInstagramAuthorizationErrorResult(resp) ||
              isInstagramAuthorizationLikeMessage(`instagram ${resp.error}`)
                ? INSTAGRAM_RECONNECT_USER_MESSAGE
                : getSimpleFrenchErrorMessage(
                    `instagram ${resp.error}`,
                    resp.error || "La publication Instagram a échoué.",
                  );
            logPublishChannelFailure({
              route: "booster_publish_now",
              channel: "instagram",
              userId,
              publicationId,
              stage: "publish",
              error: resp.error,
              userMessage: instagramUserError,
              diagnostics: resp,
            });
            await setDelivery(ch, {
              status: "failed",
              error: instagramUserError,
            });
            results[ch] = {
              ok: false,
              error: instagramUserError,
              raw_error: resp.error,
              diagnostics: resp,
            };
            continue;
          }

          await setDelivery(ch, { status: "delivered", error: null });

          results[ch] = {
            ok: true,
            external_id: resp.mediaId,
            instagram_media_type: resp.mediaType,
            instagram_parent_media_id: resp.parentMediaId || resp.mediaId,
            instagram_child_media_ids:
              resp.childMediaIds || resp.childContainerIds || [],
            diagnostics: resp,
          };
          continue;
        }

        if (ch === "linkedin") {
          const li = asRecord(liRow);
          const auth = await getLinkedInAccessToken({ userId });
          const accessToken = auth.accessToken || "";
          const liMeta = asRecord(li["meta"]);
          const rawAuthorUrn =
            auth.authorUrn || String(li["resource_id"] ?? "");
          const authorUrn = rawAuthorUrn.startsWith("urn:li:person:")
            ? rawAuthorUrn
            : "";
          const selectedOrgId = String(liMeta["org_id"] || "").trim();
          const orgUrn =
            auth.orgUrn ||
            String(liMeta["org_urn"] || "") ||
            (selectedOrgId ? `urn:li:organization:${selectedOrgId}` : "");
          const useAuthor = orgUrn || authorUrn;
          if (
            String(li["status"] ?? "") !== "connected" ||
            !accessToken ||
            !useAuthor
          ) {
            const liRawError =
              auth.error && auth.refreshTokenPresent
                ? `token refresh failed: ${auth.error}`
                : auth.error && !auth.refreshTokenPresent
                  ? `token expired: ${auth.error}`
                  : "not_connected";
            const liError = getPublishChannelUserMessage(
              "linkedin",
              liRawError,
              "LinkedIn à connecter. Rendez-vous dans Canaux.",
            );
            logPublishChannelFailure({
              route: "booster_publish_now",
              channel: "linkedin",
              userId,
              publicationId,
              stage: "precheck",
              error: liRawError,
              userMessage: liError,
              diagnostics: {
                refreshTokenPresent: auth.refreshTokenPresent,
                refreshed: auth.refreshed,
                canReconnectSilently: auth.canReconnectSilently,
              },
            });
            await setDelivery(ch, { status: "failed", error: liError });
            results[ch] = {
              ok: false,
              error: liError,
              raw_error: auth.error || null,
            };
            continue;
          }
          const linkedInImages = (
            getChannelImageSet(ch).socialFeedPublishableUrls.length
              ? getChannelImageSet(ch).socialFeedPublishableUrls
              : socialFeedImageUrls.length
                ? socialFeedImageUrls
                : externalImageUrls
          )
            .filter(Boolean)
            .slice(0, 20);
          const isLinkedInVideo = Boolean(
            mediaModeByChannel[ch] === "video" && channelVideo,
          );
          let resp = isLinkedInVideo
            ? await linkedinPublishVideo({
                accessToken,
                authorUrn: useAuthor,
                text: canonMessage,
                videoUrl: channelVideo!.publicUrl || channelVideo!.url || "",
                title: channelPost.title || undefined,
              })
            : linkedInImages.length > 1
              ? await linkedinPublishMultiImage({
                  accessToken,
                  authorUrn: useAuthor,
                  text: canonMessage,
                  imageUrls: linkedInImages,
                  title: channelPost.title || undefined,
                })
              : linkedInImages[0]
                ? await linkedinPublishImage({
                    accessToken,
                    authorUrn: useAuthor,
                    text: canonMessage,
                    imageUrl: linkedInImages[0],
                    title: channelPost.title || undefined,
                  })
                : await linkedinPublishText({
                    accessToken,
                    authorUrn: useAuthor,
                    text: canonMessage,
                  });

          if (!resp.ok && !isLinkedInVideo && linkedInImages[0]) {
            const fallbackResp = await linkedinPublishText({
              accessToken,
              authorUrn: useAuthor,
              text: canonMessage,
            });
            if (fallbackResp.ok) {
              resp = {
                ...fallbackResp,
                diagnostics: {
                  mediaPublishError: resp.error,
                  mediaPublishDiagnostics: resp.diagnostics,
                  fallback: "text_only",
                },
              };
            }
          }

          if (!resp.ok) {
            const linkedInUserError = getPublishChannelUserMessage(
              "linkedin",
              resp.error,
            );
            logPublishChannelFailure({
              route: "booster_publish_now",
              channel: "linkedin",
              userId,
              publicationId,
              stage: "publish",
              error: resp.error,
              userMessage: linkedInUserError,
              diagnostics: resp,
            });
            await setDelivery(ch, {
              status: "failed",
              error: linkedInUserError,
            });
            results[ch] = {
              ok: false,
              error: linkedInUserError,
              raw_error: resp.error,
              diagnostics: resp,
            };
            continue;
          }

          await setDelivery(ch, { status: "delivered", error: null });

          results[ch] = {
            ok: true,
            external_id: resp.postUrn || null,
            diagnostics: resp,
          };
          continue;
        }

        if (ch === "tiktok") {
          const tiktokSettings = normalizeTiktokSettings(proSettings["tiktok"]);
          const activeTiktok = isTiktokIntegrationActive(tiktokRow);
          const tiktokAccessToken = activeTiktok ? await getTiktokAccessToken(tiktokRow) : "";

          if (!activeTiktok || !tiktokAccessToken) {
            const tiktokUserError = "TikTok à connecter. Rendez-vous dans Canaux.";
            logPublishChannelFailure({
              route: "booster_publish_now",
              channel: "tiktok",
              userId,
              publicationId,
              stage: "precheck",
              error: "not_connected",
              userMessage: tiktokUserError,
            });
            await setDelivery(ch, { status: "failed", error: tiktokUserError });
            results[ch] = { ok: false, error: tiktokUserError };
            continue;
          }

          const tiktokMode = mediaModeByChannel[ch] || "none";
          const tiktokImageSet = getChannelImageSet(ch);
          const tiktokImageStoragePaths = (
            tiktokImageSet.socialFeedStoragePaths?.length
              ? tiktokImageSet.socialFeedStoragePaths
              : tiktokImageSet.publishableStoragePaths?.length
                ? tiktokImageSet.publishableStoragePaths
                : tiktokImageSet.storagePaths || []
          ).filter(Boolean).slice(0, 35);
          const tiktokFallbackImageUrls = (
            tiktokImageSet.publishableUrls.length
              ? tiktokImageSet.publishableUrls
              : tiktokImageSet.socialFeedPublishableUrls.length
                ? tiktokImageSet.socialFeedPublishableUrls
                : tiktokImageSet.images.length
                  ? tiktokImageSet.images
                  : externalImageUrls
          ).filter(Boolean).slice(0, 35);
          const tiktokImageUrls = tiktokImageStoragePaths.length
            ? tiktokImageStoragePaths
                .map((path) => buildTiktokMediaProxyUrl(req.url, path))
                .filter(Boolean)
                .slice(0, 35)
            : tiktokFallbackImageUrls;

          if (tiktokMode === "video" && !channelVideo) {
            const tiktokUserError = "TikTok nécessite une vidéo pour ce format.";
            await setDelivery(ch, { status: "failed", error: tiktokUserError });
            results[ch] = { ok: false, error: tiktokUserError };
            continue;
          }

          if (tiktokMode === "images" && !tiktokImageUrls.length) {
            const tiktokUserError = "TikTok nécessite au moins 1 photo ou 1 vidéo.";
            await setDelivery(ch, { status: "failed", error: tiktokUserError });
            results[ch] = { ok: false, error: tiktokUserError };
            continue;
          }

          if (tiktokMode !== "video" && tiktokMode !== "images") {
            const tiktokUserError = "TikTok nécessite une vidéo ou au moins 1 photo.";
            await setDelivery(ch, { status: "failed", error: tiktokUserError });
            results[ch] = { ok: false, error: tiktokUserError };
            continue;
          }

          const isVideo = tiktokMode === "video";
          const videoUrl = isVideo && channelVideo?.storagePath
            ? buildTiktokMediaProxyUrl(req.url, channelVideo.storagePath)
            : isVideo
              ? String(channelVideo?.publicUrl || channelVideo?.url || "").trim()
              : "";

          if (isVideo && !videoUrl) {
            const tiktokUserError = "TikTok ne trouve pas l'URL publique de la vidéo.";
            await setDelivery(ch, { status: "failed", error: tiktokUserError });
            results[ch] = { ok: false, error: tiktokUserError };
            continue;
          }

          const tiktokTitle = canonMessage || channelPost.content || channelPost.title || "Publication iNrCy";
          const tiktokResult = isVideo
            ? await tiktokDirectPostVideo({
                accessToken: tiktokAccessToken,
                videoUrl,
                title: tiktokTitle,
                defaults: tiktokSettings.defaults,
              })
            : await tiktokDirectPostPhotos({
                accessToken: tiktokAccessToken,
                imageUrls: tiktokImageUrls,
                title: channelPost.title || "Publication iNrCy",
                description: tiktokTitle,
                defaults: tiktokSettings.defaults,
              });

          if (!tiktokResult.ok) {
            const tiktokUserError = tiktokResult.error || "TikTok n'a pas accepté la publication.";
            logPublishChannelFailure({
              route: "booster_publish_now",
              channel: "tiktok",
              userId,
              publicationId,
              stage: "publish",
              error: tiktokResult.error || "tiktok_publish_failed",
              userMessage: tiktokUserError,
              diagnostics: tiktokResult,
            });
            await setDelivery(ch, { status: "failed", error: tiktokUserError });
            results[ch] = { ok: false, error: tiktokUserError, diagnostics: tiktokResult };
            continue;
          }

          await setDelivery(ch, { status: "delivered", error: null });

          const tiktokOpenUrl = String(tiktokResult.shareUrl || tiktokSettings.profileUrl || "").trim() || null;

          results[ch] = {
            ok: true,
            external_id: tiktokResult.publishId || null,
            external_url: tiktokOpenUrl,
            share_url: tiktokResult.shareUrl || null,
            tiktok_status: tiktokResult.status?.status || "PUBLISH_COMPLETE",
            tiktok_media_type: isVideo ? "video" : "photos",
            media_type: isVideo ? "video" : "photos",
            media_count: isVideo ? 1 : tiktokImageUrls.length,
            username: tiktokSettings.username,
            profile_url: tiktokSettings.profileUrl || null,
            diagnostics: {
              provider: "tiktok",
              mode: "direct_post",
              publish_id: tiktokResult.publishId || null,
              mediaType: isVideo ? "video" : "photos",
              privacyLevel: tiktokResult.privacyLevel || null,
              mediaUrls: isVideo ? [videoUrl] : tiktokImageUrls,
              defaults: tiktokSettings.defaults,
              status: tiktokResult.status || null,
              share_url: tiktokResult.shareUrl || null,
              raw: tiktokResult.raw,
            },
          };
          continue;
        }

        if (ch === "gmb") {
          const gmb = asRecord(gmbRow);
          const locationName = String(gmb["resource_id"] ?? "");
          const gmbMeta = asRecord(gmb["meta"]);
          const accountName = String(gmbMeta["account"] ?? "");
          if (
            String(gmb["status"] ?? "") !== "connected" ||
            !locationName ||
            !accountName
          ) {
            const gmbUserError =
              "Google Business à connecter. Rendez-vous dans Canaux.";
            logPublishChannelFailure({
              route: "booster_publish_now",
              channel: "gmb",
              userId,
              publicationId,
              stage: "precheck",
              error: "not_connected",
              userMessage: gmbUserError,
            });
            await setDelivery(ch, { status: "failed", error: gmbUserError });
            results[ch] = { ok: false, error: gmbUserError };
            continue;
          }

          const tok = await getGmbToken();
          if (!tok?.accessToken) {
            const gmbUserError = GOOGLE_BUSINESS_RECONNECT_USER_MESSAGE;
            logPublishChannelFailure({
              route: "booster_publish_now",
              channel: "gmb",
              userId,
              publicationId,
              stage: "token",
              error: "missing_or_expired_token",
              userMessage: gmbUserError,
            });
            await setDelivery(ch, { status: "failed", error: gmbUserError });
            results[ch] = { ok: false, error: gmbUserError };
            continue;
          }

          const gmbChannelImageSet = getChannelImageSet(ch);
          const gmbChannelImages =
            mediaModeByChannel[ch] === "images"
              ? (gmbChannelImageSet.gmbPublishableUrls.length
                  ? gmbChannelImageSet.gmbPublishableUrls
                  : gmbImageUrls.length
                    ? gmbImageUrls
                    : gmbChannelImageSet.publishableUrls
                )
                  .filter(Boolean)
                  .slice(0, 1)
              : [];
          const gmbChannelVideos =
            mediaModeByChannel[ch] === "video" && channelVideo
              ? [channelVideo.publicUrl].filter(Boolean).slice(0, 1)
              : [];
          const gmbSummary = buildBoosterGmbSummary(channelPost);
          const gmbCallToAction = getBoosterGmbCallToAction(channelPost, {
            websiteUrl: siteWebUrl || inrcySiteUrl,
            phone: businessPhone,
          });
          let gmbResp: any;
          let gmbWarning: { code: string; message: string } | null = null;

          try {
            gmbResp = await gmbCreateLocalPost({
              accessToken: tok.accessToken,
              accountName,
              locationName,
              summary: gmbSummary,
              imageUrls: gmbChannelImages.length ? gmbChannelImages : undefined,
              videoUrls: gmbChannelVideos.length ? gmbChannelVideos : undefined,
              languageCode: "fr-FR",
              callToAction: gmbCallToAction || undefined,
            });
          } catch (gmbErr: unknown) {
            const hasMedia = Boolean(
              gmbChannelImages.length || gmbChannelVideos.length,
            );
            const retryWithoutMedia = async () =>
              gmbCreateLocalPost({
                accessToken: tok.accessToken,
                accountName,
                locationName,
                summary: gmbSummary,
                languageCode: "fr-FR",
                callToAction: gmbCallToAction || undefined,
              });
            const retryWithoutCta = async () =>
              gmbCreateLocalPost({
                accessToken: tok.accessToken,
                accountName,
                locationName,
                summary: gmbSummary,
                imageUrls: gmbChannelImages.length
                  ? gmbChannelImages
                  : undefined,
                videoUrls: gmbChannelVideos.length
                  ? gmbChannelVideos
                  : undefined,
                languageCode: "fr-FR",
              });
            try {
              if (!hasMedia) throw gmbErr;
              gmbResp = await retryWithoutMedia();
              gmbWarning =
                mediaModeByChannel[ch] === "video"
                  ? {
                      code: "published_without_video",
                      message:
                        "Google Business a publié le texte, mais la vidéo n'a pas pu être jointe cette fois-ci.",
                    }
                  : {
                      code: isGoogleBusinessImageError(gmbErr)
                        ? "published_without_image"
                        : "published_after_retry_without_image",
                      message: isGoogleBusinessImageError(gmbErr)
                        ? "Google Business a publié le texte, mais n'a pas pu récupérer l'image. Vérifiez que l'image reste publique et accessible sans connexion."
                        : "Google Business a publié le texte après une reprise automatique. L'image n'a pas pu être jointe cette fois-ci.",
                    };
            } catch (retryError: unknown) {
              if (gmbCallToAction) {
                try {
                  gmbResp = await retryWithoutCta();
                  gmbWarning = {
                    code: "published_without_cta",
                    message:
                      "Google Business a publié le texte sans bouton CTA.",
                  };
                } catch {
                  throw retryError;
                }
              } else {
                throw retryError;
              }
            }
          }

          const gmbRespRec = asRecord(gmbResp);
          const externalId = String(gmbRespRec["name"] ?? "");
          await setDelivery(ch, { status: "delivered", error: null });
          results[ch] = {
            ok: true,
            external_id: externalId || null,
            ...(gmbWarning
              ? {
                  warning: gmbWarning.code,
                  warning_message: gmbWarning.message,
                }
              : {}),
          };
          continue;
        }

        results[ch] = { ok: false, error: "unsupported_channel" };
      } catch (e: unknown) {
        const msg = getPublishChannelUserMessage(
          ch,
          e,
          "L'action n'a pas pu être finalisée.",
        );
        logPublishChannelFailure({
          route: "booster_publish_now",
          channel: ch,
          userId,
          publicationId,
          stage: "exception",
          error: e,
          userMessage: msg,
        });
        await setDelivery(ch, { status: "failed", error: msg });
        results[ch] = {
          ok: false,
          error: msg,
          raw_error: e instanceof Error ? e.message : String(e || ""),
        };
      }
    }

    const persistedVideo =
      hasAnyVideoChannel && publicationVideo ? publicationVideo : null;
    const videoByChannel = publicationVideoByChannel;

    const persistedPostByChannel = Object.fromEntries(
      selected.map((channel) => {
        const baseValue = (postByChannel as Record<string, unknown>)[
          channel
        ] as Record<string, unknown> | undefined;
        const channelPersistedVideo =
          mediaModeByChannel[channel] === "video"
            ? getPublicationVideoForChannel(channel)
            : null;

        if (mediaModeByChannel[channel] === "video" && channelPersistedVideo) {
          return [
            channel,
            {
              ...(baseValue || {}),
              images: [],
              attachments: [channelPersistedVideo],
              video: channelPersistedVideo,
              sourceVideo: persistedVideo,
              mediaMode: "video",
              videoSettings: videoSettingsByChannel[channel] || null,
              videoFormat: videoSettingsByChannel[channel]?.format || null,
              videoAdaptationMode: videoSettingsByChannel[channel]?.adaptationMode || null,
            },
          ];
        }

        if (mediaModeByChannel[channel] === "none") {
          return [
            channel,
            {
              ...(baseValue || {}),
              images: [],
              attachments: [],
              mediaMode: "none",
              videoSettings: videoSettingsByChannel[channel] || null,
            },
          ];
        }

        const imageSet = channelImageSets[channel];
        return [
          channel,
          imageSet
            ? {
                ...(baseValue || {}),
                images: imageSet.images,
                attachments: imageSet.editableAttachments?.length
                  ? imageSet.editableAttachments
                  : imageSet.images,
                publishableUrls: imageSet.publishableUrls,
                instagramPublishableUrls: imageSet.instagramPublishableUrls,
                socialFeedPublishableUrls: imageSet.socialFeedPublishableUrls,
                siteCardPublishableUrls: imageSet.siteCardPublishableUrls,
                gmbPublishableUrls: imageSet.gmbPublishableUrls,
                storagePaths: imageSet.storagePaths,
                publishableStoragePaths: imageSet.publishableStoragePaths,
                socialFeedStoragePaths: imageSet.socialFeedStoragePaths,
                mediaMode: "images",
                videoSettings: videoSettingsByChannel[channel] || null,
              }
            : { ...(baseValue || {}), mediaMode: "images", videoSettings: videoSettingsByChannel[channel] || null },
        ];
      }),
    );

    const summary = buildResultsSummary(results, selected);

    // Sécurité compteur/stats : on ne valide l'action Booster que si au moins un canal a réellement publié.
    // Ainsi, les compteurs, missions et UI ne montent pas quand tous les canaux échouent.
    if (summary.successCount <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Aucun canal n'a pu publier. Les compteurs et les UI n'ont pas été mis à jour.",
          publication_id: publicationId,
          mediaType,
          mediaModeByChannel,
          videoSettingsByChannel,
          video: persistedVideo,
          videoByChannel,
          images: uploadedUrls,
          publishableUrls,
          instagramPublishableUrls,
          socialFeedPublishableUrls,
          siteCardPublishableUrls,
          gmbPublishableUrls,
          uploadErrors,
          results,
          summary,
        },
        { status: 200 },
      );
    }

    // 5) Log publication / valorisation event uniquement après succès réel
    await supabaseAdmin.from("app_events").insert({
      id: randomUUID(),
      user_id: userId,
      module: eventModule,
      type: eventType,
      payload: {
        workflowTool: eventModule,
        workflowAction,
        mediaType,
        mediaModeByChannel,
        videoSettingsByChannel,
        video: persistedVideo,
        videoByChannel,
        idea,
        channels: summary.successChannels,
        attemptedChannels: selected,
        post: firstPost,
        postByChannel: persistedPostByChannel,
        imageSettingsByChannel,
        images: uploadedUrls,
        publishableUrls,
        instagramPublishableUrls,
        socialFeedPublishableUrls,
        siteCardPublishableUrls,
        gmbPublishableUrls,
        uploadErrors,
        publication_id: publicationId,
        results,
        summary,
      },
    });

    return NextResponse.json({
      ok: true,
      publication_id: publicationId,
      mediaType,
      mediaModeByChannel,
      videoSettingsByChannel,
      video: persistedVideo,
      videoByChannel,
      images: uploadedUrls,
      publishableUrls,
      instagramPublishableUrls,
      socialFeedPublishableUrls,
      gmbPublishableUrls,
      uploadErrors,
      results,
      summary,
    });
  } catch (e: unknown) {
    return jsonUserFacingError(e, {
      status: 500,
      fallback: "L'action n'a pas pu être finalisée.",
      code: "publish_now_failed",
    });
  }
}
