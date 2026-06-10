import type { ComposeAttachmentRef } from "@/app/dashboard/mails/_lib/mailboxPhase1";

const STORAGE_PREFIX = "inrcy:workflow-mail-attachments:";

function normalizeWorkflowAttachments(input: unknown): ComposeAttachmentRef[] {
  const rows = Array.isArray(input) ? input : [];
  return rows
    .map((attachment: any) => {
      const bucket = String(attachment?.bucket || "").trim();
      const path = String(attachment?.path || "").trim();
      const name = String(attachment?.name || attachment?.filename || attachment?.fileName || path.split("/").pop() || "").trim();
      if (!bucket || !path || !name) return null;
      return {
        bucket,
        path,
        name,
        type: attachment?.type || attachment?.mime_type || attachment?.mimeType || null,
        size: attachment?.size == null ? null : Number(attachment.size) || null,
      } satisfies ComposeAttachmentRef;
    })
    .filter(Boolean) as ComposeAttachmentRef[];
}

export function storeWorkflowMailPrefillAttachments(
  attachments: ComposeAttachmentRef[],
  scope: string,
): string | null {
  const normalized = normalizeWorkflowAttachments(attachments);
  if (!normalized.length || typeof window === "undefined") return null;

  try {
    const key = `${STORAGE_PREFIX}${scope}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(key, JSON.stringify(normalized));
    return key;
  } catch {
    return null;
  }
}

export function readWorkflowMailPrefillAttachments(storageKey: string): ComposeAttachmentRef[] {
  const key = String(storageKey || "").trim();
  if (!key || typeof window === "undefined") return [];
  if (!key.startsWith(STORAGE_PREFIX)) return [];

  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return [];
    return normalizeWorkflowAttachments(JSON.parse(raw));
  } catch {
    return [];
  }
}
