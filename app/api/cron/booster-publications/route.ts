import { NextResponse, after } from "next/server";
import {
  buildInternalCronHeaders,
  getAppOriginFromRequest,
  isAuthorizedCronRequest,
} from "@/lib/cronAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  BOOSTER_ASYNC_CHANNEL_EVENT_TYPE,
  BOOSTER_ASYNC_CHANNEL_LOCK_TTL_MS,
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
};

const PROCESSING_RECOVERY_GRACE_MS = 30 * 1000;

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

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "Non autorisé." }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("app_events")
    .select("id,user_id,payload,created_at")
    .eq("type", BOOSTER_ASYNC_CHANNEL_EVENT_TYPE)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  const jobs: AsyncDispatchJob[] = ((data || []) as AsyncEventRow[])
    .map((row): AsyncDispatchJob => {
      const payload = asRecord(row.payload);
      const status = String(payload.status || "queued").trim();
      const dispatchRequest = asRecord(payload.dispatchRequest);
      const userId = String(row.user_id || "").trim();
      return {
        id: String(row.id || ""),
        userId,
        status,
        channel: String(payload.channel || ""),
        publicationId: String(payload.publication_id || ""),
        dispatchRequest,
        lastActivityAt: timestampMs(
          payload.updatedAt,
          payload.startedAt,
          payload.createdAt,
          row.created_at,
        ),
      };
    })
    .filter(
      (job: AsyncDispatchJob) =>
        job.id &&
        job.userId &&
        Object.keys(job.dispatchRequest).length > 0 &&
        (job.status === "queued" ||
          (job.status === "processing" &&
            Date.now() - job.lastActivityAt >=
              BOOSTER_ASYNC_CHANNEL_LOCK_TTL_MS +
                PROCESSING_RECOVERY_GRACE_MS)),
    );

  if (jobs.length) {
    const appOrigin = getAppOriginFromRequest(request);
    after(async () => {
      await Promise.allSettled(
        jobs.map(async (job: AsyncDispatchJob) => {
          try {
            await fetch(`${appOrigin}/api/booster/publish-now`, {
              method: "POST",
              headers: buildInternalCronHeaders(job.userId),
              body: JSON.stringify(job.dispatchRequest),
              cache: "no-store",
            });
          } catch (dispatchError) {
            console.warn("[booster-async-cron] dispatch failed", {
              publicationId: job.publicationId,
              channel: job.channel,
              message:
                dispatchError instanceof Error
                  ? dispatchError.message
                  : String(dispatchError || ""),
            });
          }
        }),
      );
    });
  }

  return NextResponse.json({
    ok: true,
    queued: jobs.filter((job) => job.status === "queued").length,
    recovered: jobs.filter((job) => job.status === "processing").length,
    publicationIds: Array.from(
      new Set(jobs.map((job: AsyncDispatchJob) => job.publicationId).filter(Boolean)),
    ),
  });
}
