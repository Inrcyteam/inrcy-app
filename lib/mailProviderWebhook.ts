import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { classifyMailFailure, markQueuedRecipientsBlockedBySuppression, normalizeSuppressionEmail, upsertSuppressionEntry } from "@/lib/mailSuppression";
import { refreshCampaignCounters } from "@/lib/crmCampaigns";

export type MailWebhookEventKind = "delivered" | "bounce" | "complaint" | "unsubscribe" | "ignored";
export type MailWebhookBounceType = "hard" | "soft" | null;

type RecipientRow = {
  id: string;
  campaign_id: string;
  user_id: string;
  email: string;
  status: string | null;
  sent_at: string | null;
  suppression_reason: string | null;
  bounce_type: string | null;
  unsubscribed_at: string | null;
};

export type NormalizedMailWebhookEvent = {
  provider: string;
  externalEventId: string;
  kind: MailWebhookEventKind;
  bounceType: MailWebhookBounceType;
  providerMessageId: string | null;
  email: string | null;
  campaignId: string | null;
  recipientId: string | null;
  userId: string | null;
  occurredAt: string;
  reason: string | null;
  payload: unknown;
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const str = asString(value)?.trim();
    if (str) return str;
  }
  return null;
}

function parseOccurredAt(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 10_000_000_000 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  const str = asString(value)?.trim();
  if (!str) return new Date().toISOString();
  const numeric = Number(str);
  if (Number.isFinite(numeric) && String(numeric) === str.replace(/\.0+$/, "")) {
    return parseOccurredAt(numeric);
  }
  const parsed = Date.parse(str);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  return new Date().toISOString();
}

function inferProvider(payload: Record<string, unknown>, providerHint?: string | null) {
  const hint = String(providerHint || "").trim().toLowerCase();
  if (hint) return hint;
  if (payload["sg_message_id"] || payload["sg_event_id"]) return "sendgrid";
  if (payload["event-data"]) return "mailgun";
  if (payload["mail"] || payload["notificationType"]) return "ses";
  if (payload["data"] && asRecord(payload.data)["email_id"]) return "resend";
  return "generic";
}

function parseEventKind(typeRaw: string | null, bounceTypeRaw: string | null, reason: string | null): { kind: MailWebhookEventKind; bounceType: MailWebhookBounceType } {
  const type = String(typeRaw || "").trim().toLowerCase();
  const bounceHint = String(bounceTypeRaw || "").trim().toLowerCase();
  const reasonText = String(reason || "").trim();

  if (/unsubscribe|unsubscribed|list_unsubscribe/.test(type)) {
    return { kind: "unsubscribe", bounceType: null };
  }
  if (/complaint|spamreport|spam_complaint|abuse/.test(type)) {
    return { kind: "complaint", bounceType: null };
  }
  if (/delivered|delivery/.test(type)) {
    return { kind: "delivered", bounceType: null };
  }
  if (/bounce|bounced|dropped|failed|deferred/.test(type)) {
    if (/hard|permanent/.test(bounceHint) || /hard[_-]?bounce/.test(type)) {
      return { kind: "bounce", bounceType: "hard" };
    }
    if (/soft|temporary|transient/.test(bounceHint) || /soft[_-]?bounce/.test(type) || /deferred/.test(type)) {
      return { kind: "bounce", bounceType: "soft" };
    }
    const classification = classifyMailFailure(reasonText);
    return {
      kind: "bounce",
      bounceType: classification.bounceType === "hard" ? "hard" : classification.bounceType === "soft" ? "soft" : null,
    };
  }

  return { kind: "ignored", bounceType: null };
}

function normalizeSendgridMessageId(value: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const [head] = raw.split(".");
  return head || raw;
}

