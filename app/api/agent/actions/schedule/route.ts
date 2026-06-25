import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { rowToInrAgentAction } from "@/lib/inrAgentActions";
import { rowToInrAgentScheduledAction, scheduledActionToDbRow } from "@/lib/inrAgentScheduledActions";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 90;

type JsonRecord = Record<string, unknown>;
type BoosterChannel =
  | "inrcy_site"
  | "site_web"
  | "gmb"
  | "facebook"
  | "instagram"
  | "linkedin"
  | "tiktok"
  | "youtube_shorts";

type BoosterPost = {
  title: string;
  content: string;
  cta: string;
  hashtags: string[];
};

const ACTION_SELECT =
  "id, automation_key, action_type, target_tool, title, summary, preview_text, target_channels, target_themes, recipients, image_assets, payload, validation_required, execution_policy, status, scheduled_for, prepared_at, validated_at, refused_at, completed_at, last_error, created_at, updated_at";

const SCHEDULED_ACTION_SELECT = "id, automation_key, action_type, target_tool, source, title, summary, scheduled_at, timezone, channels, payload, status, attempt_count, last_error, executed_at, created_at, updated_at";

const schedulableStatuses = new Set([
  "prepared",
  "pending_validation",
  "pending",
  "draft",
  "validated",
  "failed",
]);

const agentToBoosterChannel: Record<string, BoosterChannel> = {
  site_inrcy: "inrcy_site",
  siteInrcy: "inrcy_site",
  inrcy_site: "inrcy_site",
  site_web: "site_web",
  siteWeb: "site_web",
  gmb: "gmb",
  google_business: "gmb",
  facebook: "facebook",
  instagram: "instagram",
  linkedin: "linkedin",
  tiktok: "tiktok",
  youtube: "youtube_shorts",
  youtube_shorts: "youtube_shorts",
};


function canPublishWithoutMedia(channel: BoosterChannel) {
  return ["inrcy_site", "site_web", "gmb", "facebook", "linkedin"].includes(channel);
}

function isVideoOnlyChannel(channel: BoosterChannel) {
  return channel === "youtube_shorts";
}

function isImageRequiredChannel(channel: BoosterChannel) {
  return channel === "instagram" || channel === "tiktok";
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function cleanText(value: unknown, maxLength = 5000) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function sanitizeFutureDate(value: unknown) {
  const date = new Date(String(value || ""));
  if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now() + 30_000) return null;
  return date.toISOString();
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

function cleanHashtags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) =>
      String(tag || "")
        .trim()
        .replace(/^#+/, "")
        .replace(/[^\p{L}\p{N}_]/gu, "")
        .slice(0, 40),
    )
    .filter(Boolean)
    .slice(0, 20);
}

function normalizePost(raw: unknown, fallback?: BoosterPost): BoosterPost {
  const record = asRecord(raw) || {};
  const title = cleanText(record.title ?? fallback?.title ?? "", 140);
  const content = cleanText(record.content ?? record.text ?? record.caption ?? fallback?.content ?? "", 6000);
  const cta = cleanText(record.cta ?? fallback?.cta ?? "", 220);
  const hashtags = cleanHashtags(record.hashtags).length ? cleanHashtags(record.hashtags) : fallback?.hashtags || [];
  return { title, content, cta, hashtags };
}

function ensurePublishablePost(post: BoosterPost, fallbackText: string): BoosterPost {
  const fallback = cleanText(fallbackText, 1000) || "Publication préparée par iNr’Agent.";
  return {
    title: post.title,
    content: post.content || post.title || fallback,
    cta: post.cta,
    hashtags: post.hashtags,
  };
}

function normalizeBoosterChannels(input: unknown): BoosterChannel[] {
  const raw = Array.isArray(input) ? input : [];
  return Array.from(
    new Set(
      raw
        .map((channel) => {
          const value = String(channel || "").trim();
          return agentToBoosterChannel[value] || value;
        })
        .filter((channel): channel is BoosterChannel => Boolean(agentToBoosterChannel[channel] || ["inrcy_site", "site_web", "gmb", "facebook", "instagram", "linkedin", "tiktok", "youtube_shorts"].includes(channel))),
    ),
  );
}

