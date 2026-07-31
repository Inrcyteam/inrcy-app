import "server-only";

import { completeExecutionIdempotencyLock, failExecutionIdempotencyLock } from "@/lib/executionIdempotency";
import { syncPublicationWorkspaceContext } from "@/lib/mediaWorkspaceConsumption";
import {
  BOOSTER_PUBLICATION_CHANNEL_LABELS as CHANNEL_LABELS,
  isBoosterPublicationChannel,
  isBoosterPublishFailureRetryable,
  type BoosterPublicationChannelKey,
} from "@/lib/boosterPublicationPolicy";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const BOOSTER_ASYNC_JOB_EVENT_TYPE = "publish_async_job";
export const BOOSTER_ASYNC_CHANNEL_EVENT_TYPE = "publish_async_channel";
export const BOOSTER_ASYNC_CHANNEL_SCOPE = "booster_publish_channel";
export const BOOSTER_ASYNC_CHANNEL_LOCK_TTL_MS = 5 * 60 * 1000;

export type BoosterAsyncChannelKey = BoosterPublicationChannelKey;

type JsonRecord = Record<string, unknown>;
type AppEventPayloadRow = { id: string; payload: unknown };

const TERMINAL_CHANNEL_STATUSES = new Set(["completed", "failed"]);

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function cleanString(value: unknown) {
  return String(value || "").trim();
}

function asChannel(value: unknown): BoosterAsyncChannelKey | null {
  const channel = cleanString(value);
  return isBoosterPublicationChannel(channel) ? channel : null;
}

export function buildAsyncPublicationSummary(
  results: Record<string, unknown>,
  selected: BoosterAsyncChannelKey[],
) {
  const entries = selected.map((channel) => {
    const value = asRecord(results[channel]);
    const ok = value.ok !== false;
    const code = cleanString(value.code) || null;
    const retryable = isBoosterPublishFailureRetryable({
      ok,
      code,
      retryable: value.retryable,
    });
    return {
      channel,
      label: CHANNEL_LABELS[channel],
      ok,
      status: ok
        ? value.warning
          ? "processing"
          : "published"
        : "failed",
      code,
      retryable,
      error: !ok ? cleanString(value.error) || "erreur" : null,
      warning: value.warning ? cleanString(value.warning) : null,
      warning_message: value.warning_message
        ? cleanString(value.warning_message)
        : null,
    };
  });

  const successes = entries.filter((entry) => entry.ok);
  const failures = entries.filter((entry) => !entry.ok);
  return {
    total: entries.length,
    successCount: successes.length,
    failureCount: failures.length,
    pendingCount: 0,
    allSucceeded: failures.length === 0,
    allFailed: successes.length === 0,
    entries,
    successChannels: successes.map((entry) => entry.channel),
    failedChannels: failures.map((entry) => entry.channel),
  };
}

export async function updateAsyncChannelEvent(params: {
  userId: string;
  eventId: string;
  patch: JsonRecord;
}) {
  const { data, error } = await supabaseAdmin
    .from("app_events")
    .select("id,payload")
    .eq("id", params.eventId)
    .eq("user_id", params.userId)
    .eq("type", BOOSTER_ASYNC_CHANNEL_EVENT_TYPE)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const nextPayload = {
    ...asRecord(data.payload),
    ...params.patch,
    updatedAt: new Date().toISOString(),
  };
  const { error: updateError } = await supabaseAdmin
    .from("app_events")
    .update({ payload: nextPayload })
    .eq("id", params.eventId)
    .eq("user_id", params.userId)
    .eq("type", BOOSTER_ASYNC_CHANNEL_EVENT_TYPE);
  if (updateError) throw updateError;
  return nextPayload;
}

