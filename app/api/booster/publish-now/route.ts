import { NextResponse, after } from "next/server";
import { requireUser } from "@/lib/requireUser";
import {
  buildInternalCronHeaders,
  getAppOriginFromRequest,
  getCronSecret,
  getCronUserIdFromRequest,
  isAuthorizedCronRequest,
} from "@/lib/cronAuth";
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
  linkedinResharePost,
} from "@/lib/linkedinPublish";
import { getGmbToken, gmbCreateLocalPost } from "@/lib/googleBusiness";
import { findSimilarUpcomingScheduledPublication } from "@/lib/scheduledPublicationDedupe";
import {
  acquireExecutionIdempotencyLock,
  buildCompletedExecutionResponse,
  buildRunningExecutionResponse,
  cleanExecutionIdempotencyKey,
  completeExecutionIdempotencyLock,
  failExecutionIdempotencyLock,
} from "@/lib/executionIdempotency";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { captureApiException } from "@/lib/observability/sentry";
import { withApi } from "@/lib/observability/withApi";
import { invalidateBoosterGenerationContext } from "@/lib/boosterGenerationContext";
import { getAppBubbleAccessMapForUser } from "@/lib/appBubbleAccessServer";
import { isBubbleEnabled } from "@/lib/bubbleAccess";
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
  buildBoosterHashtagLine,
  buildBoosterInstagramCaption,
  buildBoosterMessage,
  buildCtaTextForChannel,
  getBoosterGmbCallToAction,
  sanitizeBoosterPostForStructuredCta,
} from "@/lib/boosterCta";
import { getLinkedInAccessToken } from "@/lib/linkedinOAuth";
import { normalizeTiktokSettings } from "@/lib/tiktokSettings";
import { isTiktokIntegrationActive } from "@/lib/tiktokRouteStorage";
import { buildTiktokMediaProxyUrl } from "@/lib/tiktokMediaUrl";
import { refreshTiktokAccessToken } from "@/lib/tiktokOAuth";
import {
  tiktokDirectPostPhotos,
  tiktokDirectPostVideoFileUpload,
  type TiktokPublicationSettings,
} from "@/lib/tiktokPublish";
import {
  fetchYoutubeMineChannel,
  isYoutubeShortsIntegrationActive,
  refreshYoutubeShortsAccessToken,
} from "@/lib/youtubeShortsOAuth";
import { uploadYoutubeShort } from "@/lib/youtubeShortsPublish";
import { getPinterestAccessToken } from "@/lib/pinterestOAuth";
import {
  createPinterestImagePin,
  createPinterestVideoPin,
} from "@/lib/pinterestPublish";
import {
  buildVideoSettingsByChannel,
  getAutomaticVideoSettingsForPublication,
} from "@/lib/boosterVideoSettings";
import {
  buildVideoTransformSignature,
  getVideoPublicationProfileForChannel,
} from "@/lib/boosterVideoTransforms";
import { ensureSystemManagedInrSearch, notifyInrSearchIndexing, revalidateInrSearchPublicRoutes } from "@/lib/inrSearchProvisioning";
import { buildInrSearchPublicUrl, getInrSearchPublicStatus } from "@/lib/inrSearchPublic";
import { stripSiteTextFormattingPreserveLayout } from "@/lib/boosterFormatting";
import {
  MediaWorkspaceConsumptionError,
  resolveWorkspacePublicationConsumption,
  syncPublicationWorkspaceContext,
  type WorkspacePublicationConsumption,
} from "@/lib/mediaWorkspaceConsumption";
import { isLegacyMediaTransportCutoverEnabled } from "@/lib/mediaPipelineLegacyCutoverPolicy";
import { prepareBoosterImagesByChannelOnServer } from "@/lib/boosterImageServerPreparation";
import { prepareBoosterVideoVariantsOnServer } from "@/lib/boosterVideoVariantServer";
import { canPublishVideoSourceDirectly } from "@/lib/mediaVideoSourceCompatibility";
import {
  YOUTUBE_LONG_UPLOAD_THRESHOLD_SECONDS,
  getYoutubePublicationTypeForDuration,
  getVideoPublicationPolicy,
  normalizeYoutubeLongUploadsStatus,
  validateVideoDurationForChannel,
  validateVideoPublicationForChannel,
} from "@/lib/videoPublicationPolicy";
import {
  getGoogleBusinessVideoPreparationDecision,
} from "@/lib/googleBusinessMediaPolicy";
import { filterGoogleBusinessMediaUrls } from "@/lib/googleBusinessMediaProbe";
import {
  BOOSTER_ASYNC_CHANNEL_EVENT_TYPE,
  BOOSTER_ASYNC_CHANNEL_LOCK_TTL_MS,
  BOOSTER_ASYNC_CHANNEL_SCOPE,
  BOOSTER_ASYNC_JOB_EVENT_TYPE,
  finalizeAsyncPublicationIfReady,
  updateAsyncChannelEvent,
} from "@/lib/boosterAsyncPublication";
import { normalizeBoosterPublicationChannels } from "@/lib/boosterPublicationPolicy";
import { buildBoosterPublicationDispatchPlan } from "@/lib/boosterPublicationDispatchPlan";

import {
  EMPTY_IMAGE_FORMATS,
  IMMEDIATE_PUBLISH_DUPLICATE_LOOKAHEAD_MINUTES,
  PUBLISH_IDEMPOTENCY_SCOPE,
  PUBLISH_IDEMPOTENCY_TTL_MS,
  asRecord,
  buildAsyncPreparedImagePayloads,
  buildEditableImageAttachments,
  buildImmediateDuplicateMessage,
  buildPublishIdempotencyKey,
  buildPublishIdempotencyMetadata,
  buildQueuedPublicationSummary,
  buildResultsSummary,
  getRequiredImageFormatsForChannel,
  hasFinalImageGeometryDecision,
  isExpired,
  mergeImageFormats,
  normalizeChannelMediaMode,
  normalizeHashtag,
  normalizePublicationMediaType,
  normalizePublicHttpUrl,
  normalizeTiktokPublicationSettings,
  slugify,
  type ChannelKey,
  type ChannelMediaMode,
  type ImagePayload,
  type ImageSet,
  type ImagesByChannel,
  type JsonRecord,
  type PersistedVideoAttachment,
  type PostByChannel,
  type PostPayload,
} from "./publishNow.foundations";

import {
  buildInstagramPublishTokenCandidates,
  getLatestIntegrationRow,
  isGoogleBusinessImageError,
  normalizeVideoPayload,
  uploadImageSet,
} from "./publishNow.server-preparation";

import {
  createPublishNowImageContext,
  createPublishNowPostResolver,
  createPublishNowVideoContext,
} from "./publishNow.channel-context";

export const runtime = "nodejs";
export const maxDuration = 180;

function requiresPreparedNetworkVideoVariant(channel: ChannelKey) {
  return !["inrcy_site", "site_web", "inr_search"].includes(channel);
}

