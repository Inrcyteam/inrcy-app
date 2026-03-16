import { useEffect, useMemo, useRef, useState } from "react";
import stylesDash from "../../dashboard/dashboard.module.css";

type ChannelKey = "inrcy_site" | "site_web" | "gmb" | "facebook" | "instagram" | "linkedin";
type DisplayKey = "site" | "gmb" | "facebook" | "instagram" | "linkedin";
type ThemeKey = "" | "promotion" | "information" | "conseil" | "avis_client" | "realisation" | "actualite" | "autre";

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

const THEME_STARTERS: Partial<Record<Exclude<ThemeKey, "">, string>> = {
  promotion: "Nous proposons actuellement une offre spéciale sur ",
  information: "Nous souhaitons informer nos clients que ",
  conseil: "Voici un conseil utile concernant ",
  avis_client: "Un client nous a récemment partagé son retour sur ",
  realisation: "Nous venons de réaliser ",
  actualite: "Nouvelle actualité chez nous : ",
  autre: "",
};

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
    const out: ChannelKey[] = [];
    if (channels.inrcy_site || channels.site_web) out.push("site_web");
    if (channels.gmb && connected.gmb) out.push("gmb");
    if (channels.facebook && connected.facebook) out.push("facebook");
    if (channels.instagram && connected.instagram) out.push("instagram");
    if (channels.linkedin && connected.linkedin) out.push("linkedin");
    return out;
  }, [channels, connected]);

  const toggle = (key: ChannelKey) => {
    if (!connected[key]) return;
    setChannels((s) => ({ ...s, [key]: !s[key] }));
  };

  const onThemeChange = (next: ThemeKey) => {
    setTheme(next);
    if ((!idea.trim() || Object.values(THEME_STARTERS).includes(idea)) && next) {
      setIdea(THEME_STARTERS[next] || "");
    }
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
      const sitePost = versions.site_web || versions.inrcy_site || undefined;
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

    const picked = Array.from(files).slice(0, 5);
    if (!picked.length) return;

    const tooBig = picked.find((f) => f.size > 2 * 1024 * 1024);
    if (tooBig) {
      setImgError("Image trop lourde (max 2 Mo).");
      return;
    }

    imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    setImages(picked);
    setImagePreviews(picked.map((f) => URL.createObjectURL(f)));
  };

  const removeImage = (idx: number) => {
    const removed = imagePreviews[idx];
    if (removed) URL.revokeObjectURL(removed);
    setImages((prev) => prev.filter((_, i) => i !== idx));
    setImagePreviews((prev) => prev.filter((_, i) => i !== idx));
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

  const onPublish = async () => {
    if (saving) return;
    setGenError("");

    if (!selectedChannels.length) {
      setGenError("Sélectionnez au moins 1 canal.");
      return;
    }

    const missingContent = selectedChannels.find((ch) => !String((ch === "inrcy_site" || ch === "site_web" ? getDisplayPost("site") : postsByChannel[ch])?.content || "").trim());
    if (missingContent) {
      setGenError(`Le contenu est vide pour ${CHANNEL_LABELS[missingContent]}.`);
      return;
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
      });

      onClose();
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "La publication a échoué.");
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
        <div className={styles.subtitle} style={{ marginBottom: 10 }}>
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
              placeholder="Ex : Chantier réalisé chez Michel à Arras"
              style={textAreaStyle}
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
            />
          </div>
          {genError ? <div style={{ fontSize: 13, color: "#ffb4b4" }}>{genError}</div> : null}
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
        <div className={styles.subtitle} style={{ marginBottom: 10 }}>
          Relisez et ajustez si nécessaire chaque version avant publication.
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
        <div className={styles.subtitle} style={{ marginBottom: 10 }}>
          Ajoutez 1 ou plusieurs images (max 5, 2 Mo chacune). <strong>Fort recommandé</strong>. <strong>Obligatoire pour Instagram</strong>.
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => onImagesChange(e.target.files)} />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className={styles.secondaryBtn} onClick={onPickImagesClick}>+ Ajouter des images</button>
          {images.length ? <div style={{ fontSize: 12, opacity: 0.85 }}>{images.length} fichier(s) sélectionné(s)</div> : <div style={{ fontSize: 12, opacity: 0.7 }}>Aucune image</div>}
        </div>
        {imgError ? <div style={{ marginTop: 10, fontSize: 13, color: "#ffb4b4" }}>{imgError}</div> : null}
        {imagePreviews.length ? (
          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {imagePreviews.map((src, idx) => (
              <div key={src} style={{ position: "relative" }}>
                <img src={src} alt={`upload-${idx}`} style={{ width: 110, height: 110, objectFit: "cover", borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)" }} />
                <button type="button" className={styles.secondaryBtn} style={{ position: "absolute", top: 6, right: 6, padding: "6px 10px", fontSize: 12 }} onClick={() => removeImage(idx)}>✕</button>
              </div>
            ))}
          </div>
        ) : null}
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
