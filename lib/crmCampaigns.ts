import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendMailFromIntegration } from "@/lib/inrsend/sendMailFromIntegration";
import { textToSimpleHtml } from "@/lib/inrsendSignature";
import { normalizeMailSubject } from "@/lib/mailEncoding";
import { downloadMailAttachmentRefs, parseMailAttachmentRefs, type MailAttachmentRef } from "@/lib/mailAttachmentRefs";
import { providerBatchLimit } from "@/lib/crmRecipients";
import {
  appendUnsubscribeFooterToHtml,
  appendUnsubscribeFooterToText,
  buildRecipientUnsubscribeUrl,
  classifyMailFailure,
  fetchSuppressedEmailsByUser,
  getSuppressionReasonLabel,
  upsertSuppressionEntry,
} from "@/lib/mailSuppression";

export type MailCampaignStatus = "queued" | "processing" | "paused" | "partial" | "completed" | "failed";
export type MailCampaignRecipientStatus = "queued" | "processing" | "sent" | "failed";

export type MailCampaignDeliveryConfig = {
  batchSize: number;
  hourlyLimit: number;
  dailyLimit: number;
  maxActivePerIntegration: number;
};

export type CampaignDispatchState = {
  state: "ready" | "waiting_turn" | "paused";
  reason: string | null;
  batchSize: number;
  hourlyLimit: number;
  dailyLimit: number;
  maxActivePerIntegration: number;
  sentLastHour: number;
  sentLastDay: number;
  hourlyRemaining: number;
  dailyRemaining: number;
  availableNow: number;
};

type RecipientRow = Record<string, unknown>;

const DEFAULT_MAX_ATTEMPTS = 3;
const STALE_PROCESSING_MINUTES = 20;
const RECENT_COUNT_PAGE_SIZE = 500;
const RECENT_COUNT_BATCH_SIZE = 200;

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return null;
}

