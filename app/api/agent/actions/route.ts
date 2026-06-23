import { NextResponse } from "next/server";
import {
  rowToInrAgentAction,
  sanitizeInrAgentActionStatus,
  summarizeInrAgentActions,
} from "@/lib/inrAgentActions";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeMailSubject } from "@/lib/mailEncoding";
import { textToRichMailHtml } from "@/lib/mailRichText";

function isMissingTableError(
  error: { code?: string; message?: string } | null | undefined,
) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    error?.code === "PGRST205" ||
    message.includes("inr_agent_actions")
  );
}

const ACTION_SELECT =
  "id, automation_key, action_type, target_tool, title, summary, preview_text, target_channels, target_themes, recipients, image_assets, payload, validation_required, execution_policy, status, scheduled_for, prepared_at, validated_at, refused_at, completed_at, last_error, created_at, updated_at";
const IMAGE_BANK_BUCKET = "inrcy-image-bank";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cleanText(value: unknown, maxLength = 6000) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function withFreshReportDocument(payload: Record<string, unknown>) {
  const reportRecord = asRecord(payload.reportDocument);
  if (!reportRecord) return payload;

  const storagePath = String(
    reportRecord.storagePath || reportRecord.storage_path || reportRecord.path || "",
  ).trim();
  const bucket = String(reportRecord.bucket || "inr-agent-reports").trim();
  if (!storagePath || !bucket) return payload;

  return supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(storagePath, 60 * 60)
    .then(({ data }) => ({
      ...payload,
      reportDocument: {
        ...reportRecord,
        bucket,
        storagePath,
        downloadUrl:
          data?.signedUrl ||
          String(reportRecord.downloadUrl || reportRecord.url || "").trim(),
      },
    }))
    .catch(() => payload);
}

async function refreshImageAssetUrls(assets: unknown[]) {
  return Promise.all(
    assets.map(async (asset) => {
      const record = typeof asset === "string" ? { url: asset } : asRecord(asset);
      if (!record) return asset;

      const storagePath = String(
        record.storagePath || record.storage_path || record.path || "",
      ).trim();
      const bucket = String(record.bucket || IMAGE_BANK_BUCKET).trim();

      if (!storagePath || !bucket) return record;

      try {
        const signed = await supabaseAdmin.storage
          .from(bucket)
          .createSignedUrl(storagePath, 60 * 60);
        return {
          ...record,
          bucket,
          storagePath,
          url: signed.data?.signedUrl || record.url || record.publicUrl || "",
        };
      } catch {
        return record;
      }
    }),
  );
}

async function refreshActionImageUrls(action: ReturnType<typeof rowToInrAgentAction>) {
  const imageAssets = await refreshImageAssetUrls(action.imageAssets);
  let payload = { ...action.payload };
  const imageRecord = asRecord(payload.image || payload.imageAsset);
  if (imageRecord) {
    const [freshImage] = await refreshImageAssetUrls([imageRecord]);
    payload.image = freshImage;
    payload.imageAsset = freshImage;
  }
  payload = await withFreshReportDocument(payload);
  return { ...action, imageAssets, payload };
}


function cleanEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(email) ? email : "";
}

function isMissingDraftMetadataColumn(error: { code?: string; message?: string; details?: string; hint?: string } | null | undefined) {
  const msg = String(error?.message || error?.details || error?.hint || "").toLowerCase();
  return (
    error?.code === "PGRST204" ||
    msg.includes("folder") ||
    msg.includes("track_kind") ||
    msg.includes("track_type") ||
    msg.includes("template_key") ||
    msg.includes("attachments")
  );
}

function cleanDraftAttachment(item: unknown) {
  const record = asRecord(item);
  if (!record) return null;

  const bucket = cleanText(record.bucket, 120);
  const path = cleanText(record.path || record.storagePath || record.storage_path, 500);
  if (!bucket || !path) return null;

  return {
    bucket,
    path,
    name:
      cleanText(record.name || record.filename || record.fileName, 240) ||
      path.split("/").pop() ||
      "piece-jointe",
    type: cleanText(record.type || record.mimeType || record.mime_type, 140) || "application/octet-stream",
    size: typeof record.size === "number" && Number.isFinite(record.size) ? record.size : null,
  };
}

