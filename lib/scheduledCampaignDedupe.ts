import { createHash } from "crypto";

const DEFAULT_CAMPAIGN_DUPLICATE_WINDOW_MINUTES = 60;
const DEFAULT_CAMPAIGN_IMMEDIATE_LOOKAHEAD_MINUTES = 7 * 24 * 60;
const DUPLICATE_STATUSES = ["scheduled", "running"];

type JsonRecord = Record<string, unknown>;

type SupabaseLike = {
  from: (table: string) => any;
};

export type ScheduledCampaignDuplicate = {
  duplicate: boolean;
  reason?: string;
  existingId?: string;
  existingTitle?: string;
  existingScheduledAt?: string | null;
  tool?: string;
  recipientCount?: number;
  windowMinutes: number;
};

type CampaignDeduplicationSignature = {
  tool: string;
  subject: string;
  body: string;
  recipients: string;
  attachments: string;
  recipientCount: number;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function cleanText(value: unknown, maxLength = 6000) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, maxLength);
}

function stableHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 32);
}

function getCampaignPayload(payload: unknown): JsonRecord {
  const record = asRecord(payload) || {};
  return asRecord(record.campaign) || record;
}

function normalizeTool(value: unknown) {
  const raw = cleanText(value, 80).replace(/[^a-z0-9_]+/g, "_");
  if (raw.includes("fideliser") || raw.includes("fidelisation") || raw.includes("loyalty")) return "fideliser";
  if (raw.includes("propulser") || raw.includes("propulsion") || raw.includes("grow")) return "propulser";
  if (raw.includes("mail")) return "mails";
  return raw || "mails";
}

function getCampaignTool(rowOrPayload: unknown, campaign: JsonRecord) {
  const record = asRecord(rowOrPayload) || {};
  return normalizeTool(
    record.target_tool ||
      campaign.targetTool ||
      campaign.target_tool ||
      campaign.trackKind ||
      campaign.track_kind ||
      campaign.workflowFinalizerKind ||
      campaign.folder ||
      campaign.type ||
      "mails",
  );
}

function normalizeRecipients(input: unknown): string[] {
  const values: string[] = [];
  const pushEmail = (raw: unknown) => {
    const text = String(raw || "").trim();
    if (!text) return;
    for (const part of text.split(/[;,\n\r]+/g)) {
      const email = part.trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(email)) values.push(email);
    }
  };

  if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === "string") pushEmail(item);
      else if (item && typeof item === "object") pushEmail((item as any).email);
    }
  } else {
    pushEmail(input);
  }

  return Array.from(new Set(values)).sort();
}

function getAttachmentIdentity(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return cleanText(value, 500);
  const record = asRecord(value);
  if (!record) return "";
  return cleanText(
    record.storagePath ||
      record.storage_path ||
      record.path ||
      record.publicUrl ||
      record.public_url ||
      record.url ||
      `${record.name || record.filename || ""}:${record.size || record.bytes || ""}:${record.type || record.mimeType || record.mime_type || ""}`,
    700,
  );
}

function getAttachmentSignature(input: unknown) {
  const items = Array.isArray(input) ? input : [];
  const identities = items.map(getAttachmentIdentity).filter(Boolean).sort();
  return identities.length ? stableHash(identities) : "";
}

function buildCampaignSignature(rowOrPayload: unknown): CampaignDeduplicationSignature | null {
  const campaign = getCampaignPayload(rowOrPayload);
  const subject = cleanText(campaign.subject, 260);
  const body = cleanText(
    campaign.text || campaign.body_text || campaign.bodyText || campaign.html || campaign.body_html || campaign.bodyHtml,
    9000,
  );
  const recipients = normalizeRecipients(campaign.recipients || campaign.to || campaign.to_emails);
  if (!recipients.length) return null;

  const meaningfulBody = body.length >= 18 ? body : "";
  const meaningfulSubject = subject.length >= 4 ? subject : "";
  if (!meaningfulSubject && !meaningfulBody) return null;

  return {
    tool: getCampaignTool(rowOrPayload, campaign),
    subject: meaningfulSubject ? stableHash(meaningfulSubject) : "",
    body: meaningfulBody ? stableHash(meaningfulBody) : "",
    recipients: stableHash(recipients),
    attachments: getAttachmentSignature(campaign.attachments),
    recipientCount: recipients.length,
  };
}

function isSameCampaignSignature(
  current: CampaignDeduplicationSignature | null,
  existing: CampaignDeduplicationSignature | null,
) {
  if (!current || !existing) return false;
  if (current.tool && existing.tool && current.tool !== existing.tool) return false;
  if (!current.recipients || current.recipients !== existing.recipients) return false;

  if (current.subject && existing.subject && current.subject === existing.subject) {
    if (current.body && existing.body && current.body === existing.body) return true;
    if (current.attachments && existing.attachments && current.attachments === existing.attachments) return true;
  }

  return Boolean(current.body && existing.body && current.body === existing.body && current.attachments && existing.attachments && current.attachments === existing.attachments);
}

function getScheduledWindowIso(scheduledAt: string, minutes: number) {
  const time = new Date(scheduledAt).getTime();
  const delta = Math.max(1, minutes) * 60_000;
  return {
    from: new Date(time - delta).toISOString(),
    to: new Date(time + delta).toISOString(),
  };
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    error?.code === "PGRST205" ||
    message.includes("inr_agent_scheduled_actions")
  );
}

