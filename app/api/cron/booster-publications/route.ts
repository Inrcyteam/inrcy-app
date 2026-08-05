import { NextResponse, after } from "next/server";
import {
  buildInternalCronHeaders,
  getAppOriginFromRequest,
  isAuthorizedCronRequest,
} from "@/lib/cronAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  acquireAsyncPublicationPreparationLease,
  BOOSTER_ASYNC_CHANNEL_EVENT_TYPE,
  BOOSTER_ASYNC_CHANNEL_LOCK_TTL_MS,
  BOOSTER_ASYNC_JOB_EVENT_TYPE,
  BOOSTER_ASYNC_PREPARATION_LOCK_TTL_MS,
  BOOSTER_ASYNC_PREPARATION_MAX_ATTEMPTS,
  completeAsyncPublicationPreparationLease,
  failPreparingAsyncPublicationChannels,
  finalizeAsyncPublicationIfReady,
  updateAsyncChannelEvent,
  updateAsyncPublicationJobEvent,
} from "@/lib/boosterAsyncPublication";

export const runtime = "nodejs";
export const maxDuration = 60;

type JsonRecord = Record<string, unknown>;
type AsyncEventRow = {
  id: string;
  user_id: string;
  payload: unknown;
  created_at?: string | null;
};
type AsyncDispatchJob = {
  id: string;
  userId: string;
  status: string;
  channel: string;
  publicationId: string;
  dispatchRequest: JsonRecord;
  lastActivityAt: number;
  attempt: number;
  instagramVideoContinuation: boolean;
  instagramContinuationAttempt: number;
  instagramVideoNextPollAt: number;
  youtubeUploadContinuation: boolean;
  youtubeContinuationAttempt: number;
  youtubeUploadNextRunAt: number;
  pinterestVideoContinuation: boolean;
  pinterestContinuationAttempt: number;
  pinterestVideoNextPollAt: number;
  pinterestVideoTerminal: boolean;
};
type AsyncPreparationJob = {
  id: string;
  userId: string;
  status: string;
  preparationRequest: JsonRecord;
  channelEventIds: string[];
  lastActivityAt: number;
  attempt: number;
};

const PROCESSING_RECOVERY_GRACE_MS = 30 * 1000;
const MAX_ASYNC_DISPATCH_ATTEMPTS = 3;
const MAX_INSTAGRAM_VIDEO_CONTINUATION_ATTEMPTS = 480;
const MAX_YOUTUBE_UPLOAD_CONTINUATION_ATTEMPTS = 128;
const MAX_PINTEREST_VIDEO_CONTINUATION_ATTEMPTS = 480;
const PINTEREST_VIDEO_TERMINAL_PHASES = new Set([
  "completed",
  "failed",
  "expired",
  "outcome_unknown",
]);

