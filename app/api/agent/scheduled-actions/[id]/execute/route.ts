import { NextResponse } from "next/server";
import { POST as executeAgentAction } from "@/app/api/agent/actions/execute/route";
import { rowToInrAgentScheduledAction } from "@/lib/inrAgentScheduledActions";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 180;

const SCHEDULED_ACTION_SELECT =
  "id, automation_key, action_type, target_tool, source, title, summary, scheduled_at, timezone, channels, payload, status, attempt_count, last_error, executed_at, created_at, updated_at";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanText(value: unknown, maxLength = 5000) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

function isVideoMedia(record: Record<string, unknown>) {
  const hint = cleanText(
    record.kind ||
      record.mediaType ||
      record.media_type ||
      record.mimeType ||
      record.mime_type ||
      record.type ||
      record.url ||
      record.storagePath ||
      record.storage_path ||
      record.path,
    700,
  ).toLowerCase();
  return hint.includes("video") || /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(hint);
}

function firstMediaFromPosts(postByChannel: Record<string, unknown>) {
  for (const value of Object.values(postByChannel)) {
    const post = asRecord(value);
    for (const key of ["media", "mediaAsset", "video", "videoAsset", "image", "imageAsset"]) {
      const media = asRecord(post[key]);
      if (Object.keys(media).length) return media;
    }
  }
  return null;
}