function isCampaignScheduledRow(row: any) {
  const actionType = cleanText(row?.action_type, 80);
  const targetTool = cleanText(row?.target_tool, 80);
  const payload = asRecord(row?.payload) || {};
  const kind = cleanText(payload.kind, 80);
  return (
    kind === "mail_campaign" ||
    ["campaign", "mailing", "loyalty"].includes(actionType) ||
    ["mails", "propulser", "fideliser"].includes(targetTool)
  );
}

export async function findSimilarScheduledCampaign(args: {
  supabase: SupabaseLike;
  userId: string;
  scheduledAt: string;
  payload: unknown;
  excludeId?: string | null;
  windowMinutes?: number;
}): Promise<ScheduledCampaignDuplicate> {
  const windowMinutes = Math.max(
    5,
    Math.min(
      240,
      Math.round(args.windowMinutes || DEFAULT_CAMPAIGN_DUPLICATE_WINDOW_MINUTES),
    ),
  );
  const currentSignature = buildCampaignSignature(args.payload);
  if (!currentSignature) return { duplicate: false, windowMinutes };

  const { from, to } = getScheduledWindowIso(args.scheduledAt, windowMinutes);
  const { data, error } = await args.supabase
    .from("inr_agent_scheduled_actions")
    .select("id,title,scheduled_at,payload,status,action_type,target_tool")
    .eq("user_id", args.userId)
    .in("status", DUPLICATE_STATUSES)
    .gte("scheduled_at", from)
    .lte("scheduled_at", to)
    .limit(80);

  if (error) {
    if (isMissingTableError(error)) return { duplicate: false, windowMinutes };
    console.warn("[scheduled-campaign-dedupe] duplicate lookup failed", error);
    return { duplicate: false, windowMinutes };
  }

  const rows = Array.isArray(data) ? data : [];
  const excludeId = String(args.excludeId || "").trim();
  for (const row of rows) {
    const rowId = String(row?.id || "").trim();
    if (excludeId && rowId === excludeId) continue;
    if (!isCampaignScheduledRow(row)) continue;
    const existingSignature = buildCampaignSignature({
      ...row,
      ...getCampaignPayload(row?.payload),
    });
    if (!isSameCampaignSignature(currentSignature, existingSignature)) continue;

    return {
      duplicate: true,
      reason: "similar_scheduled_campaign_same_recipients_content_same_slot",
      existingId: rowId,
      existingTitle: String(row?.title || "Campagne programmée"),
      existingScheduledAt: String(row?.scheduled_at || "") || null,
      tool: currentSignature.tool,
      recipientCount: currentSignature.recipientCount,
      windowMinutes,
    };
  }

  return { duplicate: false, windowMinutes };
}

export async function findSimilarUpcomingScheduledCampaign(args: {
  supabase: SupabaseLike;
  userId: string;
  payload: unknown;
  nowIso?: string;
  lookaheadMinutes?: number;
}): Promise<ScheduledCampaignDuplicate> {
  const windowMinutes = Math.max(
    60,
    Math.min(
      14 * 24 * 60,
      Math.round(args.lookaheadMinutes || DEFAULT_CAMPAIGN_IMMEDIATE_LOOKAHEAD_MINUTES),
    ),
  );
  const currentSignature = buildCampaignSignature(args.payload);
  if (!currentSignature) return { duplicate: false, windowMinutes };

  const now = args.nowIso ? new Date(args.nowIso) : new Date();
  const nowMs = Number.isFinite(now.getTime()) ? now.getTime() : Date.now();
  const from = new Date(nowMs - 2 * 60_000).toISOString();
  const to = new Date(nowMs + windowMinutes * 60_000).toISOString();

  const { data, error } = await args.supabase
    .from("inr_agent_scheduled_actions")
    .select("id,title,scheduled_at,payload,status,action_type,target_tool")
    .eq("user_id", args.userId)
    .in("status", DUPLICATE_STATUSES)
    .gte("scheduled_at", from)
    .lte("scheduled_at", to)
    .limit(120);

  if (error) {
    if (isMissingTableError(error)) return { duplicate: false, windowMinutes };
    console.warn("[scheduled-campaign-dedupe] upcoming duplicate lookup failed", error);
    return { duplicate: false, windowMinutes };
  }

  const rows = Array.isArray(data) ? data : [];
  for (const row of rows) {
    if (!isCampaignScheduledRow(row)) continue;
    const existingSignature = buildCampaignSignature({
      ...row,
      ...getCampaignPayload(row?.payload),
    });
    if (!isSameCampaignSignature(currentSignature, existingSignature)) continue;

    return {
      duplicate: true,
      reason: "similar_upcoming_scheduled_campaign_same_recipients_content",
      existingId: String(row?.id || "").trim(),
      existingTitle: String(row?.title || "Campagne programmée"),
      existingScheduledAt: String(row?.scheduled_at || "") || null,
      tool: currentSignature.tool,
      recipientCount: currentSignature.recipientCount,
      windowMinutes,
    };
  }

  return { duplicate: false, windowMinutes };
}
