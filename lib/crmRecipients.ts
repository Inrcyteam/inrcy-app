export type MailCampaignRecipientInput = {
  email: string;
  contact_id?: string | null;
  display_name?: string | null;
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return null;
}

const SIMPLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export function normalizeRecipientEmails(input: unknown): string[] {
  const values = Array.isArray(input) ? input : [input];
  const out: string[] = [];
  const seen = new Set<string>();

  for (const raw of values) {
    const text = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.join(",") : String(raw || "");
    for (const part of text.split(/[;,\n\r]+/g)) {
      const email = part.trim();
      if (!email) continue;
      const lower = email.toLowerCase();
      if (!SIMPLE_EMAIL_RE.test(email) || seen.has(lower)) continue;
      seen.add(lower);
      out.push(email);
    }
  }

  return out;
}

export function normalizeCampaignRecipients(input: unknown): MailCampaignRecipientInput[] {
  const source = Array.isArray(input) ? input : [];
  const out: MailCampaignRecipientInput[] = [];
  const seen = new Set<string>();

  for (const item of source) {
    if (typeof item === "string") {
      for (const email of normalizeRecipientEmails(item)) {
        const lower = email.toLowerCase();
        if (seen.has(lower)) continue;
        seen.add(lower);
        out.push({ email });
      }
      continue;
    }

    const rec = asRecord(item);
    const email = asString(rec.email)?.trim() || "";
    const lower = email.toLowerCase();
    if (!email || !SIMPLE_EMAIL_RE.test(email) || seen.has(lower)) continue;
    seen.add(lower);
    out.push({
      email,
      contact_id: asString(rec.contact_id)?.trim() || null,
      display_name: asString(rec.display_name)?.trim() || null,
    });
  }

  return out;
}

export function providerBatchLimit(provider: string | null | undefined) {
  const normalized = String(provider || "").toLowerCase();
  if (normalized === "gmail") return 20;
  if (normalized === "microsoft") return 40;
  return 40;
}