function asNumber(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parsePositiveEnvInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function getMailCampaignDeliveryConfig(): MailCampaignDeliveryConfig {
  return {
    batchSize: parsePositiveEnvInt(process.env.INRSEND_CAMPAIGN_BATCH_SIZE, 50, 1, 200),
    hourlyLimit: parsePositiveEnvInt(process.env.INRSEND_CAMPAIGN_HOURLY_LIMIT, 250, 1, 100000),
    dailyLimit: parsePositiveEnvInt(process.env.INRSEND_CAMPAIGN_DAILY_LIMIT, 1000, 1, 1000000),
    maxActivePerIntegration: parsePositiveEnvInt(process.env.INRSEND_CAMPAIGN_MAX_ACTIVE_PER_BOX, 1, 1, 10),
  };
}

function retryDelayMs(attemptCount: number) {
  if (attemptCount <= 1) return 60_000;
  if (attemptCount === 2) return 5 * 60_000;
  return 15 * 60_000;
}

function chunkArray<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function buildWaitingTurnMessage() {
  return "Cette boîte traite déjà une autre campagne. La vôtre reste en file d’attente et reprendra automatiquement.";
}

function buildQuotaPauseMessage(state: Pick<CampaignDispatchState, "hourlyLimit" | "dailyLimit" | "sentLastHour" | "sentLastDay" | "hourlyRemaining" | "dailyRemaining">) {
  if (state.dailyRemaining <= 0) {
    return `Quota journalier atteint pour cette boîte (${state.sentLastDay}/${state.dailyLimit} sur 24 h). La campagne reprendra automatiquement.`;
  }
  return `Quota horaire atteint pour cette boîte (${state.sentLastHour}/${state.hourlyLimit} sur 1 h). La campagne reprendra automatiquement.`;
}

async function countRecipientsByStatus(campaignId: string, status: MailCampaignRecipientStatus) {
  const { count, error } = await supabaseAdmin
    .from("mail_campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", status);

  if (error) throw error;
  return count ?? 0;
}

export async function refreshCampaignCounters(campaignId: string) {
  const [{ data: campaignRow, error: campaignError }, queuedCount, processingCount, sentCount, failedCount] = await Promise.all([
    supabaseAdmin.from("mail_campaigns").select("status").eq("id", campaignId).maybeSingle(),
    countRecipientsByStatus(campaignId, "queued"),
    countRecipientsByStatus(campaignId, "processing"),
    countRecipientsByStatus(campaignId, "sent"),
    countRecipientsByStatus(campaignId, "failed"),
  ]);

  if (campaignError) throw campaignError;

  const currentStatus = String((campaignRow as any)?.status || "").toLowerCase();
  let status: MailCampaignStatus = currentStatus === "paused" ? "paused" : "processing";
  let finishedAt: string | null = null;

  if (queuedCount === 0 && processingCount === 0) {
    finishedAt = new Date().toISOString();
    if (failedCount === 0) status = "completed";
    else if (sentCount > 0) status = "partial";
    else status = "failed";
  } else if (currentStatus === "paused" && processingCount === 0) {
    status = "paused";
  } else if (sentCount === 0 && failedCount === 0 && processingCount === 0) {
    status = "queued";
  } else {
    status = "processing";
  }

  const payload: Record<string, unknown> = {
    status,
    queued_count: queuedCount,
    processing_count: processingCount,
    sent_count: sentCount,
    failed_count: failedCount,
    updated_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
    finished_at: finishedAt,
  };

  if (status === "completed") payload.last_error = null;

  const { error } = await supabaseAdmin.from("mail_campaigns").update(payload).eq("id", campaignId);
  if (error) throw error;

  return { queuedCount, processingCount, sentCount, failedCount, status };
}

async function resetStaleProcessingRecipients(campaignId: string) {
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MINUTES * 60_000).toISOString();
  const { data: staleRows, error } = await supabaseAdmin
    .from("mail_campaign_recipients")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("status", "processing")
    .lt("processing_started_at", staleBefore)
    .limit(200);

  if (error) throw error;
  const ids = (staleRows || []).map((row: any) => String(row.id || "")).filter(Boolean);
  if (ids.length === 0) return 0;

  const now = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin
    .from("mail_campaign_recipients")
    .update({
      status: "queued",
      next_attempt_at: now,
      processing_started_at: null,
      updated_at: now,
      error: "Reprise automatique après interruption.",
      last_error: "Reprise automatique après interruption.",
    })
    .in("id", ids)
    .eq("status", "processing");

  if (updateError) throw updateError;
  return ids.length;
}

async function claimQueuedRecipients(campaignId: string, limit: number) {
  const now = new Date().toISOString();
  const { data: queuedRows, error: loadError } = await supabaseAdmin
    .from("mail_campaign_recipients")
    .select("id,email,contact_id,display_name,attempt_count,max_attempts,last_error,suppression_reason,bounce_type,unsubscribed_at")
    .eq("campaign_id", campaignId)
    .eq("status", "queued")
    .lte("next_attempt_at", now)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (loadError) throw loadError;
  const sourceRows = (queuedRows || []) as RecipientRow[];
  if (sourceRows.length === 0) return [] as RecipientRow[];

  const claimed: RecipientRow[] = [];
  for (const row of sourceRows) {
    const id = asString(row.id) || "";
    if (!id) continue;
    const attemptCount = asNumber(row.attempt_count, 0) + 1;
    const { data, error } = await supabaseAdmin
      .from("mail_campaign_recipients")
      .update({
        status: "processing",
        attempt_count: attemptCount,
        processing_started_at: now,
        last_attempt_at: now,
        updated_at: now,
      })
      .eq("id", id)
      .eq("status", "queued")
      .select("id,email,contact_id,display_name,attempt_count,max_attempts,last_error,suppression_reason,bounce_type,unsubscribed_at")
      .maybeSingle();

    if (error) throw error;
    if (data) claimed.push(data as RecipientRow);
  }

  return claimed;
}

