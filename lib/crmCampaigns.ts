import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendMailFromIntegration } from "@/lib/inrsend/sendMailFromIntegration";
import { downloadMailAttachmentRefs, parseMailAttachmentRefs, type MailAttachmentRef } from "@/lib/mailAttachmentRefs";

import { providerBatchLimit } from "@/lib/crmRecipients";

export type MailCampaignStatus = "queued" | "processing" | "sent" | "partial" | "failed";
export type MailCampaignRecipientStatus = "queued" | "processing" | "sent" | "failed";

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return null;
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
  } else if (sentCount === 0 && failedCount === 0) {
    status = "queued";
  }

  const payload = {
    status,
    queued_count: queuedCount,
    sent_count: sentCount,
    failed_count: failedCount,
    updated_at: new Date().toISOString(),
    ...(finishedAt ? { finished_at: finishedAt } : {}),
  };

  const { error } = await supabaseAdmin.from("mail_campaigns").update(payload).eq("id", campaignId);
  if (error) throw error;

  return { queuedCount, processingCount, sentCount, failedCount, status };
}

async function claimQueuedRecipients(campaignId: string, limit: number) {
  const { data: queuedRows, error: loadError } = await supabaseAdmin
    .from("mail_campaign_recipients")
    .select("id,email,contact_id,display_name")
    .eq("campaign_id", campaignId)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (loadError) throw loadError;
  const ids = (queuedRows || []).map((row: any) => String(row.id || "")).filter(Boolean);
  if (ids.length === 0) return [] as Array<Record<string, unknown>>;

  const now = new Date().toISOString();
  const { data: claimedRows, error: claimError } = await supabaseAdmin
    .from("mail_campaign_recipients")
    .update({ status: "processing", updated_at: now })
    .in("id", ids)
    .eq("status", "queued")
    .select("id,email,contact_id,display_name");

  if (claimError) throw claimError;
  return (claimedRows || []) as Array<Record<string, unknown>>;
}

async function resolveCampaignAttachments(refs: MailAttachmentRef[]) {
  if (refs.length === 0) return [] as Array<{ filename: string; mimeType?: string; content: Buffer }>;
  return downloadMailAttachmentRefs(supabaseAdmin as any, refs);
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
    microsoft: opts?.perProviderBudget?.microsoft ?? 40,
    imap: opts?.perProviderBudget?.imap ?? 40,
  };

  const summary = {
    campaignsProcessed: 0,
    recipientsProcessed: 0,
    sent: 0,
    failed: 0,
  };

  for (const rawCampaign of campaigns || []) {
    const campaign = asRecord(rawCampaign);
    const campaignId = asString(campaign.id) || "";
    const userId = asString(campaign.user_id) || "";
    const integrationId = asString(campaign.integration_id) || "";
    const provider = (asString(campaign.provider) || "imap").toLowerCase() as "gmail" | "microsoft" | "imap";
    if (!campaignId || !userId || !integrationId) continue;

    const budget = Math.max(1, Number((budgets as any)[provider] ?? providerBatchLimit(provider)));
    const claimedRows = await claimQueuedRecipients(campaignId, budget);

    if (claimedRows.length === 0) {
      await refreshCampaignCounters(campaignId);
      continue;
    }

    summary.campaignsProcessed += 1;

    await supabaseAdmin
      .from("mail_campaigns")
      .update({ status: "processing", started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", campaignId)
      .in("status", ["queued", "processing"]);

    let attachments: Array<{ filename: string; mimeType?: string; content: Buffer }> = [];
    try {
      attachments = await resolveCampaignAttachments(parseMailAttachmentRefs(campaign.attachments));
    } catch (attachmentError) {
      const message = attachmentError instanceof Error ? attachmentError.message : "Impossible de charger les pièces jointes.";
      const now = new Date().toISOString();
      for (const row of claimedRows) {
        const id = asString(row.id) || "";
        if (!id) continue;
        await supabaseAdmin
          .from("mail_campaign_recipients")
          .update({ status: "failed", error: message, updated_at: now })
          .eq("id", id)
          .eq("status", "processing");
        summary.recipientsProcessed += 1;
        summary.failed += 1;
      }
      await supabaseAdmin.from("mail_campaigns").update({ last_error: message, updated_at: now }).eq("id", campaignId);
      await refreshCampaignCounters(campaignId);
      continue;
    }

    for (const row of claimedRows) {
      const recipientId = asString(row.id) || "";
      const email = asString(row.email) || "";
      if (!recipientId || !email) continue;

      try {
        await sendMailFromIntegration({
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
          .update({ status: "sent", sent_at: new Date().toISOString(), error: null, updated_at: new Date().toISOString() })
          .eq("id", recipientId)
          .eq("status", "processing");

        summary.sent += 1;
      } catch (sendError) {
        const message = sendError instanceof Error ? sendError.message : "Envoi impossible.";
        await supabaseAdmin
          .from("mail_campaign_recipients")
          .update({ status: "failed", error: message, updated_at: new Date().toISOString() })
          .eq("id", recipientId)
          .eq("status", "processing");

        await supabaseAdmin.from("mail_campaigns").update({ last_error: message, updated_at: new Date().toISOString() }).eq("id", campaignId);
        summary.failed += 1;
      }

      summary.recipientsProcessed += 1;
    }

    await refreshCampaignCounters(campaignId);
  }

  return summary;
}
