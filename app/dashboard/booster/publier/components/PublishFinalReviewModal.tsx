import type { ChannelKey } from "../publishModal.shared";

export type PublishFinalReviewItem = {
  channel: ChannelKey;
  label: string;
  imageCount: number;
  warnings: string[];
  blockers: string[];
  hasContent: boolean;
  hasTitle: boolean;
  hasText: boolean;
  hasImage: boolean;
};

type PublishModalStyles = Readonly<Record<string, string>>;

type PublishFinalReviewModalProps = {
  open: boolean;
  styles: PublishModalStyles;
  items: PublishFinalReviewItem[];
  showSiteNotice: boolean;
  hasBlockers: boolean;
  isMobile: boolean;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export default function PublishFinalReviewModal({
  open,
  styles,
  items,
  showSiteNotice,
  hasBlockers,
  isMobile,
  saving,
  onClose,
  onConfirm,
}: PublishFinalReviewModalProps) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10012,
        background: "rgba(4, 8, 18, 0.74)",
        backdropFilter: "blur(8px)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        overflowY: "auto",
        overscrollBehavior: "contain",
      }}
    >
      <div
        className={styles.blockCard}
        style={{
          width: "min(760px, 100%)",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          display: "grid",
          gap: 16,
          background: "#111827",
          backgroundImage: "none",
          border: "1px solid rgba(148, 163, 184, 0.28)",
          boxShadow: "0 30px 90px rgba(0,0,0,0.62)",
          backdropFilter: "none",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 22 }}>✅</div>
            <div className={styles.blockTitle} style={{ marginBottom: 0 }}>
              Vérification avant publication
            </div>
            <div
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.72)",
                lineHeight: 1.5,
              }}
            >
              Contrôlez les canaux, les images et les alertes avant l’envoi
              final.
            </div>
          </div>
          <div
            style={{
              fontSize: 12,
              padding: "7px 10px",
              borderRadius: 999,
              background: "rgba(76,195,255,0.10)",
              border: "1px solid rgba(76,195,255,0.22)",
              color: "rgba(255,255,255,0.86)",
            }}
          >
            {items.length} canal(aux) sélectionné(s)
          </div>
        </div>

        {showSiteNotice ? (
          <div
            style={{
              borderRadius: 14,
              padding: 12,
              background: "rgba(76,195,255,0.08)",
              border: "1px solid rgba(76,195,255,0.18)",
              color: "rgba(255,255,255,0.82)",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            Site iNrCy et Site web ont des images ou un ordre différent :
            c’est normal, les deux canaux sont indépendants.
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 10 }}>
          {items.map((item) => {
            const hasAlerts = item.warnings.length || item.blockers.length;
            return (
              <div
                key={item.channel}
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile
                    ? "1fr"
                    : "minmax(140px, 0.8fr) minmax(120px, 0.55fr) minmax(0, 1.4fr)",
                  gap: 10,
                  alignItems: "center",
                  borderRadius: 16,
                  padding: 12,
                  background: "rgba(255,255,255,0.04)",
                  border: item.blockers.length
                    ? "1px solid rgba(248,113,113,0.34)"
                    : hasAlerts
                      ? "1px solid rgba(251,191,36,0.26)"
                      : "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div style={{ minWidth: 0, display: "grid", gap: 5 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontWeight: 900, color: "#fff" }}>
                      {item.label}
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 900,
                        padding: "4px 7px",
                        borderRadius: 999,
                        background: item.blockers.length
                          ? "rgba(248,113,113,0.14)"
                          : item.warnings.length
                            ? "rgba(251,191,36,0.14)"
                            : "rgba(34,197,94,0.14)",
                        color: item.blockers.length
                          ? "#fecaca"
                          : item.warnings.length
                            ? "#fde68a"
                            : "#bbf7d0",
                        border: item.blockers.length
                          ? "1px solid rgba(248,113,113,0.25)"
                          : item.warnings.length
                            ? "1px solid rgba(251,191,36,0.25)"
                            : "1px solid rgba(34,197,94,0.25)",
                      }}
                    >
                      {item.blockers.length
                        ? "Bloquant"
                        : item.warnings.length
                          ? "À vérifier"
                          : "Prêt"}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "rgba(255,255,255,0.58)",
                    }}
                  >
                    Canal sélectionné
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontSize: 12,
                      padding: "6px 9px",
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.07)",
                      color: "rgba(255,255,255,0.84)",
                    }}
                  >
                    {item.imageCount
                      ? `${item.imageCount} image${item.imageCount > 1 ? "s" : ""}`
                      : "Aucune image"}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      padding: "6px 9px",
                      borderRadius: 999,
                      background: item.hasContent
                        ? "rgba(34,197,94,0.12)"
                        : "rgba(251,191,36,0.12)",
                      color: item.hasContent ? "#bbf7d0" : "#fde68a",
                    }}
                  >
                    {item.hasContent ? "Texte OK" : "Texte vide"}
                  </span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gap: 6,
                    fontSize: 12,
                    lineHeight: 1.45,
                  }}
                >
                  {!hasAlerts ? (
                    <span style={{ color: "#bbf7d0" }}>
                      Prêt à publier.
                    </span>
                  ) : null}
                  {item.warnings.map((warning) => (
                    <span key={warning} style={{ color: "#fde68a" }}>
                      ⚠️ {warning}
                    </span>
                  ))}
                  {item.blockers.map((blocker) => (
                    <span key={blocker} style={{ color: "#fecaca" }}>
                      ⛔ {blocker}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {hasBlockers ? (
          <div
            style={{
              borderRadius: 14,
              padding: 12,
              background: "rgba(248,113,113,0.10)",
              border: "1px solid rgba(248,113,113,0.24)",
              color: "#fecaca",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            Corrigez les points bloquants avant de publier.
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            flexWrap: "wrap",
            position: "sticky",
            bottom: -1,
            paddingTop: 4,
            background: "#111827",
          }}
        >
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={onClose}
          >
            Retour modifier
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={onConfirm}
            disabled={hasBlockers || saving}
            style={{ opacity: hasBlockers || saving ? 0.58 : 1 }}
          >
            {saving
              ? "Publication en cours..."
              : "Confirmer la publication"}
          </button>
        </div>
      </div>
    </div>
  );
}