async function resolveCampaignAttachments(refs: MailAttachmentRef[]) {
  if (refs.length === 0) return [] as Array<{ filename: string; mimeType?: string; content: Buffer }>;
  return downloadMailAttachmentRefs(supabaseAdmin as any, refs);
}

async function markRecipientBlockedBySuppression(args: {
  recipientId: string;
  reason: "opt_out" | "blacklist" | "hard_bounce" | "complaint";
  message?: string;
}) {
  const now = new Date().toISOString();
  const message = args.message || `Envoi bloqué (${getSuppressionReasonLabel(args.reason)}).`;
  const patch: Record<string, unknown> = {
    status: "failed",
    suppression_reason: args.reason,
    processing_started_at: null,
    error: message,
    last_error: message,
    updated_at: now,
  };
  if (args.reason === "hard_bounce") {
    patch.bounce_type = "hard";
    patch.bounced_at = now;
  }
  if (args.reason === "opt_out") patch.unsubscribed_at = now;
  const { error } = await supabaseAdmin
    .from("mail_campaign_recipients")
    .update(patch)
    .eq("id", args.recipientId)
    .eq("status", "processing");
  if (error) throw error;
}

async function requeueOrFailRecipient(
  recipientId: string,
  row: RecipientRow,
  message: string,
  opts?: { classification?: ReturnType<typeof classifyMailFailure> },
) {
  const attemptCount = Math.max(1, asNumber(row.attempt_count, 1));
  const maxAttempts = Math.max(1, asNumber(row.max_attempts, DEFAULT_MAX_ATTEMPTS));
  const classification = opts?.classification || classifyMailFailure(message);
  const now = new Date().toISOString();

  if (classification.shouldRetry && attemptCount < maxAttempts) {
    const nextAttemptAt = new Date(Date.now() + retryDelayMs(attemptCount)).toISOString();
    const patch: Record<string, unknown> = {
      status: "queued",
      next_attempt_at: nextAttemptAt,
      processing_started_at: null,
      error: message,
      last_error: message,
      updated_at: now,
      bounce_type: classification.bounceType,
    };
    const { error } = await supabaseAdmin
      .from("mail_campaign_recipients")
      .update(patch)
      .eq("id", recipientId)
      .eq("status", "processing");

    if (error) throw error;
    return "queued" as const;
  }

  const patch: Record<string, unknown> = {
    status: "failed",
    processing_started_at: null,
    error: message,
    last_error: message,
    updated_at: now,
    bounce_type: classification.bounceType,
  };
  if (classification.bounceType) patch.bounced_at = now;
  if (classification.suppressionReason) patch.suppression_reason = classification.suppressionReason;

  const { error } = await supabaseAdmin
    .from("mail_campaign_recipients")
    .update(patch)
    .eq("id", recipientId)
    .eq("status", "processing");

  if (error) throw error;
  return "failed" as const;
}

async function listRecentlyUpdatedCampaignIds(userId: string, integrationId: string, sinceIso: string) {
  const ids: string[] = [];
  let from = 0;

  while (true) {
    const to = from + RECENT_COUNT_PAGE_SIZE - 1;
    const { data, error } = await supabaseAdmin
      .from("mail_campaigns")
      .select("id")
      .eq("user_id", userId)
      .eq("integration_id", integrationId)
      .gte("updated_at", sinceIso)
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (error) throw error;
    const rows = (data || []) as Array<{ id?: string | null }>;
    ids.push(...rows.map((row) => String(row?.id || "")).filter(Boolean));
    if (rows.length < RECENT_COUNT_PAGE_SIZE) break;
    from += rows.length;
  }

  return Array.from(new Set(ids));
}

async function countSentRecipientsSince(args: { campaignIds: string[]; sinceIso: string }) {
  if (args.campaignIds.length === 0) return 0;
  let total = 0;

  for (const chunk of chunkArray(args.campaignIds, RECENT_COUNT_BATCH_SIZE)) {
    const { count, error } = await supabaseAdmin
      .from("mail_campaign_recipients")
      .select("id", { count: "exact", head: true })
      .in("campaign_id", chunk)
      .eq("status", "sent")
      .gte("sent_at", args.sinceIso);

    if (error) throw error;
    total += count ?? 0;
  }

  return total;
}

