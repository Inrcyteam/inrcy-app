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