async function publishNowHandler(req: Request) {
  let lifecycleWorkspaceId = "";
  let lifecycleUserId = "";
  let publishIdempotencyLockId: string | null = null;
  let shouldFailPublishIdempotencyLockOnError = false;
  let asyncFailureContext: {
    userId: string;
    publicationId: string;
    channel: ChannelKey;
    channelEventId: string;
    channelLockId: string | null;
  } | null = null;
  try {
    const cronUserId = isAuthorizedCronRequest(req)
      ? getCronUserIdFromRequest(req)
      : "";
    let userId = cronUserId;

    if (!userId) {
      const { user, errorResponse, activeUserId } = await requireUser();
      if (errorResponse) return errorResponse;
      userId = activeUserId;

      const rl = await enforceRateLimit({
        name: "booster_publish",
        identifier: userId,
        limit: 20,
        window: "1 m",
        failClosed: false,
        fallbackLimit: 5,
      });
      if (rl) return rl;
    }

    const body = await req.json().catch(() => null);
    if (!body)
      return NextResponse.json(
        { error: "Données invalides." },
        { status: 400 },
      );

    const internalAsyncRequested = body._asyncChannelDispatch === true;
    const internalAsyncDispatch =
      internalAsyncRequested && Boolean(cronUserId) && isAuthorizedCronRequest(req);
    if (internalAsyncRequested && !internalAsyncDispatch) {
      return NextResponse.json(
        { ok: false, code: "async_dispatch_unauthorized", error: "Dispatch interne non autorisé." },
        { status: 401 },
      );
    }
    const asyncPublicationId = cleanExecutionIdempotencyKey(
      body._asyncPublicationId,
    );
    const asyncChannelEventId = cleanExecutionIdempotencyKey(
      body._asyncChannelEventId,
    );

    const normalizedChannels = normalizeBoosterPublicationChannels(
      body.channels,
    );
    const post = (body.post || {}) as PostPayload;
    const postByChannel = ((body.postByChannel || {}) as PostByChannel) || {};
    const idea = String(body.idea || "").trim();
    const selected = normalizedChannels.channels;
    if (normalizedChannels.invalidChannels.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          code: "unsupported_channel",
          retryable: false,
          error: "Un ou plusieurs canaux de publication ne sont pas pris en charge.",
          invalidChannels: normalizedChannels.invalidChannels,
        },
        { status: 400 },
      );
    }
    if (
      internalAsyncDispatch &&
      (selected.length !== 1 || !asyncPublicationId || !asyncChannelEventId)
    ) {
      return NextResponse.json(
        {
          ok: false,
          code: "async_dispatch_invalid",
          error: "Le dispatch interne doit cibler exactement un canal existant.",
        },
        { status: 400 },
      );
    }
    if (!selected.length) {
      return NextResponse.json(
        {
          ok: false,
          code: "channels_required",
          retryable: false,
          error: "Sélectionnez au moins 1 canal.",
        },
        { status: 400 },
      );
    }
    const mediaWorkspaceId = String(body.mediaWorkspaceId || "").trim();
    const strictMediaCutover =
      body.mediaPipelineCutoverV1 === true &&
      isLegacyMediaTransportCutoverEnabled();
    lifecycleWorkspaceId = mediaWorkspaceId;
    lifecycleUserId = userId;

    const requestedOriginSource = String(
      body.source || body.origin?.source || "",
    )
      .trim()
      .toLowerCase();
    const workspacePurpose = internalAsyncDispatch
      ? body._asyncWorkspacePurpose === "schedule"
        ? "schedule"
        : "publish"
      : Boolean(cronUserId) ||
          requestedOriginSource === "booster_scheduled" ||
          Boolean(body.origin?.scheduledActionId)
        ? "schedule"
        : "publish";
    let workspaceConsumption: WorkspacePublicationConsumption | null = null;
    let workspaceFallbackCode = "";

    if (mediaWorkspaceId) {
      try {
        workspaceConsumption = await resolveWorkspacePublicationConsumption({
          accountId: userId,
          workspaceId: mediaWorkspaceId,
          purpose: workspacePurpose,
        });
      } catch (workspaceError) {
        workspaceFallbackCode =
          workspaceError instanceof MediaWorkspaceConsumptionError
            ? workspaceError.code
            : "workspace_read_failed";
        console.warn("[booster-publish] workspace media fallback", {
          workspaceId: mediaWorkspaceId,
          purpose: workspacePurpose,
          code: workspaceFallbackCode,
          message:
            workspaceError instanceof Error
              ? workspaceError.message
              : String(workspaceError || "Erreur inconnue"),
        });
        if (strictMediaCutover) {
          const status =
            workspaceError instanceof MediaWorkspaceConsumptionError
              ? workspaceError.status
              : 503;
          return NextResponse.json(
            {
              ok: false,
              code: workspaceFallbackCode,
              error:
                workspaceError instanceof Error
                  ? workspaceError.message
                  : "Le workspace média n'est pas prêt. Réessayez dans quelques instants.",
            },
            { status },
          );
        }
      }
    }

    const requestedMediaType = normalizePublicationMediaType(body.mediaType);
    const rawRequestedModes = asRecord(body.mediaModeByChannel);
    const requestContainsMedia = selected.some((channel) => {
      const mode = String(rawRequestedModes[channel] || requestedMediaType).trim();
      return mode === "images" || mode === "video";
    });
    if (strictMediaCutover && requestContainsMedia && !mediaWorkspaceId) {
      return NextResponse.json(
        {
          ok: false,
          code: "media_workspace_required",
          error: "Le workspace média est requis pour publier avec le nouveau pipeline.",
        },
        { status: 409 },
      );
    }

    let mediaType = requestedMediaType;
    if (workspaceConsumption?.mediaType === "video") mediaType = "video";
    if (workspaceConsumption?.mediaType === "images") mediaType = "images";

    const bubbleAccess = await getAppBubbleAccessMapForUser(
      supabaseAdmin as any,
      userId,
    );
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
    const preflightFailuresByChannel: Partial<
      Record<ChannelKey, JsonRecord>
    > = {};
    const setPreflightFailure = (
      channel: ChannelKey,
      failure: {
        code: string;
        error: string;
        retryable?: boolean;
        [key: string]: unknown;
      },
    ) => {
      if (preflightFailuresByChannel[channel]) return;
      preflightFailuresByChannel[channel] = {
        ok: false,
        retryable: failure.retryable !== false,
        ...failure,
      };
    };
    const videoSettingsByChannel = buildVideoSettingsByChannel({
      channels: selected,
      videoSettingsByChannel: body.videoSettingsByChannel,
      videoFormatByChannel: body.videoFormatByChannel,
      videoAdaptationModeByChannel: body.videoAdaptationModeByChannel,
    });
    const tiktokPublicationSettings = normalizeTiktokPublicationSettings(
      body.tiktokPublicationSettings,
    );
    const pinterestPublicationSettings = asRecord(
      body.pinterestPublicationSettings,
    );
    const requestedPinterestBoardId = String(
      pinterestPublicationSettings.boardId ||
        pinterestPublicationSettings.board_id ||
        "",
    ).trim();
    const requestedPinterestBoardName = String(
      pinterestPublicationSettings.boardName ||
        pinterestPublicationSettings.board_name ||
        "",
    ).trim();
    const hasAnyImageChannel = selected.some(
      (channel) => mediaModeByChannel[channel] === "images",
    );
    const hasAnyVideoChannel = selected.some(
      (channel) => mediaModeByChannel[channel] === "video",
    );

    if (strictMediaCutover) {
      selected.forEach((channel) => {
        const expectedMode = mediaModeByChannel[channel];
        if (
          expectedMode !== "images" &&
          expectedMode !== "video"
        ) {
          return;
        }
        if (workspaceConsumption?.mediaType === expectedMode) return;
        setPreflightFailure(channel, {
          code: "workspace_media_mismatch",
          error:
            workspaceConsumption?.mediaType === "none"
              ? "Le média est encore absent du workspace. Réessayez dans quelques instants."
              : "Le type de média du workspace ne correspond plus à ce canal.",
        });
      });
    }

    let images = hasAnyImageChannel
      ? ((Array.isArray(body.images) ? body.images : []) as ImagePayload[])
      : [];
    if (
      hasAnyImageChannel &&
      workspaceConsumption?.mediaType === "images" &&
      workspaceConsumption.images.length
    ) {
      images = workspaceConsumption.images;
    }

    let imagesByChannel = hasAnyImageChannel
      ? (((body.imagesByChannel || {}) as ImagesByChannel) || {})
      : {};
    let imageSettingsByChannel = hasAnyImageChannel
      ? ((body.imageSettingsByChannel || {}) as Record<string, unknown>)
      : {};

    if (
      strictMediaCutover &&
      hasAnyImageChannel &&
      workspaceConsumption?.mediaType === "images"
    ) {
      const imageChannels = selected.filter(
        (channel) => mediaModeByChannel[channel] === "images",
      );
      const serverPreparation = await prepareBoosterImagesByChannelOnServer({
        accountId: userId,
        workspaceId: mediaWorkspaceId,
        channels: imageChannels,
        images: workspaceConsumption.images,
        settingsByChannel: imageSettingsByChannel as any,
      });
      imagesByChannel = serverPreparation.imagesByChannel as ImagesByChannel;
      imageSettingsByChannel = serverPreparation.imageSettingsByChannel;
      imageChannels.forEach((channel) => {
        if (
          Array.isArray(imagesByChannel[channel]) &&
          imagesByChannel[channel]?.length
        ) {
          return;
        }
        setPreflightFailure(channel, {
          code: "workspace_image_preparation_failed",
          error: "Les images du workspace n'ont pas pu être préparées pour ce canal.",
          warnings: serverPreparation.warnings,
        });
      });
    }

    const legacyVideoResult = hasAnyVideoChannel && !strictMediaCutover
      ? await normalizeVideoPayload(body.video)
      : {
          video: null as PersistedVideoAttachment | null,
          error: undefined as string | undefined,
        };
    let publicationVideo = legacyVideoResult.video;
    let videoPayloadError = legacyVideoResult.error;

    if (
      hasAnyVideoChannel &&
      workspaceConsumption?.mediaType === "video" &&
      workspaceConsumption.video
    ) {
      const workspaceVideoResult = await normalizeVideoPayload(
        workspaceConsumption.video,
      );
      if (workspaceVideoResult.video) {
        publicationVideo = {
          ...workspaceVideoResult.video,
          thumbnailUrl:
            workspaceVideoResult.video.thumbnailUrl ||
            legacyVideoResult.video?.thumbnailUrl ||
            null,
          thumbnailStoragePath:
            workspaceVideoResult.video.thumbnailStoragePath ||
            legacyVideoResult.video?.thumbnailStoragePath ||
            null,
          thumbnailBucket:
            workspaceVideoResult.video.thumbnailBucket ||
            legacyVideoResult.video?.thumbnailBucket ||
            null,
          transformedVariants: strictMediaCutover
            ? []
            : legacyVideoResult.video?.transformedVariants || [],
        };
        videoPayloadError = undefined;
      } else if (!publicationVideo) {
        videoPayloadError = workspaceVideoResult.error;
      }
    }

    if (
      publicationVideo &&
      selected.includes("youtube_shorts") &&
      mediaModeByChannel.youtube_shorts === "video"
    ) {
      videoSettingsByChannel.youtube_shorts =
        getAutomaticVideoSettingsForPublication({
          channel: "youtube_shorts",
          settings: videoSettingsByChannel.youtube_shorts,
          durationSeconds: publicationVideo.duration,
        });
    }

    if (strictMediaCutover && hasAnyVideoChannel && publicationVideo) {
      const sourceWidth = Number(publicationVideo.sourceMetadata?.width || 0) || null;
      const sourceHeight = Number(publicationVideo.sourceMetadata?.height || 0) || null;
      const videoVariantRequest = selected
        .filter((channel) => mediaModeByChannel[channel] === "video")
        .flatMap((channel) => {
          if (channel === "gmb") {
            const decision = getGoogleBusinessVideoPreparationDecision({
              name: publicationVideo?.name,
              type: publicationVideo?.type,
              storagePath: publicationVideo?.storagePath,
              sizeBytes: publicationVideo?.size,
              durationSeconds: publicationVideo?.duration,
              width: sourceWidth,
              height: sourceHeight,
            });
            if (decision.action === "block") {
              setPreflightFailure("gmb", {
                code: decision.errorCode,
                error: decision.errorMessage,
                retryable: false,
              });
              return [];
            }
          }
          return [{
            key: `${channel}-${videoSettingsByChannel[channel]?.format || "original"}-${videoSettingsByChannel[channel]?.adaptationMode || "safe_frame"}`,
            channel: channel as any,
            format: videoSettingsByChannel[channel]?.format,
            adaptationMode: videoSettingsByChannel[channel]?.adaptationMode,
            publicationProfile: getVideoPublicationProfileForChannel(channel as any),
          }];
        });
      const videoSource = publicationVideo;
      const preparePublicationVariants = async (generateMissing: boolean) =>
        await prepareBoosterVideoVariantsOnServer({
          accountId: userId,
          workspaceId: mediaWorkspaceId,
          mediaId: videoSource.mediaId || undefined,
          generateMissing,
          source: {
            bucket: videoSource.bucket || "booster",
            storagePath: videoSource.storagePath,
            publicUrl: videoSource.publicUrl,
            url: videoSource.url,
            name: videoSource.name,
            type: videoSource.type,
            size: videoSource.size,
            duration: videoSource.duration,
            sourceMetadata: videoSource.sourceMetadata,
          },
          variants: videoVariantRequest,
        });

      const collectInvalidVideoChannels = (
        candidateResult: Awaited<ReturnType<typeof preparePublicationVariants>>,
      ) =>
        videoVariantRequest.flatMap((request) => {
          const signature = buildVideoTransformSignature(
            request.format || "original",
            request.adaptationMode || "safe_frame",
            request.publicationProfile,
          );
          const variant = candidateResult.variants.find(
            (candidate) => candidate.signature === signature,
          );
          const sourceValidation = validateVideoPublicationForChannel({
            channel: request.channel,
            name: videoSource.name || "video.mp4",
            type: videoSource.type,
            storagePath: videoSource.storagePath,
            sizeBytes: videoSource.size,
            durationSeconds: videoSource.duration,
            width: videoSource.sourceMetadata?.width,
            height: videoSource.sourceMetadata?.height,
          });
          if (!variant?.publicUrl || !variant?.storagePath) {
            if (
              sourceValidation.ok &&
              !requiresPreparedNetworkVideoVariant(request.channel)
            ) {
              return [];
            }
            return [{
              channel: request.channel,
              signature,
              reason: sourceValidation.ok
                ? "video_variant_required"
                : sourceValidation.reason,
              message: sourceValidation.ok
                ? "La variante MP4/H.264, AAC, 30 fps et dimensions réseau doit être prête avant publication."
                : sourceValidation.message,
            }];
          }
          const validation = validateVideoPublicationForChannel({
            channel: request.channel,
            name: variant.name || `video-${request.channel}.mp4`,
            type: variant.contentType,
            storagePath: variant.storagePath,
            sizeBytes: variant.size,
            durationSeconds: variant.duration ?? videoSource.duration,
            width: variant.width,
            height: variant.height,
          });
          if (validation.ok) return [];
          if (
            sourceValidation.ok &&
            !requiresPreparedNetworkVideoVariant(request.channel)
          ) {
            return [];
          }
          return [{
            channel: request.channel,
            signature,
            reason: validation.reason,
            message: validation.message,
          }];
        });

      // Publication is a latency-sensitive dispatch path. Heavy FFmpeg work is
      // prepared by the media workspace beforehand; a cold/missing derivative
      // becomes a retryable failure for that channel only. Generating up to
      // eight variants here could exceed the route's 180-second budget and
      // abort otherwise valid deliveries.
      const variantResult = await preparePublicationVariants(false);
      const invalidVideoChannels = collectInvalidVideoChannels(
        variantResult,
      );

      publicationVideo = {
        ...videoSource,
        transformedVariants: variantResult.variants,
      };
      invalidVideoChannels.forEach((invalid) => {
        const reason = String(
          invalid.reason || "workspace_video_preparation_pending",
        );
        setPreflightFailure(invalid.channel as ChannelKey, {
          code: reason,
          error:
            invalid.message ||
            "La vidéo est encore en cours de préparation pour ce canal. Patientez quelques instants puis relancez la publication.",
          retryable: ![
            "video_duration_too_long",
            "video_duration_too_short",
            "video_duration_account_limit_unknown",
            "video_duration_long_upload_not_allowed",
          ].includes(reason),
          signature: invalid.signature,
          preparationErrors: variantResult.errors,
        });
      });
    }

    const {
      getPublicationVideoForChannel,
      buildPublicationVideoByChannel,
    } = createPublishNowVideoContext({
      publicationVideo,
      videoSettingsByChannel,
      selected,
      mediaModeByChannel,
    });

    if (!strictMediaCutover && hasAnyVideoChannel && publicationVideo) {
      const invalidLegacyVideoChannels = selected
        .filter((channel) => mediaModeByChannel[channel] === "video")
        .flatMap((channel) => {
          if (channel === "gmb") {
            const decision = getGoogleBusinessVideoPreparationDecision({
              name: publicationVideo?.name,
              type: publicationVideo?.type,
              storagePath: publicationVideo?.storagePath,
              sizeBytes: publicationVideo?.size,
              durationSeconds: publicationVideo?.duration,
              width: publicationVideo?.sourceMetadata?.width,
              height: publicationVideo?.sourceMetadata?.height,
            });
            if (decision.action === "block") {
              setPreflightFailure("gmb", {
                code: decision.errorCode,
                error: decision.errorMessage,
                retryable: false,
              });
              return [];
            }
          }
          const settings = videoSettingsByChannel[channel];
          const profile = getVideoPublicationProfileForChannel(channel as any);
          const signature = settings
            ? buildVideoTransformSignature(
                settings.format,
                settings.adaptationMode,
                profile,
              )
            : "";
          const variant = settings
            ? publicationVideo.transformedVariants?.find(
                (candidate) => candidate.signature === signature,
              )
            : null;
          const variantValidation = variant?.publicUrl && variant?.storagePath
            ? validateVideoPublicationForChannel({
                channel,
                name: variant.name || `video-${channel}.mp4`,
                type: variant.contentType,
                storagePath: variant.storagePath,
                sizeBytes: variant.size,
                durationSeconds: variant.duration ?? publicationVideo.duration,
                width: variant.width,
                height: variant.height,
              })
            : null;
          if (variantValidation?.ok) return [];

          const policy = getVideoPublicationPolicy(channel);
          const sourceValidation = validateVideoPublicationForChannel({
            channel,
            name: publicationVideo.name,
            type: publicationVideo.type,
            storagePath: publicationVideo.storagePath,
            sizeBytes: publicationVideo.size,
            durationSeconds: publicationVideo.duration,
            width: publicationVideo.sourceMetadata?.width,
            height: publicationVideo.sourceMetadata?.height,
          });
          const sourceDirectlyPublishable =
            canPublishVideoSourceDirectly({
              name: publicationVideo.name,
              type: publicationVideo.type,
              storagePath: publicationVideo.storagePath,
              sizeBytes: publicationVideo.size,
              maxBytes: policy.maxBytes,
            }) && sourceValidation.ok;
          if (
            sourceDirectlyPublishable &&
            !requiresPreparedNetworkVideoVariant(channel)
          ) {
            return [];
          }

          const failedValidation =
            variantValidation && !variantValidation.ok
              ? variantValidation
              : sourceValidation;
          return [{
            channel,
            signature: signature || null,
            reason: failedValidation.ok
              ? "publishable_video_missing"
              : failedValidation.reason,
            message: failedValidation.ok
              ? "La variante vidéo demandée n’est pas encore prête."
              : failedValidation.message,
          }];
        });
      invalidLegacyVideoChannels.forEach((invalid) => {
        const reason = String(invalid.reason || "video_variant_required");
        setPreflightFailure(invalid.channel as ChannelKey, {
          code: reason,
          error:
            invalid.message ||
            "La vidéo doit être préparée en MP4 compatible avec les limites de ce canal avant publication.",
          retryable: ![
            "video_duration_too_long",
            "video_duration_too_short",
            "video_duration_account_limit_unknown",
            "video_duration_long_upload_not_allowed",
          ].includes(reason),
          signature: invalid.signature,
        });
      });
    }

    if (hasAnyVideoChannel && videoPayloadError) {
      selected
        .filter((channel) => mediaModeByChannel[channel] === "video")
        .forEach((channel) =>
          setPreflightFailure(channel, {
            code: "video_payload_invalid",
            error: videoPayloadError,
            retryable: false,
          }),
        );
    }
    if (hasAnyVideoChannel && !publicationVideo) {
      selected
        .filter((channel) => mediaModeByChannel[channel] === "video")
        .forEach((channel) =>
          setPreflightFailure(channel, {
            code: "video_required",
            error: "Ajoutez une vidéo avant de publier sur ce canal.",
            retryable: false,
          }),
        );
    }

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
    const originSource = String(
      body.source || body.origin?.source || "",
    ).trim();
    const origin = (() => {
      if (originSource === "inr_agent") {
        return {
          source: "inr_agent",
          label:
            String(body.origin?.label || "iNr'Agent").trim() || "iNr'Agent",
          agentActionId:
            String(
              body.inrAgentActionId || body.origin?.agentActionId || "",
            ).trim() || null,
          scheduledActionId:
            String(body.origin?.scheduledActionId || "").trim() || null,
          automationKey:
            String(
              body.automationKey || body.origin?.automationKey || "publish",
            ).trim() || "publish",
          workflowTool: eventModule,
          workflowAction,
        };
      }
      if (originSource === "booster_scheduled") {
        return {
          source: "booster_scheduled",
          label:
            String(body.origin?.label || "Booster programmé").trim() ||
            "Booster programmé",
          scheduledActionId:
            String(body.origin?.scheduledActionId || "").trim() || null,
          automationKey:
            String(body.origin?.automationKey || "publish").trim() || "publish",
          workflowTool: eventModule,
          workflowAction,
        };
      }
      if (originSource === "booster_manual" || originSource === "manual") {
        return {
          source: originSource,
          label:
            String(
              body.origin?.label ||
                (originSource === "booster_manual" ? "Booster" : "Manuel"),
            ).trim() || "Booster",
          workflowTool: eventModule,
          workflowAction,
        };
      }
      return null;
    })();
    const originRecord = asRecord(origin);
    const scheduledActionId = String(
      body.origin?.scheduledActionId || originRecord.scheduledActionId || "",
    ).trim();
    const isScheduledExecution =
      Boolean(cronUserId) ||
      origin?.source === "booster_scheduled" ||
      Boolean(origin?.source === "inr_agent" && scheduledActionId);
    const shouldCheckImmediateDuplicate =
      !internalAsyncDispatch &&
      eventType === "publish" &&
      !isScheduledExecution &&
      body.skipScheduledDuplicateCheck !== true &&
      body.allowDuplicateImmediatePublish !== true;

    const syncMediaWorkspaceLifecycle = async (
      status: "publishing" | "published" | "failed",
      metadata: Record<string, unknown> = {},
    ) => {
      if (!mediaWorkspaceId) return;
      await syncPublicationWorkspaceContext({
        accountId: userId,
        workspaceId: mediaWorkspaceId,
        operation: "publish",
        idea,
        selectedChannels: selected,
        generatedContent: { postByChannel },
        status,
        metadata: {
          executionSource: origin?.source || originSource || "manual",
          scheduledExecution: isScheduledExecution,
          consumptionSource: strictMediaCutover ? "workspace_cutover_v1" : workspaceConsumption?.source || "legacy_fallback",
          consumptionPurpose: workspacePurpose,
          workspaceRevisionRead: workspaceConsumption?.workspaceRevision || null,
          workspaceFallbackCode: workspaceFallbackCode || null,
          ...metadata,
        },
      }).catch((workspaceSyncError) => {
        console.warn("[booster-publish] workspace lifecycle sync skipped", {
          workspaceId: mediaWorkspaceId,
          status,
          message:
            workspaceSyncError instanceof Error
              ? workspaceSyncError.message
              : String(workspaceSyncError || "Erreur inconnue"),
        });
      });
    };

    if (shouldCheckImmediateDuplicate) {
      const duplicate = await findSimilarUpcomingScheduledPublication({
        supabase: supabaseAdmin,
        userId,
        channels: selected,
        payload: {
          ...body,
          channels: selected,
          post,
          postByChannel,
        },
        lookaheadMinutes: IMMEDIATE_PUBLISH_DUPLICATE_LOOKAHEAD_MINUTES,
      });

      if (duplicate.duplicate) {
        const duplicateMessage = buildImmediateDuplicateMessage(duplicate);
        return NextResponse.json(
          {
            ok: false,
            error: duplicateMessage,
            user_message: duplicateMessage,
            code: "scheduled_publication_duplicate",
            duplicate,
          },
          { status: 409 },
        );
      }
    }

    const publishIdempotencyKey = internalAsyncDispatch
      ? cleanExecutionIdempotencyKey(body._asyncParentIdempotencyKey)
      : buildPublishIdempotencyKey({ body, origin });
    const publishIdempotency = internalAsyncDispatch
      ? { state: "acquired" as const, lock: null }
      : publishIdempotencyKey
        ? await acquireExecutionIdempotencyLock({
            supabase: supabaseAdmin,
            userId,
            scope: PUBLISH_IDEMPOTENCY_SCOPE,
            idempotencyKey: publishIdempotencyKey,
            ttlMs: PUBLISH_IDEMPOTENCY_TTL_MS,
            metadata: buildPublishIdempotencyMetadata({
              origin,
              channels: selected,
              source: origin?.source || originSource || "",
            }),
          })
        : { state: "acquired" as const, lock: null };

    if (publishIdempotency.state === "completed") {
      return NextResponse.json(
        buildCompletedExecutionResponse(publishIdempotency.lock),
      );
    }

    if (publishIdempotency.state === "running") {
      return NextResponse.json(
        buildRunningExecutionResponse(publishIdempotency.lock),
        {
          status: 425,
          headers: { "Retry-After": "60" },
        },
      );
    }

    publishIdempotencyLockId = internalAsyncDispatch
      ? cleanExecutionIdempotencyKey(body._asyncParentIdempotencyLockId) || null
      : publishIdempotency.lock?.id || null;
    shouldFailPublishIdempotencyLockOnError =
      !internalAsyncDispatch && Boolean(publishIdempotencyLockId);

    const hadAnyImageInput =
      hasAnyImageChannel &&
      (images.length > 0 ||
        workspaceConsumption?.mediaType === "images" ||
        Object.values(imagesByChannel).some(
          (value) => Array.isArray(value) && value.length > 0,
        ));

    const publicationId = internalAsyncDispatch
      ? asyncPublicationId
      : randomUUID();
    const publicationVideoByChannel = buildPublicationVideoByChannel();

    const getChannelPost = createPublishNowPostResolver({
      post,
      postByChannel,
    });

    const firstPost = getChannelPost(selected[0]);

    if (!internalAsyncDispatch) {
      await syncMediaWorkspaceLifecycle("publishing", {
        publicationId,
        attemptedChannels: selected,
      });
    }

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
      strictMediaCutover ? [] : images,
      selectedImageFormats,
    );
    const uploadedUrls = baseImageSet.images;
    const publishableUrls = baseImageSet.publishableUrls;
    const instagramPublishableUrls = baseImageSet.instagramPublishableUrls;
    const socialFeedPublishableUrls = baseImageSet.socialFeedPublishableUrls;
    const siteCardPublishableUrls = baseImageSet.siteCardPublishableUrls;
    const gmbPublishableUrls = baseImageSet.gmbPublishableUrls;

    const originalSourceUrlByKey = new Map<string, string>();
    (baseImageSet.imageKeys || []).forEach((key, index) => {
      const normalizedKey = String(key || "").trim();
      const url = String(baseImageSet.images[index] || "").trim();
      if (normalizedKey && url) originalSourceUrlByKey.set(normalizedKey, url);
    });

    const channelImageSets: Partial<Record<ChannelKey, ImageSet>> = {};
    for (const channel of selected) {
      const rawChannelImages = Array.isArray(imagesByChannel?.[channel])
        ? (imagesByChannel[channel] as ImagePayload[])
        : [];
      const channelImagesToUpload = rawChannelImages.slice(0, 5);
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
          originalSourceUrlByKey,
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
      const imageFailureMessage =
        "Les images sélectionnées n'ont pas pu être envoyées. Merci de réessayer.";
      selected
        .filter((channel) => mediaModeByChannel[channel] === "images")
        .forEach((channel) =>
          setPreflightFailure(channel, {
            code: "image_upload_failed",
            error: imageFailureMessage,
            uploadErrors,
          }),
        );
    }
    const channelPreflightPlan = buildBoosterPublicationDispatchPlan(
      selected,
      preflightFailuresByChannel as Partial<
        Record<
          ChannelKey,
          { ok: false; code: string; error: string; [key: string]: unknown }
        >
      >,
    );
    if (!internalAsyncDispatch) {
      // 2) Persist publication
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
      if (hasAnyVideoChannel && publicationVideo) {
        publicationInsert.media_type = "video";
        publicationInsert.video_url = publicationVideo.publicUrl;
        publicationInsert.video_path = publicationVideo.storagePath;
        publicationInsert.video_mime = publicationVideo.type;
        publicationInsert.video_size = publicationVideo.size;
        publicationInsert.video_duration_seconds = publicationVideo.duration;
        publicationInsert.video_thumbnail_url = publicationVideo.thumbnailUrl;
        publicationInsert.media_metadata = {
          video: publicationVideo,
          videoByChannel: publicationVideoByChannel,
        };
      }

      const { error: pubErr } = await supabaseAdmin
        .from("publications")
        .insert(publicationInsert);

      if (pubErr) {
        await syncMediaWorkspaceLifecycle("failed", {
          publicationId,
          failureStage: "publication_insert",
        });
        await failExecutionIdempotencyLock({
          supabase: supabaseAdmin,
          lockId: publishIdempotencyLockId,
          error: "Publication insert failed",
          result: { publicationId, detail: pubErr.message || null },
          metadata: { stage: "publication_insert" },
        });
        shouldFailPublishIdempotencyLockOnError = false;
        return NextResponse.json(
          {
            error: "Impossible d'enregistrer la publication pour le moment.",
            uploadErrors,
          },
          { status: 500 },
        );
      }

      await invalidateBoosterGenerationContext(userId, "publications");

      // 3) Create deliveries
      const deliveries = channelPreflightPlan.entries.map((entry) => ({
        id: randomUUID(),
        publication_id: publicationId,
        user_id: userId,
        channel: entry.channel,
        status: entry.status,
        error: entry.result
          ? String(entry.result.error || "Échec du préflight média.")
          : null,
      }));

      const { error: deliveriesError } = await supabaseAdmin
        .from("publication_deliveries")
        .insert(deliveries);
      if (deliveriesError) {
        await failExecutionIdempotencyLock({
          supabase: supabaseAdmin,
          lockId: publishIdempotencyLockId,
          error: "Publication deliveries insert failed",
          result: { publicationId, detail: deliveriesError.message || null },
          metadata: { stage: "delivery_insert" },
        });
        shouldFailPublishIdempotencyLockOnError = false;
        return NextResponse.json(
          {
            ok: false,
            error: "Impossible de préparer les canaux de publication.",
          },
          { status: 500 },
        );
      }

      const asyncSecret = getCronSecret();
      if (asyncSecret) {
        const persistedPostByChannelForAsync = Object.fromEntries(
          selected.map((channel) => {
            const rawBaseValue = (postByChannel as Record<string, unknown>)[
              channel
            ] as Record<string, unknown> | undefined;
            const baseValue = {
              ...(rawBaseValue || {}),
              ...getChannelPost(channel),
            };
            const channelPersistedVideo =
              mediaModeByChannel[channel] === "video"
                ? getPublicationVideoForChannel(channel)
                : null;

            if (mediaModeByChannel[channel] === "video" && channelPersistedVideo) {
              return [
                channel,
                {
                  ...baseValue,
                  images: [],
                  attachments: [channelPersistedVideo],
                  video: channelPersistedVideo,
                  sourceVideo: publicationVideo,
                  mediaMode: "video",
                  videoSettings: videoSettingsByChannel[channel] || null,
                  videoFormat: videoSettingsByChannel[channel]?.format || null,
                  videoAdaptationMode:
                    videoSettingsByChannel[channel]?.adaptationMode || null,
                },
              ];
            }

            if (mediaModeByChannel[channel] === "none") {
              return [
                channel,
                {
                  ...baseValue,
                  images: [],
                  attachments: [],
                  mediaMode: "none",
                  videoSettings: videoSettingsByChannel[channel] || null,
                },
              ];
            }

            const imageSet = channelImageSets[channel] || baseImageSet;
            return [
              channel,
              {
                ...baseValue,
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
              },
            ];
          }),
        );

        const preparedImagesByChannel = Object.fromEntries(
          selected
            .filter((channel) => mediaModeByChannel[channel] === "images")
            .map((channel) => {
              const rawChannelImages = Array.isArray(imagesByChannel[channel])
                ? (imagesByChannel[channel] as ImagePayload[])
                : images;
              const imageSet = channelImageSets[channel] || baseImageSet;
              return [
                channel,
                buildAsyncPreparedImagePayloads(
                  channel,
                  rawChannelImages,
                  imageSet,
                ),
              ];
            }),
        ) as ImagesByChannel;

        const channelEventIds = Object.fromEntries(
          selected.map((channel) => [channel, randomUUID()]),
        ) as Record<ChannelKey, string>;
        const finalPayloadBase = {
          workflowTool: eventModule,
          workflowAction,
          ...(origin ? { origin, source: origin.source } : {}),
          mediaType,
          mediaModeByChannel,
          videoSettingsByChannel,
          video: hasAnyVideoChannel ? publicationVideo : null,
          videoByChannel: publicationVideoByChannel,
          idea,
          post: firstPost,
          postByChannel: persistedPostByChannelForAsync,
          imageSettingsByChannel,
          images: uploadedUrls,
          publishableUrls,
          instagramPublishableUrls,
          socialFeedPublishableUrls,
          siteCardPublishableUrls,
          gmbPublishableUrls,
          uploadErrors,
          publication_id: publicationId,
          mediaWorkspaceId: mediaWorkspaceId || null,
          mediaWorkspaceRevision: workspaceConsumption?.workspaceRevision || null,
          mediaWorkspaceConsumptionSource:
            strictMediaCutover
              ? "workspace_cutover_v1"
              : workspaceConsumption?.source || "legacy_fallback",
          idempotencyKey: publishIdempotencyKey || null,
          idempotencyLockId: publishIdempotencyLockId || null,
        };

        const parentPayload = {
          status: "queued",
          asyncVersion: 1,
          publication_id: publicationId,
          channels: selected,
          channelEventIds,
          finalEventType: eventType,
          finalPayloadBase,
          mediaWorkspaceId: mediaWorkspaceId || null,
          parentIdempotencyLockId: publishIdempotencyLockId || null,
          parentIdempotencyKey: publishIdempotencyKey || null,
          createdAt: new Date().toISOString(),
        };

        const channelRows = selected.map((channel) => {
          const preflightFailure = preflightFailuresByChannel[channel] || null;
          const channelDispatchRequest = {
            ...body,
            channels: [channel],
            mediaWorkspaceId: undefined,
            mediaWorkspaceClientKey: undefined,
            mediaPipelineCutoverV1: false,
            mediaType,
            mediaModeByChannel: {
              [channel]: mediaModeByChannel[channel],
            },
            videoSettingsByChannel: {
              [channel]: videoSettingsByChannel[channel],
            },
            videoFormatByChannel: {
              [channel]: videoSettingsByChannel[channel]?.format,
            },
            videoAdaptationModeByChannel: {
              [channel]: videoSettingsByChannel[channel]?.adaptationMode,
            },
            video: publicationVideo,
            images: [],
            imagesByChannel: {
              [channel]: preparedImagesByChannel[channel] || [],
            },
            imageSettingsByChannel: {
              [channel]: imageSettingsByChannel[channel],
            },
            skipScheduledDuplicateCheck: true,
            _asyncChannelDispatch: true,
            _asyncPublicationId: publicationId,
            _asyncChannelEventId: channelEventIds[channel],
            _asyncParentEventId: publicationId,
            _asyncParentIdempotencyLockId: publishIdempotencyLockId || null,
            _asyncParentIdempotencyKey: publishIdempotencyKey || null,
            _asyncWorkspacePurpose: workspacePurpose,
          };
          return {
            id: channelEventIds[channel],
            user_id: userId,
            module: eventModule,
            type: BOOSTER_ASYNC_CHANNEL_EVENT_TYPE,
            payload: preflightFailure
              ? {
                  status: "failed",
                  publication_id: publicationId,
                  parentEventId: publicationId,
                  channel,
                  attempt: 0,
                  result: preflightFailure,
                  completedAt: new Date().toISOString(),
                  createdAt: new Date().toISOString(),
                }
              : {
                  status: "queued",
                  publication_id: publicationId,
                  parentEventId: publicationId,
                  channel,
                  attempt: 0,
                  dispatchRequest: channelDispatchRequest,
                  createdAt: new Date().toISOString(),
                },
          };
        });

        const { error: asyncJobError } = await supabaseAdmin
          .from("app_events")
          .insert([
            {
              id: publicationId,
              user_id: userId,
              module: eventModule,
              type: BOOSTER_ASYNC_JOB_EVENT_TYPE,
              payload: parentPayload,
            },
            ...channelRows,
          ]);

        if (!asyncJobError) {
          const queuedChannelRows = channelRows.filter(
            (row) => asRecord(row.payload).status === "queued",
          );
          if (!queuedChannelRows.length) {
            const finalization = await finalizeAsyncPublicationIfReady({
              userId,
              publicationId,
            });
            const finalPayload = asRecord(finalization.payload);
            return NextResponse.json({
              ...finalPayload,
              ok: false,
              queued: false,
              asyncDispatch: true,
              publication_id: publicationId,
              results:
                finalPayload.results ||
                Object.fromEntries(
                  selected.map((channel) => [
                    channel,
                    preflightFailuresByChannel[channel],
                  ]),
                ),
              summary:
                finalPayload.summary ||
                buildResultsSummary(
                  preflightFailuresByChannel as Record<string, unknown>,
                  selected,
                ),
            });
          }
          const appOrigin = getAppOriginFromRequest(req);
          const internalHeaders = buildInternalCronHeaders(userId);
          after(async () => {
            await Promise.allSettled(
              queuedChannelRows.map(async (row) => {
                const dispatchRequest = asRecord(row.payload).dispatchRequest;
                try {
                  await fetch(`${appOrigin}/api/booster/publish-now`, {
                    method: "POST",
                    headers: internalHeaders,
                    body: JSON.stringify(dispatchRequest),
                    cache: "no-store",
                  });
                } catch (dispatchError) {
                  console.warn("[booster-async] initial channel dispatch failed", {
                    publicationId,
                    channel: asRecord(row.payload).channel,
                    message:
                      dispatchError instanceof Error
                        ? dispatchError.message
                        : String(dispatchError || ""),
                  });
                }
              }),
            );
          });

          const queuedSummaryBase = buildQueuedPublicationSummary(selected);
          const queuedSummary = {
            ...queuedSummaryBase,
            failureCount: selected.length - queuedChannelRows.length,
            pendingCount: queuedChannelRows.length,
            entries: queuedSummaryBase.entries.map((entry) => {
              const failure = preflightFailuresByChannel[entry.channel];
              return failure
                ? {
                    ...entry,
                    ok: false,
                    status: "failed",
                    code: String(failure.code || "media_preflight_failed"),
                    retryable: failure.retryable !== false,
                    error: String(failure.error || "Échec du préflight média."),
                  }
                : entry;
            }),
            failedChannels: selected.filter(
              (channel) => Boolean(preflightFailuresByChannel[channel]),
            ),
          };
          return NextResponse.json(
            {
              ok: true,
              queued: true,
              asyncDispatch: true,
              publication_id: publicationId,
              mediaType,
              mediaModeByChannel,
              videoSettingsByChannel,
              video: hasAnyVideoChannel ? publicationVideo : null,
              videoByChannel: publicationVideoByChannel,
              images: uploadedUrls,
              uploadErrors,
              results: Object.fromEntries(
                selected.map((channel) => [
                  channel,
                  preflightFailuresByChannel[channel] || {
                    ok: true,
                    queued: true,
                    status: "queued",
                  },
                ]),
              ),
              summary: queuedSummary,
              idempotencyKey: publishIdempotencyKey || null,
              mediaWorkspaceId: mediaWorkspaceId || null,
            },
            { status: 202 },
          );
        }

        console.error("[booster-async] job creation failed; synchronous fallback", {
          publicationId,
          error: asyncJobError.message,
        });
      }
    }

    // 4) Publish now
    const results: Record<string, unknown> = Object.fromEntries(
      selected.flatMap((channel) => {
        const failure = preflightFailuresByChannel[channel];
        return failure ? [[channel, failure] as const] : [];
      }),
    );
    let asyncChannelLockId: string | null = null;

    if (internalAsyncDispatch) {
      const channel = selected[0];
      const channelExecution = await acquireExecutionIdempotencyLock({
        supabase: supabaseAdmin,
        userId,
        scope: BOOSTER_ASYNC_CHANNEL_SCOPE,
        idempotencyKey: `${publicationId}:${channel}`,
        ttlMs: BOOSTER_ASYNC_CHANNEL_LOCK_TTL_MS,
        metadata: {
          publicationId,
          channel,
          channelEventId: asyncChannelEventId,
          asyncDispatch: true,
        },
      });

      if (channelExecution.state === "completed") {
        await finalizeAsyncPublicationIfReady({ userId, publicationId }).catch(
          () => undefined,
        );
        return NextResponse.json(
          buildCompletedExecutionResponse(channelExecution.lock),
        );
      }

      if (channelExecution.state === "running") {
        return NextResponse.json(
          {
            ...buildRunningExecutionResponse(channelExecution.lock),
            queued: true,
            asyncDispatch: true,
            publication_id: publicationId,
            channel,
          },
          { status: 425, headers: { "Retry-After": "60" } },
        );
      }

      asyncChannelLockId = channelExecution.lock?.id || null;
      asyncFailureContext = {
        userId,
        publicationId,
        channel,
        channelEventId: asyncChannelEventId,
        channelLockId: asyncChannelLockId,
      };
      const currentChannelEvent = await updateAsyncChannelEvent({
        userId,
        eventId: asyncChannelEventId,
        patch: {
          status: "processing",
          startedAt: new Date().toISOString(),
          channel,
        },
      });
      await updateAsyncChannelEvent({
        userId,
        eventId: asyncChannelEventId,
        patch: {
          attempt: Math.max(1, Number(asRecord(currentChannelEvent).attempt || 0) + 1),
        },
      });
      await supabaseAdmin
        .from("publication_deliveries")
        .update({ status: "processing", error: null })
        .eq("publication_id", publicationId)
        .eq("user_id", userId)
        .eq("channel", channel);
    }

    const [fbRow, gmbRow, igRow, liRow, tiktokRow, youtubeRow, pinterestRow] =
      await Promise.all([
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
        getLatestIntegrationRow(
          userId,
          "youtube",
          "youtube_shorts",
          "youtube_shorts",
          "status,resource_id,resource_label,display_name,email_address,access_token_enc,refresh_token_enc,scopes,meta,expires_at",
        ),
        getLatestIntegrationRow(
          userId,
          "pinterest",
          "pinterest",
          "pinterest",
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
    const proPinterest = asRecord(proSettings["pinterest"]);
    const configuredPinterestDefaultBoardId = String(
      proPinterest["defaultBoardId"] || "",
    ).trim();

    const ownership = String(profile["inrcy_site_ownership"] ?? "none");
    const businessPhone = String(profile["phone"] ?? "").trim();
    const inrcySiteUrl = String(inrcyCfg["site_url"] ?? "").trim();
    const siteWebUrl = String(proSiteWeb["url"] ?? "").trim();

    const {
      externalImageUrls,
      socialFeedImageUrls,
      instagramImageUrls,
      gmbImageUrls,
      getChannelImageSet,
      getExpectedChannelImageCount,
      pickCompleteChannelImageUrls,
    } = createPublishNowImageContext({
      publicationImageSet,
      channelImageSets,
      baseImageSet,
      imagesByChannel,
    });

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

    async function loadStorageVideoForTikTok(
      storagePath: string,
      bucket = "booster",
    ) {
      const cleanPath = String(storagePath || "").trim();
      const cleanBucket = String(bucket || "booster").trim() || "booster";
      if (!cleanPath) return null;
      const { data, error } = await supabaseAdmin.storage
        .from(cleanBucket)
        .download(cleanPath);
      if (error || !data) return null;
      const buffer = Buffer.from(await data.arrayBuffer());
      if (!buffer.length) return null;
      return {
        buffer,
        contentType: data.type || "application/octet-stream",
        size: buffer.length,
      };
    }

    async function getTiktokAccessToken(rowLike: unknown) {
      const row = asRecord(rowLike);
      let accessToken =
        tryDecryptToken(String(row.access_token_enc || "")) || "";
      const refreshToken =
        tryDecryptToken(String(row.refresh_token_enc || "")) || "";

      if (accessToken && !isExpired(row.expires_at, 120)) return accessToken;
      if (!refreshToken) return accessToken;

      const refreshed = await refreshTiktokAccessToken(refreshToken);
      const nextAccessToken = String(refreshed.access_token || "").trim();
      const nextRefreshToken =
        String(refreshed.refresh_token || "").trim() || refreshToken;
      const expiresIn = Number(refreshed.expires_in || 0);
      const refreshExpiresIn = Number(refreshed.refresh_expires_in || 0);
      const expiresAt =
        Number.isFinite(expiresIn) && expiresIn > 0
          ? new Date(Date.now() + expiresIn * 1000).toISOString()
          : null;
      const nextMeta = {
        ...asRecord(row.meta),
        refresh_expires_at:
          Number.isFinite(refreshExpiresIn) && refreshExpiresIn > 0
            ? new Date(Date.now() + refreshExpiresIn * 1000).toISOString()
            : asRecord(row.meta).refresh_expires_at || null,
        tiktok_token_refreshed_at: new Date().toISOString(),
      };

      if (nextAccessToken) {
        await supabaseAdmin
          .from("integrations")
          .update({
            access_token_enc: encryptToken(nextAccessToken),
            refresh_token_enc: nextRefreshToken
              ? encryptToken(nextRefreshToken)
              : row.refresh_token_enc || null,
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

    async function getYoutubeShortsAccessToken(rowLike: unknown) {
      const row = asRecord(rowLike);
      let accessToken =
        tryDecryptToken(String(row.access_token_enc || "")) || "";
      const refreshToken =
        tryDecryptToken(String(row.refresh_token_enc || "")) || "";

      if (accessToken && !isExpired(row.expires_at, 120)) return accessToken;
      if (!refreshToken) return accessToken;

      const refreshed = await refreshYoutubeShortsAccessToken(refreshToken);
      const nextAccessToken = String(refreshed.access_token || "").trim();
      if (!nextAccessToken) return accessToken;
      const expiresIn = Number(refreshed.expires_in || 0);
      const expiresAt =
        Number.isFinite(expiresIn) && expiresIn > 0
          ? new Date(Date.now() + expiresIn * 1000).toISOString()
          : row.expires_at || null;
      const nextMeta = {
        ...asRecord(row.meta),
        youtube_token_refreshed_at: new Date().toISOString(),
      };

      await supabaseAdmin
        .from("integrations")
        .update({
          access_token_enc: encryptToken(nextAccessToken),
          expires_at: expiresAt,
          meta: nextMeta,
        })
        .eq("user_id", userId)
        .eq("provider", "youtube")
        .eq("source", "youtube_shorts")
        .eq("product", "youtube_shorts");
      accessToken = nextAccessToken;
      return accessToken;
    }

    for (const ch of selected) {
      try {
        const preflightFailure = preflightFailuresByChannel[ch];
        if (preflightFailure) {
          await setDelivery(ch, {
            status: "failed",
            error: String(
              preflightFailure.error || "Le média n'est pas publiable sur ce canal.",
            ),
          });
          results[ch] = preflightFailure;
          continue;
        }
        if (ch === "pinterest" && !isBubbleEnabled(bubbleAccess, "pinterest")) {
          const disabledMessage = "Pinterest est désactivé dans Bubble Access.";
          await setDelivery(ch, { status: "failed", error: disabledMessage });
          results[ch] = {
            ok: false,
            error: disabledMessage,
            code: "bubble_access_disabled",
          };
          continue;
        }

        if (ch === "inr_search") {
          if (!isBubbleEnabled(bubbleAccess, "inr_search")) {
            const disabledMessage = "iNr'Search est désactivé dans Bubble Access.";
            await setDelivery(ch, { status: "failed", error: disabledMessage });
            results[ch] = { ok: false, error: disabledMessage, code: "bubble_access_disabled" };
            continue;
          }

          const provisioned = await ensureSystemManagedInrSearch(supabaseAdmin as any, userId);
          const publicStatus = await getInrSearchPublicStatus(provisioned.inrSearch.slug);
          if (!publicStatus.published) {
            const unavailableMessage = "La page iNr'Search n'est pas encore publiable.";
            await setDelivery(ch, { status: "failed", error: unavailableMessage });
            results[ch] = { ok: false, error: unavailableMessage, code: publicStatus.reason };
            continue;
          }

          await setDelivery(ch, { status: "delivered", error: null });
          results[ch] = {
            ok: true,
            internal: true,
            status: "published",
            external_url: buildInrSearchPublicUrl(provisioned.inrSearch.slug),
          };
          continue;
        }

        const channelPost = getChannelPost(ch);
        const canonMessage = buildBoosterMessage(ch, channelPost, {
          websiteUrl: siteWebUrl || inrcySiteUrl,
          phone: businessPhone,
        });
        const channelVideo =
          mediaModeByChannel[ch] === "video"
            ? getPublicationVideoForChannel(ch)
            : null;

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

          const legacySiteImageSet = getChannelImageSet(ch);
          const legacySiteImageUrls = legacySiteImageSet.images.length
            ? legacySiteImageSet.images
            : legacySiteImageSet.socialFeedPublishableUrls.length
              ? legacySiteImageSet.socialFeedPublishableUrls
              : legacySiteImageSet.siteCardPublishableUrls;
          const siteImageUrls =
            mediaModeByChannel[ch] === "images"
              ? pickCompleteChannelImageUrls({
                  channel: ch,
                  candidates: ["images", "publishableUrls"],
                  legacyFallback: legacySiteImageUrls,
                  limit: 5,
                })
              : [];
          if (
            mediaModeByChannel[ch] === "images" &&
            getExpectedChannelImageCount(ch) > 0 &&
            !siteImageUrls.length
          ) {
            const siteImageError =
              "Les images du site n'ont pas pu être préparées sans modifier le rendu.";
            await setDelivery(ch, { status: "failed", error: siteImageError });
            results[ch] = { ok: false, error: siteImageError };
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
              // For website embeds, keep the channel-specific prepared source.
              // Never borrow another channel's crop/ratio as a fallback.
              images: siteImageUrls,
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

          const facebookImageUrls = pickCompleteChannelImageUrls({
            channel: ch,
            candidates: [
              "socialFeedPublishableUrls",
              "publishableUrls",
              "images",
            ],
            legacyFallback: socialFeedImageUrls,
            limit: 5,
          });
          if (
            mediaModeByChannel[ch] === "images" &&
            getExpectedChannelImageCount(ch) > 0 &&
            !facebookImageUrls.length
          ) {
            const facebookUserError =
              "Les images Facebook n'ont pas pu être préparées sans modifier le rendu.";
            await setDelivery(ch, {
              status: "failed",
              error: facebookUserError,
            });
            results[ch] = { ok: false, error: facebookUserError };
            continue;
          }

          let facebookWarning: { code: string; message: string } | null = null;
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
                  imageUrls: facebookImageUrls,
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
              ...(resp.requestMayHaveSucceeded
                ? { code: "provider_status_unknown", retryable: false }
                : {}),
            };
            continue;
          }

          if (
            mediaModeByChannel[ch] === "images" &&
            facebookImageUrls.length > 0 &&
            Number(resp.failedImages || 0) > 0
          ) {
            facebookWarning = Number(resp.uploadedImages || 0) > 0
              ? {
                  code: "published_with_partial_images",
                  message:
                    "Facebook a publié uniquement les images acceptées. Une ou plusieurs images n'ont pas pu être jointes.",
                }
              : {
                  code: "published_without_image",
                  message:
                    "Facebook a publié le texte, mais aucune image n'a pu être jointe cette fois-ci.",
                };
          }

          await setDelivery(ch, {
            status: "delivered",
            error: null,
          });

          results[ch] = {
            ok: true,
            external_id: resp.postId,
            diagnostics: resp,
            ...(facebookWarning
              ? {
                  warning: facebookWarning.code,
                  warning_message: facebookWarning.message,
                }
              : {}),
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
            const instagramImages = pickCompleteChannelImageUrls({
              channel: ch,
              candidates: ["instagramPublishableUrls"],
              legacyFallback: instagramImageUrls,
              limit: 10,
            });
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

          await setDelivery(ch, {
            status: "delivered",
            error: null,
          });

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
          const linkedinSettings = asRecord(proSettings["linkedin"]);
          const shouldShareLinkedInPageToProfile =
            linkedinSettings["shareToPersonalProfile"] === true ||
            linkedinSettings["shareToPersonalProfile"] === "true" ||
            linkedinSettings["autoShareToPersonalProfile"] === true ||
            linkedinSettings["autoShareToPersonalProfile"] === "true";
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
          const linkedInImages = pickCompleteChannelImageUrls({
            channel: ch,
            candidates: [
              "socialFeedPublishableUrls",
              "publishableUrls",
              "images",
            ],
            legacyFallback: socialFeedImageUrls.length
              ? socialFeedImageUrls
              : externalImageUrls,
            limit: 20,
          });
          if (
            mediaModeByChannel[ch] === "images" &&
            getExpectedChannelImageCount(ch) > 0 &&
            !linkedInImages.length
          ) {
            const linkedInUserError =
              "Les images LinkedIn n'ont pas pu être préparées sans modifier le rendu.";
            await setDelivery(ch, {
              status: "failed",
              error: linkedInUserError,
            });
            results[ch] = { ok: false, error: linkedInUserError };
            continue;
          }

          const isLinkedInVideo = Boolean(
            mediaModeByChannel[ch] === "video" && channelVideo,
          );
          let linkedInWarning: { code: string; message: string } | null = null;
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

          if (
            !resp.ok &&
            !isLinkedInVideo &&
            linkedInImages.length > 0 &&
            resp.safeTextFallback === true
          ) {
            const mediaResp = resp;
            const fallbackResp = await linkedinPublishText({
              accessToken,
              authorUrn: useAuthor,
              text: canonMessage,
            });
            if (fallbackResp.ok) {
              linkedInWarning = {
                code: "published_without_image",
                message:
                  "LinkedIn a publié le texte, mais les images n'ont pas pu être jointes cette fois-ci.",
              };
              resp = {
                ...fallbackResp,
                diagnostics: {
                  mediaPublishError: mediaResp.error,
                  mediaPublishDiagnostics: mediaResp.diagnostics,
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
              ...(resp.requestMayHaveSucceeded
                ? { code: "provider_status_unknown", retryable: false }
                : {}),
            };
            continue;
          }

          let linkedInDiagnostics: any = resp;
          let linkedInPersonalShareUrn: string | null = null;
          const canSharePagePostToProfile = Boolean(
            shouldShareLinkedInPageToProfile &&
            orgUrn &&
            authorUrn &&
            resp.postUrn,
          );

          if (canSharePagePostToProfile) {
            const shareResp = await linkedinResharePost({
              accessToken,
              authorUrn,
              parentPostUrn: String(resp.postUrn),
            });
            if (shareResp.ok) {
              linkedInPersonalShareUrn = shareResp.postUrn || null;
              linkedInDiagnostics = {
                ...resp,
                personalProfileShare: shareResp,
              };
            } else {
              linkedInDiagnostics = {
                ...resp,
                personalProfileShare: {
                  ok: false,
                  error: shareResp.error,
                  diagnostics: shareResp.diagnostics,
                },
              };
              logPublishChannelFailure({
                route: "booster_publish_now",
                channel: "linkedin",
                userId,
                publicationId,
                stage: "share_to_profile",
                error: shareResp.error,
                userMessage:
                  "Publié sur la page LinkedIn. Le partage sur le profil personnel a échoué.",
                diagnostics: shareResp,
              });
            }
          } else if (shouldShareLinkedInPageToProfile) {
            linkedInDiagnostics = {
              ...resp,
              personalProfileShare: {
                ok: false,
                skipped: true,
                reason: !orgUrn
                  ? "no_organization_post"
                  : !authorUrn
                    ? "no_personal_profile_author"
                    : "missing_parent_post_urn",
              },
            };
          }

          await setDelivery(ch, {
            status: "delivered",
            error: null,
          });

          results[ch] = {
            ok: true,
            external_id: resp.postUrn || null,
            linkedin_personal_share_id: linkedInPersonalShareUrn,
            diagnostics: linkedInDiagnostics,
            ...(linkedInWarning
              ? {
                  warning: linkedInWarning.code,
                  warning_message: linkedInWarning.message,
                }
              : {}),
          };
          continue;
        }

        if (ch === "youtube_shorts") {
          const youtubeSettings = asRecord(proSettings["youtube_shorts"]);
          const youtubeActive = isYoutubeShortsIntegrationActive(youtubeRow);
          const youtubeAccessToken = youtubeActive
            ? await getYoutubeShortsAccessToken(youtubeRow)
            : "";
          const youtubeMeta = asRecord(asRecord(youtubeRow).meta);
          const channelUrl = String(
            youtubeMeta.channel_url ||
              youtubeSettings.channelUrl ||
              youtubeSettings.url ||
              "",
          ).trim();

          if (!youtubeActive || !youtubeAccessToken) {
            const youtubeUserError =
              "YouTube à connecter. Rendez-vous dans Canaux.";
            await setDelivery(ch, {
              status: "failed",
              error: youtubeUserError,
            });
            results[ch] = { ok: false, error: youtubeUserError };
            continue;
          }

          if (mediaModeByChannel[ch] !== "video" || !channelVideo) {
            const youtubeUserError = "YouTube nécessite une vidéo.";
            await setDelivery(ch, {
              status: "failed",
              error: youtubeUserError,
            });
            results[ch] = { ok: false, error: youtubeUserError };
            continue;
          }

          const youtubeDefaults = asRecord(youtubeSettings.defaults);
          const visibilityRaw = String(
            youtubeDefaults.defaultVisibility || "public",
          );
          const privacyStatus = (
            ["public", "unlisted", "private"].includes(visibilityRaw)
              ? visibilityRaw
              : "public"
          ) as "public" | "unlisted" | "private";
          const madeForKids = Boolean(youtubeDefaults.madeForKids);
          const youtubeDuration = Number(channelVideo.duration || 0);
          let youtubeLongUploadsStatus = normalizeYoutubeLongUploadsStatus(
            youtubeMeta.long_uploads_status,
          );
          if (
            Number.isFinite(youtubeDuration) &&
            youtubeDuration > YOUTUBE_LONG_UPLOAD_THRESHOLD_SECONDS
          ) {
            try {
              const channelInfo = await fetchYoutubeMineChannel(
                youtubeAccessToken,
              );
              youtubeLongUploadsStatus = normalizeYoutubeLongUploadsStatus(
                channelInfo?.longUploadsStatus,
              );
            } catch {
              youtubeLongUploadsStatus = "unknown";
            }
          }
          const youtubeDurationValidation =
            validateVideoDurationForChannel({
              channel: "youtube_shorts",
              durationSeconds: youtubeDuration,
              youtubeLongUploadsStatus,
              enforceAccountCapabilities: true,
            });
          if (!youtubeDurationValidation.ok) {
            await setDelivery(ch, {
              status: "failed",
              error: youtubeDurationValidation.message,
            });
            results[ch] = {
              ok: false,
              code: youtubeDurationValidation.reason,
              retryable: false,
              error: youtubeDurationValidation.message,
            };
            continue;
          }
          const youtubePublicationType =
            getYoutubePublicationTypeForDuration(youtubeDuration);
          const youtubeFormat =
            videoSettingsByChannel.youtube_shorts?.format || "original";
          const hashtags = Array.isArray(channelPost.hashtags)
            ? channelPost.hashtags
            : [];
          const normalizedTags = hashtags
            .map((tag) => normalizeHashtag(String(tag)))
            .filter(Boolean)
            .slice(0, 8);
          const autoHashtags = youtubeDefaults.autoHashtags !== false;
          const youtubeTags = autoHashtags
            ? Array.from(new Set(["iNrCy", ...normalizedTags]))
            : normalizedTags;
          const tagLine = buildBoosterHashtagLine(
            { ...channelPost, hashtags: youtubeTags },
            canonMessage,
            8,
          );
          const description = [canonMessage, tagLine]
            .filter(Boolean)
            .join("\n\n");

          const upload = await uploadYoutubeShort({
            accessToken: youtubeAccessToken,
            videoUrl: channelVideo.publicUrl || channelVideo.url || "",
            title: channelPost.title || post.title || "Vidéo iNrCy",
            description,
            privacyStatus,
            madeForKids,
            mimeType: channelVideo.type,
            tags: youtubeTags,
            publicationType: youtubePublicationType,
          });

          if (!upload.ok) {
            const youtubeUserError = getPublishChannelUserMessage(
              "youtube_shorts",
              upload.error || "youtube_upload_failed",
              "Publication YouTube impossible.",
            );
            logPublishChannelFailure({
              route: "booster_publish_now",
              channel: "youtube_shorts",
              userId,
              publicationId,
              stage: "publish",
              error: upload.error,
              userMessage: youtubeUserError,
              diagnostics: upload,
            });
            await setDelivery(ch, {
              status: "failed",
              error: youtubeUserError,
            });
            results[ch] = {
              ok: false,
              error: youtubeUserError,
              diagnostics: upload,
            };
            continue;
          }

          const youtubeExternalUrl =
            youtubePublicationType === "short"
              ? upload.shortsUrl || upload.videoUrl || null
              : upload.videoUrl || upload.shortsUrl || null;

          await setDelivery(ch, {
            status: "delivered",
            external_id: upload.videoId || null,
            external_url: youtubeExternalUrl,
            error: null,
          });

          results[ch] = {
            ok: true,
            external_id: upload.videoId || null,
            external_url: youtubeExternalUrl,
            video_url: upload.videoUrl || null,
            shorts_url: upload.shortsUrl || null,
            channel_url: channelUrl || null,
            privacy_status: upload.privacyStatus || privacyStatus,
            processing_status: upload.processingStatus || null,
            upload_status: upload.uploadStatus || null,
            media_type: "video",
            youtube_publication_type: youtubePublicationType,
            youtube_format: youtubeFormat,
            youtube_duration_seconds:
              youtubeDuration || channelVideo.duration || null,
            diagnostics: upload,
          };
          continue;
        }

        if (ch === "tiktok") {
          const tiktokSettings = normalizeTiktokSettings(proSettings["tiktok"]);
          const activeTiktok = isTiktokIntegrationActive(tiktokRow);
          const tiktokAccessToken = activeTiktok
            ? await getTiktokAccessToken(tiktokRow)
            : "";

          if (!activeTiktok || !tiktokAccessToken) {
            const tiktokUserError =
              "TikTok à connecter. Rendez-vous dans Canaux.";
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
          const tiktokRawImages = Array.isArray(imagesByChannel?.tiktok)
            ? (imagesByChannel.tiktok as ImagePayload[])
            : [];
          const tiktokGeometryLocked =
            tiktokRawImages.length > 0 &&
            tiktokRawImages.every((image) =>
              hasFinalImageGeometryDecision(image),
            );
          const expectedTiktokImageCount = getExpectedChannelImageCount(ch);
          const explicitTiktokImageSet = channelImageSets[ch];
          const socialStoragePaths = (
            tiktokImageSet.socialFeedStoragePaths || []
          ).filter(Boolean);
          const sourceStoragePaths = (
            tiktokImageSet.publishableStoragePaths?.length
              ? tiktokImageSet.publishableStoragePaths
              : tiktokImageSet.storagePaths || []
          ).filter(Boolean);
          const hasCompleteTikTokPaths = (paths: string[]) =>
            expectedTiktokImageCount > 0
              ? paths.length >= expectedTiktokImageCount
              : paths.length > 0;
          // A non-locked/legacy payload must go through the TikTok media
          // proxy from the original stored bytes. Reusing the generic social
          // derivative here caused a second JPEG pass (and, historically,
          // progressive scans) before TikTok pulled the image. The strict
          // Booster artifact is already final, so it remains preferred only
          // when the geometry decision is locked.
          const preferredTiktokStoragePaths = tiktokGeometryLocked
            ? socialStoragePaths
            : sourceStoragePaths;
          const fallbackTiktokStoragePaths = tiktokGeometryLocked
            ? sourceStoragePaths
            : socialStoragePaths;
          const tiktokImageStoragePaths = explicitTiktokImageSet
            ? hasCompleteTikTokPaths(preferredTiktokStoragePaths)
              ? preferredTiktokStoragePaths.slice(0, expectedTiktokImageCount)
              : hasCompleteTikTokPaths(fallbackTiktokStoragePaths)
                ? fallbackTiktokStoragePaths.slice(0, expectedTiktokImageCount)
                : []
            : (preferredTiktokStoragePaths.length
                ? preferredTiktokStoragePaths
                : fallbackTiktokStoragePaths
              ).slice(0, 35);
          const legacyTiktokFallbackImageUrls = (
            tiktokImageSet.publishableUrls.length
              ? tiktokImageSet.publishableUrls
              : tiktokImageSet.socialFeedPublishableUrls.length
                ? tiktokImageSet.socialFeedPublishableUrls
                : tiktokImageSet.images.length
                  ? tiktokImageSet.images
                  : externalImageUrls
          ).filter(Boolean);
          const tiktokFallbackImageUrls = pickCompleteChannelImageUrls({
            channel: ch,
            candidates: [
              "publishableUrls",
              "socialFeedPublishableUrls",
              "images",
            ],
            legacyFallback: legacyTiktokFallbackImageUrls,
            limit: 35,
          });
          const tiktokImageUrls = tiktokImageStoragePaths.length
            ? tiktokImageStoragePaths
                .map((path) =>
                  buildTiktokMediaProxyUrl(req.url, path, undefined, {
                    variant: tiktokGeometryLocked ? "photo_locked" : "photo",
                  }),
                )
                .filter(Boolean)
                .slice(0, 35)
            : tiktokFallbackImageUrls;

          if (tiktokMode === "video" && !channelVideo) {
            const tiktokUserError =
              "TikTok nécessite une vidéo pour ce format.";
            await setDelivery(ch, { status: "failed", error: tiktokUserError });
            results[ch] = { ok: false, error: tiktokUserError };
            continue;
          }

          if (tiktokMode === "images" && !tiktokImageUrls.length) {
            const tiktokUserError =
              "TikTok nécessite au moins 1 photo ou 1 vidéo.";
            await setDelivery(ch, { status: "failed", error: tiktokUserError });
            results[ch] = { ok: false, error: tiktokUserError };
            continue;
          }

          if (tiktokMode !== "video" && tiktokMode !== "images") {
            const tiktokUserError =
              "TikTok nécessite une vidéo ou au moins 1 photo.";
            await setDelivery(ch, { status: "failed", error: tiktokUserError });
            results[ch] = { ok: false, error: tiktokUserError };
            continue;
          }

          const isVideo = tiktokMode === "video";
          const videoUrl =
            isVideo &&
            channelVideo?.storagePath &&
            channelVideo.bucket === "booster"
              ? buildTiktokMediaProxyUrl(req.url, channelVideo.storagePath)
              : isVideo
                ? String(
                    channelVideo?.publicUrl || channelVideo?.url || "",
                  ).trim()
                : "";

          if (
            !tiktokPublicationSettings?.privacyLevel ||
            !tiktokPublicationSettings.musicUsageConfirmed ||
            !["none", "self", "branded", "both"].includes(
              String(tiktokPublicationSettings.commercialContent || ""),
            )
          ) {
            const tiktokUserError =
              "Validez les paramètres TikTok avant publication.";
            await setDelivery(ch, { status: "failed", error: tiktokUserError });
            results[ch] = { ok: false, error: tiktokUserError };
            continue;
          }

          const tiktokHashtagLine = buildBoosterHashtagLine(
            channelPost,
            canonMessage,
            8,
          );
          const tiktokTitle =
            [canonMessage, tiktokHashtagLine]
              .filter(Boolean)
              .join("\n\n")
              .slice(0, 2200) ||
            channelPost.content ||
            channelPost.title ||
            "Publication iNrCy";
          const tiktokVideoFile =
            isVideo && channelVideo?.storagePath
              ? await loadStorageVideoForTikTok(
                  channelVideo.storagePath,
                  channelVideo.bucket || "booster",
                )
              : null;

          if (isVideo && !tiktokVideoFile) {
            const tiktokUserError =
              "La vidéo TikTok n'est pas disponible dans le stockage iNrCy. Réimportez-la puis relancez la publication.";
            await setDelivery(ch, { status: "failed", error: tiktokUserError });
            results[ch] = {
              ok: false,
              error: tiktokUserError,
              diagnostics: {
                provider: "tiktok",
                mode: "direct_post",
                transfer: "FILE_UPLOAD_ONLY",
                storage_path: channelVideo?.storagePath || null,
                code: "tiktok_video_file_upload_required",
              },
            };
            continue;
          }

          const tiktokSubmittedAt = new Date().toISOString();
          const tiktokResult = isVideo
            ? await tiktokDirectPostVideoFileUpload({
                accessToken: tiktokAccessToken,
                videoBuffer: tiktokVideoFile!.buffer,
                contentType: tiktokVideoFile!.contentType,
                title: tiktokTitle,
                publicationSettings:
                  tiktokPublicationSettings as TiktokPublicationSettings,
                videoDurationSeconds: channelVideo?.duration || null,
              })
            : await tiktokDirectPostPhotos({
                accessToken: tiktokAccessToken,
                imageUrls: tiktokImageUrls,
                title: channelPost.title || "Publication iNrCy",
                description: tiktokTitle,
                publicationSettings:
                  tiktokPublicationSettings as TiktokPublicationSettings,
              });

          if (!tiktokResult.ok) {
            const tiktokUserError =
              tiktokResult.error || "TikTok n'a pas accepté la publication.";
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
            results[ch] = {
              ok: false,
              error: tiktokUserError,
              diagnostics: tiktokResult,
            };
            continue;
          }

          await setDelivery(ch, {
            status: tiktokResult.status?.pending ? "processing" : "delivered",
            error: null,
          });

          const tiktokPendingMessage = tiktokResult.status?.statusFetchFailed
            ? `TikTok a accepté l'envoi, mais le statut n'est pas lisible pour le moment : ${tiktokResult.status.failReason || "vérification temporairement indisponible"}.`
            : tiktokResult.status?.pending
              ? "TikTok a accepté l'envoi. iNrSend vérifie automatiquement sa finalisation."
              : null;

          const tiktokOpenUrl =
            String(
              tiktokResult.shareUrl || tiktokSettings.profileUrl || "",
            ).trim() || null;

          results[ch] = {
            ok: true,
            external_id: tiktokResult.publishId || null,
            external_url: tiktokOpenUrl,
            share_url: tiktokResult.shareUrl || null,
            tiktok_status: tiktokResult.status?.status || "PUBLISH_COMPLETE",
            tiktok_status_label: tiktokResult.status?.statusFetchFailed
              ? "Vérification impossible"
              : tiktokResult.status?.pending
                ? "En traitement"
                : "Publié",
            tiktok_status_message: tiktokPendingMessage,
            tiktok_status_checked_at: tiktokSubmittedAt,
            tiktok_submitted_at: tiktokSubmittedAt,
            tiktok_status_progress_at: tiktokSubmittedAt,
            tiktok_status_check_count: 1,
            tiktok_processing_duration_seconds: 0,
            tiktok_status_fetch_failed: Boolean(tiktokResult.status?.statusFetchFailed),
            tiktok_uploaded_bytes: tiktokResult.status?.uploadedBytes ?? null,
            tiktok_downloaded_bytes: tiktokResult.status?.downloadedBytes ?? null,
            tiktok_public_post_ids: tiktokResult.status?.publiclyAvailablePostIds || [],
            tiktok_media_type: isVideo ? "video" : "photos",
            warning: Boolean(tiktokPendingMessage),
            warning_message: tiktokPendingMessage,
            media_type: isVideo ? "video" : "photos",
            media_count: isVideo ? 1 : tiktokImageUrls.length,
            username: tiktokSettings.username,
            profile_url: tiktokSettings.profileUrl || null,
            diagnostics: {
              provider: "tiktok",
              mode: "direct_post",
              transfer: isVideo ? "FILE_UPLOAD" : "PULL_FROM_URL",
              publish_id: tiktokResult.publishId || null,
              mediaType: isVideo ? "video" : "photos",
              privacyLevel: tiktokResult.privacyLevel || null,
              mediaUrls: isVideo ? (videoUrl ? [videoUrl] : []) : tiktokImageUrls,
              publicationSettings: tiktokPublicationSettings,
              status: tiktokResult.status || null,
              share_url: tiktokResult.shareUrl || null,
              submitted_at: tiktokSubmittedAt,
              status_progress_at: tiktokSubmittedAt,
              status_checked_at: tiktokSubmittedAt,
              status_check_count: 1,
              processing_duration_seconds: 0,
              raw: tiktokResult.raw,
            },
          };
          continue;
        }

        if (ch === "pinterest") {
          const pinterestStatus = String(asRecord(pinterestRow).status || "");
          // Chaque publication Pinterest doit porter le tableau explicitement choisi pour cette action.
          const boardId = String(
            requestedPinterestBoardId ||
              configuredPinterestDefaultBoardId ||
              "",
          ).trim();
          const boardName = String(requestedPinterestBoardName || "").trim();
          const pinterestAccessToken =
            pinterestStatus === "connected" ||
            pinterestStatus === "account_connected"
              ? await getPinterestAccessToken(userId, req.url)
              : "";

          if (!pinterestAccessToken) {
            const pinterestUserError =
              "Pinterest à connecter. Rendez-vous dans Canaux.";
            await setDelivery(ch, {
              status: "failed",
              error: pinterestUserError,
            });
            results[ch] = { ok: false, error: pinterestUserError };
            continue;
          }

          if (!boardId) {
            const pinterestUserError =
              "Choisissez un tableau Pinterest avant de publier.";
            await setDelivery(ch, {
              status: "failed",
              error: pinterestUserError,
            });
            results[ch] = { ok: false, error: pinterestUserError };
            continue;
          }

          const pinterestPost = sanitizeBoosterPostForStructuredCta(
            channelPost,
            {
              websiteUrl: siteWebUrl || inrcySiteUrl,
              phone: businessPhone,
            },
          );
          const pinterestContent = stripSiteTextFormattingPreserveLayout(
            pinterestPost.content || "",
          );
          if (pinterestContent.length > 500) {
            const pinterestUserError =
              "Le contenu Pinterest dépasse 500 caractères. Raccourcissez-le avant de publier pour conserver exactement votre mise en page.";
            await setDelivery(ch, {
              status: "failed",
              error: pinterestUserError,
            });
            results[ch] = { ok: false, error: pinterestUserError };
            continue;
          }

          const pinterestCta = buildCtaTextForChannel("pinterest", pinterestPost, {
            websiteUrl: siteWebUrl || inrcySiteUrl,
            phone: businessPhone,
          });
          const pinterestTagLine = buildBoosterHashtagLine(
            pinterestPost,
            [pinterestContent, pinterestCta].filter(Boolean).join("\n\n"),
            8,
          );
          let description = pinterestContent;
          for (const optionalPart of [pinterestCta, pinterestTagLine]) {
            if (!optionalPart) continue;
            const candidate = [description, optionalPart].filter(Boolean).join("\n\n");
            if (candidate.length <= 500) description = candidate;
          }
          const pinterestLink =
            normalizePublicHttpUrl(channelPost.ctaUrl) ||
            normalizePublicHttpUrl(siteWebUrl) ||
            normalizePublicHttpUrl(inrcySiteUrl);

          if (mediaModeByChannel[ch] === "video") {
            const pinterestVideoUrl = String(
              channelVideo?.publicUrl || channelVideo?.url || "",
            ).trim();
            if (
              !channelVideo ||
              (!pinterestVideoUrl &&
                !String(channelVideo.storagePath || "").trim())
            ) {
              const pinterestUserError =
                "Veuillez ajouter une vidéo valide pour publier sur Pinterest.";
              await setDelivery(ch, {
                status: "failed",
                error: pinterestUserError,
              });
              results[ch] = { ok: false, error: pinterestUserError };
              continue;
            }

            const pin = await createPinterestVideoPin({
              accessToken: pinterestAccessToken,
              userId,
              boardId,
              title: channelPost.title || post.title || "Publication iNrCy",
              description,
              videoUrl: pinterestVideoUrl,
              videoStoragePath: channelVideo.storagePath,
              videoContentType: channelVideo.type,
              videoFileName: channelVideo.name,
              coverImageUrl: channelVideo.thumbnailUrl,
              coverStoragePath: channelVideo.thumbnailStoragePath,
              link: pinterestLink,
            });

            await setDelivery(ch, {
              status: "delivered",
              error: null,
            });
            results[ch] = {
              ok: true,
              external_id: pin.id || null,
              external_url: pin.url || null,
              board_id: boardId,
              board_name: boardName || null,
              media_type: "video",
              media_id: pin.media_id || null,
              media_status: pin.media_status || null,
              cover_image_url: pin.cover_image_url || null,
            };
            continue;
          }

          if (mediaModeByChannel[ch] !== "images") {
            const pinterestUserError =
              "Pinterest nécessite une image ou une vidéo.";
            await setDelivery(ch, {
              status: "failed",
              error: pinterestUserError,
            });
            results[ch] = { ok: false, error: pinterestUserError };
            continue;
          }

          const pinterestImageUrls = pickCompleteChannelImageUrls({
            channel: ch,
            candidates: [
              "socialFeedPublishableUrls",
              "publishableUrls",
              "images",
            ],
            legacyFallback: externalImageUrls,
            limit: 5,
          });

          if (!pinterestImageUrls.length) {
            const pinterestUserError =
              "Veuillez ajouter au moins 1 image pour publier sur Pinterest.";
            await setDelivery(ch, {
              status: "failed",
              error: pinterestUserError,
            });
            results[ch] = { ok: false, error: pinterestUserError };
            continue;
          }

          const pin = await createPinterestImagePin({
            accessToken: pinterestAccessToken,
            userId,
            boardId,
            title: channelPost.title || post.title || "Publication iNrCy",
            description,
            imageUrls: pinterestImageUrls,
            link: pinterestLink,
          });

          await setDelivery(ch, {
            status: "delivered",
            error: null,
          });
          results[ch] = {
            ok: true,
            external_id: pin.id || null,
            external_url: pin.url || null,
            board_id: boardId,
            board_name: boardName || null,
            media_type: "image",
            image_count: pinterestImageUrls.length,
            images_harmonized: Boolean(pin.images_harmonized),
            image_preparation_message: pin.images_harmonized
              ? "Les images Pinterest ont été harmonisées automatiquement pour conserver un format identique."
              : null,
            target_width: pin.target_width || null,
            target_height: pin.target_height || null,
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

          const tok = await getGmbToken({
            supabase: supabaseAdmin,
            userId,
          });
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

          let gmbWarning: { code: string; message: string } | null = null;

          const rawGmbChannelImages =
            mediaModeByChannel[ch] === "images"
              ? pickCompleteChannelImageUrls({
                  channel: ch,
                  candidates: [
                    "gmbPublishableUrls",
                    "publishableUrls",
                    "images",
                  ],
                  legacyFallback: gmbImageUrls,
                  limit: 5,
                })
              : [];
          const probedGmbImages = rawGmbChannelImages.length
            ? await filterGoogleBusinessMediaUrls({
                urls: rawGmbChannelImages,
                kind: "image",
              })
            : { acceptedUrls: [] as string[] };
          const gmbChannelImages = probedGmbImages.acceptedUrls.slice(0, 5);
          if (
            mediaModeByChannel[ch] === "images" &&
            getExpectedChannelImageCount(ch) > 0 &&
            gmbChannelImages.length < rawGmbChannelImages.length
          ) {
            gmbWarning = {
              code: gmbChannelImages.length
                ? "published_with_partial_images"
                : "published_without_image",
              message: gmbChannelImages.length
                ? "Google Business a publié uniquement les images accessibles et conformes. Les autres médias ont été écartés avant l’envoi."
                : "Google Business publiera le texte sans image, car aucune image n’était encore accessible ou conforme au moment de l’envoi.",
            };
          }
          if (
            mediaModeByChannel[ch] === "images" &&
            getExpectedChannelImageCount(ch) > 0 &&
            !gmbChannelImages.length &&
            !gmbWarning
          ) {
            gmbWarning = {
              code: "published_without_image",
              message:
                "Google Business publiera le texte sans image, car le média n’a pas pu être préparé de façon conforme.",
            };
          }

          const rawGmbChannelVideos =
            mediaModeByChannel[ch] === "video" &&
            channelVideo
              ? [channelVideo.publicUrl].filter(Boolean).slice(0, 1)
              : [];
          const probedGmbVideos = rawGmbChannelVideos.length
            ? await filterGoogleBusinessMediaUrls({
                urls: rawGmbChannelVideos,
                kind: "video",
              })
            : { acceptedUrls: [] as string[] };
          const gmbChannelVideos = probedGmbVideos.acceptedUrls.slice(0, 1);
          if (
            mediaModeByChannel[ch] === "video" &&
            rawGmbChannelVideos.length > 0 &&
            !gmbChannelVideos.length
          ) {
            const gmbVideoError =
              "Google Business n’a pas reçu la vidéo : l’URL ou le fichier préparé n’était plus accessible ou conforme au moment de l’envoi.";
            await setDelivery(ch, { status: "failed", error: gmbVideoError });
            results[ch] = {
              ok: false,
              code: "video_conversion_or_probe_failed",
              retryable: true,
              error: gmbVideoError,
            };
            continue;
          }
          if (
            mediaModeByChannel[ch] === "video" &&
            !gmbChannelVideos.length &&
            !gmbWarning
          ) {
            const gmbVideoError =
              "La variante vidéo Google Business n’était pas disponible. La publication texte n’a pas été envoyée à la place.";
            await setDelivery(ch, { status: "failed", error: gmbVideoError });
            results[ch] = {
              ok: false,
              code: "video_variant_required",
              retryable: true,
              error: gmbVideoError,
            };
            continue;
          }

          const gmbSummary = buildBoosterGmbSummary(channelPost, {
            websiteUrl: siteWebUrl || inrcySiteUrl,
            phone: businessPhone,
          });
          const gmbCallToAction = getBoosterGmbCallToAction(channelPost, {
            websiteUrl: siteWebUrl || inrcySiteUrl,
            phone: businessPhone,
          });
          let gmbResp: any;

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
              if (mediaModeByChannel[ch] === "video") throw gmbErr;
              gmbResp = await retryWithoutMedia();
              gmbWarning = {
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
          await setDelivery(ch, {
            status: "delivered",
            error: null,
          });
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

        const unsupportedChannelMessage =
          "Ce canal de publication n'est pas pris en charge.";
        await setDelivery(ch, {
          status: "failed",
          error: unsupportedChannelMessage,
        });
        results[ch] = {
          ok: false,
          error: unsupportedChannelMessage,
          code: "unsupported_channel",
          retryable: false,
        };
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

    if (internalAsyncDispatch) {
      const channel = selected[0];
      const channelResult = Object.keys(asRecord(results[channel])).length
        ? asRecord(results[channel])
        : {
            ok: false,
            error: "Le canal n'a retourné aucun résultat exploitable.",
            code: "missing_channel_result",
          };
      const channelSucceeded = channelResult.ok !== false;
      if (!channelSucceeded) {
        await supabaseAdmin
          .from("publication_deliveries")
          .update({
            status: "failed",
            error: String(channelResult.error || "Échec de publication."),
          })
          .eq("publication_id", publicationId)
          .eq("user_id", userId)
          .eq("channel", channel);
      }

      await updateAsyncChannelEvent({
        userId,
        eventId: asyncChannelEventId,
        patch: {
          status: channelSucceeded ? "completed" : "failed",
          result: channelResult,
          completedAt: new Date().toISOString(),
        },
      });
      await completeExecutionIdempotencyLock({
        supabase: supabaseAdmin,
        lockId: asyncChannelLockId,
        result: {
          ok: channelSucceeded,
          publication_id: publicationId,
          channel,
          result: channelResult,
          asyncDispatch: true,
        },
        metadata: { publicationId, channel, asyncDispatch: true },
      });

      if (channel === "inr_search" && channelSucceeded) {
        const provisioned = await ensureSystemManagedInrSearch(
          supabaseAdmin as any,
          userId,
        );
        const slug = String(
          provisioned.inrSearch?.publishedSlug ||
            provisioned.inrSearch?.slug ||
            "",
        );
        revalidateInrSearchPublicRoutes(slug);
        await notifyInrSearchIndexing(slug);
      }

      const finalization = await finalizeAsyncPublicationIfReady({
        userId,
        publicationId,
      });
      asyncFailureContext = null;
      const summary = buildResultsSummary(
        { [channel]: channelResult },
        [channel],
      );
      return NextResponse.json({
        ok: channelSucceeded,
        queued: false,
        asyncDispatch: true,
        publication_id: publicationId,
        channel,
        results: { [channel]: channelResult },
        summary,
        finalized: finalization.finalized === true,
      });
    }

    const persistedVideo =
      hasAnyVideoChannel && publicationVideo ? publicationVideo : null;
    const videoByChannel = publicationVideoByChannel;

    const persistedPostByChannel = Object.fromEntries(
      selected.map((channel) => {
        const rawBaseValue = (postByChannel as Record<string, unknown>)[
          channel
        ] as Record<string, unknown> | undefined;
        const baseValue = {
          ...(rawBaseValue || {}),
          ...getChannelPost(channel),
        };
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
              videoAdaptationMode:
                videoSettingsByChannel[channel]?.adaptationMode || null,
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
            : {
                ...(baseValue || {}),
                mediaMode: "images",
                videoSettings: videoSettingsByChannel[channel] || null,
              },
        ];
      }),
    );

    const summary = buildResultsSummary(results, selected);

    // Sécurité compteur/stats : on ne valide l'action Booster que si au moins un canal a réellement publié.
    // Ainsi, les compteurs, missions et UI ne montent pas quand tous les canaux échouent.
    if (summary.successCount <= 0) {
      await syncMediaWorkspaceLifecycle("failed", {
        publicationId,
        failureStage: "publish_results",
        summary,
      });
      await failExecutionIdempotencyLock({
        supabase: supabaseAdmin,
        lockId: publishIdempotencyLockId,
        error: "Aucun canal publié avec succès.",
        result: { publicationId, summary },
        metadata: { stage: "publish_results" },
      });
      shouldFailPublishIdempotencyLockOnError = false;
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
          historyEventId: null,
          historyPersisted: false,
        },
        { status: 200 },
      );
    }

    // 5) Log publication / valorisation event uniquement après succès réel.
    // Historique iNrSend uniquement après un succès réel.
    // Une publication canal ne doit jamais être relancée parce que son journal a
    // rencontré un incident transitoire : on réessaie seulement l'écriture du log,
    // avec le même identifiant, puis le filet de réconciliation iNrAgent prend le relais.
    const historyEventId = randomUUID();
    const historyEventRow = {
      id: historyEventId,
      user_id: userId,
      module: eventModule,
      type: eventType,
      payload: {
        workflowTool: eventModule,
        workflowAction,
        ...(origin ? { origin, source: origin.source } : {}),
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
        mediaWorkspaceId: mediaWorkspaceId || null,
        mediaWorkspaceRevision: workspaceConsumption?.workspaceRevision || null,
        mediaWorkspaceConsumptionSource:
          strictMediaCutover ? "workspace_cutover_v1" : workspaceConsumption?.source || "legacy_fallback",
        idempotencyKey: publishIdempotencyKey || null,
        idempotencyLockId: publishIdempotencyLockId || null,
        results,
        summary,
      },
    };

    let historyPersisted = false;
    let historyPersistenceError: string | null = null;
    const { error: historyInsertError } = await supabaseAdmin
      .from("app_events")
      .insert(historyEventRow);

    if (!historyInsertError) {
      historyPersisted = true;
    } else {
      const { error: historyRetryError } = await supabaseAdmin
        .from("app_events")
        .upsert(historyEventRow, { onConflict: "id" });
      historyPersisted = !historyRetryError;
      historyPersistenceError = historyRetryError?.message || historyInsertError.message;
    }

    if (!historyPersisted) {
      console.error("[booster-publish] iNrSend history persistence failed", {
        userId,
        publicationId,
        historyEventId,
        originSource: origin?.source || null,
        error: historyPersistenceError,
      });
    }

    if (summary.successChannels.includes("inr_search")) {
      const provisioned = await ensureSystemManagedInrSearch(supabaseAdmin as any, userId);
      const slug = String(provisioned.inrSearch?.publishedSlug || provisioned.inrSearch?.slug || "");
      revalidateInrSearchPublicRoutes(slug);
      await notifyInrSearchIndexing(slug);
    }

    const responsePayload = {
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
      historyEventId,
      historyPersisted,
      idempotencyKey: publishIdempotencyKey || null,
      mediaWorkspaceId: mediaWorkspaceId || null,
      mediaWorkspaceRevision: workspaceConsumption?.workspaceRevision || null,
      mediaWorkspaceConsumptionSource:
        strictMediaCutover ? "workspace_cutover_v1" : workspaceConsumption?.source || "legacy_fallback",
    };

    await syncMediaWorkspaceLifecycle("published", {
      publicationId,
      successfulChannels: summary.successChannels,
      summary,
    });

    await completeExecutionIdempotencyLock({
      supabase: supabaseAdmin,
      lockId: publishIdempotencyLockId,
      result: responsePayload,
      metadata: { publicationId, summary },
    });
    shouldFailPublishIdempotencyLockOnError = false;

    return NextResponse.json(responsePayload);
  } catch (e: unknown) {
    if (asyncFailureContext) {
      const message = getSimpleFrenchErrorMessage(
        e,
        "La publication n'a pas pu être finalisée sur ce canal.",
      );
      const failedResult = {
        ok: false,
        error: message,
        raw_error: e instanceof Error ? e.message : String(e || ""),
        code: "async_channel_unhandled_exception",
      };
      await supabaseAdmin
        .from("publication_deliveries")
        .update({ status: "failed", error: message })
        .eq("publication_id", asyncFailureContext.publicationId)
        .eq("user_id", asyncFailureContext.userId)
        .eq("channel", asyncFailureContext.channel)
        .then(() => undefined);
      await updateAsyncChannelEvent({
        userId: asyncFailureContext.userId,
        eventId: asyncFailureContext.channelEventId,
        patch: {
          status: "failed",
          result: failedResult,
          completedAt: new Date().toISOString(),
        },
      }).catch(() => undefined);
      await completeExecutionIdempotencyLock({
        supabase: supabaseAdmin,
        lockId: asyncFailureContext.channelLockId,
        result: {
          ok: false,
          publication_id: asyncFailureContext.publicationId,
          channel: asyncFailureContext.channel,
          result: failedResult,
          asyncDispatch: true,
        },
        metadata: {
          publicationId: asyncFailureContext.publicationId,
          channel: asyncFailureContext.channel,
          asyncDispatch: true,
        },
      });
      await finalizeAsyncPublicationIfReady({
        userId: asyncFailureContext.userId,
        publicationId: asyncFailureContext.publicationId,
      }).catch(() => undefined);
      return NextResponse.json({
        ok: false,
        queued: false,
        asyncDispatch: true,
        publication_id: asyncFailureContext.publicationId,
        channel: asyncFailureContext.channel,
        results: { [asyncFailureContext.channel]: failedResult },
      });
    }

    if (lifecycleWorkspaceId && lifecycleUserId) {
      await syncPublicationWorkspaceContext({
        accountId: lifecycleUserId,
        workspaceId: lifecycleWorkspaceId,
        operation: "publish",
        status: "failed",
        metadata: {
          failureStage: "unhandled_exception",
          failureMessage: e instanceof Error ? e.message : String(e || "Erreur inconnue"),
        },
      }).catch(() => undefined);
    }
    if (
      shouldFailPublishIdempotencyLockOnError &&
      publishIdempotencyLockId
    ) {
      const failureMessage = getSimpleFrenchErrorMessage(
        e,
        "L'action n'a pas pu être finalisée.",
      );
      await failExecutionIdempotencyLock({
        supabase: supabaseAdmin,
        lockId: publishIdempotencyLockId,
        error: failureMessage,
        result: {
          ok: false,
          code: "publish_now_failed",
        },
        metadata: { stage: "unhandled_exception" },
      }).catch(() => undefined);
      shouldFailPublishIdempotencyLockOnError = false;
    }
    captureApiException(req, e, {
      area: "booster",
      operation: "POST /api/booster/publish-now",
      statusCode: 500,
    });
    return jsonUserFacingError(e, {
      status: 500,
      fallback: "L'action n'a pas pu être finalisée.",
      code: "publish_now_failed",
    });
  }
}

export const POST = withApi(publishNowHandler, { route: "/api/booster/publish-now" });