async function countOtherProcessingCampaigns(args: { userId: string; integrationId: string; excludeCampaignId?: string | null }) {
  let query: any = supabaseAdmin
    .from("mail_campaigns")
    .select("id", { count: "exact", head: true })
    .eq("user_id", args.userId)
    .eq("integration_id", args.integrationId)
    .eq("status", "processing");

  if (args.excludeCampaignId) query = query.neq("id", args.excludeCampaignId);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function evaluateCampaignDispatchState(args: {
  userId: string;
  integrationId: string;
  currentCampaignId?: string | null;
}) {
  const config = getMailCampaignDeliveryConfig();
  const processingCount = await countOtherProcessingCampaigns({
    userId: args.userId,
    integrationId: args.integrationId,
    excludeCampaignId: args.currentCampaignId || null,
  });

  if (processingCount >= config.maxActivePerIntegration) {
    return {
      state: "waiting_turn" as const,
      reason: buildWaitingTurnMessage(),
      batchSize: config.batchSize,
      hourlyLimit: config.hourlyLimit,
      dailyLimit: config.dailyLimit,
      maxActivePerIntegration: config.maxActivePerIntegration,
      sentLastHour: 0,
      sentLastDay: 0,
      hourlyRemaining: Math.max(0, config.hourlyLimit),
      dailyRemaining: Math.max(0, config.dailyLimit),
      availableNow: 0,
    } satisfies CampaignDispatchState;
  }

  const hourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const dayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recentSince = hourAgoIso < dayAgoIso ? hourAgoIso : dayAgoIso;
  const campaignIds = await listRecentlyUpdatedCampaignIds(args.userId, args.integrationId, recentSince);

  const [sentLastHour, sentLastDay] = await Promise.all([
    countSentRecipientsSince({ campaignIds, sinceIso: hourAgoIso }),
    countSentRecipientsSince({ campaignIds, sinceIso: dayAgoIso }),
  ]);

  const hourlyRemaining = Math.max(0, config.hourlyLimit - sentLastHour);
  const dailyRemaining = Math.max(0, config.dailyLimit - sentLastDay);
  const availableNow = Math.max(0, Math.min(config.batchSize, providerBatchLimit(null), hourlyRemaining, dailyRemaining));

  if (availableNow <= 0) {
    const state: CampaignDispatchState = {
      state: "paused",
      reason: buildQuotaPauseMessage({
        hourlyLimit: config.hourlyLimit,
        dailyLimit: config.dailyLimit,
        sentLastHour,
        sentLastDay,
        hourlyRemaining,
        dailyRemaining,
      }),
      batchSize: config.batchSize,
      hourlyLimit: config.hourlyLimit,
      dailyLimit: config.dailyLimit,
      maxActivePerIntegration: config.maxActivePerIntegration,
      sentLastHour,
      sentLastDay,
      hourlyRemaining,
      dailyRemaining,
      availableNow,
    };
    return state;
  }

  const state: CampaignDispatchState = {
    state: "ready",
    reason: null,
    batchSize: config.batchSize,
    hourlyLimit: config.hourlyLimit,
    dailyLimit: config.dailyLimit,
    maxActivePerIntegration: config.maxActivePerIntegration,
    sentLastHour,
    sentLastDay,
    hourlyRemaining,
    dailyRemaining,
    availableNow,
  };
  return state;
}

async function markCampaignQueuedWaitingTurn(campaignId: string, reason?: string | null) {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("mail_campaigns")
    .update({
      status: "queued",
      finished_at: null,
      last_error: reason || buildWaitingTurnMessage(),
      updated_at: now,
      last_activity_at: now,
    })
    .eq("id", campaignId)
    .neq("status", "completed");
  if (error) throw error;
}

async function pauseCampaignForQuota(campaignId: string, reason: string) {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("mail_campaigns")
    .update({
      status: "paused",
      finished_at: null,
      last_error: reason,
      updated_at: now,
      last_activity_at: now,
    })
    .eq("id", campaignId)
    .neq("status", "completed");
  if (error) throw error;
}

export async function processPendingMailCampaigns(opts?: {
  campaignIds?: string[];
  maxCampaigns?: number;
  perProviderBudget?: Partial<Record<"gmail" | "microsoft" | "imap", number>>;
}) {
  const maxCampaigns = Math.max(1, Number(opts?.maxCampaigns || 10));
  const campaignIds = Array.isArray(opts?.campaignIds) ? opts!.campaignIds.filter(Boolean) : [];

  let query = supabaseAdmin
    .from("mail_campaigns")
    .select("id,user_id,integration_id,provider,type,subject,body_text,body_html,attachments,status,folder")
    .in("status", ["queued", "processing", "paused"])
    .order("created_at", { ascending: true })
    .limit(maxCampaigns);

  if (campaignIds.length > 0) query = query.in("id", campaignIds);

  const { data: campaigns, error } = await query;
  if (error) throw error;

  const config = getMailCampaignDeliveryConfig();
  const budgets = {
    gmail: opts?.perProviderBudget?.gmail ?? config.batchSize,
    microsoft: opts?.perProviderBudget?.microsoft ?? config.batchSize,
    imap: opts?.perProviderBudget?.imap ?? config.batchSize,
  };

  const summary = {
    campaignsProcessed: 0,
    recipientsProcessed: 0,
    sent: 0,
    failed: 0,
    retried: 0,
    paused: 0,
    waiting: 0,
  };

  const busyIntegrationIds = new Set<string>();

  for (const rawCampaign of campaigns || []) {
    const campaign = asRecord(rawCampaign);
    const campaignId = asString(campaign.id) || "";
    const userId = asString(campaign.user_id) || "";
    const integrationId = asString(campaign.integration_id) || "";
    const provider = (asString(campaign.provider) || "imap").toLowerCase() as "gmail" | "microsoft" | "imap";
    if (!campaignId || !userId || !integrationId) continue;

    await resetStaleProcessingRecipients(campaignId);

    const dispatchState = await evaluateCampaignDispatchState({
      userId,
      integrationId,
      currentCampaignId: campaignId,
    });

    if (busyIntegrationIds.has(integrationId) || dispatchState.state === "waiting_turn") {
      await markCampaignQueuedWaitingTurn(campaignId, dispatchState.reason);
      busyIntegrationIds.add(integrationId);
      summary.waiting += 1;
      continue;
    }

    if (dispatchState.state === "paused") {
      await pauseCampaignForQuota(campaignId, dispatchState.reason || buildQuotaPauseMessage(dispatchState));
      busyIntegrationIds.add(integrationId);
      summary.paused += 1;
      continue;
    }

    const providerBudget = Math.max(1, Number((budgets as any)[provider] ?? providerBatchLimit(provider)));
    const budget = Math.max(1, Math.min(dispatchState.availableNow, providerBudget, providerBatchLimit(provider)));
    const claimedRows = await claimQueuedRecipients(campaignId, budget);

    if (claimedRows.length === 0) {
      const counters = await refreshCampaignCounters(campaignId);
      if (counters.status === "processing" || counters.status === "queued" || counters.status === "paused") {
        busyIntegrationIds.add(integrationId);
      }
      continue;
    }

    summary.campaignsProcessed += 1;

    const suppressedByEmail = await fetchSuppressedEmailsByUser(
      userId,
      claimedRows.map((row) => asString(row.email) || ""),
    );

    await supabaseAdmin
      .from("mail_campaigns")
      .update({
        status: "processing",
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", campaignId)
      .in("status", ["queued", "processing", "paused"]);

    let attachments: Array<{ filename: string; mimeType?: string; content: Buffer }> = [];
    try {
      attachments = await resolveCampaignAttachments(parseMailAttachmentRefs(campaign.attachments));
    } catch (attachmentError) {
      const message = attachmentError instanceof Error ? attachmentError.message : "Impossible de charger les pièces jointes.";
      const now = new Date().toISOString();
      for (const row of claimedRows) {
        const recipientId = asString(row.id) || "";
        if (!recipientId) continue;
        const result = await requeueOrFailRecipient(recipientId, row, message);
        summary.recipientsProcessed += 1;
        if (result === "failed") summary.failed += 1;
        else summary.retried += 1;
      }
      await supabaseAdmin
        .from("mail_campaigns")
        .update({ last_error: message, updated_at: now, last_activity_at: now })
        .eq("id", campaignId);
      const counters = await refreshCampaignCounters(campaignId);
      if (counters.status === "processing" || counters.status === "queued" || counters.status === "paused") {
        busyIntegrationIds.add(integrationId);
      }
      continue;
    }

    for (const row of claimedRows) {
      const recipientId = asString(row.id) || "";
      const email = asString(row.email) || "";
      if (!recipientId || !email) continue;

      const suppressed = suppressedByEmail.get(String(email).toLowerCase());
      if (suppressed?.reason) {
        await markRecipientBlockedBySuppression({
          recipientId,
          reason: suppressed.reason,
          message: `Envoi bloqué (${getSuppressionReasonLabel(suppressed.reason)}).`,
        });
        summary.failed += 1;
        summary.recipientsProcessed += 1;
        continue;
      }

      const unsubscribeUrl = buildRecipientUnsubscribeUrl(campaignId, recipientId);
      const rawTextBody = asString(campaign.body_text) || "";
      const rawHtmlBody = asString(campaign.body_html) || "";
      const textBody = appendUnsubscribeFooterToText(rawTextBody, unsubscribeUrl);
      const htmlBase = rawHtmlBody.trim() ? rawHtmlBody : textToSimpleHtml(rawTextBody);
      const htmlBody = appendUnsubscribeFooterToHtml(htmlBase, unsubscribeUrl);

      try {
        const sendResult = await sendMailFromIntegration({
          userId,
          accountId: integrationId,
          to: email,
          subject: normalizeMailSubject(asString(campaign.subject) || "(sans objet)"),
          text: textBody,
          html: htmlBody || undefined,
          attachments,
        });

        await supabaseAdmin
          .from("mail_campaign_recipients")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            error: null,
            last_error: null,
            processing_started_at: null,
            provider_message_id: sendResult.providerMessageId || null,
            updated_at: new Date().toISOString(),
            bounce_type: null,
            bounced_at: null,
            suppression_reason: null,
            delivery_status: "accepted",
            delivery_event: "accepted",
            delivery_last_event_at: new Date().toISOString(),
          })
          .eq("id", recipientId)
          .eq("status", "processing");

        summary.sent += 1;
      } catch (sendError) {
        const message = sendError instanceof Error ? sendError.message : "Envoi impossible.";
        const classification = classifyMailFailure(message);
        if (classification.shouldSuppress && classification.suppressionReason) {
          await upsertSuppressionEntry({
            user_id: userId,
            email,
            reason: classification.suppressionReason,
            source: classification.kind === "complaint" ? "delivery_feedback" : "delivery_bounce",
            campaign_id: campaignId,
            recipient_id: recipientId,
            note: message.slice(0, 500),
          });
        }
        const result = await requeueOrFailRecipient(recipientId, row, message, { classification });
        await supabaseAdmin
          .from("mail_campaigns")
          .update({ last_error: message, updated_at: new Date().toISOString(), last_activity_at: new Date().toISOString() })
          .eq("id", campaignId);
        if (result === "failed") summary.failed += 1;
        else summary.retried += 1;
      }

      summary.recipientsProcessed += 1;
    }

    const counters = await refreshCampaignCounters(campaignId);
    if (counters.status === "processing" || counters.status === "queued" || counters.status === "paused") {
      busyIntegrationIds.add(integrationId);
    }
  }

  return summary;
}
