import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getMailCampaignDeliveryConfig, type MailCampaignDeliveryConfig } from "@/lib/mailCampaignPacing";
import { resolveMailboxReputationPolicy } from "@/lib/mailboxReputation";
import { buildMailCampaignExperienceReport, type MailCampaignExperienceReport } from "@/lib/mailCampaignReport";

function isMissingStep4Column(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code || "");
  const message = String((error as { message?: unknown } | null)?.message || "").toLowerCase();
  return code === "42703" || message.includes("report_summary") || message.includes("estimated_completion_at");
}

export async function loadAndPersistMailCampaignReport(args: {
  campaignId: string;
  userId?: string | null;
  config?: MailCampaignDeliveryConfig | null;
}): Promise<MailCampaignExperienceReport | null> {
  let campaignQuery = supabaseAdmin
    .from("mail_campaigns")
    .select("*")
    .eq("id", args.campaignId);
  if (args.userId) campaignQuery = campaignQuery.eq("user_id", args.userId);
  const { data: campaign, error: campaignError } = await campaignQuery.maybeSingle();
  if (campaignError) throw campaignError;
  if (!campaign?.id) return null;

  const { data: recipients, error: recipientsError } = await supabaseAdmin
    .from("mail_campaign_recipients")
    .select("status,delivery_status,suppression_reason,bounce_type,failure_kind,failure_retryable,unsubscribed_at")
    .eq("campaign_id", args.campaignId)
    .eq("user_id", String(campaign.user_id || ""))
    .limit(1000);
  if (recipientsError) throw recipientsError;

  let config = args.config || null;
  if (!config) {
    try {
      const policy = await resolveMailboxReputationPolicy({
        userId: String(campaign.user_id || ""),
        integrationId: String(campaign.integration_id || ""),
        provider: String(campaign.provider || "imap"),
      });
      config = policy.config;
    } catch {
      config = getMailCampaignDeliveryConfig();
    }
  }

  const report = buildMailCampaignExperienceReport({
    campaign: campaign as Record<string, unknown>,
    recipients: (recipients || []) as Array<Record<string, unknown>>,
    config,
  });

  const patch = {
    progress_percent: report.progressPercent,
    estimated_completion_at: report.estimatedCompletionAt,
    report_summary: report,
    report_updated_at: report.generatedAt,
  };
  const { error: updateError } = await supabaseAdmin
    .from("mail_campaigns")
    .update(patch)
    .eq("id", args.campaignId);
  if (updateError && !isMissingStep4Column(updateError)) throw updateError;

  return report;
}
