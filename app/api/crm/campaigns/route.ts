import { NextResponse } from "next/server";
import { evaluateCampaignDispatchState, getMailCampaignDeliveryConfig } from "@/lib/crmCampaigns";
import { requireUser } from "@/lib/requireUser";
import { getCronUserIdFromRequest, isAuthorizedCronRequest } from "@/lib/cronAuth";
import { normalizeCampaignRecipients } from "@/lib/crmRecipients";
import { fetchSuppressedEmailsByUser } from "@/lib/mailSuppression";
import { normalizeMailSubject } from "@/lib/mailEncoding";
import { getConnectionDisplayStatus, mailConnectionKind } from "@/lib/connectionVersions";
import { enforceRateLimit } from "@/lib/rateLimit";
import { inferInrSendFileRole, saveInrSendHistoryFiles } from "@/lib/inrsend/historyFiles";
import { parseMailAttachmentRefs } from "@/lib/mailAttachmentRefs";
import { stripTemplateSignatureBlock } from "@/lib/mailTemplateCleanup";
import { sanitizeRichMailHtml } from "@/lib/mailRichText";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type CampaignRecipientRow = {
  campaign_id: string;
  user_id: string;
  contact_id: string | null;
  display_name: string | null;
  email: string;
  status: "queued";
};

type CampaignFolder =
  | "mails"
  | "factures"
  | "devis"
  | "publications"
  | "recoltes"
  | "offres"
  | "informations"
  | "suivis"
  | "enquetes"
  | "propulsions"
  | "fidelisations";

const ALLOWED_FOLDERS = new Set<CampaignFolder>([
  "mails",
  "factures",
  "devis",
  "publications",
  "recoltes",
  "offres",
  "informations",
  "suivis",
  "enquetes",
  "propulsions",
  "fidelisations",
]);

function normalizeCampaignFolder(input: unknown, fallback: CampaignFolder): CampaignFolder {
  const value = String(input || "").trim().toLowerCase() as CampaignFolder;
  return ALLOWED_FOLDERS.has(value) ? value : fallback;
}

function normalizeCampaignMetadata(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const raw = input as Record<string, unknown>;
  const source = String(raw.source || "").trim();
  if (source !== "inr_agent") return {};
  return {
    source: "inr_agent",
    label: String(raw.label || "iNr'Agent"),
    agentActionId: String(raw.agentActionId || "").trim() || null,
    automationKey: String(raw.automationKey || "").trim() || null,
    targetTool: String(raw.targetTool || "").trim() || null,
    actionType: String(raw.actionType || "").trim() || null,
    theme: String(raw.theme || "").trim() || null,
  };
}

function isMissingMetadataColumnError(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42703" && message.includes("metadata");
}

