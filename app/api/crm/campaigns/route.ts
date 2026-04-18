import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { processPendingMailCampaigns } from "@/lib/crmCampaigns";
import { normalizeCampaignRecipients } from "@/lib/crmRecipients";

export const runtime = "nodejs";

type CampaignRecipientRow = {
  campaign_id: string;
  user_id: string;
  contact_id: string | null;
  display_name: string | null;
  email: string;
  status: "queued";
};

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function POST(req: Request) {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => ({}));
  const accountId = String(body.accountId || "").trim();
  const type = String(body.type || "mail").trim() || "mail";
  const subject = String(body.subject || "").trim() || "(sans objet)";
  const text = String(body.text || "");
  const html = String(body.html || "");
  const sourceDocSaveId = String(body.sourceDocSaveId || "").trim();
  const sourceDocType = String(body.sourceDocType || "").trim();
  const sourceDocNumber = String(body.sourceDocNumber || "").trim();
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  const recipients = normalizeCampaignRecipients(body.recipients);

  if (!accountId) {
    return NextResponse.json({ error: "Boîte d’envoi manquante." }, { status: 400 });
  }
  if (recipients.length === 0) {
    return NextResponse.json({ error: "Aucun destinataire valide." }, { status: 400 });
  }
  if (recipients.length === 1) {
    return NextResponse.json({ error: "Une campagne CRM nécessite au moins 2 destinataires." }, { status: 400 });
  }

  const { data: account, error: accountError } = await supabase
    .from("integrations")
    .select("id,user_id,provider,category,status")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .eq("category", "mail")
    .eq("status", "connected")
    .maybeSingle();

  if (accountError) {
    return NextResponse.json({ error: accountError.message }, { status: 500 });
  }
  if (!account?.id || !account?.provider) {
    return NextResponse.json({ error: "La boîte d’envoi sélectionnée est introuvable." }, { status: 404 });
  }

  const now = new Date().toISOString();
  const { data: campaign, error: campaignError } = await supabase
    .from("mail_campaigns")
    .insert({
      user_id: user.id,
      integration_id: accountId,
      provider: account.provider,
      type,
      subject,
      body_text: text,
      body_html: html || null,
      attachments,
      status: "queued",
      total_count: recipients.length,
      queued_count: recipients.length,
      sent_count: 0,
      failed_count: 0,
      source_doc_save_id: sourceDocSaveId || null,
      source_doc_type: sourceDocType || null,
      source_doc_number: sourceDocNumber || null,
      started_at: null,
      finished_at: null,
      last_error: null,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (campaignError || !campaign?.id) {
    return NextResponse.json({ error: campaignError?.message || "Création de campagne impossible." }, { status: 500 });
  }

  const rows: CampaignRecipientRow[] = recipients.map((recipient) => ({
    campaign_id: campaign.id,
    user_id: user.id,
    contact_id: recipient.contact_id || null,
    display_name: recipient.display_name || null,
    email: recipient.email,
    status: "queued",
  }));

  for (const chunk of chunkArray(rows, 500)) {
    const { error } = await supabase.from("mail_campaign_recipients").insert(chunk);
    if (error) {
      await supabase.from("mail_campaigns").delete().eq("id", campaign.id);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const immediate = await processPendingMailCampaigns({ campaignIds: [campaign.id], maxCampaigns: 1 });

  return NextResponse.json({
    success: true,
    campaignId: campaign.id,
    queued: recipients.length,
    immediate,
  });
}
