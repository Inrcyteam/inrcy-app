"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./mails.module.css";
import Image from "next/image";
import SettingsDrawer from "../SettingsDrawer";
import HelpButton from "../_components/HelpButton";
import HelpModal from "../_components/HelpModal";
import MailsSettingsContent from "../settings/_components/MailsSettingsContent";
import { createClient } from "@/lib/supabaseClient";
import ResponsiveActionButton from "../_components/ResponsiveActionButton";
import { ChannelImageRetouchCardsPanel, ChannelImageRetouchModal } from "@/app/dashboard/_components/ChannelImageRetouchTool";
import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import { PROFILE_VERSION_EVENT, type ProfileVersionChangeDetail } from "@/lib/profileVersioning";
import { normalizeRecipientEmails, type MailCampaignRecipientInput } from "@/lib/crmRecipients";


const pillBtn: React.CSSProperties = {
  minHeight: 38,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.03)",
  color: "inherit",
  padding: "0 14px",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const pillBtnActive: React.CSSProperties = {
  border: "1px solid rgba(76,195,255,0.45)",
  boxShadow: "0 0 0 1px rgba(76,195,255,0.18) inset",
  background: "rgba(76,195,255,0.10)",
};

const MAILBOX_PAGE_SIZE = 20;
const MAILBOX_RECIPIENTS_PAGE_SIZE = 20;

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

function applySignaturePreview(text: string, signature: string): string {
  const base = String(text || "").trimEnd();
  const sig = String(signature || "").trim();
  if (!sig) return base;
  if (!base) return sig;
  if (base.replace(/\r\n/g, "\n").trim().endsWith(sig.replace(/\r\n/g, "\n").trim())) return base;
  return `${base}\n\n${sig}`;
}

