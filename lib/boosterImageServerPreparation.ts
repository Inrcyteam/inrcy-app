import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
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
  const parsed = image.dataUrl ? parseDataUrl(image.dataUrl) : null;
  if (parsed) return parsed;

  const storagePath = String(image.storagePath || "").trim();
  if (storagePath) {
    const bucket = String(image.bucket || "booster").trim() || "booster";
    const downloaded = await supabaseAdmin.storage.from(bucket).download(storagePath);
    if (downloaded.error || !downloaded.data) {
      throw new Error(downloaded.error?.message || "image_storage_download_failed");
    }
    return {
      mime: downloaded.data.type || image.type || "application/octet-stream",
      buffer: Buffer.from(await downloaded.data.arrayBuffer()),
    };
  }

  const url = String(image.publicUrl || image.renderedUrl || image.originalPublicUrl || image.originalUrl || "").trim();
  if (!/^https?:\/\//i.test(url)) return null;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`image_download_${response.status}`);
  return {
    mime: response.headers.get("content-type") || image.type || "application/octet-stream",
    buffer: Buffer.from(await response.arrayBuffer()),
  };
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
    blurBackground: false,
    backgroundMode: fit === "contain" ? "color" : "black",
    backgroundColor: "#ffffff",
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
  const canvas = sharp({
    create: {
      width: dimensions.width,
      height: dimensions.height,
      channels: 4,
      background,
    },
  }).composite([{ input: overlay, left: destinationLeft, top: destinationTop }]);

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

/**
 * Server counterpart of Booster's client image preparation.
 *
 * Étape 8 accepte aussi les réglages légers envoyés par Booster. Le serveur
 * recrée alors les adaptations et personnalisations directement depuis la
 * version canonique privée du workspace : aucun JPEG/PNG dérivé ne traverse
 * plus le navigateur lors de Générer / Publier / Programmer.
 */
export async function prepareBoosterImagesByChannelOnServer(params: {
  channels: BoosterImageChannel[];
  images: BoosterServerImagePayload[];
  settingsByChannel?: Partial<Record<BoosterImageChannel, unknown>>;
}): Promise<BoosterServerImagePreparationResult> {
  const channels = Array.from(new Set(params.channels));
  const sourceImages = params.images.slice(0, 5);
  const warnings: BoosterServerImagePreparationResult["warnings"] = [];

  const resolved = await Promise.all(
    sourceImages.map(async (image, index) => {
      const input = await resolveImageBuffer(image);
      if (!input) return null;
      const meta = await readImageMeta(input.buffer);
      return {
        image,
        input,
        meta,
        imageKey: String(image.imageKey || `image-${index + 1}`),
      };
    }),
  );
  const valid = resolved.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

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
    const channelSources = channel === "gmb" ? completeOrder.slice(0, 1) : completeOrder;
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
        const automaticTransform = sourceRatio > 0 && targetRatio > 0
          ? automaticTransformForDecision({ sourceRatio, targetRatio })
          : {
              fit: "contain" as const,
              zoom: 1,
              offsetX: 0,
              offsetY: 0,
              blurBackground: false,
              backgroundMode: "color",
              backgroundColor: "#ffffff",
            };
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
          originalType: entry.image.originalType || entry.image.type || entry.input.mime,
          imageKey: entry.imageKey,
          imageMeta: mergeImageMeta(entry.image.imageMeta, entry.meta),
          imageDecisionMode: displayPlan.decision.mode,
          imageDecisionLabel: displayPlan.decision.label,
          isCustomized: displayPlan.decision.mode === "customized",
        } as const;

        if (displayPlan.decision.mode === "original") {
          prepared.push({ ...entry.image, ...common, transform: automaticTransform });
          transforms[entry.imageKey] = automaticTransform;
          continue;
        }

        if (displayPlan.decision.mode === "adapted") {
          const adaptedTargetRatio = Number(displayPlan.decision.targetRatio || targetRatio || 0);
          if (!(sourceRatio > 0 && adaptedTargetRatio > 0)) {
            throw new Error("missing_ratio_for_adaptation");
          }
          const adapted = await renderAutomaticAdaptation({
            buffer: entry.input.buffer,
            channel,
            sourceRatio,
            targetRatio: adaptedTargetRatio,
          });
          const transform = automaticTransformForDecision({
            sourceRatio,
            targetRatio: adaptedTargetRatio,
          });
          const nameBase = String(entry.image.name || `image-${entry.imageKey}`).replace(/\.[^.]+$/, "");
          prepared.push({
            name: `${nameBase}-${channel}-adaptee.${adapted.extension}`,
            type: adapted.mime,
            dataUrl: `data:${adapted.mime};base64,${adapted.output.toString("base64")}`,
            ...common,
            transform,
          });
          transforms[entry.imageKey] = transform;
          continue;
        }

        const customizedTargetRatio = channel === "instagram" && sequenceTargetRatio
          ? sequenceTargetRatio
          : CHANNEL_RENDER_BASE[channel].width / CHANNEL_RENDER_BASE[channel].height;
        const customized = await renderImageTransform({
          buffer: entry.input.buffer,
          channel,
          transform: currentTransform,
          targetRatio: customizedTargetRatio,
        });
        const nameBase = String(entry.image.name || `image-${entry.imageKey}`).replace(/\.[^.]+$/, "");
        prepared.push({
          name: `${nameBase}-${channel}-personnalisee.${customized.extension}`,
          type: customized.mime,
          dataUrl: `data:${customized.mime};base64,${customized.output.toString("base64")}`,
          ...common,
          transform: currentTransform,
        });
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
