import { NextResponse } from "next/server";
import {
  rowToInrAgentAction,
  sanitizeInrAgentActionStatus,
  summarizeInrAgentActions,
} from "@/lib/inrAgentActions";
import { requireUser } from "@/lib/requireUser";
import { buildStorageContentUrl } from "@/lib/storageContentUrl";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeMailSubject } from "@/lib/mailEncoding";
import { textToRichMailHtml } from "@/lib/mailRichText";
import { buildVideoSettingsByChannel } from "@/lib/boosterVideoSettings";
import { randomUUID } from "crypto";
import {
  buildVideoAiContextReference,
  normalizeVideoAiContextReference,
  videoAiContextReferenceAliases,
  type VideoAiContextReference,
} from "@/lib/videoAiContextReference";
import {
  INR_MEDIA_IMAGE_MAX_BYTES,
  INR_MEDIA_VIDEO_SOURCE_MAX_BYTES,
} from "@/lib/mediaRules";

export const runtime = "nodejs";
export const maxDuration = 90;

function isMissingTableError(
  error: { code?: string; message?: string } | null | undefined,
) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    error?.code === "PGRST205" ||
    message.includes("inr_agent_actions")
  );
}

const ACTION_SELECT =
  "id, automation_key, action_type, target_tool, title, summary, preview_text, target_channels, target_themes, recipients, image_assets, payload, validation_required, execution_policy, status, scheduled_for, prepared_at, validated_at, refused_at, completed_at, last_error, created_at, updated_at";
const IMAGE_BANK_BUCKET = "inrcy-image-bank";
const MAX_AGENT_IMAGE_BYTES = INR_MEDIA_IMAGE_MAX_BYTES;
const MAX_AGENT_VIDEO_BYTES = INR_MEDIA_VIDEO_SOURCE_MAX_BYTES;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cleanText(value: unknown, maxLength = 6000) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function withFreshReportDocument(payload: Record<string, unknown>) {
  const reportRecord = asRecord(payload.reportDocument);
  if (!reportRecord) return payload;

  const storagePath = String(
    reportRecord.storagePath ||
      reportRecord.storage_path ||
      reportRecord.path ||
      "",
  ).trim();
  const bucket = String(reportRecord.bucket || "inr-agent-reports").trim();
  if (!storagePath || !bucket) return payload;

  return Promise.resolve({
    ...payload,
    reportDocument: {
      ...reportRecord,
      bucket,
      storagePath,
      downloadUrl: buildStorageContentUrl(bucket, storagePath) || "",
    },
  });
}

async function refreshImageAssetUrls(assets: unknown[]) {
  return Promise.all(
    assets.map(async (asset) => {
      const record =
        typeof asset === "string" ? { url: asset } : asRecord(asset);
      if (!record) return asset;

      const storagePath = String(
        record.storagePath || record.storage_path || record.path || "",
      ).trim();
      const bucket = String(record.bucket || IMAGE_BANK_BUCKET).trim();

      if (!storagePath || !bucket) return record;

      return {
        ...record,
        bucket,
        storagePath,
        url: buildStorageContentUrl(bucket, storagePath) || "",
      };
    }),
  );
}

function isMediaRecord(value: unknown) {
  const record = asRecord(value);
  if (!record) return false;
  return Boolean(
    record.storagePath ||
    record.storage_path ||
    record.path ||
    record.url ||
    record.publicUrl ||
    record.src,
  );
}

async function refreshPublishMediaUrl(media: unknown) {
  const record = asRecord(media);
  if (!record) return media;

  const storagePath = String(
    record.storagePath || record.storage_path || record.path || "",
  ).trim();
  const bucket = String(record.bucket || IMAGE_BANK_BUCKET).trim();
  if (!storagePath || !bucket) return record;

  const url = buildStorageContentUrl(bucket, storagePath) || "";
  return {
    ...record,
    bucket,
    storagePath,
    path: storagePath,
    url,
    publicUrl: url,
  };
}

async function refreshPostByChannelMediaUrls(postByChannel: unknown) {
  const posts = asRecord(postByChannel);
  if (!posts) return postByChannel;

  const nextEntries = await Promise.all(
    Object.entries(posts).map(async ([channel, value]) => {
      const post = asRecord(value);
      if (!post) return [channel, value] as const;
      const nextPost = { ...post };
      for (const key of [
        "media",
        "mediaAsset",
        "image",
        "imageAsset",
        "video",
        "videoAsset",
        "file",
        "attachment",
      ] as const) {
        if (isMediaRecord(nextPost[key]))
          nextPost[key] = await refreshPublishMediaUrl(nextPost[key]);
      }
      return [channel, nextPost] as const;
    }),
  );

  return Object.fromEntries(nextEntries);
}

async function refreshActionImageUrls(
  action: ReturnType<typeof rowToInrAgentAction>,
) {
  const imageAssets = await refreshImageAssetUrls(action.imageAssets);
  let payload = { ...action.payload };
  const mediaRecord = asRecord(
    payload.media ||
      payload.mediaAsset ||
      payload.image ||
      payload.imageAsset ||
      payload.video ||
      payload.videoAsset,
  );
  if (mediaRecord) {
    const freshMedia = await refreshPublishMediaUrl(mediaRecord);
    const freshRecord = asRecord(freshMedia) || mediaRecord;
    payload.media = freshRecord;
    payload.mediaAsset = freshRecord;
    const kind = String(
      freshRecord.kind ||
        freshRecord.mediaType ||
        freshRecord.media_type ||
        freshRecord.mimeType ||
        freshRecord.type ||
        "",
    )
      .toLowerCase()
      .includes("video")
      ? "video"
      : "image";
    if (kind === "video") {
      payload.video = freshRecord;
      payload.videoAsset = freshRecord;
    } else {
      payload.image = freshRecord;
      payload.imageAsset = freshRecord;
    }
  }
  if (payload.postByChannel) {
    payload.postByChannel = await refreshPostByChannelMediaUrls(
      payload.postByChannel,
    );
  }
  payload = await withFreshReportDocument(payload);
  return { ...action, imageAssets, payload };
}

function cleanEmail(value: unknown) {
  const email = String(value ?? "")
    .trim()
    .toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(email) ? email : "";
}

function isMissingDraftMetadataColumn(
  error:
    | { code?: string; message?: string; details?: string; hint?: string }
    | null
    | undefined,
) {
  const msg = String(
    error?.message || error?.details || error?.hint || "",
  ).toLowerCase();
  return (
    error?.code === "PGRST204" ||
    msg.includes("folder") ||
    msg.includes("track_kind") ||
    msg.includes("track_type") ||
    msg.includes("template_key") ||
    msg.includes("attachments")
  );
}

function cleanDraftAttachment(item: unknown) {
  const record = asRecord(item);
  if (!record) return null;

  const bucket = cleanText(record.bucket, 120);
  const path = cleanText(
    record.path || record.storagePath || record.storage_path,
    500,
  );
  if (!bucket || !path) return null;

  return {
    bucket,
    path,
    name:
      cleanText(record.name || record.filename || record.fileName, 240) ||
      path.split("/").pop() ||
      "piece-jointe",
    type:
      cleanText(record.type || record.mimeType || record.mime_type, 140) ||
      "application/octet-stream",
    size:
      typeof record.size === "number" && Number.isFinite(record.size)
        ? record.size
        : null,
  };
}

function cleanDraftAttachments(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(cleanDraftAttachment).filter(Boolean).slice(0, 10);
}

function recipientsToEmails(value: unknown) {
  const recipients = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const emails: string[] = [];

  for (const item of recipients) {
    const record = asRecord(item);
    const email = cleanEmail(record?.email || item);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }

  return emails;
}

