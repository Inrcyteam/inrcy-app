import type { CSSProperties } from "react";
import { buildBoosterGmbSummary, buildBoosterInstagramCaption, getCtaMode, type BoosterCtaMode } from "@/lib/boosterCta";
export type { BoosterCtaMode } from "@/lib/boosterCta";

export type ChannelKey = "inrcy_site" | "site_web" | "gmb" | "facebook" | "instagram" | "linkedin";
export type DisplayKey = "site" | "gmb" | "facebook" | "instagram" | "linkedin";
export type ThemeKey = "" | "promotion" | "information" | "conseil" | "avis_client" | "realisation" | "actualite" | "autre";
export type StyleKey = "sobre" | "equilibre" | "dynamique";
export type FitMode = "contain" | "cover";
export type BackgroundMode = "blur" | "transparent" | "color" | "white" | "black" | "gray" | "sand" | "brand";
export type DesignPosition = "top" | "center" | "bottom";
export type ImageDesign = { enabled: boolean; text: string; color: string; background: string; position: DesignPosition; size: number; x?: number; y?: number; };

export type ChannelPost = {
  title: string;
  content: string;
  cta: string;
  ctaMode?: BoosterCtaMode;
  ctaUrl?: string;
  ctaPhone?: string;
  hashtags?: string[];
};

export type BoosterCtaDefaults = {
  preferredWebsiteUrl: string;
  preferredWebsiteLabel: string;
  siteWebUrl: string;
  inrcySiteUrl: string;
  phone: string;
};

export type ImagePayload = {
  name: string;
  type: string;
  dataUrl?: string;
  storagePath?: string;
  publicUrl?: string;
};

export type ImageTransform = {
  fit: FitMode;
  zoom: number;
  offsetX: number;
  offsetY: number;
  blurBackground: boolean;
  backgroundMode?: BackgroundMode;
  backgroundColor?: string;
  design?: ImageDesign;
};

export type ImageMeta = {
  width: number;
  height: number;
  ratio: number;
};

export type ChannelImageEditorState = {
  imageKeys: string[];
  transforms: Record<string, ImageTransform>;
};

export type ChannelImagePayload = Record<ChannelKey, ImagePayload[]>;
export type ChannelImageSettingsPayload = Record<ChannelKey, { imageKeys: string[]; transforms: Record<string, ImageTransform> }>;

export type RenderPreset = {
  width: number;
  height: number;
  defaultFit: FitMode;
  defaultBlurBackground: boolean;
};

export type PreviewLayout = {
  drawW: number;
  drawH: number;
  dx: number;
  dy: number;
  maxX: number;
  maxY: number;
};

export const DEFAULT_DESIGN: ImageDesign = { enabled: false, text: "", color: "#ffffff", background: "#111827", position: "bottom", size: 30, x: 50, y: 88 };

export const DEFAULT_TRANSFORM: ImageTransform = {
  fit: "contain",
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  blurBackground: false,
  backgroundMode: "color",
  backgroundColor: "#e8f6ff",
  design: DEFAULT_DESIGN,
};

export const DISPLAY_LABELS: Record<DisplayKey, string> = {
  site: "Site internet",
  gmb: "Google Business",
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
};

export const CHANNEL_LABELS: Record<ChannelKey, string> = {
  inrcy_site: "Site iNrCy",
  site_web: "Site web",
  gmb: "Google Business",
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
};

export const CHANNEL_PRESETS: Record<ChannelKey, RenderPreset> = {
  inrcy_site: { width: 1440, height: 900, defaultFit: "contain", defaultBlurBackground: false },
  site_web: { width: 1440, height: 900, defaultFit: "contain", defaultBlurBackground: false },
  gmb: { width: 1200, height: 900, defaultFit: "contain", defaultBlurBackground: false },
  facebook: { width: 1200, height: 1200, defaultFit: "cover", defaultBlurBackground: false },
  instagram: { width: 1080, height: 1350, defaultFit: "cover", defaultBlurBackground: false },
  linkedin: { width: 1200, height: 1200, defaultFit: "cover", defaultBlurBackground: false },
};

