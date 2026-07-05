import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { normalizeRichMailHtmlForSend } from "@/lib/mailRichText";

const ALLOWED_FOLDERS = new Set(["propulsions", "fidelisations", "informations", "suivis", "enquetes"]);
const ALLOWED_KINDS = new Set(["propulser", "fideliser"]);

function clean(value: unknown, max = 6000) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanAttachment(item: unknown) {
  if (!item || typeof item !== "object") return null;
  const raw = item as Record<string, unknown>;
  const bucket = clean(raw.bucket, 120);
  const path = clean(raw.path, 500);
  if (!bucket || !path) return null;
  return {
    bucket,
    path,
    name: clean(raw.name, 240) || path.split("/").pop() || "piece-jointe",
    type: clean(raw.type, 140) || "application/octet-stream",
    size: typeof raw.size === "number" && Number.isFinite(raw.size) ? raw.size : null,
  };
}

function cleanAttachments(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(cleanAttachment).filter(Boolean).slice(0, 10);
}

function isMissingDraftMetadataColumn(error: any) {
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

export async function POST(req: Request) {
  const { supabase, user, errorResponse, activeUserId } = await requireUser();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => ({}));
  const kind = clean(body?.kind, 40).toLowerCase();
  const folder = clean(body?.folder, 80).toLowerCase();
  const trackType = clean(body?.trackType || body?.track_type, 80);
  const draftId = clean(body?.draftId || body?.draft_id, 120);
  const subject = clean(body?.subject, 220);
  const bodyText = clean(body?.bodyText || body?.body_text, 6000);
  const bodyHtml = clean(body?.bodyHtml || body?.body_html, 10000);
  const templateKey = clean(body?.templateKey || body?.template_key, 160);
  const attachments = cleanAttachments(body?.attachments);

  if (!ALLOWED_KINDS.has(kind)) {
    return NextResponse.json({ error: "Module de campagne invalide." }, { status: 400 });
  }
  if (!ALLOWED_FOLDERS.has(folder)) {
    return NextResponse.json({ error: "Dossier iNrSend invalide." }, { status: 400 });
  }
  if (!subject && !bodyText && !bodyHtml && !attachments.length) {
    return NextResponse.json({ error: "Aucun contenu à enregistrer." }, { status: 400 });
  }

  const draftPayload = {
    user_id: activeUserId,
    integration_id: null,
    type: "mail",
    status: "draft",
    to_emails: "",
    subject: subject || null,
    body_text: bodyText || null,
    body_html: normalizeRichMailHtmlForSend(bodyText, bodyHtml),
    provider: null,
    source_doc_save_id: null,
    source_doc_type: null,
    source_doc_number: null,
    folder,
    track_kind: kind,
    track_type: trackType || null,
    template_key: templateKey || null,
    attachments,
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

  if (draftId) {
    let { error } = await supabase
      .from("send_items")
      .update(draftPayload as any)
      .eq("id", draftId)
      .eq("user_id", activeUserId);
    if (error && isMissingDraftMetadataColumn(error)) {
      ({ error } = await supabase
        .from("send_items")
        .update(legacyPayload)
        .eq("id", draftId)
        .eq("user_id", activeUserId));
    }
    if (error) return NextResponse.json({ error: "Impossible d’enregistrer le brouillon." }, { status: 500 });
    return NextResponse.json({ draftId });
  }

  let { data, error } = await supabase
    .from("send_items")
    .insert(draftPayload as any)
    .select("id")
    .single();
  if (error && isMissingDraftMetadataColumn(error)) {
    ({ data, error } = await supabase.from("send_items").insert(legacyPayload).select("id").single());
  }
  if (error) return NextResponse.json({ error: "Impossible d’enregistrer le brouillon." }, { status: 500 });
  return NextResponse.json({ draftId: data?.id || null });
}
