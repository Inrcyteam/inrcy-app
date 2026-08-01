import { createHash } from "node:crypto";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { toExactStorageArrayBuffer } from "@/lib/supabaseStorageBinary";
import {
  canUseAutomaticCover,
  getBoosterImageDecision,
  getBoosterImageDisplayPlan,
  getBoosterImageRenderDimensions,
  getBoosterImageSequenceTargetRatio,
  type BoosterImageChannel,
  type BoosterImageMetaLike,
  type ComparableImageTransform,
} from "@/lib/boosterImageDecision";

type JsonRecord = Record<string, unknown>;

type ServerImageTransform = {
  fit: "contain" | "cover";
  zoom: number;
  offsetX: number;
  offsetY: number;
  blurBackground: boolean;
  backgroundMode?: string;
  backgroundColor?: string;
};

type ChannelSettings = {
  imageKeys: string[];
  transforms: Record<string, ServerImageTransform>;
  customizedImageKeys: string[];
};

export type BoosterServerImagePayload = {
  mediaId?: string;
  name: string;
  type: string;
  dataUrl?: string;
  bucket?: string;
  storagePath?: string;
  publicUrl?: string;
  renderedUrl?: string;
  originalUrl?: string | null;
  originalPublicUrl?: string | null;
  originalStoragePath?: string | null;
  originalName?: string | null;
  originalType?: string | null;
  imageKey?: string | null;
  transform?: unknown;
  imageMeta?: unknown;
  imageDecisionMode?: "original" | "adapted" | "customized" | "unsupported";
  imageDecisionLabel?: "Originale" | "Adaptée" | "Personnalisée" | "Indisponible";
  isCustomized?: boolean;
  publicationReady?: boolean;
};

export type BoosterServerImagePreparationResult = {
  imagesByChannel: Partial<Record<BoosterImageChannel, BoosterServerImagePayload[]>>;
  imageSettingsByChannel: Partial<Record<BoosterImageChannel, JsonRecord>>;
  warnings: Array<{ channel: BoosterImageChannel; imageKey: string; reason: string }>;
};

const CHANNEL_RENDER_BASE: Record<BoosterImageChannel, { width: number; height: number }> = {
  inrcy_site: { width: 1440, height: 900 },
  site_web: { width: 1440, height: 900 },
  inr_search: { width: 1440, height: 900 },
  gmb: { width: 1200, height: 675 },
  facebook: { width: 1200, height: 1200 },
  instagram: { width: 1080, height: 1350 },
  linkedin: { width: 1200, height: 1200 },
  tiktok: { width: 1080, height: 1920 },
  youtube_shorts: { width: 1080, height: 1920 },
  pinterest: { width: 1000, height: 1500 },
};

const CHANNEL_IMAGE_VARIANT_PIPELINE_VERSION = 3;
const CHANNEL_IMAGE_VARIANT_BUCKET = "booster";

type ChannelImageVariantRow = {
  id: string;
  media_id: string;
  channel: string | null;
  signature: string | null;
  bucket_name: string | null;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
};

function safeStorageSegment(value: unknown, fallback: string) {
  const clean = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return clean || fallback;
}

function buildChannelImageSignature(value: Record<string, unknown>) {
  const hash = createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
  return {
    hash,
    signature: `inrcy:image:channel_publish:v${CHANNEL_IMAGE_VARIANT_PIPELINE_VERSION}:${hash}`,
  };
}

function cachedVariantKey(mediaId: string, channel: string, signature: string) {
  return `${mediaId}:${channel}:${signature}`;
}

async function loadCachedChannelImageVariants(params: {
  accountId?: string;
  workspaceId?: string;
  mediaIds: string[];
  channels: BoosterImageChannel[];
}) {
  const cache = new Map<string, ChannelImageVariantRow>();
  if (
    !params.accountId ||
    !params.workspaceId ||
    !params.mediaIds.length ||
    !params.channels.length
  ) {
    return cache;
  }
  const result = await supabaseAdmin
    .from("media_variants")
    .select(
      "id,media_id,channel,signature,bucket_name,storage_path,mime_type,size_bytes,width,height",
    )
    .eq("account_id", params.accountId)
    .eq("workspace_id", params.workspaceId)
    .eq("purpose", "channel_publish")
    .eq("status", "ready")
    .in("media_id", params.mediaIds)
    .in("channel", params.channels);
  if (result.error) throw result.error;
  for (const row of (result.data || []) as ChannelImageVariantRow[]) {
    if (!row.media_id || !row.channel || !row.signature) continue;
    cache.set(
      cachedVariantKey(row.media_id, row.channel, row.signature),
      row,
    );
  }
  return cache;
}

