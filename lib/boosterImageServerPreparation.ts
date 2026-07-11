import sharp from "sharp";
import {
  canUseAutomaticCover,
  getBoosterImageDecision,
  getBoosterImageRenderDimensions,
  getBoosterImageSequenceTargetRatio,
  type BoosterImageChannel,
  type BoosterImageMetaLike,
} from "@/lib/boosterImageDecision";

type JsonRecord = Record<string, unknown>;

export type BoosterServerImagePayload = {
  name: string;
  type: string;
  dataUrl?: string;
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
  const base = existing && typeof existing === "object" && !Array.isArray(existing)
    ? (existing as JsonRecord)
    : {};
  return { ...base, ...meta };
}

function getStableOriginalUrl(image: BoosterServerImagePayload) {
  return String(
    image.originalPublicUrl || image.originalUrl || image.publicUrl || "",
  ).trim() || null;
}

async function renderAutomaticAdaptation(params: {
  buffer: Buffer;
  channel: BoosterImageChannel;
  sourceRatio: number;
  targetRatio: number;
}) {
  const { buffer, channel, sourceRatio, targetRatio } = params;
  const base = CHANNEL_RENDER_BASE[channel];
  const dimensions = getBoosterImageRenderDimensions({
    baseWidth: base.width,
    baseHeight: base.height,
    targetRatio,
  });
  const fit = canUseAutomaticCover(sourceRatio, targetRatio) ? "cover" : "contain";
  const background = { r: 255, g: 255, b: 255, alpha: 1 };
  const output = await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({
      width: dimensions.width,
      height: dimensions.height,
      fit,
      position: "centre",
      withoutEnlargement: false,
      background: fit === "contain" ? background : undefined,
    })
    .flatten({ background })
    .jpeg({ quality: 90, mozjpeg: true, progressive: true })
    .toBuffer();

  return { output, fit, width: dimensions.width, height: dimensions.height } as const;
}

/**
 * Server counterpart of Booster's client image preparation.
 *
 * It consumes the exact same decision matrix as Booster:
 * - Originale: preserve the source composition;
 * - Adaptée: render the automatic safe result, with the shared 8% crop curtain;
 * - Personnalisée: not created here (iNrAgent has no manual Adapter action).
 *
 * A per-channel failure is deliberately omitted from imagesByChannel so the
 * existing publish-now legacy safety curtain can still try the source image.
 */
export async function prepareBoosterImagesByChannelOnServer(params: {
  channels: BoosterImageChannel[];
  images: BoosterServerImagePayload[];
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
  const metas = valid.map((entry) => entry.meta);

  const imagesByChannel: BoosterServerImagePreparationResult["imagesByChannel"] = {};
  const imageSettingsByChannel: BoosterServerImagePreparationResult["imageSettingsByChannel"] = {};

  for (const channel of channels) {
    if (channel === "youtube_shorts" || !valid.length) {
      imagesByChannel[channel] = [];
      imageSettingsByChannel[channel] = { imageKeys: [], transforms: {}, customizedImageKeys: [] };
      continue;
    }

    const channelSources = channel === "gmb" ? valid.slice(0, 1) : valid;
    const sequenceTargetRatio = getBoosterImageSequenceTargetRatio({
      channel,
      metas: channelSources.map((entry) => entry.meta),
    });
    const prepared: BoosterServerImagePayload[] = [];
    const transforms: Record<string, unknown> = {};

    for (const entry of channelSources) {
      try {
        const decision = getBoosterImageDecision({
          channel,
          meta: entry.meta,
          requiredTargetRatio: sequenceTargetRatio,
        });
        if (decision.mode === "unsupported") continue;

        const originalUrl = getStableOriginalUrl(entry.image);
        const common = {
          originalUrl,
          originalPublicUrl: originalUrl,
          originalStoragePath: entry.image.originalStoragePath || null,
          originalName: entry.image.originalName || entry.image.name,
          originalType: entry.image.originalType || entry.image.type || entry.input.mime,
          imageKey: entry.imageKey,
          imageMeta: mergeImageMeta(entry.image.imageMeta, entry.meta),
          imageDecisionMode: decision.mode,
          imageDecisionLabel: decision.label,
          isCustomized: false,
        } as const;

        if (decision.mode === "original") {
          prepared.push({ ...entry.image, ...common });
          transforms[entry.imageKey] = { fit: "contain", zoom: 1, offsetX: 0, offsetY: 0 };
          continue;
        }

        const sourceRatio = Number(decision.sourceRatio || 0);
        const targetRatio = Number(decision.targetRatio || 0);
        if (!(sourceRatio > 0 && targetRatio > 0)) {
          throw new Error("missing_ratio_for_adaptation");
        }

        const adapted = await renderAutomaticAdaptation({
          buffer: entry.input.buffer,
          channel,
          sourceRatio,
          targetRatio,
        });
        const nameBase = String(entry.image.name || `image-${entry.imageKey}`).replace(/\.[^.]+$/, "");
        const dataUrl = `data:image/jpeg;base64,${adapted.output.toString("base64")}`;
        const transform = {
          fit: adapted.fit,
          zoom: 1,
          offsetX: 0,
          offsetY: 0,
          blurBackground: false,
          backgroundMode: adapted.fit === "contain" ? "color" : "black",
          backgroundColor: "#ffffff",
        };
        prepared.push({
          name: `${nameBase}-${channel}-adaptee.jpg`,
          type: "image/jpeg",
          dataUrl,
          ...common,
          transform,
          // Match Booster manual publication: keep source metadata for future
          // re-decisions/edits; the rendered file itself already carries the
          // adapted output geometry.
          imageMeta: common.imageMeta,
        });
        transforms[entry.imageKey] = transform;
      } catch (error) {
        warnings.push({
          channel,
          imageKey: entry.imageKey,
          reason: error instanceof Error ? error.message : "image_preparation_failed",
        });
      }
    }

    // Do not register a partial explicit set: publish-now must never silently
    // drop one image from a carousel. Its existing legacy fallback remains the
    // emergency safety curtain when preparation failed.
    if (prepared.length === channelSources.length) {
      imagesByChannel[channel] = prepared;
      imageSettingsByChannel[channel] = {
        imageKeys: prepared.map((image) => image.imageKey).filter(Boolean),
        transforms,
        customizedImageKeys: [],
        policy: "booster_intelligent_matrix_v1",
      };
    }
  }

  return { imagesByChannel, imageSettingsByChannel, warnings };
}

export function inferBoosterImageExtension(mime: string) {
  return extensionFromMime(mime);
}
