import { NextResponse } from "next/server";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getInrSendRetentionCutoffIso, getOldestAutoRetentionCutoffIso, isInrSendItemRetained } from "@/lib/inrsendRetention";
import { fetchInrSendHistoryFiles } from "@/lib/inrsend/historyFiles";
import {
  INRCY_WORKFLOW_ACTIONS,
  INRSEND_GROUPED_FOLDERS,
  INRSEND_LEGACY_FOLDERS,
  getActionFromLegacyFolder,
  getActionFromTrack,
  getGroupedHistoryFolder,
  getWorkflowActionLabel,
  getWorkflowToolForAction,
  isGroupedHistoryFolder,
  type InrcyGroupedHistoryFolder,
  type InrcyLegacyHistoryFolder,
  type InrcyWorkflowAction,
  type InrcyWorkflowTool,
} from "@/lib/inrcyWorkflow";

type Folder = InrcyLegacyHistoryFolder | InrcyGroupedHistoryFolder;

type BoxView = "sent" | "drafts";
type Status = "draft" | "sent" | "error" | "queued" | "processing" | "paused" | "partial" | "completed" | "failed";

type OutboxItem = {
  id: string;
  source: "send_items" | "app_events" | "mail_campaigns" | "inr_agent_actions";
  module?: "booster" | "propulser" | "fideliser";
  /**
   * Dossier historique réel ou dossier groupé.
   * Les anciennes valeurs restent supportées pour ne pas casser l'historique existant.
   */
  folder: Folder;
  /** Regroupement cible de la nouvelle navigation iNr'Send. */
  groupedFolder?: InrcyGroupedHistoryFolder | null;
  /** Action métier affichable dans la colonne Actions des futurs onglets groupés. */
  workflowAction?: InrcyWorkflowAction | null;
  workflowActionLabel?: string | null;
  workflowTool?: InrcyWorkflowTool | null;
  workflowToolLabel?: string | null;
  provider: string | null;
  status: Status;
  created_at: string;
  sent_at?: string | null;
  error?: string | null;
  title: string;
  subTitle?: string;
  target: string;
  preview: string;
  detailHtml?: string | null;
  detailText?: string | null;
  subject?: string | null;
  to?: string | null;
  from?: string | null;
  channels?: string[];
  attachments?: { name: string; type?: string | null; size?: number | null; url?: string | null; downloadUrl?: string | null; role?: string | null; storagePath?: string | null; duration?: number | null; thumbnailUrl?: string | null }[];
  /** Origine de l'action quand elle vient d'un moteur automatisé comme iNr'Agent. */
  originSource?: "manual" | "inr_agent" | null;
  originLabel?: string | null;
  originIcon?: string | null;
  raw?: any;
  reopenHref?: string | null;
};

type FolderCounts = Record<Folder, number>;

type SendType = "mail" | "facture" | "devis";

