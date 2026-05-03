import "server-only";

import type { MailAttachmentRef } from "@/lib/mailAttachmentRefs";

export type InrSendHistorySource = "send_items" | "mail_campaigns" | "app_events";
export type InrSendFileRole = "attachment" | "invoice_pdf" | "quote_pdf" | "publication_media" | "generated_document";

export type InrSendHistoryFileRef = MailAttachmentRef & {
  role?: InrSendFileRole | null;
};

type SupabaseDbClient = {
  from: (table: string) => any;
};

type SaveHistoryFilesParams = {
  userId: string;
  historySource: InrSendHistorySource;
  historyId: string | null | undefined;
  category?: string | null;
  fileRole?: InrSendFileRole | null;
  files?: InrSendHistoryFileRef[] | null;
  metadata?: Record<string, unknown> | null;
  replaceExisting?: boolean;
};

export type InrSendHistoryFileRow = {
  id: string;
  history_source: InrSendHistorySource;
  history_id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_bucket: string;
  storage_path: string;
  file_role: InrSendFileRole;
};

function isMissingHistoryFilesTable(error: unknown) {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const code = String(record.code || "");
  const message = String(record.message || "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || message.includes("inrsend_history_files");
}

function fileNameFromPath(path: string) {
  const last = String(path || "").split("/").filter(Boolean).pop();
  return last || "piece-jointe";
}

export function inferInrSendFileRole(input?: {
  sourceDocType?: string | null;
  fallback?: InrSendFileRole | null;
}): InrSendFileRole {
  const docType = String(input?.sourceDocType || "").trim().toLowerCase();
  if (docType === "facture") return "invoice_pdf";
  if (docType === "devis") return "quote_pdf";
  return input?.fallback || "attachment";
}

export async function saveInrSendHistoryFiles(supabase: SupabaseDbClient, params: SaveHistoryFilesParams) {
  const historyId = String(params.historyId || "").trim();
  if (!params.userId || !historyId) return;

  const files = Array.isArray(params.files) ? params.files : [];
  const rows = files
    .map((file) => {
      const bucket = String(file.bucket || "").trim();
      const path = String(file.path || "").trim();
      if (!bucket || !path) return null;
      return {
        user_id: params.userId,
        history_source: params.historySource,
        history_id: historyId,
        category: String(params.category || "mails").trim().toLowerCase() || "mails",
        file_role: file.role || params.fileRole || "attachment",
        file_name: String(file.name || fileNameFromPath(path)).trim() || "piece-jointe",
        mime_type: file.type || null,
        size_bytes: typeof file.size === "number" && Number.isFinite(file.size) ? Math.round(file.size) : null,
        storage_bucket: bucket,
        storage_path: path,
        metadata: params.metadata || {},
      };
    })
    .filter(Boolean);

  try {
    if (params.replaceExisting !== false) {
      const { error: deleteError } = await supabase
        .from("inrsend_history_files")
        .delete()
        .eq("user_id", params.userId)
        .eq("history_source", params.historySource)
        .eq("history_id", historyId);
      if (deleteError && !isMissingHistoryFilesTable(deleteError)) {
        console.warn("inrsend_history_files delete failed", deleteError);
      }
    }

    if (!rows.length) return;

    const { error } = await supabase.from("inrsend_history_files").insert(rows);
    if (error && !isMissingHistoryFilesTable(error)) {
      console.warn("inrsend_history_files insert failed", error);
    }
  } catch (error) {
    if (!isMissingHistoryFilesTable(error)) {
      console.warn("inrsend_history_files save failed", error);
    }
  }
}

export async function fetchInrSendHistoryFiles(
  supabase: SupabaseDbClient,
  userId: string,
  entries: Array<{ source: InrSendHistorySource; id: string }>,
): Promise<InrSendHistoryFileRow[]> {
  const ids = Array.from(new Set(entries.map((entry) => String(entry.id || "").trim()).filter(Boolean)));
  if (!userId || ids.length === 0) return [];

  try {
    const { data, error } = await supabase
      .from("inrsend_history_files")
      .select("id, history_source, history_id, file_name, mime_type, size_bytes, storage_bucket, storage_path, file_role")
      .eq("user_id", userId)
      .in("history_id", ids);

    if (error) {
      if (!isMissingHistoryFilesTable(error)) console.warn("inrsend_history_files select failed", error);
      return [];
    }

    const wanted = new Set(entries.map((entry) => `${entry.source}:${entry.id}`));
    return (Array.isArray(data) ? data : []).filter((row: InrSendHistoryFileRow) => wanted.has(`${row.history_source}:${row.history_id}`));
  } catch (error) {
    if (!isMissingHistoryFilesTable(error)) console.warn("inrsend_history_files fetch failed", error);
    return [];
  }
}