function timestampMs(...values: unknown[]) {
  for (const value of values) {
    const parsed = Date.parse(String(value || ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function readDispatchJob(row: AsyncEventRow): AsyncDispatchJob {
  const payload = asRecord(row.payload);
  const persistedTiktokCheckpoint = asRecord(
    payload.tiktokUploadCheckpoint,
  );
  const persistedInstagramVideoCheckpoint = asRecord(
    payload.instagramVideoCheckpoint,
  );
  const rawYoutubeUploadCheckpoint = payload.youtubeUploadCheckpoint;
  const hasYoutubeUploadCheckpoint =
    rawYoutubeUploadCheckpoint !== null &&
    rawYoutubeUploadCheckpoint !== undefined;
  const rawPinterestVideoCheckpoint = payload.pinterestVideoCheckpoint;
  const hasPinterestVideoCheckpoint =
    rawPinterestVideoCheckpoint !== null &&
    rawPinterestVideoCheckpoint !== undefined;
  const persistedPinterestVideoCheckpoint = asRecord(
    rawPinterestVideoCheckpoint,
  );
  const channel = String(payload.channel || "");
  const instagramVideoContinuation =
    channel === "instagram" &&
    Object.keys(persistedInstagramVideoCheckpoint).length > 0;
  const youtubeUploadContinuation =
    channel === "youtube_shorts" && hasYoutubeUploadCheckpoint;
  const pinterestVideoTerminal =
    channel === "pinterest" &&
    hasPinterestVideoCheckpoint &&
    PINTEREST_VIDEO_TERMINAL_PHASES.has(
      String(persistedPinterestVideoCheckpoint.phase || "")
        .trim()
        .toLowerCase(),
    );
  const pinterestVideoContinuation =
    channel === "pinterest" &&
    hasPinterestVideoCheckpoint &&
    !pinterestVideoTerminal;
  return {
    id: String(row.id || ""),
    userId: String(row.user_id || "").trim(),
    status: String(payload.status || "queued").trim(),
    channel,
    publicationId: String(payload.publication_id || ""),
    dispatchRequest: {
      ...asRecord(payload.dispatchRequest),
      ...(Object.keys(persistedTiktokCheckpoint).length
        ? { _tiktokUploadCheckpoint: persistedTiktokCheckpoint }
        : {}),
      ...(Object.keys(persistedInstagramVideoCheckpoint).length
        ? {
            _instagramVideoCheckpoint:
              persistedInstagramVideoCheckpoint,
          }
        : {}),
      ...(hasYoutubeUploadCheckpoint
        ? {
            _youtubeUploadCheckpoint: rawYoutubeUploadCheckpoint,
          }
        : {}),
      ...(hasPinterestVideoCheckpoint
        ? {
            _pinterestVideoCheckpoint: rawPinterestVideoCheckpoint,
          }
        : {}),
    },
    attempt: Math.max(0, Number(payload.attempt || 0)),
    instagramVideoContinuation,
    instagramContinuationAttempt: Math.max(
      0,
      Number(payload.instagramContinuationAttempt || 0),
    ),
    instagramVideoNextPollAt: timestampMs(payload.instagramVideoNextPollAt),
    youtubeUploadContinuation,
    youtubeContinuationAttempt: Math.max(
      0,
      Number(payload.youtubeContinuationAttempt || 0),
    ),
    youtubeUploadNextRunAt: timestampMs(payload.youtubeUploadNextRunAt),
    pinterestVideoContinuation,
    pinterestContinuationAttempt: Math.max(
      0,
      Number(payload.pinterestContinuationAttempt || 0),
    ),
    pinterestVideoNextPollAt: timestampMs(
      payload.pinterestVideoNextPollAt,
      persistedPinterestVideoCheckpoint.nextPollAt,
    ),
    pinterestVideoTerminal,
    lastActivityAt: timestampMs(
      payload.updatedAt,
      payload.startedAt,
      payload.createdAt,
      row.created_at,
    ),
  };
}

function readPreparationJob(row: AsyncEventRow): AsyncPreparationJob {
  const payload = asRecord(row.payload);
  return {
    id: String(row.id || ""),
    userId: String(row.user_id || "").trim(),
    status: String(payload.status || "queued").trim(),
    preparationRequest: asRecord(payload.preparationRequest),
    channelEventIds: Object.values(asRecord(payload.channelEventIds))
      .map((value) => String(value || "").trim())
      .filter(Boolean),
    attempt: Math.max(0, Number(payload.preparationAttempt || 0)),
    lastActivityAt: timestampMs(
      payload.updatedAt,
      payload.preparationStartedAt,
      payload.lastPreparationDispatchAt,
      payload.createdAt,
      row.created_at,
    ),
  };
}

async function exhaustPreparationJob(job: AsyncPreparationJob) {
  const lease = await acquireAsyncPublicationPreparationLease({
    userId: job.userId,
    publicationId: job.id,
  });
  if (lease.state === "running" || lease.state === "unavailable") return;
  if (lease.state === "completed") {
    await updateAsyncPublicationJobEvent({
      userId: job.userId,
      publicationId: job.id,
      patch: {
        status: "dispatching",
        stage: "channel_dispatch",
        preparationRequest: null,
      },
    });
    await finalizeAsyncPublicationIfReady({
      userId: job.userId,
      publicationId: job.id,
    });
    return;
  }

  const errorMessage =
    "La préparation des médias n'a pas pu être relancée automatiquement après plusieurs tentatives.";
  const failedChannels = await failPreparingAsyncPublicationChannels({
    userId: job.userId,
    channelEventIds: job.channelEventIds,
    error: errorMessage,
  });
  if (failedChannels.length) {
    await supabaseAdmin
      .from("publication_deliveries")
      .update({ status: "failed", error: errorMessage })
      .eq("publication_id", job.id)
      .eq("user_id", job.userId)
      .in("channel", failedChannels);
  }
  await updateAsyncPublicationJobEvent({
    userId: job.userId,
    publicationId: job.id,
    patch: {
      status: "dispatching",
      stage: "channel_dispatch",
      preparationRequest: null,
      preparationExhaustedAt: new Date().toISOString(),
      lastPreparationError: errorMessage,
    },
  });
  await completeAsyncPublicationPreparationLease({
    lockId: lease.lock?.id || null,
    publicationId: job.id,
  });
  await finalizeAsyncPublicationIfReady({
    userId: job.userId,
    publicationId: job.id,
  });
}

async function dispatchPreparationJob(job: AsyncPreparationJob, appOrigin: string) {
  if (job.attempt >= BOOSTER_ASYNC_PREPARATION_MAX_ATTEMPTS) {
    await exhaustPreparationJob(job);
    return;
  }
  try {
    await fetch(`${appOrigin}/api/booster/publish-now`, {
      method: "POST",
      headers: buildInternalCronHeaders(job.userId),
      body: JSON.stringify({
        ...job.preparationRequest,
        _asyncPreparationAttempt: job.attempt + 1,
      }),
      cache: "no-store",
    });
  } catch (dispatchError) {
    console.warn("[booster-async-cron] preparation dispatch failed", {
      publicationId: job.id,
      message:
        dispatchError instanceof Error
          ? dispatchError.message
          : String(dispatchError || ""),
    });
  }
}

async function dispatchChannelJob(job: AsyncDispatchJob, appOrigin: string) {
  if (
    (job.instagramVideoContinuation &&
      job.instagramVideoNextPollAt > Date.now()) ||
    (job.youtubeUploadContinuation &&
      job.youtubeUploadNextRunAt > Date.now()) ||
    (job.pinterestVideoContinuation &&
      job.pinterestVideoNextPollAt > Date.now())
  ) {
    return;
  }
  const attemptsExhausted = job.instagramVideoContinuation
    ? job.instagramContinuationAttempt >=
      MAX_INSTAGRAM_VIDEO_CONTINUATION_ATTEMPTS
    : job.youtubeUploadContinuation
      ? job.youtubeContinuationAttempt >=
        MAX_YOUTUBE_UPLOAD_CONTINUATION_ATTEMPTS
      : job.pinterestVideoContinuation
        ? job.pinterestContinuationAttempt >=
          MAX_PINTEREST_VIDEO_CONTINUATION_ATTEMPTS
        : job.attempt >= MAX_ASYNC_DISPATCH_ATTEMPTS;
  if (attemptsExhausted) {
    const errorMessage =
      "Le canal n'a pas pu être relancé automatiquement après plusieurs tentatives.";
    await updateAsyncChannelEvent({
      userId: job.userId,
      eventId: job.id,
      patch: {
        status: "failed",
        result: {
          ok: false,
          code: job.instagramVideoContinuation
            ? "instagram_video_continuation_exhausted"
            : job.youtubeUploadContinuation
              ? "youtube_upload_continuation_exhausted"
              : job.pinterestVideoContinuation
                ? "pinterest_video_continuation_exhausted"
                : "async_dispatch_exhausted",
          retryable: false,
          error: errorMessage,
        },
        completedAt: new Date().toISOString(),
      },
    });
    await supabaseAdmin
      .from("publication_deliveries")
      .update({ status: "failed", error: errorMessage })
      .eq("publication_id", job.publicationId)
      .eq("user_id", job.userId)
      .eq("channel", job.channel);
    await finalizeAsyncPublicationIfReady({
      userId: job.userId,
      publicationId: job.publicationId,
    });
    return;
  }

  try {
    await updateAsyncChannelEvent({
      userId: job.userId,
      eventId: job.id,
      patch: {
        ...(job.instagramVideoContinuation
          ? {
              instagramContinuationAttempt:
                job.instagramContinuationAttempt + 1,
            }
          : job.youtubeUploadContinuation
            ? {
                youtubeContinuationAttempt:
                  job.youtubeContinuationAttempt + 1,
              }
            : job.pinterestVideoContinuation
              ? {
                  pinterestContinuationAttempt:
                    job.pinterestContinuationAttempt + 1,
                }
              : { attempt: job.attempt + 1 }),
        lastDispatchAt: new Date().toISOString(),
      },
    });
    await fetch(`${appOrigin}/api/booster/publish-now`, {
      method: "POST",
      headers: buildInternalCronHeaders(job.userId),
      body: JSON.stringify({
        ...job.dispatchRequest,
        ...(job.instagramVideoContinuation
          ? {
              _instagramVideoContinuationAttempt:
                job.instagramContinuationAttempt + 1,
            }
          : {}),
        ...(job.youtubeUploadContinuation
          ? {
              _youtubeUploadContinuationAttempt:
                job.youtubeContinuationAttempt + 1,
            }
          : {}),
        ...(job.pinterestVideoContinuation
          ? {
              _pinterestVideoContinuationAttempt:
                job.pinterestContinuationAttempt + 1,
            }
          : {}),
      }),
      cache: "no-store",
    });
  } catch (dispatchError) {
    console.warn("[booster-async-cron] channel dispatch failed", {
      publicationId: job.publicationId,
      channel: job.channel,
      message:
        dispatchError instanceof Error
          ? dispatchError.message
          : String(dispatchError || ""),
    });
  }
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "Non autorisé." }, { status: 401 });
  }
  const finalizationRecoveryCutoffIso = new Date(
    Date.now() - 2 * 60 * 1000,
  ).toISOString();
  const channelRecoveryCutoffIso = new Date(
    Date.now() -
      BOOSTER_ASYNC_CHANNEL_LOCK_TTL_MS -
      PROCESSING_RECOVERY_GRACE_MS,
  ).toISOString();
  const preparationRecoveryCutoffIso = new Date(
    Date.now() -
      BOOSTER_ASYNC_PREPARATION_LOCK_TTL_MS -
      PROCESSING_RECOVERY_GRACE_MS,
  ).toISOString();

  // Queued work always has its own capacity. Never apply a shared LIMIT before
  // separating it from active recovery rows: a wall of fresh processing jobs
  // must not hide a queued job whose initial after() dispatch was lost.
  const [
    queuedChannelQuery,
    processingChannelQuery,
    queuedPreparationQuery,
    activePreparationQuery,
    oldestFinalizationQuery,
    newestFinalizationQuery,
  ] = await Promise.all([
    supabaseAdmin
      .from("app_events")
      .select("id,user_id,payload,created_at")
      .eq("type", BOOSTER_ASYNC_CHANNEL_EVENT_TYPE)
      .eq("payload->>status", "queued")
      .not("payload->dispatchRequest", "is", null)
      .order("created_at", { ascending: true })
      .limit(50),
    supabaseAdmin
      .from("app_events")
      .select("id,user_id,payload,created_at")
      .eq("type", BOOSTER_ASYNC_CHANNEL_EVENT_TYPE)
      .eq("payload->>status", "processing")
      .lt("payload->>updatedAt", channelRecoveryCutoffIso)
      .order("created_at", { ascending: true })
      .limit(50),
    supabaseAdmin
      .from("app_events")
      .select("id,user_id,payload,created_at")
      .eq("type", BOOSTER_ASYNC_JOB_EVENT_TYPE)
      .eq("payload->>status", "queued")
      .not("payload->preparationRequest", "is", null)
      .order("created_at", { ascending: true })
      .limit(25),
    supabaseAdmin
      .from("app_events")
      .select("id,user_id,payload,created_at")
      .eq("type", BOOSTER_ASYNC_JOB_EVENT_TYPE)
      .in("payload->>status", ["preparing", "dispatching"])
      .lt("payload->>updatedAt", preparationRecoveryCutoffIso)
      .order("created_at", { ascending: true })
      .limit(25),
    supabaseAdmin
      .from("app_events")
      .select("id,user_id,payload,created_at")
      .eq("type", BOOSTER_ASYNC_JOB_EVENT_TYPE)
      .in("payload->>status", ["queued", "preparing", "dispatching"])
      .lt("payload->>updatedAt", finalizationRecoveryCutoffIso)
      .order("created_at", { ascending: true })
      .limit(13),
    supabaseAdmin
      .from("app_events")
      .select("id,user_id,payload,created_at")
      .eq("type", BOOSTER_ASYNC_JOB_EVENT_TYPE)
      .in("payload->>status", ["queued", "preparing", "dispatching"])
      .lt("payload->>updatedAt", finalizationRecoveryCutoffIso)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const queryError = [
    queuedChannelQuery.error,
    processingChannelQuery.error,
    queuedPreparationQuery.error,
    activePreparationQuery.error,
    oldestFinalizationQuery.error,
    newestFinalizationQuery.error,
  ].find(Boolean);
  if (queryError) {
    return NextResponse.json(
      {
        ok: false,
        error: queryError.message,
      },
      { status: 500 },
    );
  }

  const queuedDispatchJobs = (
    (queuedChannelQuery.data || []) as AsyncEventRow[]
  )
    .map(readDispatchJob)
    .filter(
      (job) =>
        job.id &&
        job.userId &&
        Object.keys(job.dispatchRequest).length > 0 &&
        !job.pinterestVideoTerminal,
    );
  const recoveredDispatchJobs = (
    (processingChannelQuery.data || []) as AsyncEventRow[]
  )
    .map(readDispatchJob)
    .filter(
      (job) =>
        job.id &&
        job.userId &&
        Object.keys(job.dispatchRequest).length > 0 &&
        !job.pinterestVideoTerminal &&
        Date.now() - job.lastActivityAt >=
          BOOSTER_ASYNC_CHANNEL_LOCK_TTL_MS + PROCESSING_RECOVERY_GRACE_MS,
    );
  const dispatchJobs = [...queuedDispatchJobs, ...recoveredDispatchJobs];

  const queuedPreparationJobs = (
    (queuedPreparationQuery.data || []) as AsyncEventRow[]
  )
    .map(readPreparationJob)
    .filter(
      (job) =>
        job.id &&
        job.userId &&
        Object.keys(job.preparationRequest).length > 0 &&
        job.status === "queued",
    );
  const recoveredPreparationJobs = (
    (activePreparationQuery.data || []) as AsyncEventRow[]
  )
    .map(readPreparationJob)
    .filter(
      (job) =>
        job.id &&
        job.userId &&
        Object.keys(job.preparationRequest).length > 0 &&
        Date.now() - job.lastActivityAt >=
          BOOSTER_ASYNC_PREPARATION_LOCK_TTL_MS +
            PROCESSING_RECOVERY_GRACE_MS,
    );
  const preparationJobs = [
    ...queuedPreparationJobs,
    ...recoveredPreparationJobs,
  ];
  // Every async parent is a bounded finalization candidate, independently of
  // its preparationRequest. This heals transient finalizer failures, duplicate
  // branches that terminalized children early, and parents whose technical
  // child is missing. finalizeAsyncPublicationIfReady remains idempotent and
  // returns cheaply while any real child is still pending.
  const finalizationJobs = Array.from(
    new Map(
      [
        ...((oldestFinalizationQuery.data || []) as AsyncEventRow[]),
        ...((newestFinalizationQuery.data || []) as AsyncEventRow[]),
      ]
        .map(readPreparationJob)
        .filter((job) => job.id && job.userId)
        .map((job) => [`${job.userId}:${job.id}`, job] as const),
    ).values(),
  ).slice(0, 25);

  if (
    dispatchJobs.length ||
    preparationJobs.length ||
    finalizationJobs.length
  ) {
    const appOrigin = getAppOriginFromRequest(request);
    after(async () => {
      await Promise.allSettled([
        ...preparationJobs.map((job) =>
          dispatchPreparationJob(job, appOrigin),
        ),
        ...dispatchJobs.map((job) => dispatchChannelJob(job, appOrigin)),
        ...finalizationJobs.map((job) =>
          finalizeAsyncPublicationIfReady({
            userId: job.userId,
            publicationId: job.id,
          }),
        ),
      ]);
    });
  }

  return NextResponse.json({
    ok: true,
    preparationsQueued: queuedPreparationJobs.length,
    preparationsRecovered: recoveredPreparationJobs.length,
    queued: queuedDispatchJobs.length,
    recovered: recoveredDispatchJobs.length,
    finalizationsChecked: finalizationJobs.length,
    publicationIds: Array.from(
      new Set(
        [
          ...preparationJobs.map((job) => job.id),
          ...dispatchJobs.map((job) => job.publicationId),
        ].filter(Boolean),
      ),
    ),
  });
}