type CampaignRecipientInput = {
  contact_id: string | null;
  display_name: string | null;
  email: string;
  phone?: string | null;
  contact_type?: string | null;
  category?: string | null;
  company_name?: string | null;
  city?: string | null;
  postal_code?: string | null;
};

function normalizeCampaignRecipientInputs(
  value: unknown,
): CampaignRecipientInput[] {
  const recipients = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const out: CampaignRecipientInput[] = [];

  for (const item of recipients) {
    const record = asRecord(item);
    const email = cleanEmail(record?.email || item);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push({
      contact_id:
        cleanText(record?.contact_id || record?.contactId || record?.id, 140) ||
        null,
      display_name:
        cleanText(
          record?.display_name ||
            record?.displayName ||
            record?.name ||
            record?.company_name ||
            record?.companyName,
          220,
        ) || null,
      email,
      phone: cleanText(record?.phone, 80) || null,
      contact_type:
        cleanText(record?.contact_type || record?.contactType, 80) || null,
      category: cleanText(record?.category, 80) || null,
      company_name:
        cleanText(record?.company_name || record?.companyName, 180) || null,
      city: cleanText(record?.city, 120) || null,
      postal_code:
        cleanText(record?.postal_code || record?.postalCode, 20) || null,
    });
  }

  return out.slice(0, 1000);
}

function isCampaignAction(action: ReturnType<typeof rowToInrAgentAction>) {
  return (
    (action.automationKey === "grow" || action.automationKey === "loyalty") &&
    (action.targetTool === "propulser" ||
      action.targetTool === "fideliser" ||
      action.targetTool === "mails")
  );
}

function buildCampaignPreviewText(
  subject: string,
  bodyText: string,
  recipients: CampaignRecipientInput[],
) {
  return [
    `Objet : ${subject}`,
    bodyText,
    `Destinataires proposés : ${recipients.length} contact${recipients.length > 1 ? "s" : ""} CRM`,
  ].join("\n\n");
}

type PublishChannelKey =
  | "inrcy_site"
  | "site_web"
  | "inr_search"
  | "gmb"
  | "facebook"
  | "instagram"
  | "linkedin"
  | "tiktok"
  | "youtube_shorts";

const publishChannelAliases: Record<string, PublishChannelKey> = {
  inrcy_site: "inrcy_site",
  site_inrcy: "inrcy_site",
  siteInrcy: "inrcy_site",
  site_web: "site_web",
  siteWeb: "site_web",
  inr_search: "inr_search",
  inrSearch: "inr_search",
  gmb: "gmb",
  google_business: "gmb",
  facebook: "facebook",
  instagram: "instagram",
  linkedin: "linkedin",
  tiktok: "tiktok",
  youtube: "youtube_shorts",
  youtube_shorts: "youtube_shorts",
};

const publishChannelReadAliases: Record<PublishChannelKey, string[]> = {
  inrcy_site: ["inrcy_site", "site_inrcy", "siteInrcy"],
  site_web: ["site_web", "siteWeb"],
  inr_search: ["inr_search", "inrSearch"],
  gmb: ["gmb", "google_business"],
  facebook: ["facebook"],
  instagram: ["instagram"],
  linkedin: ["linkedin"],
  tiktok: ["tiktok"],
  youtube_shorts: ["youtube_shorts", "youtube"],
};

function cleanPublishChannel(value: unknown): PublishChannelKey | null {
  const key = String(value ?? "").trim();
  return publishChannelAliases[key] || null;
}