function cleanDraftAttachments(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(cleanDraftAttachment).filter(Boolean).slice(0, 10);
}

function recipientsToEmails(value: unknown) {
  const recipients = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const emails: string[] = [];

  for (const item of recipients) {
    const record = asRecord(item);
    const email = cleanEmail(record?.email || item);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }

  return emails;
}

function buildDraftPayloadFromAgentAction(args: {
  action: ReturnType<typeof rowToInrAgentAction>;
  userId: string;
}) {
  const { action } = args;
  const payload = action.payload || {};
  const mailAccount = asRecord(payload.mailAccount) || {};
  const automationKey = action.automationKey === "loyalty" ? "loyalty" : "grow";
  const recipients = recipientsToEmails(payload.recipients || action.recipients);
  const subject = normalizeMailSubject(
    cleanText(payload.campaignSubject || payload.subject || action.title, 220) || "(sans objet)",
  );
  const bodyText = cleanText(
    payload.campaignBody || payload.bodyText || payload.text || action.previewText,
    6000,
  );
  const bodyHtml = cleanText(payload.bodyHtml || payload.html, 10000) || textToRichMailHtml(bodyText);
  const folder =
    cleanText(payload.folder, 80) ||
    (automationKey === "loyalty" ? "fidelisations" : "propulsions");
  const trackKind =
    cleanText(payload.trackKind, 80) ||
    (automationKey === "loyalty" ? "fideliser" : "propulser");
  const trackType = cleanText(payload.trackType || payload.theme || action.targetThemes[0], 80);
  const templateKey = cleanText(payload.templateKey, 160);
  const accountId = cleanText(payload.accountId || payload.mailAccountId || mailAccount.id, 120);
  const provider = cleanText(mailAccount.provider || payload.provider || payload.mailProvider, 80);

  const draftPayload = {
    user_id: args.userId,
    integration_id: accountId || null,
    type: "mail",
    status: "draft",
    to_emails: recipients.join("; "),
    subject,
    body_text: bodyText || null,
    body_html: bodyHtml || null,
    provider: provider || null,
    source_doc_save_id: null,
    source_doc_type: null,
    source_doc_number: null,
    folder,
    track_kind: trackKind,
    track_type: trackType || null,
    template_key: templateKey || null,
    attachments: cleanDraftAttachments(payload.attachments),
  };

  const legacyPayload = {
    user_id: draftPayload.user_id,
    integration_id: draftPayload.integration_id,
    type: draftPayload.type,
    status: draftPayload.status,
    to_emails: draftPayload.to_emails,
    subject: draftPayload.subject,
    body_text: draftPayload.body_text,
    body_html: draftPayload.body_html,
    provider: draftPayload.provider,
    source_doc_save_id: draftPayload.source_doc_save_id,
    source_doc_type: draftPayload.source_doc_type,
    source_doc_number: draftPayload.source_doc_number,
  };

  return { payload, draftPayload, legacyPayload };
}