type SendItemRow = {
  id: string;
  integration_id: string | null;
  type: SendType;
  status: Status;
  to_emails: string;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  provider: string | null;
  provider_message_id: string | null;
  provider_thread_id?: string | null;
  source_doc_save_id?: string | null;
  source_doc_type?: "devis" | "facture" | null;
  source_doc_number?: string | null;
  folder?: Folder | string | null;
  track_kind?: string | null;
  track_type?: string | null;
  template_key?: string | null;
  attachments?: any;
  error: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

type InrAgentActionRow = {
  id: string;
  automation_key: string | null;
  action_type: string | null;
  target_tool: string | null;
  title: string | null;
  summary: string | null;
  preview_text: string | null;
  recipients: unknown[] | null;
  payload: Record<string, unknown> | null;
  status: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string | null;
  last_error: string | null;
};

type StoredReportDocument = {
  bucket: string;
  storagePath: string;
  filename: string;
  mimeType: string;
  bytes: number;
  createdAt: string;
};

const MAILBOX_PAGE_SIZE = 20;
const SOURCE_BATCH_SIZE = 60;
const MAX_ITERATIONS = 5000;
const ALL_FOLDERS: Folder[] = Array.from(
  new Set<string>([...INRSEND_LEGACY_FOLDERS, ...INRSEND_GROUPED_FOLDERS]),
) as Folder[];

function emptyFolderCounts(): FolderCounts {
  return ALL_FOLDERS.reduce((acc, folder) => {
    acc[folder] = 0;
    return acc;
  }, {} as FolderCounts);
}

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function cleanString(value: string | null) {
  return String(value || "").trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function extractStoredReportDocument(value: unknown): StoredReportDocument | null {
  const record = asRecord(value);
  const bucket = cleanString(String(record.bucket || "inr-agent-reports"));
  const storagePath = cleanString(String(record.storagePath || record.storage_path || record.path || ""));
  const filename = cleanString(String(record.filename || "bilan-inrstats.pdf"));
  const mimeType = cleanString(String(record.mimeType || record.mime_type || "application/pdf"));
  const bytes = Math.max(0, Math.round(Number(record.bytes || 0) || 0));
  const createdAt = cleanString(String(record.createdAt || record.created_at || ""));
  if (!bucket || !storagePath || !filename) return null;
  return { bucket, storagePath, filename, mimeType, bytes, createdAt };
}

async function withStatsReportSignedUrls(items: OutboxItem[]): Promise<OutboxItem[]> {
  const statsItems = items.filter((item) => item.source === "inr_agent_actions");
  if (!statsItems.length) return items;

  await Promise.all(statsItems.map(async (item) => {
    const attachment = item.attachments?.[0];
    const rawPayload = asRecord((item.raw as InrAgentActionRow | undefined)?.payload);
    const document = extractStoredReportDocument(rawPayload.reportDocument);
    const storagePath = document?.storagePath || attachment?.storagePath || "";
    const bucket = document?.bucket || "inr-agent-reports";
    if (!storagePath) return;

    try {
      const { data } = await supabaseAdmin.storage
        .from(bucket)
        .createSignedUrl(storagePath, 60 * 60);
      const signedUrl = data?.signedUrl || "";
      if (!signedUrl) return;
      item.attachments = (item.attachments || []).map((current) => (
        current.storagePath === storagePath
          ? { ...current, url: signedUrl, downloadUrl: signedUrl }
          : current
      ));
      const documentPayload = asRecord(rawPayload.reportDocument);
      item.raw = {
        ...(item.raw as Record<string, unknown>),
        payload: {
          ...rawPayload,
          reportDocument: {
            ...documentPayload,
            downloadUrl: signedUrl,
          },
        },
      };
    } catch {
      // Le bilan reste visible même si l'URL temporaire ne peut pas être générée.
    }
  }));

  return items;
}

function isMissingAgentActionsError(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    error?.code === "PGRST205" ||
    message.includes("inr_agent_actions")
  );
}

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function stripText(v: unknown): string {
  return String(v || "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function safeS(v: unknown, fallback = ""): string {
  const s = stripText(v);
  return s || fallback;
}

function firstNonEmpty(...vals: any[]) {
  for (const v of vals) {
    const s = typeof v === "string" ? v.trim() : "";
    if (s) return s;
  }
  return "";
}

function looksLikeDelimitedChannelList(value: string) {
  const v = String(value || "").trim();
  if (!v) return false;
  if (/^https?:\/\//i.test(v)) return false;
  return /\s[\/]\s|[,;\n]/.test(v);
}

function downloadUrlForHistoryFile(fileId: string) {
  return `/api/inrsend/history/files/${encodeURIComponent(fileId)}/download`;
}

function mergeAttachments(
  current: NonNullable<OutboxItem["attachments"]>,
  extra: NonNullable<OutboxItem["attachments"]>,
) {
  const seen = new Set<string>();
  const merged: NonNullable<OutboxItem["attachments"]> = [];
  for (const attachment of [...extra, ...current]) {
    const key = `${attachment.downloadUrl || attachment.url || ""}|${attachment.name || ""}|${attachment.size || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(attachment);
  }
  return merged;
}

function isFolderValue(value: string): value is Folder {
  return (ALL_FOLDERS as string[]).includes(value);
}

function normalizeFolder(value: string | null): Folder {
  const cleaned = String(value || "").toLowerCase();
  return isFolderValue(cleaned) ? cleaned : "mails";
}

function normalizeBoxView(value: string | null): BoxView {
  return String(value || "").toLowerCase() === "drafts" ? "drafts" : "sent";
}

function historyFolderForAction(action: InrcyWorkflowAction): Folder {
  const definition = INRCY_WORKFLOW_ACTIONS[action] as { legacyFolder?: Folder; groupedFolder: Folder };
  return definition.legacyFolder || definition.groupedFolder;
}

function workflowMetaFromAction(action: InrcyWorkflowAction | null | undefined) {
  if (!action) {
    return {
      groupedFolder: null,
      workflowAction: null,
      workflowActionLabel: null,
      workflowTool: null,
      workflowToolLabel: null,
    };
  }

  const tool = getWorkflowToolForAction(action);
  return {
    groupedFolder: INRCY_WORKFLOW_ACTIONS[action].groupedFolder,
    workflowAction: action,
    workflowActionLabel: getWorkflowActionLabel(action),
    workflowTool: tool,
    workflowToolLabel: tool === "booster" ? "Booster" : tool === "propulser" ? "Propulser" : "Fidéliser",
  };
}

function workflowMetaFromFolder(folder: Folder) {
  const action = getActionFromLegacyFolder(folder);
  if (action) return workflowMetaFromAction(action);
  return {
    groupedFolder: getGroupedHistoryFolder(folder),
    workflowAction: null,
    workflowActionLabel: null,
    workflowTool: null,
    workflowToolLabel: null,
  };
}

function groupedFolderForItem(item: Pick<OutboxItem, "folder" | "groupedFolder">): InrcyGroupedHistoryFolder | null {
  return item.groupedFolder || getGroupedHistoryFolder(item.folder);
}

function countFolderItem(counts: FolderCounts, item: OutboxItem) {
  counts[item.folder] = (counts[item.folder] || 0) + 1;
  const groupedFolder = groupedFolderForItem(item);
  if (groupedFolder && groupedFolder !== item.folder) {
    counts[groupedFolder] = (counts[groupedFolder] || 0) + 1;
  }
}

function defaultFolderFromSendType(type: SendType | string | null | undefined): Folder {
  if (type === "facture") return "factures";
  if (type === "devis") return "devis";
  return "mails";
}

function folderFromTrack(trackKind: string | null | undefined, trackType: string | null | undefined, fallback: Folder = "mails"): Folder {
  const action = getActionFromTrack(trackKind, trackType);
  return action ? historyFolderForAction(action) : fallback;
}

function resolveCampaignFolder(raw: any): Folder {
  const explicit = String(raw?.folder || "").toLowerCase();
  if (isFolderValue(explicit)) return explicit;
  const tracked = folderFromTrack(raw?.track_kind, raw?.track_type, defaultFolderFromSendType(raw?.type));
  return tracked;
}

function stripWorkflowPrefix(value: string) {
  return String(value || "")
    .replace(/^(Valoriser|Récolter|Récolte|Offrir|Informer|Information|Suivre|Suivi|Enquêter|Enquête|Propulsion|Fidélisation)\s*[—–·-]\s*/i, "")
    .trim();
}

function campaignTitleFromFolder(folder: Folder, subject: string) {
  const safeSubject = safeS(subject, "(sans objet)");
  if (folder === "offres") return `Offre — ${safeSubject}`;
  if (folder === "recoltes") return `Récolte — ${safeSubject}`;
  if (folder === "informations") return `Information — ${safeSubject}`;
  if (folder === "suivis") return `Suivi — ${safeSubject}`;
  if (folder === "enquetes") return `Enquête — ${safeSubject}`;
  if (folder === "propulsions") return safeSubject;
  if (folder === "fidelisations") return safeSubject;
  if (folder === "factures") return `Envoi facture — ${safeSubject}`;
  if (folder === "devis") return `Envoi devis — ${safeSubject}`;
  return `Campagne — ${safeSubject}`;
}

function normalizeChannelCandidates(candidates: any[]): string[] {
  const seen = new Set<string>();
  return candidates
    .flat()
    .map((x) => (typeof x === "string" ? x : x?.key || x?.name || x?.label || ""))
    .map((s: string) => String(s).trim())
    .filter((value) => Boolean(value) && !looksLikeDelimitedChannelList(value))
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function extractChannelsFromPayload(payload: any): string[] {
  if (!payload || typeof payload !== "object") return [];

  const explicitCandidates: any[] = [];
  if (Array.isArray(payload.channels)) explicitCandidates.push(...payload.channels);
  if (Array.isArray(payload.platforms)) explicitCandidates.push(...payload.platforms);
  if (Array.isArray(payload.targets)) explicitCandidates.push(...payload.targets);
  if (Array.isArray(payload.destinations)) explicitCandidates.push(...payload.destinations);

  const explicitChannels = normalizeChannelCandidates(explicitCandidates);
  if (explicitChannels.length) return explicitChannels;

  const candidates: any[] = [];
  const postByChannel = payload?.postByChannel && typeof payload.postByChannel === "object" ? payload.postByChannel : null;
  if (postByChannel) candidates.push(...Object.keys(postByChannel));

  const results = payload?.results && typeof payload.results === "object" ? payload.results : null;
  if (results) candidates.push(...Object.keys(results));

  const single = firstNonEmpty(payload.channel, payload.platform, payload.target, payload.destination);
  if (single && !looksLikeDelimitedChannelList(single)) candidates.push(single);

  return normalizeChannelCandidates(candidates);
}

function extractMessageFromPayload(payload: any): { html?: string | null; text?: string | null } {
  if (!payload || typeof payload !== "object") return { text: null };

  const pickStr = (obj: any, ...keys: string[]) => {
    for (const k of keys) {
      const v = obj?.[k];
      if (typeof v === "string" && v.trim()) return v;
    }
    return null;
  };

  const coerceText = (v: any): string | null => {
    if (typeof v === "string") {
      const t = v.trim();
      return t ? t : null;
    }
    if (Array.isArray(v)) {
      const parts = v
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter(Boolean);
      return parts.length ? parts.join("\n") : null;
    }
    if (v && typeof v === "object") {
      return (
        pickStr(v, "text", "message", "content", "caption", "description", "body_text", "bodyText") ||
        pickStr(v, "prompt")
      );
    }
    return null;
  };

  const html =
    pickStr(payload, "html", "body_html", "bodyHtml", "content_html", "contentHtml", "message_html", "messageHtml") ||
    pickStr(payload?.post, "html", "body_html", "bodyHtml", "content_html", "contentHtml") ||
    pickStr(payload?.mail, "html", "body_html", "bodyHtml", "content_html", "contentHtml") ||
    null;

  let text =
    pickStr(payload, "text", "body_text", "bodyText", "message", "content", "caption", "description", "prompt") ||
    coerceText(payload?.post?.content) ||
    coerceText(payload?.post?.text) ||
    coerceText(payload?.post?.message) ||
    coerceText(payload?.mail?.text) ||
    coerceText(payload?.mail?.body_text) ||
    coerceText(payload?.mail?.bodyText) ||
    coerceText(payload?.message) ||
    null;

  if (!text && payload?.post && typeof payload.post === "object") {
    const title = pickStr(payload.post, "title") || pickStr(payload, "title");
    const content =
      coerceText(payload.post.content) || coerceText(payload.post.text) || coerceText(payload.post.caption) || null;
    const cta = pickStr(payload.post, "cta") || pickStr(payload, "cta");
    const parts = [title, content, cta].filter(Boolean);
    if (parts.length) text = parts.join("\n");
  }

  const tags = payload?.hashtags ?? payload?.post?.hashtags;
  if (Array.isArray(tags) && tags.length) {
    const hashLine = tags
      .map((t) => String(t || "").trim())
      .filter(Boolean)
      .join(" ");
    if (hashLine) text = `${text ? text.trim() + "\n\n" : ""}${hashLine}`;
  }

  return { html, text };
}

function downloadUrlForDraftAttachment(bucket: string, path: string, name?: string | null) {
  const params = new URLSearchParams();
  params.set("bucket", bucket);
  params.set("path", path);
  if (name) params.set("name", name);
  return `/api/inrsend/attachments/download?${params.toString()}`;
}

function parseMaybeJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function extractAttachmentsFromPayload(payload: any): { name: string; type?: string | null; size?: number | null; url?: string | null; downloadUrl?: string | null; storagePath?: string | null; duration?: number | null; thumbnailUrl?: string | null }[] {
  if (!payload || typeof payload !== "object") return [];
  const baseCandidates = parseMaybeJsonArray(
    payload.attachments ||
    payload.files ||
    payload.images ||
    payload.media ||
    payload?.post?.attachments ||
    payload?.post?.files ||
    payload?.post?.images ||
    payload?.post?.media ||
    []
  );

  const singleMediaCandidates = [
    payload.video,
    payload.videoDraft,
    payload.video_draft,
    payload?.post?.video,
    payload?.post?.videoDraft,
    payload?.media_metadata?.video,
    payload?.mediaMetadata?.video,
    payload?.post?.media_metadata?.video,
    payload?.post?.mediaMetadata?.video,
  ].filter(Boolean);

  const flatVideoUrl = String(
    payload.video_url ||
    payload.videoUrl ||
    payload?.post?.video_url ||
    payload?.post?.videoUrl ||
    ""
  ).trim();
  const flatVideoCandidate = flatVideoUrl
    ? [{
        name: payload.video_name || payload.videoName || payload?.post?.video_name || payload?.post?.videoName || "video-inrcy.mp4",
        type: payload.video_mime || payload.videoMime || payload?.post?.video_mime || payload?.post?.videoMime || "video/mp4",
        size: payload.video_size || payload.videoSize || payload?.post?.video_size || payload?.post?.videoSize || null,
        duration: payload.video_duration_seconds || payload.videoDurationSeconds || payload?.post?.video_duration_seconds || payload?.post?.videoDurationSeconds || null,
        url: flatVideoUrl,
        publicUrl: flatVideoUrl,
        storagePath: payload.video_path || payload.videoPath || payload?.post?.video_path || payload?.post?.videoPath || null,
        thumbnailUrl: payload.video_thumbnail_url || payload.videoThumbnailUrl || payload?.post?.video_thumbnail_url || payload?.post?.videoThumbnailUrl || null,
      }]
    : [];

  const candidates = [...baseCandidates, ...singleMediaCandidates, ...flatVideoCandidate];

  if (!Array.isArray(candidates)) return [];

  const isLikelyUrl = (value: string) => /^https?:\/\//i.test(value) || value.startsWith("/");
  const buildNameFromUrl = (value: string) => {
    const cleaned = String(value || "").split("?")[0].trim();
    if (!cleaned) return "Pièce jointe";
    const last = cleaned.split("/").filter(Boolean).pop() || cleaned;
    return safeDecode(last);
  };

  return candidates
    .map((a: any) => {
      if (!a) return null;
      if (typeof a === "string") {
        const raw = String(a).trim();
        if (!raw) return null;
        return isLikelyUrl(raw)
          ? { name: buildNameFromUrl(raw), url: raw }
          : { name: raw };
      }
      const bucket = String(a.bucket || a.storage_bucket || "").trim();
      const storagePath = String(a.path || a.storage_path || a.storagePath || a.video_path || "").trim();
      const url = a.url || a.href || a.publicUrl || a.public_url || a.videoUrl || a.video_url || (storagePath && isLikelyUrl(storagePath) ? storagePath : null);
      const name = a.name || a.filename || a.fileName || a.originalname || (storagePath && !isLikelyUrl(storagePath) ? storagePath.split("/").pop() : null) || url;
      if (!name && !url) return null;
      const finalName = String(name || buildNameFromUrl(String(url || "")));
      const downloadUrl = bucket && storagePath && !isLikelyUrl(storagePath)
        ? downloadUrlForDraftAttachment(bucket, storagePath, finalName)
        : null;
      return {
        name: finalName,
        type: a.type || a.mime || a.mimeType || null,
        size: typeof a.size === "number" ? a.size : typeof a.bytes === "number" ? a.bytes : null,
        url: url || null,
        storagePath: storagePath || a.storagePath || a.video_path || null,
        duration: typeof a.duration === "number" ? a.duration : typeof a.video_duration_seconds === "number" ? a.video_duration_seconds : null,
        thumbnailUrl: a.thumbnailUrl || a.thumbnail_url || a.video_thumbnail_url || null,
        downloadUrl,
      };
    })
    .filter(Boolean) as { name: string; type?: string | null; size?: number | null; url?: string | null; downloadUrl?: string | null; storagePath?: string | null; duration?: number | null; thumbnailUrl?: string | null }[];
}

function isVisibleInFolder(folder: Folder, item: OutboxItem, view: BoxView) {
  const itemGroupedFolder = groupedFolderForItem(item);
  const folderMatches = isGroupedHistoryFolder(folder)
    ? itemGroupedFolder === folder
    : item.folder === folder;

  if (!folderMatches) return false;
  if (view === "drafts") {
    return (item.source === "send_items" || item.source === "app_events") && item.status === "draft";
  }
  return item.status !== "draft";
}

function campaignCounts(raw: any) {
  return {
    total: Math.max(0, Number(raw?.total_count || 0) || 0),
    queued: Math.max(0, Number(raw?.queued_count || 0) || 0),
    processing: Math.max(0, Number(raw?.processing_count || 0) || 0),
    sent: Math.max(0, Number(raw?.sent_count || 0) || 0),
    failed: Math.max(0, Number(raw?.failed_count || 0) || 0),
  };
}

function extractOriginMeta(raw: any): { originSource?: "manual" | "inr_agent" | null; originLabel?: string | null; originIcon?: string | null } {
  const payload = raw?.payload && typeof raw.payload === "object" ? raw.payload : null;
  const metadata = raw?.metadata && typeof raw.metadata === "object" ? raw.metadata : null;
  const origin =
    payload?.origin && typeof payload.origin === "object"
      ? payload.origin
      : metadata?.origin && typeof metadata.origin === "object"
        ? metadata.origin
        : metadata || payload || {};
  const source = String(origin?.source || payload?.source || metadata?.source || "").trim();
  if (source !== "inr_agent") {
    return { originSource: source === "manual" ? "manual" : null, originLabel: null, originIcon: null };
  }
  return {
    originSource: "inr_agent",
    originLabel: String(origin?.label || metadata?.label || "iNr’Agent"),
    originIcon: "🤖",
  };
}

function formatCampaignProgress(raw: any) {
  const counts = campaignCounts(raw);
  const bits = [`${counts.sent}/${counts.total || counts.sent} envoyés`];
  if (counts.processing > 0) bits.push(`${counts.processing} en cours`);
  if (counts.queued > 0) bits.push(`${counts.queued} en attente`);
  if (counts.failed > 0) bits.push(`${counts.failed} en échec`);
  return bits.join(" • ");
}

function matchesQuery(item: OutboxItem, query: string) {
  if (!query) return true;
  const hay = `${item.title || ""} ${item.subTitle || ""} ${item.target || ""} ${item.preview || ""} ${item.provider || ""} ${item.workflowActionLabel || ""} ${item.workflowToolLabel || ""}`.toLowerCase();
  return hay.includes(query);
}

function shouldQuerySendItems(folder: Folder) {
  // Les brouillons iNrSend peuvent désormais être classés dans toutes les catégories
  // (Factures, Devis, Publications, Propulsions, Fidélisations). On filtre ensuite
  // côté JS pour rester compatible avec les anciennes lignes sans colonne folder.
  return folder !== "stats";
}

function shouldQueryCampaigns(folder: Folder, view: BoxView) {
  return folder !== "stats" && view !== "drafts";
}

function shouldQueryEvents(folder: Folder, view: BoxView) {
  if (view === "drafts") return folder === "publications";
  return folder === "publications"
    || folder === "recoltes"
    || folder === "offres"
    || folder === "propulsions"
    || folder === "informations"
    || folder === "suivis"
    || folder === "enquetes"
    || folder === "fidelisations";
}

function shouldQueryAgentStatsReports(folder: Folder, view: BoxView) {
  return view !== "drafts" && folder === "stats";
}

function mapSendItems(rows: SendItemRow[]): OutboxItem[] {
  return rows
    .map<OutboxItem | null>((x) => {
      if ((x as any).status === "deleted") return null;
      const explicitFolder = String((x as any).folder || "").toLowerCase();
      const fallbackFolder: Folder = x.type === "facture" ? "factures" : x.type === "devis" ? "devis" : "mails";
      const folder: Folder = isFolderValue(explicitFolder)
        ? explicitFolder
        : folderFromTrack((x as any).track_kind, (x as any).track_type, fallbackFolder);
      const action = getActionFromTrack((x as any).track_kind, (x as any).track_type) || getActionFromLegacyFolder(folder);
      const workflowMeta = action ? workflowMetaFromAction(action) : workflowMetaFromFolder(folder);
      const title = stripWorkflowPrefix(safeS(x.subject, folder === "factures" ? "Facture" : folder === "devis" ? "Devis" : folder === "publications" ? "Brouillon publication" : "(sans objet)"));
      const preview = safeS(x.body_text || x.body_html, "").slice(0, 140);
      const status: Status = x.status === "sent" && x.error ? "error" : (x.status as Status);
      const rawRecipients = safeS(x.to_emails, "");
      const recipientCount = rawRecipients
        ? rawRecipients.split(/[;,]/).map((v) => v.trim()).filter(Boolean).length
        : 0;
      const target = (folder === "propulsions" || folder === "fidelisations") && recipientCount > 1
        ? `${recipientCount} contacts`
        : rawRecipients;
      const rawModule = String((x as any).track_kind || "").toLowerCase();
      return {
        id: x.id,
        source: "send_items",
        module: rawModule === "booster" || rawModule === "propulser" || rawModule === "fideliser"
          ? rawModule as "booster" | "propulser" | "fideliser"
          : undefined,
        folder,
        ...workflowMeta,
        provider: x.provider || "Mail",
        status,
        created_at: x.created_at,
        sent_at: x.sent_at,
        error: x.error,
        title,
        target,
        preview,
        detailHtml: x.body_html,
        detailText: x.body_text,
        subject: x.subject,
        to: x.to_emails,
        attachments: extractAttachmentsFromPayload(x),
        raw: x,
        reopenHref: x.source_doc_save_id && x.source_doc_type
          ? `/dashboard/${x.source_doc_type === "facture" ? "factures" : "devis"}/new?saveId=${encodeURIComponent(x.source_doc_save_id)}`
          : null,
      };
    })
    .filter(Boolean) as OutboxItem[];
}

function mapCampaignItems(rows: any[]): OutboxItem[] {
  return rows.map<OutboxItem>((x: any) => {
    const folder = resolveCampaignFolder(x);
    const action = getActionFromTrack(x.track_kind, x.track_type) || getActionFromLegacyFolder(folder);
    const workflowMeta = workflowMetaFromAction(action) || workflowMetaFromFolder(folder);
    const rawModule = String(x.track_kind || "").toLowerCase();
    const counts = campaignCounts(x);
    const target = `${counts.total || 0} contact${counts.total > 1 ? "s" : ""}`;
    return {
      id: String(x.id || ""),
      source: "mail_campaigns",
      module: rawModule === "booster" || rawModule === "propulser" || rawModule === "fideliser"
        ? rawModule as "booster" | "propulser" | "fideliser"
        : undefined,
      folder,
      ...workflowMeta,
      provider: x.provider || "Mail",
      status: String(x.status || "processing") as Status,
      created_at: String(x.created_at || new Date().toISOString()),
      sent_at: x.finished_at || null,
      error: x.last_error || null,
      title: stripWorkflowPrefix(safeS(x.subject, "(sans objet)")),
      target,
      preview: formatCampaignProgress(x),
      detailHtml: x.body_html,
      detailText: x.body_text,
      subject: x.subject,
      attachments: extractAttachmentsFromPayload(x),
      ...extractOriginMeta(x),
      raw: x,
      reopenHref: x.source_doc_save_id && x.source_doc_type
        ? `/dashboard/${x.source_doc_type === "facture" ? "factures" : "devis"}/new?saveId=${encodeURIComponent(x.source_doc_save_id)}`
        : null,
    };
  });
}

function mapEventItems(rows: any[]): OutboxItem[] {
  const supportedModules = new Set(["booster", "propulser", "fideliser"]);

  return rows
    .filter((e) => supportedModules.has(String(e.module)))
    .map<OutboxItem>((e: any) => {
      const eventModule = String(e.module || "") as "booster" | "propulser" | "fideliser";
      const t = String(e.type || "");
      const payload = (e.payload || {}) as any;
      const isDraft = String(payload?.status || "").toLowerCase() === "draft" || t === "publish_draft";
      const actionType = t === "publish_draft" ? "publish" : t;
      const action = getActionFromTrack(eventModule, actionType);
      const folder: Folder = action
        ? historyFolderForAction(action)
        : eventModule === "fideliser"
          ? "fidelisations"
          : t === "publish"
            ? "publications"
            : "propulsions";
      const workflowMeta = action ? workflowMetaFromAction(action) : workflowMetaFromFolder(folder);
      const subTitle = firstNonEmpty(
        payload?.post?.title,
        payload?.title,
        payload?.subject,
        payload?.post?.subject,
      );

      const title = folder === "publications"
        ? (isDraft ? "Brouillon publication" : "Publication")
        : stripWorkflowPrefix(subTitle || safeS(payload?.preview || payload?.text || payload?.message || payload?.content, "Message"));

      const extractedChannels = extractChannelsFromPayload(payload);
      const target = folder === "publications"
        ? (extractedChannels.length ? extractedChannels.join(" / ") : "Google / Réseaux")
        : (
            safeS(payload.to) ||
            safeS(payload.recipients) ||
            safeS(payload.channel) ||
            safeS(payload.platform) ||
            "Contacts"
          );
      const preview = safeS(payload.preview || payload.text || payload.message || payload.content, "").slice(0, 140);
      const extracted = extractMessageFromPayload(payload);
      return {
        id: e.id,
        source: "app_events",
        module: eventModule,
        folder,
        ...workflowMeta,
        provider: eventModule === "fideliser" ? "Fidéliser" : eventModule === "propulser" ? "Propulser" : "Booster",
        status: isDraft ? "draft" : "sent",
        created_at: e.created_at,
        title,
        subTitle: subTitle || undefined,
        target,
        preview,
        detailHtml: extracted.html,
        detailText: extracted.text,
        channels: extractedChannels,
        attachments: extractAttachmentsFromPayload(payload),
        ...extractOriginMeta(e),
        raw: e,
        reopenHref: isDraft && folder === "publications"
          ? `/dashboard?action=publish&draftId=${encodeURIComponent(String(e.id || ""))}`
          : null,
      };
    });
}

function mapAgentStatsReports(rows: InrAgentActionRow[]): OutboxItem[] {
  return rows.map<OutboxItem>((row) => {
    const payload = asRecord(row.payload);
    const document = extractStoredReportDocument(payload.reportDocument);
    const delivery = asRecord(payload.delivery);
    const report = asRecord(payload.report);
    const generatedAt = cleanString(String(payload.generatedAt || document?.createdAt || row.completed_at || row.created_at));
    const recipient = safeS(delivery.to || (Array.isArray(row.recipients) ? (row.recipients[0] as any)?.email : ""), "Professionnel");
    const statusValue = String(row.status || "completed").toLowerCase();
    const status: Status = statusValue === "failed"
      ? "failed"
      : statusValue === "executing" || statusValue === "pending" || statusValue === "scheduled"
        ? "processing"
        : "sent";
    const runMode = cleanString(String(payload.runMode || "manual")).toLowerCase();
    const generatedAutomatically = runMode === "automatic";
    const title = safeS(row.title, generatedAutomatically ? "Bilan iNr’Stats automatique envoyé" : "Bilan iNr’Stats manuel envoyé");
    const periodDays = Math.round(Number(report.periodDays || payload.periodDays || 30) || 30);
    const fallbackPreview = periodDays > 0
      ? `Bilan statistique sur ${periodDays} jours.`
      : "Bilan statistique iNr’Stats.";
    const attachments = document
      ? [{
          name: document.filename,
          type: document.mimeType,
          size: document.bytes,
          url: null,
          downloadUrl: null,
          role: "generated_document",
          storagePath: document.storagePath,
        }]
      : [];

    return {
      id: String(row.id || ""),
      source: "inr_agent_actions",
      folder: "stats",
      provider: "iNr’Stats",
      status,
      created_at: generatedAt || row.created_at,
      sent_at: row.completed_at || cleanString(String(delivery.sentAt || "")) || null,
      error: row.last_error,
      title,
      target: recipient,
      preview: safeS(row.preview_text || row.summary, fallbackPreview).slice(0, 180),
      detailText: safeS(row.preview_text || row.summary, fallbackPreview),
      subject: safeS(delivery.subject, title),
      to: recipient,
      attachments,
      originSource: generatedAutomatically ? "inr_agent" : null,
      originLabel: generatedAutomatically ? "iNr’Agent" : null,
      originIcon: generatedAutomatically ? "🤖" : null,
      raw: row,
    };
  });
}

async function fetchAllRows<T>(
  build: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>,
  batchSize = 500,
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += batchSize) {
    const to = from + batchSize - 1;
    const { data, error } = await build(from, to);
    if (error) throw error;
    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);
    if (batch.length < batchSize) break;
  }

  return rows;
}

async function computeFolderCounts(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  userId: string,
  boxView: BoxView,
  filterAccountId: string,
  query: string,
): Promise<FolderCounts> {
  const counts = emptyFolderCounts();
  const eventsCutoffIso = getOldestAutoRetentionCutoffIso(["publications", "recoltes", "offres", "propulsions", "informations", "suivis", "enquetes", "fidelisations"]);

  const sendItemsPromise = fetchAllRows<SendItemRow>(async (from, to) => {
    let builder: any = supabase
      .from("send_items")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (boxView === "drafts") builder = builder.eq("status", "draft");
    else builder = builder.neq("status", "draft");

    if (filterAccountId) builder = builder.eq("integration_id", filterAccountId);

    return builder.range(from, to);
  });

  const campaignsPromise = boxView === "drafts"
    ? Promise.resolve([] as any[])
    : fetchAllRows<any>(async (from, to) => {
        let builder: any = supabase
          .from("mail_campaigns")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

        if (filterAccountId) builder = builder.eq("integration_id", filterAccountId);

        return builder.range(from, to);
      });

  const eventsPromise = fetchAllRows<any>(async (from, to) => {
    let builder: any = supabase
      .from("app_events")
      .select("id, module, type, payload, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (boxView === "drafts") {
      builder = builder.eq("module", "booster").eq("type", "publish_draft");
    } else {
      builder = builder.in("module", ["booster", "propulser", "fideliser"]);
      if (eventsCutoffIso) builder = builder.gte("created_at", eventsCutoffIso);
    }

    return builder.range(from, to);
  });

  const statsReportsPromise = boxView === "drafts"
    ? Promise.resolve([] as InrAgentActionRow[])
    : fetchAllRows<InrAgentActionRow>(async (from, to) => {
        const { data, error } = await supabaseAdmin
          .from("inr_agent_actions")
          .select("id, automation_key, action_type, target_tool, title, summary, preview_text, recipients, payload, status, completed_at, created_at, updated_at, last_error")
          .eq("user_id", userId)
          .eq("automation_key", "stats")
          .eq("action_type", "stats_report")
          .order("completed_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .range(from, to);
        if (error && isMissingAgentActionsError(error)) return { data: [], error: null };
        return { data: data as InrAgentActionRow[] | null, error };
      });

  const [sendRows, campaignRows, eventRows, statsReportRows] = await Promise.all([sendItemsPromise, campaignsPromise, eventsPromise, statsReportsPromise]);

  const allItems = [
    ...mapSendItems(sendRows),
    ...mapCampaignItems(campaignRows),
    ...mapEventItems(eventRows),
    ...mapAgentStatsReports(statsReportRows),
  ];

  for (const item of allItems) {
    if (!isVisibleInFolder(item.folder, item, boxView)) continue;
    if (!isInrSendItemRetained(item.folder, item.created_at)) continue;
    if (!matchesQuery(item, query)) continue;
    countFolderItem(counts, item);
  }

  return counts;
}

export async function GET(req: Request) {
  const supabase = await createSupabaseServer();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Votre session a expiré. Merci de vous reconnecter." }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const page = parsePositiveInt(url.searchParams.get("page"), 1, 100000);
    const pageSize = parsePositiveInt(url.searchParams.get("pageSize"), MAILBOX_PAGE_SIZE, MAILBOX_PAGE_SIZE);
    const folder = normalizeFolder(url.searchParams.get("folder"));
    const boxView = normalizeBoxView(url.searchParams.get("boxView"));
    const filterAccountId = cleanString(url.searchParams.get("filterAccountId"));
    const query = cleanString(url.searchParams.get("q")).toLowerCase();
    const folderCutoffIso = getInrSendRetentionCutoffIso(folder);
    const eventSourceCutoffIso = getOldestAutoRetentionCutoffIso(["publications", "recoltes", "offres", "propulsions", "informations", "suivis", "enquetes", "fidelisations"]);
    const targetVisibleCount = page * pageSize;

    const allItems: OutboxItem[] = [];
    const seenKeys = new Set<string>();

    const sourceState = {
      send_items: { offset: 0, exhausted: !shouldQuerySendItems(folder) },
      mail_campaigns: { offset: 0, exhausted: !shouldQueryCampaigns(folder, boxView) },
      app_events: { offset: 0, exhausted: !shouldQueryEvents(folder, boxView) },
      inr_agent_actions: { offset: 0, exhausted: !shouldQueryAgentStatsReports(folder, boxView) },
    };

    const pushItems = (items: OutboxItem[]) => {
      for (const item of items) {
        const key = `${item.source}:${item.id}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        allItems.push(item);
      }
    };

    const buildFiltered = () =>
      allItems
        .filter((item) => isVisibleInFolder(folder, item, boxView))
        .filter((item) => isInrSendItemRetained(item.folder, item.created_at))
        .filter((item) => matchesQuery(item, query))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    let filtered = buildFiltered();

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
      if (filtered.length >= targetVisibleCount) break;
      if (sourceState.send_items.exhausted && sourceState.mail_campaigns.exhausted && sourceState.app_events.exhausted && sourceState.inr_agent_actions.exhausted) break;

      const tasks: Promise<void>[] = [];

      if (!sourceState.send_items.exhausted) {
        tasks.push((async () => {
          let builder: any = supabase
            .from("send_items")
            .select("*")
            .eq("user_id", userData.user.id)
            .order("created_at", { ascending: false });

          if (folderCutoffIso) builder = builder.gte("created_at", folderCutoffIso);

          if (boxView === "drafts") builder = builder.eq("status", "draft");
          else builder = builder.neq("status", "draft");

          if (folder === "mails") builder = builder.eq("type", "mail");
          else if (folder === "factures") builder = builder.eq("type", "facture");
          else if (folder === "devis") builder = builder.eq("type", "devis");

          if (filterAccountId) builder = builder.eq("integration_id", filterAccountId);

          const from = sourceState.send_items.offset;
          const to = from + SOURCE_BATCH_SIZE - 1;
          const { data, error } = await builder.range(from, to);
          if (error) throw error;
          const rows = (data || []) as SendItemRow[];
          sourceState.send_items.offset += rows.length;
          if (rows.length < SOURCE_BATCH_SIZE) sourceState.send_items.exhausted = true;
          pushItems(mapSendItems(rows));
        })());
      }

      if (!sourceState.mail_campaigns.exhausted) {
        tasks.push((async () => {
          let builder: any = supabase
            .from("mail_campaigns")
            .select("*")
            .eq("user_id", userData.user.id)
            .order("created_at", { ascending: false });

          if (folderCutoffIso) builder = builder.gte("created_at", folderCutoffIso);

          if (filterAccountId) builder = builder.eq("integration_id", filterAccountId);

          const from = sourceState.mail_campaigns.offset;
          const to = from + SOURCE_BATCH_SIZE - 1;
          const { data, error } = await builder.range(from, to);
          if (error) throw error;
          const rows = (data || []) as any[];
          sourceState.mail_campaigns.offset += rows.length;
          if (rows.length < SOURCE_BATCH_SIZE) sourceState.mail_campaigns.exhausted = true;
          pushItems(mapCampaignItems(rows));
        })());
      }

      if (!sourceState.app_events.exhausted) {
        tasks.push((async () => {
          let builder: any = supabase
            .from("app_events")
            .select("id, module, type, payload, created_at")
            .eq("user_id", userData.user.id)
            .order("created_at", { ascending: false });

          if (folderCutoffIso) builder = builder.gte("created_at", folderCutoffIso);
          else if (eventSourceCutoffIso) builder = builder.gte("created_at", eventSourceCutoffIso);

          if (boxView === "drafts") {
            builder = builder.eq("type", "publish_draft");
          }

          if (folder === "publications") {
            builder = builder.eq("module", "booster");
          } else if (folder === "recoltes" || folder === "offres" || folder === "propulsions") {
            builder = builder.in("module", ["booster", "propulser"]);
          } else if (folder === "informations" || folder === "suivis" || folder === "enquetes" || folder === "fidelisations") {
            builder = builder.eq("module", "fideliser");
          } else {
            builder = builder.in("module", ["booster", "propulser", "fideliser"]);
          }

          const from = sourceState.app_events.offset;
          const to = from + SOURCE_BATCH_SIZE - 1;
          const { data, error } = await builder.range(from, to);
          if (error) throw error;
          const rows = (data || []) as any[];
          sourceState.app_events.offset += rows.length;
          if (rows.length < SOURCE_BATCH_SIZE) sourceState.app_events.exhausted = true;
          pushItems(mapEventItems(rows));
        })());
      }

      if (!sourceState.inr_agent_actions.exhausted) {
        tasks.push((async () => {
          const from = sourceState.inr_agent_actions.offset;
          const to = from + SOURCE_BATCH_SIZE - 1;
          const { data, error } = await supabaseAdmin
            .from("inr_agent_actions")
            .select("id, automation_key, action_type, target_tool, title, summary, preview_text, recipients, payload, status, completed_at, created_at, updated_at, last_error")
            .eq("user_id", userData.user.id)
            .eq("automation_key", "stats")
            .eq("action_type", "stats_report")
            .order("completed_at", { ascending: false, nullsFirst: false })
            .order("created_at", { ascending: false })
            .range(from, to);
          if (error) {
            if (isMissingAgentActionsError(error)) {
              sourceState.inr_agent_actions.exhausted = true;
              return;
            }
            throw error;
          }
          const rows = (data || []) as InrAgentActionRow[];
          sourceState.inr_agent_actions.offset += rows.length;
          if (rows.length < SOURCE_BATCH_SIZE) sourceState.inr_agent_actions.exhausted = true;
          pushItems(mapAgentStatsReports(rows));
        })());
      }

      await Promise.all(tasks);
      filtered = buildFiltered();
    }

    filtered = buildFiltered();

    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const items = filtered.slice(start, end);
    const allSourcesExhausted = sourceState.send_items.exhausted && sourceState.mail_campaigns.exhausted && sourceState.app_events.exhausted && sourceState.inr_agent_actions.exhausted;
    const total = allSourcesExhausted ? filtered.length : null;
    const hasMore = total != null ? end < total : filtered.length > end || !allSourcesExhausted;
    const historyFiles = await fetchInrSendHistoryFiles(
      supabase,
      userData.user.id,
      items
        .filter((item) => item.source === "send_items" || item.source === "mail_campaigns" || item.source === "app_events")
        .map((item) => ({ source: item.source, id: item.id })),
    );

    if (historyFiles.length) {
      const byHistoryKey = new Map<string, NonNullable<OutboxItem["attachments"]>>();
      for (const file of historyFiles) {
        const key = `${file.history_source}:${file.history_id}`;
        const url = downloadUrlForHistoryFile(file.id);
        const next = byHistoryKey.get(key) || [];
        next.push({
          name: file.file_name,
          type: file.mime_type,
          size: file.size_bytes,
          url,
          downloadUrl: url,
          role: file.file_role,
        });
        byHistoryKey.set(key, next);
      }

      for (const item of items) {
        const extra = byHistoryKey.get(`${item.source}:${item.id}`);
        if (!extra?.length) continue;
        item.attachments = mergeAttachments(item.attachments || [], extra);
      }
    }

    await withStatsReportSignedUrls(items);

    const [folderCounts, draftFolderCounts] = await Promise.all([
      computeFolderCounts(supabase, userData.user.id, "sent", filterAccountId, query),
      computeFolderCounts(supabase, userData.user.id, "drafts", filterAccountId, query),
    ]);

    return NextResponse.json({
      items,
      page,
      pageSize,
      hasMore,
      total,
      totalKnown: total != null,
      folderCounts,
      draftFolderCounts,
    });
  } catch (error) {
    return jsonUserFacingError(error, { status: 500 });
  }
}