function cleanPublishHashtags(value: unknown) {
  const raw = Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(/[\s,;]+/)
        .map((item) => item.trim());

  const seen = new Set<string>();
  const hashtags: string[] = [];
  for (const item of raw) {
    const clean = String(item ?? "")
      .trim()
      .replace(/^#+/, "")
      .replace(/\s+/g, "")
      .slice(0, 40);
    if (!clean || seen.has(clean.toLowerCase())) continue;
    seen.add(clean.toLowerCase());
    hashtags.push(clean);
  }
  return hashtags.slice(0, 8);
}

function isPublishAction(action: ReturnType<typeof rowToInrAgentAction>) {
  return (
    action.automationKey === "publish" &&
    action.targetTool === "booster" &&
    action.actionType === "publication"
  );
}

function readPublishPost(
  postByChannel: Record<string, unknown>,
  channel: PublishChannelKey,
) {
  for (const key of publishChannelReadAliases[channel]) {
    const record = asRecord(postByChannel[key]);
    if (record) return record;
    const text = cleanText(postByChannel[key], 6000);
    if (text) return { content: text };
  }
  return {};
}

function buildPublishPreviewTextFromPosts(
  postByChannel: Record<string, unknown>,
  fallback: string,
) {
  const firstPost = Object.values(postByChannel)
    .map((value) => {
      const record = asRecord(value);
      if (!record) return cleanText(value, 1200);
      return cleanText(
        record.content ||
          record.text ||
          record.caption ||
          record.body ||
          record.message,
        1200,
      );
    })
    .find(Boolean);
  return firstPost || fallback;
}

function publishChannelRequiresMedia(channel: PublishChannelKey) {
  return (
    channel === "instagram" ||
    channel === "tiktok" ||
    channel === "youtube_shorts"
  );
}

function publishChannelRequiresVideo(channel: PublishChannelKey) {
  return channel === "youtube_shorts";
}

function cleanPublishMedia(value: unknown) {
  const record = asRecord(value);
  if (!record) return null;

  const url = cleanText(
    record.url ||
      record.publicUrl ||
      record.src ||
      record.downloadUrl ||
      record.signed_url,
    1200,
  );
  const storagePath = cleanText(
    record.storagePath || record.storage_path || record.path,
    900,
  );
  if (!url && !storagePath) return null;

  const mimeType =
    cleanText(record.mimeType || record.mime_type || record.type, 160) ||
    "application/octet-stream";
  const rawKind = cleanText(
    record.kind || record.mediaKind || record.mediaType || record.media_type,
    24,
  ).toLowerCase();
  const kind =
    rawKind === "video" || mimeType.startsWith("video/")
      ? "video"
      : rawKind === "image" || mimeType.startsWith("image/")
        ? "image"
        : null;
  if (!kind) return null;

  const size = Number(
    record.size ?? record.sizeBytes ?? record.size_bytes ?? 0,
  );

  if (
    kind === "image" &&
    Number.isFinite(size) &&
    size > MAX_AGENT_IMAGE_BYTES
  ) {
    return null;
  }
  if (
    kind === "video" &&
    Number.isFinite(size) &&
    size > MAX_AGENT_VIDEO_BYTES
  ) {
    return null;
  }

  const videoSettings = asRecord(record.videoSettings) || null;
  const videoSettingsByChannel =
    asRecord(record.videoSettingsByChannel) || null;
  const transformedVariants = Array.isArray(record.transformedVariants)
    ? record.transformedVariants.filter(Boolean).slice(0, 12)
    : [];

  return {
    id: cleanText(record.id, 160) || null,
    bucket:
      cleanText(
        record.bucket || record.bucketName || record.bucket_name,
        120,
      ) || "booster",
    path: storagePath,
    storagePath,
    publicUrl: url,
    url,
    name:
      cleanText(
        record.name || record.filename || record.fileName || record.title,
        240,
      ) ||
      storagePath.split("/").pop() ||
      "media",
    title:
      cleanText(record.title || record.name || record.filename, 240) ||
      storagePath.split("/").pop() ||
      "media",
    type: mimeType,
    mimeType,
    size: Number.isFinite(size) && size > 0 ? size : null,
    width: Number(record.width ?? 0) > 0 ? Math.round(Number(record.width)) : null,
    height:
      Number(record.height ?? 0) > 0 ? Math.round(Number(record.height)) : null,
    duration: Number(record.duration ?? record.duration_seconds ?? 0) || null,
    duration_seconds:
      Number(record.duration ?? record.duration_seconds ?? 0) || null,
    kind,
    mediaType: kind,
    source: cleanText(record.source, 120) || null,
    ...(kind === "video" && videoSettings ? { videoSettings } : {}),
    ...(kind === "video" && videoSettingsByChannel
      ? { videoSettingsByChannel }
      : {}),
    ...(kind === "video"
      ? {
          videoFormat: cleanText(record.videoFormat, 40) || null,
          videoAdaptationMode:
            cleanText(record.videoAdaptationMode, 40) || null,
          transformedVariants,
        }
      : {}),
  };
}

function buildPublishMediaReadiness(
  channel: PublishChannelKey,
  media: ReturnType<typeof cleanPublishMedia>,
) {
  if (!media) {
    return publishChannelRequiresMedia(channel)
      ? {
          status: "blocked",
          ready: false,
          blockers: ["Ce canal exige un média."],
        }
      : { status: "ready", ready: true, blockers: [] };
  }

  if (publishChannelRequiresVideo(channel) && media.kind !== "video") {
    return {
      status: "blocked",
      ready: false,
      blockers: ["Ce canal exige une vidéo."],
    };
  }

  return {
    status: media.kind === "video" ? "ready_with_video" : "ready_with_image",
    ready: true,
    publishable: true,
    blockers: [],
    reason:
      media.kind === "video"
        ? "Vidéo prête pour ce canal."
        : "Image prête pour ce canal.",
  };
}

function buildPublishMediaAdaptation(
  channel: PublishChannelKey,
  media: ReturnType<typeof cleanPublishMedia>,
) {
  const channelLabel = channel;
  if (!media) {
    return {
      channel,
      channelLabel,
      mediaType: "none",
      strategy: "text_only",
      userEditable: false,
      note: "Aucun média à adapter pour ce canal.",
    };
  }

  if (media.kind === "video") {
    return {
      channel,
      channelLabel,
      mediaType: "video",
      strategy: "booster_video_format",
      userEditable: true,
      note: "iNrAgent garde la vidéo source et Booster prépare le format compatible au moment de publier.",
    };
  }

  return {
    channel,
    channelLabel,
    mediaType: "image",
    strategy: "booster_image_adapter",
    userEditable: true,
    note: "iNrAgent garde l’image source et Booster génère une version adaptée au canal sans modifier l’original.",
  };
}


type PublishDraftMedia = ReturnType<typeof cleanPublishMedia>;

function publishCanRunWithoutMedia(channel: PublishChannelKey) {
  return ["inrcy_site", "site_web", "inr_search", "gmb", "facebook", "linkedin"].includes(
    channel,
  );
}

function normalizePublishChannels(input: unknown): PublishChannelKey[] {
  const raw = Array.isArray(input) ? input : [];
  return Array.from(
    new Set(
      raw
        .map((item) => cleanPublishChannel(item))
        .filter((item): item is PublishChannelKey => Boolean(item)),
    ),
  );
}

function cleanBoosterPost(value: unknown, fallbackText: string) {
  const record = asRecord(value) || {};
  const content = cleanText(
    record.content || record.text || record.body || record.message,
    6000,
  );
  const title = cleanText(record.title || record.subject, 180);
  const cta = cleanText(record.cta || record.callToAction, 180);
  const ctaModeRaw = cleanText(record.ctaMode, 24);
  const ctaMode = ["none", "website", "call", "message", "custom"].includes(
    ctaModeRaw,
  )
    ? ctaModeRaw
    : "none";
  const hashtags = cleanPublishHashtags(record.hashtags);
  return {
    ...record,
    title,
    subject: title,
    content: content || title || cleanText(fallbackText, 1200),
    text: content || title || cleanText(fallbackText, 1200),
    body: content || title || cleanText(fallbackText, 1200),
    cta,
    callToAction: cta,
    ctaMode,
    ctaUrl: cleanText(record.ctaUrl, 320),
    ctaPhone: cleanText(record.ctaPhone, 60),
    hashtags,
  };
}

function fileExtensionFromMimeOrPath(mimeType: string, storagePath: string) {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("quicktime")) return "mov";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "mp4";
  const fromPath = String(storagePath || "")
    .split(/[?#]/)[0]
    .split(".")
    .pop()
    ?.toLowerCase();
  if (
    fromPath &&
    /^[a-z0-9]{2,5}$/.test(fromPath) &&
    !fromPath.includes("/")
  ) {
    if (fromPath === "jpeg") return "jpg";
    if (fromPath === "m4v") return "mp4";
    return fromPath;
  }
  return mime.startsWith("video/") ? "mp4" : "jpg";
}

async function readAgentMediaBuffer(media: NonNullable<PublishDraftMedia>) {
  const bucket = cleanText(media.bucket || "inrcy-pro-media", 120);
  const storagePath = cleanText(media.storagePath || media.path, 900);
  if (bucket && storagePath) {
    const downloaded = await supabaseAdmin.storage
      .from(bucket)
      .download(storagePath);
    if (downloaded.error || !downloaded.data) {
      throw new Error("Média iNrAgent supprimé ou indisponible dans le stockage.");
    }
    return {
      buffer: Buffer.from(await downloaded.data.arrayBuffer()),
      mimeType:
        downloaded.data.type ||
        cleanText(media.mimeType || media.type, 140) ||
        "application/octet-stream",
      sourceBucket: bucket,
      sourceStoragePath: storagePath,
    };
  }

  const url = cleanText(media.url || media.publicUrl, 2000);
  if (!url) throw new Error("Média iNrAgent indisponible.");
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Média iNrAgent indisponible.");
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType:
      response.headers.get("content-type") ||
      cleanText(media.mimeType || media.type, 140) ||
      "application/octet-stream",
    sourceBucket: bucket || null,
    sourceStoragePath: storagePath || null,
  };
}

function safeDraftFileName(value: string, fallback: string) {
  const raw = String(value || fallback || "media")
    .split(/[\\/]/)
    .pop() || fallback || "media";
  const clean = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/[-_]{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .toLowerCase();
  return clean || fallback || "media";
}

async function copyAgentMediaToBoosterDraft(args: {
  userId: string;
  media: NonNullable<PublishDraftMedia>;
  folder: "booster-drafts";
}) {
  const { media } = args;
  const read = await readAgentMediaBuffer(media);
  const extension = fileExtensionFromMimeOrPath(
    read.mimeType,
    cleanText(media.storagePath || media.path, 900),
  );
  const baseName = safeDraftFileName(
    cleanText(media.name || media.title, 180),
    media.kind === "video" ? "video-inragent" : "image-inragent",
  ).replace(/\.[^.]+$/, "");
  const storagePath = `${args.userId}/${args.folder}/${randomUUID()}-${baseName}.${extension}`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from("booster")
    .upload(storagePath, read.buffer, {
      contentType: read.mimeType,
      upsert: false,
      cacheControl: "3600",
    });
  if (uploadError) {
    throw new Error(
      uploadError.message || "Impossible de créer le brouillon média.",
    );
  }
  const publicUrl = String(
    supabaseAdmin.storage.from("booster").getPublicUrl(storagePath)?.data
      ?.publicUrl || "",
  ).trim();
  if (!publicUrl) throw new Error("URL du brouillon média introuvable.");
  return {
    storagePath,
    publicUrl,
    mimeType: read.mimeType,
    size: read.buffer.byteLength,
    sourceBucket: read.sourceBucket,
    sourceStoragePath: read.sourceStoragePath,
  };
}

async function buildPublishDraftMediaPayload(args: {
  userId: string;
  actionId: string;
  media: PublishDraftMedia;
  videoAiContextRef: VideoAiContextReference | null;
}) {
  const { media } = args;
  if (!media) return { imageDrafts: [] as Record<string, unknown>[], videoDraft: null as Record<string, unknown> | null };

  const copied = await copyAgentMediaToBoosterDraft({
    userId: args.userId,
    media,
    folder: "booster-drafts",
  });

  if (media.kind === "video") {
    const transformedVariants = Array.isArray(media.transformedVariants)
      ? media.transformedVariants.filter(Boolean).slice(0, 12)
      : [];
    const sourceMetadata = {
      width: media.width || null,
      height: media.height || null,
      duration: media.duration_seconds || media.duration || null,
      size: copied.size || media.size || 0,
      type: copied.mimeType || media.mimeType || media.type || "video/mp4",
      ratio:
        media.width && media.height
          ? Number(media.width) / Number(media.height)
          : null,
      ratioLabel: "",
      orientation:
        media.width && media.height
          ? Number(media.width) > Number(media.height)
            ? "horizontal"
            : Number(media.width) < Number(media.height)
              ? "vertical"
              : "square"
          : "unknown",
      orientationLabel: "",
    };
    return {
      imageDrafts: [] as Record<string, unknown>[],
      videoDraft: {
        name: media.name || media.title || `video-iNrAgent-${args.actionId}.mp4`,
        type: copied.mimeType || media.mimeType || media.type || "video/mp4",
        size: copied.size || media.size || 0,
        lastModified: Date.now(),
        duration: media.duration_seconds || media.duration || null,
        sourceMetadata,
        storagePath: copied.storagePath,
        publicUrl: copied.publicUrl,
        url: copied.publicUrl,
        transformedVariants,
        ...videoAiContextReferenceAliases(args.videoAiContextRef),
      },
    };
  }

  return {
    imageDrafts: [
      {
        name: media.name || media.title || `image-iNrAgent-${args.actionId}.jpg`,
        type: copied.mimeType || media.mimeType || media.type || "image/jpeg",
        size: copied.size || media.size || 0,
        lastModified: Date.now(),
        storagePath: copied.storagePath,
        publicUrl: copied.publicUrl,
        url: copied.publicUrl,
        originalPublicUrl: media.publicUrl || media.url || null,
        originalStoragePath: media.storagePath || media.path || null,
        imageKey: media.id || args.actionId,
      },
    ],
    videoDraft: null as Record<string, unknown> | null,
  };
}

async function readCampaignAction(actionId: string, userId: string) {
  const { data: currentRow, error: readError } = await supabaseAdmin
    .from("inr_agent_actions")
    .select(ACTION_SELECT)
    .eq("id", actionId)
    .eq("user_id", userId)
    .single();

  if (readError || !currentRow) {
    return {
      action: null,
      response: isMissingTableError(readError)
        ? NextResponse.json(
            {
              error:
                "La table inr_agent_actions doit être créée dans Supabase.",
              tableMissing: true,
            },
            { status: 500 },
          )
        : NextResponse.json(
            { error: "Action iNr’Agent introuvable." },
            { status: 404 },
          ),
    };
  }

  const action = rowToInrAgentAction(currentRow as any);
  if (!isCampaignAction(action)) {
    return {
      action: null,
      response: NextResponse.json(
        {
          error:
            "Cette modification est réservée aux campagnes Propulser/Fidéliser préparées par iNr’Agent.",
        },
        { status: 400 },
      ),
    };
  }

  return { action, response: null };
}

async function updateCampaignAction(args: {
  actionId: string;
  userId: string;
  patch: Record<string, unknown>;
}) {
  const { data, error } = await supabaseAdmin
    .from("inr_agent_actions")
    .update({
      ...args.patch,
      updated_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", args.actionId)
    .eq("user_id", args.userId)
    .select(ACTION_SELECT)
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      return {
        response: NextResponse.json(
          {
            error: "La table inr_agent_actions doit être créée dans Supabase.",
            tableMissing: true,
          },
          { status: 500 },
        ),
      };
    }
    return {
      response: NextResponse.json(
        {
          error:
            error.message || "Modification de l’action iNr’Agent impossible.",
        },
        { status: 500 },
      ),
    };
  }

  const action = await refreshActionImageUrls(rowToInrAgentAction(data));
  return { action };
}

async function fetchConnectedMailAccount(userId: string, accountId: string) {
  const { data, error } = await supabaseAdmin
    .from("integrations")
    .select(
      "id,provider,account_email,email_address,display_name,resource_label,status,settings",
    )
    .eq("id", accountId)
    .eq("user_id", userId)
    .eq("category", "mail")
    .eq("status", "connected")
    .maybeSingle();

  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const settings = asRecord(row.settings) || {};
  const accountEmail = cleanText(
    row.account_email ||
      row.email_address ||
      settings.email ||
      settings.account_email,
    180,
  );
  const displayName = cleanText(row.display_name || settings.display_name, 180);
  return {
    id: cleanText(row.id, 140),
    provider: cleanText(row.provider, 80),
    email_address: accountEmail || null,
    account_email: accountEmail || null,
    email: accountEmail || null,
    display_name: displayName || null,
    label:
      accountEmail ||
      cleanText(row.resource_label || row.provider || "Boîte mail", 180),
  };
}

function buildDraftPayloadFromAgentAction(args: {
  action: ReturnType<typeof rowToInrAgentAction>;
  userId: string;
}) {
  const { action } = args;
  const payload = action.payload || {};
  const mailAccount = asRecord(payload.mailAccount) || {};
  const automationKey = action.automationKey === "loyalty" ? "loyalty" : "grow";
  const recipients = recipientsToEmails(
    payload.recipients || action.recipients,
  );
  const subject = normalizeMailSubject(
    cleanText(
      payload.campaignSubject || payload.subject || action.title,
      220,
    ) || "(sans objet)",
  );
  const bodyText = cleanText(
    payload.campaignBody ||
      payload.bodyText ||
      payload.text ||
      action.previewText,
    6000,
  );
  const bodyHtml =
    cleanText(payload.bodyHtml || payload.html, 10000) ||
    textToRichMailHtml(bodyText);
  const folder =
    cleanText(payload.folder, 80) ||
    (automationKey === "loyalty" ? "fidelisations" : "propulsions");
  const trackKind =
    cleanText(payload.trackKind, 80) ||
    (automationKey === "loyalty" ? "fideliser" : "propulser");
  const trackType = cleanText(
    payload.trackType || payload.theme || action.targetThemes[0],
    80,
  );
  const templateKey = cleanText(payload.templateKey, 160);
  const accountId = cleanText(
    payload.accountId || payload.mailAccountId || mailAccount.id,
    120,
  );
  const provider = cleanText(
    mailAccount.provider || payload.provider || payload.mailProvider,
    80,
  );

  const draftPayload = {
    user_id: args.userId,
    integration_id: accountId || null,
    type: "mail",
    status: "draft",
    to_emails: recipients.join("; "),
    subject,
    body_text: bodyText || null,
    body_html: bodyHtml || null,
    provider: provider || null,
    source_doc_save_id: null,
    source_doc_type: null,
    source_doc_number: null,
    folder,
    track_kind: trackKind,
    track_type: trackType || null,
    template_key: templateKey || null,
    attachments: cleanDraftAttachments(payload.attachments),
  };

  const legacyPayload = {
    user_id: draftPayload.user_id,
    integration_id: draftPayload.integration_id,
    type: draftPayload.type,
    status: draftPayload.status,
    to_emails: draftPayload.to_emails,
    subject: draftPayload.subject,
    body_text: draftPayload.body_text,
    body_html: draftPayload.body_html,
    provider: draftPayload.provider,
    source_doc_save_id: draftPayload.source_doc_save_id,
    source_doc_type: draftPayload.source_doc_type,
    source_doc_number: draftPayload.source_doc_number,
  };

  return { payload, draftPayload, legacyPayload };
}


async function savePublishActionAsBoosterDraft(args: {
  actionId: string;
  userId: string;
}) {
  const { data: currentRow, error: readError } = await supabaseAdmin
    .from("inr_agent_actions")
    .select(ACTION_SELECT)
    .eq("id", args.actionId)
    .eq("user_id", args.userId)
    .single();

  if (readError || !currentRow) {
    if (isMissingTableError(readError)) {
      return {
        response: NextResponse.json(
          {
            error: "La table inr_agent_actions doit être créée dans Supabase.",
            tableMissing: true,
          },
          { status: 500 },
        ),
      };
    }
    return {
      response: NextResponse.json(
        { error: "Action iNr’Agent introuvable." },
        { status: 404 },
      ),
    };
  }

  const action = rowToInrAgentAction(currentRow as any);
  if (!isPublishAction(action)) {
    return {
      response: NextResponse.json(
        {
          error:
            "Seules les publications Booster peuvent être enregistrées en brouillon iNrSend.",
        },
        { status: 400 },
      ),
    };
  }

  const payload = action.payload || {};
  const rawChannels = normalizePublishChannels(
    payload.selectedChannels || payload.channels || action.targetChannels,
  );
  const media = cleanPublishMedia(
    payload.media ||
      payload.mediaAsset ||
      payload.video ||
      payload.videoAsset ||
      payload.image ||
      payload.imageAsset,
  );
  const activeMediaMode = media?.kind === "video" ? "video" : media?.kind === "image" ? "images" : "none";
  const channels = rawChannels.filter((channel) => {
    if (activeMediaMode === "video") return true;
    if (publishChannelRequiresVideo(channel)) return false;
    if (publishChannelRequiresMedia(channel)) return Boolean(media);
    return publishCanRunWithoutMedia(channel) || Boolean(media);
  });

  if (!channels.length) {
    return {
      response: NextResponse.json(
        {
          error:
            "Aucun canal prêt à enregistrer en brouillon. Les canaux sélectionnés nécessitent un média ou une vidéo.",
        },
        { status: 400 },
      ),
    };
  }

  const rawPostByChannel = asRecord(payload.postByChannel) || {};
  const fallbackText = cleanText(
    action.summary || payload.idea || action.title || "Publication préparée par iNr’Agent.",
    1200,
  );
  const postByChannel = Object.fromEntries(
    channels.map((channel) => [
      channel,
      cleanBoosterPost(readPublishPost(rawPostByChannel, channel), fallbackText),
    ]),
  );
  const firstPost =
    channels.map((channel) => asRecord(postByChannel[channel])).find((post) => cleanText(post?.content || post?.title, 1200)) ||
    asRecord(Object.values(postByChannel)[0]) ||
    {};
  const firstTitle = cleanText(firstPost.title || firstPost.subject, 180);
  const firstContent = cleanText(firstPost.content || firstPost.text || firstPost.body, 1200);
  const channelMediaModes = Object.fromEntries(
    channels.map((channel) => [channel, activeMediaMode]),
  );

  const videoPreparation = asRecord(payload.videoAiPreparation) || {};
  const videoAiContextRef =
    normalizeVideoAiContextReference(payload.videoAiContextRef) ||
    buildVideoAiContextReference({
      mediaAssetId: payload.mediaAssetId || media?.id,
      mediaSource: media?.source,
      preparationVersion:
        payload.videoAiContextVersion || videoPreparation.version,
      sourceFingerprint:
        payload.videoFingerprint || videoPreparation.sourceFingerprint,
      persisted: videoPreparation.persisted,
    });

  const { imageDrafts, videoDraft } = await buildPublishDraftMediaPayload({
    userId: args.userId,
    actionId: action.id,
    media,
    videoAiContextRef,
  });

  const videoSettingsSource =
    media?.kind === "video"
      ? asRecord(media.videoSettingsByChannel) ||
        asRecord(payload.videoSettingsByChannel) ||
        (asRecord(media.videoSettings)
          ? Object.fromEntries(channels.map((channel) => [channel, media.videoSettings]))
          : null)
      : null;
  const videoSettingsByChannel =
    media?.kind === "video"
      ? buildVideoSettingsByChannel({
          channels: channels as any,
          videoSettingsByChannel: videoSettingsSource,
          sourceMetadata: asRecord(videoDraft?.sourceMetadata) || null,
        })
      : {};
  const videoFormatByChannel = Object.fromEntries(
    Object.entries(videoSettingsByChannel).map(([channel, settings]) => [
      channel,
      settings?.format || null,
    ]),
  );
  const videoAdaptationModeByChannel = Object.fromEntries(
    Object.entries(videoSettingsByChannel).map(([channel, settings]) => [
      channel,
      settings?.adaptationMode || null,
    ]),
  );
  const channelLabels = channels
    .map((channel) => channel)
    .join(" / ");
  const instagramPost = asRecord(postByChannel.instagram);
  const instagramHashtagsInput = Array.isArray(instagramPost?.hashtags)
    ? instagramPost.hashtags.map((tag) => `#${String(tag).replace(/^#+/, "")}`).join(" ")
    : "";
  const now = new Date().toISOString();
  const draftPayload = {
    status: "draft",
    title: firstTitle || action.title || "Brouillon publication",
    preview: firstContent || fallbackText || channelLabels,
    content: firstContent || "",
    idea: cleanText(payload.idea || action.summary, 1000),
    theme: cleanText(payload.boosterTheme || payload.theme, 80) || "",
    contentStyle: cleanText(payload.contentStyle, 40) || "equilibre",
    channel: channelLabels,
    channels,
    postByChannel,
    mediaType: media?.kind === "video" ? "video" : "images",
    channelMediaModes,
    mediaModeByChannel: channelMediaModes,
    videoFormatByChannel,
    videoAdaptationModeByChannel,
    videoSettingsByChannel,
    imageNames: imageDrafts.map((image) => ({
      name: image.name,
      type: image.type,
      size: image.size,
    })),
    videoName: videoDraft
      ? {
          name: videoDraft.name,
          type: videoDraft.type,
          size: videoDraft.size,
          duration: videoDraft.duration,
        }
      : null,
    videoSourceMetadata: videoDraft?.sourceMetadata || null,
    imageDrafts,
    videoDraft,
    ...videoAiContextReferenceAliases(videoAiContextRef),
    useImagesForAI: true,
    imageSettingsByChannel: asRecord(payload.imageSettingsByChannel) || {},
    instagramHashtagsInput,
    saved_at: now,
    origin: {
      source: "inr_agent",
      label: "iNr’Agent",
      icon: "🤖",
      actionId: action.id,
      automationKey: action.automationKey,
    },
    source: "inr_agent",
    workflowTool: "booster",
    workflowAction: "publier",
    inrAgentActionId: action.id,
  };

  const { data: draft, error: draftError } = await supabaseAdmin
    .from("app_events")
    .insert({
      user_id: args.userId,
      module: "booster",
      type: "publish_draft",
      payload: draftPayload,
    })
    .select("id")
    .single();

  if (draftError) {
    return {
      response: NextResponse.json(
        {
          error:
            draftError.message ||
            "Impossible d’enregistrer la publication en brouillon iNrSend.",
        },
        { status: 500 },
      ),
    };
  }

  const draftId = cleanText((draft as Record<string, unknown> | null)?.id, 120) || null;
  const { data, error } = await supabaseAdmin
    .from("inr_agent_actions")
    .update({
      status: "cancelled",
      completed_at: now,
      last_error: null,
      summary: `${action.summary} Publication conservée en brouillon dans iNrSend.`,
      payload: {
        ...payload,
        movedToInrSendDraft: {
          ok: true,
          draftId,
          movedAt: now,
          reason: "user_saved_publish_from_inr_agent",
          type: "publish_draft",
        },
      },
      updated_at: now,
    })
    .eq("id", args.actionId)
    .eq("user_id", args.userId)
    .select(ACTION_SELECT)
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      return {
        response: NextResponse.json(
          {
            error: "La table inr_agent_actions doit être créée dans Supabase.",
            tableMissing: true,
          },
          { status: 500 },
        ),
      };
    }
    return {
      response: NextResponse.json(
        {
          error:
            error.message ||
            "Impossible de fermer l’action iNr’Agent après enregistrement du brouillon.",
        },
        { status: 500 },
      ),
    };
  }

  const updatedAction = await refreshActionImageUrls(rowToInrAgentAction(data));
  return { action: updatedAction, draftId };
}

