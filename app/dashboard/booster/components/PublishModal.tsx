import { useEffect, useMemo, useRef, useState } from "react";
import stylesDash from "../../dashboard/dashboard.module.css";

type GeneratedPost = {
  title: string;
  content: string;
  cta: string;
  hashtags?: string[]; // stock interne (non affiché)
};

type ImagePayload = {
  name: string;
  type: string;
  dataUrl: string; // base64
};

export default function PublishModal({
  styles,
  onClose,
  trackEvent,
}: {
  styles: typeof stylesDash;
  onClose: () => void;
  trackEvent: (type: "publish", payload: Record<string, any>) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  const [idea, setIdea] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string>("");

  const [generated, setGenerated] = useState<GeneratedPost | null>(null);

  // Editable fields (publication canon)
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [cta, setCta] = useState("");

  // Images (toujours visibles)
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imgError, setImgError] = useState<string>("");

  const [channels, setChannels] = useState({
    inrcy_site: false,
    site_web: false,
    gmb: false,
    facebook: false,
  });

  // Canaux réellement connectés (piloté par les bulles "Canaux" du dashboard)
  const [connected, setConnected] = useState({
    inrcy_site: true,
    site_web: true,
    gmb: false,
    facebook: false,
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
    () =>
      Object.entries(channels)
        .filter(([k, v]) => v && (connected as any)[k])
        .map(([k]) => k),
    [channels, connected]
  );

  const toggle = (key: keyof typeof channels) =>
    setChannels((s) => ({ ...s, [key]: !s[key] }));

  const onReset = () => {
    setIdea("");
    setGenerated(null);
    setGenError("");
    setTitle("");
    setContent("");
    setCta("");

    // images reset
    imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    setImages([]);
    setImagePreviews([]);
    setImgError("");
  };

  const onGenerate = async () => {
    if (generating) return;
    setGenError("");

    const trimmed = (idea || "").trim();
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

      // Remplit les champs éditables
      setTitle(post.title || "");
      setContent(post.content || "");
      setCta(post.cta || "");
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

    const list = Array.from(files);
    if (!list.length) return;

    const MAX_FILES = 5;
    const MAX_SIZE = 2 * 1024 * 1024; // 2MB

    const picked = list.slice(0, MAX_FILES);
    const tooBig = picked.find((f) => f.size > MAX_SIZE);
    if (tooBig) {
      setImgError("Image trop lourde (max 2 Mo).");
      return;
    }

    // Cleanup previous previews
    imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    const previews = picked.map((f) => URL.createObjectURL(f));

    setImages(picked);
    setImagePreviews(previews);
  };

  const removeImage = (idx: number) => {
    const removed = imagePreviews[idx];
    if (removed) URL.revokeObjectURL(removed);

    setImages((prev) => prev.filter((_, i) => i !== idx));
    setImagePreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
      reader.readAsDataURL(file);
    });
  };

  const onPublish = async () => {
    if (saving) return;

    if (!selectedChannels.length) {
      setGenError("Sélectionnez au moins 1 canal.");
      return;
    }

    const finalTitle = (title || "").trim();
    const finalContent = (content || "").trim();
    const finalCta = (cta || "").trim();

    // Autoriser un publish même sans génération : on exige au moins du contenu
    if (!finalContent) {
      setGenError("Le contenu est vide.");
      return;
    }

    setSaving(true);
    try {
      // Hashtags en stock mais invisibles (future IG)
      const hiddenHashtags = Array.isArray(generated?.hashtags)
        ? generated!.hashtags!.map((h) => String(h || "").trim()).filter(Boolean).slice(0, 6)
        : [];

      const imagePayloads: ImagePayload[] = await Promise.all(
        images.map(async (f) => ({
          name: f.name,
          type: f.type,
          dataUrl: await fileToDataUrl(f),
        }))
      );

      // Sécurité: si l'utilisateur a sélectionné des fichiers, on exige une conversion dataUrl valide
      if (images.length && (!imagePayloads.length || imagePayloads.some((p) => !p.dataUrl?.startsWith("data:")))) {
        setImgError("Impossible de convertir une ou plusieurs images (format non supporté).");
        return;
      }

      const post: GeneratedPost = {
        title: finalTitle,
        content: finalContent,
        cta: finalCta,
        hashtags: hiddenHashtags,
      };

      await trackEvent("publish", {
        idea: (idea || "").trim(),
        channels: selectedChannels,
        post, // ✅ publication canon unique
        images: imagePayloads, // ✅ 1+ images (optionnel)
        generated: generated || null, // audit
      });

      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* IMPORTANT : On ne met plus de header interne.
         Le bandeau noir en haut (Publier / Module Booster / Fermer) est géré par le parent. */}

      {/* IDEE */}
      <div className={styles.blockCard}>
        <div className={styles.blockTitle} style={{ marginBottom: 8 }}>
          Votre idée
        </div>
        <div className={styles.subtitle} style={{ marginBottom: 10 }}>
          Une phrase. L’IA crée une publication unique.
        </div>

        <textarea
          placeholder="Ex : Chantier terminé à Arras chez un particulier..."
          style={textAreaStyle}
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
        />

        {genError ? (
          <div style={{ marginTop: 10, fontSize: 13, color: "#ffb4b4" }}>{genError}</div>
        ) : null}

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className={styles.primaryBtn} onClick={onGenerate} disabled={generating}>
            {generating ? "Génération..." : "Générer avec l’IA"}
          </button>
          <button type="button" className={styles.secondaryBtn} onClick={onReset}>
            Réinitialiser
          </button>
        </div>
      </div>

      {/* PUBLICATION (unique) */}
      {generated ? (
        <div className={styles.blockCard}>
          <div className={styles.blockTitle} style={{ marginBottom: 8 }}>
            Publication (unique)
          </div>
          <div className={styles.subtitle} style={{ marginBottom: 10 }}>
            Ce même contenu sera publié sur tous les canaux sélectionnés.
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Titre</div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={inputStyle}
                placeholder="Titre"
              />
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
          </div>
        </div>
      ) : (
        // Si pas encore généré, on affiche quand même un bloc édition minimal (optionnel)
        <div className={styles.blockCard}>
          <div className={styles.blockTitle} style={{ marginBottom: 8 }}>
            Publication (unique)
          </div>
          <div className={styles.subtitle} style={{ marginBottom: 10 }}>
            Génère avec l’IA ou écris ton texte, puis publie sur 1+ canaux.
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Titre</div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={inputStyle}
                placeholder="Titre"
              />
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
          </div>
        </div>
      )}

      {/* IMAGES : visible tout le temps, au-dessus des canaux */}
      <div className={styles.blockCard}>
        <div className={styles.blockTitle} style={{ marginBottom: 8 }}>
          Images
        </div>
        <div className={styles.subtitle} style={{ marginBottom: 10 }}>
          Ajoutez 1 ou plusieurs images (max 5, 2 Mo chacune).
        </div>

        {/* input caché + bouton joli */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => onImagesChange(e.target.files)}
        />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className={styles.secondaryBtn} onClick={onPickImagesClick}>
            + Ajouter des images
          </button>
          {images.length ? (
            <div style={{ fontSize: 12, opacity: 0.85 }}>
              {images.length} fichier(s) sélectionné(s)
            </div>
          ) : (
            <div style={{ fontSize: 12, opacity: 0.7 }}>Aucune image</div>
          )}
        </div>

        {imgError ? (
          <div style={{ marginTop: 10, fontSize: 13, color: "#ffb4b4" }}>{imgError}</div>
        ) : null}

        {imagePreviews.length ? (
          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {imagePreviews.map((src, idx) => (
              <div key={src} style={{ position: "relative" }}>
                <img
                  src={src}
                  alt={`upload-${idx}`}
                  style={{
                    width: 110,
                    height: 110,
                    objectFit: "cover",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                />
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    padding: "6px 10px",
                    fontSize: 12,
                  }}
                  onClick={() => removeImage(idx)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* CANAUX + PUBLIE */}
      <div className={styles.blockCard}>
        <div className={styles.blockTitle} style={{ marginBottom: 8 }}>
          Canaux
        </div>
        <div className={styles.subtitle} style={{ marginBottom: 10 }}>
          Publier sur 1 ou plusieurs canaux (même publication).
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          {connected.inrcy_site ? (
            <label style={checkRow}>
              <input type="checkbox" checked={channels.inrcy_site} onChange={() => toggle("inrcy_site")} />
              Site iNrCy
            </label>
          ) : null}

          {connected.site_web ? (
            <label style={checkRow}>
              <input type="checkbox" checked={channels.site_web} onChange={() => toggle("site_web")} />
              Site web
            </label>
          ) : null}

          {connected.gmb ? (
            <label style={checkRow}>
              <input type="checkbox" checked={channels.gmb} onChange={() => toggle("gmb")} />
              Google Business Profile
            </label>
          ) : null}

          {connected.facebook ? (
            <label style={checkRow}>
              <input type="checkbox" checked={channels.facebook} onChange={() => toggle("facebook")} />
              Facebook
            </label>
          ) : null}
        </div>

        {!connected.inrcy_site && !connected.site_web && !connected.gmb && !connected.facebook ? (
          <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
            Aucun canal connecté. Va dans le dashboard → Canaux → Configurer.
          </div>
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
  padding: "12px 12px",
  outline: "none",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.04)",
  color: "inherit",
  padding: "10px 12px",
  outline: "none",
};

const checkRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.04)",
};