export const BOOSTER_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const BOOSTER_MAX_IMAGE_MB_LABEL = "8 Mo";

export type TextFieldKey = "title" | "content" | "cta" | "hashtags";
export type LimitTone = "ok" | "warn" | "over";

export type ChannelTextGuidelines = {
  title: number;
  content: number;
  cta: number;
  hashtags?: number;
  totalLabel?: string;
  totalMax?: number;
  totalValue?: (post: ChannelPost) => number;
};

export const CHANNEL_TEXT_GUIDELINES: Record<DisplayKey, ChannelTextGuidelines> = {
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

export const CTA_MODE_OPTIONS: Record<DisplayKey, Array<{ value: BoosterCtaMode; label: string }>> = {
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

export function getCtaModeHelp(channel: DisplayKey, mode: BoosterCtaMode) {
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

export function getDefaultPost(): ChannelPost {
  return { title: "", content: "", cta: "", ctaMode: "none", ctaUrl: "", ctaPhone: "", hashtags: [] };
}

export function getChannelDefaultCtaLabel(channel: DisplayKey, mode: BoosterCtaMode) {
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

export function buildAutoPrefillPatch(channel: DisplayKey, mode: BoosterCtaMode, post: ChannelPost, defaults: BoosterCtaDefaults | null): Partial<ChannelPost> {
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

export function getWebsiteSourceLabel(defaults: BoosterCtaDefaults | null) {
  if (!defaults?.preferredWebsiteUrl) return "";
  if (defaults.siteWebUrl && defaults.preferredWebsiteUrl === defaults.siteWebUrl) return "Site web connecté";
  if (defaults.inrcySiteUrl && defaults.preferredWebsiteUrl === defaults.inrcySiteUrl) return "Site iNrCy";
  return defaults.preferredWebsiteLabel || "Site connecté";
}

export function normalizePost(post?: Partial<ChannelPost> | null): ChannelPost {
  return {
    ...getDefaultPost(),
    ...(post || {}),
    ctaMode: getCtaMode(post || {}),
    ctaUrl: String(post?.ctaUrl || ""),
    ctaPhone: String(post?.ctaPhone || ""),
    hashtags: Array.isArray(post?.hashtags) ? post!.hashtags! : [],
  };
}

export function normalizeHashtagPreview(input: string): string {
  return String(input || "")
    .trim()
    .replace(/^#+/, "")
    .replace(/[^\p{L}\p{N}_]/gu, "")
    .slice(0, 40);
}

export function parseInstagramHashtagsInput(input: string): string[] {
  return String(input || "")
    .split(/[\s,;]+/)
    .map(normalizeHashtagPreview)
    .filter(Boolean)
    .slice(0, 20);
}

export function buildInstagramPreviewCaption(post: ChannelPost) {
  const cleanPost = {
    ...post,
    hashtags: Array.isArray(post.hashtags) ? post.hashtags.map(normalizeHashtagPreview).filter(Boolean).slice(0, 8) : [],
  };
  return buildBoosterInstagramCaption(cleanPost);
}

export function getLimitTone(current: number, max: number): LimitTone {
  if (current > max) return "over";
  if (current >= Math.round(max * 0.9)) return "warn";
  return "ok";
}

export function getLimitToneStyle(tone: LimitTone): CSSProperties {
  if (tone === "over") return { color: "#ff8f8f" };
  if (tone === "warn") return { color: "#fde68a" };
  return { color: "rgba(255,255,255,0.62)" };
}

export function renderLimitCounter(label: string, current: number, max: number) {
  const tone = getLimitTone(current, max);
  return (
    <div style={{ fontSize: 11, marginTop: 6, textAlign: "right", ...getLimitToneStyle(tone) }}>
      {label} : {current} / {max}
    </div>
  );
}

export const THEME_OPTIONS: Array<{ value: ThemeKey; label: string }> = [
  { value: "", label: "—" },
  { value: "promotion", label: "Promotion" },
  { value: "information", label: "Information" },
  { value: "conseil", label: "Conseil / Astuce" },
  { value: "avis_client", label: "Avis client / preuve sociale" },
  { value: "realisation", label: "Réalisation / intervention / chantier" },
  { value: "actualite", label: "Actualité / nouveauté" },
  { value: "autre", label: "Autre" },
];

export const THEME_PLACEHOLDERS: Record<ThemeKey, string> = {
  "": "Ex : Chantier réalisé chez Michel à Arras",
  promotion: "Ex : Offre de printemps sur la taille de haies jusqu’au 30 avril",
  information: "Ex : Nous intervenons désormais aussi le samedi sur Berck et ses alentours",
  conseil: "Ex : Pensez à faire entretenir votre chaudière avant l’hiver pour éviter les pannes",
  avis_client: "Ex : Merci à Mme Dupont pour sa confiance après la rénovation complète de sa salle de bain",
  realisation: "Ex : Terrasse en bois posée cette semaine chez un client à Montreuil",
  actualite: "Ex : Notre nouvelle prestation de nettoyage toiture est maintenant disponible",
  autre: "Ex : Intervention rapide réalisée ce matin suite à une fuite en cuisine",
};

export const STYLE_OPTIONS: Array<{ value: StyleKey; label: string }> = [
  { value: "sobre", label: "Sobre" },
  { value: "equilibre", label: "Équilibré" },
  { value: "dynamique", label: "Dynamique" },
];

export const STYLE_HELPERS: Record<StyleKey, string> = {
  sobre: "Ton plus posé, accroches sobres, très peu d’emojis.",
  equilibre: "Ton chaleureux et pro, avec juste ce qu’il faut de peps et d’emojis.",
  dynamique: "Ton plus vivant, accroches plus fortes, phrases plus rythmées et emojis adaptés au canal.",
};

export function makeImageKey(file: File): string {
  return `${file.name}__${file.size}__${file.lastModified}`;
}

export async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getBackgroundMode(transform: ImageTransform): BackgroundMode {
  if (transform.backgroundMode === "blur") return transform.backgroundColor ? "color" : "brand";
  if (transform.backgroundMode) return transform.backgroundMode;
  if (transform.blurBackground) return transform.backgroundColor ? "color" : "brand";
  return transform.backgroundColor ? "color" : "black";
}

export function withBackgroundMode(transform: ImageTransform, backgroundMode: BackgroundMode): ImageTransform {
  const normalizedMode = backgroundMode === "blur" ? (transform.backgroundColor ? "color" : "brand") : backgroundMode;
  return {
    ...transform,
    backgroundMode: normalizedMode,
    blurBackground: false,
  };
}

export function getBackgroundFill(mode: BackgroundMode, backgroundColor?: string): string {
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

export function getDesign(transform: ImageTransform): ImageDesign {
  const design = { ...DEFAULT_DESIGN, ...(transform.design || {}) };
  if (typeof design.x !== "number") design.x = 50;
  if (typeof design.y !== "number") design.y = design.position === "top" ? 12 : design.position === "center" ? 50 : 88;
  return design;
}

export function drawDesignOverlay(ctx: CanvasRenderingContext2D, cw: number, ch: number, transform: ImageTransform) {
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

export function computePreviewLayout(params: {
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

export function offsetFromDrawPosition(params: {
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

export function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Impossible de charger l'image."));
    img.src = src;
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  if (!res.ok) throw new Error("Impossible de préparer l'image.");
  return await res.blob();
}

export function sanitizeUploadName(name: string): string {
  return String(name || "image")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)+/g, "") || "image";
}

export function buildBoosterUploadPath(fileName: string): string {
  const safeName = sanitizeUploadName(fileName);
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `booster-prepublish/${unique}-${safeName}`;
}

export function clampPercent(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function uploadPreparedImages(
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

export async function renderChannelImage(params: {
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

export function getDefaultTransform(channel: ChannelKey): ImageTransform {
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

export function getOptimizedTransform(channel: ChannelKey, meta?: ImageMeta): ImageTransform {
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

export async function readImageMeta(file: File): Promise<ImageMeta> {
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

export function syncChannelImageEditors(params: {
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
