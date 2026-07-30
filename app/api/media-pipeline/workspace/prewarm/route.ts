import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rateLimit";
import { requireUser } from "@/lib/requireUser";
import {
  MediaWorkspaceConsumptionError,
  resolveWorkspacePublicationConsumption,
} from "@/lib/mediaWorkspaceConsumption";
import {
  prepareBoosterImagesByChannelOnServer,
} from "@/lib/boosterImageServerPreparation";
import { prepareBoosterVideoVariantsOnServer } from "@/lib/boosterVideoVariantServer";
import {
  buildVideoSettingsByChannel,
  isBoosterVideoChannelKey,
  type BoosterVideoChannelKey,
} from "@/lib/boosterVideoSettings";
import { buildVideoTransformSignature } from "@/lib/boosterVideoTransforms";
import { validateVideoPublicationForChannel } from "@/lib/videoPublicationPolicy";
import type { BoosterImageChannel } from "@/lib/boosterImageDecision";
import { createSafeStorageSignedUrl } from "@/lib/safeStorageSignedUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ALLOWED_CHANNELS = new Set<BoosterVideoChannelKey>([
  "inrcy_site",
  "site_web",
  "inr_search",
  "gmb",
  "facebook",
  "instagram",
  "linkedin",
  "tiktok",
  "youtube_shorts",
  "pinterest",
]);

function cleanText(value: unknown, max = 100) {
  return String(value || "").trim().slice(0, max);
}

function cleanChannels(value: unknown) {
  if (!Array.isArray(value)) return [] as BoosterVideoChannelKey[];
  return Array.from(
    new Set(
      value
        .map((channel) => cleanText(channel, 40))
        .filter(
          (channel): channel is BoosterVideoChannelKey =>
            isBoosterVideoChannelKey(channel) && ALLOWED_CHANNELS.has(channel),
        ),
    ),
  );
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function POST(request: Request) {
  try {
    const { errorResponse, activeUserId } = await requireUser();
    if (errorResponse) return errorResponse;

    const limited = await enforceRateLimit({
      name: "media_pipeline_workspace_prewarm",
      identifier: activeUserId,
      limit: 24,
      fallbackLimit: 24,
      window: "10 m",
      failClosed: false,
    });
    if (limited) return limited;

    const body = await request.json().catch(() => null);
    const workspaceId = cleanText(body?.workspaceId, 80);
    const selectedChannels = cleanChannels(body?.selectedChannels);
    if (!workspaceId) {
      return NextResponse.json(
        { ok: false, code: "workspace_required", error: "Espace média manquant." },
        { status: 400 },
      );
    }
    if (!selectedChannels.length) {
      return NextResponse.json({
        ok: true,
        workspaceId,
        status: "skipped",
        reason: "no_selected_channel",
      });
    }

    const consumption = await resolveWorkspacePublicationConsumption({
      accountId: activeUserId,
      workspaceId,
      purpose: "publish",
    });

    if (consumption.mediaType === "images") {
      const prepared = await prepareBoosterImagesByChannelOnServer({
        accountId: activeUserId,
        workspaceId,
        channels: selectedChannels as BoosterImageChannel[],
        images: consumption.images,
        settingsByChannel: asObject(body?.imageSettingsByChannel) as any,
      });
      return NextResponse.json({
        ok: prepared.warnings.length === 0,
        workspaceId,
        status: "ready",
        mediaType: "images",
        preparedChannels: Object.keys(prepared.imagesByChannel),
        warnings: prepared.warnings,
      });
    }

    if (consumption.mediaType === "video" && consumption.video) {
      const video = consumption.video;
      const settings = buildVideoSettingsByChannel({
        channels: selectedChannels,
        videoSettingsByChannel: body?.videoSettingsByChannel,
        sourceMetadata: video.sourceMetadata,
      });
      const signedSourceUrl = await createSafeStorageSignedUrl(
        video.bucket,
        video.storagePath,
        60 * 60,
      );
      const requestedVariants = selectedChannels.map((channel) => ({
        key: `${channel}-${settings[channel]?.format || "original"}-${settings[channel]?.adaptationMode || "safe_blur"}`,
        channel,
        format: settings[channel]?.format,
        adaptationMode: settings[channel]?.adaptationMode,
      }));
      const prepared = await prepareBoosterVideoVariantsOnServer({
        accountId: activeUserId,
        workspaceId,
        mediaId: video.mediaId,
        generateMissing: true,
        source: {
          ...video,
          publicUrl: signedSourceUrl,
          url: signedSourceUrl,
        },
        variants: requestedVariants,
      });
      const requiredSignatures = Array.from(
        new Set(
          requestedVariants.map((variant) =>
            buildVideoTransformSignature(
              variant.format || "original",
              variant.adaptationMode || "safe_blur",
            ),
          ),
        ),
      );
      const invalidChannels = requestedVariants.flatMap((request) => {
        const signature = buildVideoTransformSignature(
          request.format || "original",
          request.adaptationMode || "safe_blur",
        );
        const variant = prepared.variants.find(
          (candidate) => candidate.signature === signature,
        );
        if (!variant?.publicUrl || !variant?.storagePath) {
          return [
            {
              channel: request.channel,
              signature,
              reason: "variant_missing",
              message: "La variante vidéo demandée n’est pas encore prête.",
            },
          ];
        }
        const validation = validateVideoPublicationForChannel({
          channel: request.channel,
          name: variant.name || `video-${request.channel}.mp4`,
          type: variant.contentType,
          storagePath: variant.storagePath,
          sizeBytes: variant.size,
          durationSeconds: variant.duration ?? video.duration,
        });
        return validation.ok
          ? []
          : [
              {
                channel: request.channel,
                signature,
                reason: validation.reason,
                message: validation.message,
              },
            ];
      });
      const invalidSignatures = Array.from(
        new Set(invalidChannels.map((item) => item.signature)),
      );
      const ready = prepared.ok && invalidChannels.length === 0;
      return NextResponse.json({
        ok: ready,
        workspaceId,
        status: ready ? "ready" : "partial",
        mediaType: "video",
        preparedVariants: prepared.variants.length,
        requiredVariants: requiredSignatures.length,
        invalidSignatures,
        invalidChannels,
        errors: prepared.errors,
      });
    }

    return NextResponse.json({
      ok: true,
      workspaceId,
      status: "skipped",
      mediaType: "none",
    });
  } catch (error) {
    if (error instanceof MediaWorkspaceConsumptionError) {
      return NextResponse.json(
        { ok: false, code: error.code, error: error.message },
        { status: error.status },
      );
    }
    console.error("[media-pipeline] workspace prewarm failed", error);
    return NextResponse.json(
      {
        ok: false,
        code: "workspace_prewarm_failed",
        error:
          error instanceof Error
            ? error.message
            : "La préparation anticipée des médias a échoué.",
      },
      { status: 500 },
    );
  }
}