export async function finalizeAsyncPublicationIfReady(params: {
  userId: string;
  publicationId: string;
}) {
  const { data: parent, error: parentError } = await supabaseAdmin
    .from("app_events")
    .select("id,module,type,payload,created_at")
    .eq("id", params.publicationId)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (parentError) throw parentError;
  if (!parent) return { finalized: false, missing: true };
  if (String(parent.type || "") !== BOOSTER_ASYNC_JOB_EVENT_TYPE) {
    return {
      finalized: true,
      payload: asRecord(parent.payload),
      eventType: String(parent.type || "publish"),
    };
  }

  const parentPayload = asRecord(parent.payload);
  const selected = (Array.isArray(parentPayload.channels)
    ? parentPayload.channels
    : [])
    .map(asChannel)
    .filter((value): value is BoosterAsyncChannelKey => Boolean(value));
  const channelEventIds = asRecord(parentPayload.channelEventIds);
  const ids = selected
    .map((channel) => cleanString(channelEventIds[channel]))
    .filter(Boolean);
  if (!selected.length || ids.length !== selected.length) {
    return { finalized: false, invalidJob: true };
  }

  const { data: channelEvents, error: channelError } = await supabaseAdmin
    .from("app_events")
    .select("id,payload")
    .eq("user_id", params.userId)
    .eq("type", BOOSTER_ASYNC_CHANNEL_EVENT_TYPE)
    .in("id", ids);
  if (channelError) throw channelError;

  const eventById = new Map<string, JsonRecord>(
    ((channelEvents || []) as AppEventPayloadRow[]).map((row) => [
      String(row.id),
      asRecord(row.payload),
    ]),
  );
  const channelStates = selected.map((channel) => {
    const eventId = cleanString(channelEventIds[channel]);
    const payload: JsonRecord = eventById.get(eventId) || {};
    return {
      channel,
      eventId,
      status: cleanString(payload.status) || "queued",
      result: asRecord(payload.result),
    };
  });

  if (
    channelStates.some(
      (state) => !TERMINAL_CHANNEL_STATUSES.has(state.status),
    )
  ) {
    return {
      finalized: false,
      pendingChannels: channelStates
        .filter((state) => !TERMINAL_CHANNEL_STATUSES.has(state.status))
        .map((state) => state.channel),
    };
  }

  const results = Object.fromEntries(
    channelStates.map((state) => [
      state.channel,
      Object.keys(state.result).length
        ? state.result
        : {
            ok: state.status === "completed",
            error:
              state.status === "failed"
                ? "La publication n'a pas pu être finalisée sur ce canal."
                : null,
          },
    ]),
  );
  const summary = buildAsyncPublicationSummary(results, selected);
  const finalPayloadBase = asRecord(parentPayload.finalPayloadBase);
  const finalEventType = cleanString(parentPayload.finalEventType) || "publish";
  const finalStatus = summary.allFailed
    ? "failed"
    : summary.failureCount > 0
      ? "partial"
      : "completed";
  const completedAt = new Date().toISOString();
  const finalPayload = {
    ...finalPayloadBase,
    publication_id: params.publicationId,
    attemptedChannels: selected,
    channels: summary.successChannels,
    results,
    summary,
    status: finalStatus,
    completedAt,
    asyncDispatch: true,
  };

  const { data: updatedRows, error: updateError } = await supabaseAdmin
    .from("app_events")
    .update({ type: finalEventType, payload: finalPayload })
    .eq("id", params.publicationId)
    .eq("user_id", params.userId)
    .eq("type", BOOSTER_ASYNC_JOB_EVENT_TYPE)
    .select("id");
  if (updateError) throw updateError;

  // Another channel may have finalized a few milliseconds earlier.
  if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
    const { data: current } = await supabaseAdmin
      .from("app_events")
      .select("type,payload")
      .eq("id", params.publicationId)
      .eq("user_id", params.userId)
      .maybeSingle();
    return {
      finalized: String(current?.type || "") !== BOOSTER_ASYNC_JOB_EVENT_TYPE,
      payload: asRecord(current?.payload),
      summary,
    };
  }

  const workspaceId = cleanString(parentPayload.mediaWorkspaceId);
  if (workspaceId) {
    await syncPublicationWorkspaceContext({
      accountId: params.userId,
      workspaceId,
      operation: "publish",
      status: summary.allFailed ? "failed" : "published",
      metadata: {
        publicationId: params.publicationId,
        summary,
        successfulChannels: summary.successChannels,
        failureStage: summary.allFailed ? "publish_results" : null,
      },
    }).catch((error) => {
      console.warn("[booster-async] workspace finalization failed", {
        publicationId: params.publicationId,
        message: error instanceof Error ? error.message : String(error || ""),
      });
    });
  }

  const parentLockId = cleanString(parentPayload.parentIdempotencyLockId);
  if (summary.allFailed) {
    await failExecutionIdempotencyLock({
      supabase: supabaseAdmin,
      lockId: parentLockId || null,
      error: "Aucun canal publié avec succès.",
      result: { publicationId: params.publicationId, summary, results },
      metadata: { stage: "publish_results", asyncDispatch: true },
    });
  } else {
    await completeExecutionIdempotencyLock({
      supabase: supabaseAdmin,
      lockId: parentLockId || null,
      result: {
        ok: true,
        publication_id: params.publicationId,
        results,
        summary,
        queued: false,
        asyncDispatch: true,
      },
      metadata: {
        publicationId: params.publicationId,
        summary,
        asyncDispatch: true,
      },
    });
  }

  // Channel events are purely technical. Remove them only once the parent
  // event contains the complete detailed result used by iNr'Send.
  await supabaseAdmin
    .from("app_events")
    .delete()
    .eq("user_id", params.userId)
    .eq("type", BOOSTER_ASYNC_CHANNEL_EVENT_TYPE)
    .in("id", ids)
    .then(({ error }: { error?: { message: string } | null }) => {
      if (error) {
        console.warn("[booster-async] channel event cleanup failed", {
          publicationId: params.publicationId,
          message: error.message,
        });
      }
    });

  return { finalized: true, payload: finalPayload, summary, results };
}