async function saveCampaignActionAsInrSendDraft(args: {
  actionId: string;
  userId: string;
}) {
  const { data: currentRow, error: readError } = await supabaseAdmin
    .from("inr_agent_actions")
    .select(ACTION_SELECT)
    .eq("id", args.actionId)
    .eq("user_id", args.userId)
    .single();

  if (readError || !currentRow) {
    if (isMissingTableError(readError)) {
      return {
        response: NextResponse.json(
          {
            error: "La table inr_agent_actions doit être créée dans Supabase.",
            tableMissing: true,
          },
          { status: 500 },
        ),
      };
    }
    return {
      response: NextResponse.json(
        { error: "Action iNr’Agent introuvable." },
        { status: 404 },
      ),
    };
  }

  const action = rowToInrAgentAction(currentRow as any);
  const isCampaignAction =
    (action.automationKey === "grow" || action.automationKey === "loyalty") &&
    (action.targetTool === "propulser" ||
      action.targetTool === "fideliser" ||
      action.targetTool === "mails");

  if (!isCampaignAction) {
    return {
      response: NextResponse.json(
        {
          error:
            "Seules les campagnes Propulser/Fidéliser peuvent être enregistrées en brouillon iNrSend.",
        },
        { status: 400 },
      ),
    };
  }

  const { payload, draftPayload, legacyPayload } =
    buildDraftPayloadFromAgentAction({
      action,
      userId: args.userId,
    });

  let { data: draft, error: draftError } = await supabaseAdmin
    .from("send_items")
    .insert(draftPayload as any)
    .select("id")
    .single();

  if (draftError && isMissingDraftMetadataColumn(draftError)) {
    const legacyInsert = await supabaseAdmin
      .from("send_items")
      .insert(legacyPayload)
      .select("id")
      .single();
    draft = legacyInsert.data;
    draftError = legacyInsert.error;
  }

  if (draftError) {
    return {
      response: NextResponse.json(
        {
          error:
            draftError.message ||
            "Impossible d’enregistrer la campagne en brouillon iNrSend.",
        },
        { status: 500 },
      ),
    };
  }

  const now = new Date().toISOString();
  const draftId =
    cleanText((draft as Record<string, unknown> | null)?.id, 120) || null;
  const { data, error } = await supabaseAdmin
    .from("inr_agent_actions")
    .update({
      status: "cancelled",
      completed_at: now,
      last_error: null,
      summary: `${action.summary} Campagne conservée en brouillon dans iNrSend.`,
      payload: {
        ...payload,
        movedToInrSendDraft: {
          ok: true,
          draftId,
          movedAt: now,
          reason: "user_saved_from_inr_agent",
        },
      },
      updated_at: now,
    })
    .eq("id", args.actionId)
    .eq("user_id", args.userId)
    .select(ACTION_SELECT)
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      return {
        response: NextResponse.json(
          {
            error: "La table inr_agent_actions doit être créée dans Supabase.",
            tableMissing: true,
          },
          { status: 500 },
        ),
      };
    }
    return {
      response: NextResponse.json(
        {
          error:
            error.message ||
            "Impossible de fermer l’action iNr’Agent après enregistrement du brouillon.",
        },
        { status: 500 },
      ),
    };
  }

  const updatedAction = await refreshActionImageUrls(rowToInrAgentAction(data));
  return { action: updatedAction, draftId };
}

