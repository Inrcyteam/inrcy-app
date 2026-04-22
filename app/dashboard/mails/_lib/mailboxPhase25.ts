import { normalizeRecipientEmails } from "@/lib/crmRecipients";
import type { ComposeCrmRecipientHint, OutboxItem } from "./mailboxPhase1";

export const MAILBOX_FILE_INPUT_ID = "inrsend-attachments";
export const PUBLICATION_EDIT_FILE_INPUT_ID = "inrsend-publication-edit-attachments";

export function itemMailAccountId(it: OutboxItem): string {
  try {
    if (it.source === "send_items" || it.source === "mail_campaigns") return String((it.raw as any)?.integration_id || "");
    const payload = (it.raw as any)?.payload || (it.raw as any)?.raw?.payload || (it.raw as any)?.meta || {};
    return String((payload as any)?.integration_id || (payload as any)?.mailAccountId || (payload as any)?.accountId || "");
  } catch {
    return "";
  }
}

export function normalizeEmails(value: string) {
  return normalizeRecipientEmails(value);
}

export function normalizeComposeRecipientHints(input: unknown): ComposeCrmRecipientHint[] {
  const values = Array.isArray(input) ? input : [];
  const out: ComposeCrmRecipientHint[] = [];
  const seen = new Set<string>();

  for (const item of values) {
    if (!item || typeof item !== "object") continue;
    const email = String((item as any).email || "").trim();
    if (!email) continue;
    const lower = email.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    const contactId = String((item as any).contact_id || "").trim();
    const displayName = String((item as any).display_name || "").trim();
    out.push({
      email,
      contact_id: contactId || null,
      display_name: displayName || null,
    });
  }

  return out;
}

export function makeAttachmentPath(fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const rand = Math.random().toString(36).slice(2, 10);
  return `mail-attachments/${Date.now()}-${rand}-${safeName}`;
}

export function providerSendEndpoint(provider: string) {
  if (provider === "gmail") return "/api/inbox/gmail/send";
  if (provider === "microsoft") return "/api/inbox/microsoft/send";
  return "/api/inbox/imap/send";
}
