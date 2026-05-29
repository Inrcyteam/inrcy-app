import type { Dispatch, SetStateAction } from "react";
import {
  ChannelPublicationPreview,
  type PublicationPreview,
} from "@/app/dashboard/_components/ChannelImageAdapterTool";
import { pillBtn } from "../publishModal.styles";
import type { ChannelKey } from "../publishModal.shared";

type PublishModalStyles = Readonly<Record<string, string>>;

type PreviewReadinessTab = {
  key: ChannelKey;
  label: string;
  tone: "ready" | "warning" | "blocked";
};

type PublishPreviewPanelProps = {
  styles: PublishModalStyles;
  isMobile: boolean;
  activePublicationPreview: PublicationPreview | null;
  previewReadinessTabs: PreviewReadinessTab[];
  activeImageChannel: ChannelKey;
  showPublicationPreview: boolean;
  setShowPublicationPreview: Dispatch<SetStateAction<boolean>>;
  setSynchronizedActiveChannel: (channel: ChannelKey) => void;
};

export default function PublishPreviewPanel({
  styles,
  isMobile,
  activePublicationPreview,
  previewReadinessTabs,
  activeImageChannel,
  showPublicationPreview,
  setShowPublicationPreview,
  setSynchronizedActiveChannel,
}: PublishPreviewPanelProps) {
  if (!activePublicationPreview) return null;

  return (
    <div
      className={styles.blockCard}
      style={{
        minWidth: 0,
        maxWidth: "100%",
        boxSizing: "border-box",
        display: "grid",
        gap: showPublicationPreview ? 12 : 0,
      }}
    >
      <div
        style={{
          display: isMobile ? "grid" : "flex",
          gridTemplateColumns: isMobile ? "1fr" : undefined,
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: isMobile ? undefined : "wrap",
        }}
      >
        <div style={{ minWidth: 0, width: isMobile ? "100%" : undefined }}>
          <div className={styles.blockTitle} style={{ marginBottom: 4 }}>
            Aperçu
          </div>
          <div
            className={styles.subtitle}
            style={{
              display: isMobile ? "grid" : "flex",
              gridTemplateColumns: isMobile
                ? "repeat(2, minmax(0, 1fr))"
                : undefined,
              gap: 6,
              flexWrap: isMobile ? undefined : "wrap",
              overflowX: "hidden",
              width: "100%",
              maxWidth: "100%",
              paddingBottom: 2,
              marginBottom: 0,
            }}
          >
            {previewReadinessTabs.map((tab) => {
              const previewStatusStyle =
                tab.tone === "ready"
                  ? {
                      border: "1px solid rgba(34,197,94,0.34)",
                      color: "#bbf7d0",
                      background: "rgba(34,197,94,0.10)",
                    }
                  : tab.tone === "blocked"
                    ? {
                        border: "1px solid rgba(248,113,113,0.34)",
                        color: "#fecaca",
                        background: "rgba(248,113,113,0.10)",
                      }
                    : {
                        border: "1px solid rgba(251,191,36,0.36)",
                        color: "#fde68a",
                        background: "rgba(251,191,36,0.10)",
                      };
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setSynchronizedActiveChannel(tab.key)}
                  title={
                    tab.tone === "ready"
                      ? "Texte + image"
                      : tab.tone === "blocked"
                        ? "Canal vide"
                        : "Texte seul ou image seule"
                  }
                  style={{
                    ...pillBtn,
                    ...previewStatusStyle,
                    ...(activeImageChannel === tab.key
                      ? {
                          border:
                            tab.tone === "ready"
                              ? "2px solid rgba(74,222,128,0.90)"
                              : tab.tone === "blocked"
                                ? "2px solid rgba(248,113,113,0.90)"
                                : "2px solid rgba(250,204,21,0.92)",
                          boxShadow:
                            tab.tone === "ready"
                              ? "0 0 0 1px rgba(74,222,128,0.26) inset, 0 0 0 1px rgba(74,222,128,0.20), 0 0 18px rgba(74,222,128,0.20)"
                              : tab.tone === "blocked"
                                ? "0 0 0 1px rgba(248,113,113,0.26) inset, 0 0 0 1px rgba(248,113,113,0.20), 0 0 18px rgba(248,113,113,0.18)"
                                : "0 0 0 1px rgba(250,204,21,0.26) inset, 0 0 0 1px rgba(250,204,21,0.20), 0 0 18px rgba(250,204,21,0.16)",
                        }
                      : {}),
                    padding: "6px 10px",
                    fontSize: 11,
                    whiteSpace: "nowrap",
                    flex: isMobile ? undefined : "0 0 auto",
                    width: isMobile ? "100%" : undefined,
                    minWidth: 0,
                    minHeight: isMobile ? 32 : undefined,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={() => setShowPublicationPreview((visible) => !visible)}
          aria-expanded={showPublicationPreview}
          style={isMobile ? { width: "100%", justifyContent: "center" } : undefined}
        >
          {showPublicationPreview ? "Masquer" : "Afficher"}
        </button>
      </div>
      {showPublicationPreview ? (
        <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
          <ChannelPublicationPreview preview={activePublicationPreview} />
        </div>
      ) : null}
    </div>
  );
}
