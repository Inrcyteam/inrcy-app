import { useEffect, useMemo, useRef, useState } from "react";
import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import stylesDash from "../../dashboard/dashboard.module.css";
import { ChannelImageRetouchCardsPanel, ChannelImageRetouchModal } from "@/app/dashboard/_components/ChannelImageRetouchTool";

type ChannelKey = "inrcy_site" | "site_web" | "gmb" | "facebook" | "instagram" | "linkedin";
type DisplayKey = "site" | "gmb" | "facebook" | "instagram" | "linkedin";
type ThemeKey = "" | "promotion" | "information" | "conseil" | "avis_client" | "realisation" | "actualite" | "autre";
type FitMode = "contain" | "cover";
type BackgroundMode = "blur" | "transparent" | "color" | "white" | "black" | "gray" | "sand" | "brand";
type DesignPosition = "top" | "center" | "bottom";
type ImageDesign = { enabled: boolean; text: string; color: string; background: string; position: DesignPosition; size: number; x?: number; y?: number; };

type ChannelPost = {
  title: string;
  content: string;
  cta: string;
  hashtags?: string[];
};

type ImagePayload = {
  name: string;
  type: string;
  dataUrl: string;
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
  blurBackground: true,
  backgroundMode: "blur",
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
  inrcy_site: { width: 1440, height: 900, defaultFit: "contain", defaultBlurBackground: true },
  site_web: { width: 1440, height: 900, defaultFit: "contain", defaultBlurBackground: true },
  gmb: { width: 1200, height: 900, defaultFit: "contain", defaultBlurBackground: true },
  facebook: { width: 1200, height: 1200, defaultFit: "cover", defaultBlurBackground: false },
  instagram: { width: 1080, height: 1350, defaultFit: "cover", defaultBlurBackground: false },
  linkedin: { width: 1200, height: 1200, defaultFit: "cover", defaultBlurBackground: false },
};

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