async function saveCampaignActionAsInrSendDraft(args: {
  actionId: string;
  userId: string;
}) {
  const { data: currentRow, error: readError } = await supabaseAdmin
    .from("inr_agent_actions")
    .select(ACTION_SELECT)
    .eq("id", args.actionId)
    .eq("user_id", args.userId)
    .single();

  if (readError || !currentRow) {
    if (isMissingTableError(readError)) {
      return {
        response: NextResponse.json(
          { error: "La table inr_agent_actions doit être créée dans Supabase.", tableMissing: true },
          { status: 500 },
        ),
      };
    }
    return {
      response: NextResponse.json(
        { error: "Action iNr’Agent introuvable." },
        { status: 404 },
      ),
    };
  }

  const action = rowToInrAgentAction(currentRow as any);
  const isCampaignAction =
    (action.automationKey === "grow" || action.automationKey === "loyalty") &&
    (action.targetTool === "propulser" || action.targetTool === "fideliser" || action.targetTool === "mails");

  if (!isCampaignAction) {
    return {
      response: NextResponse.json(
        { error: "Seules les campagnes Propulser/Fidéliser peuvent être enregistrées en brouillon iNrSend." },
        { status: 400 },
      ),
    };
  }

  const { payload, draftPayload, legacyPayload } = buildDraftPayloadFromAgentAction({
    action,
    userId: args.userId,
  });

  let { data: draft, error: draftError } = await supabaseAdmin
    .from("send_items")
    .insert(draftPayload as any)
    .select("id")
    .single();

  if (draftError && isMissingDraftMetadataColumn(draftError)) {
    const legacyInsert = await supabaseAdmin
      .from("send_items")
      .insert(legacyPayload)
      .select("id")
      .single();
    draft = legacyInsert.data;
    draftError = legacyInsert.error;
  }

  if (draftError) {
    return {
      response: NextResponse.json(
        { error: draftError.message || "Impossible d’enregistrer la campagne en brouillon iNrSend." },
        { status: 500 },
      ),
    };
  }

  const now = new Date().toISOString();
  const draftId = cleanText((draft as Record<string, unknown> | null)?.id, 120) || null;
  const { data, error } = await supabaseAdmin
    .from("inr_agent_actions")
    .update({
      status: "cancelled",
      completed_at: now,
      last_error: null,
      summary: `${action.summary} Campagne conservée en brouillon dans iNrSend.`,
      payload: {
        ...payload,
        movedToInrSendDraft: {
          ok: true,
          draftId,
          movedAt: now,
          reason: "user_saved_from_inr_agent",
        },
      },
      updated_at: now,
    })
    .eq("id", args.actionId)
    .eq("user_id", args.userId)
    .select(ACTION_SELECT)
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      return {
        response: NextResponse.json(
          { error: "La table inr_agent_actions doit être créée dans Supabase.", tableMissing: true },
          { status: 500 },
        ),
      };
    }
    return {
      response: NextResponse.json(
        { error: error.message || "Impossible de fermer l’action iNr’Agent après enregistrement du brouillon." },
        { status: 500 },
      ),
    };
  }

  const updatedAction = await refreshActionImageUrls(rowToInrAgentAction(data));
  return { action: updatedAction, draftId };
}

export async function GET() {
  const { user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const { data, error } = await supabaseAdmin
    .from("inr_agent_actions")
    .select(ACTION_SELECT)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({
        actions: [],
        stats: summarizeInrAgentActions([]),
        tableMissing: true,
      });
    }
    console.warn("[inr-agent-actions] read failed", error);
    return NextResponse.json(
      { error: "Lecture des actions iNr'Agent impossible" },
      { status: 500 },
    );
  }

  const rawActions = Array.isArray(data)
    ? data.map((row) => rowToInrAgentAction(row))
    : [];
  const actions = await Promise.all(rawActions.map(refreshActionImageUrls));
  return NextResponse.json({
    actions,
    stats: summarizeInrAgentActions(actions),
    tableMissing: false,
  });
}