function getFirstPost(postByChannel: Record<string, BoosterPost>, channels: BoosterChannel[]) {
  return (
    channels
      .map((channel) => postByChannel[channel])
      .find((post) => post?.title || post?.content) ||
    Object.values(postByChannel).find((post) => post?.title || post?.content) ||
    { title: "", content: "", cta: "", hashtags: [] }
  );
}

function mimeFromPath(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

async function buildImagePayloadFromAgentAction(payload: JsonRecord, actionId: string) {
  const image = asRecord(payload.imageAsset) || asRecord(payload.image) || null;
  if (!image) return null;

  const bucket = cleanText(image.bucket || "inrcy-image-bank", 120) || "inrcy-image-bank";
  const storagePath = cleanText(image.storagePath || image.storage_path || image.path || "", 800);
  const title = cleanText(image.title || image.name || "image-iNrAgent", 120);

  if (storagePath) {
    const download = await supabaseAdmin.storage.from(bucket).download(storagePath);
    if (download.error || !download.data) {
      throw new Error(download.error?.message || "Impossible de préparer l’image iNr’Agent.");
    }

    const buffer = Buffer.from(await download.data.arrayBuffer());
    const mime = download.data.type || mimeFromPath(storagePath);
    const extension = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    return {
      name: `${title || "image-iNrAgent"}.${extension}`,
      type: mime,
      dataUrl: `data:${mime};base64,${buffer.toString("base64")}`,
      originalName: title || `image-iNrAgent-${actionId}`,
      originalType: mime,
      imageKey: cleanText(image.id || actionId, 120),
      imageMeta: { source: "inrcy_image_bank", bucket, storagePath, title },
    };
  }

  const publicUrl = cleanText(image.url || image.publicUrl || image.src || "", 2000);
  if (!publicUrl) return null;
  return {
    name: `${title || "image-iNrAgent"}.jpg`,
    type: "image/jpeg",
    publicUrl,
    originalPublicUrl: publicUrl,
    originalName: title || `image-iNrAgent-${actionId}`,
    originalType: "image/jpeg",
    imageKey: cleanText(image.id || actionId, 120),
    imageMeta: { source: "inrcy_image_bank", title },
  };
}

function normalizeCampaignRecipients(input: unknown) {
  const raw = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const recipients: Array<{ contact_id: string | null; display_name: string | null; email: string }> = [];

  for (const item of raw) {
    const record = asRecord(item);
    const email = cleanText(record?.email || item, 260).toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(email) || seen.has(email)) continue;
    seen.add(email);
    recipients.push({
      contact_id: cleanText(record?.contact_id || record?.contactId || "", 140) || null,
      display_name: cleanText(record?.display_name || record?.displayName || record?.name || "", 220) || null,
      email,
    });
  }
  return recipients;
}

function normalizeCampaignAttachments(input: unknown) {
  const raw = Array.isArray(input) ? input : [];
  return raw
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      const bucket = cleanText(record.bucket, 120);
      const path = cleanText(record.path || record.storagePath || record.storage_path, 500);
      if (!bucket || !path) return null;
      const size = Number(record.size ?? record.bytes ?? record.sizeBytes ?? record.size_bytes ?? 0);
      return {
        bucket,
        path,
        name: cleanText(record.name || record.filename || record.fileName, 240) || path.split("/").pop() || "piece-jointe",
        type: cleanText(record.type || record.mimeType || record.mime_type, 140) || "application/octet-stream",
        size: Number.isFinite(size) && size > 0 ? size : null,
      };
    })
    .filter(Boolean)
    .slice(0, 10);
}

function isCampaignAgentAction(action: ReturnType<typeof rowToInrAgentAction>) {
  return (
    (action.automationKey === "grow" || action.automationKey === "loyalty") &&
    (action.targetTool === "propulser" || action.targetTool === "fideliser" || action.targetTool === "mails") &&
    (action.actionType === "campaign" || action.actionType === "loyalty" || action.actionType === "mailing")
  );
}