function extractNormalizedEvent(input: unknown, providerHint?: string | null): NormalizedMailWebhookEvent {
  const payload = asRecord(input);
  const resendData = asRecord(payload.data);
  const mailgunData = asRecord(payload["event-data"]);
  const sesMail = asRecord(payload.mail);
  const sesBounce = asRecord(payload.bounce);
  const sesComplaint = asRecord(payload.complaint);
  const sesDelivery = asRecord(payload.delivery);

  const provider = inferProvider(payload, providerHint);
  const email = normalizeSuppressionEmail(
    firstString(
      payload.email,
      payload.recipient,
      payload.rcpt_to,
      payload.to,
      resendData.to,
      mailgunData.recipient,
      sesBounce.bouncedRecipients && Array.isArray(sesBounce.bouncedRecipients) ? asRecord(sesBounce.bouncedRecipients[0]).emailAddress : null,
      sesComplaint.complainedRecipients && Array.isArray(sesComplaint.complainedRecipients) ? asRecord(sesComplaint.complainedRecipients[0]).emailAddress : null,
      sesDelivery.recipients && Array.isArray(sesDelivery.recipients) ? sesDelivery.recipients[0] : null,
    ) || "",
  ) || null;

  const providerMessageId = firstString(
    payload.provider_message_id,
    payload.message_id,
    payload.messageId,
    payload["Message-Id"],
    resendData.email_id,
    normalizeSendgridMessageId(firstString(payload.sg_message_id)),
    firstString(asRecord(mailgunData.message).headers && asRecord(asRecord(mailgunData.message).headers)["message-id"]),
    firstString(sesMail.messageId),
  );

  const reason = firstString(
    payload.reason,
    payload.response,
    payload.description,
    payload.error,
    payload["smtp-id"],
    resendData.reason,
    mailgunData.reason,
    sesBounce.bounceType,
    sesBounce.bounceSubType,
    sesComplaint.complaintFeedbackType,
  );

  const bounceTypeRaw = firstString(
    payload.bounce_type,
    payload.severity,
    payload.type,
    mailgunData.severity,
    sesBounce.bounceType,
  );

  const typeRaw = firstString(
    payload.type,
    payload.event,
    payload.notificationType,
    mailgunData.event,
  );

  const { kind, bounceType } = parseEventKind(typeRaw, bounceTypeRaw, reason);
  const occurredAt = parseOccurredAt(
    payload.timestamp ?? payload.created_at ?? payload.createdAt ?? payload.ts ?? mailgunData.timestamp ?? sesMail.timestamp,
  );

  const recipientId = firstString(payload.recipient_id, resendData.recipient_id, payload.recipientId);
  const campaignId = firstString(payload.campaign_id, resendData.campaign_id, payload.campaignId);
  const userId = firstString(payload.user_id, resendData.user_id, payload.userId);

  const rawExternalId = firstString(
    payload.id,
    payload.event_id,
    payload.sg_event_id,
    mailgunData.id,
    payload.feedbackId,
  );

  const externalEventId = rawExternalId || crypto
    .createHash("sha256")
    .update(JSON.stringify({ provider, kind, providerMessageId, email, occurredAt, reason }))
    .digest("hex");

  return {
    provider,
    externalEventId,
    kind,
    bounceType,
    providerMessageId,
    email,
    campaignId,
    recipientId,
    userId,
    occurredAt,
    reason,
    payload: input,
  };
}

export function normalizeMailWebhookPayload(payload: unknown, providerHint?: string | null) {
  if (Array.isArray(payload)) return payload.map((item) => extractNormalizedEvent(item, providerHint));
  const root = asRecord(payload);
  if (Array.isArray(root.events)) return root.events.map((item) => extractNormalizedEvent(item, providerHint));
  if (Array.isArray(root.items)) return root.items.map((item) => extractNormalizedEvent(item, providerHint));
  if (Array.isArray(root.records)) return root.records.map((item) => extractNormalizedEvent(item, providerHint));
  return [extractNormalizedEvent(payload, providerHint)];
}

function getWebhookSecret() {
  return String(
    process.env.INRSEND_MAIL_WEBHOOK_SECRET || process.env.INRSEND_WEBHOOK_SECRET || "",
  ).trim();
}

function timingSafeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function verifyMailWebhookRequest(rawBody: string, headers: Headers) {
  const secret = getWebhookSecret();
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("INRSEND_MAIL_WEBHOOK_SECRET manquant.");
    }
    return;
  }

  const bearer = firstString(headers.get("authorization"))?.replace(/^Bearer\s+/i, "") || null;
  const direct = firstString(headers.get("x-inrsend-webhook-secret"));
  const signature = firstString(headers.get("x-inrsend-signature"));

  if (bearer && timingSafeEqual(bearer, secret)) return;
  if (direct && timingSafeEqual(direct, secret)) return;
  if (signature) {
    const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
    const normalized = signature.replace(/^sha256=/i, "").trim();
    if (normalized && timingSafeEqual(normalized, expected)) return;
  }

  throw new Error("Signature webhook invalide.");
}