function buildDefaultMailText(opts: { kind: SendType; name?: string; docRef?: string; signature?: string }): string {
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
type Folder =
  | "mails"
  | "factures"
  | "devis"
  | "publications"
  | "recoltes"
  | "offres"
  | "informations"
  | "suivis"
  | "enquetes";

const ALL_FOLDERS: Folder[] = [
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

function isFolderValue(value: string): value is Folder {
  return (ALL_FOLDERS as string[]).includes(value);
}

function folderFromTrack(trackKind: string | null | undefined, trackType: string | null | undefined, fallback: Folder = "mails"): Folder {
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

function defaultFolderFromSendType(type: SendType | string | null | undefined): Folder {
  if (type === "facture") return "factures";
  if (type === "devis") return "devis";
  return "mails";
}

function resolveCampaignFolder(raw: any): Folder {
  const explicit = String(raw?.folder || "").toLowerCase();
  if (isFolderValue(explicit)) return explicit;
  const tracked = folderFromTrack(raw?.track_kind, raw?.track_type, defaultFolderFromSendType(raw?.type));
  return tracked;
}

function campaignTitleFromFolder(folder: Folder, subject: string) {
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

function isBusinessMailFolder(folder: Folder) {
  return folder === "recoltes" || folder === "offres" || folder === "informations" || folder === "suivis" || folder === "enquetes";
}

// Typage historique d'envoi (ancienne table send_items)
type SendType = "mail" | "facture" | "devis";
type Status = "draft" | "sent" | "error" | "queued" | "processing" | "partial" | "failed";

type MailAccount = {
  id: string;
  provider: "gmail" | "microsoft" | "imap";
  email_address: string;
  display_name: string | null;
  status: string;
};

const MAIL_ACCOUNTS_UPDATED_EVENT = "inrsend:mail-accounts-updated";

type ComposeAttachmentRef = {
  bucket: string;
  path: string;
  name: string;
  type?: string | null;
  size?: number | null;
};

type ComposeCrmRecipientHint = MailCampaignRecipientInput;

type CampaignRecipientLog = {
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
};

type SendItem = {
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

type OutboxItem = {
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

type PublicationParts = {
  title?: string | null;
  content?: string | null;
  cta?: string | null;
  hashtags?: string[];
  attachments?: { name: string; type?: string | null; size?: number | null; url?: string | null }[];
};

type ChannelPublication = {
  key: string;
  label: string;
  parts: PublicationParts;
};

type PublicationEditForm = {
  title: string;
  content: string;
  cta: string;
  hashtags: string;
};

type EditablePublicationAttachment = {
  name: string;
  type?: string | null;
  size?: number | null;
  url?: string | null;
};

type PublicationImageFitMode = "contain" | "cover";
type PublicationImageBackgroundMode = "blur" | "transparent" | "color" | "white" | "black" | "gray" | "sand" | "brand";
type PublicationDesignPosition = "top" | "center" | "bottom";
type PublicationImageDesign = { enabled: boolean; text: string; color: string; background: string; position: PublicationDesignPosition; size: number; x?: number; y?: number; };

type PublicationImageTransform = {
  fit: PublicationImageFitMode;
  zoom: number;
  offsetX: number;
  offsetY: number;
  blurBackground: boolean;
  backgroundMode?: PublicationImageBackgroundMode;
  backgroundColor?: string;
  design?: PublicationImageDesign;
};

type PublicationImageAsset = {
  key: string;
  name: string;
  type: string;
  previewUrl: string;
  sourceUrl: string | null;
  file: File | null;
  selected: boolean;
  transform: PublicationImageTransform;
};

type PublicationChannelImagesState = {
  assets: PublicationImageAsset[];
};

type PublicationImageRenderPreset = {
  width: number;
  height: number;
  defaultFit: PublicationImageFitMode;
  defaultBlurBackground: boolean;
};

type PublicationPreviewLayout = {
  drawW: number;
  drawH: number;
  dx: number;
  dy: number;
};

const DEFAULT_PUBLICATION_DESIGN: PublicationImageDesign = { enabled: false, text: "", color: "#ffffff", background: "#111827", position: "bottom", size: 30, x: 50, y: 88 };

const PUBLICATION_CHANNEL_PRESETS: Record<string, PublicationImageRenderPreset> = {
  inrcy_site: { width: 1440, height: 900, defaultFit: "contain", defaultBlurBackground: true },
  site_web: { width: 1440, height: 900, defaultFit: "contain", defaultBlurBackground: true },
  gmb: { width: 1200, height: 900, defaultFit: "contain", defaultBlurBackground: true },
  facebook: { width: 1200, height: 1200, defaultFit: "cover", defaultBlurBackground: false },
  instagram: { width: 1080, height: 1350, defaultFit: "cover", defaultBlurBackground: false },
  linkedin: { width: 1200, height: 1200, defaultFit: "cover", defaultBlurBackground: false },
};

function publicationClamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getPublicationChannelPreset(channel: string): PublicationImageRenderPreset {
  return PUBLICATION_CHANNEL_PRESETS[normalizeChannelKey(channel)] || { width: 1200, height: 900, defaultFit: "contain", defaultBlurBackground: true };
}

function buildPublicationDefaultTransform(channel: string): PublicationImageTransform {
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

function getPublicationBackgroundMode(transform: PublicationImageTransform): PublicationImageBackgroundMode {
  if (transform.backgroundMode) return transform.backgroundMode;
  return transform.blurBackground ? "blur" : "black";
}

function withPublicationBackgroundMode(transform: PublicationImageTransform, backgroundMode: PublicationImageBackgroundMode): PublicationImageTransform {
  return {
    ...transform,
    backgroundMode,
    blurBackground: backgroundMode === "blur",
  };
}

function getPublicationBackgroundFill(mode: PublicationImageBackgroundMode, backgroundColor?: string): string {
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

function getPublicationDesign(transform: PublicationImageTransform): PublicationImageDesign {
  const design = { ...DEFAULT_PUBLICATION_DESIGN, ...(transform.design || {}) };
  if (typeof design.x !== "number") design.x = 50;
  if (typeof design.y !== "number") design.y = design.position === "top" ? 12 : design.position === "center" ? 50 : 88;
  return design;
}

function drawPublicationDesignOverlay(ctx: CanvasRenderingContext2D, cw: number, ch: number, transform: PublicationImageTransform) {
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

function isPublicationTransformModified(transform: PublicationImageTransform, channel: string): boolean {
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

function computePublicationPreviewLayout(params: {
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

function offsetFromPublicationDrawPosition(params: {
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

function makePublicationImageAssetKey(prefix: string, name: string, suffix: string) {
  return `${prefix}:${name}:${suffix}`;
}

function loadPublicationHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Impossible de charger l'image."));
    img.src = src;
  });
}

async function renderPublicationImageAsset(params: {
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

function splitList(v?: string | null): string[] {
  if (!v) return [];
  return String(v)
    .split(/[;,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function firstNonEmpty(...vals: any[]) {
  for (const v of vals) {
    const s = typeof v === "string" ? v.trim() : "";
    if (s) return s;
  }
  return "";
}

function extractChannelsFromPayload(payload: any): string[] {
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

function extractAttachmentsFromPayload(payload: any): { name: string; type?: string | null; size?: number | null; url?: string | null }[] {
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


function hasAttachmentFields(payload: any): boolean {
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

function extractPublicationParts(payload: any): PublicationParts {
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

function normalizeChannelKey(channel: string): string {
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

function formatChannelLabel(channel: string): string {
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

function channelApiPath(channel: string): string {
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

function isDeletedChannelResult(result: any): boolean {
  if (!result || typeof result !== "object") return false;
  return result.deleted === true || String(result.status || "").toLowerCase() === "deleted";
}

function orderChannelKeys(channels: string[]): string[] {
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

function extractPublicationResults(payload: any): Record<string, any> {
  return payload?.results && typeof payload.results === "object" ? payload.results : {};
}

function isFailedChannelResult(result: any): boolean {
  if (!result || typeof result !== "object") return false;
  if (isDeletedChannelResult(result)) return false;
  if (result.ok === false) return true;
  const status = String(result.status || "").toLowerCase();
  return status === "failed" || status === "error";
}

function getChannelIndicatorMeta(result: any): { kind: "failed" | "deleted"; title: string; className: string } | null {
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

function getFailedChannelMessage(result: any): string {
  if (!isFailedChannelResult(result)) return "";
  const message = result?.error ?? result?.message ?? result?.last_error ?? "";
  return typeof message === "string" ? message.trim() : String(message || "").trim();
}

function getPublicationChannelStatuses(payload: any, fallbackChannels: string[] = []) {
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

function renderPublicationChannelsWithFailures(payload: any, fallbackChannels: string[] = []) {
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

function extractChannelPublications(payload: any): ChannelPublication[] {
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

function tagsToEditorString(tags?: string[]): string {
  return Array.isArray(tags) ? tags.map((tag) => String(tag || "").trim().replace(/^#/, "")).filter(Boolean).join(" ") : "";
}

function isImageAttachment(att: { name: string; type?: string | null; url?: string | null }): boolean {
  const type = String(att.type || "").toLowerCase();
  const raw = String(att.url || att.name || "").toLowerCase().split("?")[0];
  return type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/.test(raw);
}

function isVideoAttachment(att: { name: string; type?: string | null; url?: string | null }): boolean {
  const type = String(att.type || "").toLowerCase();
  const raw = String(att.url || att.name || "").toLowerCase().split("?")[0];
  return type.startsWith("video/") || /\.(mp4|mov|webm|ogg|m4v)$/.test(raw);
}

function folderTheme(f: Folder): React.CSSProperties {
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

function toolbarActionTheme(f: Folder): React.CSSProperties {
  const base = folderTheme(f) as React.CSSProperties & Record<string, string>;
  return {
    ["--toolbar-cta-start" as any]: String(base["--folder-accent-start"] || "rgba(56,189,248,0.26)"),
    ["--toolbar-cta-end" as any]: String(base["--folder-accent-end"] || "rgba(167,139,250,0.22)"),
    ["--toolbar-cta-glow" as any]: String(base["--folder-accent-glow"] || "rgba(56,189,248,0.16)"),
    ["--toolbar-cta-border" as any]: String(base["--folder-accent-border"] || "rgba(56,189,248,0.42)"),
  } as React.CSSProperties;
}


function folderLabel(f: Folder) {
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

type BoxView = "sent" | "drafts";

function isVisibleInFolder(folder: Folder, item: OutboxItem, view: BoxView) {
  if (item.folder !== folder) return false;

  // Brouillons : uniquement pour l'historique send_items.
  if (view === "drafts") return item.source === "send_items" && item.status === "draft";

  // Vue principale: uniquement les éléments réellement "envoyés" (ou en erreur), jamais les drafts.
  return item.status !== "draft";
}

function pill(provider?: string | null) {
  const p = (provider || "").toLowerCase();
  if (p === "gmail") return { label: "Gmail", cls: styles.badgeGmail };
  if (p === "microsoft") return { label: "Microsoft", cls: styles.badgeMicrosoft };
  if (p === "imap") return { label: "IMAP", cls: styles.badgeImap };
  return { label: provider || "Mail", cls: styles.badgeDefault };
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

function formatCampaignProgress(raw: any) {
  const counts = campaignCounts(raw);
  const bits = [`${counts.sent}/${counts.total || counts.sent} envoyés`];
  if (counts.processing > 0) bits.push(`${counts.processing} en cours`);
  if (counts.queued > 0) bits.push(`${counts.queued} en attente`);
  if (counts.failed > 0) bits.push(`${counts.failed} en échec`);
  return bits.join(" • ");
}

function formatOutboxStatusLabel(item: OutboxItem) {
  if (item.source === "mail_campaigns") {
    const raw = (item.raw || {}) as any;
    const status = String(raw?.status || item.status || "").toLowerCase();
    const counts = campaignCounts(raw);
    if (status === "queued") return `En attente • ${formatCampaignProgress(raw)}`;
    if (status === "processing") return `Campagne en cours • ${formatCampaignProgress(raw)}`;
    if (status === "partial") return `Campagne partielle • ${formatCampaignProgress(raw)}`;
    if (status === "failed") return `Campagne en échec • ${counts.failed}/${counts.total || counts.failed} en échec`;
    if (status === "sent") return item.sent_at ? `Campagne terminée • ${new Date(item.sent_at).toLocaleString()}` : `Campagne terminée • ${formatCampaignProgress(raw)}`;
    return `Campagne • ${formatCampaignProgress(raw)}`;
  }

  if (item.status === "draft") return "Brouillon";
  if (item.status === "error" || item.status === "failed") return "En échec";
  return item.sent_at ? `Envoyé • ${new Date(item.sent_at).toLocaleString()}` : `Historique • ${new Date(item.created_at).toLocaleString()}`;
}

function isRetryableCampaignItem(item: OutboxItem | null) {
  if (!item || item.source !== "mail_campaigns") return false;
  const counts = campaignCounts((item.raw || {}) as any);
  return counts.failed > 0;
}

function listGridTemplateColumns(folder: Folder) {
  if (folder === "factures" || folder === "devis") {
    return "minmax(0, 520px) minmax(180px, 240px) auto";
  }
  if (folder === "publications") {
    return "minmax(0, 360px) minmax(240px, 1fr) auto";
  }
  return "minmax(0, 380px) minmax(180px, 280px) auto";
}

export default function MailboxClient() {
  const [helpOpen, setHelpOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const [mobileFoldersOpen, setMobileFoldersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [folder, setFolder] = useState<Folder>("mails");
  const [boxView, setBoxView] = useState<BoxView>("sent");
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageRef = useRef(1);
  const [historyHasMorePotential, setHistoryHasMorePotential] = useState(false);
  const [historyTotalCount, setHistoryTotalCount] = useState<number | null>(null);

  // Détails : ouverture en double-clic dans une fenêtre au-dessus (modal)
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [detailsChannelKey, setDetailsChannelKey] = useState<string | null>(null);
  const [detailsEditMode, setDetailsEditMode] = useState(false);
  const [detailsActionBusy, setDetailsActionBusy] = useState(false);
  const [detailsActionError, setDetailsActionError] = useState<string | null>(null);
  const [detailsSourceDocPayload, setDetailsSourceDocPayload] = useState<any | null>(null);
  const [campaignRecipients, setCampaignRecipients] = useState<CampaignRecipientLog[]>([]);
  const [campaignRecipientsLoading, setCampaignRecipientsLoading] = useState(false);
  const [campaignRecipientsPage, setCampaignRecipientsPage] = useState(1);
  const [campaignRecipientsPageCount, setCampaignRecipientsPageCount] = useState(1);
  const [campaignRecipientsTotal, setCampaignRecipientsTotal] = useState(0);
  const [campaignActionBusyId, setCampaignActionBusyId] = useState<string | null>(null);
  const [publicationEditForm, setPublicationEditForm] = useState<PublicationEditForm>({ title: "", content: "", cta: "", hashtags: "" });
  const [publicationEditImagesByChannel, setPublicationEditImagesByChannel] = useState<Record<string, PublicationChannelImagesState>>({});
  const [publicationRetouchChannelKey, setPublicationRetouchChannelKey] = useState<string | null>(null);
  const [publicationRetouchImageKey, setPublicationRetouchImageKey] = useState<string | null>(null);
  const publicationRetouchDragRef = useRef<{ channel: string; imageKey: string; startX: number; startY: number; startOffsetX: number; startOffsetY: number } | null>(null);
  const publicationRetouchStageRef = useRef<HTMLDivElement | null>(null);
  const [publicationRetouchStageSize, setPublicationRetouchStageSize] = useState({ width: 0, height: 0 });
  const [publicationRetouchImageMeta, setPublicationRetouchImageMeta] = useState<Record<string, { width: number; height: number }>>({});
  const [isPublicationRetouchDragging, setIsPublicationRetouchDragging] = useState(false);

  const publicationRetouchChannelState = publicationRetouchChannelKey
    ? publicationEditImagesByChannel[publicationRetouchChannelKey] || { assets: [] }
    : null;
  const publicationRetouchAsset =
    publicationRetouchChannelState?.assets.find((asset) => asset.key === publicationRetouchImageKey) || null;

  useEffect(() => {
    historyPageRef.current = historyPage;
  }, [historyPage]);

  useEffect(() => {
    if (!detailsOpen || !detailsEditMode || !publicationRetouchAsset) return;
    const key = publicationRetouchAsset.key;
    if (publicationRetouchImageMeta[key]) return;
    let cancelled = false;
    const image = new window.Image();
    image.onload = () => {
      if (cancelled) return;
      setPublicationRetouchImageMeta((prev) => ({
        ...prev,
        [key]: {
          width: image.naturalWidth || image.width || 0,
          height: image.naturalHeight || image.height || 0,
        },
      }));
    };
    image.src = publicationRetouchAsset.previewUrl;
    return () => {
      cancelled = true;
    };
  }, [detailsOpen, detailsEditMode, publicationRetouchAsset?.key, publicationRetouchAsset?.previewUrl, publicationRetouchImageMeta]);

  useEffect(() => {
    if (!detailsOpen || !detailsEditMode || !publicationRetouchAsset || !publicationRetouchStageRef.current) return;
    const node = publicationRetouchStageRef.current;
    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      setPublicationRetouchStageSize({ width: rect.width, height: rect.height });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    window.addEventListener("resize", updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, [detailsOpen, detailsEditMode, publicationRetouchAsset?.key]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyTouchAction = body.style.touchAction;

    if (detailsOpen) {
      html.style.overflow = "hidden";
      body.style.overflow = "hidden";
      body.style.touchAction = "none";
    }

    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.touchAction = previousBodyTouchAction;
    };
  }, [detailsOpen]);

  const [mailAccounts, setMailAccounts] = useState<MailAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [filterAccountId, setFilterAccountId] = useState<string>("");

  // Compose
  const [composeOpen, setComposeOpen] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [composeType, setComposeType] = useState<SendType>("mail");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [composeAttachments, setComposeAttachments] = useState<ComposeAttachmentRef[]>([]);
  const [composeRecipientHints, setComposeRecipientHints] = useState<ComposeCrmRecipientHint[]>([]);
  const [attachBusy, setAttachBusy] = useState(false);
  const [composeSourceDocSaveId, setComposeSourceDocSaveId] = useState<string>("");
  const [composeSourceDocType, setComposeSourceDocType] = useState<"devis" | "facture" | "">("");
  const [composeSourceDocNumber, setComposeSourceDocNumber] = useState<string>("");
  const [sendBusy, setSendBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [signaturePreview, setSignaturePreview] = useState("Cordialement,");
  const [signatureEnabled, setSignatureEnabled] = useState(true);
  const [signatureImageUrl, setSignatureImageUrl] = useState("");
  const [signatureImageWidth, setSignatureImageWidth] = useState(400);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);


  // Attachments uploaded by Factures / Devis screens are stored here.
  const ATTACH_BUCKET = "inrbox_attachments";
  const lastAttachKeyRef = useRef<string>("");

  // Optional tracking intent passed by Booster / Fidéliser templates.
  // iNr'Send must only count items that are actually SENT.
  type PendingTrack = {
    kind: "booster" | "fideliser";
    type: string;
    payload: Record<string, any>;
  };
  const [pendingTrack, setPendingTrack] = useState<PendingTrack | null>(null);

  // CRM selection (compose)
  type CrmContact = {
    id: string;
    full_name: string | null;
    email: string | null;
    category: "particulier" | "professionnel" | "collectivite_publique" | null;
    contact_type: "client" | "prospect" | "fournisseur" | "partenaire" | "autre" | null;
    important: boolean;
  };

  const [crmContacts, setCrmContacts] = useState<CrmContact[]>([]);
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmFilter, setCrmFilter] = useState("");
  const [crmSearchOpen, setCrmSearchOpen] = useState(false);
  const crmSearchRef = useRef<HTMLInputElement | null>(null);
  const [crmError, setCrmError] = useState<string | null>(null);
  const [crmPickerOpen, setCrmPickerOpen] = useState(false);
  const [crmCategory, setCrmCategory] = useState<"all" | CrmContact["category"]>("all");
  const [crmContactType, setCrmContactType] = useState<"all" | CrmContact["contact_type"]>("all");
  const [crmImportantOnly, setCrmImportantOnly] = useState(false);

  // Used to trigger the hidden file input with a nice button
  const fileInputId = "inrsend-attachments";
  const publicationEditFileInputId = "inrsend-publication-edit-attachments";

  function itemMailAccountId(it: OutboxItem): string {
    try {
      if (it.source === "send_items" || it.source === "mail_campaigns") return String((it.raw as any)?.integration_id || "");
      const payload = (it.raw as any)?.payload || (it.raw as any)?.raw?.payload || (it.raw as any)?.meta || {};
      return String((payload as any)?.integration_id || (payload as any)?.mailAccountId || (payload as any)?.accountId || "");
    } catch {
      return "";
    }
  }

  function normalizeEmails(v: string) {
    return normalizeRecipientEmails(v);
  }

  function normalizeComposeRecipientHints(input: unknown): ComposeCrmRecipientHint[] {
    const values = Array.isArray(input) ? input : [];
    const out: ComposeCrmRecipientHint[] = [];
    const seen = new Set<string>();

    for (const item of values) {
      if (!item || typeof item !== "object") continue;
      const email = String((item as any).email || "").trim();
      if (!email) continue;
      const lower = email.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      const contactId = String((item as any).contact_id || "").trim();
      const displayName = String((item as any).display_name || "").trim();
      out.push({
        email,
        contact_id: contactId || null,
        display_name: displayName || null,
      });
    }

    return out;
  }

  function toggleEmailInTo(email: string) {
    const list = normalizeEmails(to);
    const lower = email.toLowerCase();
    const exists = list.some((x) => x.toLowerCase() === lower);
    const next = exists ? list.filter((x) => x.toLowerCase() !== lower) : [...list, email];
    setTo(next.join(", "));
  }

  function makeAttachmentPath(fileName: string) {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "-");
    const rand = Math.random().toString(36).slice(2, 10);
    return `mail-attachments/${Date.now()}-${rand}-${safeName}`;
  }

  async function uploadComposeFiles(nextFiles: File[]) {
    if (!nextFiles.length) return [] as ComposeAttachmentRef[];
    setAttachBusy(true);
    try {
      const uploaded: ComposeAttachmentRef[] = [];
      for (const file of nextFiles) {
        const path = makeAttachmentPath(file.name || "piece-jointe");
        const { error } = await supabase.storage.from(ATTACH_BUCKET).upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });
        if (error) throw error;
        uploaded.push({
          bucket: ATTACH_BUCKET,
          path,
          name: file.name || "piece-jointe",
          type: file.type || "application/octet-stream",
          size: file.size || null,
        });
      }
      return uploaded;
    } finally {
      setAttachBusy(false);
    }
  }


  // Recherche dans l'historique iNr'Send
  const [historyQuery, setHistoryQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const historySearchRef = useRef<HTMLInputElement | null>(null);

  const filteredContacts = useMemo(() => {
    const q = crmFilter.trim().toLowerCase();
    return crmContacts.filter((c) => {
      if (crmImportantOnly && !c.important) return false;
      if (crmCategory !== "all" && c.category !== crmCategory) return false;
      if (crmContactType !== "all" && c.contact_type !== crmContactType) return false;
      if (!q) return true;
      const hay = `${c.full_name || ""} ${c.email || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [crmContacts, crmFilter, crmImportantOnly, crmCategory, crmContactType]);

  const selectedToSet = useMemo(() => {
    return new Set(normalizeEmails(to).map((e) => e.toLowerCase()));
  }, [to]);

  const selectedCrmCount = useMemo(() => {
    let n = 0;
    for (const c of crmContacts) {
      if (c.email && selectedToSet.has(String(c.email).toLowerCase())) n += 1;
    }
    return n;
  }, [crmContacts, selectedToSet]);

  const crmRecipientsByEmail = useMemo(() => {
    const map = new Map<string, ComposeCrmRecipientHint>();
    for (const contact of crmContacts) {
      const email = String(contact.email || "").trim();
      if (!email) continue;
      const lower = email.toLowerCase();
      if (map.has(lower)) continue;
      map.set(lower, {
        email,
        contact_id: contact.id,
        display_name: (contact.full_name || "").trim() || null,
      });
    }
    return map;
  }, [crmContacts]);

  const composeRecipientHintsByEmail = useMemo(() => {
    const map = new Map<string, ComposeCrmRecipientHint>();
    for (const hint of composeRecipientHints) {
      const email = String(hint.email || "").trim();
      if (!email) continue;
      map.set(email.toLowerCase(), {
        email,
        contact_id: hint.contact_id || null,
        display_name: hint.display_name || null,
      });
    }
    return map;
  }, [composeRecipientHints]);

  const counts = useMemo(() => {
    const c: Record<Folder, number> = {
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
    for (const it of items) {
      // Les compteurs en haut représentent les ENVOIS.
      // Donc: jamais les brouillons.
      if (it.status === "draft") continue;
      c[it.folder] += 1;
    }
    return c;
  }, [items]);

  function resetCompose(nextType: SendType = "mail") {
    setDraftId(null);
    setComposeType(nextType);
    setComposeSourceDocSaveId("");
    setComposeSourceDocType("");
    setComposeSourceDocNumber("");
    setTo("");
    setSubject("");
    const signature = signatureEnabled ? signaturePreview : "";
    setText(buildDefaultMailText({ kind: nextType, signature }));
    setFiles([]);
    setComposeAttachments([]);
    setComposeRecipientHints([]);
    setCrmPickerOpen(false);
  }

  async function loadAccounts() {
    const res = await fetch("/api/integrations/status", { cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return;

    // Backward/forward compatibility:
    // - new API returns { mailAccounts }
    // - older API could return { accounts }
    const accounts = Array.isArray(j?.mailAccounts)
      ? (j.mailAccounts as any[])
      : Array.isArray(j?.accounts)
        ? (j.accounts as any[]).filter((a) => a?.category === "mail")
        : [];

    setMailAccounts(accounts as any);

    const connected = accounts.filter((a) => a.status === "connected");
    const defaultId = connected[0]?.id || accounts[0]?.id || "";
    const accountIds = new Set(accounts.map((a) => String(a?.id || "")).filter(Boolean));

    setSelectedAccountId((prev) => (prev && accountIds.has(prev) ? prev : defaultId));
    setFilterAccountId((prev) => (prev && accountIds.has(prev) ? prev : ""));
  }

  async function loadSignature() {
    try {
      const res = await fetch("/api/inrsend/signature", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setSignatureEnabled(j?.enabled !== false);
      setSignaturePreview(String(j?.preview || "").trim() || "Cordialement,");
      setSignatureImageUrl(String(j?.imageUrl || ""));
      setSignatureImageWidth(Number(j?.imageWidth || 400) || 400);
    } catch {
      // keep fallback signature
    }
  }

  const loadHistory = useCallback(async (options?: { page?: number }) => {
    const targetPage = Math.max(1, options?.page ?? historyPageRef.current ?? 1);

    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(targetPage));
      params.set("pageSize", String(MAILBOX_PAGE_SIZE));
      params.set("folder", folder);
      params.set("boxView", boxView);
      if (filterAccountId) params.set("filterAccountId", filterAccountId);
      const trimmedQuery = historyQuery.trim();
      if (trimmedQuery) params.set("q", trimmedQuery);

      const response = await fetch(`/api/inrsend/history?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Impossible de charger l’historique iNr’Send.");
      }

      const nextItems = Array.isArray(payload?.items) ? (payload.items as OutboxItem[]) : [];
      const nextTotal = typeof payload?.total === "number" ? Math.max(0, Number(payload.total)) : null;
      const nextPage = typeof payload?.page === "number" ? Math.max(1, Number(payload.page)) : targetPage;

      setItems(nextItems);
      setHistoryPage(nextPage);
      setHistoryHasMorePotential(Boolean(payload?.hasMore));
      setHistoryTotalCount(nextTotal);
      setSelectedId((prev) => (nextItems.some((item) => item.id === prev) ? prev : nextItems[0]?.id ?? null));
    } catch (error) {
      console.error(error);
      setItems([]);
      setHistoryPage(targetPage);
      setHistoryHasMorePotential(false);
      setHistoryTotalCount(0);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }, [boxView, filterAccountId, folder, historyQuery]);

  const filteredItems = items;

  const historyPageCount = useMemo(() => {
    if (historyTotalCount == null) {
      return Math.max(1, historyPage + (historyHasMorePotential ? 1 : 0));
    }
    return Math.max(1, Math.ceil(historyTotalCount / MAILBOX_PAGE_SIZE));
  }, [historyHasMorePotential, historyPage, historyTotalCount]);

  const visibleItems = filteredItems;

  const selected = useMemo(() => {
    return items.find((x) => x.id === selectedId) || null;
  }, [items, selectedId]);


  const detailsItem = useMemo(() => {
    if (!detailsId) return null;
    return items.find((x) => x.id === detailsId) || null;
  }, [items, detailsId]);

  const detailsAccountLabel = useMemo(() => {
    if (!detailsItem) return "";
    const id = itemMailAccountId(detailsItem);
    if (!id) return "";
    const acc = mailAccounts.find((a) => a.id === id);
    if (!acc) return "";
    return (acc.display_name ? `${acc.display_name} — ` : "") + acc.email_address;
  }, [detailsItem, mailAccounts]);

  const detailsPayload = useMemo(() => {
    return detailsItem && detailsItem.source === "app_events" ? (((detailsItem as any)?.raw?.payload || null) as any) : null;
  }, [detailsItem]);

  const loadCampaignRecipients = useCallback(async (campaignId: string, targetPage = campaignRecipientsPage) => {
    if (!campaignId) {
      setCampaignRecipients([]);
      setCampaignRecipientsTotal(0);
      setCampaignRecipientsPageCount(1);
      return;
    }
    setCampaignRecipientsLoading(true);
    try {
      const safePage = Math.max(1, targetPage);
      const from = (safePage - 1) * MAILBOX_RECIPIENTS_PAGE_SIZE;
      const to = from + MAILBOX_RECIPIENTS_PAGE_SIZE - 1;
      const { data, error, count } = await supabase
        .from("mail_campaign_recipients")
        .select("id,email,display_name,status,error,last_error,attempt_count,max_attempts,next_attempt_at,sent_at,updated_at", { count: "exact" })
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw error;
      const total = Math.max(0, Number(count || 0));
      setCampaignRecipients(((data || []) as any[]).map((row: any) => ({
        id: String(row.id || ""),
        email: String(row.email || ""),
        display_name: row.display_name || null,
        status: String(row.status || "queued"),
        error: row.error || null,
        last_error: row.last_error || null,
        attempt_count: row.attempt_count == null ? null : Number(row.attempt_count),
        max_attempts: row.max_attempts == null ? null : Number(row.max_attempts),
        next_attempt_at: row.next_attempt_at || null,
        sent_at: row.sent_at || null,
        updated_at: row.updated_at || null,
      })));
      setCampaignRecipientsTotal(total);
      setCampaignRecipientsPageCount(Math.max(1, Math.ceil(total / MAILBOX_RECIPIENTS_PAGE_SIZE)));
    } catch (error) {
      console.error(error);
      setCampaignRecipients([]);
      setCampaignRecipientsTotal(0);
      setCampaignRecipientsPageCount(1);
    } finally {
      setCampaignRecipientsLoading(false);
    }
  }, [campaignRecipientsPage, supabase]);

  useEffect(() => {
    if (!detailsOpen || !detailsItem || detailsItem.source !== "mail_campaigns") {
      setCampaignRecipients([]);
      setCampaignRecipientsLoading(false);
      setCampaignRecipientsTotal(0);
      setCampaignRecipientsPageCount(1);
      return;
    }
    void loadCampaignRecipients(detailsItem.id, campaignRecipientsPage);
  }, [campaignRecipientsPage, detailsOpen, detailsItem, loadCampaignRecipients]);

  useEffect(() => {
    if (!detailsOpen || !detailsItem || detailsItem.source !== "mail_campaigns") {
      setCampaignRecipientsPage(1);
      return;
    }
    setCampaignRecipientsPage(1);
  }, [detailsItem?.id, detailsItem?.source, detailsOpen]);

  useEffect(() => {
    if (campaignRecipientsPage <= campaignRecipientsPageCount) return;
    setCampaignRecipientsPage(campaignRecipientsPageCount);
  }, [campaignRecipientsPage, campaignRecipientsPageCount]);

  useEffect(() => {
    let cancelled = false;
    if (!detailsOpen || !detailsItem || detailsItem.source !== "send_items") {
      setDetailsSourceDocPayload(null);
      return;
    }

    const saveId = (detailsItem as any)?.raw?.source_doc_save_id;
    const sourceType = (detailsItem as any)?.raw?.source_doc_type;
    if (!saveId || !sourceType) {
      setDetailsSourceDocPayload(null);
      return;
    }

    const loadSourceDocPayload = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setDetailsSourceDocPayload(null);
        return;
      }

      const { data, error } = await supabase
        .from("doc_saves")
        .select("payload")
        .eq("id", saveId)
        .eq("user_id", user.id)
        .eq("type", sourceType)
        .maybeSingle();

      if (!cancelled) {
        setDetailsSourceDocPayload(error ? null : (data?.payload || null));
      }
    };

    void loadSourceDocPayload();
    return () => {
      cancelled = true;
    };
  }, [detailsOpen, detailsItem, supabase]);

  const detailsChannelEntries = useMemo(() => {
    if (!detailsItem || detailsItem.source !== "app_events") return [] as ChannelPublication[];
    const payload = detailsPayload;
    const channelPublications = extractChannelPublications(payload);
    if (channelPublications.length) return channelPublications;
    const defaultParts = extractPublicationParts(payload);
    return orderChannelKeys((detailsItem.channels && detailsItem.channels.length ? detailsItem.channels : [detailsItem.target]).filter(Boolean).map((channel) => String(channel))).map((channel) => ({
      key: channel,
      label: formatChannelLabel(channel),
      parts: defaultParts,
    }));
  }, [detailsItem, detailsPayload]);

  const activeDetailsChannelEntry = useMemo(() => {
    if (!detailsChannelEntries.length) return null;
    return detailsChannelEntries.find((entry) => entry.key === detailsChannelKey) || detailsChannelEntries[0] || null;
  }, [detailsChannelEntries, detailsChannelKey]);

  const activeDetailsChannelResult = useMemo(() => {
    if (!detailsPayload || !activeDetailsChannelEntry) return null;
    const results = detailsPayload?.results && typeof detailsPayload.results === "object" ? detailsPayload.results : {};
    return (results as any)?.[activeDetailsChannelEntry.key] || null;
  }, [detailsPayload, activeDetailsChannelEntry]);

  const activePublicationEditChannelKey = normalizeChannelKey(activeDetailsChannelEntry?.key || "");
  const activePublicationEditPreset = useMemo(() => getPublicationChannelPreset(activePublicationEditChannelKey), [activePublicationEditChannelKey]);
  const activePublicationEditAssets = publicationEditImagesByChannel[activePublicationEditChannelKey]?.assets || [];

  useEffect(() => {
    if (!detailsOpen || !detailsItem || detailsItem.source !== "app_events") return;
    const parts = activeDetailsChannelEntry?.parts || {};
    setPublicationEditForm({
      title: parts.title || "",
      content: parts.content || "",
      cta: parts.cta || "",
      hashtags: tagsToEditorString(parts.hashtags),
    });
    setDetailsEditMode(false);
    setDetailsActionError(null);
  }, [detailsOpen, detailsItem, activeDetailsChannelEntry?.key]);

  useEffect(() => {
    if (!detailsOpen || !detailsItem || detailsItem.source !== "app_events") return;
    const nextState: Record<string, PublicationChannelImagesState> = {};
    for (const entry of detailsChannelEntries) {
      const channel = normalizeChannelKey(entry.key);
      const defaultTransform = buildPublicationDefaultTransform(channel);
      const assets = (Array.isArray(entry.parts.attachments) ? entry.parts.attachments : [])
        .filter((att) => att?.url && isImageAttachment(att))
        .map((att, index) => ({
          key: makePublicationImageAssetKey("existing", att.name || `image-${index + 1}`, `${index}:${String(att.url || "")}`),
          name: att.name || `Image ${index + 1}`,
          type: String(att.type || "image/jpeg") || "image/jpeg",
          previewUrl: String(att.url || ""),
          sourceUrl: String(att.url || "") || null,
          file: null,
          selected: true,
          transform: { ...defaultTransform },
        }));
      nextState[channel] = { assets };
    }
    setPublicationEditImagesByChannel(nextState);
    setPublicationRetouchChannelKey(null);
    setPublicationRetouchImageKey(null);
  }, [detailsOpen, detailsItem?.id, detailsChannelEntries]);

  const selectedAccount = useMemo(() => {
    return mailAccounts.find((a) => a.id === selectedAccountId) || null;
  }, [mailAccounts, selectedAccountId]);

  const composeRecipientList = useMemo(() => normalizeEmails(to), [to]);
  const isBulkCampaignCompose = composeRecipientList.length > 1;

  const toolCfg = useMemo(() => {
    switch (folder) {
      case "mails":
        return { label: "✉️ Envoyer", href: null as string | null };
      case "factures":
        return { label: "📄 Factures", href: "/dashboard/factures/new" };
      case "devis":
        return { label: "🧾 Devis", href: "/dashboard/devis/new" };

      // Booster
      case "publications":
        // Deep-link vers la modale Booster "Publier"
        return { label: "📣 Publier", href: "/dashboard/booster?action=publish" };
      case "recoltes":
        // Deep-link vers la modale Booster "Récolter" (bouton "Demander")
        return { label: "⭐ Récolter", href: "/dashboard/booster?action=reviews" };
      case "offres":
        // Deep-link vers la modale Booster "Offrir" (mail promo)
        return { label: "🏷️ Offrir", href: "/dashboard/booster?action=promo" };

      // Fidéliser
      case "informations":
        // Deep-link vers la modale Fidéliser "Informer"
        return { label: "📰 Informer", href: "/dashboard/fideliser?action=inform" };
      case "suivis":
        // Deep-link vers la modale Fidéliser "Suivre" (thanks)
        return { label: "🤝 Suivre", href: "/dashboard/fideliser?action=thanks" };
      case "enquetes":
        // Deep-link vers la modale Fidéliser "Enquêter" (satisfaction)
        return { label: "😊 Enquêter", href: "/dashboard/fideliser?action=satisfaction" };

      default:
        return { label: "Ouvrir l’outil", href: null as string | null };
    }
  }, [folder]);


  // initial
  useEffect(() => {
    void loadAccounts();
  }, []);

  // refresh des changements de filtres / recherche
  useEffect(() => {
    void loadHistory({ page: 1 });
  }, [loadHistory]);

  useEffect(() => {
    const handleMailAccountsUpdated = async () => {
      await loadAccounts();
      await loadHistory();
    };

    window.addEventListener(MAIL_ACCOUNTS_UPDATED_EVENT, handleMailAccountsUpdated as EventListener);
    return () => window.removeEventListener(MAIL_ACCOUNTS_UPDATED_EVENT, handleMailAccountsUpdated as EventListener);
  }, [loadHistory]);

  useEffect(() => {
    if (!composeOpen) return;
    void loadAccounts();
  }, [composeOpen]);

  // UX recherche: Ctrl/Cmd+K pour ouvrir, Esc pour fermer (sans perdre la saisie)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = (e.key || "").toLowerCase();
      const isK = key === "k";
      const isEsc = key === "escape" || key === "esc";

      if ((e.ctrlKey || e.metaKey) && isK) {
        e.preventDefault();
        setSearchOpen(true);
        // focus après rendu
        requestAnimationFrame(() => historySearchRef.current?.focus());
        return;
      }

      if (isEsc && searchOpen) {
        e.preventDefault();
        setSearchOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    requestAnimationFrame(() => historySearchRef.current?.focus());
  }, [searchOpen]);

  useEffect(() => {
    const handleProfileVersionChange = (event: Event) => {
      const detail = (event as CustomEvent<ProfileVersionChangeDetail>).detail;
      if (!(detail?.field === "docs_version" || detail?.field === "publications_version")) return;
      void loadHistory();
    };

    window.addEventListener(PROFILE_VERSION_EVENT, handleProfileVersionChange as EventListener);
    return () => {
      window.removeEventListener(PROFILE_VERSION_EVENT, handleProfileVersionChange as EventListener);
    };
  }, [loadHistory]);

  // open folder from URL
  useEffect(() => {
    const q = (searchParams?.get("folder") || "").toLowerCase();
    const allowed: Record<string, Folder> = {
      mails: "mails",
      factures: "factures",
      devis: "devis",
      publications: "publications",
      recoltes: "recoltes",
      offres: "offres",
      informations: "informations",
      suivis: "suivis",
      enquetes: "enquetes",
    };
    if (q && allowed[q]) setFolder(allowed[q]);
  }, [searchParams, signatureEnabled, signaturePreview]);

  // Open compose + prefill basic fields from URL params.
  // Used by:
  // - CRM: /dashboard/mails?compose=1&to=...&from=crm
  // - Factures / Devis: /dashboard/mails?compose=1&to=...&attachKey=...&attachName=...
  useEffect(() => {
    const openRaw = (searchParams?.get("compose") || "").toLowerCase();
    const shouldOpen = openRaw !== "0" && openRaw !== "false" && openRaw !== "";
    if (!shouldOpen) return;

    let toParam = safeDecode(searchParams?.get("to") || "").trim();
    const prefillStorage = (searchParams?.get("prefillStorage") || "").toLowerCase();
    let sessionRecipientHints: ComposeCrmRecipientHint[] = [];
    if (!toParam && prefillStorage === "session" && typeof window !== "undefined") {
      try {
        const raw = window.sessionStorage.getItem("inrcy_pending_mail_compose");
        if (raw) {
          const payload = JSON.parse(raw) as { to?: string[] | string; recipients?: unknown; createdAt?: number };
          const ageMs = Date.now() - Number(payload?.createdAt || 0);
          const loaded = Array.isArray(payload?.to) ? payload.to.join(", ") : String(payload?.to || "");
          if (ageMs >= 0 && ageMs <= 10 * 60 * 1000) {
            if (loaded) toParam = loaded.trim();
            sessionRecipientHints = normalizeComposeRecipientHints(payload?.recipients);
          }
        }
      } catch {
        // ignore invalid session payload
      } finally {
        try {
          window.sessionStorage.removeItem("inrcy_pending_mail_compose");
        } catch {}
      }
    }
    const subjParam = safeDecode(searchParams?.get("subject") || "");
    const textParam = safeDecode(searchParams?.get("text") || "");
    const nameParam = safeDecode(
      searchParams?.get("name") || searchParams?.get("clientName") || searchParams?.get("contactName") || ""
    ).trim();
    const contactIdParam = safeDecode(searchParams?.get("contactId") || "").trim();
    const attachKey = safeDecode(searchParams?.get("attachKey") || "").trim();
    const attachName = safeDecode(searchParams?.get("attachName") || "").trim();

    // Determine composer type (optional).
    // If not provided explicitly, we infer it from the attachment path.
    const typeParam = (searchParams?.get("type") || searchParams?.get("sendType") || "").toLowerCase();
    const sourceDocSaveIdParam = safeDecode(searchParams?.get("docSaveId") || searchParams?.get("sourceDocSaveId") || "").trim();
    const sourceDocTypeParam = (safeDecode(searchParams?.get("docType") || searchParams?.get("sourceDocType") || "").trim().toLowerCase());
    const sourceDocNumberParam = safeDecode(searchParams?.get("docNumber") || searchParams?.get("sourceDocNumber") || "").trim();
    let nextType: SendType = "mail";
    if (typeParam === "facture") nextType = "facture";
    else if (typeParam === "devis") nextType = "devis";
    else if (attachKey.includes("/factures/") || attachKey.includes("/facture/")) nextType = "facture";
    else if (attachKey.includes("/devis/")) nextType = "devis";
    setComposeType(nextType);
    setComposeSourceDocSaveId(sourceDocSaveIdParam);
    setComposeSourceDocType(sourceDocTypeParam === "facture" || sourceDocTypeParam === "devis" ? (sourceDocTypeParam as "facture" | "devis") : "");
    setComposeSourceDocNumber(sourceDocNumberParam || (attachName || attachKey.split("/").pop() || "").replace(/\.pdf$/i, ""));

    if (toParam) setTo(toParam);
    if (subjParam) setSubject(subjParam);
    if (textParam) setText(applySignaturePreview(textParam, signatureEnabled ? signaturePreview : ""));

    const urlRecipientHints = !sessionRecipientHints.length && toParam && contactIdParam
      ? normalizeEmails(toParam).map((email, index) => ({
          email,
          contact_id: index === 0 ? contactIdParam : null,
          display_name: index === 0 ? (nameParam || null) : null,
        }))
      : [];
    setComposeRecipientHints(sessionRecipientHints.length ? sessionRecipientHints : urlRecipientHints);

    // If the caller didn't provide a subject/body, we inject a friendly default template.
    // This keeps the connected tools consistent (CRM/Devis/Factures all go through iNr'SEND compose).
    const docRef = (attachName || attachKey.split("/").pop() || "").replace(/\.pdf$/i, "");
    if (!subjParam?.trim()) {
      if (nextType === "facture") setSubject((prev) => (prev?.trim() ? prev : `Envoi de votre facture ${docRef || ""}`.trim()));
      else if (nextType === "devis") setSubject((prev) => (prev?.trim() ? prev : `Envoi de votre devis ${docRef || ""}`.trim()));
      else if (nameParam) setSubject((prev) => (prev?.trim() ? prev : `Message pour ${nameParam}`));
    }
    if (!textParam?.trim()) {
      setText((prev) => (prev?.trim() ? prev : buildDefaultMailText({ kind: nextType, name: nameParam, docRef, signature: signatureEnabled ? signaturePreview : "" })));
    }

    // Open the modal.
    setComposeOpen(true);

    // If we have an attachment key, reference the existing storage object directly.
    // This avoids re-uploading the binary through the mail send endpoint.
    const run = async () => {
      if (!attachKey) return;
      if (lastAttachKeyRef.current === attachKey) return;
      lastAttachKeyRef.current = attachKey;

      const inferredName = attachName || attachKey.split("/").pop() || "document.pdf";
      setComposeAttachments((prev) => {
        const already = prev.some((f) => f.bucket === ATTACH_BUCKET && f.path === attachKey);
        if (already) return prev;
        return [{ bucket: ATTACH_BUCKET, path: attachKey, name: inferredName, type: "application/pdf", size: null }, ...prev];
      });

      setSubject((prev) => {
        if (prev?.trim()) return prev;
        if (nextType === "facture") return `Facture ${inferredName.replace(/\.pdf$/i, "")}`;
        if (nextType === "devis") return `Devis ${inferredName.replace(/\.pdf$/i, "")}`;
        return prev;
      });
    };

    void run();
  }, [searchParams, signatureEnabled, signaturePreview]);

  // Prefill compose modal from template modules (Booster / Fidéliser).
  // Usage:
  // - /dashboard/mails?folder=offres&template_key=...&prefill_subject=...&prefill_text=...&compose=1
  // If template_key is provided, we render placeholders server-side from the user's profile/activity + connected tools.
  useEffect(() => {
    const preSubjectRaw = searchParams?.get("prefill_subject") || "";
    const preTextRaw = searchParams?.get("prefill_text") || "";
    const templateKey = searchParams?.get("template_key") || "";
    const open = (searchParams?.get("compose") || "").toLowerCase();

    // Optional tracking intent (sent from Booster/Fidéliser modules)
    const trackKind = (searchParams?.get("track_kind") || "").toLowerCase();
    const trackType = searchParams?.get("track_type") || "";
    const trackPayloadRaw = searchParams?.get("track_payload") || "";

    if ((trackKind === "booster" || trackKind === "fideliser") && trackType) {
      let payload: Record<string, any> = {};
      try {
        payload = trackPayloadRaw ? (JSON.parse(safeDecode(trackPayloadRaw)) as any) : {};
      } catch {
        payload = {};
      }
      setPendingTrack({ kind: trackKind as any, type: trackType, payload });

      // Remove tracking params from the URL to avoid double-counting if the user later sends another email.
      try {
        const q = new URLSearchParams(searchParams?.toString() || "");
        q.delete("track_kind");
        q.delete("track_type");
        q.delete("track_payload");
        router.replace(`/dashboard/mails?${q.toString()}`);
      } catch {
        // ignore
      }
    }

    // Only prefill when something is provided
    if (!preSubjectRaw && !preTextRaw && !templateKey) return;

    const preSubject = safeDecode(preSubjectRaw);
    const preText = safeDecode(preTextRaw);

    const run = async () => {
      // If we have a template key, ask the server to render placeholders + compute links.
      if (templateKey) {
        try {
          const r = await fetch("/api/templates/render", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              template_key: templateKey,
              subject_override: preSubject,
              body_override: preText,
            }),
          });
          const j = await r.json().catch(() => ({}));
          if (j?.subject) setSubject(String(j.subject));
          else if (preSubject) setSubject(preSubject);

          if (j?.body_text) setText(applySignaturePreview(String(j.body_text), signatureEnabled ? signaturePreview : ""));
          else if (preText) setText(applySignaturePreview(preText, signatureEnabled ? signaturePreview : ""));
        } catch {
          if (preSubject) setSubject(preSubject);
          if (preText) setText(applySignaturePreview(preText, signatureEnabled ? signaturePreview : ""));
        }
      } else {
        if (preSubject) setSubject(preSubject);
        if (preText) setText(applySignaturePreview(preText, signatureEnabled ? signaturePreview : ""));
      }

      setComposeType("mail");
      // Open compose by default (compose=1), but also open when not specified (better UX)
      if (open !== "0" && open !== "false") setComposeOpen(true);
    };

    run();
  }, [searchParams]);

  useEffect(() => {
    if (!composeOpen) return;
    setText((prev) => {
      const base = String(prev || "");
      if (!base.trim()) {
        return buildDefaultMailText({ kind: composeType, signature: signatureEnabled ? signaturePreview : "" });
      }
      return signatureEnabled ? applySignaturePreview(base, signaturePreview) : base;
    });
  }, [composeOpen, composeType, signatureEnabled, signaturePreview]);

  async function loadCrmContacts() {
    if (crmLoading) return;
    setCrmError(null);
    setCrmLoading(true);

    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 12000);
    try {
      // We go through the API route so the same auth method is used as the CRM screens.
      const res = await fetch("/api/crm/contacts?all=1", {
        method: "GET",
        credentials: "include",
        signal: ac.signal,
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }

      const json = (await res.json().catch(() => ({}))) as any;
      const rows = Array.isArray(json?.contacts) ? json.contacts : [];
      const mapped = rows.map((c: any) => {
        const left = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
        const company = (c.company_name || "").trim();
        const full = company && left ? `${company} — ${left}` : company || left || null;
        return {
          id: String(c.id),
          full_name: full,
          email: c.email || null,
          category: (c.category as any) ?? null,
          contact_type: (c.contact_type as any) ?? null,
          important: Boolean(c.important),
        };
      });
      setCrmContacts(mapped);
    } catch (e: any) {
      console.error("CRM load error", e);
      const msg = e?.name === "AbortError" ? "Le chargement a expiré. Veuillez réessayer." : "Impossible de charger les contacts.";
      setCrmError(msg);
    } finally {
      clearTimeout(timeout);
      setCrmLoading(false);
    }
  }

  // load CRM when compose opens (lazy)
  useEffect(() => {
    if (!composeOpen) return;
    if (crmContacts.length > 0) return;
    void loadCrmContacts();
  }, [composeOpen]);

  function updateFolder(next: Folder) {
    setFolder(next);
    // quand on change de dossier, on revient à la vue principale
    setBoxView("sent");
    router.replace(`/dashboard/mails?folder=${encodeURIComponent(next)}`);
    // reset selection to first item in that folder
    setSelectedId(null);
  }

  async function saveDraft() {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return;

    // Storage guardrail: keep only the latest 20 drafts per user.
    // Prefer ordering by updated_at (so editing an old draft bumps it),
    // and fallback to created_at if updated_at doesn't exist.
    async function enforceDraftLimit() {
      try {
        const base = supabase
          .from("send_items")
          .select("id")
          .eq("user_id", userId)
          .eq("status", "draft");

        // Try updated_at first
        const { data: recentByUpdate, error: errUpdate } = await base
          .order("updated_at", { ascending: false })
          .limit(80);

        const recent = errUpdate
          ? (await base.order("created_at", { ascending: false }).limit(80)).data
          : recentByUpdate;

        const ids = (recent || []).map((r: any) => r.id).filter(Boolean);
        if (ids.length > 20) {
          const toDelete = ids.slice(20);
          await supabase.from("send_items").delete().in("id", toDelete);
        }
      } catch {
        // Never block draft saving
      }
    }

    const payload = {
      user_id: userId,
      integration_id: selectedAccountId || null,
      type: composeType,
      status: "draft" as const,
      to_emails: to.trim(),
      subject: subject.trim() || null,
      body_text: text || null,
      body_html: null,
      provider: selectedAccount?.provider || null,
      source_doc_save_id: composeSourceDocSaveId || null,
      source_doc_type: composeSourceDocType || null,
      source_doc_number: composeSourceDocNumber || null,
    };

    if (draftId) {
      const { error } = await supabase.from("send_items").update(payload).eq("id", draftId);
      if (!error) {
        setToast("Brouillon sauvegardé");
        await enforceDraftLimit();
        await loadHistory();
      }
      return;
    }

    const { data, error } = await supabase.from("send_items").insert(payload).select("id").single();
    if (!error && data?.id) {
      setDraftId(data.id);
      setToast("Brouillon sauvegardé");
      await enforceDraftLimit();
      await loadHistory();
    }
  }

  function providerSendEndpoint(provider: string) {
    if (provider === "gmail") return "/api/inbox/gmail/send";
    if (provider === "microsoft") return "/api/inbox/microsoft/send";
    return "/api/inbox/imap/send";
  }

async function deleteDraftPermanently(id: string) {
  try {
    if (!id) return;
    if (deletingDraftId) return;

    const ok = window.confirm("Supprimer ce brouillon définitivement ?");
    if (!ok) return;

    setDeletingDraftId(id);

    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return;

    const { error } = await supabase
      .from("send_items")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      setToast("Impossible de supprimer ce brouillon pour le moment. Merci de réessayer.");
      return;
    }

    // Optimistic UI
    setItems((prev) => prev.filter((x) => x.id !== id));
    if (selectedId === id) setSelectedId(null);
    if (detailsId === id) {
      setDetailsOpen(false);
      setDetailsId(null);
    }

    setToast("Brouillon supprimé.");
    // Reload to keep the list consistent (and still capped at 20)
    await loadHistory();
  } finally {
    setDeletingDraftId(null);
  }
}


  function getBulkCampaignFolder(): Folder {
    if (composeType === "facture") return "factures";
    if (composeType === "devis") return "devis";
    if (pendingTrack?.kind && pendingTrack?.type) {
      return folderFromTrack(pendingTrack.kind, pendingTrack.type, isBusinessMailFolder(folder) ? folder : "mails");
    }
    return isBusinessMailFolder(folder) ? folder : "mails";
  }

  async function doSend() {
    if (!selectedAccount) {
      setToast("Veuillez connecter une boîte d’envoi dans les réglages.");
      return;
    }

    const recipientsList = normalizeEmails(to);
    if (recipientsList.length === 0) {
      setToast("Veuillez ajouter au moins un destinataire.");
      return;
    }
    if (attachBusy) {
      setToast("Veuillez patienter pendant le chargement des pièces jointes.");
      return;
    }

    if (recipientsList.length > 1 && composeType !== "mail") {
      setToast("L’envoi individuel en masse est disponible uniquement pour les mails classiques.");
      return;
    }

    setSendBusy(true);
    try {
      if (recipientsList.length > 1) {
        const campaignFolder = getBulkCampaignFolder();
        const templateKey = searchParams?.get("template_key") || "";
        const campaignPayload = {
          accountId: selectedAccount.id,
          type: composeType,
          folder: campaignFolder,
          trackKind: pendingTrack?.kind || undefined,
          trackType: pendingTrack?.type || undefined,
          templateKey: templateKey || undefined,
          subject: subject.trim() || "(sans objet)",
          text: text || "",
          html: "",
          recipients: recipientsList.map((email) => {
            const lower = email.toLowerCase();
            const hint = composeRecipientHintsByEmail.get(lower);
            const crmContact = crmRecipientsByEmail.get(lower);
            return {
              email,
              contact_id: hint?.contact_id || crmContact?.contact_id || null,
              display_name: hint?.display_name || crmContact?.display_name || null,
            };
          }),
          attachments: composeAttachments,
          sourceDocSaveId: composeSourceDocSaveId || undefined,
          sourceDocType: composeSourceDocType || undefined,
          sourceDocNumber: composeSourceDocNumber || undefined,
        };

        const res = await fetch("/api/crm/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(campaignPayload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setToast(data?.error || "La campagne mail n’a pas pu être lancée pour le moment.");
          return;
        }

        if (pendingTrack) setPendingTrack(null);
        const queuedCount = Math.max(0, Number(data?.queued ?? recipientsList.length));
        const blockedDuplicates = Math.max(0, Number(data?.blockedDuplicates ?? 0));
        const ignoredInvalid = Math.max(0, Number(data?.ignoredInvalid ?? 0));
        const extras: string[] = [];
        if (blockedDuplicates > 0) extras.push(`${blockedDuplicates} doublon${blockedDuplicates > 1 ? "s" : ""} bloqué${blockedDuplicates > 1 ? "s" : ""}`);
        if (ignoredInvalid > 0) extras.push(`${ignoredInvalid} destinataire${ignoredInvalid > 1 ? "s" : ""} ignoré${ignoredInvalid > 1 ? "s" : ""}`);
        setToast(`Campagne lancée : ${queuedCount} email${queuedCount > 1 ? "s" : ""} vont partir individuellement par vagues de 20.${extras.length ? ` (${extras.join(", ")})` : ""}`);
        setComposeOpen(false);
        resetCompose();
        await loadHistory();
        updateFolder(campaignFolder);
        return;
      }

      const payload = {
        accountId: selectedAccount.id,
        to: recipientsList[0],
        subject: subject.trim() || "(sans objet)",
        text: text || "",
        html: "",
        type: composeType,
        ...(draftId ? { sendItemId: draftId } : {}),
        attachments: composeAttachments,
        sourceDocSaveId: composeSourceDocSaveId || undefined,
        sourceDocType: composeSourceDocType || undefined,
        sourceDocNumber: composeSourceDocNumber || undefined,
      };

      const res = await fetch(providerSendEndpoint(selectedAccount.provider), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast(data?.error || "Le message n’a pas pu être envoyé pour le moment.");
        return;
      }

      if (pendingTrack) {
        try {
          await fetch(`/api/${pendingTrack.kind}/events`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: pendingTrack.type,
              payload: {
                ...(pendingTrack.payload || {}),
                integration_id: selectedAccount.id,
                to: recipientsList[0],
                subject: subject.trim() || "(sans objet)",
              },
            }),
          });
        } catch {
          // Tracking must never block sending
        } finally {
          setPendingTrack(null);
        }
      }

      setToast("Message envoyé.");
      setComposeOpen(false);
      resetCompose();
      await loadHistory();
      updateFolder(
        composeType === "facture"
          ? "factures"
          : composeType === "devis"
            ? "devis"
            : "mails"
      );
    } finally {
      setSendBusy(false);
    }
  }

  // Trash has been intentionally removed: the tool always shows the last sent items.

  function openDetails(it: OutboxItem) {
    setSelectedId(it.id);
    setDetailsId(it.id);
    setDetailsChannelKey(null);
    setDetailsEditMode(false);
    setDetailsActionBusy(false);
    setDetailsActionError(null);
    setDetailsOpen(true);
  }

  function updatePublicationChannelAssets(channel: string, updater: (assets: PublicationImageAsset[]) => PublicationImageAsset[]) {
    const normalizedChannel = normalizeChannelKey(channel);
    setPublicationEditImagesByChannel((prev) => ({
      ...prev,
      [normalizedChannel]: {
        assets: updater(prev[normalizedChannel]?.assets || []).slice(0, 5),
      },
    }));
  }

  function togglePublicationImage(channel: string, imageKey: string) {
    updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === imageKey ? { ...asset, selected: !asset.selected } : asset));
  }

  function removePublicationImage(channel: string, imageKey: string) {
    updatePublicationChannelAssets(channel, (assets) => assets.filter((asset) => asset.key !== imageKey));
  }

  function openPublicationRetouch(channel: string, imageKey: string) {
    setPublicationRetouchChannelKey(normalizeChannelKey(channel));
    setPublicationRetouchImageKey(imageKey);
    setDetailsActionError(null);
  }

  function closePublicationRetouch() {
    setPublicationRetouchChannelKey(null);
    setPublicationRetouchImageKey(null);
    publicationRetouchDragRef.current = null;
  }

  function addPublicationFiles(fileList: FileList | null) {
    if (!fileList) return;
    const channel = normalizeChannelKey(activeDetailsChannelEntry?.key || "");
    if (!channel) return;
    setDetailsActionError(null);
    const picked = Array.from(fileList);
    if (!picked.length) return;

    const invalid = picked.find((file) => !file.type.startsWith("image/"));
    if (invalid) {
      setDetailsActionError("Seules les images sont acceptées dans les pièces jointes d'une publication.");
      return;
    }

    const tooBig = picked.find((file) => file.size > 2 * 1024 * 1024);
    if (tooBig) {
      setDetailsActionError("Une image dépasse 2 Mo.");
      return;
    }

    updatePublicationChannelAssets(channel, (assets) => {
      const merged = [...assets];
      for (const file of picked) {
        const key = makePublicationImageAssetKey("new", file.name, `${file.size}:${file.lastModified}`);
        if (merged.some((asset) => asset.key === key)) continue;
        if (merged.length >= 5) {
          setDetailsActionError("Maximum 5 images par publication.");
          break;
        }
        merged.push({
          key,
          name: file.name,
          type: file.type || "image/jpeg",
          previewUrl: URL.createObjectURL(file),
          sourceUrl: null,
          file,
          selected: true,
          transform: buildPublicationDefaultTransform(channel),
        });
      }
      return merged;
    });
  }

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error ?? new Error("Impossible de lire ce fichier."));
      reader.readAsDataURL(file);
    });

  async function saveChannelPublication() {
    if (!detailsItem || detailsItem.source !== "app_events") return;
    const publicationId = String((detailsPayload as any)?.publication_id || "").trim();
    const channel = String(activeDetailsChannelEntry?.key || "").trim();
    if (!publicationId || !channel) return;

    setDetailsActionBusy(true);
    setDetailsActionError(null);
    try {
      const hashtags = publicationEditForm.hashtags
        .split(/[;,\n\s]+/)
        .map((tag) => tag.trim().replace(/^#+/, ""))
        .filter(Boolean);

      const channelImages = publicationEditImagesByChannel[normalizeChannelKey(channel)]?.assets || [];
      const selectedAssets = channelImages.filter((asset) => asset.selected).slice(0, 5);
      const retainedImages: string[] = [];
      const newImages: Array<{ name: string; type: string; dataUrl: string }> = [];

      for (const asset of selectedAssets) {
        const canRetain = !!asset.sourceUrl && !asset.file && !isPublicationTransformModified(asset.transform, channel);
        if (canRetain) {
          retainedImages.push(String(asset.sourceUrl || ""));
          continue;
        }

        if (asset.file && !isPublicationTransformModified(asset.transform, channel)) {
          newImages.push({
            name: asset.name,
            type: asset.type,
            dataUrl: await fileToDataUrl(asset.file),
          });
          continue;
        }

        newImages.push(await renderPublicationImageAsset({
          source: asset.file || asset.previewUrl,
          transform: asset.transform,
          channel,
          name: asset.name,
          type: asset.type,
        }));
      }

      const res = await fetch(`/api/inrsend/publications/${encodeURIComponent(publicationId)}/${encodeURIComponent(channelApiPath(channel))}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: publicationEditForm.title,
          content: publicationEditForm.content,
          cta: publicationEditForm.cta,
          hashtags,
          externalId: (activeDetailsChannelResult as any)?.external_id || null,
          retainedImages,
          newImages,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Modification impossible.");
      setToast(`Publication ${formatChannelLabel(channel)} modifiée.`);
      setDetailsEditMode(false);
      await loadHistory();
    } catch (e: any) {
      setDetailsActionError(getSimpleFrenchErrorMessage(e, "Impossible de modifier cette publication pour le moment."));
    } finally {
      setDetailsActionBusy(false);
    }
  }

  async function deleteChannelPublication() {
    if (!detailsItem || detailsItem.source !== "app_events") return;
    const publicationId = String((detailsPayload as any)?.publication_id || "").trim();
    const channel = String(activeDetailsChannelEntry?.key || "").trim();
    if (!publicationId || !channel) return;
    const label = activeDetailsChannelEntry?.label || formatChannelLabel(channel);
    if (!window.confirm(`Supprimer la publication ${label} ?`)) return;

    setDetailsActionBusy(true);
    setDetailsActionError(null);
    try {
      const res = await fetch(`/api/inrsend/publications/${encodeURIComponent(publicationId)}/${encodeURIComponent(channelApiPath(channel))}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalId: (activeDetailsChannelResult as any)?.external_id || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Suppression impossible.");
      setToast(`Publication ${label} supprimée.`);
      setDetailsEditMode(false);
      await loadHistory();
      setDetailsChannelKey(channel);
    } catch (e: any) {
      const baseMessage = getSimpleFrenchErrorMessage(e, "Impossible de supprimer cette publication pour le moment.");
      setDetailsActionError(baseMessage);
    } finally {
      setDetailsActionBusy(false);
    }
  }

  async function retryCampaignFailedRecipients(campaignId: string) {
    if (!campaignId) return;
    setCampaignActionBusyId(campaignId);
    try {
      const res = await fetch(`/api/crm/campaigns/${encodeURIComponent(campaignId)}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast(data?.error || "Relance impossible pour le moment.");
        return;
      }
      setToast(data?.retried ? `${data.retried} contact${data.retried > 1 ? "s" : ""} relancé${data.retried > 1 ? "s" : ""}.` : "Échecs relancés.");
      await loadHistory();
      if (detailsOpen && detailsId === campaignId) {
        await loadCampaignRecipients(campaignId);
      }
    } finally {
      setCampaignActionBusyId(null);
    }
  }

  async function openItem(it: OutboxItem) {
    setSelectedId(it.id);
    if (it.source === "send_items" && it.status === "draft") {
      setComposeOpen(true);
      setDraftId(it.id);
      // raw = SendItem
      const raw = (it.raw || {}) as any;
      setComposeType(raw.type as SendType);
      setTo(raw.to_emails || "");
      setSubject(raw.subject || "");
      setText(raw.body_text || "");
      setFiles([]);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        {/* Header (aligné avec les autres modules iNrCy) */}
        <div className={styles.header}>
          {/* Logo (gauche) */}
          <div className={styles.brand}>
            <Image
              src="/inrsend-logo.png"
              alt="iNr’Send"
              width={154}
              height={64}
              priority
              className={styles.brandIcon}
            />

            <div className={styles.brandText}>
              <div className={styles.brandRow}>
                <span className={styles.tagline}>
                  Toutes vos communications, depuis une seule et même machine.
                </span>
              </div>
            </div>
          </div>

          {/* Actions (droite) */}
          <div className={styles.actions}>
            <HelpButton onClick={() => setHelpOpen(true)} title="Aide iNr’Send" />

            <button
              className={`${styles.btnGhost} ${styles.iconOnlyBtn} ${styles.hamburgerBtn}`}
              onClick={() => setMobileFoldersOpen(true)}
              type="button"
              aria-label="Dossiers"
              title="Dossiers"
            >
              <span aria-hidden>☰</span>
              <span className={styles.srOnly}>Dossiers</span>
            </button>

            <ResponsiveActionButton
              desktopLabel="Réglages"
              mobileIcon="⚙️"
              onClick={() => setSettingsOpen(true)}
            />

            <SettingsDrawer
              title="Réglages iNr’Send"
              isOpen={settingsOpen}
              onClose={() => setSettingsOpen(false)}
            >
              <MailsSettingsContent />
            </SettingsDrawer>

            <ResponsiveActionButton
              desktopLabel="Fermer"
              mobileIcon="✕"
              href="/dashboard"
              title="Fermer iNr’Send"
            />
          </div>
</div>

        <HelpModal open={helpOpen} title="iNr’Send" onClose={() => setHelpOpen(false)}>
          <p style={{ marginTop: 0 }}>
            iNr’Send est le centre d’envoi de votre communication.
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Centralisez vos échanges et vos messages.</li>
            <li>Gagnez du temps pour communiquer sur vos canaux.</li>
            <li>Utilisez les réglages pour connecter/configurer les envois.</li>
          </ul>
        </HelpModal>

        {/* Mobile: menu dossiers (hamburger) */}
        {mobileFoldersOpen ? (
          <div className={styles.mobileMenuOverlay} onClick={() => setMobileFoldersOpen(false)}>
            <div className={styles.mobileMenu} onClick={(e) => e.stopPropagation()}>
              <div className={styles.mobileMenuHeader}>
                <div className={styles.mobileMenuTitle}>Dossiers</div>
                <button className={styles.btnGhost} onClick={() => setMobileFoldersOpen(false)} type="button">
                  ✕
                </button>
              </div>
              <div className={styles.mobileMenuBody}>
                {([
                  "mails",
                  "factures",
                  "devis",
                  "publications",
                  "recoltes",
                  "offres",
                  "informations",
                  "suivis",
                  "enquetes",
                ] as Folder[]).map((f) => {
                  const active = f === folder;
                  return (
                    <button
                      key={f}
                      className={`${styles.mobileFolderBtn} ${active ? styles.mobileFolderBtnActive : ""}`}
                      style={folderTheme(f)}
                      onClick={() => {
                        updateFolder(f);
                        setMobileFoldersOpen(false);
                      }}
                      type="button"
                    >
                      <span>{folderLabel(f)}</span>
                      <span className={styles.badgeCount}>{counts[f] || 0}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

        <div className={styles.grid}>
          {/* List */}
          {/* IMPORTANT: la liste doit occuper toute la hauteur disponible (pas de max-height),
              même s'il n'y a aucun élément. */}
          <div className={`${styles.card} ${styles.listCard}`}>
            {/* Tabs (en haut comme iNr'Box) */}
            <div className={styles.folderTabs}>
              {([
                "mails",
                "factures",
                "devis",
                "publications",
                "recoltes",
                "offres",
                "informations",
                "suivis",
                "enquetes",
              ] as Folder[]).map((f) => {
                const active = f === folder;
                return (
                  <button
                    key={f}
                    className={`${styles.folderTabBtn} ${active ? styles.folderTabBtnActive : ""}`}
                    style={folderTheme(f)}
                    onClick={() => updateFolder(f)}
                    type="button"
                    title={folderLabel(f)}
                  >
                    <span className={styles.folderTabLabel}>{folderLabel(f)}</span>
                    <span className={styles.badgeCount}>{counts[f] || 0}</span>
                  </button>
                );
              })}
            </div>

            {/* Toolbar (recherche + sélection boîte + refresh) */}
            <div className={styles.toolbarRow}>
              {/* Filtre boîte: en mobile, le libellé + le select doivent rester sur la même ligne */}
              <div className={styles.filterRow}>
                <div className={styles.toolbarInfo}>Filtrer</div>
                <select
                  className={styles.filterSelect}
                  value={filterAccountId}
                  onChange={(e) => setFilterAccountId(e.target.value)}
                  title="Filtrer par boîte d’envoi"
                >
                  <option value="">Toutes les boîtes</option>
                  {mailAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {(a.display_name ? `${a.display_name} — ` : "") + a.email_address + ` (${a.provider})`}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.toolbarActions}>
                {/* 🔁 Inversion demandée : bouton d'action passe à droite, à la place de Filtrer */}
                {toolCfg.href ? (
                  <Link
                    className={`${styles.toolbarBtn} ${styles.toolbarBtnCta}`}
                    style={toolbarActionTheme(folder)}
                    href={toolCfg.href}
                    title={toolCfg.label}
                  >
                    {toolCfg.label}
                  </Link>
                ) : (
                  <button
                    className={`${styles.toolbarBtn} ${styles.toolbarBtnCta}`}
                    style={toolbarActionTheme(folder)}
                    onClick={() => {
                      resetCompose("mail");
                      setComposeOpen(true);
                    }}
                    type="button"
                  >
                    {toolCfg.label}
                  </button>
                )}

                <button
                  className={`${styles.toolbarBtn} ${boxView === "drafts" ? styles.toolbarBtnActive : ""}`}
                  onClick={() => setBoxView((v) => (v === "drafts" ? "sent" : "drafts"))}
                  type="button"
                  title="Brouillons"
                >
                  Brouillons
                </button>
                <button
                  className={`${styles.toolbarBtn} ${styles.toolbarIconBtn} ${
                    !searchOpen && historyQuery.trim() ? styles.toolbarIconBtnActive : ""
                  }`}
                  onClick={() => setSearchOpen((v) => !v)}
                  type="button"
                  title={searchOpen ? "Fermer la recherche" : "Rechercher (Ctrl/Cmd+K)"}
                  aria-label="Rechercher"
                >
                  <span className={styles.toolbarIconGlyph}>⌕</span>
                  {!searchOpen && historyQuery.trim() ? <span className={styles.activeDot} /> : null}
                </button>



                <button
                  className={`${styles.toolbarBtn} ${styles.toolbarIconBtn}`}
                  onClick={() => { void loadHistory(); }}
                  type="button"
                  title="Actualiser"
                  aria-label="Actualiser"
                >
                  ↻
                </button>

            
              </div>
            </div>

            
            {searchOpen ? (
              <div className={styles.searchPanel}>
                <div className={styles.searchPanelInner}>
                  <input
                    ref={historySearchRef}
                    className={styles.searchInputInline}
                    placeholder="Rechercher un envoi…"
                    value={historyQuery}
                    onChange={(e) => setHistoryQuery(e.target.value)}
                  />
                  {historyQuery.trim() ? (
                    <button
                      className={styles.searchClearBtn}
                      type="button"
                      onClick={() => {
                        setHistoryQuery("");
                        requestAnimationFrame(() => historySearchRef.current?.focus());
                      }}
                      title="Effacer"
                      aria-label="Effacer"
                    >
                      ×
                    </button>
                  ) : null}
                  <button
                    className={styles.searchCloseBtn}
                    type="button"
                    onClick={() => setSearchOpen(false)}
                    title="Fermer"
                    aria-label="Fermer"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ) : null}

<div className={styles.scrollArea}>
              {loading ? (
                <div style={{ padding: 14, color: "rgba(255,255,255,0.75)" }}>Chargement…</div>
              ) : (
                <div className={styles.list}>
                  <div className={styles.listHeader}>
                    <div
                      className={styles.listHeaderGrid}
                      style={{ gridTemplateColumns: listGridTemplateColumns(folder) }}
                    >
                      <div className={styles.listHeaderCell}>Objet</div>
                      <div
                        className={`${styles.listHeaderCell} ${styles.listHeaderCellCenter} ${folder === "publications" ? styles.listHeaderCellPublications : ""}`}
                      >
                        {folder === "publications" ? "Canaux" : "Boîte d’envoi"}
                      </div>
                      <div className={`${styles.listHeaderCell} ${styles.listHeaderCellRight}`}>Date · Heure</div>
                    </div>
                  </div>
                  {visibleItems.length === 0 ? (
                    <div style={{ padding: 14, color: "rgba(255,255,255,0.65)" }}>Aucun élément.</div>
                  ) : visibleItems.map((it) => {
                    const active = it.id === selectedId;
                    const p = pill(it.provider);

                    const accountLabel = (() => {
                      const acc = mailAccounts.find((a) => a.id === itemMailAccountId(it));
                      if (!acc) return "";
                      return (acc.display_name ? `${acc.display_name} — ` : "") + acc.email_address;
                    })();

                    const midLabel =
                      it.source === "send_items" || it.source === "mail_campaigns"
                        ? [accountLabel, it.source === "mail_campaigns" ? formatCampaignProgress((it.raw || {}) as any) : ""].filter(Boolean).join(" • ")
                        : (it.channels && it.channels.length
                            ? it.channels.map((channel) => formatChannelLabel(channel)).join(" / ")
                            : formatChannelLabel(it.target || ""));
                    const midLabelNode = folder === "publications" && it.source === "app_events"
                      ? (renderPublicationChannelsWithFailures((it as any)?.raw?.payload || null, it.channels && it.channels.length ? it.channels : [it.target]) || (midLabel || ""))
                      : (midLabel || "");

                    // NOTE: this is a clickable row that contains action buttons.
                    // Using a <button> wrapper would create invalid HTML (nested buttons)
                    // and can trigger hydration errors in Next.js.
                    return (
                      <div
                        key={it.id}
                        className={`${styles.item} ${active ? styles.itemActive : ""}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => openItem(it)}
                        onDoubleClick={() => openDetails(it)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openItem(it);
                          }
                        }}
                      >
                        <div className={styles.itemTop} style={{ gridTemplateColumns: listGridTemplateColumns(folder) }}>
                          <div className={styles.fromRow}>
                            <div className={styles.from} title={it.title || "(sans objet)"}>{it.title || "(sans objet)"}</div>
                            <span className={`${styles.badge} ${p.cls}`}>{p.label}</span>
                          </div>

                          {/* Au centre

                          {it.subTitle ? (
                            <div className={styles.itemSubTitle} title={it.subTitle}>
                              {it.subTitle}
                            </div>
                          ) : null}

                          {/* Au centre : boîte d'envoi (mails/factures/devis) ou canaux (publications, etc.) */}
                          <div className={styles.itemMid} title={midLabel || it.target}>
                            {midLabelNode}
                          </div>

                          <div className={styles.itemRight}>
                            <div className={styles.date}>{new Date(it.created_at).toLocaleString()}</div>


                            <div className={styles.rowActions}>

{it.status === "draft" ? (
  <button
    type="button"
    className={`${styles.iconBtnSmall} ${styles.iconBtnSmallGhost}`}
    title="Supprimer (définitif)"
    disabled={deletingDraftId === it.id}
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      if (it.source === "send_items") void deleteDraftPermanently(it.id);
    }}
  >
    🗑
  </button>
) : null}

                              <button
                                type="button"
                                className={`${styles.iconBtnSmall} ${styles.iconBtnSmallGhost}`}
                                title="Ouvrir"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  openDetails(it);
                                }}
                              >
                                ↗
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px 0", flexWrap: "wrap" }}>
              <div style={{ color: "rgba(255,255,255,0.68)", fontSize: 12 }}>
                {filteredItems.length > 0
                  ? (() => {
                      const start = (historyPage - 1) * MAILBOX_PAGE_SIZE + 1;
                      const end = start + filteredItems.length - 1;
                      if (historyTotalCount != null) {
                        return `Affichage ${start}–${end} sur ${historyTotalCount}`;
                      }
                      return historyHasMorePotential
                        ? `Affichage ${start}–${end} (autres éléments disponibles)`
                        : `Affichage ${start}–${end}`;
                    })()
                  : "Aucun élément"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={() => {
                    const prevPage = Math.max(1, historyPage - 1);
                    void loadHistory({ page: prevPage });
                  }}
                  disabled={historyPage <= 1 || loading}
                >
                  ← Précédent
                </button>
                <div style={{ color: "rgba(255,255,255,0.82)", fontSize: 12 }}>
                  Page {historyPage}{historyTotalCount != null ? ` / ${historyPageCount}` : historyHasMorePotential ? " / …" : ""}
                </div>
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={() => {
                    const nextPage = historyPage + 1;
                    void loadHistory({ page: nextPage });
                  }}
                  disabled={!historyHasMorePotential || loading}
                >
                  Suivant →
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* Details modal (double-clic sur un message) */}
        {detailsOpen ? (
          <div className={styles.modalOverlay} onClick={() => setDetailsOpen(false)}>
            <div className={`${styles.modalCard} ${styles.detailsModalCard}`} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <div className={styles.modalTitle}>Détails</div>
                  {detailsItem ? (
                    <>
                      <span className={`${styles.badge} ${pill(detailsItem.provider).cls}`}>{pill(detailsItem.provider).label}</span>
                      {detailsItem.source !== "app_events" && detailsAccountLabel ? (
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>• {detailsAccountLabel}</span>
                      ) : null}
                    </>
                  ) : null}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {/* Trash removed intentionally */}
                  <button className={styles.btnGhost} onClick={() => setDetailsOpen(false)} type="button">
                    ✕
                  </button>
                </div>
              </div>

              <div className={styles.modalBody}>
                {!detailsItem ? (
                  <div style={{ color: "rgba(255,255,255,0.65)" }}>Sélectionne un élément.</div>
                ) : (() => {
                  const payload = detailsItem.source === "app_events" ? ((detailsItem as any)?.raw?.payload || null) : null;
                  const channelPublications = detailsItem.source === "app_events" ? extractChannelPublications(payload) : [];
                  const defaultParts = detailsItem.source === "app_events" ? extractPublicationParts(payload) : {};
                  const publicationChannelEntries = detailsItem.source === "app_events"
                    ? channelPublications.length
                      ? channelPublications
                      : orderChannelKeys((detailsItem.channels && detailsItem.channels.length ? detailsItem.channels : [detailsItem.target]).filter(Boolean).map((channel) => String(channel))).map((channel) => ({
                          key: channel,
                          label: formatChannelLabel(channel),
                          parts: defaultParts,
                        }))
                    : [];
                  const activePublicationEntry = detailsItem.source === "app_events"
                    ? (publicationChannelEntries.find((entry) => entry.key === detailsChannelKey) || publicationChannelEntries[0] || null)
                    : null;
                  const activePublicationResult = detailsItem.source === "app_events" && activePublicationEntry
                    ? ((payload?.results && typeof payload.results === "object" ? (payload.results as any)[activePublicationEntry.key] : null) || null)
                    : null;
                  const activePublicationDeleted = isDeletedChannelResult(activePublicationResult);
                  const activePublicationFailed = isFailedChannelResult(activePublicationResult);
                  const activePublicationFailureMessage = getFailedChannelMessage(activePublicationResult);
                  const activeParts = activePublicationEntry?.parts || defaultParts;
                  const sourceDocAttachments = detailsItem.source === "send_items"
                    ? extractAttachmentsFromPayload(detailsSourceDocPayload)
                    : [];
                  const attachmentCandidates = detailsItem.source === "send_items"
                    ? [...(detailsItem.attachments || []), ...sourceDocAttachments]
                    : detailsItem.source === "app_events"
                    ? [...(activeParts.attachments || [])]
                    : [];
                  const dedupedAttachments = attachmentCandidates.filter((att, idx, arr) => {
                    const key = `${att.url || ""}|${att.name || ""}`;
                    return arr.findIndex((x) => `${x.url || ""}|${x.name || ""}` === key) === idx;
                  });
                  const imageAttachments = dedupedAttachments.filter((att) => att?.url && isImageAttachment(att));
                  const videoAttachments = dedupedAttachments.filter((att) => att?.url && isVideoAttachment(att));
                  const fileAttachments = dedupedAttachments.filter((att) => !imageAttachments.includes(att) && !videoAttachments.includes(att));
                  const hasAttachments = imageAttachments.length > 0 || videoAttachments.length > 0 || fileAttachments.length > 0;
                  const showFallbackMessage = (() => {
                    if (detailsItem.source !== "app_events") return true;
                    const activeHasStructured = !!(activeParts.title || activeParts.content || activeParts.cta || activeParts.hashtags?.length || activeParts.attachments?.length);
                    const fallbackTitle = firstNonEmpty(payload?.post?.title, payload?.subject, payload?.title);
                    const fallbackContent = firstNonEmpty(payload?.post?.content, payload?.post?.text, payload?.content, payload?.text, payload?.message);
                    const fallbackCta = firstNonEmpty(payload?.post?.cta, payload?.cta);
                    const fallbackHashtags = Array.isArray(payload?.post?.hashtags || payload?.hashtags)
                      ? (payload?.post?.hashtags || payload?.hashtags).map((x: any) => String(x || "").trim()).filter(Boolean)
                      : [];
                    const fallbackAttachments = extractAttachmentsFromPayload(payload);
                    return !(activeHasStructured || fallbackTitle || fallbackContent || fallbackCta || fallbackHashtags.length || fallbackAttachments.length);
                  })();

                  return (
                    <>
                      <div className={styles.detailsStack}>
                        <section className={styles.detailSectionCard}>
                          <div className={styles.detailSectionHeader}>
                            <div>
                              <div className={styles.detailsTitle}>{detailsItem.title || "(sans objet)"}</div>
                              <div className={styles.detailsSub}>{formatOutboxStatusLabel(detailsItem)}</div>
                            </div>
                          </div>

                          {detailsItem.source === "send_items" ? (
                            <>
                              <div className={styles.metaGrid}>
                                <div className={styles.metaRow}>
                                  <div className={styles.metaKey}>Boîte d’envoi</div>
                                  <div className={styles.metaVal}>{detailsAccountLabel || "—"}</div>
                                </div>
                                <div className={styles.metaRow}>
                                  <div className={styles.metaKey}>Destinataires</div>
                                  <div className={styles.metaVal}>{splitList(detailsItem.to || detailsItem.target).join(", ") || "—"}</div>
                                </div>
                                <div className={styles.metaRow}>
                                  <div className={styles.metaKey}>Objet</div>
                                  <div className={styles.metaVal}>{detailsItem.subject || detailsItem.title || "—"}</div>
                                </div>
                                <div className={styles.metaRow}>
                                  <div className={styles.metaKey}>Document source</div>
                                  <div className={styles.metaVal}>{(detailsItem as any).raw?.source_doc_number || "—"}</div>
                                </div>
                              </div>
                              {(detailsItem.reopenHref || ((detailsItem as any).raw?.source_doc_type === "devis" && (detailsItem as any).raw?.source_doc_save_id)) ? (
                                <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                                  {detailsItem.reopenHref ? (
                                    <button
                                      type="button"
                                      className={styles.btnGhost}
                                      onClick={() => router.push(detailsItem.reopenHref || "/dashboard/mails")}
                                    >
                                      Réouvrir dans l’outil
                                    </button>
                                  ) : null}
                                  {(detailsItem as any).raw?.source_doc_type === "devis" && (detailsItem as any).raw?.source_doc_save_id ? (
                                    <button
                                      type="button"
                                      className={styles.btnGhost}
                                      onClick={() => router.push(`/dashboard/factures/new?fromDevisSaveId=${encodeURIComponent((detailsItem as any).raw.source_doc_save_id)}`)}
                                    >
                                      Créer la facture
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                            </>
                          ) : detailsItem.source === "mail_campaigns" ? (
                            <>
                              <div className={styles.metaGrid}>
                                <div className={styles.metaRow}>
                                  <div className={styles.metaKey}>Boîte d’envoi</div>
                                  <div className={styles.metaVal}>{detailsAccountLabel || "—"}</div>
                                </div>
                                <div className={styles.metaRow}>
                                  <div className={styles.metaKey}>Destinataires</div>
                                  <div className={styles.metaVal}>{(detailsItem as any).raw?.total_count || 0} contact{Number((detailsItem as any).raw?.total_count || 0) > 1 ? "s" : ""}</div>
                                </div>
                                <div className={styles.metaRow}>
                                  <div className={styles.metaKey}>Progression</div>
                                  <div className={styles.metaVal}>{formatCampaignProgress((detailsItem as any).raw || {})}</div>
                                </div>
                                <div className={styles.metaRow}>
                                  <div className={styles.metaKey}>Objet</div>
                                  <div className={styles.metaVal}>{detailsItem.subject || detailsItem.title || "—"}</div>
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                                {isRetryableCampaignItem(detailsItem) ? (
                                  <button
                                    type="button"
                                    className={styles.btnPrimary}
                                    onClick={() => void retryCampaignFailedRecipients(detailsItem.id)}
                                    disabled={campaignActionBusyId === detailsItem.id}
                                  >
                                    {campaignActionBusyId === detailsItem.id ? "Relance…" : "Relancer les échecs"}
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className={styles.btnGhost}
                                  onClick={() => void loadCampaignRecipients(detailsItem.id)}
                                  disabled={campaignRecipientsLoading}
                                >
                                  {campaignRecipientsLoading ? "Actualisation…" : "Rafraîchir le suivi"}
                                </button>
                                {detailsItem.reopenHref ? (
                                  <button
                                    type="button"
                                    className={styles.btnGhost}
                                    onClick={() => router.push(detailsItem.reopenHref || "/dashboard/mails")}
                                  >
                                    Réouvrir dans l’outil
                                  </button>
                                ) : null}
                              </div>
                            </>
                          ) : (
                            <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                              <div className={styles.detailPillsWrap}>
                                {publicationChannelEntries.length ? (
                                  publicationChannelEntries.map((entry, idx) => {
                                    const entryResult = detailsItem.source === "app_events" && payload?.results && typeof payload.results === "object"
                                      ? ((payload.results as any)[entry.key] || null)
                                      : null;
                                    const entryIndicator = getChannelIndicatorMeta(entryResult);
                                    return (
                                      <button
                                        key={`${entry.key}-${idx}`}
                                        type="button"
                                        className={`${styles.channelBubbleBtn} ${activePublicationEntry?.key === entry.key ? styles.channelBubbleBtnActive : ""}`}
                                        onClick={() => setDetailsChannelKey(entry.key)}
                                      >
                                        <span className={styles.channelBubble}>
                                          <span>{entry.label}</span>
                                          {entryIndicator ? (
                                            <span
                                              className={entryIndicator.className}
                                              title={entryIndicator.title}
                                              aria-label={entryIndicator.title}
                                            />
                                          ) : null}
                                        </span>
                                      </button>
                                    );
                                  })
                                ) : (
                                  <span className={styles.metaVal}>—</span>
                                )}
                              </div>
                              {activePublicationEntry ? (
                                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginLeft: "auto" }}>
                                  {detailsEditMode ? (
                                    <button
                                      type="button"
                                      className={styles.btnPrimary}
                                      onClick={saveChannelPublication}
                                      disabled={detailsActionBusy}
                                    >
                                      {detailsActionBusy ? "Enregistrement…" : "Enregistrer"}
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className={styles.btnGhost}
                                      onClick={() => { setDetailsEditMode(true); setDetailsActionError(null); }}
                                      disabled={detailsActionBusy}
                                    >
                                      Modifier
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className={styles.btnDangerSmall}
                                    onClick={deleteChannelPublication}
                                    disabled={detailsActionBusy}
                                  >
                                    {detailsActionBusy && !detailsEditMode ? "Suppression…" : "Supprimer"}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          )}

                          {detailsActionError ? (
                            <div className={styles.detailsError}>
                              <b>Action :</b> {detailsActionError}
                            </div>
                          ) : null}

                          {detailsItem.source === "app_events" && activePublicationFailed && !activePublicationDeleted ? (
                            <div className={styles.detailsError}>
                              <b>Statut :</b> Publication échouée
                            </div>
                          ) : null}

                          {detailsItem.source === "app_events" && activePublicationFailed && activePublicationFailureMessage ? (
                            <div className={styles.detailsError}>
                              <b>Détail :</b> {activePublicationFailureMessage}
                            </div>
                          ) : null}

                          {detailsItem.error ? (
                            <div className={styles.detailsError}>
                              <b>Détail :</b> {detailsItem.error}
                            </div>
                          ) : null}
                        </section>

                        <section className={styles.detailSectionCard}>
                          <div className={styles.detailSectionHeader}>
                            <div className={styles.messageHeaderTitle}>Message</div>
                          </div>

                          {detailsItem.source !== "app_events" ? (
                            <div className={styles.messageBody}>
                              {detailsItem.detailHtml ? (
                                <div className={styles.messageHtml} dangerouslySetInnerHTML={{ __html: detailsItem.detailHtml }} />
                              ) : (
                                <pre className={styles.messageText}>{detailsItem.detailText || ""}</pre>
                              )}
                            </div>
                          ) : activePublicationEntry ? (
                            (() => {
                              const parts = activeParts;
                              const showInstagramHashtags = activePublicationEntry.key === "instagram";
                              const deletedAt = activePublicationResult?.deleted_at ? new Date(String(activePublicationResult.deleted_at)).toLocaleString() : null;
                              const hasAny = !!(parts.title || parts.content || parts.cta || (showInstagramHashtags && parts.hashtags?.length));
                              if (!hasAny && showFallbackMessage) {
                                return (
                                  <div className={styles.messageBody}>
                                    {detailsItem.detailHtml ? (
                                      <div className={styles.messageHtml} dangerouslySetInnerHTML={{ __html: detailsItem.detailHtml }} />
                                    ) : (
                                      <pre className={styles.messageText}>{detailsItem.detailText || ""}</pre>
                                    )}
                                  </div>
                                );
                              }
                              if (!hasAny && !detailsEditMode) return <div className={styles.emptyDetailText}>Aucun message disponible pour ce canal.</div>;
                              return (
                                <article key={activePublicationEntry.key} className={styles.channelPublicationCard}>
                                  {activePublicationDeleted ? (
                                    <div className={styles.detailsError} style={{ marginBottom: 12 }}>
                                      <b>Statut :</b> Supprimé{deletedAt ? ` le ${deletedAt}` : ""}
                                    </div>
                                  ) : null}
                                  <div className={styles.publicationParts}>
                                    {detailsEditMode && !activePublicationDeleted ? (
                                      <>
                                        <div>
                                          <div className={styles.publicationLabel}>Titre</div>
                                          <input
                                            type="text"
                                            value={publicationEditForm.title}
                                            onChange={(e) => setPublicationEditForm((prev) => ({ ...prev, title: e.target.value }))}
                                            className={styles.publicationFieldInput}
                                            placeholder="Titre"
                                            disabled={detailsActionBusy}
                                          />
                                        </div>
                                        <div>
                                          <div className={styles.publicationLabel}>Contenu</div>
                                          <textarea
                                            value={publicationEditForm.content}
                                            onChange={(e) => setPublicationEditForm((prev) => ({ ...prev, content: e.target.value }))}
                                            className={styles.publicationFieldTextarea}
                                            placeholder="Contenu"
                                            rows={8}
                                            disabled={detailsActionBusy}
                                          />
                                        </div>
                                        <div>
                                          <div className={styles.publicationLabel}>CTA</div>
                                          <input
                                            type="text"
                                            value={publicationEditForm.cta}
                                            onChange={(e) => setPublicationEditForm((prev) => ({ ...prev, cta: e.target.value }))}
                                            className={styles.publicationFieldInput}
                                            placeholder="CTA"
                                            disabled={detailsActionBusy}
                                          />
                                        </div>
                                        {activePublicationEntry.key === "instagram" ? (
                                          <div>
                                            <div className={styles.publicationLabel}>Hashtags</div>
                                            <input
                                              type="text"
                                              value={publicationEditForm.hashtags}
                                              onChange={(e) => setPublicationEditForm((prev) => ({ ...prev, hashtags: e.target.value }))}
                                              className={styles.publicationFieldInput}
                                              placeholder="maçonnerie lens btp"
                                              disabled={detailsActionBusy}
                                            />
                                          </div>
                                        ) : null}
                                        <div style={{ display: "grid", gap: 12 }}>
                                          <div className={styles.publicationLabel}>Pièces jointes</div>
                                          <input
                                            id={publicationEditFileInputId}
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            className={styles.hiddenFileInput}
                                            onChange={(e) => {
                                              addPublicationFiles(e.target.files);
                                              e.currentTarget.value = "";
                                            }}
                                          />
                                          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                            <label htmlFor={publicationEditFileInputId} className={styles.btnAttach}>📎 Ajouter des images</label>
                                            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
                                              {activePublicationEditAssets.length} image(s) pour {activePublicationEntry?.label || "ce canal"}
                                            </span>
                                          </div>


                                          <div style={{ display: "grid", gap: 8 }}>
                                            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                                              Cochez les images à publier puis ouvrez la retouche uniquement quand vous voulez recadrer une image.
                                            </div>
                                            <ChannelImageRetouchCardsPanel
                                              tabs={[{ key: activePublicationEditChannelKey, label: activePublicationEntry?.label || formatChannelLabel(activePublicationEditChannelKey) }]}
                                              activeChannel={activePublicationEditChannelKey}
                                              onActiveChannelChange={() => {}}
                                              channelTitle={activePublicationEntry?.label || formatChannelLabel(activePublicationEditChannelKey)}
                                              formatLabel={`Format final : ${activePublicationEditPreset.width}×${activePublicationEditPreset.height}`}
                                              aspectRatio={`${activePublicationEditPreset.width} / ${activePublicationEditPreset.height}`}
                                              items={activePublicationEditAssets.map((asset, index) => ({
                                                key: asset.key,
                                                previewUrl: asset.previewUrl,
                                                included: asset.selected,
                                                title: `Image ${index + 1}`,
                                                subtitle: asset.selected ? "Publiée sur ce canal" : "Non publiée sur ce canal",
                                                fitLabel: asset.transform.fit === "cover" ? "Remplir" : "Adapter",
                                                backgroundMode: getPublicationBackgroundMode(asset.transform),
                                                onToggle: () => togglePublicationImage(activePublicationEditChannelKey, asset.key),
                                                onRetouch: () => openPublicationRetouch(activePublicationEditChannelKey, asset.key),
                                                onRemove: () => removePublicationImage(activePublicationEditChannelKey, asset.key),
                                              }))}
                                              buttonClassName={styles.btnGhost}
                                              pillButtonStyle={pillBtn}
                                              pillButtonActiveStyle={pillBtnActive}
                                              showTabs={false}
                                              emptyMessage="Aucune image pour ce canal."
                                            />
                                          </div>
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        {parts.title ? (
                                          <div>
                                            <div className={styles.publicationLabel}>Titre</div>
                                            <div className={styles.publicationValue}>{parts.title}</div>
                                          </div>
                                        ) : null}
                                        {parts.content ? (
                                          <div>
                                            <div className={styles.publicationLabel}>Contenu</div>
                                            <pre className={styles.publicationPre}>{parts.content}</pre>
                                          </div>
                                        ) : null}
                                        {parts.cta ? (
                                          <div>
                                            <div className={styles.publicationLabel}>CTA</div>
                                            <div className={styles.publicationCtaBox}>{parts.cta}</div>
                                          </div>
                                        ) : null}
                                        {activePublicationEntry.key === "instagram" && parts.hashtags && parts.hashtags.length ? (
                                          <div>
                                            <div className={styles.publicationLabel}>Hashtags</div>
                                            <div className={styles.publicationTagRow}>
                                              {parts.hashtags.map((t, idx) => (
                                                <span key={idx} className={styles.publicationTag}>#{t.replace(/^#/, "")}</span>
                                              ))}
                                            </div>
                                          </div>
                                        ) : null}
                                      </>
                                    )}
                                  </div>
                                </article>
                              );
                            })()
                          ) : showFallbackMessage ? (
                            <div className={styles.messageBody}>
                              {detailsItem.detailHtml ? (
                                <div className={styles.messageHtml} dangerouslySetInnerHTML={{ __html: detailsItem.detailHtml }} />
                              ) : (
                                <pre className={styles.messageText}>{detailsItem.detailText || ""}</pre>
                              )}
                            </div>
                          ) : (
                            <div className={styles.emptyDetailText}>Aucun message disponible.</div>
                          )}
                        </section>

                        {detailsItem.source === "mail_campaigns" ? (
                          <section className={styles.detailSectionCard}>
                            <div className={styles.detailSectionHeader}>
                              <div className={styles.messageHeaderTitle}>Suivi destinataires</div>
                            </div>
                            {campaignRecipientsLoading ? (
                              <div style={{ color: "rgba(255,255,255,0.68)" }}>Chargement des destinataires…</div>
                            ) : campaignRecipients.length === 0 ? (
                              <div style={{ color: "rgba(255,255,255,0.68)" }}>Aucun destinataire chargé.</div>
                            ) : (
                              <>
                                <div className={styles.attachmentsList}>
                                {campaignRecipients.map((recipient) => {
                                  const attemptLabel = recipient.attempt_count != null && recipient.max_attempts != null
                                    ? `Tentative ${recipient.attempt_count}/${recipient.max_attempts}`
                                    : null;
                                  const statusLabel = recipient.status === "sent"
                                    ? recipient.sent_at
                                      ? `Envoyé • ${new Date(recipient.sent_at).toLocaleString()}`
                                      : "Envoyé"
                                    : recipient.status === "failed"
                                    ? "Échec final"
                                    : recipient.status === "processing"
                                    ? "En cours"
                                    : recipient.next_attempt_at
                                    ? `En attente • prochain essai ${new Date(recipient.next_attempt_at).toLocaleString()}`
                                    : "En attente";
                                  return (
                                    <div key={recipient.id} className={styles.attachmentItem}>
                                      <span className={styles.attachmentName}>{recipient.display_name ? `${recipient.display_name} — ${recipient.email}` : recipient.email}</span>
                                      <span className={styles.attachmentMeta}>{statusLabel}</span>
                                      {attemptLabel ? <span className={styles.attachmentMeta}>{attemptLabel}</span> : null}
                                      {recipient.last_error || recipient.error ? (
                                        <span className={styles.attachmentMeta} style={{ color: "#ffb0b0" }}>{recipient.last_error || recipient.error}</span>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                                <div style={{ color: "rgba(255,255,255,0.68)", fontSize: 12 }}>
                                  {campaignRecipientsTotal > 0
                                    ? `Affichage ${(campaignRecipientsPage - 1) * MAILBOX_RECIPIENTS_PAGE_SIZE + 1}–${Math.min(campaignRecipientsPage * MAILBOX_RECIPIENTS_PAGE_SIZE, campaignRecipientsTotal)} sur ${campaignRecipientsTotal}`
                                    : "Aucun destinataire"}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                  <button
                                    type="button"
                                    className={styles.btnGhost}
                                    onClick={() => setCampaignRecipientsPage((prev) => Math.max(1, prev - 1))}
                                    disabled={campaignRecipientsPage <= 1 || campaignRecipientsLoading}
                                  >
                                    ← Précédent
                                  </button>
                                  <div style={{ color: "rgba(255,255,255,0.82)", fontSize: 12 }}>
                                    Page {campaignRecipientsPage} / {campaignRecipientsPageCount}
                                  </div>
                                  <button
                                    type="button"
                                    className={styles.btnGhost}
                                    onClick={() => setCampaignRecipientsPage((prev) => Math.min(campaignRecipientsPageCount, prev + 1))}
                                    disabled={campaignRecipientsPage >= campaignRecipientsPageCount || campaignRecipientsLoading}
                                  >
                                    Suivant →
                                  </button>
                                </div>
                                </div>
                              </>
                            )}
                          </section>
                        ) : null}

                        {hasAttachments ? (
                          <section className={styles.detailSectionCard}>
                            <div className={styles.detailSectionHeader}>
                              <div className={styles.messageHeaderTitle}>Pièces jointes</div>
                            </div>

                            <div className={styles.attachmentsPanel}>
                              {imageAttachments.length ? (
                                <div className={styles.attachmentGallery}>
                                  {imageAttachments.map((a, idx) => (
                                    <a
                                      key={`${a.url || a.name}-${idx}`}
                                      className={styles.attachmentPreviewCard}
                                      href={a.url || undefined}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      <img src={a.url || ""} alt={a.name || `Pièce jointe ${idx + 1}`} className={styles.attachmentPreviewImage} />
                                      <div className={styles.attachmentPreviewCaption}>{a.name}</div>
                                    </a>
                                  ))}
                                </div>
                              ) : null}

                              {videoAttachments.length ? (
                                <div className={styles.attachmentGallery}>
                                  {videoAttachments.map((a, idx) => (
                                    <div key={`${a.url || a.name}-${idx}`} className={styles.attachmentPreviewCard}>
                                      <video
                                        src={a.url || ""}
                                        className={styles.attachmentPreviewImage}
                                        controls
                                        preload="metadata"
                                      />
                                      <div className={styles.attachmentPreviewCaption}>{a.name}</div>
                                    </div>
                                  ))}
                                </div>
                              ) : null}

                              {fileAttachments.length ? (
                                <div className={styles.attachmentsList}>
                                  {fileAttachments.map((a, idx) => (
                                    <div key={`${a.url || a.name}-${idx}`} className={styles.attachmentItem}>
                                      <span className={styles.attachmentName}>{a.name}</span>
                                      {a.type ? <span className={styles.attachmentMeta}>{a.type}</span> : null}
                                      {typeof a.size === "number" ? <span className={styles.attachmentMeta}>{Math.round(a.size / 1024)} Ko</span> : null}
                                      {a.url ? (
                                        <a className={styles.attachmentLink} href={a.url} target="_blank" rel="noreferrer">
                                          Ouvrir
                                        </a>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </section>
                        ) : null}
                      </div>

                      {detailsItem.source === "send_items" && (detailsItem as any).raw?.status === "draft" ? (
                        <div style={{ marginTop: 14, color: "rgba(255,255,255,0.62)", fontSize: 12 }}>
                          Astuce : clique sur ce brouillon dans la liste pour l’ouvrir en édition.
                        </div>
                      ) : null}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        ) : null}

        {detailsOpen && detailsEditMode && publicationRetouchAsset && publicationRetouchChannelKey ? (() => {
          const channel = publicationRetouchChannelKey;
          const preset = getPublicationChannelPreset(channel);
          const transform = publicationRetouchAsset.transform;
          const imageMeta = publicationRetouchImageMeta[publicationRetouchAsset.key];
          const previewLayout = computePublicationPreviewLayout({
            containerWidth: publicationRetouchStageSize.width,
            containerHeight: publicationRetouchStageSize.height,
            imageWidth: imageMeta?.width || 0,
            imageHeight: imageMeta?.height || 0,
            transform,
          });
          const backgroundMode = getPublicationBackgroundMode(transform);
          const zoomLabel = `zoom ${Number(transform.zoom || 1).toFixed(2)}×`;
          return (
            <ChannelImageRetouchModal
              open
              title={`Retoucher ${publicationRetouchAsset.name}`}
              subtitle={`${formatChannelLabel(channel)} • ${preset.width}×${preset.height}`}
              aspectRatio={`${preset.width} / ${preset.height}`}
              backgroundMode={backgroundMode}
              backgroundColor={publicationRetouchAsset.transform.backgroundColor}
              fitLabel={transform.fit === "cover" ? "Remplir" : "Adapter"}
              zoomLabel={zoomLabel}
              previewSrc={publicationRetouchAsset.previewUrl}
              previewLayout={previewLayout}
              previewRef={publicationRetouchStageRef}
              isDragging={isPublicationRetouchDragging}
              onClose={closePublicationRetouch}
              buttonClassName={styles.btnGhost}
              primaryButtonClassName={styles.btnPrimary}
              onWheel={(event) => {
                if (!publicationRetouchStageRef.current || !imageMeta?.width || !imageMeta?.height) return;
                event.preventDefault();
                const rect = publicationRetouchStageRef.current.getBoundingClientRect();
                const pointerX = event.clientX - rect.left;
                const pointerY = event.clientY - rect.top;
                const nextZoom = publicationClamp((transform.zoom || 1) + (event.deltaY < 0 ? 0.08 : -0.08), 0.4, 3);
                const nextLayout = computePublicationPreviewLayout({
                  containerWidth: rect.width,
                  containerHeight: rect.height,
                  imageWidth: imageMeta.width,
                  imageHeight: imageMeta.height,
                  transform: { ...transform, zoom: nextZoom },
                });
                const currentDrawW = previewLayout.drawW || nextLayout.drawW;
                const currentDrawH = previewLayout.drawH || nextLayout.drawH;
                const ux = currentDrawW ? (pointerX - previewLayout.dx) / currentDrawW : 0.5;
                const uy = currentDrawH ? (pointerY - previewLayout.dy) / currentDrawH : 0.5;
                const nextDx = pointerX - ux * nextLayout.drawW;
                const nextDy = pointerY - uy * nextLayout.drawH;
                const offsets = offsetFromPublicationDrawPosition({
                  containerWidth: rect.width,
                  containerHeight: rect.height,
                  drawW: nextLayout.drawW,
                  drawH: nextLayout.drawH,
                  dx: nextDx,
                  dy: nextDy,
                });
                updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: { ...asset.transform, zoom: nextZoom, ...offsets } } : asset));
              }}
              onPointerDown={(event) => {
                publicationRetouchDragRef.current = {
                  channel,
                  imageKey: publicationRetouchAsset.key,
                  startX: event.clientX,
                  startY: event.clientY,
                  startOffsetX: transform.offsetX || 0,
                  startOffsetY: transform.offsetY || 0,
                };
                setIsPublicationRetouchDragging(true);
                event.currentTarget.setPointerCapture?.(event.pointerId);
              }}
              onPointerMove={(event) => {
                const drag = publicationRetouchDragRef.current;
                if (!drag || drag.imageKey !== publicationRetouchAsset.key) return;
                const maxX = Math.abs(previewLayout.drawW - publicationRetouchStageSize.width) / 2;
                const maxY = Math.abs(previewLayout.drawH - publicationRetouchStageSize.height) / 2;
                const nextOffsetX = maxX ? publicationClamp(drag.startOffsetX - ((event.clientX - drag.startX) / maxX) * 100, -100, 100) : 0;
                const nextOffsetY = maxY ? publicationClamp(drag.startOffsetY - ((event.clientY - drag.startY) / maxY) * 100, -100, 100) : 0;
                updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: { ...asset.transform, offsetX: nextOffsetX, offsetY: nextOffsetY } } : asset));
              }}
              onPointerUp={(event) => {
                if (publicationRetouchDragRef.current) {
                  event.currentTarget.releasePointerCapture?.(event.pointerId);
                }
                publicationRetouchDragRef.current = null;
                setIsPublicationRetouchDragging(false);
              }}
              onPointerCancel={(event) => {
                if (publicationRetouchDragRef.current) {
                  event.currentTarget.releasePointerCapture?.(event.pointerId);
                }
                publicationRetouchDragRef.current = null;
                setIsPublicationRetouchDragging(false);
              }}
              onZoomOut={() => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: { ...asset.transform, zoom: publicationClamp((asset.transform.zoom || 1) - 0.08, 0.4, 3) } } : asset))}
              onZoomIn={() => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: { ...asset.transform, zoom: publicationClamp((asset.transform.zoom || 1) + 0.08, 0.4, 3) } } : asset))}
              onContain={() => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: withPublicationBackgroundMode({ ...asset.transform, fit: "contain", zoom: 1, offsetX: 0, offsetY: 0 }, getPublicationBackgroundMode(asset.transform)) } : asset))}
              onCover={() => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: withPublicationBackgroundMode({ ...asset.transform, fit: "cover", zoom: 1, offsetX: 0, offsetY: 0 }, "black") } : asset))}
              onReset={() => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: buildPublicationDefaultTransform(channel) } : asset))}
              onDoubleClick={() => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: { ...asset.transform, offsetX: 0, offsetY: 0 } } : asset))}
              onSave={closePublicationRetouch}
              onBackgroundModeChange={(mode) => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: mode === "blur" ? withPublicationBackgroundMode({ ...asset.transform, fit: "contain" }, "blur") : mode === "transparent" ? withPublicationBackgroundMode({ ...asset.transform, fit: "contain" }, "transparent") : { ...withPublicationBackgroundMode({ ...asset.transform, fit: "contain" }, "color"), backgroundColor: asset.transform.backgroundColor || "#e8f6ff" } } : asset))}
              onBackgroundColorChange={(color) => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: { ...withPublicationBackgroundMode({ ...asset.transform, fit: "contain" }, "color"), backgroundColor: color } } : asset))}
              designState={getPublicationDesign(publicationRetouchAsset.transform)}
              onDesignChange={(patch) => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: { ...asset.transform, design: { ...getPublicationDesign(asset.transform), ...patch } } } : asset))}
              pillButtonStyle={pillBtn}
              pillButtonActiveStyle={pillBtnActive}
              sidebarItems={(publicationEditImagesByChannel[channel]?.assets || []).map((asset, index) => ({
                key: asset.key,
                previewUrl: asset.previewUrl,
                title: `Image ${index + 1}`,
                subtitle: asset.selected ? "Publiée sur ce canal" : "Non publiée sur ce canal",
                active: asset.key === publicationRetouchAsset.key,
                onClick: () => setPublicationRetouchImageKey(asset.key),
              }))}
            />
          );
        })() : null}

        {/* Compose modal */}
        {composeOpen ? (
          <div className={styles.modalOverlay} onClick={() => setComposeOpen(false)}>
            <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: "rgba(255,255,255,0.95)" }}>
                    {draftId ? "Éditer le brouillon" : "Nouveau message"}
                  </div>
                  <span className={styles.badge} style={{ opacity: 0.9 }}>Mail</span>
                </div>

                <button className={styles.btnGhost} onClick={() => setComposeOpen(false)} type="button">
                  ✕
                </button>
              </div>

              <div className={styles.modalBody}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.72)" }}>Boîte d’envoi :</div>
                    <select
                      className={styles.selectDark}
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      style={{
                        width: "min(520px, 100%)",
                        flex: "1 1 280px",
                        minWidth: 0,
                        paddingRight: 36,
                        boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
                      }}
                    >
                      {mailAccounts.map((a) => (
                        <option key={a.id} value={a.id} style={{ background: "#ffffff", color: "#0b1020" }}>
                          {(a.display_name ? `${a.display_name} — ` : "") + a.email_address + ` (${a.provider})`}
                        </option>
                      ))}
                    </select>
                    {selectedAccount ? (
                      <span className={`${styles.badge} ${pill(selectedAccount.provider).cls}`}>{pill(selectedAccount.provider).label}</span>
                    ) : null}
                  </div>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>À</span>
                    <input
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      placeholder="email@exemple.com, autre@exemple.com"
                      style={inputStyle}
                    />
                    {isBulkCampaignCompose ? (
                      <span style={{ fontSize: 12, color: "rgba(125,211,252,0.95)" }}>
                        {composeRecipientList.length} destinataires détectés : iNr’SEND lancera une campagne avec un envoi individuel par contact.
                      </span>
                    ) : null}
                  </label>

                  {/* CRM picker (dropdown + checkboxes) */}
                  <div style={{ display: "grid", gap: 8 }}>
                    <button
                      type="button"
                      className={styles.btnGhost}
                      onClick={() => setCrmPickerOpen((v) => !v)}
                      style={{
                        justifyContent: "space-between",
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 14,
                        borderColor: "rgba(255,255,255,0.14)",
                        background: "rgba(0,0,0,0.18)",
                      }}
                    >
                      <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.78)", fontWeight: 700 }}>Contacts CRM</span>
                        <span className={styles.badge} style={{ opacity: 0.9 }}>
                          {selectedCrmCount} sélectionné{selectedCrmCount > 1 ? "s" : ""}
                        </span>
                      </span>
                      <span style={{ opacity: 0.85 }}>{crmPickerOpen ? "▴" : "▾"}</span>
                    </button>

                    {crmPickerOpen ? (
                      <div
                        style={{
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: 14,
                          padding: 10,
                          background: "rgba(0,0,0,0.16)",
                        }}
                      >
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                          
                          <div className={styles.crmFilterRow}>
                            <select
                              value={crmCategory ?? "all"}
                              onChange={(e) => setCrmCategory(e.target.value as any)}
                              className={styles.crmSelect}
                              title="Filtrer par catégorie"
                            >
                              <option value="all">Catégories</option>
                              <option value="particulier">Particuliers</option>
                              <option value="professionnel">Professionnels</option>
                              <option value="collectivite_publique">Collectivités</option>
                            </select>

                            <select
                              value={crmContactType ?? "all"}
                              onChange={(e) => setCrmContactType(e.target.value as any)}
                              className={styles.crmSelect}
                              title="Filtrer par type"
                            >
                              <option value="all">Types</option>
                              <option value="client">Clients</option>
                              <option value="prospect">Prospects</option>
                              <option value="fournisseur">Fournisseurs</option>
                              <option value="partenaire">Partenaires</option>
                              <option value="autre">Autres</option>
                            </select>

                            <button
                              type="button"
                              className={`${styles.toolbarBtn} ${styles.toolbarIconBtn} ${styles.crmIconBtn}`}
                              onClick={() => {
                                setCrmSearchOpen((v) => !v);
                                // focus next tick (after render)
                                setTimeout(() => crmSearchRef.current?.focus(), 0);
                              }}
                              title="Rechercher"
                              aria-label="Rechercher"
                            >
                              <span className={styles.iconWrap}>
                                🔎
                                {!crmSearchOpen && crmFilter.trim() ? <span className={styles.searchDot} /> : null}
                              </span>
                            </button>

                            <button
                              type="button"
                              className={`${styles.toolbarBtn} ${styles.toolbarIconBtn} ${styles.crmIconBtn} ${styles.starToggleBtn} ${
                                crmImportantOnly ? styles.starActive : styles.starInactive
                              }`}
                              onClick={() => setCrmImportantOnly((v) => !v)}
                              title={crmImportantOnly ? "Important uniquement" : "Tous les contacts"}
                              aria-label="Important"
                            >
                              {crmImportantOnly ? "★" : "☆"}
                            </button>
                          </div>

                          {crmSearchOpen ? (
                            <div className={styles.crmSearchRow}>
                              <input
                                ref={crmSearchRef}
                                value={crmFilter}
                                onChange={(e) => setCrmFilter(e.target.value)}
                                placeholder="Rechercher…"
                                className={styles.crmSearchInput}
                              />
                              {crmFilter.trim() ? (
                                <button
                                  type="button"
                                  className={styles.searchClearBtn}
                                  onClick={() => {
                                    setCrmFilter("");
                                    setTimeout(() => crmSearchRef.current?.focus(), 0);
                                  }}
                                  aria-label="Effacer la recherche"
                                  title="Effacer"
                                >
                                  ×
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className={styles.btnGhost}
                                onClick={() => setCrmSearchOpen(false)}
                                style={{ padding: "8px 10px" }}
                                aria-label="Fermer la recherche"
                                title="Fermer"
                              >
                                ✕
                              </button>
                            </div>
                          ) : null}

                        </div>

                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className={styles.btnGhost}
                            onClick={() => {
                              const current = normalizeEmails(to);
                              const setLower = new Set(current.map((e) => e.toLowerCase()));
                              const add = filteredContacts
                                .map((c) => c.email)
                                .filter(Boolean)
                                .map((e) => String(e));
                              const next = [...current];
                              for (const e of add) {
                                if (!setLower.has(e.toLowerCase())) {
                                  next.push(e);
                                  setLower.add(e.toLowerCase());
                                }
                              }
                              setTo(next.join(", "));
                            }}
                            disabled={crmLoading || filteredContacts.length === 0}
                          >
                            Tout sélectionner
                          </button>
                          <button
                            type="button"
                            className={styles.btnGhost}
                            onClick={() => {
                              const removeSet = new Set(
                                filteredContacts
                                  .map((c) => c.email)
                                  .filter(Boolean)
                                  .map((e) => String(e).toLowerCase())
                              );
                              const current = normalizeEmails(to);
                              const next = current.filter((e) => !removeSet.has(e.toLowerCase()));
                              setTo(next.join(", "));
                            }}
                            disabled={crmLoading || filteredContacts.length === 0}
                          >
                            Tout désélectionner
                          </button>
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
                            {filteredContacts.length} contact{filteredContacts.length > 1 ? "s" : ""} (filtrés)
                          </div>
                        </div>

                        <div
                          style={{
                            marginTop: 10,
                            border: "1px solid rgba(255,255,255,0.10)",
                            borderRadius: 12,
                            padding: 8,
                            maxHeight: 190,
                            overflow: "auto",
                          }}
                        >
                          {crmLoading ? (
                            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>Chargement des contacts…</div>
                          ) : crmError ? (
                            <div style={{ display: "grid", gap: 8 }}>
                              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.72)" }}>{crmError}</div>
                              <button
                                className={styles.btnPrimary}
                                type="button"
                                onClick={() => void loadCrmContacts()}
                                style={{ width: "fit-content" }}
                              >
                                Réessayer
                              </button>
                            </div>
                          ) : filteredContacts.length === 0 ? (
                            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>Aucun contact.</div>
                          ) : (
                            <div style={{ display: "grid", gap: 6 }}>
                              {filteredContacts.slice(0, 200).map((c) => {
                                const email = c.email ? String(c.email) : "";
                                const checked = email ? selectedToSet.has(email.toLowerCase()) : false;
                                return (
                                  <label
                                    key={c.id}
                                    style={{
                                      display: "flex",
                                      gap: 10,
                                      alignItems: "center",
                                      padding: "8px 10px",
                                      borderRadius: 12,
                                      border: "1px solid rgba(255,255,255,0.10)",
                                      background: checked ? "rgba(56,189,248,0.10)" : "rgba(0,0,0,0.10)",
                                      cursor: email ? "pointer" : "not-allowed",
                                      opacity: email ? 1 : 0.6,
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      disabled={!email}
                                      checked={checked}
                                      onChange={() => {
                                        if (!email) return;
                                        toggleEmailInTo(email);
                                      }}
                                    />
                                    <div style={{ display: "grid", lineHeight: 1.15 }}>
                                      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.92)", fontWeight: 700 }}>
                                        {c.full_name || "(Sans nom)"}
                                        {c.important ? <span style={{ marginLeft: 8, opacity: 0.75 }}>★</span> : null}
                                      </div>
                                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.70)" }}>{email}</div>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>Objet</span>
                    <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Objet" style={inputStyle} />
                  </label>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>Message (texte)</span>
                    <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} style={textareaStyle} />
                    {signatureEnabled && signatureImageUrl ? (
                      <div
                        style={{
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(255,255,255,0.04)",
                          padding: 10,
                        }}
                      >
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)", marginBottom: 8 }}>
                          Image de signature ajoutée automatiquement au mail :
                        </div>
                        <img
                          src={signatureImageUrl}
                          alt="Signature automatique"
                          style={{ width: `${signatureImageWidth}px`, maxWidth: "100%", maxHeight: 220, objectFit: "contain", borderRadius: 10, display: "block" }}
                        />
                      </div>
                    ) : null}
                  </label>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>Pièces jointes</span>
                    <input
                      id={fileInputId}
                      type="file"
                      multiple
                      onChange={async (e) => {
                        const next = Array.from(e.target.files || []);
                        setFiles(next);
                        if (!next.length) return;
                        try {
                          const uploaded = await uploadComposeFiles(next);
                          setComposeAttachments((prev) => {
                            const merged = [...prev];
                            for (const item of uploaded) {
                              const exists = merged.some((x) => x.bucket === item.bucket && x.path === item.path);
                              if (!exists) merged.push(item);
                            }
                            return merged;
                          });
                        } catch (err) {
                          console.error("Attachment upload failed", err);
                          setToast("Impossible de préparer cette pièce jointe. Veuillez vérifier son format ou sa taille.");
                        } finally {
                          e.currentTarget.value = "";
                          setFiles([]);
                        }
                      }}
                      className={styles.hiddenFileInput}
                    />

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <label htmlFor={fileInputId} className={styles.btnAttach}>
                        📎 Joindre
                      </label>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
                        {composeAttachments.length > 0 ? `${composeAttachments.length} fichier(s)` : attachBusy ? "Préparation des fichiers..." : "Aucun fichier"}
                      </span>
                    </div>

                    {composeAttachments.length > 0 ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {composeAttachments.map((f, idx) => (
                          <span key={`${f.bucket}:${f.path}:${idx}`} className={styles.fileChip} title={f.name}>
                            {f.name}
                            <button
                              type="button"
                              className={styles.fileChipRemove}
                              onClick={() => setComposeAttachments((prev) => prev.filter((_, i) => i !== idx))}
                              aria-label={`Retirer ${f.name}`}
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </label>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button className={styles.btnGhost} onClick={saveDraft} type="button" disabled={sendBusy}>
                  💾 Sauvegarder brouillon
                </button>
                <button className={styles.btnPrimary} onClick={doSend} type="button" disabled={sendBusy}>
                  {sendBusy ? "Envoi…" : "Envoyer"}
                </button>
              </div>

              {toast ? (
                <div style={{ padding: "10px 14px", color: "rgba(255,255,255,0.75)", fontSize: 12 }}>
                  {toast}{" "}
                  <button className={styles.btnGhost} onClick={() => setToast(null)} type="button">
                    OK
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "rgba(0,0,0,0.22)",
  border: "1px solid rgba(255,255,255,0.18)",
  color: "rgba(255,255,255,0.92)",
  borderRadius: 12,
  padding: "10px 12px",
  outline: "none",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  fontFamily: "inherit",
};