function getMaxCampaignRecipients() {
  const raw = Number(process.env.CRM_CAMPAIGN_MAX_RECIPIENTS || "1000");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1000;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

const SIMPLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

async function resolveCampaignRequestUser(req: Request) {
  const cronUserId = isAuthorizedCronRequest(req) ? getCronUserIdFromRequest(req) : "";
  if (cronUserId) {
    return {
      supabase: supabaseAdmin as any,
      user: { id: cronUserId },
      errorResponse: null as NextResponse | null,
      isCron: true,
    };
  }

  const auth = await requireUser();
  return { ...auth, isCron: false };
}

function parseCampaignRecipientStats(input: unknown) {
  const values = Array.isArray(input) ? input : [];
  let invalidCount = 0;
  let duplicateCount = 0;
  const seen = new Set<string>();

  for (const item of values) {
    if (typeof item === "string") {
      for (const part of item.split(/[;,\n\r]+/g)) {
        const email = part.trim();
        if (!email) continue;
        const lower = email.toLowerCase();
        if (!SIMPLE_EMAIL_RE.test(email)) {
          invalidCount += 1;
          continue;
        }
        if (seen.has(lower)) {
          duplicateCount += 1;
          continue;
        }
        seen.add(lower);
      }
      continue;
    }

    if (!item || typeof item !== "object") {
      invalidCount += 1;
      continue;
    }

    const email = String((item as any).email || "").trim();
    const lower = email.toLowerCase();
    if (!email || !SIMPLE_EMAIL_RE.test(email)) {
      invalidCount += 1;
      continue;
    }
    if (seen.has(lower)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(lower);
  }

  return { duplicateCount, invalidCount };
}

export async function POST(req: Request) {
  const { supabase, user, errorResponse, isCron } = await resolveCampaignRequestUser(req);
  if (errorResponse) return errorResponse;

  if (!isCron) {
    const rateLimited = await enforceRateLimit({
      name: "crm_campaign_create",
      identifier: user.id,
      limit: 10,
      window: "10 m",
      failClosed: false,
    });
    if (rateLimited) return rateLimited;
  }

  const body = await req.json().catch(() => ({}));
  const accountId = String(body.accountId || "").trim();
  const type = String(body.type || "mail").trim() || "mail";
  const subject = normalizeMailSubject(String(body.subject || "").trim() || "(sans objet)");
  const text = stripTemplateSignatureBlock(String(body.text || ""));
  const html = sanitizeRichMailHtml(String(body.html || ""));
  const sourceDocSaveId = String(body.sourceDocSaveId || "").trim();
  const sourceDocType = String(body.sourceDocType || "").trim();
  const sourceDocNumber = String(body.sourceDocNumber || "").trim();
  const trackKindRaw = String(body.trackKind || "").trim().toLowerCase();
  const trackType = String(body.trackType || "").trim();
  const templateKey = String(body.templateKey || "").trim();
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  const metadata = normalizeCampaignMetadata(body.metadata);
  const normalizedRecipients = normalizeCampaignRecipients(body.recipients);
  const recipientStats = parseCampaignRecipientStats(body.recipients);

  if (!accountId) {
    return NextResponse.json({ error: "Boîte d’envoi manquante." }, { status: 400 });
  }
  if (normalizedRecipients.length === 0) {
    return NextResponse.json({ error: "Aucun destinataire valide." }, { status: 400 });
  }

  const maxRecipients = getMaxCampaignRecipients();
  if (normalizedRecipients.length > maxRecipients) {
    return NextResponse.json(
      { error: `Campagne trop volumineuse. Maximum autorisé : ${maxRecipients} destinataires.` },
      { status: 413 },
    );
  }

  const defaultFolder: CampaignFolder = type === "facture" ? "factures" : type === "devis" ? "devis" : "mails";
  const folder = normalizeCampaignFolder(body.folder, defaultFolder);
  const trackKind = trackKindRaw === "booster" || trackKindRaw === "propulser" || trackKindRaw === "fideliser" ? trackKindRaw : null;

  const { data: account, error: accountError } = await supabase
    .from("integrations")
    .select("id,user_id,provider,category,status,settings")
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

  const mailKind = mailConnectionKind(account.provider);
  const mailConnectionStatus = mailKind
    ? getConnectionDisplayStatus(true, mailKind, account.settings)
    : "connected";
  if (mailConnectionStatus === "needs_update") {
    return NextResponse.json({ error: "Cette boîte d’envoi doit être actualisée avant de pouvoir envoyer." }, { status: 400 });
  }

  const suppressedByEmail = await fetchSuppressedEmailsByUser(
    user.id,
    normalizedRecipients.map((recipient) => recipient.email),
  );

  let blockedOptOut = 0;
  let blockedBlacklist = 0;
  let blockedHardBounce = 0;
  let blockedComplaint = 0;

  const recipients = normalizedRecipients.filter((recipient) => {
    const suppression = suppressedByEmail.get(recipient.email.toLowerCase());
    if (!suppression?.reason) return true;
    if (suppression.reason === "opt_out") blockedOptOut += 1;
    else if (suppression.reason === "blacklist") blockedBlacklist += 1;
    else if (suppression.reason === "hard_bounce") blockedHardBounce += 1;
    else if (suppression.reason === "complaint") blockedComplaint += 1;
    return false;
  });

  if (recipients.length === 0) {
    const blockedParts = [
      blockedOptOut > 0 ? `${blockedOptOut} désinscription${blockedOptOut > 1 ? "s" : ""}` : null,
      blockedBlacklist > 0 ? `${blockedBlacklist} blacklist` : null,
      blockedHardBounce > 0 ? `${blockedHardBounce} rebond${blockedHardBounce > 1 ? "s" : ""} dur${blockedHardBounce > 1 ? "s" : ""}` : null,
      blockedComplaint > 0 ? `${blockedComplaint} plainte${blockedComplaint > 1 ? "s" : ""}` : null,
    ].filter(Boolean);
    return NextResponse.json(
      { error: blockedParts.length ? `Tous les destinataires sont bloqués (${blockedParts.join(", ")}).` : "Aucun destinataire autorisé." },
      { status: 400 },
    );
  }
  const dispatchState = await evaluateCampaignDispatchState({ userId: user.id, integrationId: accountId });
  const deliveryConfig = getMailCampaignDeliveryConfig();
  const now = new Date().toISOString();
  const initialStatus = dispatchState.state === "paused" ? "paused" : "queued";
  const initialLastError = dispatchState.state === "ready" ? null : dispatchState.reason;

  const campaignInsertPayload: Record<string, unknown> = {
    user_id: user.id,
    integration_id: accountId,
    provider: account.provider,
    type,
    subject,
    body_text: text,
    body_html: html || null,
    attachments,
    metadata,
    status: initialStatus,
    total_count: recipients.length,
    queued_count: recipients.length,
    sent_count: 0,
    failed_count: 0,
    source_doc_save_id: sourceDocSaveId || null,
    source_doc_type: sourceDocType || null,
    source_doc_number: sourceDocNumber || null,
    folder,
    track_kind: trackKind,
    track_type: trackType || null,
    template_key: templateKey || null,
    started_at: null,
    finished_at: null,
    last_error: initialLastError,
    created_at: now,
    updated_at: now,
    last_activity_at: now,
  };

  let { data: campaign, error: campaignError } = await supabase
    .from("mail_campaigns")
    .insert(campaignInsertPayload)
    .select("id,status")
    .single();

  if (campaignError && isMissingMetadataColumnError(campaignError)) {
    // Sécurité déploiement : si le SQL étape 9 n'a pas encore été lancé,
    // les campagnes manuelles continuent de fonctionner. L'icône iNr'Agent
    // apparaîtra pour les campagnes dès que la colonne metadata existera.
    const legacyCampaignInsertPayload = { ...campaignInsertPayload };
    delete legacyCampaignInsertPayload.metadata;
    const legacyInsert = await supabase
      .from("mail_campaigns")
      .insert(legacyCampaignInsertPayload)
      .select("id,status")
      .single();
    campaign = legacyInsert.data;
    campaignError = legacyInsert.error;
  }

  if (campaignError || !campaign?.id) {
    return NextResponse.json({ error: campaignError?.message || "Création de campagne impossible." }, { status: 500 });
  }

  await saveInrSendHistoryFiles(supabase, {
    userId: user.id,
    historySource: "mail_campaigns",
    historyId: campaign.id,
    category: folder,
    fileRole: inferInrSendFileRole({ sourceDocType }),
    files: parseMailAttachmentRefs(attachments),
    metadata: {
      provider: account.provider || null,
      source_doc_save_id: sourceDocSaveId || null,
      source_doc_type: sourceDocType || null,
      source_doc_number: sourceDocNumber || null,
      ...(metadata.source === "inr_agent" ? { origin: metadata } : {}),
    },
  });

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

  return NextResponse.json({
    success: true,
    campaignId: campaign.id,
    campaignStatus: initialStatus,
    distributionState: dispatchState.state,
    deferredReason: dispatchState.reason,
    queued: recipients.length,
    blockedDuplicates: recipientStats.duplicateCount,
    ignoredInvalid: recipientStats.invalidCount,
    blockedOptOut,
    blockedBlacklist,
    blockedHardBounce,
    blockedComplaint,
    batchSize: dispatchState.state === "ready" ? Math.max(1, dispatchState.availableNow) : deliveryConfig.batchSize,
    hourlyLimit: deliveryConfig.hourlyLimit,
    dailyLimit: deliveryConfig.dailyLimit,
    activeLimit: deliveryConfig.maxActivePerIntegration,
    queuedForBackgroundDispatch: true,
  });
}
