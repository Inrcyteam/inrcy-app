import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendMailFromIntegration } from "@/lib/inrsend/sendMailFromIntegration";
import { downloadMailAttachmentRefs, parseMailAttachmentRefs, type MailAttachmentRef } from "@/lib/mailAttachmentRefs";
import { providerBatchLimit } from "@/lib/crmRecipients";

export type MailCampaignStatus = "queued" | "processing" | "sent" | "partial" | "failed";
export type MailCampaignRecipientStatus = "queued" | "processing" | "sent" | "failed";

type RecipientRow = Record<string, unknown>;

const DEFAULT_MAX_ATTEMPTS = 3;
const STALE_PROCESSING_MINUTES = 20;

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

function retryDelayMs(attemptCount: number) {
  if (attemptCount <= 1) return 60_000;
  if (attemptCount === 2) return 5 * 60_000;
  return 15 * 60_000;
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

async function refreshCampaignCounters(campaignId: string) {
  const [queuedCount, processingCount, sentCount, failedCount] = await Promise.all([
    countRecipientsByStatus(campaignId, "queued"),
    countRecipientsByStatus(campaignId, "processing"),
    countRecipientsByStatus(campaignId, "sent"),
    countRecipientsByStatus(campaignId, "failed"),
  ]);

  let status: MailCampaignStatus = "processing";
  let finishedAt: string | null = null;

  if (queuedCount === 0 && processingCount === 0) {
    finishedAt = new Date().toISOString();
    if (failedCount === 0) status = "sent";
    else if (sentCount > 0) status = "partial";
    else status = "failed";
  } else if (sentCount === 0 && failedCount === 0 && processingCount === 0) {
    status = "queued";
  }

  const payload: Record<string, unknown> = {
    status,
    queued_count: queuedCount,
    processing_count: processingCount,
    sent_count: sentCount,
    failed_count: failedCount,
    updated_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
    ...(finishedAt ? { finished_at: finishedAt } : {}),
  };

  if (status === "sent") payload.last_error = null;

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
    .select("id,email,contact_id,display_name,attempt_count,max_attempts,last_error")
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
      .select("id,email,contact_id,display_name,attempt_count,max_attempts,last_error")
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

async function requeueOrFailRecipient(recipientId: string, row: RecipientRow, message: string) {
  const attemptCount = Math.max(1, asNumber(row.attempt_count, 1));
  const maxAttempts = Math.max(1, asNumber(row.max_attempts, DEFAULT_MAX_ATTEMPTS));
  const now = new Date().toISOString();

  if (attemptCount < maxAttempts) {
    const nextAttemptAt = new Date(Date.now() + retryDelayMs(attemptCount)).toISOString();
    const { error } = await supabaseAdmin
      .from("mail_campaign_recipients")
      .update({
        status: "queued",
        next_attempt_at: nextAttemptAt,
        processing_started_at: null,
        error: message,
        last_error: message,
        updated_at: now,
      })
      .eq("id", recipientId)
      .eq("status", "processing");

    if (error) throw error;
    return "queued" as const;
  }

  const { error } = await supabaseAdmin
    .from("mail_campaign_recipients")
    .update({
      status: "failed",
      processing_started_at: null,
      error: message,
      last_error: message,
      updated_at: now,
    })
    .eq("id", recipientId)
    .eq("status", "processing");

  if (error) throw error;
  return "failed" as const;
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
    .select("id,user_id,integration_id,provider,type,subject,body_text,body_html,attachments,status")
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: true })
    .limit(maxCampaigns);

  if (campaignIds.length > 0) query = query.in("id", campaignIds);

  const { data: campaigns, error } = await query;
  if (error) throw error;

  const budgets = {
    gmail: opts?.perProviderBudget?.gmail ?? 20,
    microsoft: opts?.perProviderBudget?.microsoft ?? 20,
    imap: opts?.perProviderBudget?.imap ?? 20,
  };

  const summary = {
    campaignsProcessed: 0,
    recipientsProcessed: 0,
    sent: 0,
    failed: 0,
    retried: 0,
  };

  for (const rawCampaign of campaigns || []) {
    const campaign = asRecord(rawCampaign);
    const campaignId = asString(campaign.id) || "";
    const userId = asString(campaign.user_id) || "";
    const integrationId = asString(campaign.integration_id) || "";
    const provider = (asString(campaign.provider) || "imap").toLowerCase() as "gmail" | "microsoft" | "imap";
    if (!campaignId || !userId || !integrationId) continue;

    await resetStaleProcessingRecipients(campaignId);

    const budget = Math.max(1, Number((budgets as any)[provider] ?? providerBatchLimit(provider)));
    const claimedRows = await claimQueuedRecipients(campaignId, budget);

    if (claimedRows.length === 0) {
      await refreshCampaignCounters(campaignId);
      continue;
    }

    summary.campaignsProcessed += 1;

    await supabaseAdmin
      .from("mail_campaigns")
      .update({ status: "processing", started_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_activity_at: new Date().toISOString() })
      .eq("id", campaignId)
      .in("status", ["queued", "processing"]);

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
      await supabaseAdmin.from("mail_campaigns").update({ last_error: message, updated_at: now, last_activity_at: now }).eq("id", campaignId);
      await refreshCampaignCounters(campaignId);
      continue;
    }

    for (const row of claimedRows) {
      const recipientId = asString(row.id) || "";
      const email = asString(row.email) || "";
      if (!recipientId || !email) continue;

      try {
        const sendResult = await sendMailFromIntegration({
          userId,
          accountId: integrationId,
          to: email,
          subject: asString(campaign.subject) || "(sans objet)",
          text: asString(campaign.body_text) || "",
          html: asString(campaign.body_html) || undefined,
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
          })
          .eq("id", recipientId)
          .eq("status", "processing");

        summary.sent += 1;
      } catch (sendError) {
        const message = sendError instanceof Error ? sendError.message : "Envoi impossible.";
        const result = await requeueOrFailRecipient(recipientId, row, message);
        await supabaseAdmin.from("mail_campaigns").update({ last_error: message, updated_at: new Date().toISOString(), last_activity_at: new Date().toISOString() }).eq("id", campaignId);
        if (result === "failed") summary.failed += 1;
        else summary.retried += 1;
      }

      summary.recipientsProcessed += 1;
    }

    await refreshCampaignCounters(campaignId);
  }

  return summary;
}
