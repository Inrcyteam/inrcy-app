import { useEffect, useMemo, useRef, useState } from "react";
import stylesDash from "../../dashboard/dashboard.module.css";

type ChannelKey = "inrcy_site" | "site_web" | "gmb" | "facebook" | "instagram" | "linkedin";
type DisplayKey = "site" | "gmb" | "facebook" | "instagram" | "linkedin";
type ThemeKey = "" | "promotion" | "information" | "conseil" | "avis_client" | "realisation" | "actualite" | "autre";
type FitMode = "contain" | "cover";

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

const DEFAULT_TRANSFORM: ImageTransform = {
  fit: "contain",
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  blurBackground: true,
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
    const scale = baseScale * clamp(transform.zoom || 1, 1, 3);
    const drawW = iw * scale;
    const drawH = ih * scale;
    const maxX = Math.max(0, (drawW - cw) / 2);
    const maxY = Math.max(0, (drawH - ch) / 2);
    const dx = (cw - drawW) / 2 - maxX * clamp(transform.offsetX || 0, -100, 100) / 100;
    const dy = (ch - drawH) / 2 - maxY * clamp(transform.offsetY || 0, -100, 100) / 100;

    ctx.clearRect(0, 0, cw, ch);

    if (transform.fit === "contain" && transform.blurBackground) {
      ctx.save();
      ctx.filter = "blur(28px) saturate(1.05) brightness(1.02)";
      const bgScale = Math.max(cw / iw, ch / ih);
      const bgW = iw * bgScale;
      const bgH = ih * bgScale;
      ctx.drawImage(img, (cw - bgW) / 2, (ch - bgH) / 2, bgW, bgH);
      ctx.restore();
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fillRect(0, 0, cw, ch);
    } else {
      ctx.fillStyle = "#0d1320";
      ctx.fillRect(0, 0, cw, ch);
    }

    ctx.drawImage(img, dx, dy, drawW, drawH);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    return {
      name: file.name.replace(/\.[^.]+$/, "") + `-${preset.width}x${preset.height}.jpg`,
      type: "image/jpeg",
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
  };
}

function syncChannelImageEditors(params: {
  previous: Partial<Record<ChannelKey, ChannelImageEditorState>>;
  imageKeys: string[];
  selectedChannels: ChannelKey[];
}): Partial<Record<ChannelKey, ChannelImageEditorState>> {
  const { previous, imageKeys, selectedChannels } = params;
  const next: Partial<Record<ChannelKey, ChannelImageEditorState>> = {};

  for (const channel of selectedChannels) {
    const prevState = previous[channel];
    const nextImageKeys = (prevState?.imageKeys || []).filter((key) => imageKeys.includes(key));
    const mergedKeys = nextImageKeys.length ? nextImageKeys : [...imageKeys];
    const transforms: Record<string, ImageTransform> = {};
    for (const key of imageKeys) {
      transforms[key] = prevState?.transforms?.[key]
        ? { ...prevState.transforms[key] }
        : getDefaultTransform(channel);
    }
    next[channel] = { imageKeys: mergedKeys.filter((key, index, arr) => arr.indexOf(key) === index), transforms };
  }

  return next;
}

