import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type SuppressionReason = "opt_out" | "blacklist" | "hard_bounce" | "complaint";
export type BounceType = "hard" | "soft";

export type SuppressionEntry = {
  id?: string;
  user_id: string;
  email: string;
  email_normalized?: string;
  reason: SuppressionReason;
  source?: string | null;
  campaign_id?: string | null;
  recipient_id?: string | null;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type FailureClassification = {
  kind: "hard_bounce" | "soft_bounce" | "complaint" | "generic";
  bounceType: BounceType | null;
  suppressionReason: SuppressionReason | null;
  shouldSuppress: boolean;
  shouldRetry: boolean;
};

const HARD_BOUNCE_PATTERNS = [
  /user unknown/i,
  /unknown user/i,
  /unknown recipient/i,
  /recipient unknown/i,
  /no such user/i,
  /no such mailbox/i,
  /mailbox unavailable/i,
  /recipient address rejected/i,
  /invalid recipient/i,
  /address rejected/i,
  /address not found/i,
  /does not exist/i,
  /not exist/i,
  /undeliverable address/i,
  /destination mailbox address invalid/i,
  /5\.1\.1/i,
  /5\.1\.0/i,
  /5\.1\.10/i,
  /5\.2\.1/i,
];

const SOFT_BOUNCE_PATTERNS = [
  /mailbox full/i,
  /quota exceeded/i,
  /over quota/i,
  /temporarily deferred/i,
  /temporary failure/i,
  /temporarily unavailable/i,
  /try again later/i,
  /timeout/i,
  /timed out/i,
  /too many requests/i,
  /rate limit/i,
  /4\.2\.2/i,
  /4\.3\.0/i,
  /421\b/i,
  /450\b/i,
  /451\b/i,
  /452\b/i,
];

const COMPLAINT_PATTERNS = [
  /spam complaint/i,
  /complaint/i,
  /abuse/i,
  /blocked for abuse/i,
  /message rejected as spam/i,
  /policy rejection/i,
  /denied by policy/i,
];

export function normalizeSuppressionEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function getSuppressionReasonLabel(reason: string | null | undefined) {
  switch (reason) {
    case "opt_out":
      return "désinscription";
    case "blacklist":
      return "blacklist";
    case "hard_bounce":
      return "adresse invalide";
    case "complaint":
      return "plainte spam";
    default:
      return "blocage";
  }
}

export function classifyMailFailure(input: unknown): FailureClassification {
  const message = String(input || "").trim();
  if (!message) {
    return { kind: "generic", bounceType: null, suppressionReason: null, shouldSuppress: false, shouldRetry: true };
  }

  if (COMPLAINT_PATTERNS.some((pattern) => pattern.test(message))) {
    return { kind: "complaint", bounceType: null, suppressionReason: "complaint", shouldSuppress: true, shouldRetry: false };
  }

  if (HARD_BOUNCE_PATTERNS.some((pattern) => pattern.test(message))) {
    return { kind: "hard_bounce", bounceType: "hard", suppressionReason: "hard_bounce", shouldSuppress: true, shouldRetry: false };
  }

  if (SOFT_BOUNCE_PATTERNS.some((pattern) => pattern.test(message))) {
    return { kind: "soft_bounce", bounceType: "soft", suppressionReason: null, shouldSuppress: false, shouldRetry: true };
  }

  return { kind: "generic", bounceType: null, suppressionReason: null, shouldSuppress: false, shouldRetry: true };
}

export async function fetchSuppressedEmailsByUser(userId: string, emails: string[]) {
  const normalizedEmails = Array.from(new Set(emails.map(normalizeSuppressionEmail).filter(Boolean)));
  if (!userId || normalizedEmails.length === 0) return new Map<string, SuppressionEntry>();

  const { data, error } = await supabaseAdmin
    .from("mail_suppression_list")
    .select("id,user_id,email,email_normalized,reason,source,campaign_id,recipient_id,note,created_at,updated_at")
    .eq("user_id", userId)
    .in("email_normalized", normalizedEmails);

  if (error) throw error;

  const map = new Map<string, SuppressionEntry>();
  for (const row of (data || []) as any[]) {
    const key = normalizeSuppressionEmail(row?.email_normalized || row?.email);
    if (!key) continue;
    if (map.has(key)) continue;
    map.set(key, {
      id: typeof row?.id === "string" ? row.id : undefined,
      user_id: String(row?.user_id || userId),
      email: String(row?.email || key),
      email_normalized: key,
      reason: String(row?.reason || "blacklist") as SuppressionReason,
      source: row?.source ? String(row.source) : null,
      campaign_id: row?.campaign_id ? String(row.campaign_id) : null,
      recipient_id: row?.recipient_id ? String(row.recipient_id) : null,
      note: row?.note ? String(row.note) : null,
      created_at: row?.created_at ? String(row.created_at) : undefined,
      updated_at: row?.updated_at ? String(row.updated_at) : undefined,
    });
  }

  return map;
}

export async function upsertSuppressionEntry(entry: SuppressionEntry) {
  const emailNormalized = normalizeSuppressionEmail(entry.email);
  if (!entry.user_id || !emailNormalized || !entry.reason) {
    throw new Error("Suppression invalide.");
  }
  const now = new Date().toISOString();
  const payload = {
    user_id: entry.user_id,
    email: String(entry.email || "").trim(),
    email_normalized: emailNormalized,
    reason: entry.reason,
    source: entry.source ?? null,
    campaign_id: entry.campaign_id ?? null,
    recipient_id: entry.recipient_id ?? null,
    note: entry.note ?? null,
    updated_at: now,
  };

  const { data, error } = await supabaseAdmin
    .from("mail_suppression_list")
    .upsert(payload, { onConflict: "user_id,email_normalized" })
    .select("id,user_id,email,email_normalized,reason,source,campaign_id,recipient_id,note,created_at,updated_at")
    .single();

  if (error) throw error;
  return data as any;
}

export async function removeSuppressionEntry(userId: string, email: string) {
  const normalized = normalizeSuppressionEmail(email);
  if (!userId || !normalized) return;
  const { error } = await supabaseAdmin
    .from("mail_suppression_list")
    .delete()
    .eq("user_id", userId)
    .eq("email_normalized", normalized);
  if (error) throw error;
}

export async function markQueuedRecipientsBlockedBySuppression(args: {
  userId: string;
  email: string;
  reason: SuppressionReason;
  source?: string | null;
  note?: string | null;
}) {
  const normalized = normalizeSuppressionEmail(args.email);
  if (!args.userId || !normalized) return 0;
  const now = new Date().toISOString();
  const message = `Envoi bloqué (${getSuppressionReasonLabel(args.reason)}).`;
  const { data, error } = await supabaseAdmin
    .from("mail_campaign_recipients")
    .update({
      status: "failed",
      suppression_reason: args.reason,
      processing_started_at: null,
      next_attempt_at: now,
      error: message,
      last_error: message,
      unsubscribed_at: args.reason === "opt_out" ? now : null,
      updated_at: now,
    })
    .eq("user_id", args.userId)
    .ilike("email", normalized)
    .in("status", ["queued", "processing"])
    .select("id");

  if (error) throw error;
  return Array.isArray(data) ? data.length : 0;
}

export function getAppOrigin() {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://app.inrcy.com").replace(/\/$/, "");
}

export function buildRecipientUnsubscribeUrl(campaignId: string, recipientId: string) {
  const url = new URL(`${getAppOrigin()}/api/inrsend/unsubscribe`);
  url.searchParams.set("campaignId", String(campaignId || ""));
  url.searchParams.set("recipientId", String(recipientId || ""));
  return url.toString();
}

function textHasUnsubscribeLink(text: string, unsubscribeUrl: string) {
  return text.includes(unsubscribeUrl) || /désinscrire/i.test(text);
}

export function appendUnsubscribeFooterToText(text: string, unsubscribeUrl: string) {
  const base = String(text || "").trimEnd();
  if (!unsubscribeUrl) return base;
  if (textHasUnsubscribeLink(base, unsubscribeUrl)) return base;
  const footer = `Vous ne souhaitez plus recevoir ces emails ? Désinscription : ${unsubscribeUrl}`;
  return base ? `${base}\n\n---\n${footer}` : footer;
}

export function appendUnsubscribeFooterToHtml(html: string, unsubscribeUrl: string) {
  const base = String(html || "").trim();
  if (!unsubscribeUrl) return base;
  if (base.includes(unsubscribeUrl) || /désinscrire/i.test(base)) return base;
  const footer = `<p style="margin-top:24px;font-size:12px;color:#6b7280">Vous ne souhaitez plus recevoir ces emails ? <a href="${unsubscribeUrl}" target="_blank" rel="noopener noreferrer">Se désinscrire</a></p>`;
  return base ? `${base}${footer}` : footer;
}
