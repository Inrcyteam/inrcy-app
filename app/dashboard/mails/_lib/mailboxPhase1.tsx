import React from "react";
import styles from "../mails.module.css";
import type { MailCampaignRecipientInput } from "@/lib/crmRecipients";

export const MAILBOX_PAGE_SIZE = 20;
export const MAILBOX_RECIPIENTS_PAGE_SIZE = 20;
export const BULK_CONFIRM_WARNING_THRESHOLD = 100;
export const BULK_CONFIRM_STRONG_THRESHOLD = 500;

export function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export function stripText(v: unknown): string {
  return String(v || "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

export function safeS(v: unknown, fallback = ""): string {
  const s = stripText(v);
  return s || fallback;
}

export function applySignaturePreview(text: string, signature: string): string {
  const base = String(text || "").trimEnd();
  const sig = String(signature || "").trim();
  if (!sig) return base;
  if (!base) return sig;
  if (base.replace(/\r\n/g, "\n").trim().endsWith(sig.replace(/\r\n/g, "\n").trim())) return base;
  return `${base}\n\n${sig}`;
}

export function buildDefaultMailText(opts: { kind: SendType; name?: string; docRef?: string; signature?: string }): string {
  const name = (opts.name || "").trim();
  const hello = name ? `Bonjour ${name},` : "Bonjour,";

  const ref = (opts.docRef || "").trim();
  const refPart = ref ? ` ${ref}` : "";
  const closing = opts.signature?.trim() || "Cordialement,";

  if (opts.kind === "facture") {
    return [
      hello,
      "",
      `Veuillez trouver ci-joint votre facture${refPart}.`,
      "",
      "Je reste à votre disposition si besoin.",
      "",
      closing,
    ].join("\n");
  }

  if (opts.kind === "devis") {
    return [
      hello,
      "",
      `Veuillez trouver ci-joint votre devis${refPart}.`,
      "",
      "Je reste disponible pour toute question ou modification.",
      "",
      closing,
    ].join("\n");
  }

  return [
    hello,
    "",
    "Je me permets de vous contacter.",
    "",
    closing,
  ].join("\n");
}
// iNrSend : centre d'historique des envois + envoi simple de mails.
export type Folder =
  | "mails"
  | "factures"
  | "devis"
  | "publications"
  | "recoltes"
  | "offres"
  | "informations"
  | "suivis"
  | "enquetes";

export const ALL_FOLDERS: Folder[] = [
  "mails",
  "factures",
  "devis",
  "publications",
  "recoltes",
  "offres",
  "informations",
  "suivis",
  "enquetes",
];

export type FolderCounts = Record<Folder, number>;

export function emptyFolderCounts(): FolderCounts {
  return {
    mails: 0,
    factures: 0,
    devis: 0,
    publications: 0,
    recoltes: 0,
    offres: 0,
    informations: 0,
    suivis: 0,
    enquetes: 0,
  };
}

export function normalizeFolderCounts(input: unknown): FolderCounts {
  const counts = emptyFolderCounts();
  if (!input || typeof input !== "object") return counts;
  for (const folder of ALL_FOLDERS) {
    const value = Number((input as Record<string, unknown>)[folder] ?? 0);
    counts[folder] = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }
  return counts;
}

export function isFolderValue(value: string): value is Folder {
  return (ALL_FOLDERS as string[]).includes(value);
}

export function folderFromTrack(trackKind: string | null | undefined, trackType: string | null | undefined, fallback: Folder = "mails"): Folder {
  const kind = String(trackKind || "").toLowerCase();
  const type = String(trackType || "").toLowerCase();

  if (kind === "booster") {
    if (type === "review_mail") return "recoltes";
    if (type === "promo_mail") return "offres";
  }

  if (kind === "fideliser") {
    if (type === "newsletter_mail") return "informations";
    if (type === "thanks_mail") return "suivis";
    if (type === "satisfaction_mail") return "enquetes";
  }

  return fallback;
}

export function defaultFolderFromSendType(type: SendType | string | null | undefined): Folder {
  if (type === "facture") return "factures";
  if (type === "devis") return "devis";
  return "mails";
}

export function resolveCampaignFolder(raw: any): Folder {
  const explicit = String(raw?.folder || "").toLowerCase();
  if (isFolderValue(explicit)) return explicit;
  const tracked = folderFromTrack(raw?.track_kind, raw?.track_type, defaultFolderFromSendType(raw?.type));
  return tracked;
}

export function campaignTitleFromFolder(folder: Folder, subject: string) {
  const safeSubject = safeS(subject, "(sans objet)");
  if (folder === "offres") return `Offre — ${safeSubject}`;
  if (folder === "recoltes") return `Récolte — ${safeSubject}`;
  if (folder === "informations") return `Information — ${safeSubject}`;
  if (folder === "suivis") return `Suivi — ${safeSubject}`;
  if (folder === "enquetes") return `Enquête — ${safeSubject}`;
  if (folder === "factures") return `Envoi facture — ${safeSubject}`;
  if (folder === "devis") return `Envoi devis — ${safeSubject}`;
  return `Campagne — ${safeSubject}`;
}

export function isBusinessMailFolder(folder: Folder) {
  return folder === "recoltes" || folder === "offres" || folder === "informations" || folder === "suivis" || folder === "enquetes";
}

// Typage historique d'envoi (ancienne table send_items)
export type SendType = "mail" | "facture" | "devis";
export type Status = "draft" | "sent" | "error" | "queued" | "processing" | "paused" | "partial" | "completed" | "failed";

export type MailAccount = {
  id: string;
  provider: "gmail" | "microsoft" | "imap";
  email_address: string;
  display_name: string | null;
  status: string;
};

export const MAIL_ACCOUNTS_UPDATED_EVENT = "inrsend:mail-accounts-updated";

export type ComposeAttachmentRef = {
  bucket: string;
  path: string;
  name: string;
  type?: string | null;
  size?: number | null;
};

export type ComposeCrmRecipientHint = MailCampaignRecipientInput;

export type CampaignRecipientLog = {
  id: string;
  email: string;
  display_name?: string | null;
  status: string;
  error?: string | null;
  last_error?: string | null;
  attempt_count?: number | null;
  max_attempts?: number | null;
  next_attempt_at?: string | null;
  sent_at?: string | null;
  updated_at?: string | null;
  suppression_reason?: string | null;
  bounce_type?: string | null;
  bounced_at?: string | null;
  unsubscribed_at?: string | null;
  delivery_status?: string | null;
  delivery_event?: string | null;
  delivery_last_event_at?: string | null;
  delivered_at?: string | null;
};

export type CampaignRecipientsFilterId =
  | "all"
  | "sent"
  | "delivered"
  | "queued"
  | "processing"
  | "failed"
  | "blocked"
  | "opt_out"
  | "blacklist"
  | "complaint"
  | "hard_bounce"
  | "soft_bounce";

export type CampaignHealthSummary = {
  total: number;
  queued: number;
  processing: number;
  sent: number;
  delivered: number;
  failed: number;
  blocked: number;
  opt_out: number;
  blacklist: number;
  complaint: number;
  hard_bounce: number;
  soft_bounce: number;
  retryable: number;
};

export type SendItem = {
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
  // present in DB (used by Gmail), but not always selected previously
  provider_thread_id?: string | null;
  source_doc_save_id?: string | null;
  source_doc_type?: "devis" | "facture" | null;
  source_doc_number?: string | null;
  error: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OutboxItem = {
  id: string;
  source: "send_items" | "app_events" | "mail_campaigns";
  module?: "booster" | "fideliser";
  folder: Folder;
  provider: string | null; // Gmail / Microsoft / IMAP / Booster / Fidéliser / Admin
  status: Status;
  created_at: string;
  sent_at?: string | null;
  error?: string | null;

  // Affichage liste
  title: string;
  subTitle?: string;
  target: string;
  preview: string;

  // Détails
  detailHtml?: string | null;
  detailText?: string | null;
  // Optional richer details (when available)
  subject?: string | null;
  to?: string | null;
  from?: string | null;
  channels?: string[];
  attachments?: { name: string; type?: string | null; size?: number | null; url?: string | null }[];
  raw?: any;
  reopenHref?: string | null;
};

export type PublicationParts = {
  title?: string | null;
  content?: string | null;
  cta?: string | null;
  hashtags?: string[];
  attachments?: { name: string; type?: string | null; size?: number | null; url?: string | null }[];
};

export type ChannelPublication = {
  key: string;
  label: string;
  parts: PublicationParts;
};

export type PublicationEditForm = {
  title: string;
  content: string;
  cta: string;
  hashtags: string;
};

export type EditablePublicationAttachment = {
  name: string;
  type?: string | null;
  size?: number | null;
  url?: string | null;
};

export type PublicationImageFitMode = "contain" | "cover";
export type PublicationImageBackgroundMode = "blur" | "transparent" | "color" | "white" | "black" | "gray" | "sand" | "brand";
export type PublicationDesignPosition = "top" | "center" | "bottom";
export type PublicationImageDesign = { enabled: boolean; text: string; color: string; background: string; position: PublicationDesignPosition; size: number; x?: number; y?: number; };

export type PublicationImageTransform = {
  fit: PublicationImageFitMode;
  zoom: number;
  offsetX: number;
  offsetY: number;
  blurBackground: boolean;
  backgroundMode?: PublicationImageBackgroundMode;
  backgroundColor?: string;
  design?: PublicationImageDesign;
};

export type PublicationImageAsset = {
  key: string;
  name: string;
  type: string;
  previewUrl: string;
  sourceUrl: string | null;
  file: File | null;
  selected: boolean;
  transform: PublicationImageTransform;
};

export type PublicationChannelImagesState = {
  assets: PublicationImageAsset[];
};

export type PublicationImageRenderPreset = {
  width: number;
  height: number;
  defaultFit: PublicationImageFitMode;
  defaultBlurBackground: boolean;
};

export type PublicationPreviewLayout = {
  drawW: number;
  drawH: number;
  dx: number;
  dy: number;
};

export const DEFAULT_PUBLICATION_DESIGN: PublicationImageDesign = { enabled: false, text: "", color: "#ffffff", background: "#111827", position: "bottom", size: 30, x: 50, y: 88 };

export const PUBLICATION_CHANNEL_PRESETS: Record<string, PublicationImageRenderPreset> = {
  inrcy_site: { width: 1440, height: 900, defaultFit: "contain", defaultBlurBackground: true },
  site_web: { width: 1440, height: 900, defaultFit: "contain", defaultBlurBackground: true },
  gmb: { width: 1200, height: 900, defaultFit: "contain", defaultBlurBackground: true },
  facebook: { width: 1200, height: 1200, defaultFit: "cover", defaultBlurBackground: false },
  instagram: { width: 1080, height: 1350, defaultFit: "cover", defaultBlurBackground: false },
  linkedin: { width: 1200, height: 1200, defaultFit: "cover", defaultBlurBackground: false },
};

export function publicationClamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getPublicationChannelPreset(channel: string): PublicationImageRenderPreset {
  return PUBLICATION_CHANNEL_PRESETS[normalizeChannelKey(channel)] || { width: 1200, height: 900, defaultFit: "contain", defaultBlurBackground: true };
}

export function buildPublicationDefaultTransform(channel: string): PublicationImageTransform {
  const preset = getPublicationChannelPreset(channel);
  return {
    fit: preset.defaultFit,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    blurBackground: preset.defaultBlurBackground,
    backgroundMode: preset.defaultBlurBackground ? "blur" : "black",
    backgroundColor: "#e8f6ff",
    design: { ...DEFAULT_PUBLICATION_DESIGN },
  };
}

export function getPublicationBackgroundMode(transform: PublicationImageTransform): PublicationImageBackgroundMode {
  if (transform.backgroundMode) return transform.backgroundMode;
  return transform.blurBackground ? "blur" : "black";
}

export function withPublicationBackgroundMode(transform: PublicationImageTransform, backgroundMode: PublicationImageBackgroundMode): PublicationImageTransform {
  return {
    ...transform,
    backgroundMode,
    blurBackground: backgroundMode === "blur",
  };
}

export function getPublicationBackgroundFill(mode: PublicationImageBackgroundMode, backgroundColor?: string): string {
  if (backgroundColor) return backgroundColor;
  switch (mode) {
    case "white": return "#ffffff";
    case "gray": return "#d6dae2";
    case "sand": return "#efe4d3";
    case "brand": return "#e8f6ff";
    case "color": return "#e8f6ff";
    default: return "#0d1320";
  }
}

export function getPublicationDesign(transform: PublicationImageTransform): PublicationImageDesign {
  const design = { ...DEFAULT_PUBLICATION_DESIGN, ...(transform.design || {}) };
  if (typeof design.x !== "number") design.x = 50;
  if (typeof design.y !== "number") design.y = design.position === "top" ? 12 : design.position === "center" ? 50 : 88;
  return design;
}

export function drawPublicationDesignOverlay(ctx: CanvasRenderingContext2D, cw: number, ch: number, transform: PublicationImageTransform) {
  const design = getPublicationDesign(transform);
  const text = String(design.text || "").trim();
  if (!design.enabled || !text) return;
  const size = publicationClamp(design.size || 30, 18, 72);
  ctx.save();
  ctx.font = `900 ${size}px Inter, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const maxTextWidth = cw * 0.78;
  const metrics = ctx.measureText(text);
  const textWidth = Math.min(metrics.width, maxTextWidth);
  const padX = 22;
  const padY = 14;
  const boxW = textWidth + padX * 2;
  const boxH = size + padY * 2;
  const x = publicationClamp((typeof design.x === "number" ? design.x : 50) / 100 * cw, boxW / 2 + 16, cw - boxW / 2 - 16);
  const fallbackY = design.position === "top" ? 12 : design.position === "center" ? 50 : 88;
  const y = publicationClamp((typeof design.y === "number" ? design.y : fallbackY) / 100 * ch, boxH / 2 + 16, ch - boxH / 2 - 16);
  const rx = x - boxW / 2;
  const ry = y - boxH / 2;
  const radius = 18;
  ctx.fillStyle = `${design.background || "#111827"}cc`;
  ctx.beginPath();
  ctx.moveTo(rx + radius, ry);
  ctx.lineTo(rx + boxW - radius, ry);
  ctx.quadraticCurveTo(rx + boxW, ry, rx + boxW, ry + radius);
  ctx.lineTo(rx + boxW, ry + boxH - radius);
  ctx.quadraticCurveTo(rx + boxW, ry + boxH, rx + boxW - radius, ry + boxH);
  ctx.lineTo(rx + radius, ry + boxH);
  ctx.quadraticCurveTo(rx, ry + boxH, rx, ry + boxH - radius);
  ctx.lineTo(rx, ry + radius);
  ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = design.color || "#ffffff";
  ctx.fillText(text, x, y, maxTextWidth);
  ctx.restore();
}

export function isPublicationTransformModified(transform: PublicationImageTransform, channel: string): boolean {
  const defaults = buildPublicationDefaultTransform(channel);
  return (
    transform.fit !== defaults.fit ||
    Math.abs((transform.zoom || 1) - 1) > 0.001 ||
    Math.abs(transform.offsetX || 0) > 0.001 ||
    Math.abs(transform.offsetY || 0) > 0.001 ||
    getPublicationBackgroundMode(transform) !== getPublicationBackgroundMode(defaults) ||
    JSON.stringify(getPublicationDesign(transform)) !== JSON.stringify(getPublicationDesign(defaults))
  );
}

export function computePublicationPreviewLayout(params: {
  containerWidth: number;
  containerHeight: number;
  imageWidth: number;
  imageHeight: number;
  transform: PublicationImageTransform;
}): PublicationPreviewLayout {
  const { containerWidth, containerHeight, imageWidth, imageHeight, transform } = params;
  if (!containerWidth || !containerHeight || !imageWidth || !imageHeight) {
    return { drawW: 0, drawH: 0, dx: 0, dy: 0 };
  }

  const baseScale = transform.fit === "cover"
    ? Math.max(containerWidth / imageWidth, containerHeight / imageHeight)
    : Math.min(containerWidth / imageWidth, containerHeight / imageHeight);
  const scale = baseScale * publicationClamp(transform.zoom || 1, 0.4, 3);
  const drawW = imageWidth * scale;
  const drawH = imageHeight * scale;
  const maxX = Math.abs(drawW - containerWidth) / 2;
  const maxY = Math.abs(drawH - containerHeight) / 2;
  const dx = (containerWidth - drawW) / 2 - maxX * publicationClamp(transform.offsetX || 0, -100, 100) / 100;
  const dy = (containerHeight - drawH) / 2 - maxY * publicationClamp(transform.offsetY || 0, -100, 100) / 100;

  return { drawW, drawH, dx, dy };
}

export function offsetFromPublicationDrawPosition(params: {
  containerWidth: number;
  containerHeight: number;
  drawW: number;
  drawH: number;
  dx: number;
  dy: number;
}): Pick<PublicationImageTransform, "offsetX" | "offsetY"> {
  const { containerWidth, containerHeight, drawW, drawH, dx, dy } = params;
  const maxX = Math.abs(drawW - containerWidth) / 2;
  const maxY = Math.abs(drawH - containerHeight) / 2;
  const offsetX = maxX ? publicationClamp((((containerWidth - drawW) / 2 - dx) / maxX) * 100, -100, 100) : 0;
  const offsetY = maxY ? publicationClamp((((containerHeight - drawH) / 2 - dy) / maxY) * 100, -100, 100) : 0;
  return { offsetX, offsetY };
}

export function makePublicationImageAssetKey(prefix: string, name: string, suffix: string) {
  return `${prefix}:${name}:${suffix}`;
}

export function loadPublicationHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Impossible de charger l'image."));
    img.src = src;
  });
}

export async function renderPublicationImageAsset(params: {
  source: string | File;
  transform: PublicationImageTransform;
  channel: string;
  name: string;
  type: string;
}): Promise<{ name: string; type: string; dataUrl: string }> {
  const { source, transform, channel, name, type } = params;
  const preset = getPublicationChannelPreset(channel);
  const sourceUrl = typeof source === "string" ? source : URL.createObjectURL(source);
  try {
    const img = await loadPublicationHtmlImage(sourceUrl);
    const canvas = document.createElement("canvas");
    canvas.width = preset.width;
    canvas.height = preset.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponible.");

    const cw = canvas.width;
    const ch = canvas.height;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const baseScale = transform.fit === "cover" ? Math.max(cw / iw, ch / ih) : Math.min(cw / iw, ch / ih);
    const scale = baseScale * publicationClamp(transform.zoom || 1, 0.4, 3);
    const drawW = iw * scale;
    const drawH = ih * scale;
    const maxX = Math.abs(drawW - cw) / 2;
    const maxY = Math.abs(drawH - ch) / 2;
    const dx = (cw - drawW) / 2 - maxX * publicationClamp(transform.offsetX || 0, -100, 100) / 100;
    const dy = (ch - drawH) / 2 - maxY * publicationClamp(transform.offsetY || 0, -100, 100) / 100;

    ctx.clearRect(0, 0, cw, ch);

    const backgroundMode = getPublicationBackgroundMode(transform);
    if (transform.fit === "contain") {
      if (backgroundMode !== "blur" && backgroundMode !== "transparent") {
        ctx.fillStyle = getPublicationBackgroundFill(backgroundMode, transform.backgroundColor);
        ctx.fillRect(0, 0, cw, ch);
      } else if (backgroundMode === "blur") {
        const blurScale = Math.max(cw / iw, ch / ih);
        const blurW = iw * blurScale;
        const blurH = ih * blurScale;
        const blurX = (cw - blurW) / 2;
        const blurY = (ch - blurH) / 2;
        ctx.save();
        ctx.filter = "blur(28px) saturate(1.05)";
        ctx.drawImage(img, blurX, blurY, blurW, blurH);
        ctx.restore();
        ctx.fillStyle = "rgba(8, 12, 24, 0.24)";
        ctx.fillRect(0, 0, cw, ch);
      }
    }

    ctx.drawImage(img, dx, dy, drawW, drawH);
    drawPublicationDesignOverlay(ctx, cw, ch, transform);
    const outputType = backgroundMode === "transparent" ? "image/png" : (type || "image/jpeg");
    return { name: name.replace(/\.[^.]+$/, "") + (backgroundMode === "transparent" ? ".png" : name.match(/\.[^.]+$/)?.[0] || ".jpg"), type: outputType, dataUrl: canvas.toDataURL(outputType, 0.92) };
  } finally {
    if (typeof source !== "string") URL.revokeObjectURL(sourceUrl);
  }
}

export function splitList(v?: string | null): string[] {
  if (!v) return [];
  return String(v)
    .split(/[;,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function firstNonEmpty(...vals: any[]) {
  for (const v of vals) {
    const s = typeof v === "string" ? v.trim() : "";
    if (s) return s;
  }
  return "";
}

export function extractChannelsFromPayload(payload: any): string[] {
  if (!payload || typeof payload !== "object") return [];

  const candidates: any[] = [];
  // common patterns
  if (Array.isArray(payload.channels)) candidates.push(...payload.channels);
  if (Array.isArray(payload.platforms)) candidates.push(...payload.platforms);
  if (Array.isArray(payload.targets)) candidates.push(...payload.targets);
  if (Array.isArray(payload.destinations)) candidates.push(...payload.destinations);

  const single = firstNonEmpty(payload.channel, payload.platform, payload.target, payload.destination);
  if (single) candidates.push(single);

  return candidates
    .flat()
    .map((x) => (typeof x === "string" ? x : x?.name || x?.label || ""))
    .map((s: string) => String(s).trim())
    .filter(Boolean);
}

export function extractMessageFromPayload(payload: any): { html?: string | null; text?: string | null } {
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

  // 1) HTML (flat or nested)
  const html =
    pickStr(payload, "html", "body_html", "bodyHtml", "content_html", "contentHtml", "message_html", "messageHtml") ||
    pickStr(payload?.post, "html", "body_html", "bodyHtml", "content_html", "contentHtml") ||
    pickStr(payload?.mail, "html", "body_html", "bodyHtml", "content_html", "contentHtml") ||
    null;

  // 2) Text (flat or nested)
  let text =
    pickStr(
      payload,
      "text",
      "body_text",
      "bodyText",
      "message",
      "content",
      "caption",
      "description",
      "prompt"
    ) ||
    coerceText(payload?.post?.content) ||
    coerceText(payload?.post?.text) ||
    coerceText(payload?.post?.message) ||
    coerceText(payload?.mail?.text) ||
    coerceText(payload?.mail?.body_text) ||
    coerceText(payload?.mail?.bodyText) ||
    coerceText(payload?.message) ||
    null;

  // Booster "publish-now" payload: payload.post is an object { title, content, cta, hashtags }
  if (!text && payload?.post && typeof payload.post === "object") {
    const title = pickStr(payload.post, "title") || pickStr(payload, "title");
    const content =
      coerceText(payload.post.content) || coerceText(payload.post.text) || coerceText(payload.post.caption) || null;
    const cta = pickStr(payload.post, "cta") || pickStr(payload, "cta");
    const parts = [title, content, cta].filter(Boolean);
    if (parts.length) text = parts.join("\n");
  }

  // If there are hashtags, append them at the end (nice for publications)
  const tags = (payload as any).hashtags ?? (payload as any)?.post?.hashtags;
  if (Array.isArray(tags) && tags.length) {
    const hashLine = tags
      .map((t) => String(t || "").trim())
      .filter(Boolean)
      .join(" ");
    if (hashLine) text = `${text ? text.trim() + "\n\n" : ""}${hashLine}`;
  }

  return { html, text };
}

export function extractAttachmentsFromPayload(payload: any): { name: string; type?: string | null; size?: number | null; url?: string | null }[] {
  if (!payload || typeof payload !== "object") return [];
  const candidates =
    payload.attachments ||
    payload.files ||
    payload.images ||
    payload.media ||
    payload?.post?.attachments ||
    payload?.post?.files ||
    payload?.post?.images ||
    payload?.post?.media ||
    [];

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
      const url = a.url || a.href || a.publicUrl || a.public_url || (typeof a.path === "string" && isLikelyUrl(a.path) ? a.path : null);
      const name = a.name || a.filename || a.fileName || a.originalname || (typeof a.path === "string" && !isLikelyUrl(a.path) ? a.path : null) || url;
      if (!name && !url) return null;
      return {
        name: String(name || buildNameFromUrl(String(url || ""))),
        type: a.type || a.mime || a.mimeType || null,
        size: typeof a.size === "number" ? a.size : typeof a.bytes === "number" ? a.bytes : null,
        url: url || null,
      };
    })
    .filter(Boolean) as any;
}


export function hasAttachmentFields(payload: any): boolean {
  if (!payload || typeof payload !== "object") return false;
  return [
    payload.attachments,
    payload.files,
    payload.images,
    payload.media,
    payload?.post?.attachments,
    payload?.post?.files,
    payload?.post?.images,
    payload?.post?.media,
  ].some((value) => Array.isArray(value));
}

export function extractPublicationParts(payload: any): PublicationParts {
  if (!payload || typeof payload !== "object") return {};
  const post = payload.post && typeof payload.post === "object" ? payload.post : payload;

  const title =
    (typeof post.title === "string" && post.title.trim() ? post.title.trim() : null) ||
    (typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : null) ||
    null;

  const content =
    (typeof post.content === "string" && post.content.trim() ? post.content.trim() : null) ||
    (typeof post.text === "string" && post.text.trim() ? post.text.trim() : null) ||
    (typeof post.message === "string" && post.message.trim() ? post.message.trim() : null) ||
    null;

  const cta =
    (typeof post.cta === "string" && post.cta.trim() ? post.cta.trim() : null) ||
    (typeof payload.cta === "string" && payload.cta.trim() ? payload.cta.trim() : null) ||
    null;

  const hashtagsRaw = (post as any).hashtags ?? (payload as any).hashtags;
  const hashtags = Array.isArray(hashtagsRaw)
    ? hashtagsRaw.map((x: any) => String(x || "").trim()).filter(Boolean)
    : [];

  const attachments = extractAttachmentsFromPayload(payload);

  return { title, content, cta, hashtags, attachments };
}

export function normalizeChannelKey(channel: string): string {
  const normalized = String(channel || "").trim().toLowerCase();
  switch (normalized) {
    case "inrcy_site":
    case "site_inrcy":
    case "site inrcy":
      return "inrcy_site";
    case "site_web":
    case "site web":
    case "website":
    case "web":
      return "site_web";
    case "gmb":
    case "google_business":
    case "google business":
    case "googlebusiness":
      return "gmb";
    case "linked in":
      return "linkedin";
    default:
      return normalized;
  }
}

export function formatChannelLabel(channel: string): string {
  const normalized = normalizeChannelKey(channel);
  switch (normalized) {
    case "inrcy_site":
      return "Site iNrCy";
    case "site_web":
      return "Site web";
    case "gmb":
      return "Google Business";
    case "facebook":
      return "Facebook";
    case "instagram":
      return "Instagram";
    case "linkedin":
      return "LinkedIn";
    default:
      return normalized || "canal";
  }
}

export function channelApiPath(channel: string): string {
  const normalized = normalizeChannelKey(channel);
  switch (normalized) {
    case "inrcy_site":
      return "site-inrcy";
    case "site_web":
      return "site-web";
    case "gmb":
      return "gmb";
    case "facebook":
      return "facebook";
    case "instagram":
      return "instagram";
    case "linkedin":
      return "linkedin";
    default:
      return normalized || channel;
  }
}

export function isDeletedChannelResult(result: any): boolean {
  if (!result || typeof result !== "object") return false;
  return result.deleted === true || String(result.status || "").toLowerCase() === "deleted";
}

export function orderChannelKeys(channels: string[]): string[] {
  const priority = ["inrcy_site", "site_web", "gmb", "facebook", "instagram", "linkedin"];
  const normalizedUnique = Array.from(new Set(channels.map((channel) => normalizeChannelKey(channel)).filter(Boolean)));
  return normalizedUnique.sort((a, b) => {
    const indexA = priority.indexOf(a);
    const indexB = priority.indexOf(b);
    const rankA = indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA;
    const rankB = indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB;
    if (rankA !== rankB) return rankA - rankB;
    return a.localeCompare(b);
  });
}

export function extractPublicationResults(payload: any): Record<string, any> {
  return payload?.results && typeof payload.results === "object" ? payload.results : {};
}

export function isFailedChannelResult(result: any): boolean {
  if (!result || typeof result !== "object") return false;
  if (isDeletedChannelResult(result)) return false;
  if (result.ok === false) return true;
  const status = String(result.status || "").toLowerCase();
  return status === "failed" || status === "error";
}

export function getChannelIndicatorMeta(result: any): { kind: "failed" | "deleted"; title: string; className: string } | null {
  if (isDeletedChannelResult(result)) {
    return {
      kind: "deleted",
      title: "Publication supprimée sur ce canal",
      className: styles.channelDeletedDot,
    };
  }
  if (isFailedChannelResult(result)) {
    return {
      kind: "failed",
      title: "Échec sur ce canal",
      className: styles.channelFailedDot,
    };
  }
  return null;
}

export function getFailedChannelMessage(result: any): string {
  if (!isFailedChannelResult(result)) return "";
  const message = result?.error ?? result?.message ?? result?.last_error ?? "";
  return typeof message === "string" ? message.trim() : String(message || "").trim();
}

export function getPublicationChannelStatuses(payload: any, fallbackChannels: string[] = []) {
  const results = extractPublicationResults(payload);
  const channels = orderChannelKeys([
    ...fallbackChannels,
    ...extractChannelsFromPayload(payload),
    ...Object.keys(results),
  ]);

  return channels.map((channel) => {
    const result = (results as any)?.[channel] || null;
    const indicator = getChannelIndicatorMeta(result);
    return {
      key: channel,
      label: formatChannelLabel(channel),
      failed: indicator?.kind === "failed",
      deleted: indicator?.kind === "deleted",
      indicator,
      result,
    };
  });
}

export function renderPublicationChannelsWithFailures(payload: any, fallbackChannels: string[] = []) {
  const channels = getPublicationChannelStatuses(payload, fallbackChannels);
  if (!channels.length) return null;

  return (
    <span className={styles.channelStatusInlineWrap}>
      {channels.map((entry, index) => (
        <React.Fragment key={`${entry.key}-${index}`}>
          <span className={styles.channelStatusInline}>
            <span className={styles.channelStatusLabel}>{entry.label}</span>
            {entry.indicator ? (
              <span
                className={entry.indicator.className}
                title={entry.indicator.title}
                aria-label={entry.indicator.title}
              />
            ) : null}
          </span>
          {index < channels.length - 1 ? <span className={styles.channelStatusSeparator}> / </span> : null}
        </React.Fragment>
      ))}
    </span>
  );
}

export function extractChannelPublications(payload: any): ChannelPublication[] {
  if (!payload || typeof payload !== "object") return [];

  const explicitChannels = [
    ...extractChannelsFromPayload(payload),
    ...Object.keys(payload?.results && typeof payload.results === "object" ? payload.results : {}),
  ]
    .map((ch) => normalizeChannelKey(String(ch || "")))
    .filter(Boolean);

  const channelSet = new Set(explicitChannels);
  const postByChannel = payload?.postByChannel && typeof payload.postByChannel === "object" ? payload.postByChannel : {};
  const postByNormalizedChannel = Object.entries(postByChannel).reduce<Record<string, any>>((acc, [key, value]) => {
    const cleaned = normalizeChannelKey(String(key || ""));
    if (!cleaned) return acc;
    if (!(cleaned in acc)) acc[cleaned] = value;
    if (channelSet.has(cleaned)) return acc;

    const isSiteMirror = (cleaned === "inrcy_site" || cleaned === "site_web") && (channelSet.has("inrcy_site") || channelSet.has("site_web"));
    if (!channelSet.size || !isSiteMirror) {
      channelSet.add(cleaned);
    }
    return acc;
  }, {});

  const orderedChannels = orderChannelKeys(Array.from(channelSet));
  if (!orderedChannels.length) {
    const baseParts = extractPublicationParts(payload);
    const hasBase = !!(baseParts.title || baseParts.content || baseParts.cta || baseParts.hashtags?.length || baseParts.attachments?.length);
    return hasBase ? [{ key: "default", label: "publication", parts: baseParts }] : [];
  }

  return orderedChannels.map((channel) => {
    const channelPayload = postByNormalizedChannel[channel];
    const channelParts = extractPublicationParts(channelPayload);
    const fallbackParts = extractPublicationParts(payload);

    const channelOwnsAttachments = hasAttachmentFields(channelPayload);

    return {
      key: channel,
      label: formatChannelLabel(channel),
      parts: {
        title: channelParts.title || fallbackParts.title || null,
        content: channelParts.content || fallbackParts.content || null,
        cta: channelParts.cta || fallbackParts.cta || null,
        hashtags: channelParts.hashtags?.length ? channelParts.hashtags : fallbackParts.hashtags || [],
        attachments: channelOwnsAttachments ? channelParts.attachments || [] : fallbackParts.attachments || [],
      },
    };
  });
}

export function tagsToEditorString(tags?: string[]): string {
  return Array.isArray(tags) ? tags.map((tag) => String(tag || "").trim().replace(/^#/, "")).filter(Boolean).join(" ") : "";
}

export function isImageAttachment(att: { name: string; type?: string | null; url?: string | null }): boolean {
  const type = String(att.type || "").toLowerCase();
  const raw = String(att.url || att.name || "").toLowerCase().split("?")[0];
  return type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/.test(raw);
}

export function isVideoAttachment(att: { name: string; type?: string | null; url?: string | null }): boolean {
  const type = String(att.type || "").toLowerCase();
  const raw = String(att.url || att.name || "").toLowerCase().split("?")[0];
  return type.startsWith("video/") || /\.(mp4|mov|webm|ogg|m4v)$/.test(raw);
}

export function folderTheme(f: Folder): React.CSSProperties {
  const themes: Record<Folder, { start: string; end: string; glow: string; border: string }> = {
    mails: {
      start: "rgba(56,189,248,0.30)",
      end: "rgba(167,139,250,0.26)",
      glow: "rgba(56,189,248,0.30)",
      border: "rgba(56,189,248,0.42)",
    },
    factures: {
      start: "rgba(251,146,60,0.30)",
      end: "rgba(244,114,182,0.22)",
      glow: "rgba(251,146,60,0.26)",
      border: "rgba(251,146,60,0.40)",
    },
    devis: {
      start: "rgba(167,139,250,0.30)",
      end: "rgba(56,189,248,0.24)",
      glow: "rgba(167,139,250,0.28)",
      border: "rgba(167,139,250,0.42)",
    },
    publications: {
      start: "rgba(244,114,182,0.28)",
      end: "rgba(251,146,60,0.22)",
      glow: "rgba(244,114,182,0.26)",
      border: "rgba(244,114,182,0.40)",
    },
    recoltes: {
      start: "rgba(56,189,248,0.26)",
      end: "rgba(34,197,94,0.20)",
      glow: "rgba(56,189,248,0.26)",
      border: "rgba(56,189,248,0.38)",
    },
    offres: {
      start: "rgba(251,146,60,0.28)",
      end: "rgba(167,139,250,0.22)",
      glow: "rgba(251,146,60,0.24)",
      border: "rgba(251,146,60,0.38)",
    },
    informations: {
      start: "rgba(56,189,248,0.24)",
      end: "rgba(244,114,182,0.18)",
      glow: "rgba(56,189,248,0.24)",
      border: "rgba(56,189,248,0.34)",
    },
    suivis: {
      start: "rgba(34,197,94,0.22)",
      end: "rgba(56,189,248,0.20)",
      glow: "rgba(34,197,94,0.20)",
      border: "rgba(34,197,94,0.34)",
    },
    enquetes: {
      start: "rgba(244,114,182,0.26)",
      end: "rgba(167,139,250,0.24)",
      glow: "rgba(244,114,182,0.24)",
      border: "rgba(244,114,182,0.36)",
    },
  };

  const theme = themes[f];
  return {
    ["--folder-accent-start" as any]: theme.start,
    ["--folder-accent-end" as any]: theme.end,
    ["--folder-accent-glow" as any]: theme.glow,
    ["--folder-accent-border" as any]: theme.border,
  } as React.CSSProperties;
}

export function toolbarActionTheme(f: Folder): React.CSSProperties {
  const base = folderTheme(f) as React.CSSProperties & Record<string, string>;
  return {
    ["--toolbar-cta-start" as any]: String(base["--folder-accent-start"] || "rgba(56,189,248,0.26)"),
    ["--toolbar-cta-end" as any]: String(base["--folder-accent-end"] || "rgba(167,139,250,0.22)"),
    ["--toolbar-cta-glow" as any]: String(base["--folder-accent-glow"] || "rgba(56,189,248,0.16)"),
    ["--toolbar-cta-border" as any]: String(base["--folder-accent-border"] || "rgba(56,189,248,0.42)"),
  } as React.CSSProperties;
}


export function bulkConfirmationMessage(recipientCount: number): string {
  if (recipientCount >= BULK_CONFIRM_STRONG_THRESHOLD) {
    return `Confirmer l’envoi de cette campagne à ${recipientCount} destinataires ?\n\nChaque contact recevra un email individuel. Les quotas, pauses automatiques et reprises par vagues s’appliqueront si nécessaire.\n\nVérifiez l’objet, le contenu et la boîte d’envoi avant de continuer.`;
  }
  return `Confirmer l’envoi de cette campagne à ${recipientCount} destinataires ?\n\nChaque contact recevra un email individuel.`;
}

export function historyEmptyState(folder: Folder, view: BoxView, query: string): string {
  const trimmed = query.trim();
  if (trimmed) return `Aucun résultat pour “${trimmed}”.`;
  if (view === "drafts") return `Aucun brouillon dans ${folderLabel(folder).toLowerCase()}.`;
  switch (folder) {
    case "publications":
      return "Aucune publication pour le moment.";
    case "recoltes":
      return "Aucune récolte pour le moment.";
    case "offres":
      return "Aucune offre pour le moment.";
    case "informations":
      return "Aucune information envoyée pour le moment.";
    case "suivis":
      return "Aucun suivi envoyé pour le moment.";
    case "enquetes":
      return "Aucune enquête envoyée pour le moment.";
    case "factures":
      return "Aucune facture envoyée pour le moment.";
    case "devis":
      return "Aucun devis envoyé pour le moment.";
    default:
      return "Aucun mail pour le moment.";
  }
}

export function folderLabel(f: Folder) {
  switch (f) {
    case "mails":
      return "Mails";
    case "factures":
      return "Factures";
    case "devis":
      return "Devis";
    // Booster (actions: Publier / Récolter / Offrir)
    case "publications":
      return "Publications";
    case "recoltes":
      return "Récoltes";
    case "offres":
      return "Offres";
    // Fidéliser (actions: Informer / Suivre / Enquêter)
    case "informations":
      return "Informations";
    case "suivis":
      return "Suivis";
    case "enquetes":
      return "Enquêtes";
  }
}

export type BoxView = "sent" | "drafts";

export function isVisibleInFolder(folder: Folder, item: OutboxItem, view: BoxView) {
  if (item.folder !== folder) return false;

  // Brouillons : uniquement pour l'historique send_items.
  if (view === "drafts") return item.source === "send_items" && item.status === "draft";

  // Vue principale: uniquement les éléments réellement "envoyés" (ou en erreur), jamais les drafts.
  return item.status !== "draft";
}

export function pill(provider?: string | null) {
  const p = (provider || "").toLowerCase();
  if (p === "gmail") return { label: "Gmail", cls: styles.badgeGmail };
  if (p === "microsoft") return { label: "Microsoft", cls: styles.badgeMicrosoft };
  if (p === "imap") return { label: "IMAP", cls: styles.badgeImap };
  return { label: provider || "Mail", cls: styles.badgeDefault };
}

export function campaignCounts(raw: any) {
  return {
    total: Math.max(0, Number(raw?.total_count || 0) || 0),
    queued: Math.max(0, Number(raw?.queued_count || 0) || 0),
    processing: Math.max(0, Number(raw?.processing_count || 0) || 0),
    sent: Math.max(0, Number(raw?.sent_count || 0) || 0),
    failed: Math.max(0, Number(raw?.failed_count || 0) || 0),
  };
}

export function formatCampaignProgress(raw: any) {
  const counts = campaignCounts(raw);
  const bits = [`${counts.sent}/${counts.total || counts.sent} envoyés`];
  if (counts.processing > 0) bits.push(`${counts.processing} en cours`);
  if (counts.queued > 0) bits.push(`${counts.queued} en attente`);
  if (counts.failed > 0) bits.push(`${counts.failed} en échec`);
  return bits.join(" • ");
}


export function applyCampaignRecipientsFilter(query: any, filter: CampaignRecipientsFilterId) {
  switch (filter) {
    case "sent":
      return query.eq("status", "sent");
    case "delivered":
      return query.eq("delivery_status", "delivered");
    case "queued":
      return query.eq("status", "queued");
    case "processing":
      return query.eq("status", "processing");
    case "failed":
      return query.eq("status", "failed");
    case "blocked":
      return query.eq("status", "failed").not("suppression_reason", "is", null);
    case "opt_out":
      return query.eq("suppression_reason", "opt_out");
    case "blacklist":
      return query.eq("suppression_reason", "blacklist");
    case "complaint":
      return query.eq("suppression_reason", "complaint");
    case "hard_bounce":
      return query.eq("suppression_reason", "hard_bounce");
    case "soft_bounce":
      return query.eq("status", "failed").eq("bounce_type", "soft");
    default:
      return query;
  }
}

export function formatCampaignFilterLabel(filter: CampaignRecipientsFilterId) {
  switch (filter) {
    case "sent":
      return "Envoyés";
    case "delivered":
      return "Délivrés";
    case "queued":
      return "En attente";
    case "processing":
      return "En cours";
    case "failed":
      return "Échecs";
    case "blocked":
      return "Bloqués";
    case "opt_out":
      return "Désinscrits";
    case "blacklist":
      return "Blacklist";
    case "complaint":
      return "Plaintes";
    case "hard_bounce":
      return "Rebonds durs";
    case "soft_bounce":
      return "Rebonds souples";
    default:
      return "Tous";
  }
}

export function getCampaignRecipientStatusLabel(recipient: CampaignRecipientLog) {
  if (recipient.status === "sent") {
    if (recipient.unsubscribed_at) {
      return `Envoyé • désinscrit le ${new Date(recipient.unsubscribed_at).toLocaleString()}`;
    }
    if (recipient.delivery_status === "delivered" && recipient.delivered_at) {
      return `Délivré • ${new Date(recipient.delivered_at).toLocaleString()}`;
    }
    if (recipient.delivery_status === "accepted") {
      return recipient.sent_at ? `Envoyé au provider • ${new Date(recipient.sent_at).toLocaleString()}` : "Envoyé au provider";
    }
    if (recipient.sent_at) {
      return `Envoyé • ${new Date(recipient.sent_at).toLocaleString()}`;
    }
    return "Envoyé";
  }

  if (recipient.status === "failed") {
    if (recipient.suppression_reason === "opt_out") return "Bloqué • désinscription";
    if (recipient.suppression_reason === "blacklist") return "Bloqué • blacklist";
    if (recipient.suppression_reason === "hard_bounce") return "Bloqué • rebond dur";
    if (recipient.suppression_reason === "complaint") return "Bloqué • plainte spam";
    if (recipient.bounce_type === "hard") return "Échec final • rebond dur";
    if (recipient.bounce_type === "soft") return "Échec final • rebond souple";
    return "Échec final";
  }

  if (recipient.status === "processing") return "En cours";
  if (recipient.next_attempt_at) {
    return `En attente • prochain essai ${new Date(recipient.next_attempt_at).toLocaleString()}`;
  }
  return "En attente";
}


export function formatOutboxStatusLabel(item: OutboxItem) {
  if (item.source === "mail_campaigns") {
    const raw = (item.raw || {}) as any;
    const status = String(raw?.status || item.status || "").toLowerCase();
    const counts = campaignCounts(raw);
    if (status === "queued") return `En attente • ${formatCampaignProgress(raw)}`;
    if (status === "processing") return `Campagne en cours • ${formatCampaignProgress(raw)}`;
    if (status === "paused") return raw?.last_error ? `Campagne en pause • ${raw.last_error}` : `Campagne en pause • ${formatCampaignProgress(raw)}`;
    if (status === "partial") return `Campagne partielle • ${formatCampaignProgress(raw)}`;
    if (status === "failed") return `Campagne en échec • ${counts.failed}/${counts.total || counts.failed} en échec`;
    if (status === "sent" || status === "completed") return item.sent_at ? `Campagne terminée • ${new Date(item.sent_at).toLocaleString()}` : `Campagne terminée • ${formatCampaignProgress(raw)}`;
    return `Campagne • ${formatCampaignProgress(raw)}`;
  }

  if (item.status === "draft") return "Brouillon";
  if (item.status === "error" || item.status === "failed") return "En échec";
  return item.sent_at ? `Envoyé • ${new Date(item.sent_at).toLocaleString()}` : `Historique • ${new Date(item.created_at).toLocaleString()}`;
}

export function isRetryableCampaignItem(item: OutboxItem | null) {
  if (!item || item.source !== "mail_campaigns") return false;
  const counts = campaignCounts((item.raw || {}) as any);
  return counts.failed > 0;
}

export function canDeleteHistoryItem(item: OutboxItem | null | undefined) {
  if (!item) return false;
  if (item.status === "draft") return false;
  return item.source === "send_items" || item.source === "mail_campaigns" || item.source === "app_events";
}

export function canBulkDeleteHistoryItem(item: OutboxItem | null | undefined) {
  if (!item) return false;
  return item.source === "send_items" || item.source === "mail_campaigns" || item.source === "app_events";
}

export function historySelectionKey(item: Pick<OutboxItem, "id" | "source">) {
  return `${item.source}:${item.id}`;
}

export function listGridTemplateColumns(folder: Folder) {
  if (folder === "factures" || folder === "devis") {
    return "minmax(0, 520px) minmax(180px, 240px) auto";
  }
  if (folder === "publications") {
    return "minmax(0, 360px) minmax(240px, 1fr) auto";
  }
  return "minmax(0, 380px) minmax(180px, 280px) auto";
}