export async function readAsyncPublicationStatus(params: {
  userId: string;
  publicationId: string;
}) {
  const { data: parent, error } = await supabaseAdmin
    .from("app_events")
    .select("id,module,type,payload,created_at")
    .eq("id", params.publicationId)
    .eq("user_id", params.userId)
    .maybeSingle();
  if (error) throw error;
  if (!parent) return null;

  const type = String(parent.type || "");
  const payload = asRecord(parent.payload);
  if (type !== BOOSTER_ASYNC_JOB_EVENT_TYPE) {
    return {
      ok: String(payload.status || "") !== "failed",
      done: true,
      queued: false,
      publication_id: params.publicationId,
      ...payload,
    };
  }

  const selected = (Array.isArray(payload.channels) ? payload.channels : [])
    .map(asChannel)
    .filter((value): value is BoosterAsyncChannelKey => Boolean(value));
  const channelEventIds = asRecord(payload.channelEventIds);
  const ids = selected
    .map((channel) => cleanString(channelEventIds[channel]))
    .filter(Boolean);
  const { data: channelEvents, error: channelError } = ids.length
    ? await supabaseAdmin
        .from("app_events")
        .select("id,payload")
        .eq("user_id", params.userId)
        .eq("type", BOOSTER_ASYNC_CHANNEL_EVENT_TYPE)
        .in("id", ids)
    : { data: [], error: null };
  if (channelError) throw channelError;
  const eventById = new Map<string, JsonRecord>(
    ((channelEvents || []) as AppEventPayloadRow[]).map((row) => [
      String(row.id),
      asRecord(row.payload),
    ]),
  );

  const entries = selected.map((channel) => {
    const eventId = cleanString(channelEventIds[channel]);
    const channelPayload: JsonRecord = eventById.get(eventId) || {};
    const status = cleanString(channelPayload.status) || "queued";
    const result = asRecord(channelPayload.result);
    return {
      channel,
      label: CHANNEL_LABELS[channel],
      status,
      ok: TERMINAL_CHANNEL_STATUSES.has(status)
        ? result.ok !== false && status !== "failed"
        : null,
      error: cleanString(result.error) || null,
    };
  });
  const pendingCount = entries.filter(
    (entry) => !TERMINAL_CHANNEL_STATUSES.has(entry.status),
  ).length;

  return {
    ok: true,
    done: false,
    queued: true,
    publication_id: params.publicationId,
    status: "processing",
    summary: {
      total: entries.length,
      successCount: entries.filter((entry) => entry.ok === true).length,
      failureCount: entries.filter((entry) => entry.ok === false).length,
      pendingCount,
      allSucceeded: false,
      allFailed: false,
      entries,
      successChannels: entries
        .filter((entry) => entry.ok === true)
        .map((entry) => entry.channel),
      failedChannels: entries
        .filter((entry) => entry.ok === false)
        .map((entry) => entry.channel),
    },
  };
}
