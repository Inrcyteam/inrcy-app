import StatusMessage from "../../_components/StatusMessage";
import { useEffect, useMemo, useRef, useState } from "react";
import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import { buildBoosterGmbSummary, buildBoosterInstagramCaption, getCtaMode, type BoosterCtaMode } from "@/lib/boosterCta";
import stylesDash from "../../dashboard/dashboard.module.css";
import { ChannelImageRetouchCardsPanel, ChannelImageRetouchModal } from "@/app/dashboard/_components/ChannelImageRetouchTool";

type ChannelKey = "inrcy_site" | "site_web" | "gmb" | "facebook" | "instagram" | "linkedin";
type DisplayKey = "site" | "gmb" | "facebook" | "instagram" | "linkedin";
type ThemeKey = "" | "promotion" | "information" | "conseil" | "avis_client" | "realisation" | "actualite" | "autre";
type StyleKey = "sobre" | "equilibre" | "dynamique";
type FitMode = "contain" | "cover";
type BackgroundMode = "blur" | "transparent" | "color" | "white" | "black" | "gray" | "sand" | "brand";
type DesignPosition = "top" | "center" | "bottom";
type ImageDesign = { enabled: boolean; text: string; color: string; background: string; position: DesignPosition; size: number; x?: number; y?: number; };

type ChannelPost = {
  title: string;
  content: string;
  cta: string;
  ctaMode?: BoosterCtaMode;
  ctaUrl?: string;
  ctaPhone?: string;
  hashtags?: string[];
};

type BoosterCtaDefaults = {
  preferredWebsiteUrl: string;
  preferredWebsiteLabel: string;
  siteWebUrl: string;
  inrcySiteUrl: string;
  phone: string;
};

type ImagePayload = {
  name: string;
  type: string;
  dataUrl?: string;
  storagePath?: string;
  publicUrl?: string;
};

type ImageTransform = {
  fit: FitMode;
  zoom: number;
  offsetX: number;
  offsetY: number;
  blurBackground: boolean;
  backgroundMode?: BackgroundMode;
  backgroundColor?: string;
  design?: ImageDesign;
};

type ImageMeta = {
  width: number;
  height: number;
  ratio: number;
};

type ChannelImageEditorState = {
  imageKeys: string[];
  transforms: Record<string, ImageTransform>;
};

type ChannelImagePayload = Record<ChannelKey, ImagePayload[]>;
type ChannelImageSettingsPayload = Record<ChannelKey, { imageKeys: string[]; transforms: Record<string, ImageTransform> }>;

type RenderPreset = {
  width: number;
  height: number;
  defaultFit: FitMode;
  defaultBlurBackground: boolean;
};

type PreviewLayout = {
  drawW: number;
  drawH: number;
  dx: number;
  dy: number;
  maxX: number;
  maxY: number;
};

const DEFAULT_DESIGN: ImageDesign = { enabled: false, text: "", color: "#ffffff", background: "#111827", position: "bottom", size: 30, x: 50, y: 88 };

const DEFAULT_TRANSFORM: ImageTransform = {
  fit: "contain",
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  blurBackground: false,
  backgroundMode: "color",
  backgroundColor: "#e8f6ff",
  design: DEFAULT_DESIGN,
};

const DISPLAY_LABELS: Record<DisplayKey, string> = {
  site: "Site internet",
  gmb: "Google Business",
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
};

const CHANNEL_LABELS: Record<ChannelKey, string> = {
  inrcy_site: "Site iNrCy",
  site_web: "Site web",
  gmb: "Google Business",
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
};

const CHANNEL_PRESETS: Record<ChannelKey, RenderPreset> = {
  inrcy_site: { width: 1440, height: 900, defaultFit: "contain", defaultBlurBackground: false },
  site_web: { width: 1440, height: 900, defaultFit: "contain", defaultBlurBackground: false },
  gmb: { width: 1200, height: 900, defaultFit: "contain", defaultBlurBackground: false },
  facebook: { width: 1200, height: 1200, defaultFit: "cover", defaultBlurBackground: false },
  instagram: { width: 1080, height: 1350, defaultFit: "cover", defaultBlurBackground: false },
  linkedin: { width: 1200, height: 1200, defaultFit: "cover", defaultBlurBackground: false },
};

const BOOSTER_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const BOOSTER_MAX_IMAGE_MB_LABEL = "8 Mo";

type TextFieldKey = "title" | "content" | "cta" | "hashtags";
type LimitTone = "ok" | "warn" | "over";

type ChannelTextGuidelines = {
  title: number;
  content: number;
  cta: number;
  hashtags?: number;
  totalLabel?: string;
  totalMax?: number;
  totalValue?: (post: ChannelPost) => number;
};

const CHANNEL_TEXT_GUIDELINES: Record<DisplayKey, ChannelTextGuidelines> = {
  site: {
    title: 90,
    content: 6000,
    cta: 180,
  },
  gmb: {
    title: 90,
    content: 2000,
    cta: 80,
    totalLabel: "Résumé final Google Business",
    totalMax: 1498,
    totalValue: (post) => buildBoosterGmbSummary(post).length,
  },
  facebook: {
    title: 90,
    content: 5000,
    cta: 180,
  },
  instagram: {
    title: 90,
    content: 2000,
    cta: 180,
    hashtags: 20,
    totalLabel: "Légende Instagram finale",
    totalMax: 2200,
    totalValue: (post) => buildInstagramPreviewCaption(post).length,
  },
  linkedin: {
    title: 90,
    content: 3000,
    cta: 180,
  },
};
const CTA_MODE_OPTIONS: Record<DisplayKey, Array<{ value: BoosterCtaMode; label: string }>> = {
  site: [
    { value: "none", label: "Aucun CTA" },
    { value: "website", label: "Lien site / devis" },
    { value: "call", label: "Appel" },
    { value: "message", label: "Message privé" },
    { value: "custom", label: "Texte libre" },
  ],
  gmb: [
    { value: "none", label: "Aucun CTA" },
    { value: "website", label: "Bouton site" },
    { value: "call", label: "Bouton appel" },
    { value: "custom", label: "Texte simple" },
  ],
  facebook: [
    { value: "none", label: "Aucun CTA" },
    { value: "website", label: "Lien site / devis" },
    { value: "call", label: "Appel" },
    { value: "message", label: "Message privé" },
    { value: "custom", label: "Texte libre" },
  ],
  instagram: [
    { value: "none", label: "Aucun CTA" },
    { value: "website", label: "Lien site" },
    { value: "call", label: "Appel" },
    { value: "message", label: "Message privé" },
    { value: "custom", label: "Texte libre" },
  ],
  linkedin: [
    { value: "none", label: "Aucun CTA" },
    { value: "website", label: "Lien site / devis" },
    { value: "call", label: "Appel" },
    { value: "message", label: "Message privé" },
    { value: "custom", label: "Texte libre" },
  ],
};

function getCtaModeHelp(channel: DisplayKey, mode: BoosterCtaMode) {
  if (mode === "none") return "Aucun bloc CTA ne sera ajouté à la fin du texte.";
  if (mode === "website") return channel === "gmb"
    ? "Un vrai bouton Google Business sera utilisé quand une URL de site est disponible."
    : "Le lien du site sera ajouté proprement à la fin du contenu. Vous pouvez laisser l’URL vide pour utiliser le site connecté par défaut.";
  if (mode === "call") return channel === "gmb"
    ? "Un vrai bouton Appeler sera utilisé si un numéro est disponible."
    : "Une phrase d’appel naturelle sera ajoutée avec le numéro si disponible.";
  if (mode === "message") return "Une phrase naturelle du type “Envoyez-nous un message privé.” sera ajoutée.";
  return channel === "gmb"
    ? "Réservé à un court texte neutre, sans faux bouton."
    : "Texte libre. Évitez les CTA vagues du type “Message” sans destination réelle.";
}

function getDefaultPost(): ChannelPost {
  return { title: "", content: "", cta: "", ctaMode: "none", ctaUrl: "", ctaPhone: "", hashtags: [] };
}

function getChannelDefaultCtaLabel(channel: DisplayKey, mode: BoosterCtaMode) {
  if (mode === "website") {
    if (channel === "site") return "Demander un devis";
    if (channel === "gmb") return "Voir le site";
    if (channel === "instagram") return "Lien du site";
    return "Voir le site";
  }
  if (mode === "call") {
    return channel === "gmb" ? "Appeler" : "Appelez-nous";
  }
  return "";
}

function buildAutoPrefillPatch(channel: DisplayKey, mode: BoosterCtaMode, post: ChannelPost, defaults: BoosterCtaDefaults | null): Partial<ChannelPost> {
  const patch: Partial<ChannelPost> = { ctaMode: mode };
  if (!defaults) return patch;

  if (mode === "website") {
    if (!String(post.cta || "").trim()) patch.cta = getChannelDefaultCtaLabel(channel, mode);
    if (!String(post.ctaUrl || "").trim() && defaults.preferredWebsiteUrl) patch.ctaUrl = defaults.preferredWebsiteUrl;
  }

  if (mode === "call") {
    if (!String(post.ctaPhone || "").trim() && defaults.phone) patch.ctaPhone = defaults.phone;
  }

  return patch;
}

function getWebsiteSourceLabel(defaults: BoosterCtaDefaults | null) {
  if (!defaults?.preferredWebsiteUrl) return "";
  if (defaults.siteWebUrl && defaults.preferredWebsiteUrl === defaults.siteWebUrl) return "Site web connecté";
  if (defaults.inrcySiteUrl && defaults.preferredWebsiteUrl === defaults.inrcySiteUrl) return "Site iNrCy";
  return defaults.preferredWebsiteLabel || "Site connecté";
}

