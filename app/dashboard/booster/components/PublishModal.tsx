import { useEffect, useMemo, useRef, useState } from "react";
import stylesDash from "../../dashboard/dashboard.module.css";

type GeneratedPost = {
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
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [generated, setGenerated] = useState<GeneratedPost | null>(null);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [cta, setCta] = useState("");
  const [hashtagsText, setHashtagsText] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imgError, setImgError] = useState("");

  const [channels, setChannels] = useState({
    inrcy_site: false,
    site_web: false,
    gmb: false,
    facebook: false,
    instagram: false,
    linkedin: false,
  });

  const [connected, setConnected] = useState({
    inrcy_site: true,
    site_web: true,
    gmb: false,
    facebook: false,
    instagram: false,
    linkedin: false,
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/booster/connected-channels", { cache: "no-store" as any });
        if (!res.ok) return;
        const json = await res.json();
        if (!alive) return;
        if (json?.channels) setConnected((s) => ({ ...s, ...json.channels }));
      } catch {
        // ignore
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const selectedChannels = useMemo(
    () => Object.entries(channels).filter(([k, v]) => v && (connected as any)[k]).map(([k]) => k),
    [channels, connected]
  );

  const toggle = (key: keyof typeof channels) => setChannels((s) => ({ ...s, [key]: !s[key] }));

  const onReset = () => {
    setIdea("");
    setGenerated(null);
    setGenError("");
    setTitle("");
    setContent("");
    setCta("");
    setHashtagsText("");
    imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    setImages([]);
    setImagePreviews([]);
    setImgError("");
  };

  const onGenerate = async () => {
    if (generating) return;
    setGenError("");

    const trimmed = idea.trim();
    if (!trimmed) {
      setGenError("Écrivez une phrase (ex : chantier terminé...).");
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch("/api/booster/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: trimmed, channels: selectedChannels }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGenError(json?.error || "Erreur IA");
        return;
      }

      const post = json as GeneratedPost;
      setGenerated(post);
      setTitle(post.title || "");
      setContent(post.content || "");
      setCta(post.cta || "");
      setHashtagsText(Array.isArray(post.hashtags) ? post.hashtags.join(" ") : "");
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

  const parseHashtags = (input: string) =>
    Array.from(
      new Set(
        String(input || "")
          .split(/[\s,;\n\r\t]+/g)
          .map((tag) => tag.trim().replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, ""))
          .filter(Boolean)
      )
    ).slice(0, 20);

  const onPublish = async () => {
    if (saving) return;
    setGenError("");

    if (!selectedChannels.length) {
      setGenError("Sélectionnez au moins 1 canal.");
      return;
    }

    const finalTitle = title.trim();
    const finalContent = content.trim();
    const finalCta = cta.trim();

    if (!finalContent) {
      setGenError("Le contenu est vide.");
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

      const post: GeneratedPost = {
        title: finalTitle,
        content: finalContent,
        cta: finalCta,
        hashtags: parseHashtags(hashtagsText),
      };

      await trackEvent("publish", {
        idea: idea.trim(),
        channels: selectedChannels,
        post,
        images: imagePayloads,
        generated: generated || null,
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
        <div className={styles.blockTitle} style={{ marginBottom: 8 }}>Votre idée</div>
        <div className={styles.subtitle} style={{ marginBottom: 10 }}>
          Une phrase. Le générateur iNrCy crée une publication unique.
        </div>

        <textarea
          placeholder="Ex : Chantier terminé à Arras chez un particulier..."
          style={textAreaStyle}
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
        />

        {genError ? <div style={{ marginTop: 10, fontSize: 13, color: "#ffb4b4" }}>{genError}</div> : null}

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className={styles.primaryBtn} onClick={onGenerate} disabled={generating}>
            {generating ? "Génération..." : "Générer avec iNrCy"}
          </button>
          <button type="button" className={styles.secondaryBtn} onClick={onReset}>Réinitialiser</button>
        </div>
      </div>

      <div className={styles.blockCard}>
        <div className={styles.blockTitle} style={{ marginBottom: 8 }}>Publication (unique)</div>
        <div className={styles.subtitle} style={{ marginBottom: 10 }}>
          {generated ? "Ce même contenu sera publié sur tous les canaux sélectionnés." : "Générez avec iNrCy ou écrivez votre texte, puis publiez sur 1+ canaux."}
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Titre</div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} placeholder="Titre" />
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Contenu</div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              style={{ ...textAreaStyle, minHeight: 160 }}
              placeholder="Contenu"
            />
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>CTA</div>
            <input
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              style={inputStyle}
              placeholder="Ex : Contactez-nous pour un devis"
            />
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Hashtags</div>
            <textarea
              value={hashtagsText}
              onChange={(e) => setHashtagsText(e.target.value)}
              style={{ ...textAreaStyle, minHeight: 90 }}
              placeholder="#Deratisation #Harnes #iNrCy"
            />
            <div style={{ fontSize: 12, opacity: 0.72, marginTop: 6 }}>
              Hashtags proposés pour Instagram. Vous pouvez en ajouter, supprimer ou modifier avant publication.
            </div>
          </div>
        </div>
      </div>

      <div className={styles.blockCard}>
        <div className={styles.blockTitle} style={{ marginBottom: 8 }}>Images</div>
        <div className={styles.subtitle} style={{ marginBottom: 10 }}>
          Ajoutez 1 ou plusieurs images (max 5, 2 Mo chacune).
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
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  style={{ position: "absolute", top: 6, right: 6, padding: "6px 10px", fontSize: 12 }}
                  onClick={() => removeImage(idx)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className={styles.blockCard}>
        <div className={styles.blockTitle} style={{ marginBottom: 8 }}>Canaux</div>
        <div className={styles.subtitle} style={{ marginBottom: 10 }}>
          Publier sur 1 ou plusieurs canaux (même publication).
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          {connected.inrcy_site ? <label style={checkRow}><input type="checkbox" checked={channels.inrcy_site} onChange={() => toggle("inrcy_site")} />Site iNrCy</label> : null}
          {connected.site_web ? <label style={checkRow}><input type="checkbox" checked={channels.site_web} onChange={() => toggle("site_web")} />Site web</label> : null}
          {connected.gmb ? <label style={checkRow}><input type="checkbox" checked={channels.gmb} onChange={() => toggle("gmb")} />Google Business Profile</label> : null}
          {connected.facebook ? <label style={checkRow}><input type="checkbox" checked={channels.facebook} onChange={() => toggle("facebook")} />Facebook</label> : null}
          {connected.instagram ? <label style={checkRow}><input type="checkbox" checked={channels.instagram} onChange={() => toggle("instagram")} />Instagram</label> : null}
          {connected.linkedin ? <label style={checkRow}><input type="checkbox" checked={channels.linkedin} onChange={() => toggle("linkedin")} />LinkedIn</label> : null}
        </div>

        {!connected.inrcy_site && !connected.site_web && !connected.gmb && !connected.facebook && !connected.instagram && !connected.linkedin ? (
          <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>Aucun canal connecté. Va dans le dashboard → Canaux → Configurer.</div>
        ) : null}

        <div style={{ marginTop: 12, display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" className={styles.primaryBtn} onClick={onPublish} disabled={saving}>
            {saving ? "Publication..." : "Publier"}
          </button>
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
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.04)",
  color: "inherit",
  padding: "0 14px",
  outline: "none",
};

const checkRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minHeight: 42,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.03)",
  padding: "0 12px",
};
