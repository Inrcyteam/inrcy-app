import type { ComposeAttachmentRef } from "@/app/dashboard/mails/_lib/mailboxPhase1";

export type WorkflowCampaignKind = "propulser" | "fideliser";

export type WorkflowCampaignState = {
  kind: WorkflowCampaignKind;
  action: string;
  folder: string;
  trackKind: WorkflowCampaignKind;
  trackType: string;
  templateKey?: string | null;
  templateCategory?: string | null;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  attachments: ComposeAttachmentRef[];
  draftId?: string | null;
  createdAt: number;
  updatedAt?: number;
};

const STORAGE_PREFIX = "inrcy_workflow_campaign_state:";
const MAX_STATE_AGE_MS = 6 * 60 * 60 * 1000;

function safeNow() {
  return Date.now();
}

export function makeWorkflowCampaignStateKey(kind: WorkflowCampaignKind, action: string) {
  const suffix = Math.random().toString(36).slice(2, 9);
  return `${kind}_${action}_${safeNow()}_${suffix}`;
}

function normalizeAttachment(item: unknown): ComposeAttachmentRef | null {
  if (!item || typeof item !== "object") return null;
  const raw = item as Record<string, unknown>;
  const bucket = String(raw.bucket || "").trim();
  const path = String(raw.path || "").trim();
  if (!bucket || !path) return null;
  return {
    bucket,
    path,
    name: String(raw.name || path.split("/").pop() || "piece-jointe").trim(),
    type: String(raw.type || "application/octet-stream").trim(),
    size: typeof raw.size === "number" && Number.isFinite(raw.size) ? raw.size : null,
  };
}

export function normalizeWorkflowCampaignAttachments(value: unknown): ComposeAttachmentRef[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeAttachment).filter((item): item is ComposeAttachmentRef => Boolean(item));
}

export function saveWorkflowCampaignState(state: Omit<WorkflowCampaignState, "createdAt"> & { createdAt?: number }, key?: string | null) {
  if (typeof window === "undefined") return "";
  const resolvedKey = key || makeWorkflowCampaignStateKey(state.kind, state.action);
  const payload: WorkflowCampaignState = {
    ...state,
    templateKey: state.templateKey || null,
    templateCategory: state.templateCategory || null,
    draftId: state.draftId || null,
    subject: String(state.subject || ""),
    bodyText: String(state.bodyText || ""),
    bodyHtml: String(state.bodyHtml || ""),
    attachments: normalizeWorkflowCampaignAttachments(state.attachments),
    createdAt: Number(state.createdAt || safeNow()),
    updatedAt: safeNow(),
  };
  try {
    window.sessionStorage.setItem(`${STORAGE_PREFIX}${resolvedKey}`, JSON.stringify(payload));
  } catch {
    // sessionStorage peut être indisponible : dans ce cas le retour arrière garde l'URL mais pas l'état riche.
  }
  return resolvedKey;
}

export function readWorkflowCampaignState(key: string | null | undefined): WorkflowCampaignState | null {
  if (!key || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkflowCampaignState>;
    const createdAt = Number(parsed.createdAt || 0);
    if (!createdAt || safeNow() - createdAt > MAX_STATE_AGE_MS) {
      window.sessionStorage.removeItem(`${STORAGE_PREFIX}${key}`);
      return null;
    }
    const kind = parsed.kind === "propulser" || parsed.kind === "fideliser" ? parsed.kind : null;
    if (!kind || !parsed.action) return null;
    return {
      kind,
      action: String(parsed.action || ""),
      folder: String(parsed.folder || ""),
      trackKind: parsed.trackKind === "propulser" || parsed.trackKind === "fideliser" ? parsed.trackKind : kind,
      trackType: String(parsed.trackType || ""),
      templateKey: parsed.templateKey || null,
      templateCategory: parsed.templateCategory || null,
      subject: String(parsed.subject || ""),
      bodyText: String(parsed.bodyText || ""),
      bodyHtml: String(parsed.bodyHtml || ""),
      attachments: normalizeWorkflowCampaignAttachments(parsed.attachments),
      draftId: parsed.draftId || null,
      createdAt,
      updatedAt: Number(parsed.updatedAt || createdAt),
    };
  } catch {
    return null;
  }
}

export async function saveWorkflowCampaignDraft(input: {
  draftId?: string | null;
  kind: WorkflowCampaignKind;
  folder: string;
  trackType: string;
  templateKey?: string | null;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  attachments: ComposeAttachmentRef[];
}) {
  const response = await fetch("/api/mails/workflow-draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload?.error || "Impossible d’enregistrer le brouillon."));
  return { draftId: String(payload?.draftId || "") };
}