async function buildScheduledPayload(action: ReturnType<typeof rowToInrAgentAction>) {
  const payload = action.payload || {};

  if (isCampaignAgentAction(action)) {
    const accountId = cleanText(payload.accountId || payload.mailAccountId || "", 140);
    const subject = cleanText(payload.campaignSubject || payload.subject, 220);
    const text = cleanText(payload.campaignBody || payload.bodyText || payload.text, 6000);
    const html = cleanText(payload.bodyHtml || payload.html, 9000);
    const recipients = normalizeCampaignRecipients(payload.recipients || action.recipients);
    const folder = cleanText(payload.folder, 80) || (action.automationKey === "loyalty" ? "fidelisations" : "propulsions");
    const trackKind = cleanText(payload.trackKind, 80) || (action.automationKey === "loyalty" ? "fideliser" : "propulser");
    const trackType = cleanText(payload.trackType, 80);
    const templateKey = cleanText(payload.templateKey, 180);
    const attachments = normalizeCampaignAttachments(payload.attachments);

    if (!accountId) throw new Error("Boîte d’envoi manquante pour cette campagne.");
    if (!subject || !text) throw new Error("La campagne préparée est incomplète.");
    if (!recipients.length) throw new Error("Aucun destinataire valide pour cette campagne.");

    return {
      actionType: "campaign" as const,
      targetTool: action.targetTool === "fideliser" ? "fideliser" as const : action.targetTool === "mails" ? "mails" as const : "propulser" as const,
      channels: ["mails"],
      payload: {
        kind: "mail_campaign",
        sourceActionId: action.id,
        campaign: {
          accountId,
          type: "mail",
          subject,
          text,
          html,
          recipients,
          folder,
          trackKind,
          trackType,
          templateKey,
          attachments,
          metadata: {
            source: "inr_agent",
            label: "iNr'Agent",
            agentActionId: action.id,
            automationKey: action.automationKey,
            targetTool: action.targetTool,
            actionType: action.actionType,
            theme: trackType || null,
            signatureAutomatic: payload.signatureAutomatic !== false,
            scheduledFromValidation: true,
          },
        },
      },
    };
  }

  if (action.automationKey === "publish" && action.targetTool === "booster" && action.actionType === "publication") {
    const selectedChannels = normalizeBoosterChannels(payload.selectedChannels || payload.channels || action.targetChannels);
    const imagePayload = await buildImagePayloadFromAgentAction(payload, action.id);
    const hasImagePayload = Boolean(imagePayload);
    const publishChannels = selectedChannels.filter((channel) => {
      if (isVideoOnlyChannel(channel)) return false;
      if (isImageRequiredChannel(channel)) return hasImagePayload;
      return canPublishWithoutMedia(channel) || hasImagePayload;
    });
    if (!publishChannels.length) throw new Error("Aucun canal prêt à programmer. Les canaux sélectionnés nécessitent un média ou une vidéo.");

    const rawPostByChannel = asRecord(payload.postByChannel) || {};
    const fallbackText = cleanText(action.summary || payload.idea || action.title, 1000);
    const normalizedPostByChannel = Object.fromEntries(
      publishChannels.map((channel) => [
        channel,
        ensurePublishablePost(normalizePost(rawPostByChannel[channel]), fallbackText),
      ]),
    ) as Record<string, BoosterPost>;
    const firstPost = ensurePublishablePost(
      getFirstPost(normalizedPostByChannel, publishChannels),
      fallbackText,
    );

    const mediaModeByChannel = Object.fromEntries(publishChannels.map((channel) => [channel, hasImagePayload ? "images" : "none"]));
    return {
      actionType: "publication" as const,
      targetTool: "booster" as const,
      channels: publishChannels,
      payload: {
        kind: "manual_publish_schedule",
        sourceActionId: action.id,
        publishPayload: {
          channels: publishChannels,
          post: firstPost,
          postByChannel: normalizedPostByChannel,
          idea: cleanText(payload.idea || action.summary, 500),
          mediaType: "images",
          mediaModeByChannel,
          images: imagePayload ? [imagePayload] : [],
          workflowTool: "booster",
          workflowAction: "publier",
          source: "inr_agent",
          inrAgentActionId: action.id,
        },
      },
    };
  }

  throw new Error("Cette action iNr’Agent ne peut pas être programmée.");
}