export async function GET() {
  const { user, errorResponse, activeUserId } = await requireUser();
  if (errorResponse) return errorResponse;

  const { data, error } = await supabaseAdmin
    .from("inr_agent_actions")
    .select(ACTION_SELECT)
    .eq("user_id", activeUserId)
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({
        actions: [],
        stats: summarizeInrAgentActions([]),
        tableMissing: true,
      });
    }
    console.warn("[inr-agent-actions] read failed", error);
    return NextResponse.json(
      { error: "Lecture des actions iNr'Agent impossible" },
      { status: 500 },
    );
  }

  const rawActions = Array.isArray(data)
    ? data.map((row) => rowToInrAgentAction(row))
    : [];
  const actions = await Promise.all(rawActions.map(refreshActionImageUrls));
  return NextResponse.json({
    actions,
    stats: summarizeInrAgentActions(actions),
    tableMissing: false,
  });
}

export async function PATCH(request: Request) {
  const { user, errorResponse, activeUserId } = await requireUser();
  if (errorResponse) return errorResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const requestBody = body as {
    actionId?: unknown;
    status?: unknown;
    editType?: unknown;
    subject?: unknown;
    bodyText?: unknown;
    recipients?: unknown;
    accountId?: unknown;
    attachments?: unknown;
    channel?: unknown;
    title?: unknown;
    content?: unknown;
    cta?: unknown;
    ctaMode?: unknown;
    ctaUrl?: unknown;
    ctaPhone?: unknown;
    hashtags?: unknown;
    media?: unknown;
    removeMedia?: unknown;
  } | null;
  const actionId =
    typeof requestBody?.actionId === "string" ? requestBody.actionId : "";
  const status = sanitizeInrAgentActionStatus(requestBody?.status);
  const editType = cleanText(requestBody?.editType, 80);

  if (editType === "save_campaign_draft" || editType === "save_publish_draft") {
    if (!actionId) {
      return NextResponse.json({ error: "Action invalide" }, { status: 400 });
    }

    const result =
      editType === "save_publish_draft"
        ? await savePublishActionAsBoosterDraft({
            actionId,
            userId: activeUserId,
          })
        : await saveCampaignActionAsInrSendDraft({
            actionId,
            userId: activeUserId,
          });

    if ("response" in result) return result.response;
    return NextResponse.json({
      action: result.action,
      draftId: result.draftId,
      savedAsDraft: true,
    });
  }

  if (editType === "publish_channel_text") {
    if (!actionId) {
      return NextResponse.json({ error: "Action invalide" }, { status: 400 });
    }

    const channel = cleanPublishChannel(requestBody?.channel);
    if (!channel) {
      return NextResponse.json(
        { error: "Canal de publication invalide." },
        { status: 400 },
      );
    }

    const title = cleanText(requestBody?.title, 180);
    const content = cleanText(requestBody?.content, 6000);
    const cta = cleanText(requestBody?.cta, 180);
    const rawCtaMode = cleanText(requestBody?.ctaMode, 24);
    const ctaMode = ["none", "website", "call", "message", "custom"].includes(
      rawCtaMode,
    )
      ? rawCtaMode
      : "none";
    const ctaUrl = cleanText(requestBody?.ctaUrl, 320);
    const ctaPhone = cleanText(requestBody?.ctaPhone, 60);
    const hashtags = cleanPublishHashtags(requestBody?.hashtags);

    if (!content) {
      return NextResponse.json(
        { error: "Le contenu de la publication est obligatoire." },
        { status: 400 },
      );
    }

    const { data: currentRow, error: readError } = await supabaseAdmin
      .from("inr_agent_actions")
      .select(ACTION_SELECT)
      .eq("id", actionId)
      .eq("user_id", activeUserId)
      .single();

    if (readError || !currentRow) {
      if (isMissingTableError(readError)) {
        return NextResponse.json(
          {
            error: "La table inr_agent_actions doit être créée dans Supabase.",
            tableMissing: true,
          },
          { status: 500 },
        );
      }
      return NextResponse.json(
        { error: "Action iNr’Agent introuvable." },
        { status: 404 },
      );
    }

    const currentAction = rowToInrAgentAction(currentRow as any);
    if (!isPublishAction(currentAction)) {
      return NextResponse.json(
        {
          error:
            "Cette modification est réservée aux publications Booster préparées par iNr’Agent.",
        },
        { status: 400 },
      );
    }

    const currentPayload = currentAction.payload || {};
    const currentPostByChannel = asRecord(currentPayload.postByChannel) || {};
    const currentPost = readPublishPost(currentPostByChannel, channel);
    const nextPost = {
      ...currentPost,
      title,
      subject: title,
      content,
      text: content,
      body: content,
      cta,
      callToAction: cta,
      ctaMode,
      ctaUrl,
      ctaPhone,
      hashtags,
      editedByUser: true,
      editedAt: new Date().toISOString(),
    };
    const nextPostByChannel = {
      ...currentPostByChannel,
      [channel]: nextPost,
    };
    const nextPayload = {
      ...currentPayload,
      postByChannel: nextPostByChannel,
      lastManualEdit: {
        channel,
        editedAt: nextPost.editedAt,
        editType: "publish_channel_text",
      },
    };
    const nextPreviewText = buildPublishPreviewTextFromPosts(
      nextPostByChannel,
      cleanText(
        currentAction.previewText ||
          currentAction.summary ||
          currentAction.title,
        1200,
      ),
    );

    const { data, error } = await supabaseAdmin
      .from("inr_agent_actions")
      .update({
        payload: nextPayload,
        preview_text: nextPreviewText,
        updated_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", actionId)
      .eq("user_id", activeUserId)
      .select(ACTION_SELECT)
      .single();

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json(
          {
            error: "La table inr_agent_actions doit être créée dans Supabase.",
            tableMissing: true,
          },
          { status: 500 },
        );
      }
      console.warn("[inr-agent-actions] publish text update failed", error);
      return NextResponse.json(
        { error: "Modification de la publication impossible." },
        { status: 500 },
      );
    }

    const action = await refreshActionImageUrls(rowToInrAgentAction(data));
    return NextResponse.json({ action, saved: true });
  }

  if (editType === "publish_channel_media") {
    if (!actionId) {
      return NextResponse.json({ error: "Action invalide" }, { status: 400 });
    }

    const channel = cleanPublishChannel(requestBody?.channel);
    if (!channel) {
      return NextResponse.json(
        { error: "Canal de publication invalide." },
        { status: 400 },
      );
    }

    const removeMedia = requestBody?.removeMedia === true;
    const media = removeMedia ? null : cleanPublishMedia(requestBody?.media);
    if (!removeMedia && !media) {
      return NextResponse.json({ error: "Média invalide." }, { status: 400 });
    }

    const { data: currentRow, error: readError } = await supabaseAdmin
      .from("inr_agent_actions")
      .select(ACTION_SELECT)
      .eq("id", actionId)
      .eq("user_id", activeUserId)
      .single();

    if (readError || !currentRow) {
      if (isMissingTableError(readError)) {
        return NextResponse.json(
          {
            error: "La table inr_agent_actions doit être créée dans Supabase.",
            tableMissing: true,
          },
          { status: 500 },
        );
      }
      return NextResponse.json(
        { error: "Action iNr’Agent introuvable." },
        { status: 404 },
      );
    }

    const currentAction = rowToInrAgentAction(currentRow as any);
    if (!isPublishAction(currentAction)) {
      return NextResponse.json(
        {
          error:
            "Cette modification est réservée aux publications Booster préparées par iNr’Agent.",
        },
        { status: 400 },
      );
    }

    const currentPayload = currentAction.payload || {};
    const currentPostByChannel = asRecord(currentPayload.postByChannel) || {};
    const editedAt = new Date().toISOString();
    const selectedChannels = Array.isArray(currentPayload.selectedChannels)
      ? currentPayload.selectedChannels
          .map((item) => cleanPublishChannel(item))
          .filter((item): item is PublishChannelKey => Boolean(item))
      : [];
    const targetChannels = selectedChannels.length
      ? selectedChannels
      : [channel];

    const buildNextPost = (rawPost: unknown) => {
      const currentPostRecord = asRecord(rawPost) || {};
      return media
        ? {
            ...currentPostRecord,
            media,
            mediaAsset: media,
            image: media.kind === "image" ? media : null,
            imageAsset: media.kind === "image" ? media : null,
            imageUrl: media.kind === "image" ? media.url : "",
            video: media.kind === "video" ? media : null,
            videoAsset: media.kind === "video" ? media : null,
            mediaMode:
              media.kind === "video"
                ? "video"
                : media.kind === "image"
                  ? "images"
                  : "file",
            editedByUser: true,
            editedAt,
          }
        : {
            ...currentPostRecord,
            media: null,
            mediaAsset: null,
            image: null,
            imageAsset: null,
            imageUrl: "",
            visual: null,
            cover: null,
            video: null,
            videoAsset: null,
            file: null,
            attachment: null,
            attachments: [],
            mediaMode: "none",
            editedByUser: true,
            editedAt,
          };
    };

    const nextPostByChannel = { ...currentPostByChannel };
    for (const targetChannel of targetChannels) {
      const currentPost = readPublishPost(currentPostByChannel, targetChannel);
      nextPostByChannel[targetChannel] = buildNextPost(currentPost);
    }

    const currentReadiness =
      asRecord(currentPayload.mediaReadinessByChannel) || {};
    const nextReadiness = { ...currentReadiness };
    const currentAdaptation =
      asRecord(currentPayload.mediaAdaptationByChannel) || {};
    const nextAdaptation = { ...currentAdaptation };
    for (const targetChannel of targetChannels) {
      nextReadiness[targetChannel] = buildPublishMediaReadiness(
        targetChannel,
        media,
      );
      nextAdaptation[targetChannel] = buildPublishMediaAdaptation(
        targetChannel,
        media,
      );
    }

    const nextPayload = {
      ...currentPayload,
      media,
      mediaAsset: media,
      mediaType: media ? media.kind : "none",
      image: media?.kind === "image" ? media : null,
      imageAsset: media?.kind === "image" ? media : null,
      video: media?.kind === "video" ? media : null,
      videoAsset: media?.kind === "video" ? media : null,
      postByChannel: nextPostByChannel,
      image_assets: media ? [media] : [],
      mediaReadinessByChannel: nextReadiness,
      mediaAdaptationByChannel: nextAdaptation,
      lastManualEdit: {
        channel,
        appliedToChannels: targetChannels,
        editedAt,
        editType: "publish_channel_media",
      },
    };

    const { data, error } = await supabaseAdmin
      .from("inr_agent_actions")
      .update({
        payload: nextPayload,
        image_assets: media ? [media] : [],
        updated_at: editedAt,
        last_error: null,
      })
      .eq("id", actionId)
      .eq("user_id", activeUserId)
      .select(ACTION_SELECT)
      .single();

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json(
          {
            error: "La table inr_agent_actions doit être créée dans Supabase.",
            tableMissing: true,
          },
          { status: 500 },
        );
      }
      console.warn("[inr-agent-actions] publish media update failed", error);
      return NextResponse.json(
        { error: "Modification du média impossible." },
        { status: 500 },
      );
    }

    const action = await refreshActionImageUrls(rowToInrAgentAction(data));
    return NextResponse.json({ action, saved: true });
  }

  if (editType === "campaign_recipients") {
    if (!actionId) {
      return NextResponse.json({ error: "Action invalide" }, { status: 400 });
    }

    const recipients = normalizeCampaignRecipientInputs(
      requestBody?.recipients,
    );
    if (!recipients.length) {
      return NextResponse.json(
        { error: "Sélectionne au moins un destinataire valide." },
        { status: 400 },
      );
    }

    const { action, response } = await readCampaignAction(actionId, activeUserId);
    if (response) return response;
    if (!action)
      return NextResponse.json(
        { error: "Action iNr’Agent introuvable." },
        { status: 404 },
      );

    const payload = action.payload || {};
    const subject =
      cleanText(
        payload.campaignSubject || payload.subject || action.title,
        220,
      ) || "(sans objet)";
    const bodyText = cleanText(
      payload.campaignBody ||
        payload.bodyText ||
        payload.text ||
        action.previewText,
      6000,
    );
    const result = await updateCampaignAction({
      actionId,
      userId: activeUserId,
      patch: {
        recipients,
        payload: {
          ...payload,
          recipients,
          recipientCount: recipients.length,
          recipientScope: "manual_selection",
        },
        preview_text: buildCampaignPreviewText(subject, bodyText, recipients),
      },
    });
    if ("response" in result) return result.response;
    return NextResponse.json({ action: result.action, saved: true });
  }

  if (editType === "campaign_mail_account") {
    if (!actionId) {
      return NextResponse.json({ error: "Action invalide" }, { status: 400 });
    }

    const accountId = cleanText(requestBody?.accountId, 140);
    if (!accountId) {
      return NextResponse.json(
        { error: "Boîte d’envoi invalide." },
        { status: 400 },
      );
    }

    const { action, response } = await readCampaignAction(actionId, activeUserId);
    if (response) return response;
    if (!action)
      return NextResponse.json(
        { error: "Action iNr’Agent introuvable." },
        { status: 404 },
      );

    const mailAccount = await fetchConnectedMailAccount(activeUserId, accountId);
    if (!mailAccount?.id) {
      return NextResponse.json(
        {
          error:
            "La boîte d’envoi sélectionnée est introuvable ou non connectée.",
        },
        { status: 404 },
      );
    }

    const payload = action.payload || {};
    const result = await updateCampaignAction({
      actionId,
      userId: activeUserId,
      patch: {
        payload: {
          ...payload,
          accountId: mailAccount.id,
          mailAccountId: mailAccount.id,
          mailProvider: mailAccount.provider,
          mailAccount,
        },
      },
    });
    if ("response" in result) return result.response;
    return NextResponse.json({ action: result.action, saved: true });
  }

  if (editType === "campaign_attachments") {
    if (!actionId) {
      return NextResponse.json({ error: "Action invalide" }, { status: 400 });
    }

    const attachments = cleanDraftAttachments(requestBody?.attachments);
    const { action, response } = await readCampaignAction(actionId, activeUserId);
    if (response) return response;
    if (!action)
      return NextResponse.json(
        { error: "Action iNr’Agent introuvable." },
        { status: 404 },
      );

    const payload = action.payload || {};
    const result = await updateCampaignAction({
      actionId,
      userId: activeUserId,
      patch: {
        payload: {
          ...payload,
          attachments,
        },
      },
    });
    if ("response" in result) return result.response;
    return NextResponse.json({ action: result.action, saved: true });
  }

  if (editType === "campaign_text") {
    if (!actionId) {
      return NextResponse.json({ error: "Action invalide" }, { status: 400 });
    }

    const subject = normalizeMailSubject(cleanText(requestBody?.subject, 220));
    const bodyText = cleanText(requestBody?.bodyText, 6000);

    if (!subject || !bodyText) {
      return NextResponse.json(
        { error: "L’objet et le corps du mail sont obligatoires." },
        { status: 400 },
      );
    }

    const { data: currentRow, error: readError } = await supabaseAdmin
      .from("inr_agent_actions")
      .select(ACTION_SELECT)
      .eq("id", actionId)
      .eq("user_id", activeUserId)
      .single();

    if (readError || !currentRow) {
      if (isMissingTableError(readError)) {
        return NextResponse.json(
          {
            error: "La table inr_agent_actions doit être créée dans Supabase.",
            tableMissing: true,
          },
          { status: 500 },
        );
      }
      return NextResponse.json(
        { error: "Action iNr’Agent introuvable." },
        { status: 404 },
      );
    }

    const currentAction = rowToInrAgentAction(currentRow as any);
    const currentPayload = currentAction.payload || {};
    const bodyHtml = textToRichMailHtml(bodyText);
    const nextPayload = {
      ...currentPayload,
      subject,
      campaignSubject: subject,
      bodyText,
      campaignBody: bodyText,
      bodyHtml,
    };
    const nextPreviewText = [
      `Objet : ${subject}`,
      bodyText,
      `Destinataires proposés : ${Array.isArray(currentAction.recipients) ? currentAction.recipients.length : 0} contact${Array.isArray(currentAction.recipients) && currentAction.recipients.length > 1 ? "s" : ""} CRM`,
    ].join("\n\n");

    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("inr_agent_actions")
      .update({
        payload: nextPayload,
        preview_text: nextPreviewText,
        updated_at: now,
      })
      .eq("id", actionId)
      .eq("user_id", activeUserId)
      .select(ACTION_SELECT)
      .single();

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json(
          {
            error: "La table inr_agent_actions doit être créée dans Supabase.",
            tableMissing: true,
          },
          { status: 500 },
        );
      }
      console.warn("[inr-agent-actions] campaign text update failed", error);
      return NextResponse.json(
        { error: "Modification du mail impossible." },
        { status: 500 },
      );
    }

    const action = await refreshActionImageUrls(rowToInrAgentAction(data));
    return NextResponse.json({ action, saved: true });
  }

  if (
    !actionId ||
    !status ||
    ![
      "validated",
      "refused",
      "scheduled",
      "pending",
      "pending_validation",
      "cancelled",
    ].includes(status)
  ) {
    return NextResponse.json(
      { error: "Action ou statut invalide" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    status,
    updated_at: now,
  };

  if (status === "validated") {
    updatePayload.validated_at = now;
    updatePayload.refused_at = null;
  }

  if (status === "refused") {
    updatePayload.refused_at = now;
  }

  if (status === "completed") {
    updatePayload.completed_at = now;
  }

  const { data, error } = await supabaseAdmin
    .from("inr_agent_actions")
    .update(updatePayload)
    .eq("id", actionId)
    .eq("user_id", activeUserId)
    .select(ACTION_SELECT)
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json(
        {
          error: "La table inr_agent_actions doit être créée dans Supabase.",
          tableMissing: true,
        },
        { status: 500 },
      );
    }
    console.warn("[inr-agent-actions] update failed", error);
    return NextResponse.json(
      { error: "Mise à jour de l'action iNr'Agent impossible" },
      { status: 500 },
    );
  }

  const action = await refreshActionImageUrls(rowToInrAgentAction(data));
  return NextResponse.json({ action, saved: true });
}
