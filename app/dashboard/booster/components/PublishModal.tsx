import { useMemo, useState } from "react";
import stylesDash from "../../dashboard/dashboard.module.css";

export default function PublishModal({ styles, onClose, trackEvent }: { styles: typeof stylesDash; onClose: () => void; trackEvent: (type: "publish", payload: Record<string, any>) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [channels, setChannels] = useState({
    inrcy_site: false,
    site_web: false,
    gmb: false,
    facebook: false,
  });

  const selectedChannels = useMemo(
    () => Object.entries(channels).filter(([, v]) => v).map(([k]) => k),
    [channels]
  );

  const toggle = (key: keyof typeof channels) =>
    setChannels((s) => ({ ...s, [key]: !s[key] }));

  const onPublish = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await trackEvent("publish", { channels: selectedChannels });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className={styles.blockCard}>
        <div className={styles.blockTitle} style={{ marginBottom: 8 }}>
          Votre idée
        </div>
        <div className={styles.subtitle} style={{ marginBottom: 10 }}>
          Une phrase. L’IA crée le contenu.
        </div>

        <textarea
          placeholder="Ex : Chantier terminé à Lille, remplacement chaudière..."
          style={textAreaStyle}
        />

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className={styles.primaryBtn}>
            Générer avec l’IA
          </button>
          <button type="button" className={styles.secondaryBtn}>
            Réinitialiser
          </button>
        </div>
      </div>

      <div className={styles.blockCard}>
        <div className={styles.blockTitle} style={{ marginBottom: 8 }}>
          Canaux
        </div>
        <div className={styles.subtitle} style={{ marginBottom: 10 }}>
          Publier sur 1 ou plusieurs canaux.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <label style={checkRow}><input type="checkbox" checked={channels.inrcy_site} onChange={() => toggle("inrcy_site")} /> Site iNrCy</label>
          <label style={checkRow}><input type="checkbox" checked={channels.site_web} onChange={() => toggle("site_web")} /> Site web</label>
          <label style={checkRow}><input type="checkbox" checked={channels.gmb} onChange={() => toggle("gmb")} /> Google Business Profile</label>
          <label style={checkRow}><input type="checkbox" checked={channels.facebook} onChange={() => toggle("facebook")} /> Facebook</label>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" className={styles.secondaryBtn}>
            Aperçu
          </button>
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

const checkRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.04)",
};