async function insertWebhookEvent(event: NormalizedMailWebhookEvent) {
  const { data, error } = await supabaseAdmin
    .from("mail_provider_events")
    .insert({
      provider: event.provider,
      external_event_id: event.externalEventId,
      event_type: event.kind,
      provider_message_id: event.providerMessageId,
      email: event.email,
      payload: event.payload,
    })
    .select("id")
    .single();

  if (error) {
    if ((error as any)?.code === "23505") return { duplicate: true as const, id: null as string | null };
    throw error;
  }

  return { duplicate: false as const, id: asString((data as any)?.id) };
}

async function updateWebhookEvent(eventId: string | null, patch: Record<string, unknown>) {
  if (!eventId) return;
  const { error } = await supabaseAdmin.from("mail_provider_events").update(patch).eq("id", eventId);
  if (error) throw error;
}

async function resolveRecipient(event: NormalizedMailWebhookEvent): Promise<RecipientRow | null> {
  const select = "id,campaign_id,user_id,email,status,sent_at,suppression_reason,bounce_type,unsubscribed_at";

  if (event.recipientId) {
    const { data, error } = await supabaseAdmin
      .from("mail_campaign_recipients")
      .select(select)
      .eq("id", event.recipientId)
      .maybeSingle();
    if (error) throw error;
    if (data?.id) return data as RecipientRow;
  }

  if (event.providerMessageId) {
    const { data, error } = await supabaseAdmin
      .from("mail_campaign_recipients")
      .select(select)
      .eq("provider_message_id", event.providerMessageId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data?.id) return data as RecipientRow;
  }

  if (event.campaignId && event.email) {
    const { data, error } = await supabaseAdmin
      .from("mail_campaign_recipients")
      .select(select)
      .eq("campaign_id", event.campaignId)
      .ilike("email", event.email)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data?.id) return data as RecipientRow;
  }

  if (event.userId && event.email) {
    const { data, error } = await supabaseAdmin
      .from("mail_campaign_recipients")
      .select(select)
      .eq("user_id", event.userId)
      .ilike("email", event.email)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data?.id) return data as RecipientRow;
  }

  return null;
}

async function markDelivered(recipient: RecipientRow, event: NormalizedMailWebhookEvent) {
  const now = new Date().toISOString();
  const eventAt = event.occurredAt || now;
  const patch: Record<string, unknown> = {
    status: "sent",
    sent_at: recipient.sent_at || eventAt,
    delivery_status: "delivered",
    delivery_event: "delivered",
    delivery_last_event_at: eventAt,
    delivered_at: eventAt,
    updated_at: now,
  };

  if (recipient.status === "failed" && recipient.suppression_reason !== "hard_bounce" && recipient.suppression_reason !== "complaint") {
    patch.error = null;
    patch.last_error = null;
    patch.bounce_type = null;
    patch.bounced_at = null;
    patch.suppression_reason = recipient.unsubscribed_at ? "opt_out" : null;
  }

  const { error } = await supabaseAdmin
    .from("mail_campaign_recipients")
    .update(patch)
    .eq("id", recipient.id);
  if (error) throw error;
}

async function markBounce(recipient: RecipientRow, event: NormalizedMailWebhookEvent) {
  const now = new Date().toISOString();
  const eventAt = event.occurredAt || now;
  const reason = String(event.reason || (event.bounceType === "hard" ? "Rebond dur signalé par le provider." : "Rebond signalé par le provider.")).slice(0, 500);
  const suppressionReason = event.bounceType === "hard" ? "hard_bounce" : null;

  const patch: Record<string, unknown> = {
    status: "failed",
    delivery_status: "bounced",
    delivery_event: event.bounceType === "hard" ? "hard_bounce" : "soft_bounce",
    delivery_last_event_at: eventAt,
    bounce_type: event.bounceType,
    bounced_at: eventAt,
    error: reason,
    last_error: reason,
    updated_at: now,
  };
  if (suppressionReason) patch.suppression_reason = suppressionReason;

  const { error } = await supabaseAdmin.from("mail_campaign_recipients").update(patch).eq("id", recipient.id);
  if (error) throw error;

  if (suppressionReason) {
    await upsertSuppressionEntry({
      user_id: recipient.user_id,
      email: recipient.email,
      reason: "hard_bounce",
      source: `provider_webhook:${event.provider}`,
      campaign_id: recipient.campaign_id,
      recipient_id: recipient.id,
      note: reason,
    });

    await markQueuedRecipientsBlockedBySuppression({
      userId: recipient.user_id,
      email: recipient.email,
      reason: "hard_bounce",
      source: `provider_webhook:${event.provider}`,
      note: reason,
    });
  }
}