function makeImageKey(file: File): string {
  return `${file.name}__${file.size}__${file.lastModified}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getBackgroundMode(transform: ImageTransform): BackgroundMode {
  if (transform.backgroundMode) return transform.backgroundMode;
  return transform.blurBackground ? "blur" : "black";
}

function withBackgroundMode(transform: ImageTransform, backgroundMode: BackgroundMode): ImageTransform {
  return {
    ...transform,
    backgroundMode,
    blurBackground: backgroundMode === "blur",
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
    if (transform.fit === "contain" && backgroundMode === "blur") {
      ctx.save();
      ctx.filter = "blur(28px) saturate(1.05) brightness(1.02)";
      const bgScale = Math.max(cw / iw, ch / ih);
      const bgW = iw * bgScale;
      const bgH = ih * bgScale;
      ctx.drawImage(img, (cw - bgW) / 2, (ch - bgH) / 2, bgW, bgH);
      ctx.restore();
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fillRect(0, 0, cw, ch);
    } else if (backgroundMode !== "transparent") {
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
    blurBackground: preset.defaultBlurBackground,
    backgroundMode: preset.defaultBlurBackground ? "blur" : "black",
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
    return withBackgroundMode({ ...base, fit: "contain", zoom: 1 }, "blur");
  }

  if (channel === "instagram") {
    if (isVeryWide) return withBackgroundMode({ ...base, fit: "contain", zoom: 1, offsetX: 0, offsetY: 0 }, "blur");
    if (isWide) return withBackgroundMode({ ...base, fit: "contain", zoom: 1 }, "blur");
    if (isVeryTall) return withBackgroundMode({ ...base, fit: "contain", zoom: 1 }, "blur");
    if (isTall) return withBackgroundMode({ ...base, fit: "cover", zoom: 1.04, offsetX: 0, offsetY: -10 }, "black");
    return withBackgroundMode({ ...base, fit: "cover", zoom: ratio < 1 ? 1.03 : 1.08, offsetX: 0, offsetY: ratio > 1 ? 0 : -6 }, "black");
  }

  if (channel === "facebook" || channel === "linkedin") {
    if (isVeryWide || isVeryTall) return withBackgroundMode({ ...base, fit: "contain", zoom: 1 }, "blur");
    if (isWide) return withBackgroundMode({ ...base, fit: "contain", zoom: 1 }, "blur");
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
    const mergedKeys = nextImageKeys.length ? nextImageKeys : [...imageKeys];
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
  onPublishSuccess?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [idea, setIdea] = useState("");
  const [theme, setTheme] = useState<ThemeKey>("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [publishError, setPublishError] = useState("");
  const [postsByChannel, setPostsByChannel] = useState<Partial<Record<ChannelKey, ChannelPost>>>({});
  const [activeCard, setActiveCard] = useState<DisplayKey>("site");
  const [isMobile, setIsMobile] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imgError, setImgError] = useState("");
  const [imageMetaByKey, setImageMetaByKey] = useState<Record<string, ImageMeta>>({});
  const [channelImageEditors, setChannelImageEditors] = useState<Partial<Record<ChannelKey, ChannelImageEditorState>>>({});
  const [activeImageChannel, setActiveImageChannel] = useState<ChannelKey>("inrcy_site");
  const [activeImageKeyByChannel, setActiveImageKeyByChannel] = useState<Partial<Record<ChannelKey, string>>>({});
  const previewStageRef = useRef<HTMLDivElement | null>(null);
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
    const check = () => setIsMobile(typeof window !== "undefined" && window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
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
    setPostsByChannel({});
    setGenError("");
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
      setGenError("Sélectionnez au moins 1 canal avant de générer.");
      return;
    }
    if (!trimmed) {
      setGenError("Écrivez une phrase (ex : chantier terminé...).");
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch("/api/booster/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: trimmed, theme, channels: selectedForGeneration }),
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

      setPostsByChannel({
        ...versions,
        ...(sitePost ? { inrcy_site: sitePost, site_web: sitePost } : {}),
      });
    } catch {
      setGenError("Connexion impossible pour le moment. Merci de réessayer.");
    } finally {
      setGenerating(false);
    }
  };

  const onPickImagesClick = () => {
    setImgError("");
    fileInputRef.current?.click();
  };

  const onImagesChange = async (files: FileList | null) => {
    setImgError("");
    if (!files) return;

    const picked = Array.from(files);
    if (!picked.length) return;

    const tooBig = picked.find((f) => f.size > 2 * 1024 * 1024);
    if (tooBig) {
      setImgError("Image trop lourde (max 2 Mo).");
      return;
    }

    const existingKeys = new Set(images.map((file) => makeImageKey(file)));
    const uniquePicked: File[] = [];
    for (const file of picked) {
      const key = makeImageKey(file);
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      uniquePicked.push(file);
    }

    if (!uniquePicked.length) return;

    const remainingSlots = Math.max(0, 5 - images.length);
    const accepted = uniquePicked.slice(0, remainingSlots);
    if (uniquePicked.length > accepted.length) {
      setImgError("Maximum 5 images.");
    }
    if (!accepted.length) return;

    const metaEntries = await Promise.all(accepted.map(async (file) => [makeImageKey(file), await readImageMeta(file)] as const));
    setImageMetaByKey((prev) => ({ ...prev, ...Object.fromEntries(metaEntries) }));
    setImages((prev) => [...prev, ...accepted]);
  };

  useEffect(() => {
    setImagePreviews((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return images.map((file) => URL.createObjectURL(file));
    });
  }, [images]);

  useEffect(() => {
    return () => {
      imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [imagePreviews]);

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error ?? new Error("Impossible de lire cette image."));
      reader.readAsDataURL(file);
    });

  const updatePost = (channel: ChannelKey, patch: Partial<ChannelPost>) => {
    if (channel === "inrcy_site" || channel === "site_web") {
      const next = {
        title: "",
        content: "",
        cta: "",
        hashtags: [],
        ...(postsByChannel.site_web || postsByChannel.inrcy_site || {}),
        ...patch,
      };
      setPostsByChannel((prev) => ({ ...prev, inrcy_site: next, site_web: next }));
      return;
    }
    setPostsByChannel((prev) => ({
      ...prev,
      [channel]: {
        title: "",
        content: "",
        cta: "",
        hashtags: [],
        ...(prev[channel] || {}),
        ...patch,
      },
    }));
  };

  const getDisplayPost = (key: DisplayKey): ChannelPost => {
    if (key === "site") return postsByChannel.site_web || postsByChannel.inrcy_site || { title: "", content: "", cta: "", hashtags: [] };
    return postsByChannel[key] || { title: "", content: "", cta: "", hashtags: [] };
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
    const backgroundMode = current.fit === "contain" ? getBackgroundMode(current) : "blur";
    updateChannelTransform(channel, imageKey, { fit: "contain", backgroundMode, blurBackground: backgroundMode === "blur" });
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

  const buildChannelImagesPayload = async (): Promise<{
    channelImages: ChannelImagePayload;
    channelSettings: ChannelImageSettingsPayload;
  }> => {
    const channelImages = {} as ChannelImagePayload;
    const channelSettings = {} as ChannelImageSettingsPayload;

    for (const channel of selectedChannels) {
      const editor = channelImageEditors[channel] || { imageKeys: [], transforms: {} };
      const renderList: ImagePayload[] = [];
      for (const imageKey of editor.imageKeys) {
        const file = imageFileByKey[imageKey];
        if (!file) continue;
        const transform = editor.transforms[imageKey] || getDefaultTransform(channel);
        renderList.push(await renderChannelImage({ file, transform, preset: CHANNEL_PRESETS[channel] }));
      }
      channelImages[channel] = renderList;
      channelSettings[channel] = {
        imageKeys: [...editor.imageKeys],
        transforms: Object.fromEntries(Object.entries(editor.transforms || {}).map(([key, value]) => [key, { ...value }])),
      };
    }

    return { channelImages, channelSettings };
  };

  const onPublish = async () => {
    if (saving) return;
    setPublishError("");
    setImgError("");

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
        setImgError("Ajoutez au moins 1 image pour publier sur Instagram.");
        return;
      }
    }

    setSaving(true);
    try {
      const imagePayloads: ImagePayload[] = await Promise.all(
        images.map(async (f) => ({ name: f.name, type: f.type, dataUrl: await fileToDataUrl(f) }))
      );

      if (images.length && (!imagePayloads.length || imagePayloads.some((p) => !p.dataUrl.startsWith("data:")))) {
        setImgError("Impossible de préparer une ou plusieurs images. Vérifiez leur format puis réessayez.");
        return;
      }

      const { channelImages, channelSettings } = await buildChannelImagesPayload();
      const sitePost = getDisplayPost("site");
      await trackEvent("publish", {
        idea: idea.trim(),
        theme,
        channels: selectedChannels,
        postByChannel: {
          ...postsByChannel,
          ...(channels.inrcy_site ? { inrcy_site: sitePost } : {}),
          ...(channels.site_web ? { site_web: sitePost } : {}),
        },
        images: imagePayloads,
        imagesByChannel: channelImages,
        imageSettingsByChannel: channelSettings,
      });

      onPublishSuccess?.();
      onClose();
    } catch (e) {
      setPublishError(getSimpleFrenchErrorMessage(e, "La publication n'a pas pu être envoyée. Merci de réessayer."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className={styles.blockCard}>
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
                <span style={{ minWidth: 0, whiteSpace: isMobile ? "normal" : "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "left" }}>
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

      <div className={styles.blockCard}>
        <div className={styles.blockTitle} style={{ marginBottom: 8 }}>Votre intention</div>
        <div className={styles.subtitle} style={{ marginBottom: 10, maxWidth: "none", whiteSpace: isMobile ? "normal" : "nowrap" }}>
          Choisissez le thème si vous le souhaitez, puis écrivez votre phrase. iNrCy adapte ensuite le contenu à chaque canal.
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Thème</div>
            <select value={theme} onChange={(e) => onThemeChange(e.target.value as ThemeKey)} style={inputStyle as React.CSSProperties}>
              {THEME_OPTIONS.map((opt) => (
                <option key={opt.value || "empty"} value={opt.value} style={{ color: "#111", background: "#fff" }}>{opt.label}</option>
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
          {genError ? <div style={{ fontSize: 13, color: "#ffb4b4" }}>{genError}</div> : null}
          {generating ? <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)" }}>Cela peut prendre quelques secondes.</div> : null}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className={styles.primaryBtn} onClick={onGenerate} disabled={generating}>
              {generating ? "Génération..." : "Générer avec iNrCy"}
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={onReset}>Réinitialiser</button>
          </div>
        </div>
      </div>

      <div className={styles.blockCard}>
        <div className={styles.blockTitle} style={{ marginBottom: 8 }}>Contenus par canal</div>
        <div className={styles.subtitle} style={{ marginBottom: 10, maxWidth: "none", whiteSpace: isMobile ? "normal" : "nowrap" }}>
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
                </div>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Contenu</div>
                  <textarea value={getDisplayPost(activeCard).content} onChange={(e) => updatePost(activeCard === "site" ? "site_web" : activeCard, { content: e.target.value })} style={{ ...textAreaStyle, minHeight: activeCard === "site" ? 280 : 160 }} placeholder="Contenu" />
                </div>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>CTA</div>
                  <input value={getDisplayPost(activeCard).cta} onChange={(e) => updatePost(activeCard === "site" ? "site_web" : activeCard, { cta: e.target.value })} style={inputStyle} placeholder="Ex : Contactez-nous" />
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
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, opacity: 0.75 }}>Sélectionnez d’abord vos canaux.</div>
        )}
      </div>

      <div className={styles.blockCard}>
        <div className={styles.blockTitle} style={{ marginBottom: 8 }}>Images</div>
        <div className={styles.subtitle} style={{ marginBottom: 10, maxWidth: "none", whiteSpace: isMobile ? "normal" : "nowrap" }}>
          Ajoutez 1 ou plusieurs images (max 5, 2 Mo chacune). iNrCy applique automatiquement un cadrage de départ intelligent par canal. <strong>Fort recommandé</strong>. <strong>Obligatoire pour Instagram</strong>.
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


      <div className={styles.blockCard}>
        <div className={styles.blockTitle} style={{ marginBottom: 8 }}>Retouche des images par canal</div>
        <div className={styles.subtitle} style={{ marginBottom: 10, maxWidth: "none" }}>
          Gérez chaque canal séparément : cochez les images à publier, puis ouvrez la retouche uniquement quand vous voulez recadrer une image.
        </div>
        {!selectedChannels.length ? (
          <div style={{ fontSize: 13, opacity: 0.75 }}>Sélectionnez d’abord vos canaux.</div>
        ) : !images.length ? (
          <div style={{ fontSize: 13, opacity: 0.75 }}>Ajoutez d’abord une ou plusieurs images pour activer les retouches.</div>
        ) : (
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
        onBackgroundModeChange={(mode) => activeEditorImageKey && updateChannelTransform(activeImageChannel, activeEditorImageKey, mode === "blur" ? { backgroundMode: "blur", blurBackground: true, fit: "contain" } : mode === "transparent" ? { backgroundMode: "transparent", blurBackground: false, fit: "contain" } : { backgroundMode: "color", backgroundColor: activeEditorTransform.backgroundColor || "#e8f6ff", blurBackground: false, fit: "contain" })}
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


      <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" className={styles.primaryBtn} onClick={onPublish} disabled={saving}>
            {saving ? "Publication..." : "Publier"}
          </button>
        </div>
        {publishError ? <div className={styles.errNote} style={{ marginTop: 0, textAlign: "right", maxWidth: 440 }}>{publishError}</div> : null}
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