async function persistChannelImageVariant(params: {
  accountId: string;
  workspaceId: string;
  mediaId: string;
  channel: BoosterImageChannel;
  signature: string;
  hash: string;
  output: Buffer;
  mime: string;
  extension: string;
  width: number;
  height: number;
  transform: Record<string, unknown>;
  metadata: Record<string, unknown>;
}) {
  const account = safeStorageSegment(params.accountId, "account");
  const media = safeStorageSegment(params.mediaId, "media");
  const storagePath = `${account}/workspace-channel-images/${media}/${params.hash}.${params.extension}`;
  const uploaded = await supabaseAdmin.storage
    .from(CHANNEL_IMAGE_VARIANT_BUCKET)
    .upload(storagePath, toExactStorageArrayBuffer(params.output), {
      contentType: params.mime,
      cacheControl: "31536000",
      upsert: true,
    });
  if (uploaded.error) throw uploaded.error;

  const readyAt = new Date().toISOString();
  const record = {
    account_id: params.accountId,
    media_id: params.mediaId,
    workspace_id: params.workspaceId,
    purpose: "channel_publish",
    channel: params.channel,
    signature: params.signature,
    status: "ready",
    bucket_name: CHANNEL_IMAGE_VARIANT_BUCKET,
    storage_path: storagePath,
    mime_type: params.mime,
    size_bytes: params.output.length,
    width: params.width,
    height: params.height,
    duration_seconds: null,
    pipeline_version: CHANNEL_IMAGE_VARIANT_PIPELINE_VERSION,
    transform_spec: params.transform,
    variant_metadata: params.metadata,
    error_code: null,
    error_message: null,
    ready_at: readyAt,
  };
  const existing = await supabaseAdmin
    .from("media_variants")
    .select("id")
    .eq("account_id", params.accountId)
    .eq("media_id", params.mediaId)
    .eq("workspace_id", params.workspaceId)
    .eq("purpose", "channel_publish")
    .eq("channel", params.channel)
    .eq("signature", params.signature)
    .maybeSingle();
  if (existing.error) throw existing.error;
  const saved = existing.data?.id
    ? await supabaseAdmin
        .from("media_variants")
        .update(record)
        .eq("id", existing.data.id)
        .select(
          "id,media_id,channel,signature,bucket_name,storage_path,mime_type,size_bytes,width,height",
        )
        .single()
    : await supabaseAdmin
        .from("media_variants")
        .insert(record)
        .select(
          "id,media_id,channel,signature,bucket_name,storage_path,mime_type,size_bytes,width,height",
        )
        .single();
  if (saved.error?.code === "23505") {
    const winner = await supabaseAdmin
      .from("media_variants")
      .select(
        "id,media_id,channel,signature,bucket_name,storage_path,mime_type,size_bytes,width,height",
      )
      .eq("account_id", params.accountId)
      .eq("media_id", params.mediaId)
      .eq("workspace_id", params.workspaceId)
      .eq("purpose", "channel_publish")
      .eq("channel", params.channel)
      .eq("signature", params.signature)
      .single();
    if (winner.error) throw winner.error;
    return winner.data as ChannelImageVariantRow;
  }
  if (saved.error) throw saved.error;
  return saved.data as ChannelImageVariantRow;
}

function channelImagePayloadFromVariant(params: {
  row: ChannelImageVariantRow;
  name: string;
  mediaId: string;
}) {
  const bucket = String(
    params.row.bucket_name || CHANNEL_IMAGE_VARIANT_BUCKET,
  );
  const storagePath = String(params.row.storage_path || "");
  const publicUrl =
    supabaseAdmin.storage.from(bucket).getPublicUrl(storagePath).data
      .publicUrl || "";
  return {
    mediaId: params.mediaId,
    name: params.name,
    type: String(params.row.mime_type || "image/jpeg"),
    bucket,
    storagePath,
    publicUrl,
    renderedUrl: publicUrl,
    publicationReady: true,
  } satisfies BoosterServerImagePayload;
}

function asObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function parseDataUrl(value: string) {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(String(value || ""));
  if (!match) return null;
  return { mime: match[1] || "application/octet-stream", buffer: Buffer.from(match[2], "base64") };
}

function extensionFromMime(mime: string) {
  const normalized = String(mime || "").toLowerCase();
  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  return "jpg";
}

async function resolveImageBuffer(image: BoosterServerImagePayload) {
  // Always rebuild from the canonical original when one is available. This
  // prevents an old channel canvas (white bars/crop) from becoming the source
  // of a new publication after the media-pipeline cutover.
  const bucket = String(image.bucket || "booster").trim() || "booster";
  const storageCandidates = Array.from(
    new Set(
      [image.originalStoragePath, image.storagePath]
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
  for (const storagePath of storageCandidates) {
    const downloaded = await supabaseAdmin.storage.from(bucket).download(storagePath);
    if (!downloaded.error && downloaded.data) {
      return {
        mime:
          downloaded.data.type ||
          image.originalType ||
          image.type ||
          "application/octet-stream",
        buffer: Buffer.from(await downloaded.data.arrayBuffer()),
      };
    }
  }

  const parsed = image.dataUrl ? parseDataUrl(image.dataUrl) : null;
  if (parsed) return parsed;

  const urlCandidates = Array.from(
    new Set(
      [
        image.originalPublicUrl,
        image.originalUrl,
        image.publicUrl,
        image.renderedUrl,
      ]
        .map((value) => String(value || "").trim())
        .filter((value) => /^https?:\/\//i.test(value)),
    ),
  );
  for (const url of urlCandidates) {
    const response = await fetch(url);
    if (!response.ok) continue;
    return {
      mime:
        response.headers.get("content-type") ||
        image.originalType ||
        image.type ||
        "application/octet-stream",
      buffer: Buffer.from(await response.arrayBuffer()),
    };
  }
  return null;
}

function getOrientedDimensions(meta: { width?: number; height?: number; orientation?: number }) {
  const width = Number(meta.width || 0);
  const height = Number(meta.height || 0);
  const orientation = Number(meta.orientation || 1);
  const swapsAxes = orientation >= 5 && orientation <= 8;
  return { width: swapsAxes ? height : width, height: swapsAxes ? width : height };
}

async function readImageMeta(buffer: Buffer): Promise<BoosterImageMetaLike> {
  const meta = await sharp(buffer, { failOn: "none" }).metadata();
  const oriented = getOrientedDimensions(meta);
  if (!oriented.width || !oriented.height) return {};
  return {
    width: oriented.width,
    height: oriented.height,
    ratio: oriented.width / oriented.height,
  };
}

function readKnownImageMeta(value: unknown): BoosterImageMetaLike | null {
  const raw = asObject(value);
  const width = Number(raw.width || 0);
  const height = Number(raw.height || 0);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return {
    width,
    height,
    ratio: width / height,
  };
}

function mergeImageMeta(existing: unknown, meta: BoosterImageMetaLike) {
  return { ...asObject(existing), ...meta };
}

function getStableOriginalUrl(image: BoosterServerImagePayload) {
  return String(
    image.originalPublicUrl || image.originalUrl || image.publicUrl || "",
  ).trim() || null;
}

function clamp(value: unknown, min: number, max: number, fallback = 0) {
  const numeric = Number(value);
  const resolved = Number.isFinite(numeric) ? numeric : fallback;
  return Math.min(max, Math.max(min, resolved));
}

function normalizeTransform(value: unknown, fallback: ServerImageTransform): ServerImageTransform {
  const raw = asObject(value);
  const fit = raw.fit === "cover" ? "cover" : raw.fit === "contain" ? "contain" : fallback.fit;
  return {
    fit,
    zoom: clamp(raw.zoom, 0.4, fit === "cover" ? 3 : 1, fallback.zoom),
    offsetX: clamp(raw.offsetX, -100, 100, fallback.offsetX),
    offsetY: clamp(raw.offsetY, -100, 100, fallback.offsetY),
    blurBackground: raw.blurBackground === true,
    backgroundMode: String(raw.backgroundMode || fallback.backgroundMode || "").trim() || undefined,
    backgroundColor: String(raw.backgroundColor || fallback.backgroundColor || "").trim() || undefined,
  };
}

function normalizeChannelSettings(value: unknown): ChannelSettings {
  const raw = asObject(value);
  const transformsNode = asObject(raw.transforms);
  const transforms = Object.fromEntries(
    Object.entries(transformsNode).map(([key, transform]) => [
      key,
      normalizeTransform(transform, {
        fit: "contain",
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
        blurBackground: false,
        backgroundMode: "color",
        backgroundColor: "#ffffff",
      }),
    ]),
  );
  return {
    imageKeys: Array.isArray(raw.imageKeys)
      ? raw.imageKeys.map((key) => String(key || "").trim()).filter(Boolean).slice(0, 5)
      : [],
    transforms,
    customizedImageKeys: Array.isArray(raw.customizedImageKeys)
      ? raw.customizedImageKeys.map((key) => String(key || "").trim()).filter(Boolean).slice(0, 5)
      : [],
  };
}

function backgroundRgba(transform: ServerImageTransform, forceOpaque = false) {
  const mode = transform.backgroundMode === "blur"
    ? transform.backgroundColor ? "color" : "brand"
    : transform.backgroundMode || (transform.backgroundColor ? "color" : "black");
  if (mode === "transparent" && !forceOpaque) {
    return { r: 0, g: 0, b: 0, alpha: 0 };
  }
  const raw = String(transform.backgroundColor || "").trim();
  const hex = /^#?([0-9a-f]{6})$/i.exec(raw)?.[1];
  if (hex) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
      alpha: 1,
    };
  }
  if (["white", "gray", "sand", "brand", "color"].includes(mode)) {
    if (mode === "gray") return { r: 214, g: 218, b: 226, alpha: 1 };
    if (mode === "sand") return { r: 239, g: 228, b: 211, alpha: 1 };
    return { r: 255, g: 255, b: 255, alpha: 1 };
  }
  return { r: 13, g: 19, b: 32, alpha: 1 };
}

function originalReferenceTransform(): ServerImageTransform {
  // Must stay visually equivalent to getOptimizedTransform() on the client.
  // It is metadata only: original publication never renders a fixed canvas.
  return {
    fit: "contain",
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    blurBackground: false,
    backgroundMode: "color",
    backgroundColor: "#ffffff",
  };
}

function automaticTransformForDecision(params: {
  sourceRatio: number;
  targetRatio: number;
}): ServerImageTransform {
  const fit = canUseAutomaticCover(params.sourceRatio, params.targetRatio)
    ? "cover"
    : "contain";
  return {
    fit,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    blurBackground: fit === "contain",
    // A hard channel ratio with a large mismatch keeps the whole image over a
    // blurred fill instead of generating ugly white/black bars.
    backgroundMode: fit === "contain" ? "blur" : "black",
  };
}

async function renderImageTransform(params: {
  buffer: Buffer;
  channel: BoosterImageChannel;
  transform: ServerImageTransform;
  targetRatio?: number | null;
}) {
  const base = CHANNEL_RENDER_BASE[params.channel];
  const dimensions = getBoosterImageRenderDimensions({
    baseWidth: base.width,
    baseHeight: base.height,
    targetRatio: params.targetRatio,
  });
  const oriented = sharp(params.buffer, { failOn: "none" }).rotate();
  const meta = await oriented.metadata();
  const imageWidth = Number(meta.width || 0);
  const imageHeight = Number(meta.height || 0);
  if (!imageWidth || !imageHeight) throw new Error("image_dimensions_missing");

  const baseScale = params.transform.fit === "cover"
    ? Math.max(dimensions.width / imageWidth, dimensions.height / imageHeight)
    : Math.min(dimensions.width / imageWidth, dimensions.height / imageHeight);
  const maxZoom = params.transform.fit === "cover" ? 3 : 1;
  const zoom = clamp(params.transform.zoom, 0.4, maxZoom, 1);
  const drawWidth = Math.max(1, Math.round(imageWidth * baseScale * zoom));
  const drawHeight = Math.max(1, Math.round(imageHeight * baseScale * zoom));
  const maxX = Math.abs(drawWidth - dimensions.width) / 2;
  const maxY = Math.abs(drawHeight - dimensions.height) / 2;
  const dx = Math.round(
    (dimensions.width - drawWidth) / 2 -
      (maxX * clamp(params.transform.offsetX, -100, 100, 0)) / 100,
  );
  const dy = Math.round(
    (dimensions.height - drawHeight) / 2 -
      (maxY * clamp(params.transform.offsetY, -100, 100, 0)) / 100,
  );

  const resized = await sharp(params.buffer, { failOn: "none" })
    .rotate()
    .resize({ width: drawWidth, height: drawHeight, fit: "fill" })
    .png()
    .toBuffer();

  const cropLeft = Math.max(0, -dx);
  const cropTop = Math.max(0, -dy);
  const destinationLeft = Math.max(0, dx);
  const destinationTop = Math.max(0, dy);
  const visibleWidth = Math.min(
    drawWidth - cropLeft,
    dimensions.width - destinationLeft,
  );
  const visibleHeight = Math.min(
    drawHeight - cropTop,
    dimensions.height - destinationTop,
  );
  if (visibleWidth <= 0 || visibleHeight <= 0) {
    throw new Error("image_transform_outside_canvas");
  }
  const overlay = await sharp(resized)
    .extract({
      left: cropLeft,
      top: cropTop,
      width: visibleWidth,
      height: visibleHeight,
    })
    .png()
    .toBuffer();

  const requestedMode = params.transform.backgroundMode || "black";
  const transparent = requestedMode === "transparent" && params.channel !== "gmb";
  const background = backgroundRgba(params.transform, params.channel === "gmb");
  const foreground = { input: overlay, left: destinationLeft, top: destinationTop };

  const blurredBackground =
    requestedMode === "blur"
      ? await sharp(params.buffer, { failOn: "none" })
          .rotate()
          .resize({
            width: dimensions.width,
            height: dimensions.height,
            fit: "cover",
          })
          .blur(28)
          .modulate({ brightness: 0.78, saturation: 0.9 })
          .png()
          .toBuffer()
      : null;

  const canvas = blurredBackground
    ? sharp(blurredBackground).composite([foreground])
    : sharp({
        create: {
          width: dimensions.width,
          height: dimensions.height,
          channels: 4,
          background,
        },
      }).composite([foreground]);

  if (transparent) {
    return {
      output: await canvas.png({ compressionLevel: 8 }).toBuffer(),
      mime: "image/png",
      extension: "png",
      width: dimensions.width,
      height: dimensions.height,
    } as const;
  }
  return {
    output: await canvas
      .flatten({ background })
      .jpeg({ quality: 90, mozjpeg: true, progressive: true })
      .toBuffer(),
    mime: "image/jpeg",
    extension: "jpg",
    width: dimensions.width,
    height: dimensions.height,
  } as const;
}

async function renderAutomaticAdaptation(params: {
  buffer: Buffer;
  channel: BoosterImageChannel;
  sourceRatio: number;
  targetRatio: number;
}) {
  const transform = automaticTransformForDecision(params);
  const rendered = await renderImageTransform({
    buffer: params.buffer,
    channel: params.channel,
    transform,
    targetRatio: params.targetRatio,
  });
  return { ...rendered, fit: transform.fit } as const;
}

async function renderPublicationOriginal(buffer: Buffer) {
  const { data, info } = await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({
      width: 2048,
      height: 2048,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 90, mozjpeg: true, progressive: true })
    .toBuffer({ resolveWithObject: true });
  if (!info.width || !info.height) {
    throw new Error("image_publication_dimensions_missing");
  }
  return {
    output: data,
    mime: "image/jpeg",
    extension: "jpg",
    width: info.width,
    height: info.height,
  } as const;
}

/**
 * Server counterpart of Booster's client image preparation.
 *
 * Étape 8 accepte aussi les réglages légers envoyés par Booster. Le serveur
 * recrée alors les adaptations et personnalisations directement depuis la
 * version canonique privée du workspace : aucun JPEG/PNG dérivé ne traverse
 * plus le navigateur lors de Générer / Publier / Programmer.
 */
export async function prepareBoosterImagesByChannelOnServer(params: {
  accountId?: string;
  workspaceId?: string;
  channels: BoosterImageChannel[];
  images: BoosterServerImagePayload[];
  settingsByChannel?: Partial<Record<BoosterImageChannel, unknown>>;
}): Promise<BoosterServerImagePreparationResult> {
  const channels = Array.from(new Set(params.channels));
  const sourceImages = params.images.slice(0, 5);
  const warnings: BoosterServerImagePreparationResult["warnings"] = [];

  const resolved = await Promise.all(
    sourceImages.map(async (image, index) => {
      let inputPromise: ReturnType<typeof resolveImageBuffer> | null = null;
      const resolveInput = async () => {
        inputPromise ||= resolveImageBuffer(image);
        const input = await inputPromise;
        if (!input) throw new Error("image_source_unavailable");
        return input;
      };
      let meta = readKnownImageMeta(image.imageMeta);
      if (!meta) {
        const input = await resolveInput().catch(() => null);
        if (!input) return null;
        meta = await readImageMeta(input.buffer);
      }
      return {
        image,
        meta,
        imageKey: String(image.imageKey || `image-${index + 1}`),
        resolveInput,
      };
    }),
  );
  const valid = resolved.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const cachedVariants = await loadCachedChannelImageVariants({
    accountId: params.accountId,
    workspaceId: params.workspaceId,
    mediaIds: valid
      .map((entry) => String(entry.image.mediaId || ""))
      .filter(Boolean),
    channels,
  });

  const imagesByChannel: BoosterServerImagePreparationResult["imagesByChannel"] = {};
  const imageSettingsByChannel: BoosterServerImagePreparationResult["imageSettingsByChannel"] = {};

  for (const channel of channels) {
    if (channel === "youtube_shorts" || !valid.length) {
      imagesByChannel[channel] = [];
      imageSettingsByChannel[channel] = { imageKeys: [], transforms: {}, customizedImageKeys: [] };
      continue;
    }

    const requestedSettings = normalizeChannelSettings(params.settingsByChannel?.[channel]);
    const byKey = new Map(valid.map((entry) => [entry.imageKey, entry]));
    const ordered = requestedSettings.imageKeys.length
      ? requestedSettings.imageKeys.map((key) => byKey.get(key)).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      : valid;
    const completeOrder = ordered.length === valid.length ? ordered : valid;
    const channelSources = channel === "gmb" ? completeOrder.slice(0, 5) : completeOrder;
    const firstImageKey = channelSources[0]?.imageKey || "";
    const firstCustomized = requestedSettings.customizedImageKeys.includes(firstImageKey);
    const sequenceTargetRatio = getBoosterImageSequenceTargetRatio({
      channel,
      metas: channelSources.map((entry) => entry.meta),
      firstImageCustomizedTargetRatio:
        channel === "instagram" && firstCustomized
          ? CHANNEL_RENDER_BASE.instagram.width / CHANNEL_RENDER_BASE.instagram.height
          : null,
    });
    const prepared: BoosterServerImagePayload[] = [];
    const transforms: Record<string, unknown> = {};
    const customizedImageKeys: string[] = [];

    for (const entry of channelSources) {
      try {
        const initialDecision = getBoosterImageDecision({
          channel,
          meta: entry.meta,
          requiredTargetRatio: sequenceTargetRatio,
        });
        if (initialDecision.mode === "unsupported") continue;
        const sourceRatio = Number(initialDecision.sourceRatio || entry.meta.ratio || 0);
        const targetRatio = Number(initialDecision.targetRatio || sourceRatio || 0);
        const automaticTransform =
          initialDecision.mode === "original"
            ? originalReferenceTransform()
            : sourceRatio > 0 && targetRatio > 0
              ? automaticTransformForDecision({ sourceRatio, targetRatio })
              : originalReferenceTransform();
        const currentTransform = normalizeTransform(
          requestedSettings.transforms[entry.imageKey],
          automaticTransform,
        );
        const explicitlyCustomized = requestedSettings.customizedImageKeys.includes(entry.imageKey);
        const displayPlan = getBoosterImageDisplayPlan({
          channel,
          meta: entry.meta,
          customized: explicitlyCustomized,
          currentTransform: currentTransform as ComparableImageTransform,
          automaticTransform: automaticTransform as ComparableImageTransform,
          requiredTargetRatio: sequenceTargetRatio,
        });

        const originalUrl = getStableOriginalUrl(entry.image);
        const common = {
          originalUrl,
          originalPublicUrl: originalUrl,
          originalStoragePath: entry.image.originalStoragePath || entry.image.storagePath || null,
          originalName: entry.image.originalName || entry.image.name,
          originalType:
            entry.image.originalType ||
            entry.image.type ||
            "application/octet-stream",
          imageKey: entry.imageKey,
          imageMeta: mergeImageMeta(entry.image.imageMeta, entry.meta),
          imageDecisionMode: displayPlan.decision.mode,
          imageDecisionLabel: displayPlan.decision.label,
          isCustomized: displayPlan.decision.mode === "customized",
        } as const;

        const getPreparedVariantIdentity = (
          mode: "original" | "adapted" | "customized",
          transform: ServerImageTransform,
        ) =>
          buildChannelImageSignature({
            pipelineVersion: CHANNEL_IMAGE_VARIANT_PIPELINE_VERSION,
            mediaId: String(entry.image.mediaId || "").trim(),
            sourcePath: entry.image.storagePath || "",
            imageKey: entry.imageKey,
            channel,
            mode,
            transform,
          });

        const readCachedPreparedVariant = (
          mode: "original" | "adapted" | "customized",
          name: string,
          transform: ServerImageTransform,
        ) => {
          const mediaId = String(entry.image.mediaId || "").trim();
          if (!params.accountId || !params.workspaceId || !mediaId) return null;
          const identity = getPreparedVariantIdentity(mode, transform);
          const row = cachedVariants.get(
            cachedVariantKey(mediaId, channel, identity.signature),
          );
          if (!row?.storage_path) return null;
          return {
            ...channelImagePayloadFromVariant({ row, name, mediaId }),
            ...common,
            transform,
          };
        };

        const buildPreparedVariant = async (variant: {
          mode: "original" | "adapted" | "customized";
          name: string;
          transform: ServerImageTransform;
          output: Buffer;
          mime: string;
          extension: string;
          width: number;
          height: number;
        }) => {
          const mediaId = String(entry.image.mediaId || "").trim();
          const signed = getPreparedVariantIdentity(
            variant.mode,
            variant.transform,
          );
          if (params.accountId && params.workspaceId && mediaId) {
            const key = cachedVariantKey(mediaId, channel, signed.signature);
            let row = cachedVariants.get(key);
            if (!row?.storage_path) {
              row = await persistChannelImageVariant({
                accountId: params.accountId,
                workspaceId: params.workspaceId,
                mediaId,
                channel,
                signature: signed.signature,
                hash: signed.hash,
                output: variant.output,
                mime: variant.mime,
                extension: variant.extension,
                width: variant.width,
                height: variant.height,
                transform: { ...variant.transform },
                metadata: {
                  imageKey: entry.imageKey,
                  decisionMode: variant.mode,
                  sourceStoragePath: entry.image.storagePath || null,
                },
              });
              cachedVariants.set(key, row);
            }
            return {
              ...channelImagePayloadFromVariant({
                row,
                name: variant.name,
                mediaId,
              }),
              ...common,
              transform: variant.transform,
            };
          }
          return {
            mediaId: mediaId || undefined,
            name: variant.name,
            type: variant.mime,
            dataUrl: `data:${variant.mime};base64,${variant.output.toString("base64")}`,
            ...common,
            transform: variant.transform,
          };
        };

        if (displayPlan.decision.mode === "original") {
          if (!params.accountId || !params.workspaceId || !entry.image.mediaId) {
            prepared.push({
              ...entry.image,
              ...common,
              transform: automaticTransform,
            });
            transforms[entry.imageKey] = automaticTransform;
            continue;
          }
          const nameBase = String(
            entry.image.name || `image-${entry.imageKey}`,
          ).replace(/\.[^.]+$/, "");
          const outputName = `${nameBase}-${channel}-publication.jpg`;
          const cached = readCachedPreparedVariant(
            "original",
            outputName,
            automaticTransform,
          );
          if (cached) {
            prepared.push(cached);
            transforms[entry.imageKey] = automaticTransform;
            continue;
          }
          const input = await entry.resolveInput();
          const original = await renderPublicationOriginal(input.buffer);
          prepared.push(
            await buildPreparedVariant({
              mode: "original",
              name: outputName,
              transform: automaticTransform,
              ...original,
            }),
          );
          transforms[entry.imageKey] = automaticTransform;
          continue;
        }

        if (displayPlan.decision.mode === "adapted") {
          const adaptedTargetRatio = Number(displayPlan.decision.targetRatio || targetRatio || 0);
          if (!(sourceRatio > 0 && adaptedTargetRatio > 0)) {
            throw new Error("missing_ratio_for_adaptation");
          }
          const transform = automaticTransformForDecision({
            sourceRatio,
            targetRatio: adaptedTargetRatio,
          });
          const nameBase = String(entry.image.name || `image-${entry.imageKey}`).replace(/\.[^.]+$/, "");
          const outputName = `${nameBase}-${channel}-adaptee.jpg`;
          const cached = readCachedPreparedVariant(
            "adapted",
            outputName,
            transform,
          );
          if (cached) {
            prepared.push(cached);
            transforms[entry.imageKey] = transform;
            continue;
          }
          const input = await entry.resolveInput();
          const adapted = await renderAutomaticAdaptation({
            buffer: input.buffer,
            channel,
            sourceRatio,
            targetRatio: adaptedTargetRatio,
          });
          prepared.push(
            await buildPreparedVariant({
              mode: "adapted",
              name: outputName,
              transform,
              ...adapted,
            }),
          );
          transforms[entry.imageKey] = transform;
          continue;
        }

        const customizedTargetRatio = channel === "instagram" && sequenceTargetRatio
          ? sequenceTargetRatio
          : CHANNEL_RENDER_BASE[channel].width / CHANNEL_RENDER_BASE[channel].height;
        const nameBase = String(entry.image.name || `image-${entry.imageKey}`).replace(/\.[^.]+$/, "");
        const customizedExtension =
          currentTransform.backgroundMode === "transparent" && channel !== "gmb"
            ? "png"
            : "jpg";
        const outputName = `${nameBase}-${channel}-personnalisee.${customizedExtension}`;
        const cached = readCachedPreparedVariant(
          "customized",
          outputName,
          currentTransform,
        );
        if (cached) {
          prepared.push(cached);
          transforms[entry.imageKey] = currentTransform;
          customizedImageKeys.push(entry.imageKey);
          continue;
        }
        const input = await entry.resolveInput();
        const customized = await renderImageTransform({
          buffer: input.buffer,
          channel,
          transform: currentTransform,
          targetRatio: customizedTargetRatio,
        });
        prepared.push(
          await buildPreparedVariant({
            mode: "customized",
            name: `${nameBase}-${channel}-personnalisee.${customized.extension}`,
            transform: currentTransform,
            ...customized,
          }),
        );
        transforms[entry.imageKey] = currentTransform;
        customizedImageKeys.push(entry.imageKey);
      } catch (error) {
        warnings.push({
          channel,
          imageKey: entry.imageKey,
          reason: error instanceof Error ? error.message : "image_preparation_failed",
        });
      }
    }

    if (prepared.length === channelSources.length) {
      imagesByChannel[channel] = prepared;
      imageSettingsByChannel[channel] = {
        imageKeys: prepared.map((image) => image.imageKey).filter(Boolean),
        transforms,
        customizedImageKeys,
        policy: params.settingsByChannel?.[channel]
          ? "booster_workspace_exact_settings_v1"
          : "booster_intelligent_matrix_v1",
      };
    }
  }

  return { imagesByChannel, imageSettingsByChannel, warnings };
}

export function inferBoosterImageExtension(mime: string) {
  return extensionFromMime(mime);
}