function buildActionFromScheduled(row: any, userId: string) {
  const payload = asRecord(row.payload);
  const kind = cleanText(payload.kind, 120).toLowerCase();
  const targetTool = cleanText(row.target_tool, 80).toLowerCase();
  const actionType = cleanText(row.action_type, 80).toLowerCase();
  const channels = Array.isArray(row.channels)
    ? row.channels.map((channel: unknown) => cleanText(channel, 80)).filter(Boolean)
    : [];
  const now = new Date().toISOString();

  if (targetTool === "booster" || actionType === "publication" || kind === "manual_publish_schedule") {
    const publishPayload = asRecord(payload.publishPayload);
    const postByChannel = asRecord(publishPayload.postByChannel || payload.postByChannel);
    const images = Array.isArray(publishPayload.images)
      ? publishPayload.images
      : Array.isArray(payload.images)
        ? payload.images
        : [];
    const video = asRecord(publishPayload.video || payload.video);
    const firstMedia = Object.keys(video).length
      ? video
      : images.find((item: unknown) => Object.keys(asRecord(item)).length)
        ? asRecord(images.find((item: unknown) => Object.keys(asRecord(item)).length))
        : firstMediaFromPosts(postByChannel);
    const imageAssets = firstMedia ? [firstMedia] : [];

    return {
      user_id: userId,
      automation_key: "publish",
      action_type: "publication",
      target_tool: "booster",
      title: cleanText(row.title, 180) || "Publication programmée",
      summary:
        cleanText(row.summary, 1000) ||
        cleanText(publishPayload.idea || payload.idea, 1000) ||
        "Publication programmée avec iNr’Agent.",
      preview_text:
        cleanText(row.summary, 1000) ||
        cleanText(publishPayload.idea || payload.idea, 1000),
      target_channels: channels,
      target_themes: [],
      recipients: [],
      image_assets: imageAssets,
      payload: {
        ...payload,
        ...publishPayload,
        postByChannel,
        selectedChannels: channels,
        channels,
        media: firstMedia,
        mediaAsset: firstMedia,
        imageAsset: firstMedia && !isVideoMedia(firstMedia) ? firstMedia : null,
        image: firstMedia && !isVideoMedia(firstMedia) ? firstMedia : null,
        images,
        video: Object.keys(video).length ? video : firstMedia && isVideoMedia(firstMedia) ? firstMedia : null,
        videoAsset: Object.keys(video).length ? video : firstMedia && isVideoMedia(firstMedia) ? firstMedia : null,
        scheduledRunNow: {
          scheduledActionId: row.id,
          previousScheduledAt: row.scheduled_at,
          launchedAt: now,
        },
      },
      validation_required: false,
      execution_policy: "manual_validation",
      status: "pending_validation",
      scheduled_for: null,
      prepared_at: now,
      updated_at: now,
    };
  }

  const campaign = asRecord(payload.campaign);
  const metadata = asRecord(campaign.metadata);
  const recipients = Array.isArray(campaign.recipients)
    ? campaign.recipients
    : Array.isArray(payload.recipients)
      ? payload.recipients
      : [];
  const attachments = Array.isArray(campaign.attachments)
    ? campaign.attachments
    : Array.isArray(payload.attachments)
      ? payload.attachments
      : [];
  const subject = cleanText(campaign.subject || payload.campaignSubject || payload.subject || row.title, 220);
  const text = cleanText(campaign.text || payload.campaignBody || payload.bodyText || row.summary, 6000);

  return {
    user_id: userId,
    automation_key: row.automation_key || (targetTool === "fideliser" ? "loyalty" : "grow"),
    action_type: "campaign",
    target_tool: targetTool === "fideliser" || targetTool === "mails" ? targetTool : "propulser",
    title: subject || cleanText(row.title, 180) || "Campagne programmée",
    summary: text || cleanText(row.summary, 1000) || "Campagne programmée avec iNr’Agent.",
    preview_text: text || cleanText(row.summary, 1000),
    target_channels: ["mails"],
    target_themes: cleanText(campaign.trackType || metadata.trackType || payload.trackType, 120)
      ? [cleanText(campaign.trackType || metadata.trackType || payload.trackType, 120)]
      : [],
    recipients,
    image_assets: [],
    payload: {
      ...payload,
      accountId: cleanText(campaign.accountId || payload.accountId, 140),
      campaignSubject: subject,
      subject,
      campaignBody: text,
      bodyText: text,
      bodyHtml: cleanText(campaign.html || payload.bodyHtml || payload.html, 9000),
      recipients,
      recipientCount: recipients.length,
      folder: cleanText(campaign.folder || payload.folder, 80),
      trackKind: cleanText(campaign.trackKind || metadata.trackKind || payload.trackKind, 80),
      trackType: cleanText(campaign.trackType || metadata.trackType || payload.trackType, 80),
      templateKey: cleanText(campaign.templateKey || metadata.templateKey || payload.templateKey, 180),
      attachments,
      signatureAutomatic: metadata.signatureAutomatic !== false,
      scheduledRunNow: {
        scheduledActionId: row.id,
        previousScheduledAt: row.scheduled_at,
        launchedAt: now,
      },
    },
    validation_required: false,
    execution_policy: "manual_validation",
    status: "pending_validation",
    scheduled_for: null,
    prepared_at: now,
    updated_at: now,
  };
}

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, errorResponse, activeUserId } = await requireUser();
  if (errorResponse) return errorResponse;
  const { id } = await ctx.params;

  const { data: scheduledRow, error: readError } = await supabaseAdmin
    .from("inr_agent_scheduled_actions")
    .select(SCHEDULED_ACTION_SELECT)
    .eq("id", id)
    .eq("user_id", activeUserId)
    .in("status", ["scheduled", "failed"])
    .maybeSingle();

  if (readError) {
    return NextResponse.json(
      { error: "Lecture de l’action programmée impossible." },
      { status: 500 },
    );
  }
  if (!scheduledRow) {
    return NextResponse.json({ error: "Action programmée introuvable." }, { status: 404 });
  }

  const actionRow = buildActionFromScheduled(scheduledRow, activeUserId);
  const { data: insertedAction, error: insertError } = await supabaseAdmin
    .from("inr_agent_actions")
    .insert(actionRow)
    .select("id")
    .single();

  if (insertError || !insertedAction?.id) {
    return NextResponse.json(
      { error: "Préparation du lancement immédiat impossible." },
      { status: 500 },
    );
  }

  const executeResponse = await executeAgentAction(
    new Request("http://inrcy.local/api/agent/actions/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionId: insertedAction.id }),
    }),
  );
  const executePayload = (await executeResponse.json().catch(() => null)) as Record<string, unknown> | null;

  if (!executeResponse.ok) {
    return NextResponse.json(
      {
        ...(executePayload || {}),
        error:
          cleanText(executePayload?.error, 800) ||
          "Lancement immédiat de l’action programmée impossible.",
      },
      { status: executeResponse.status || 500 },
    );
  }

  const now = new Date().toISOString();
  const { data: updatedScheduledRow, error: updateError } = await supabaseAdmin
    .from("inr_agent_scheduled_actions")
    .update({
      status: "done",
      executed_at: now,
      last_error: null,
      payload: {
        ...asRecord(scheduledRow.payload),
        launchedNow: {
          launchedAt: now,
          temporaryActionId: insertedAction.id,
          publishResult: executePayload?.publishResult || null,
          campaignResult: executePayload?.campaignResult || null,
        },
      },
      updated_at: now,
    })
    .eq("id", id)
    .eq("user_id", activeUserId)
    .select(SCHEDULED_ACTION_SELECT)
    .maybeSingle();

  if (updateError || !updatedScheduledRow) {
    return NextResponse.json(
      {
        ...(executePayload || {}),
        warning: "Action lancée, mais la programmation n’a pas pu être marquée comme exécutée.",
        detail: updateError?.message || null,
      },
    );
  }

  return NextResponse.json({
    ...(executePayload || {}),
    scheduledAction: rowToInrAgentScheduledAction(updatedScheduledRow),
    launchedNow: true,
  });
}