export async function POST(request: Request) {
  const { user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const body = await request.json().catch(() => null) as { actionId?: unknown; scheduledAt?: unknown; timezone?: unknown } | null;
  const actionId = cleanText(body?.actionId, 120);
  const scheduledAt = sanitizeFutureDate(body?.scheduledAt);
  if (!actionId) return NextResponse.json({ error: "Action iNr’Agent introuvable." }, { status: 400 });
  if (!scheduledAt) return NextResponse.json({ error: "Choisissez une date et une heure dans le futur." }, { status: 400 });

  const { data: actionRow, error: readError } = await supabaseAdmin
    .from("inr_agent_actions")
    .select(ACTION_SELECT)
    .eq("id", actionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ error: "Lecture de l’action iNr’Agent impossible.", detail: readError.message }, { status: 500 });
  }
  if (!actionRow) return NextResponse.json({ error: "Action iNr’Agent introuvable." }, { status: 404 });

  const action = rowToInrAgentAction(actionRow as any);
  if (!schedulableStatuses.has(action.status)) {
    return NextResponse.json({ error: "Cette action ne peut pas être programmée dans son état actuel." }, { status: 400 });
  }

  try {
    const scheduledPayload = await buildScheduledPayload(action);
    const timezone = cleanText(body?.timezone, 80) || "Europe/Paris";
    const baseScheduleArgs = {
      userId: user.id,
      automationKey: action.automationKey,
      actionType: scheduledPayload.actionType,
      targetTool: scheduledPayload.targetTool,
      source: "manual" as const,
      title: action.title || "Action iNr’Agent programmée",
      summary: action.summary || "Action validée et programmée depuis iNr’Agent.",
      scheduledAt,
      timezone,
    };

    const rows = scheduledPayload.actionType === "publication" && scheduledPayload.channels.length > 1
      ? scheduledPayload.channels.map((channel) => {
          const publishPayload = asRecord(scheduledPayload.payload.publishPayload) || {};
          const postByChannel = asRecord(publishPayload.postByChannel) || {};
          const mediaModesByChannel = asRecord(publishPayload.mediaModeByChannel) || {};
          const channelPost = postByChannel[channel] || publishPayload.post || {};
          const channelMediaMode = cleanText(mediaModesByChannel[channel], 20) || "none";
          return scheduledActionToDbRow({
            ...baseScheduleArgs,
            title: baseScheduleArgs.title,
            channels: [channel],
            payload: {
              ...scheduledPayload.payload,
              publishPayload: {
                ...publishPayload,
                channels: [channel],
                post: channelPost,
                postByChannel: { [channel]: channelPost },
                mediaModeByChannel: { [channel]: channelMediaMode },
              },
            },
          });
        })
      : [
          scheduledActionToDbRow({
            ...baseScheduleArgs,
            channels: scheduledPayload.channels,
            payload: scheduledPayload.payload,
          }),
        ];

    const { data: scheduledRows, error: insertError } = await supabaseAdmin
      .from("inr_agent_scheduled_actions")
      .insert(rows)
      .select(SCHEDULED_ACTION_SELECT);

    if (insertError) {
      if (isMissingTableError(insertError)) {
        return NextResponse.json({ error: "La base de programmation iNrAgent doit être initialisée.", tableMissing: true }, { status: 500 });
      }
      return NextResponse.json({ error: "Programmation de l’action impossible.", detail: insertError.message }, { status: 500 });
    }

    const createdScheduledRows = Array.isArray(scheduledRows) ? scheduledRows : [];
    if (!createdScheduledRows.length) {
      return NextResponse.json({ error: "Aucune action programmée n’a été créée." }, { status: 500 });
    }
    const now = new Date().toISOString();
    const { data: updatedActionRow, error: updateError } = await supabaseAdmin
      .from("inr_agent_actions")
      .update({
        status: "scheduled",
        scheduled_for: scheduledAt,
        validated_at: now,
        refused_at: null,
        last_error: null,
        payload: {
          ...(action.payload || {}),
          scheduledExecution: {
            scheduledActionIds: createdScheduledRows.map((row) => row.id),
            scheduledAt,
            createdAt: now,
          },
        },
        updated_at: now,
      })
      .eq("id", action.id)
      .eq("user_id", user.id)
      .select(ACTION_SELECT)
      .single();

    if (updateError) {
      return NextResponse.json({ error: "Action programmée créée, mais mise à jour iNrAgent impossible.", detail: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      action: rowToInrAgentAction(updatedActionRow as any),
      scheduledActions: createdScheduledRows.map(rowToInrAgentScheduledAction),
      scheduledAction: createdScheduledRows[0] ? rowToInrAgentScheduledAction(createdScheduledRows[0]) : null,
      scheduled: true,
      tableMissing: false,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Programmation de l’action impossible." },
      { status: 400 },
    );
  }
}
