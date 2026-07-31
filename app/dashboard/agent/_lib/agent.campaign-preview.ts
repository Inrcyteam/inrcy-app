import type { InrAgentTheme } from "@/lib/inrAgentSettings";
import { apiChannelToUi, apiToTheme } from "./agent.config";
import type {
  AgentMailAccount,
  AgentPreparedAction,
  AutomationKey,
  CampaignAttachmentPreview,
  CampaignAttachmentRef,
  CampaignMailPreview,
  CampaignRecipientPreview,
  ChannelKey,
  CrmContactForAgent,
} from "./agent.types";
import { asRecord, firstSafeString } from "./agent.utils";

export function previewParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}|\n-\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);
}

export function mailParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .slice(0, 8);
}

export function isCampaignAutomationKey(
  key: AutomationKey,
): key is Extract<AutomationKey, "grow" | "loyalty"> {
  return key === "grow" || key === "loyalty";
}

export function isCampaignPreparedAction(
  action: AgentPreparedAction | null,
): action is AgentPreparedAction {
  return Boolean(
    action &&
    isCampaignAutomationKey(action.automationKey as AutomationKey) &&
    (action.targetTool === "propulser" ||
      action.targetTool === "fideliser" ||
      action.targetTool === "mails"),
  );
}

export function formatAttachmentSize(value: unknown): string {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${Math.round(bytes)} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} Mo`;
}

export function extractCampaignAttachment(
  payload: Record<string, unknown>,
): CampaignAttachmentPreview | null {
  const rawAttachments = Array.isArray(payload.attachments)
    ? payload.attachments
    : Array.isArray(payload.files)
      ? payload.files
      : [];
  const raw = rawAttachments[0] || payload.attachment || payload.file || null;
  const record =
    typeof raw === "string" ? { name: raw, url: raw } : asRecord(raw);
  if (!record) return null;

  const name = firstSafeString(
    record.name,
    record.filename,
    record.fileName,
    record.title,
    "Pièce jointe",
  );
  const url = firstSafeString(
    record.url,
    record.downloadUrl,
    record.publicUrl,
    record.href,
  );
  const type = firstSafeString(
    record.mimeType,
    record.mime_type,
    record.type,
    "Document",
  );
  const size = formatAttachmentSize(
    record.size || record.bytes || record.sizeBytes || record.size_bytes,
  );

  return {
    bucket: firstSafeString(record.bucket),
    path: firstSafeString(record.path, record.storagePath, record.storage_path),
    name,
    type,
    size,
    url,
  };
}

export function normalizeCampaignAttachmentRefs(
  value: unknown,
): CampaignAttachmentRef[] {
  if (!Array.isArray(value)) return [];
  const refs: CampaignAttachmentRef[] = [];

  for (const item of value) {
    const record = asRecord(item);
    if (!record) continue;
    const bucket = firstSafeString(record.bucket);
    const path = firstSafeString(
      record.path,
      record.storagePath,
      record.storage_path,
    );
    const name =
      firstSafeString(record.name, record.filename, record.fileName) ||
      path.split("/").pop() ||
      "piece-jointe";
    if (!bucket || !path || !name) continue;
    const size = Number(
      record.size ?? record.bytes ?? record.sizeBytes ?? record.size_bytes ?? 0,
    );
    refs.push({
      bucket,
      path,
      name,
      type:
        firstSafeString(record.type, record.mimeType, record.mime_type) || null,
      size: Number.isFinite(size) && size > 0 ? size : null,
    });
  }

  return refs.slice(0, 10);
}

export function normalizeCampaignRecipients(
  value: unknown,
): CampaignRecipientPreview[] {
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const recipients: CampaignRecipientPreview[] = [];

  for (const item of raw) {
    const record = asRecord(item);
    const email = firstSafeString(record?.email, item).toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(email) || seen.has(email))
      continue;
    seen.add(email);
    recipients.push({
      contact_id:
        firstSafeString(record?.contact_id, record?.contactId, record?.id) ||
        null,
      display_name: firstSafeString(
        record?.display_name,
        record?.displayName,
        record?.name,
      ),
      email,
      phone: firstSafeString(record?.phone) || null,
      contact_type:
        firstSafeString(record?.contact_type, record?.contactType) || null,
      category: firstSafeString(record?.category) || null,
      company_name:
        firstSafeString(record?.company_name, record?.companyName) || null,
      city: firstSafeString(record?.city) || null,
      postal_code:
        firstSafeString(record?.postal_code, record?.postalCode) || null,
      manual: Boolean(record?.manual),
    });
  }

  return recipients;
}

export function recipientsForAction(
  action: AgentPreparedAction | null,
): CampaignRecipientPreview[] {
  if (!action) return [];
  return normalizeCampaignRecipients(
    action.payload?.recipients ||
      asRecord(action.payload?.campaign)?.recipients ||
      action.recipients,
  );
}

export function recipientDisplayName(recipient: CampaignRecipientPreview) {
  return firstSafeString(
    recipient.display_name,
    recipient.displayName,
    recipient.name,
    recipient.company_name,
    recipient.companyName,
    recipient.email,
  );
}

export function contactDisplayName(contact: CrmContactForAgent) {
  const person = [contact.first_name, contact.last_name]
    .map((part) => firstSafeString(part))
    .filter(Boolean)
    .join(" ")
    .trim();
  if (person && contact.company_name)
    return `${person} · ${contact.company_name}`;
  return (
    person ||
    firstSafeString(contact.company_name, contact.email, "Contact CRM")
  );
}

export function contactToCampaignRecipient(
  contact: CrmContactForAgent,
): CampaignRecipientPreview | null {
  const email = firstSafeString(contact.email).toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(email)) return null;
  return {
    contact_id: contact.id,
    display_name: contactDisplayName(contact),
    email,
    phone: firstSafeString(contact.phone) || null,
    category: firstSafeString(contact.category) || null,
    contact_type: firstSafeString(contact.contact_type) || null,
    company_name: firstSafeString(contact.company_name) || null,
    city: firstSafeString(contact.city) || null,
    postal_code: firstSafeString(contact.postal_code) || null,
  };
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value.trim());
}

export function parseRecipientEmails(value: string) {
  const seen = new Set<string>();
  return value
    .split(/[;,\s]+/g)
    .map((item) => item.trim().toLowerCase())
    .filter((email) => {
      if (!email || !isValidEmail(email) || seen.has(email)) return false;
      seen.add(email);
      return true;
    });
}

export function sanitizeDepartmentFilter(value: string) {
  return value
    .replace(/[^0-9abAB]/g, "")
    .slice(0, 3)
    .toUpperCase();
}

export function contactDepartment(postalCode: string | null | undefined) {
  const cleaned = sanitizeDepartmentFilter(firstSafeString(postalCode));
  if (/^(97|98)\d/.test(cleaned)) return cleaned.slice(0, 3);
  return cleaned.slice(0, 2);
}

export function formatRecipientMetaValue(value: string | null | undefined) {
  const cleaned = firstSafeString(value).replace(/[_-]+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned
    .split(/\s+/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function contactMetaLine(contact: CrmContactForAgent) {
  const parts = [
    formatRecipientMetaValue(contact.contact_type),
    formatRecipientMetaValue(contact.category),
    contactDepartment(contact.postal_code),
  ].filter(Boolean);
  return parts.join(" · ") || "Contact CRM";
}

export function recipientMetaLine(recipient: CampaignRecipientPreview) {
  const parts = [
    formatRecipientMetaValue(recipient.contact_type),
    formatRecipientMetaValue(recipient.category),
    contactDepartment(recipient.postal_code),
  ].filter(Boolean);
  if (recipient.manual && parts.length === 0) return "Destinataire libre";
  return parts.join(" · ") || "Destinataire";
}

export function manualRecipientFromEmail(
  emailValue: string,
): CampaignRecipientPreview | null {
  const email = emailValue.trim().toLowerCase();
  if (!isValidEmail(email)) return null;
  return {
    contact_id: null,
    display_name: email,
    email,
    contact_type: "manuel",
    category: "manuel",
    manual: true,
  };
}

export function mailAccountEmail(
  account:
    Partial<AgentMailAccount> | Record<string, unknown> | null | undefined,
) {
  return firstSafeString(
    account?.email_address,
    account?.account_email,
    account?.email,
    account?.resource_label,
    account?.label,
  );
}

export function mailAccountLabel(account: AgentMailAccount) {
  return firstSafeString(
    account.email_address,
    account.account_email,
    account.email,
    account.resource_label,
    account.label,
    account.display_name,
    account.provider,
    "Boîte mail",
  );
}

export function mailAccountSecondaryLabel(
  account:
    Partial<AgentMailAccount> | Record<string, unknown> | null | undefined,
) {
  const provider = firstSafeString(account?.provider, "mail");
  const displayName = firstSafeString(account?.display_name);
  return displayName ? `${provider} · ${displayName}` : provider;
}

export function extractCampaignMailPreview(
  action: AgentPreparedAction | null,
): CampaignMailPreview | null {
  if (!isCampaignPreparedAction(action)) return null;
  const payload = action.payload || {};
  const campaign = asRecord(payload.campaign) || {};
  const mailAccount = asRecord(payload.mailAccount) || asRecord(campaign.mailAccount);
  const subject = firstSafeString(
    campaign.subject,
    payload.campaignSubject,
    payload.subject,
    action.title,
  );
  const body = firstSafeString(
    campaign.text,
    payload.campaignBody,
    payload.bodyText,
    payload.text,
    campaign.html,
    action.previewText,
    action.summary,
  );
  const mission = firstSafeString(
    payload.mission,
    targetThemesLabel(action),
    action.automationKey === "loyalty" ? "Fidéliser" : "Propulser",
  );
  const accountLabel = firstSafeString(
    mailAccount?.email_address,
    mailAccount?.account_email,
    mailAccount?.email,
    payload.mailAccountEmail,
    payload.accountEmail,
    mailAccount?.label,
    payload.mailAccountLabel,
    payload.accountLabel,
    mailAccount?.provider,
    "Boîte mail connectée",
  );
  const accountProvider = firstSafeString(
    mailAccount?.provider,
    payload.mailProvider,
    "Mails",
  );

  return {
    subject,
    body,
    paragraphs: mailParagraphs(body),
    mission,
    recipientsCount: recipientsCountForAction(action),
    mailAccountLabel: accountLabel,
    mailAccountProvider: accountProvider,
    attachment: extractCampaignAttachment(payload),
  };
}

export function channelsForAction(
  action: AgentPreparedAction,
  fallback: ChannelKey[],
): ChannelKey[] {
  const channels = action.targetChannels
    .map(
      (channel) =>
        apiChannelToUi[channel] ??
        apiChannelToUi[channel.toLowerCase?.() || ""],
    )
    .filter((channel): channel is ChannelKey => Boolean(channel));
  return channels.length > 0 ? Array.from(new Set(channels)) : fallback;
}

export function targetThemesLabel(action: AgentPreparedAction): string {
  return action.targetThemes
    .map((theme) => apiToTheme[theme as InrAgentTheme] ?? theme)
    .filter(Boolean)
    .join(" · ");
}

export function recipientsCountForAction(action: AgentPreparedAction | null): number {
  if (!action) return 0;
  const payloadCount = Number(action.payload?.recipientCount || 0);
  if (Number.isFinite(payloadCount) && payloadCount > 0)
    return Math.round(payloadCount);
  return Array.isArray(action.recipients) ? action.recipients.length : 0;
}