export async function PATCH(request: Request) {
  const { user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const requestBody = body as {
    actionId?: unknown;
    status?: unknown;
    editType?: unknown;
    subject?: unknown;
    bodyText?: unknown;
  } | null;
  const actionId =
    typeof requestBody?.actionId === "string"
      ? requestBody.actionId
      : "";
  const status = sanitizeInrAgentActionStatus(requestBody?.status);
  const editType = cleanText(requestBody?.editType, 80);

  if (editType === "save_campaign_draft") {
    if (!actionId) {
      return NextResponse.json(
        { error: "Action invalide" },
        { status: 400 },
      );
    }

    const result = await saveCampaignActionAsInrSendDraft({
      actionId,
      userId: user.id,
    });

    if ("response" in result) return result.response;
    return NextResponse.json({
      action: result.action,
      draftId: result.draftId,
      savedAsDraft: true,
    });
  }

  if (editType === "campaign_text") {
    if (!actionId) {
      return NextResponse.json(
        { error: "Action invalide" },
        { status: 400 },
      );
    }

    const subject = normalizeMailSubject(cleanText(requestBody?.subject, 220));
    const bodyText = cleanText(requestBody?.bodyText, 6000);

    if (!subject || !bodyText) {
      return NextResponse.json(
        { error: "L’objet et le corps du mail sont obligatoires." },
        { status: 400 },
      );
    }

    const { data: currentRow, error: readError } = await supabaseAdmin
      .from("inr_agent_actions")
      .select(ACTION_SELECT)
      .eq("id", actionId)
      .eq("user_id", user.id)
      .single();

    if (readError || !currentRow) {
      if (isMissingTableError(readError)) {
        return NextResponse.json(
          { error: "La table inr_agent_actions doit être créée dans Supabase.", tableMissing: true },
          { status: 500 },
        );
      }
      return NextResponse.json(
        { error: "Action iNr’Agent introuvable." },
        { status: 404 },
      );
    }

    const currentAction = rowToInrAgentAction(currentRow as any);
    const currentPayload = currentAction.payload || {};
    const bodyHtml = textToRichMailHtml(bodyText);
    const nextPayload = {
      ...currentPayload,
      subject,
      campaignSubject: subject,
      bodyText,
      campaignBody: bodyText,
      bodyHtml,
    };
    const nextPreviewText = [
      `Objet : ${subject}`,
      bodyText,
      `Destinataires proposés : ${Array.isArray(currentAction.recipients) ? currentAction.recipients.length : 0} contact${Array.isArray(currentAction.recipients) && currentAction.recipients.length > 1 ? "s" : ""} CRM`,
    ].join("\n\n");

    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("inr_agent_actions")
      .update({
        payload: nextPayload,
        preview_text: nextPreviewText,
        updated_at: now,
      })
      .eq("id", actionId)
      .eq("user_id", user.id)
      .select(ACTION_SELECT)
      .single();

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json(
          { error: "La table inr_agent_actions doit être créée dans Supabase.", tableMissing: true },
          { status: 500 },
        );
      }
      console.warn("[inr-agent-actions] campaign text update failed", error);
      return NextResponse.json(
        { error: "Modification du mail impossible." },
        { status: 500 },
      );
    }

    const action = await refreshActionImageUrls(rowToInrAgentAction(data));
    return NextResponse.json({ action, saved: true });
  }

  if (
    !actionId ||
    !status ||
    ![
      "validated",
      "refused",
      "scheduled",
      "pending",
      "pending_validation",
      "cancelled",
    ].includes(status)
  ) {
    return NextResponse.json(
      { error: "Action ou statut invalide" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    status,
    updated_at: now,
  };

  if (status === "validated") {
    updatePayload.validated_at = now;
    updatePayload.refused_at = null;
  }

  if (status === "refused") {
    updatePayload.refused_at = now;
  }

  if (status === "completed") {
    updatePayload.completed_at = now;
  }

  const { data, error } = await supabaseAdmin
    .from("inr_agent_actions")
    .update(updatePayload)
    .eq("id", actionId)
    .eq("user_id", user.id)
    .select(ACTION_SELECT)
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json(
        {
          error: "La table inr_agent_actions doit être créée dans Supabase.",
          tableMissing: true,
        },
        { status: 500 },
      );
    }
    console.warn("[inr-agent-actions] update failed", error);
    return NextResponse.json(
      { error: "Mise à jour de l'action iNr'Agent impossible" },
      { status: 500 },
    );
  }

  const action = await refreshActionImageUrls(rowToInrAgentAction(data));
  return NextResponse.json({ action, saved: true });
}