export default function PublishModal({
  styles,
  onClose,
  trackEvent,
}: {
  styles: typeof stylesDash;
  onClose: () => void;
  trackEvent: (type: "publish", payload: Record<string, any>) => Promise<any>;
}) {
  const [saving, setSaving] = useState(false);
  const [idea, setIdea] = useState("");
  const [theme, setTheme] = useState<ThemeKey>("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [postsByChannel, setPostsByChannel] = useState<Partial<Record<ChannelKey, ChannelPost>>>({});
  const [activeCard, setActiveCard] = useState<DisplayKey>("site");
  const [isMobile, setIsMobile] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imgError, setImgError] = useState("");
  const [channelImageEditors, setChannelImageEditors] = useState<Partial<Record<ChannelKey, ChannelImageEditorState>>>({});
  const [activeImageChannel, setActiveImageChannel] = useState<ChannelKey>("inrcy_site");
  const [activeImageKeyByChannel, setActiveImageKeyByChannel] = useState<Partial<Record<ChannelKey, string>>>({});

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
    setChannelImageEditors((prev) => syncChannelImageEditors({ previous: prev, imageKeys, selectedChannels }));
  }, [imageKeys.join("|"), selectedChannels.join("|")]);

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
  const activeEditorTransform = activeEditor?.transforms?.[activeEditorImageKey] || getDefaultTransform(activeImageChannel);

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
        setGenError(json?.error || "Erreur IA");
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
      setGenError("Erreur réseau");
    } finally {
      setGenerating(false);
    }
  };

  const onPickImagesClick = () => {
    setImgError("");
    fileInputRef.current?.click();
  };

  const onImagesChange = (files: FileList | null) => {
    setImgError("");
    if (!files) return;

    const picked = Array.from(files);
    if (!picked.length) return;

    const tooBig = picked.find((f) => f.size > 2 * 1024 * 1024);
    if (tooBig) {
      setImgError("Image trop lourde (max 2 Mo).");
      return;
    }

    setImages((prev) => {
      const merged = [...prev];
      for (const file of picked) {
        const alreadyAdded = merged.some(
          (existing) => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified
        );
        if (alreadyAdded) continue;
        if (merged.length >= 5) {
          setImgError("Maximum 5 images.");
          break;
        }
        merged.push(file);
      }
      return merged;
    });
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
      reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
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
              ...(current.transforms[imageKey] || getDefaultTransform(channel)),
              ...patch,
            },
          },
        },
      };
    });
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
            [imageKey]: current.transforms[imageKey] || getDefaultTransform(channel),
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
    updateChannelTransform(channel, imageKey, getDefaultTransform(channel));
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
    setGenError("");
    setImgError("");

    if (!selectedChannels.length) {
      setGenError("Sélectionnez au moins 1 canal.");
      return;
    }

    const missingContent = selectedChannels.find((ch) => !String((ch === "inrcy_site" || ch === "site_web" ? getDisplayPost("site") : postsByChannel[ch])?.content || "").trim());
    if (missingContent) {
      setGenError(`Le contenu est vide pour ${CHANNEL_LABELS[missingContent]}.`);
      return;
    }

    if (selectedChannels.includes("instagram")) {
      const instagramImages = channelImageEditors.instagram?.imageKeys || [];
      if (!instagramImages.length) {
        setImgError("Instagram nécessite au moins 1 image sélectionnée.");
        return;
      }
    }

    setSaving(true);
    try {
      const imagePayloads: ImagePayload[] = await Promise.all(
        images.map(async (f) => ({ name: f.name, type: f.type, dataUrl: await fileToDataUrl(f) }))
      );

      if (images.length && (!imagePayloads.length || imagePayloads.some((p) => !p.dataUrl.startsWith("data:")))) {
        setImgError("Impossible de convertir une ou plusieurs images (format non supporté).");
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

      onClose();
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "La publication a échoué.");
    } finally {
      setSaving(false);
    }
  };

  const previewAspectRatio = `${CHANNEL_PRESETS[activeImageChannel].width} / ${CHANNEL_PRESETS[activeImageChannel].height}`;
  const previewTransform = `translate(${activeEditorTransform.offsetX * 0.45}%, ${activeEditorTransform.offsetY * 0.45}%) scale(${activeEditorTransform.zoom})`;
  const previewObjectFit = activeEditorTransform.fit === "cover" ? "cover" : "contain";

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
          Ajoutez 1 ou plusieurs images (max 5, 2 Mo chacune). <strong>Fort recommandé</strong>. <strong>Obligatoire pour Instagram</strong>.
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
                <button type="button" className={styles.secondaryBtn} style={{ position: "absolute", top: 6, right: 6, padding: "6px 10px", fontSize: 12 }} onClick={() => removeImage(idx)}>✕</button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className={styles.blockCard}>
        <div className={styles.blockTitle} style={{ marginBottom: 8 }}>Retouche des images par canal</div>
        <div className={styles.subtitle} style={{ marginBottom: 10, maxWidth: "none" }}>
          iNrCy prépare un aperçu pour chacun des 6 canaux. Vous pouvez ensuite sélectionner et ajuster les images canal par canal.
        </div>
        {!selectedChannels.length ? (
          <div style={{ fontSize: 13, opacity: 0.75 }}>Sélectionnez d’abord vos canaux.</div>
        ) : !images.length ? (
          <div style={{ fontSize: 13, opacity: 0.75 }}>Ajoutez d’abord une ou plusieurs images pour activer les aperçus et les retouches.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", overflowX: "auto" }}>
              {selectedChannels.map((channel) => (
                <button key={channel} type="button" onClick={() => setActiveImageChannel(channel)} style={{ ...pillBtn, ...(activeImageChannel === channel ? pillBtnActive : {}) }}>
                  {CHANNEL_LABELS[channel]}
                </button>
              ))}
            </div>

            <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 16, padding: 12, background: "rgba(255,255,255,0.03)", display: "grid", gap: 12 }}>
              <div style={{ fontWeight: 900 }}>{CHANNEL_LABELS[activeImageChannel]}</div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {(channelImageEditors[activeImageChannel]?.imageKeys || imageKeys).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveImageKeyByChannel((prev) => ({ ...prev, [activeImageChannel]: key }))}
                    style={{
                      border: activeEditorImageKey === key ? "1px solid rgba(76,195,255,0.55)" : "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.04)",
                      borderRadius: 14,
                      padding: 6,
                      cursor: "pointer",
                    }}
                  >
                    <img src={previewByKey[key]} alt={key} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 10, display: "block" }} />
                  </button>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(320px, 420px) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
                <div>
                  {activeEditorImageKey ? (
                    <div style={{ position: "relative", width: "100%", aspectRatio: previewAspectRatio, borderRadius: 18, overflow: "hidden", border: "1px solid rgba(255,255,255,0.12)", background: "#0d1320" }}>
                      {activeEditorTransform.blurBackground ? (
                        <img
                          src={previewByKey[activeEditorImageKey]}
                          alt="background-preview"
                          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "blur(24px)", transform: "scale(1.08)", opacity: 0.95 }}
                        />
                      ) : null}
                      <img
                        src={previewByKey[activeEditorImageKey]}
                        alt="preview"
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: previewObjectFit, transform: previewTransform, transformOrigin: "center center" }}
                      />
                      <div style={{ position: "absolute", left: 10, bottom: 10, fontSize: 12, padding: "6px 10px", borderRadius: 999, background: "rgba(6,10,20,0.72)", border: "1px solid rgba(255,255,255,0.12)" }}>
                        {CHANNEL_PRESETS[activeImageChannel].width}×{CHANNEL_PRESETS[activeImageChannel].height} • {activeEditorTransform.fit === "cover" ? "Remplir" : "Adapter"}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, opacity: 0.75 }}>Aucune image active pour ce canal.</div>
                  )}
                </div>

                <div style={{ display: "grid", gap: 12 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className={styles.secondaryBtn} onClick={() => activeEditorImageKey && updateChannelTransform(activeImageChannel, activeEditorImageKey, { fit: "contain", blurBackground: true })} disabled={!activeEditorImageKey}>Adapter</button>
                    <button type="button" className={styles.secondaryBtn} onClick={() => activeEditorImageKey && updateChannelTransform(activeImageChannel, activeEditorImageKey, { fit: "cover", blurBackground: false })} disabled={!activeEditorImageKey}>Remplir</button>
                    <button type="button" className={styles.secondaryBtn} onClick={() => activeEditorImageKey && resetChannelImage(activeImageChannel, activeEditorImageKey)} disabled={!activeEditorImageKey}>Réinitialiser</button>
                    <button type="button" className={styles.secondaryBtn} onClick={applyCurrentImageToSelectedChannels} disabled={!activeEditorImageKey}>Appliquer aux canaux sélectionnés</button>
                  </div>

                  <div style={{ display: "grid", gap: 10 }}>
                    {imageKeys.map((key, index) => {
                      const included = (channelImageEditors[activeImageChannel]?.imageKeys || []).includes(key);
                      return (
                        <label key={`${activeImageChannel}-${key}`} style={{ display: "grid", gridTemplateColumns: "auto auto 1fr auto", gap: 10, alignItems: "center", padding: "8px 10px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
                          <input type="checkbox" checked={included} onChange={() => toggleChannelImage(activeImageChannel, key)} style={{ width: 16, height: 16, accentColor: "#4cc3ff" }} />
                          <img src={previewByKey[key]} alt={key} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 10 }} />
                          <span style={{ fontSize: 12, opacity: included ? 0.95 : 0.65 }}>Image {index + 1} • {included ? "publiée sur ce canal" : "non envoyée sur ce canal"}</span>
                          <button type="button" className={styles.secondaryBtn} style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => setActiveImageKeyByChannel((prev) => ({ ...prev, [activeImageChannel]: key }))}>Modifier</button>
                        </label>
                      );
                    })}
                  </div>

                  <div style={{ display: "grid", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Zoom</div>
                      <input type="range" min={1} max={2.5} step={0.01} value={activeEditorTransform.zoom} onChange={(e) => activeEditorImageKey && updateChannelTransform(activeImageChannel, activeEditorImageKey, { zoom: Number(e.target.value) })} disabled={!activeEditorImageKey} style={{ width: "100%" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Centrage horizontal</div>
                      <input type="range" min={-100} max={100} step={1} value={activeEditorTransform.offsetX} onChange={(e) => activeEditorImageKey && updateChannelTransform(activeImageChannel, activeEditorImageKey, { offsetX: Number(e.target.value) })} disabled={!activeEditorImageKey} style={{ width: "100%" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Centrage vertical</div>
                      <input type="range" min={-100} max={100} step={1} value={activeEditorTransform.offsetY} onChange={(e) => activeEditorImageKey && updateChannelTransform(activeImageChannel, activeEditorImageKey, { offsetY: Number(e.target.value) })} disabled={!activeEditorImageKey} style={{ width: "100%" }} />
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, opacity: activeEditorImageKey ? 1 : 0.6 }}>
                      <input type="checkbox" checked={!!activeEditorTransform.blurBackground} onChange={(e) => activeEditorImageKey && updateChannelTransform(activeImageChannel, activeEditorImageKey, { blurBackground: e.target.checked })} disabled={!activeEditorImageKey || activeEditorTransform.fit === "cover"} style={{ width: 16, height: 16, accentColor: "#4cc3ff" }} />
                      Fond flou (utile pour les visuels avec texte)
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button type="button" className={styles.primaryBtn} onClick={onPublish} disabled={saving}>
          {saving ? "Publication..." : "Publier"}
        </button>
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