function normalizePost(post?: Partial<ChannelPost> | null): ChannelPost {
  return {
    ...getDefaultPost(),
    ...(post || {}),
    ctaMode: getCtaMode(post || {}),
    ctaUrl: String(post?.ctaUrl || ""),
    ctaPhone: String(post?.ctaPhone || ""),
    hashtags: Array.isArray(post?.hashtags) ? post!.hashtags! : [],
  };
}


function normalizeHashtagPreview(input: string): string {
  return String(input || "")
    .trim()
    .replace(/^#+/, "")
    .replace(/[^\p{L}\p{N}_]/gu, "")
    .slice(0, 40);
}

function buildInstagramPreviewCaption(post: ChannelPost) {
  const cleanPost = {
    ...post,
    hashtags: Array.isArray(post.hashtags) ? post.hashtags.map(normalizeHashtagPreview).filter(Boolean).slice(0, 8) : [],
  };
  return buildBoosterInstagramCaption(cleanPost);
}

function getLimitTone(current: number, max: number): LimitTone {
  if (current > max) return "over";
  if (current >= Math.round(max * 0.9)) return "warn";
  return "ok";
}

function getLimitToneStyle(tone: LimitTone): React.CSSProperties {
  if (tone === "over") return { color: "#ff8f8f" };
  if (tone === "warn") return { color: "#fde68a" };
  return { color: "rgba(255,255,255,0.62)" };
}

function renderLimitCounter(label: string, current: number, max: number) {
  const tone = getLimitTone(current, max);
  return (
    <div style={{ fontSize: 11, marginTop: 6, textAlign: "right", ...getLimitToneStyle(tone) }}>
      {label} : {current} / {max}
    </div>
  );
}


const THEME_OPTIONS: Array<{ value: ThemeKey; label: string }> = [
  { value: "", label: "—" },
  { value: "promotion", label: "Promotion" },
  { value: "information", label: "Information" },
  { value: "conseil", label: "Conseil / Astuce" },
  { value: "avis_client", label: "Avis client / preuve sociale" },
  { value: "realisation", label: "Réalisation / intervention / chantier" },
  { value: "actualite", label: "Actualité / nouveauté" },
  { value: "autre", label: "Autre" },
];

const THEME_PLACEHOLDERS: Record<ThemeKey, string> = {
  "": "Ex : Chantier réalisé chez Michel à Arras",
  promotion: "Ex : Offre de printemps sur la taille de haies jusqu’au 30 avril",
  information: "Ex : Nous intervenons désormais aussi le samedi sur Berck et ses alentours",
  conseil: "Ex : Pensez à faire entretenir votre chaudière avant l’hiver pour éviter les pannes",
  avis_client: "Ex : Merci à Mme Dupont pour sa confiance après la rénovation complète de sa salle de bain",
  realisation: "Ex : Terrasse en bois posée cette semaine chez un client à Montreuil",
  actualite: "Ex : Notre nouvelle prestation de nettoyage toiture est maintenant disponible",
  autre: "Ex : Intervention rapide réalisée ce matin suite à une fuite en cuisine",
};

const STYLE_OPTIONS: Array<{ value: StyleKey; label: string }> = [
  { value: "sobre", label: "Sobre" },
  { value: "equilibre", label: "Équilibré" },
  { value: "dynamique", label: "Dynamique" },
];

const STYLE_HELPERS: Record<StyleKey, string> = {
  sobre: "Ton plus posé, accroches sobres, très peu d’emojis.",
  equilibre: "Ton chaleureux et pro, avec juste ce qu’il faut de peps et d’emojis.",
  dynamique: "Ton plus vivant, accroches plus fortes, phrases plus rythmées et emojis adaptés au canal.",
};

function makeImageKey(file: File): string {
  return `${file.name}__${file.size}__${file.lastModified}`;
}


async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getBackgroundMode(transform: ImageTransform): BackgroundMode {
  if (transform.backgroundMode === "blur") return transform.backgroundColor ? "color" : "brand";
  if (transform.backgroundMode) return transform.backgroundMode;
  if (transform.blurBackground) return transform.backgroundColor ? "color" : "brand";
  return transform.backgroundColor ? "color" : "black";
}

function withBackgroundMode(transform: ImageTransform, backgroundMode: BackgroundMode): ImageTransform {
  const normalizedMode = backgroundMode === "blur" ? (transform.backgroundColor ? "color" : "brand") : backgroundMode;
  return {
    ...transform,
    backgroundMode: normalizedMode,
    blurBackground: false,
  };
}

function getBackgroundFill(mode: BackgroundMode, backgroundColor?: string): string {
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

function getDesign(transform: ImageTransform): ImageDesign {
  const design = { ...DEFAULT_DESIGN, ...(transform.design || {}) };
  if (typeof design.x !== "number") design.x = 50;
  if (typeof design.y !== "number") design.y = design.position === "top" ? 12 : design.position === "center" ? 50 : 88;
  return design;
}

function drawDesignOverlay(ctx: CanvasRenderingContext2D, cw: number, ch: number, transform: ImageTransform) {
  const design = getDesign(transform);
  const text = String(design.text || "").trim();
  if (!design.enabled || !text) return;
  const size = clamp(design.size || 30, 18, 72);
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
  const x = clamp((typeof design.x === "number" ? design.x : 50) / 100 * cw, boxW / 2 + 16, cw - boxW / 2 - 16);
  const fallbackY = design.position === "top" ? 12 : design.position === "center" ? 50 : 88;
  const y = clamp((typeof design.y === "number" ? design.y : fallbackY) / 100 * ch, boxH / 2 + 16, ch - boxH / 2 - 16);
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

function computePreviewLayout(params: {
  containerWidth: number;
  containerHeight: number;
  imageWidth: number;
  imageHeight: number;
  transform: ImageTransform;
}): PreviewLayout {
  const { containerWidth, containerHeight, imageWidth, imageHeight, transform } = params;
  if (!containerWidth || !containerHeight || !imageWidth || !imageHeight) {
    return { drawW: 0, drawH: 0, dx: 0, dy: 0, maxX: 0, maxY: 0 };
  }

  const baseScale = transform.fit === "cover"
    ? Math.max(containerWidth / imageWidth, containerHeight / imageHeight)
    : Math.min(containerWidth / imageWidth, containerHeight / imageHeight);
  const scale = baseScale * clamp(transform.zoom || 1, 0.4, 3);
  const drawW = imageWidth * scale;
  const drawH = imageHeight * scale;
  const maxX = Math.abs(drawW - containerWidth) / 2;
  const maxY = Math.abs(drawH - containerHeight) / 2;
  const dx = (containerWidth - drawW) / 2 - maxX * clamp(transform.offsetX || 0, -100, 100) / 100;
  const dy = (containerHeight - drawH) / 2 - maxY * clamp(transform.offsetY || 0, -100, 100) / 100;

  return { drawW, drawH, dx, dy, maxX, maxY };
}

function offsetFromDrawPosition(params: {
  containerWidth: number;
  containerHeight: number;
  drawW: number;
  drawH: number;
  dx: number;
  dy: number;
}): Pick<ImageTransform, "offsetX" | "offsetY"> {
  const { containerWidth, containerHeight, drawW, drawH, dx, dy } = params;
  const maxX = Math.abs(drawW - containerWidth) / 2;
  const maxY = Math.abs(drawH - containerHeight) / 2;
  const offsetX = maxX ? clamp((((containerWidth - drawW) / 2 - dx) / maxX) * 100, -100, 100) : 0;
  const offsetY = maxY ? clamp((((containerHeight - drawH) / 2 - dy) / maxY) * 100, -100, 100) : 0;
  return { offsetX, offsetY };
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Impossible de charger l'image."));
    img.src = src;
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  if (!res.ok) throw new Error("Impossible de préparer l'image.");
  return await res.blob();
}

function sanitizeUploadName(name: string): string {
  return String(name || "image")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)+/g, "") || "image";
}

function buildBoosterUploadPath(fileName: string): string {
  const safeName = sanitizeUploadName(fileName);
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `booster-prepublish/${unique}-${safeName}`;
}

function clampPercent(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function uploadPreparedImages(
  images: ImagePayload[],
  onProgress?: (current: number, total: number) => void,
): Promise<ImagePayload[]> {
  const uploaded: ImagePayload[] = [];
  const total = images.filter((image) => !!image?.dataUrl).length;
  let done = 0;

  for (const image of images) {
    if (!image?.dataUrl) {
      uploaded.push(image);
      continue;
    }

    const blob = await dataUrlToBlob(image.dataUrl);
    const file = new File([blob], sanitizeUploadName(image.name), { type: image.type || blob.type || "application/octet-stream" });
    const formData = new FormData();
    formData.append("file", file);
    formData.append("path", buildBoosterUploadPath(image.name));

    const res = await fetch("/api/booster/upload-prepared", {
      method: "POST",
      body: formData,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(String(json?.error || "Impossible d'uploader l'image préparée."));

    uploaded.push({
      name: image.name,
      type: image.type || blob.type || "application/octet-stream",
      storagePath: String(json?.storagePath || ""),
      publicUrl: String(json?.publicUrl || ""),
    });
    done += 1;
    onProgress?.(done, total);
  }

  if (!total) onProgress?.(0, 0);

  return uploaded;
}

async function renderChannelImage(params: {
  file: File;
  transform: ImageTransform;
  preset: RenderPreset;
}): Promise<ImagePayload> {
  const { file, transform, preset } = params;
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadHtmlImage(objectUrl);
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
    const scale = baseScale * clamp(transform.zoom || 1, 0.4, 3);
    const drawW = iw * scale;
    const drawH = ih * scale;
    const maxX = Math.abs(drawW - cw) / 2;
    const maxY = Math.abs(drawH - ch) / 2;
    const dx = (cw - drawW) / 2 - maxX * clamp(transform.offsetX || 0, -100, 100) / 100;
    const dy = (ch - drawH) / 2 - maxY * clamp(transform.offsetY || 0, -100, 100) / 100;

    ctx.clearRect(0, 0, cw, ch);

    const backgroundMode = getBackgroundMode(transform);
    if (backgroundMode !== "transparent") {
      ctx.fillStyle = getBackgroundFill(backgroundMode, transform.backgroundColor);
      ctx.fillRect(0, 0, cw, ch);
    }

    ctx.drawImage(img, dx, dy, drawW, drawH);
    drawDesignOverlay(ctx, cw, ch, transform);

    const exportAsPng = backgroundMode === "transparent";
    const outputType = exportAsPng ? "image/png" : "image/jpeg";
    const dataUrl = canvas.toDataURL(outputType, 0.92);
    return {
      name: file.name.replace(/\.[^.]+$/, "") + `-${preset.width}x${preset.height}.${exportAsPng ? "png" : "jpg"}`,
      type: outputType,
      dataUrl,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function getDefaultTransform(channel: ChannelKey): ImageTransform {
  const preset = CHANNEL_PRESETS[channel];
  return {
    fit: preset.defaultFit,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    blurBackground: false,
    backgroundMode: preset.defaultFit === "contain" ? "brand" : "black",
    design: { ...DEFAULT_DESIGN },
  };
}

function getOptimizedTransform(channel: ChannelKey, meta?: ImageMeta): ImageTransform {
  const base = getDefaultTransform(channel);
  if (!meta || !meta.width || !meta.height) return base;

  const ratio = meta.ratio || meta.width / meta.height;
  const isVeryWide = ratio >= 1.45;
  const isWide = ratio >= 1.15;
  const isTall = ratio <= 0.85;
  const isVeryTall = ratio <= 0.68;

  if (channel === "inrcy_site" || channel === "site_web" || channel === "gmb") {
    return withBackgroundMode({ ...base, fit: "contain", zoom: 1, backgroundColor: "#e8f6ff" }, "color");
  }

  if (channel === "instagram") {
    if (isVeryWide) return withBackgroundMode({ ...base, fit: "contain", zoom: 1, offsetX: 0, offsetY: 0, backgroundColor: "#ffffff" }, "color");
    if (isWide) return withBackgroundMode({ ...base, fit: "contain", zoom: 1, backgroundColor: "#ffffff" }, "color");
    if (isVeryTall) return withBackgroundMode({ ...base, fit: "contain", zoom: 1, backgroundColor: "#ffffff" }, "color");
    if (isTall) return withBackgroundMode({ ...base, fit: "cover", zoom: 1.04, offsetX: 0, offsetY: -10 }, "black");
    return withBackgroundMode({ ...base, fit: "cover", zoom: ratio < 1 ? 1.03 : 1.08, offsetX: 0, offsetY: ratio > 1 ? 0 : -6 }, "black");
  }

  if (channel === "facebook" || channel === "linkedin") {
    if (isVeryWide || isVeryTall) return withBackgroundMode({ ...base, fit: "contain", zoom: 1, backgroundColor: "#ffffff" }, "color");
    if (isWide) return withBackgroundMode({ ...base, fit: "contain", zoom: 1, backgroundColor: "#ffffff" }, "color");
    if (isTall) return withBackgroundMode({ ...base, fit: "cover", zoom: 1.06, offsetX: 0, offsetY: -12 }, "black");
    return withBackgroundMode({ ...base, fit: "cover", zoom: ratio < 1 ? 1.02 : 1.06, offsetX: 0, offsetY: ratio < 0.98 ? -8 : 0 }, "black");
  }

  return base;
}

async function readImageMeta(file: File): Promise<ImageMeta> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadHtmlImage(objectUrl);
    const width = img.naturalWidth || img.width || 0;
    const height = img.naturalHeight || img.height || 0;
    return {
      width,
      height,
      ratio: width && height ? width / height : 1,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function syncChannelImageEditors(params: {
  previous: Partial<Record<ChannelKey, ChannelImageEditorState>>;
  imageKeys: string[];
  selectedChannels: ChannelKey[];
  imageMetaByKey?: Record<string, ImageMeta>;
}): Partial<Record<ChannelKey, ChannelImageEditorState>> {
  const { previous, imageKeys, selectedChannels, imageMetaByKey = {} } = params;
  const next: Partial<Record<ChannelKey, ChannelImageEditorState>> = {};

  for (const channel of selectedChannels) {
    const prevState = previous[channel];
    const nextImageKeys = (prevState?.imageKeys || []).filter((key) => imageKeys.includes(key));
    const mergedKeys = nextImageKeys.length
      ? nextImageKeys
      : channel === "gmb"
        ? []
        : [...imageKeys];
    const transforms: Record<string, ImageTransform> = {};
    for (const key of imageKeys) {
      transforms[key] = prevState?.transforms?.[key]
        ? { ...prevState.transforms[key] }
        : getOptimizedTransform(channel, imageMetaByKey[key]);
    }
    next[channel] = { imageKeys: mergedKeys.filter((key, index, arr) => arr.indexOf(key) === index), transforms };
  }

  return next;
}

export default function PublishModal({
  styles,
  onClose,
  trackEvent,
  onPublishSuccess,
}: {
  styles: typeof stylesDash;
  onClose: () => void;
  trackEvent: (type: "publish", payload: Record<string, any>) => Promise<any>;
  onPublishSuccess?: (result?: any) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [idea, setIdea] = useState("");
  const [theme, setTheme] = useState<ThemeKey>("");
  const [contentStyle, setContentStyle] = useState<StyleKey>("equilibre");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [publishError, setPublishError] = useState("");
  const [publishProgress, setPublishProgress] = useState(0);
  const [publishProgressLabel, setPublishProgressLabel] = useState("");
  const [postsByChannel, setPostsByChannel] = useState<Partial<Record<ChannelKey, ChannelPost>>>({});
  const [activeCard, setActiveCard] = useState<DisplayKey>("site");
  const [isMobile, setIsMobile] = useState(false);
  const [duplicateFeedback, setDuplicateFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const gmbFileInputRef = useRef<HTMLInputElement | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imgError, setImgError] = useState("");
  const [imageMetaByKey, setImageMetaByKey] = useState<Record<string, ImageMeta>>({});
  const [channelImageEditors, setChannelImageEditors] = useState<Partial<Record<ChannelKey, ChannelImageEditorState>>>({});
  const [activeImageChannel, setActiveImageChannel] = useState<ChannelKey>("inrcy_site");
  const [activeImageKeyByChannel, setActiveImageKeyByChannel] = useState<Partial<Record<ChannelKey, string>>>({});
  const previewStageRef = useRef<HTMLDivElement | null>(null);
  const publishAreaRef = useRef<HTMLDivElement | null>(null);
  const publishPulseTimerRef = useRef<number | null>(null);
  const dragStateRef = useRef<{ pointerId: number; startX: number; startY: number; startOffsetX: number; startOffsetY: number } | null>(null);
  const [previewStageSize, setPreviewStageSize] = useState({ width: 0, height: 0 });
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [isImageEditorOpen, setIsImageEditorOpen] = useState(false);

  const [channels, setChannels] = useState<Record<ChannelKey, boolean>>({
    inrcy_site: true,
    site_web: true,
    gmb: false,
    facebook: false,
    instagram: false,
    linkedin: false,
  });

  const [connected, setConnected] = useState<Record<ChannelKey, boolean>>({
    inrcy_site: true,
    site_web: true,
    gmb: false,
    facebook: false,
    instagram: false,
    linkedin: false,
  });
  const [didInitChannels, setDidInitChannels] = useState(false);
  const [ctaDefaults, setCtaDefaults] = useState<BoosterCtaDefaults | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/booster/connected-channels", { cache: "no-store" as any });
        if (!res.ok) return;
        const json = await res.json();
        if (!alive) return;
        if (json?.channels) {
          const nextConnected = { ...connected, ...json.channels } as Record<ChannelKey, boolean>;
          setConnected(nextConnected);
          setChannels((prev) =>
            didInitChannels
              ? prev
              : ({
                  inrcy_site: !!nextConnected.inrcy_site,
                  site_web: !!nextConnected.site_web,
                  gmb: !!nextConnected.gmb,
                  facebook: !!nextConnected.facebook,
                  instagram: !!nextConnected.instagram,
                  linkedin: !!nextConnected.linkedin,
                } as Record<ChannelKey, boolean>)
          );
          if (!didInitChannels) setDidInitChannels(true);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/booster/cta-defaults", { cache: "no-store" as any });
        if (!res.ok) return;
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        setCtaDefaults({
          preferredWebsiteUrl: String(json?.preferredWebsiteUrl || "").trim(),
          preferredWebsiteLabel: String(json?.preferredWebsiteLabel || "").trim(),
          siteWebUrl: String(json?.siteWebUrl || "").trim(),
          inrcySiteUrl: String(json?.inrcySiteUrl || "").trim(),
          phone: String(json?.phone || "").trim(),
        });
      } catch {
        // ignore
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!ctaDefaults) return;
    setPostsByChannel((prev) => {
      let changed = false;
      const next: Partial<Record<ChannelKey, ChannelPost>> = { ...prev };
      const keys: ChannelKey[] = ["site_web", "inrcy_site", "gmb", "facebook", "instagram", "linkedin"];
      for (const key of keys) {
        const current = normalizePost(prev[key]);
        const mode = current.ctaMode || "none";
        if (mode !== "website" && mode !== "call") continue;
        const patch = buildAutoPrefillPatch(key === "site_web" || key === "inrcy_site" ? "site" : key, mode, current, ctaDefaults);
        const hasMeaningfulPatch = Object.entries(patch).some(([patchKey, patchValue]) => patchKey !== "ctaMode" && String(patchValue || "").trim());
        if (!hasMeaningfulPatch) continue;
        const merged = { ...current, ...patch };
        const before = JSON.stringify(current);
        const after = JSON.stringify(merged);
        if (before === after) continue;
        next[key] = merged;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [ctaDefaults]);

  useEffect(() => {
    const check = () => setIsMobile(typeof window !== "undefined" && window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const scrollToPublishArea = (behavior: ScrollBehavior = "smooth") => {
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      publishAreaRef.current?.scrollIntoView({ behavior, block: "end", inline: "nearest" });
    });
  };

  useEffect(() => {
    if (!saving) return;
    scrollToPublishArea("smooth");
  }, [saving]);

  useEffect(() => {
    if (!publishError && !imgError) return;
    scrollToPublishArea("smooth");
  }, [publishError, imgError]);

  useEffect(() => {
    return () => {
      if (publishPulseTimerRef.current) {
        window.clearInterval(publishPulseTimerRef.current);
        publishPulseTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const node = previewStageRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;

    const update = () => {
      setPreviewStageSize({ width: node.clientWidth || 0, height: node.clientHeight || 0 });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [activeImageChannel, activeImageKeyByChannel[activeImageChannel], isImageEditorOpen, images.length]);

  const displayCards = useMemo(() => {
    const cards: DisplayKey[] = [];
    if (channels.inrcy_site || channels.site_web) cards.push("site");
    if (channels.gmb) cards.push("gmb");
    if (channels.facebook) cards.push("facebook");
    if (channels.instagram) cards.push("instagram");
    if (channels.linkedin) cards.push("linkedin");
    return cards;
  }, [channels]);

  useEffect(() => {
    if (!displayCards.length) {
      setActiveCard("site");
      return;
    }
    if (!displayCards.includes(activeCard)) setActiveCard(displayCards[0]);
  }, [displayCards, activeCard]);

  const selectedChannels = useMemo(
    () => (Object.entries(channels).filter(([k, v]) => v && connected[k as ChannelKey]).map(([k]) => k) as ChannelKey[]),
    [channels, connected]
  );

  const selectedForGeneration = useMemo(() => {
    const out = new Set<ChannelKey>();
    if ((channels.inrcy_site && connected.inrcy_site) || (channels.site_web && connected.site_web)) out.add("site_web");
    if (channels.gmb && connected.gmb) out.add("gmb");
    if (channels.facebook && connected.facebook) out.add("facebook");
    if (channels.instagram && connected.instagram) out.add("instagram");
    if (channels.linkedin && connected.linkedin) out.add("linkedin");
    return Array.from(out);
  }, [channels, connected]);

  const imageKeys = useMemo(() => images.map((file) => makeImageKey(file)), [images]);
  const imageFileByKey = useMemo(() => Object.fromEntries(images.map((file) => [makeImageKey(file), file])), [images]);
  const previewByKey = useMemo(() => Object.fromEntries(imageKeys.map((key, index) => [key, imagePreviews[index]])), [imageKeys, imagePreviews]);

  useEffect(() => {
    setChannelImageEditors((prev) => syncChannelImageEditors({ previous: prev, imageKeys, selectedChannels, imageMetaByKey }));
  }, [imageKeys.join("|"), selectedChannels.join("|"), Object.keys(imageMetaByKey).sort().map((key) => `${key}:${imageMetaByKey[key]?.width || 0}x${imageMetaByKey[key]?.height || 0}`).join("|")]);

  useEffect(() => {
    if (!selectedChannels.length) {
      setActiveImageChannel("inrcy_site");
      return;
    }
    if (!selectedChannels.includes(activeImageChannel)) {
      setActiveImageChannel(selectedChannels[0]);
    }
  }, [selectedChannels, activeImageChannel]);

  useEffect(() => {
    setActiveImageKeyByChannel((prev) => {
      const next = { ...prev };
      for (const channel of selectedChannels) {
        const available = channelImageEditors[channel]?.imageKeys || [];
        if (!available.length) {
          delete next[channel];
          continue;
        }
        if (!next[channel] || !available.includes(next[channel] as string)) {
          next[channel] = available[0];
        }
      }
      for (const key of Object.keys(next) as ChannelKey[]) {
        if (!selectedChannels.includes(key)) delete next[key];
      }
      return next;
    });
  }, [selectedChannels.join("|"), channelImageEditors, imageKeys.join("|")]);

  const activeEditor = channelImageEditors[activeImageChannel];
  const activeEditorImageKey = activeImageKeyByChannel[activeImageChannel] || activeEditor?.imageKeys?.[0] || "";
  const activeEditorTransform = activeEditor?.transforms?.[activeEditorImageKey] || getOptimizedTransform(activeImageChannel, imageMetaByKey[activeEditorImageKey]);
  const activeEditorMeta = imageMetaByKey[activeEditorImageKey];
  const activeBackgroundMode = getBackgroundMode(activeEditorTransform);
  const activeBackgroundColor = getBackgroundFill(activeEditorTransform.backgroundMode || activeBackgroundMode, activeEditorTransform.backgroundColor);
  const previewAspectRatio = `${CHANNEL_PRESETS[activeImageChannel].width} / ${CHANNEL_PRESETS[activeImageChannel].height}`;
  const previewLayout = computePreviewLayout({
    containerWidth: previewStageSize.width,
    containerHeight: previewStageSize.height,
    imageWidth: activeEditorMeta?.width || 0,
    imageHeight: activeEditorMeta?.height || 0,
    transform: activeEditorTransform,
  });

  const toggle = (key: ChannelKey) => {
    if (!connected[key]) return;
    setChannels((s) => ({ ...s, [key]: !s[key] }));
  };

  const onThemeChange = (next: ThemeKey) => {
    setTheme(next);
  };

  const onReset = () => {
    setIdea("");
    setTheme("");
    setContentStyle("equilibre");
    setPostsByChannel({});
    setGenError("");
    setDuplicateFeedback(null);
    imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    setImages([]);
    setImagePreviews([]);
    setImgError("");
    setImageMetaByKey({});
    setChannelImageEditors({});
    setActiveImageKeyByChannel({});
  };

  const onGenerate = async () => {
    if (generating) return;
    setGenError("");

    const trimmed = idea.trim();
    if (!selectedChannels.length) {
      setGenError("Veuillez sélectionner au moins 1 canal avant de générer.");
      return;
    }
    if (!trimmed) {
      setGenError("Écrivez une phrase (ex : chantier terminé...).");
      return;
    }

    setGenerating(true);
    setDuplicateFeedback(null);
    try {
      const res = await fetch("/api/booster/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: trimmed, theme, style: contentStyle, channels: selectedForGeneration }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGenError("La génération n'a pas pu aboutir. Merci de réessayer.");
        return;
      }

      const versions = json?.versions || {};
      const sitePost =
        versions.site_web?.content?.trim()
          ? versions.site_web
          : versions.inrcy_site?.content?.trim()
            ? versions.inrcy_site
            : undefined;

      setPostsByChannel(Object.fromEntries(
        Object.entries({
          ...versions,
          ...(sitePost ? { inrcy_site: sitePost, site_web: sitePost } : {}),
        }).map(([key, value]) => [key, normalizePost(value as Partial<ChannelPost>)])
      ) as Partial<Record<ChannelKey, ChannelPost>>);
    } catch {
      setGenError("Connexion impossible pour le moment. Merci de réessayer.");
    } finally {
      setGenerating(false);
    }
  };

  const onDuplicateContentToAllChannels = () => {
    const source = getDisplayPost(activeCard);
    const hasSourceContent = Boolean(String(source.title || "").trim() || String(source.content || "").trim());

    if (!hasSourceContent) {
      setDuplicateFeedback({ kind: "error", message: "Ajoutez au moins un titre ou un contenu avant de dupliquer." });
      return;
    }

    if (displayCards.length < 2) {
      setDuplicateFeedback({ kind: "error", message: "Sélectionnez au moins 2 canaux pour utiliser la duplication." });
      return;
    }

    if (typeof window !== "undefined") {
      const confirmed = window.confirm("Dupliquer ce contenu sur tous les canaux ?\n\nLe titre et le contenu des autres canaux seront remplacés.");
      if (!confirmed) return;
    }

    const patch: Pick<ChannelPost, "title" | "content"> = {
      title: source.title,
      content: source.content,
    };

    setPostsByChannel((prev) => {
      const next: Partial<Record<ChannelKey, ChannelPost>> = { ...prev };
      for (const key of displayCards) {
        if (key === "site") {
          const sitePost = {
            ...normalizePost(prev.site_web || prev.inrcy_site),
            ...patch,
          };
          next.inrcy_site = sitePost;
          next.site_web = sitePost;
          continue;
        }

        next[key] = {
          ...normalizePost(prev[key]),
          ...patch,
        };
      }
      return next;
    });

    setDuplicateFeedback({ kind: "success", message: "Titre et contenu dupliqués sur tous les canaux affichés." });
  };

  const onPickImagesClick = () => {
    setImgError("");
    fileInputRef.current?.click();
  };

  const onImagesChange = async (files: FileList | null, targetChannel?: ChannelKey) => {
    if (!files?.length) return;
    setImgError("");

    const incoming = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (!incoming.length) {
      setImgError("Ajoutez des fichiers image valides.");
      return;
    }

    const existingKeys = new Set(images.map((file) => makeImageKey(file)));
    const deduped = incoming.filter((file) => !existingKeys.has(makeImageKey(file)));
    const allowed = deduped.slice(0, Math.max(0, 5 - images.length));

    if (!allowed.length) {
      setImgError(images.length >= 5 ? "Maximum 5 images." : "Ces images sont déjà ajoutées.");
      return;
    }

    if (incoming.length > allowed.length) {
      setImgError(images.length + allowed.length >= 5 ? "Maximum 5 images." : "Certaines images étaient déjà présentes.");
    }

    const tooBig = allowed.find((file) => file.size > BOOSTER_MAX_IMAGE_BYTES);
    if (tooBig) {
      setImgError(`L'image ${tooBig.name} dépasse ${BOOSTER_MAX_IMAGE_MB_LABEL}.`);
      return;
    }

    const nextFiles = [...images, ...allowed].slice(0, 5);
    const nextPreviews = [...imagePreviews, ...allowed.map((file) => URL.createObjectURL(file))].slice(0, 5);
    const nextMetaEntries = await Promise.all(allowed.map(async (file) => [makeImageKey(file), await readImageMeta(file)] as const));
    const nextMetaMap = Object.fromEntries(nextMetaEntries) as Record<string, ImageMeta>;
    const newKeys = allowed.map((file) => makeImageKey(file));

    setImages(nextFiles);
    setImagePreviews(nextPreviews);
    setImageMetaByKey((prev) => ({ ...prev, ...nextMetaMap }));

    if (targetChannel) {
      setChannelImageEditors((prev) => {
        const next = syncChannelImageEditors({ previous: prev, imageKeys: nextFiles.map((file) => makeImageKey(file)), selectedChannels, imageMetaByKey: { ...imageMetaByKey, ...nextMetaMap } });
        const current = next[targetChannel] || { imageKeys: [], transforms: {} };
        next[targetChannel] = {
          imageKeys: Array.from(new Set([...(current.imageKeys || []), ...newKeys])),
          transforms: {
            ...(current.transforms || {}),
            ...Object.fromEntries(newKeys.map((key) => [key, current.transforms?.[key] || getOptimizedTransform(targetChannel, nextMetaMap[key])])),
          },
        };
        return next;
      });
      setActiveImageChannel(targetChannel);
      setActiveImageKeyByChannel((prev) => ({ ...prev, [targetChannel]: newKeys[0] || prev[targetChannel] || "" }));
    }
  };


  const removeImage = (index: number) => {
    setImgError("");
    const removedFile = images[index];
    const removedPreview = imagePreviews[index];
    if (!removedFile) return;

    if (removedPreview) {
      try { URL.revokeObjectURL(removedPreview); } catch {}
    }

    const removedKey = makeImageKey(removedFile);
    const nextFiles = images.filter((_, idx) => idx !== index);
    const nextPreviews = imagePreviews.filter((_, idx) => idx !== index);
    const remainingKeys = nextFiles.map((file) => makeImageKey(file));

    setImages(nextFiles);
    setImagePreviews(nextPreviews);
    setImageMetaByKey((prev) => {
      const next = { ...prev };
      delete next[removedKey];
      return next;
    });
    setChannelImageEditors((prev) => syncChannelImageEditors({
      previous: prev,
      imageKeys: remainingKeys,
      selectedChannels,
      imageMetaByKey,
    }));
    setActiveImageKeyByChannel((prev) => {
      const next = { ...prev };
      for (const channel of Object.keys(next) as ChannelKey[]) {
        if (next[channel] === removedKey) {
          next[channel] = remainingKeys[0] || "";
        }
      }
      return next;
    });
  };


  const updatePost = (channel: ChannelKey, patch: Partial<ChannelPost>) => {
    if (channel === "inrcy_site" || channel === "site_web") {
      const next = {
        ...normalizePost(postsByChannel.site_web || postsByChannel.inrcy_site),
        ...patch,
      };
      setPostsByChannel((prev) => ({ ...prev, inrcy_site: next, site_web: next }));
      return;
    }
    setPostsByChannel((prev) => ({
      ...prev,
      [channel]: {
        ...normalizePost(prev[channel]),
        ...patch,
      },
    }));
  };

  const getDisplayPost = (key: DisplayKey): ChannelPost => {
    if (key === "site") return normalizePost(postsByChannel.site_web || postsByChannel.inrcy_site);
    return normalizePost(postsByChannel[key]);
  };

  const applyCtaModePrefill = (displayKey: DisplayKey, mode: BoosterCtaMode) => {
    const current = getDisplayPost(displayKey);
    const patch = buildAutoPrefillPatch(displayKey, mode, current, ctaDefaults);
    updatePost(displayKey === "site" ? "site_web" : displayKey, patch);
  };

  const updateChannelTransform = (channel: ChannelKey, imageKey: string, patch: Partial<ImageTransform>) => {
    setChannelImageEditors((prev) => {
      const current = prev[channel] || { imageKeys: imageKeys.slice(), transforms: {} };
      return {
        ...prev,
        [channel]: {
          imageKeys: current.imageKeys,
          transforms: {
            ...current.transforms,
            [imageKey]: {
              ...(current.transforms[imageKey] || getOptimizedTransform(channel, imageMetaByKey[imageKey])),
              ...patch,
            },
          },
        },
      };
    });
  };

  const setContainMode = (channel: ChannelKey, imageKey: string) => {
    const current = channelImageEditors[channel]?.transforms?.[imageKey] || getOptimizedTransform(channel, imageMetaByKey[imageKey]);
    const backgroundMode = current.fit === "contain" ? getBackgroundMode(current) : (channel === "inrcy_site" || channel === "site_web" || channel === "gmb" ? "color" : "white");
    const backgroundColor = current.backgroundColor || (channel === "inrcy_site" || channel === "site_web" || channel === "gmb" ? "#e8f6ff" : "#ffffff");
    updateChannelTransform(channel, imageKey, { fit: "contain", backgroundMode: backgroundMode === "transparent" ? "transparent" : "color", backgroundColor, blurBackground: false });
  };

  const setCoverMode = (channel: ChannelKey, imageKey: string) => {
    updateChannelTransform(channel, imageKey, { fit: "cover", backgroundMode: "black", blurBackground: false });
  };

  const nudgeZoom = (delta: number) => {
    if (!activeEditorImageKey) return;
    const nextZoom = clamp((activeEditorTransform.zoom || 1) + delta, 0.4, 3);
    updateChannelTransform(activeImageChannel, activeEditorImageKey, { zoom: nextZoom });
  };

  const handlePreviewWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!activeEditorImageKey || !activeEditorMeta?.width || !activeEditorMeta?.height || !previewStageRef.current) return;
    event.preventDefault();

    const rect = previewStageRef.current.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const nextZoom = clamp((activeEditorTransform.zoom || 1) + (event.deltaY < 0 ? 0.08 : -0.08), 0.4, 3);

    const nextLayout = computePreviewLayout({
      containerWidth: rect.width,
      containerHeight: rect.height,
      imageWidth: activeEditorMeta.width,
      imageHeight: activeEditorMeta.height,
      transform: { ...activeEditorTransform, zoom: nextZoom },
    });

    const currentDrawW = previewLayout.drawW || nextLayout.drawW;
    const currentDrawH = previewLayout.drawH || nextLayout.drawH;
    const ux = currentDrawW ? (pointerX - previewLayout.dx) / currentDrawW : 0.5;
    const uy = currentDrawH ? (pointerY - previewLayout.dy) / currentDrawH : 0.5;
    const nextDx = pointerX - ux * nextLayout.drawW;
    const nextDy = pointerY - uy * nextLayout.drawH;
    const offsets = offsetFromDrawPosition({
      containerWidth: rect.width,
      containerHeight: rect.height,
      drawW: nextLayout.drawW,
      drawH: nextLayout.drawH,
      dx: nextDx,
      dy: nextDy,
    });

    updateChannelTransform(activeImageChannel, activeEditorImageKey, { zoom: nextZoom, ...offsets });
  };

  const handlePreviewPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!activeEditorImageKey) return;
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: activeEditorTransform.offsetX,
      startOffsetY: activeEditorTransform.offsetY,
    };
    setIsDraggingImage(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePreviewPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !activeEditorImageKey) return;
    const nextOffsetX = previewLayout.maxX ? clamp(drag.startOffsetX - ((event.clientX - drag.startX) / previewLayout.maxX) * 100, -100, 100) : 0;
    const nextOffsetY = previewLayout.maxY ? clamp(drag.startOffsetY - ((event.clientY - drag.startY) / previewLayout.maxY) * 100, -100, 100) : 0;
    updateChannelTransform(activeImageChannel, activeEditorImageKey, { offsetX: nextOffsetX, offsetY: nextOffsetY });
  };

  const endPreviewDrag = (event?: React.PointerEvent<HTMLDivElement>) => {
    if (event && dragStateRef.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    dragStateRef.current = null;
    setIsDraggingImage(false);
  };

  const toggleChannelImage = (channel: ChannelKey, imageKey: string) => {
    setChannelImageEditors((prev) => {
      const current = prev[channel] || { imageKeys: imageKeys.slice(), transforms: {} };
      const exists = current.imageKeys.includes(imageKey);
      const nextKeys = exists ? current.imageKeys.filter((key) => key !== imageKey) : [...current.imageKeys, imageKey];
      return {
        ...prev,
        [channel]: {
          imageKeys: nextKeys,
          transforms: {
            ...current.transforms,
            [imageKey]: current.transforms[imageKey] || getOptimizedTransform(channel, imageMetaByKey[imageKey]),
          },
        },
      };
    });
    setActiveImageKeyByChannel((prev) => {
      if (prev[channel] !== imageKey) return prev;
      const currentKeys = channelImageEditors[channel]?.imageKeys || [];
      const nextKeys = currentKeys.filter((key) => key !== imageKey);
      return { ...prev, [channel]: nextKeys[0] || "" };
    });
  };

  const resetChannelImage = (channel: ChannelKey, imageKey: string) => {
    updateChannelTransform(channel, imageKey, getOptimizedTransform(channel, imageMetaByKey[imageKey]));
  };

  const applyCurrentImageToSelectedChannels = () => {
    if (!activeEditorImageKey) return;
    setChannelImageEditors((prev) => {
      const next = { ...prev };
      for (const channel of selectedChannels) {
        const current = next[channel] || { imageKeys: imageKeys.slice(), transforms: {} };
        next[channel] = {
          imageKeys: current.imageKeys.includes(activeEditorImageKey)
            ? current.imageKeys
            : [...current.imageKeys, activeEditorImageKey],
          transforms: {
            ...current.transforms,
            [activeEditorImageKey]: { ...activeEditorTransform },
          },
        };
      }
      return next;
    });
  };

  const openImageEditor = (channel: ChannelKey, imageKey: string) => {
    setActiveImageChannel(channel);
    setActiveImageKeyByChannel((prev) => ({ ...prev, [channel]: imageKey }));
    setIsImageEditorOpen(true);
  };

  const closeImageEditor = () => {
    dragStateRef.current = null;
    setIsDraggingImage(false);
    setIsImageEditorOpen(false);
  };

  const buildChannelImagesPayload = async (onProgress?: (current: number, total: number) => void): Promise<{
    channelImages: ChannelImagePayload;
    channelSettings: ChannelImageSettingsPayload;
  }> => {
    const channelImages = {} as ChannelImagePayload;
    const channelSettings = {} as ChannelImageSettingsPayload;
    const totalRenders = selectedChannels.reduce((sum, channel) => {
      const editor = channelImageEditors[channel] || { imageKeys: [], transforms: {} };
      return sum + editor.imageKeys.length;
    }, 0);
    let doneRenders = 0;

    for (const channel of selectedChannels) {
      const editor = channelImageEditors[channel] || { imageKeys: [], transforms: {} };
      const renderList: ImagePayload[] = [];
      for (const imageKey of editor.imageKeys) {
        const file = imageFileByKey[imageKey];
        if (!file) continue;
        const transform = editor.transforms[imageKey] || getDefaultTransform(channel);
        renderList.push(await renderChannelImage({ file, transform, preset: CHANNEL_PRESETS[channel] }));
        doneRenders += 1;
        onProgress?.(doneRenders, totalRenders);
      }
      channelImages[channel] = renderList;
      channelSettings[channel] = {
        imageKeys: [...editor.imageKeys],
        transforms: Object.fromEntries(Object.entries(editor.transforms || {}).map(([key, value]) => [key, { ...value }])),
      };
    }

    if (!totalRenders) onProgress?.(0, 0);

    return { channelImages, channelSettings };
  };

  const onPublish = async () => {
    if (saving) return;
    setPublishError("");
    setImgError("");
    setPublishProgress(0);
    setPublishProgressLabel("");
    scrollToPublishArea("smooth");

    if (!selectedChannels.length) {
      setPublishError("Sélectionnez au moins 1 canal.");
      return;
    }

    const missingContent = selectedChannels.find((ch) => !String((ch === "inrcy_site" || ch === "site_web" ? getDisplayPost("site") : postsByChannel[ch])?.content || "").trim());
    if (missingContent) {
      setPublishError(`Le contenu est vide pour ${CHANNEL_LABELS[missingContent]}.`);
      return;
    }

    if (selectedChannels.includes("instagram")) {
      const instagramImages = channelImageEditors.instagram?.imageKeys || [];
      if (!instagramImages.length) {
        setImgError("Veuillez ajouter au moins 1 image pour publier sur Instagram.");
        return;
      }
    }

    setSaving(true);
    setPublishProgress(5);
    setPublishProgressLabel("Préparation de la publication...");

    try {
      const { channelImages, channelSettings } = await buildChannelImagesPayload((current, total) => {
        if (!total) {
          setPublishProgress(25);
          setPublishProgressLabel("Préparation des contenus...");
          return;
        }
        const ratio = current / total;
        setPublishProgress(clampPercent(8 + ratio * 27));
        setPublishProgressLabel(`Préparation des images ${clampPercent(ratio * 100)}%`);
      });

      setPublishProgress((prev) => Math.max(prev, 35));
      setPublishProgressLabel("Upload des images...");

      const uploadedChannelImages = {} as ChannelImagePayload;
      const uploadTargets = selectedChannels.reduce((sum, channel) => sum + (channelImages[channel] || []).filter((image) => !!image?.dataUrl).length, 0);
      let uploadedCount = 0;
      for (const channel of selectedChannels) {
        uploadedChannelImages[channel] = await uploadPreparedImages(channelImages[channel] || [], (current, total) => {
          if (!total) return;
          uploadedCount += 1;
          const ratio = uploadTargets ? uploadedCount / uploadTargets : 1;
          setPublishProgress(clampPercent(35 + ratio * 35));
          setPublishProgressLabel(`Upload des images ${clampPercent(ratio * 100)}%`);
        });
      }

      const sitePost = getDisplayPost("site");
      setPublishProgress((prev) => Math.max(prev, 74));
      setPublishProgressLabel("Envoi aux canaux...");
      if (publishPulseTimerRef.current) window.clearInterval(publishPulseTimerRef.current);
      publishPulseTimerRef.current = window.setInterval(() => {
        setPublishProgress((prev) => (prev >= 94 ? prev : prev + 1));
      }, 220);

      const result = await trackEvent("publish", {
        idea: idea.trim(),
        theme,
        channels: selectedChannels,
        postByChannel: {
          ...postsByChannel,
          ...(channels.inrcy_site ? { inrcy_site: sitePost } : {}),
          ...(channels.site_web ? { site_web: sitePost } : {}),
        },
        // Avoid sending the same images twice (base images + channel images),
        // which can make the JSON body too large and trigger HTTP 413.
        // The API now rebuilds the fallback/base image set from channel images.
        images: [],
        imagesByChannel: uploadedChannelImages,
        imageSettingsByChannel: channelSettings,
      });

      if (publishPulseTimerRef.current) {
        window.clearInterval(publishPulseTimerRef.current);
        publishPulseTimerRef.current = null;
      }
      setPublishProgress(100);
      setPublishProgressLabel("Publié");
      await sleep(220);
      onPublishSuccess?.(result);
      onClose();
    } catch (e) {
      if (publishPulseTimerRef.current) {
        window.clearInterval(publishPulseTimerRef.current);
        publishPulseTimerRef.current = null;
      }
      setPublishProgress(0);
      setPublishProgressLabel("");
      setPublishError(getSimpleFrenchErrorMessage(e, "La publication n'a pas pu être envoyée. Merci de réessayer."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
      <div className={styles.blockCard} style={{ minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}>
        <div className={styles.blockTitle} style={{ marginBottom: 8 }}>Canaux</div>
        <div className={styles.subtitle} style={{ marginBottom: 10 }}>
          iNrCy diffuse une version adaptée sur chaque canal sélectionné !
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          {(Object.keys(CHANNEL_LABELS) as ChannelKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              disabled={!connected[key]}
              style={{
                ...channelBtn,
                ...(channels[key] && connected[key] ? channelBtnActive : {}),
                ...(!connected[key] ? channelBtnDisabled : {}),
                minHeight: isMobile ? 56 : channelBtn.minHeight,
                padding: isMobile ? "0 14px" : channelBtn.padding,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                <input
                  type="checkbox"
                  checked={!!channels[key]}
                  onChange={() => toggle(key)}
                  disabled={!connected[key]}
                  onClick={(e) => e.stopPropagation()}
                  style={{ width: 18, height: 18, accentColor: "#4cc3ff", cursor: connected[key] ? "pointer" : "not-allowed", flexShrink: 0 }}
                />
                <span style={{ width: 10, height: 10, borderRadius: 999, background: channels[key] ? "#43d17d" : "#ff4d6d", boxShadow: channels[key] ? "0 0 12px rgba(67,209,125,0.35)" : "0 0 12px rgba(255,77,109,0.25)", flexShrink: 0 }} />
                <span style={{ minWidth: 0, whiteSpace: "normal", overflow: "hidden", textOverflow: "ellipsis", textAlign: "left" }}>
                  {CHANNEL_LABELS[key]}
                </span>
              </span>
              <span
                aria-label={connected[key] ? "Connecté" : "Non connecté"}
                title={connected[key] ? "Connecté" : "Non connecté"}
                style={{
                  fontSize: isMobile ? 16 : 12,
                  opacity: 0.9,
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: isMobile ? 20 : 72,
                  marginLeft: 8,
                }}
              >
                {connected[key] ? "🔗" : "⛔"}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.blockCard} style={{ minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}>
        <div className={styles.blockTitle} style={{ marginBottom: 8 }}>Votre intention</div>
        <div className={styles.subtitle} style={{ marginBottom: 10, maxWidth: "none", whiteSpace: "normal" }}>
          Choisissez le thème si vous le souhaitez, puis écrivez votre phrase. iNrCy adapte ensuite le contenu à chaque canal.
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Thème</div>
            <select value={theme} onChange={(e) => onThemeChange(e.target.value as ThemeKey)} style={darkSelectStyle as React.CSSProperties}>
              {THEME_OPTIONS.map((opt) => (
                <option key={opt.value || "empty"} value={opt.value} style={darkOptionStyle}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Phrase libre</div>
            <textarea
              placeholder={THEME_PLACEHOLDERS[theme] || THEME_PLACEHOLDERS[""]}
              style={textAreaStyle}
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Style</div>
            <select value={contentStyle} onChange={(e) => setContentStyle(e.target.value as StyleKey)} style={darkSelectStyle as React.CSSProperties}>
              {STYLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} style={darkOptionStyle}>{opt.label}</option>
              ))}
            </select>
            <div style={{ fontSize: 11, marginTop: 6, color: "rgba(255,255,255,0.62)", lineHeight: 1.45 }}>
              {STYLE_HELPERS[contentStyle]}
            </div>
          </div>
          {genError ? <div style={{ fontSize: 13, color: "#ffb4b4" }}>{genError}</div> : null}
                    <div style={{ display: "grid", gap: 6, justifyItems: "start" }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" className={styles.primaryBtn} onClick={onGenerate} disabled={generating}>
                {generating ? "Génération..." : "Générer avec iNrCy"}
              </button>
              <button type="button" className={styles.secondaryBtn} onClick={onReset}>Réinitialiser</button>
            </div>
            {generating ? <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)" }}>Cela peut prendre quelques secondes.</div> : null}
          </div>
        </div>
      </div>

      <div className={styles.blockCard} style={{ minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}>
        <div className={styles.blockTitle} style={{ marginBottom: 8 }}>Contenus par canal</div>
        <div className={styles.subtitle} style={{ marginBottom: 10, maxWidth: "none", whiteSpace: "normal" }}>
          Relisez et ajustez si nécessaire chaque version avant publication. Les contenus publiés sont modifiables et supprimables depuis le module iNr'Send.
        </div>
        {displayCards.length ? (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, overflowX: "auto" }}>
              {displayCards.map((key) => (
                <button key={key} type="button" onClick={() => setActiveCard(key)} style={{ ...pillBtn, ...(activeCard === key ? pillBtnActive : {}) }}>
                  {DISPLAY_LABELS[key]}
                </button>
              ))}
            </div>
            <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 16, padding: 12, background: "rgba(255,255,255,0.03)" }}>
              <div style={{ fontWeight: 900, marginBottom: 10 }}>{DISPLAY_LABELS[activeCard]}</div>
              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Titre</div>
                  <input value={getDisplayPost(activeCard).title} onChange={(e) => updatePost(activeCard === "site" ? "site_web" : activeCard, { title: e.target.value })} style={inputStyle} placeholder="Titre" />
                  {renderLimitCounter("Titre", getDisplayPost(activeCard).title.length, CHANNEL_TEXT_GUIDELINES[activeCard].title)}
                </div>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Contenu</div>
                  <textarea value={getDisplayPost(activeCard).content} onChange={(e) => updatePost(activeCard === "site" ? "site_web" : activeCard, { content: e.target.value })} style={{ ...textAreaStyle, minHeight: activeCard === "site" ? 280 : 160 }} placeholder="Contenu" />
                  {renderLimitCounter("Contenu", getDisplayPost(activeCard).content.length, CHANNEL_TEXT_GUIDELINES[activeCard].content)}
                </div>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>CTA</div>
                  <select
                    value={getDisplayPost(activeCard).ctaMode || "none"}
                    onChange={(e) => applyCtaModePrefill(activeCard, e.target.value as BoosterCtaMode)}
                    style={darkSelectStyle}
                  >
                    {CTA_MODE_OPTIONS[activeCard].map((option) => (
                      <option key={option.value} value={option.value} style={darkOptionStyle}>{option.label}</option>
                    ))}
                  </select>
                  <div style={{ fontSize: 11, marginTop: 6, color: "rgba(255,255,255,0.62)", lineHeight: 1.45 }}>
                    {getCtaModeHelp(activeCard, getDisplayPost(activeCard).ctaMode || "none")}
                  </div>
                  {(getDisplayPost(activeCard).ctaMode || "none") === "website" ? (
                    <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                      <input
                        value={getDisplayPost(activeCard).cta}
                        onChange={(e) => updatePost(activeCard === "site" ? "site_web" : activeCard, { cta: e.target.value })}
                        style={lightFieldStyle}
                        placeholder={`Libellé du lien (ex : ${getChannelDefaultCtaLabel(activeCard, "website") || "Demander un devis"})`}
                      />
                      <input
                        value={getDisplayPost(activeCard).ctaUrl || ""}
                        onChange={(e) => updatePost(activeCard === "site" ? "site_web" : activeCard, { ctaUrl: e.target.value })}
                        style={lightFieldStyle}
                        placeholder={ctaDefaults?.preferredWebsiteUrl ? `URL du site préremplie (${getWebsiteSourceLabel(ctaDefaults)})` : "URL du site (optionnel)"}
                      />
                      {ctaDefaults?.preferredWebsiteUrl ? (
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.62)", lineHeight: 1.45 }}>
                          Valeur par défaut disponible depuis {getWebsiteSourceLabel(ctaDefaults).toLowerCase()} : {ctaDefaults.preferredWebsiteUrl}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {(getDisplayPost(activeCard).ctaMode || "none") === "call" ? (
                    <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                      <input
                        value={getDisplayPost(activeCard).ctaPhone || ""}
                        onChange={(e) => updatePost(activeCard === "site" ? "site_web" : activeCard, { ctaPhone: e.target.value })}
                        style={lightFieldStyle}
                        placeholder={ctaDefaults?.phone ? "Téléphone prérempli depuis Mon profil" : "Téléphone (optionnel)"}
                      />
                      {ctaDefaults?.phone ? (
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.62)", lineHeight: 1.45 }}>
                          Valeur par défaut disponible depuis Mon profil : {ctaDefaults.phone}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {(getDisplayPost(activeCard).ctaMode || "none") === "custom" ? (
                    <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                      <input
                        value={getDisplayPost(activeCard).cta}
                        onChange={(e) => updatePost(activeCard === "site" ? "site_web" : activeCard, { cta: e.target.value })}
                        style={lightFieldStyle}
                        placeholder={activeCard === "gmb" ? "Ex : En savoir plus" : "Ex : Contactez-nous"}
                      />
                    </div>
                  ) : null}
                  {((getDisplayPost(activeCard).ctaMode || "none") === "website" || (getDisplayPost(activeCard).ctaMode || "none") === "custom") ? renderLimitCounter("CTA", getDisplayPost(activeCard).cta.length, CHANNEL_TEXT_GUIDELINES[activeCard].cta) : null}
                </div>
                {activeCard === "instagram" ? (
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Hashtags</div>
                    <input
                      value={Array.isArray(getDisplayPost(activeCard).hashtags) ? getDisplayPost(activeCard).hashtags!.join(" ") : ""}
                      onChange={(e) => updatePost("instagram", { hashtags: e.target.value.split(/[,\s;]+/).map((v) => v.trim().replace(/^#+/, "")).filter(Boolean) })}
                      style={inputStyle}
                      placeholder="#local #metier"
                    />
                    {renderLimitCounter("Hashtags", Array.isArray(getDisplayPost(activeCard).hashtags) ? getDisplayPost(activeCard).hashtags!.filter(Boolean).length : 0, CHANNEL_TEXT_GUIDELINES.instagram.hashtags || 20)}
                  </div>
                ) : null}
                {CHANNEL_TEXT_GUIDELINES[activeCard].totalLabel && CHANNEL_TEXT_GUIDELINES[activeCard].totalMax && CHANNEL_TEXT_GUIDELINES[activeCard].totalValue ? (
                  <div style={{ marginTop: 2 }}>
                    {renderLimitCounter(CHANNEL_TEXT_GUIDELINES[activeCard].totalLabel!, CHANNEL_TEXT_GUIDELINES[activeCard].totalValue!(getDisplayPost(activeCard)), CHANNEL_TEXT_GUIDELINES[activeCard].totalMax!)}
                  </div>
                ) : null}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
              <div style={{ fontSize: 12, color: duplicateFeedback?.kind === "error" ? "#ffb4b4" : "rgba(255,255,255,0.72)" }}>
                {duplicateFeedback?.message || "Dupliquez le titre et le contenu du canal ouvert vers les autres canaux affichés."}
              </div>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={onDuplicateContentToAllChannels}
                disabled={displayCards.length < 2}
                style={{ marginLeft: "auto" }}
              >
                Dupliquer ce contenu sur tous les canaux
              </button>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, opacity: 0.75 }}>Sélectionnez d’abord vos canaux.</div>
        )}
      </div>

      <div className={styles.blockCard} style={{ minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}>
        <div className={styles.blockTitle} style={{ marginBottom: 8 }}>Images</div>
        <div className={styles.subtitle} style={{ marginBottom: 10, maxWidth: "none", whiteSpace: "normal" }}>
          Ajoutez 1 ou plusieurs images (max 5, 8 Mo chacune). iNrCy applique automatiquement un cadrage de départ intelligent par canal et recompresse les visuels avant publication. <strong>Fort recommandé</strong>. <strong>Obligatoire pour Instagram</strong>.
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            onImagesChange(e.target.files);
            e.currentTarget.value = "";
          }}
        />
        <input
          ref={gmbFileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            onImagesChange(e.target.files, "gmb");
            e.currentTarget.value = "";
          }}
        />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className={styles.secondaryBtn} onClick={onPickImagesClick}>+ Ajouter des images</button>
          {images.length ? <div style={{ fontSize: 12, opacity: 0.85 }}>{images.length} fichier(s) sélectionné(s)</div> : <div style={{ fontSize: 12, opacity: 0.7 }}>Aucune image</div>}
        </div>
        {imgError ? <div style={{ marginTop: 10, fontSize: 13, color: "#ffb4b4" }}>{imgError}</div> : null}
        {imagePreviews.length ? (
          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {imagePreviews.map((src, idx) => (
              <div key={`${src}-${idx}`} style={{ position: "relative" }}>
                <img src={src} alt={`upload-${idx}`} style={{ width: 110, height: 110, objectFit: "cover", borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)" }} />
                <button type="button" className={styles.secondaryBtn} style={{ position: "absolute", top: 6, right: 6, padding: "6px 10px", fontSize: 12, zIndex: 3, background: "rgba(10,14,24,0.92)", color: "#fff", border: "1px solid rgba(255,255,255,0.24)", boxShadow: "0 10px 20px rgba(0,0,0,0.28)" }} onClick={() => removeImage(idx)}>✕</button>
              </div>
            ))}
          </div>
        ) : null}
      </div>


      <div className={styles.blockCard} style={{ minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}>
        <div className={styles.blockTitle} style={{ marginBottom: 8 }}>Retouche des images par canal</div>
        <div className={styles.subtitle} style={{ marginBottom: 10, maxWidth: "none" }}>
          Gérez chaque canal séparément : cochez les images à publier, puis ouvrez la retouche uniquement quand vous voulez recadrer une image.
        </div>
        {!selectedChannels.length ? (
          <div style={{ fontSize: 13, opacity: 0.75 }}>Sélectionnez d’abord vos canaux.</div>
        ) : !images.length ? (
          <div style={{ fontSize: 13, opacity: 0.75 }}>Ajoutez d’abord une ou plusieurs images pour activer les retouches.</div>
        ) : (
          <>
            {activeImageChannel === "gmb" ? (
              <div style={{ marginBottom: 12, borderRadius: 14, padding: "12px 14px", border: "1px solid rgba(251,191,36,0.26)", background: "rgba(251,191,36,0.10)", display: "grid", gap: 10 }}>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: "#fde68a" }}>
                  <strong>Attention :</strong> Google Business refuse souvent les images à caractère publicitaire. Par sécurité, aucune image n&apos;est envoyée par défaut sur ce canal. Cochez seulement les images que vous avez vérifiées.
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="button" className={styles.secondaryBtn} onClick={() => gmbFileInputRef.current?.click()}>
                    + Ajouter une image spécifique Google Business
                  </button>
                </div>
              </div>
            ) : null}
            <ChannelImageRetouchCardsPanel
            tabs={selectedChannels.map((channel) => ({ key: channel, label: CHANNEL_LABELS[channel] }))}
            activeChannel={activeImageChannel}
            onActiveChannelChange={(key) => setActiveImageChannel(key as ChannelKey)}
            channelTitle={CHANNEL_LABELS[activeImageChannel]}
            formatLabel={`Format final : ${CHANNEL_PRESETS[activeImageChannel].width}×${CHANNEL_PRESETS[activeImageChannel].height}`}
            aspectRatio={previewAspectRatio}
            items={imageKeys.map((key, index) => {
              const included = (channelImageEditors[activeImageChannel]?.imageKeys || []).includes(key);
              const transform = channelImageEditors[activeImageChannel]?.transforms?.[key] || getOptimizedTransform(activeImageChannel, imageMetaByKey[key]);
              const bgMode = getBackgroundMode(transform);
              return {
                key,
                previewUrl: previewByKey[key],
                included,
                title: `Image ${index + 1}`,
                subtitle: included ? "Publiée sur ce canal" : "Non envoyée sur ce canal",
                fitLabel: transform.fit === "cover" ? "Remplir" : "Adapter",
                backgroundMode: bgMode,
                onToggle: () => toggleChannelImage(activeImageChannel, key),
                onRetouch: () => openImageEditor(activeImageChannel, key),
              };
            })}
            buttonClassName={styles.secondaryBtn}
            pillButtonStyle={pillBtn}
            pillButtonActiveStyle={pillBtnActive}
          />
          </>
        )}
      </div>

      <ChannelImageRetouchModal
        open={!!(isImageEditorOpen && activeEditorImageKey)}
        title={`Retoucher Image ${(imageKeys.indexOf(activeEditorImageKey || "") || 0) + 1}`}
        subtitle={`${CHANNEL_LABELS[activeImageChannel]} • ${CHANNEL_PRESETS[activeImageChannel].width}×${CHANNEL_PRESETS[activeImageChannel].height}`}
        aspectRatio={previewAspectRatio}
        backgroundMode={activeBackgroundMode}
        backgroundColor={activeBackgroundColor}
        fitLabel={activeEditorTransform.fit === "cover" ? "Remplir" : "Adapter"}
        zoomLabel={`zoom ${activeEditorTransform.zoom.toFixed(2)}×`}
        previewSrc={activeEditorImageKey ? previewByKey[activeEditorImageKey] : ""}
        previewLayout={previewLayout}
        isDragging={isDraggingImage}
        onClose={closeImageEditor}
        onWheel={handlePreviewWheel}
        onPointerDown={handlePreviewPointerDown}
        onPointerMove={handlePreviewPointerMove}
        onPointerUp={endPreviewDrag}
        onPointerCancel={endPreviewDrag}
        previewRef={previewStageRef}
        buttonClassName={styles.secondaryBtn}
        primaryButtonClassName={styles.primaryBtn}
        onZoomOut={() => nudgeZoom(-0.08)}
        onZoomIn={() => nudgeZoom(0.08)}
        onContain={() => activeEditorImageKey && setContainMode(activeImageChannel, activeEditorImageKey)}
        onCover={() => activeEditorImageKey && setCoverMode(activeImageChannel, activeEditorImageKey)}
        onReset={() => activeEditorImageKey && resetChannelImage(activeImageChannel, activeEditorImageKey)}
        onDoubleClick={() => activeEditorImageKey && updateChannelTransform(activeImageChannel, activeEditorImageKey, { offsetX: 0, offsetY: 0 })}
        onSave={closeImageEditor}
        onApplyToSelectedChannels={applyCurrentImageToSelectedChannels}
        onBackgroundModeChange={(mode) => activeEditorImageKey && updateChannelTransform(activeImageChannel, activeEditorImageKey, mode === "transparent" ? { backgroundMode: "transparent", blurBackground: false, fit: "contain" } : { backgroundMode: "color", backgroundColor: activeEditorTransform.backgroundColor || (activeImageChannel === "inrcy_site" || activeImageChannel === "site_web" || activeImageChannel === "gmb" ? "#e8f6ff" : "#ffffff"), blurBackground: false, fit: "contain" })}
        onBackgroundColorChange={(color) => activeEditorImageKey && updateChannelTransform(activeImageChannel, activeEditorImageKey, { backgroundMode: "color", backgroundColor: color, blurBackground: false, fit: "contain" })}
        designState={getDesign(activeEditorTransform)}
        onDesignChange={(patch) => activeEditorImageKey && updateChannelTransform(activeImageChannel, activeEditorImageKey, { design: { ...getDesign(activeEditorTransform), ...patch } })}
        pillButtonStyle={pillBtn}
        pillButtonActiveStyle={pillBtnActive}
        sidebarItems={imageKeys.map((key, index) => {
          const included = (channelImageEditors[activeImageChannel]?.imageKeys || []).includes(key);
          return {
            key,
            previewUrl: previewByKey[key],
            title: `Image ${index + 1}`,
            subtitle: included ? "Publiée sur ce canal" : "Non envoyée sur ce canal",
            active: key === activeEditorImageKey,
            onClick: () => setActiveImageKeyByChannel((prev) => ({ ...prev, [activeImageChannel]: key })),
          };
        })}
      />


      <div ref={publishAreaRef} style={{ display: "grid", gap: 8, justifyItems: "end", scrollMarginBottom: 24 }}>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={onPublish}
            disabled={saving}
            style={{ minHeight: 52, padding: "0 24px", fontSize: 16, fontWeight: 800 }}
          >
            {saving ? `Publication ${publishProgress}%` : "Publier"}
          </button>
        </div>
        <div style={{ width: "min(440px, 100%)", minHeight: saving || publishError ? 58 : 0, display: "grid", gap: 8, justifyItems: "stretch" }}>
          {saving ? (
            <div style={{ justifySelf: "end", width: "100%", maxWidth: 440, borderRadius: 14, padding: "10px 12px", border: "1px solid rgba(76,195,255,0.22)", background: "rgba(76,195,255,0.08)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, fontSize: 12, color: "rgba(255,255,255,0.86)" }}>
                <span>{publishProgressLabel || "Publication en cours..."}</span>
                <strong>{publishProgress}%</strong>
              </div>
              <div style={{ marginTop: 8, height: 8, borderRadius: 999, background: "rgba(255,255,255,0.10)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${publishProgress}%`, borderRadius: 999, background: "linear-gradient(90deg, rgba(76,195,255,0.92), rgba(99,102,241,0.95))", transition: "width 180ms ease" }} />
              </div>
            </div>
          ) : null}
          {publishError ? <StatusMessage variant="error" style={{ marginTop: 0, textAlign: "right", maxWidth: 440, justifySelf: "end" }}>{publishError}</StatusMessage> : null}
        </div>
      </div>
    </div>
  );
}

const textAreaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 130,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.04)",
  color: "inherit",
  padding: "14px 16px",
  outline: "none",
  resize: "vertical",
  boxSizing: "border-box",
  display: "block",
  maxWidth: "100%",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 44,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.04)",
  color: "inherit",
  padding: "0 14px",
  outline: "none",
  boxSizing: "border-box",
  display: "block",
  maxWidth: "100%",
};

const lightFieldStyle: React.CSSProperties = {
  ...inputStyle,
  background: "#ffffff",
  color: "#111827",
  border: "1px solid rgba(17,24,39,0.14)",
};

const darkSelectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: "auto",
  WebkitAppearance: "menulist",
  MozAppearance: "menulist",
  color: "#ffffff",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.14)",
  colorScheme: "dark",
};

const darkOptionStyle: React.CSSProperties = {
  color: "#ffffff",
  background: "#1f2937",
};

const channelBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  minHeight: 48,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.03)",
  padding: "0 12px",
  color: "inherit",
  cursor: "pointer",
};

const channelBtnActive: React.CSSProperties = {
  border: "1px solid rgba(76,195,255,0.45)",
  boxShadow: "0 0 0 1px rgba(76,195,255,0.18) inset",
};

const channelBtnDisabled: React.CSSProperties = {
  opacity: 0.45,
  cursor: "not-allowed",
};

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