async function markComplaint(recipient: RecipientRow, event: NormalizedMailWebhookEvent) {
  const now = new Date().toISOString();
  const eventAt = event.occurredAt || now;
  const reason = String(event.reason || "Plainte spam signalée par le provider.").slice(0, 500);

  const { error } = await supabaseAdmin
    .from("mail_campaign_recipients")
    .update({
      status: "failed",
      delivery_status: "complained",
      delivery_event: "complaint",
      delivery_last_event_at: eventAt,
      suppression_reason: "complaint",
      error: reason,
      last_error: reason,
      updated_at: now,
    })
    .eq("id", recipient.id);
  if (error) throw error;

  await upsertSuppressionEntry({
    user_id: recipient.user_id,
    email: recipient.email,
    reason: "complaint",
    source: `provider_webhook:${event.provider}`,
    campaign_id: recipient.campaign_id,
    recipient_id: recipient.id,
    note: reason,
  });

  await markQueuedRecipientsBlockedBySuppression({
    userId: recipient.user_id,
    email: recipient.email,
    reason: "complaint",
    source: `provider_webhook:${event.provider}`,
    note: reason,
  });
}

async function markUnsubscribe(recipient: RecipientRow, event: NormalizedMailWebhookEvent) {
  const now = new Date().toISOString();
  const eventAt = event.occurredAt || now;
  const reason = String(event.reason || "Désinscription signalée par le provider.").slice(0, 500);
  const nextStatus = recipient.status === "failed" ? "failed" : "sent";
  const patch: Record<string, unknown> = {
    status: nextStatus,
    sent_at: recipient.sent_at || eventAt,
    delivery_status: "unsubscribed",
    delivery_event: "unsubscribe",
    delivery_last_event_at: eventAt,
    suppression_reason: "opt_out",
    unsubscribed_at: eventAt,
    error: reason,
    last_error: reason,
    updated_at: now,
  };

  const { error } = await supabaseAdmin.from("mail_campaign_recipients").update(patch).eq("id", recipient.id);
  if (error) throw error;

  await upsertSuppressionEntry({
    user_id: recipient.user_id,
    email: recipient.email,
    reason: "opt_out",
    source: `provider_webhook:${event.provider}`,
    campaign_id: recipient.campaign_id,
    recipient_id: recipient.id,
    note: reason,
  });

  await markQueuedRecipientsBlockedBySuppression({
    userId: recipient.user_id,
    email: recipient.email,
    reason: "opt_out",
    source: `provider_webhook:${event.provider}`,
    note: reason,
  });
}

export async function processMailWebhookEvent(event: NormalizedMailWebhookEvent) {
  const inserted = await insertWebhookEvent(event);
  if (inserted.duplicate) {
    return { kind: event.kind, duplicate: true, matched: false, updated: false };
  }

  if (event.kind === "ignored") {
    await updateWebhookEvent(inserted.id, { processed_at: new Date().toISOString(), result: "ignored" });
    return { kind: event.kind, duplicate: false, matched: false, updated: false };
  }

  const recipient = await resolveRecipient(event);
  if (!recipient?.id) {
    await updateWebhookEvent(inserted.id, { processed_at: new Date().toISOString(), result: "unmatched" });
    return { kind: event.kind, duplicate: false, matched: false, updated: false };
  }

  if (event.kind === "delivered") {
    await markDelivered(recipient, event);
  } else if (event.kind === "bounce") {
    await markBounce(recipient, event);
  } else if (event.kind === "complaint") {
    await markComplaint(recipient, event);
  } else if (event.kind === "unsubscribe") {
    await markUnsubscribe(recipient, event);
  }

  await refreshCampaignCounters(recipient.campaign_id);
  await updateWebhookEvent(inserted.id, {
    processed_at: new Date().toISOString(),
    result: "processed",
    matched_campaign_id: recipient.campaign_id,
    matched_recipient_id: recipient.id,
  });

  return { kind: event.kind, duplicate: false, matched: true, updated: true };
}
