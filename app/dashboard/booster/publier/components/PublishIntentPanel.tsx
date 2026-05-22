import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { THEME_PLACEHOLDERS, type ThemeKey } from "../publishModal.shared";
import { textAreaStyle } from "../publishModal.styles";

type PublishModalStyles = Readonly<Record<string, string>>;

type PublishIntentPanelProps = {
  styles: PublishModalStyles;
  isMobile: boolean;
  theme: ThemeKey;
  idea: string;
  setIdea: Dispatch<SetStateAction<string>>;
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  onImagesChange: (files: FileList | null) => void;
  onPickImagesClick: () => void;
  images: File[];
  imagePreviews: string[];
  removeImage: (index: number) => void;
  useImagesForAI: boolean;
  setUseImagesForAI: Dispatch<SetStateAction<boolean>>;
  imgError: string;
  genError: string;
  generating: boolean;
  generationStage: string;
  generationProgress: number;
  onGenerate: () => void;
  onReset: () => void;
  onOpenAiConfiguration: () => void;
};

export default function PublishIntentPanel({
  styles,
  isMobile,
  theme,
  idea,
  setIdea,
  fileInputRef,
  onImagesChange,
  onPickImagesClick,
  images,
  imagePreviews,
  removeImage,
  useImagesForAI,
  setUseImagesForAI,
  imgError,
  genError,
  generating,
  generationStage,
  generationProgress,
  onGenerate,
  onReset,
  onOpenAiConfiguration,
}: PublishIntentPanelProps) {
  return (
    <div
      className={styles.blockCard}
      style={{ minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        <div className={styles.blockTitle}>Votre intention</div>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={onOpenAiConfiguration}
          style={{
            minHeight: 34,
            padding: "7px 12px",
            fontSize: 12,
            fontWeight: 900,
            whiteSpace: "nowrap",
          }}
        >
          ⚙️ Configuration IA
        </button>
      </div>
      <div
        className={styles.subtitle}
        style={{ marginBottom: 10, maxWidth: "none", whiteSpace: "normal" }}
      >
        Décrivez votre idée. Ajoutez des images pour aider iNrCy à rédiger un contenu plus précis.
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>
            Phrase libre
          </div>
          <textarea
            placeholder={THEME_PLACEHOLDERS[theme] || THEME_PLACEHOLDERS[""]}
            style={textAreaStyle}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
          />
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: isMobile ? 7 : 8,
            minWidth: 0,
            padding: isMobile ? "8px 10px" : "10px 12px",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.035)",
            overflow: "visible",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={onPickImagesClick}
            disabled={images.length >= 5}
            title={images.length >= 5 ? "5 images maximum" : undefined}
            style={{
              flex: "0 0 auto",
              minHeight: isMobile ? 32 : 34,
              padding: isMobile ? "6px 9px" : "7px 12px",
              fontSize: isMobile ? 11 : 12,
              whiteSpace: "nowrap",
              opacity: images.length >= 5 ? 0.48 : 1,
              filter: images.length >= 5 ? "grayscale(1)" : undefined,
              cursor: images.length >= 5 ? "not-allowed" : "pointer",
            }}
          >
            + Ajouter des images
          </button>
          {imagePreviews.length ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: isMobile ? 6 : 7,
                minWidth: 0,
                overflow: "visible",
                flexWrap: "wrap",
              }}
            >
              {imagePreviews.map((url, index) => (
                <div
                  key={`${url}-${index}`}
                  title={images[index]?.name || `Image ${index + 1}`}
                  style={{
                    position: "relative",
                    width: isMobile ? 38 : 48,
                    height: isMobile ? 38 : 48,
                    flex: "0 0 auto",
                    borderRadius: 10,
                    overflow: "hidden",
                    border: "1px solid rgba(255,255,255,0.20)",
                    background: "rgba(255,255,255,0.06)",
                  }}
                >
                  <img
                    src={url}
                    alt={`Image ${index + 1}`}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                  <button
                    type="button"
                    aria-label={`Supprimer l’image ${index + 1}`}
                    onClick={() => removeImage(index)}
                    style={{
                      position: "absolute",
                      top: 2,
                      right: 2,
                      width: isMobile ? 17 : 18,
                      height: isMobile ? 17 : 18,
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.30)",
                      background: "rgba(10,16,30,0.88)",
                      color: "#fff",
                      display: "grid",
                      placeItems: "center",
                      fontSize: isMobile ? 11 : 12,
                      fontWeight: 900,
                      lineHeight: 1,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <label
            title={
              useImagesForAI
                ? "Les images aideront iNrCy à rédiger un contenu plus précis."
                : "Les images seront utilisées uniquement pour la publication."
            }
            style={{
              flex: "0 0 auto",
              display: "inline-flex",
              alignItems: "center",
              gap: isMobile ? 5 : 7,
              minHeight: isMobile ? 30 : 32,
              padding: isMobile ? "5px 8px" : "6px 10px",
              borderRadius: 999,
              border: useImagesForAI
                ? "1px solid rgba(76,195,255,0.34)"
                : "1px solid rgba(255,255,255,0.14)",
              background: useImagesForAI
                ? "rgba(76,195,255,0.12)"
                : "rgba(255,255,255,0.055)",
              color: useImagesForAI ? "#dff6ff" : "rgba(255,255,255,0.76)",
              fontSize: isMobile ? 10.5 : 12,
              fontWeight: 850,
              whiteSpace: "nowrap",
              cursor: images.length ? "pointer" : "default",
              userSelect: "none",
              opacity: images.length ? 1 : 0.9,
            }}
          >
            <input
              type="checkbox"
              checked={useImagesForAI}
              disabled={!images.length}
              onChange={(event) => setUseImagesForAI(event.target.checked)}
              style={{
                width: isMobile ? 13 : 14,
                height: isMobile ? 13 : 14,
                margin: 0,
                accentColor: "#4cc3ff",
              }}
            />
            {useImagesForAI ? "Images utilisées par l’IA" : "Images hors génération"}
          </label>
          <div
            style={{
              flex: "0 0 auto",
              fontSize: isMobile ? 11 : 12,
              opacity: 0.82,
              whiteSpace: "nowrap",
            }}
          >
            {images.length}/5 image{images.length === 1 ? "" : "s"}
          </div>
        </div>
        {imgError ? (
          <div style={{ fontSize: 13, color: "#ffb4b4" }}>{imgError}</div>
        ) : null}
        {genError ? (
          <div style={{ fontSize: 13, color: "#ffb4b4" }}>{genError}</div>
        ) : null}
        <div style={{ display: "grid", gap: 6, justifyItems: "start" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={onGenerate}
              disabled={generating}
            >
              {generating
                ? `${generationStage || "Génération"} ${generationProgress}%`
                : "Générer avec iNrCy"}
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={onReset}
            >
              Réinitialiser
            </button>
          </div>
          {generating ? (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)" }}>
              {images.length && useImagesForAI
                ? "iNrCy analyse l’intention et les images, puis prépare les variantes par canal."
                : "iNrCy prépare les variantes adaptées à chaque canal."}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
