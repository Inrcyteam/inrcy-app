"use client";

import styles from "../dashboard.module.css";
import ConnectionPill from "./ConnectionPill";
import StatusMessage from "./StatusMessage";

const cardStyle = {
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.03)",
  borderRadius: 14,
  padding: 12,
  display: "grid",
  gap: 10,
} as const;

const inputStyle = {
  width: "100%",
  minWidth: 0,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(15,23,42,0.65)",
  colorScheme: "dark" as const,
  padding: "10px 12px",
  color: "white",
  outline: "none",
} as const;

const selectStyle = {
  ...inputStyle,
  background: "rgba(15,23,42,0.95)",
} as const;

const switchRowStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
  alignItems: "stretch",
} as const;

function PreferenceToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(15,23,42,0.45)",
        borderRadius: 12,
        padding: "10px 12px",
        color: "rgba(255,255,255,0.92)",
        fontSize: 14,
      }}
    >
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

export default function TiktokPanel(props: any) {
  const {
    tiktokConnected,
    tiktokUsername,
    tiktokProfileUrl,
    setTiktokProfileUrl,
    tiktokProfileUrlNotice,
    tiktokProfileUrlError,
    tiktokSettingsNotice,
    tiktokSettingsError,
    tiktokLoading,
    connectTiktokMock,
    disconnectTiktokMock,
    saveTiktokProfileUrl,
    tiktokPreferredMedia,
    setTiktokPreferredMedia,
    tiktokAllowComments,
    setTiktokAllowComments,
    tiktokAllowDuo,
    setTiktokAllowDuo,
    tiktokAllowStitch,
    setTiktokAllowStitch,
    tiktokPhotoAutoMusic,
    setTiktokPhotoAutoMusic,
    tiktokCommercialContent,
    setTiktokCommercialContent,
    tiktokAiContent,
    setTiktokAiContent,
    saveTiktokDefaults,
  } = props;

  const statusLabel = tiktokConnected ? "Connecté (mock local)" : "À connecter";
  const statusColor = tiktokConnected ? "rgba(34,197,94,0.95)" : "rgba(148,163,184,0.9)";

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(15,23,42,0.65)",
            padding: "8px 10px",
            borderRadius: 999,
            color: "rgba(255,255,255,0.92)",
            fontSize: 13,
          }}
        >
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: statusColor }} />
          Statut : <strong>{statusLabel}</strong>
        </span>
      </div>

      <div style={cardStyle}>
        <div className={styles.blockHeaderRow}>
          <div className={styles.blockTitle}>Compte TikTok</div>
          <ConnectionPill connected={tiktokConnected} />
        </div>
        <div className={styles.blockSub}>
          Étape 2 locale : le compte TikTok mock est maintenant branché sur des endpoints internes et sauvegardé dans les réglages.
        </div>

        <input
          value={tiktokConnected ? tiktokUsername : ""}
          readOnly
          placeholder={tiktokConnected ? "Compte connecté" : "Aucun compte connecté"}
          style={{ ...inputStyle, opacity: tiktokConnected ? 1 : 0.8 }}
        />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {!tiktokConnected ? (
            <button type="button" className={`${styles.actionBtn} ${styles.connectBtn}`} onClick={() => void connectTiktokMock?.()} disabled={tiktokLoading}>
              {tiktokLoading ? "Connexion..." : "Connecter TikTok"}
            </button>
          ) : (
            <>
              <button type="button" className={`${styles.actionBtn} ${styles.secondaryBtn}`} onClick={() => void connectTiktokMock?.()} disabled={tiktokLoading}>
                {tiktokLoading ? "Chargement..." : "Recharger le mock"}
              </button>
              <button type="button" className={`${styles.actionBtn} ${styles.disconnectBtn}`} onClick={() => void disconnectTiktokMock?.()} disabled={tiktokLoading}>
                {tiktokLoading ? "Déconnexion..." : "Déconnecter"}
              </button>
            </>
          )}
        </div>
      </div>

      <div style={cardStyle}>
        <div className={styles.blockHeaderRow}>
          <div className={styles.blockTitle}>Lien du compte</div>
          <ConnectionPill connected={Boolean(tiktokConnected && tiktokProfileUrl?.trim())} />
        </div>
        <div className={styles.blockSub}>
          Lien public du compte TikTok utilisé pour le bouton <strong>Voir le compte</strong> dans la bulle du dashboard.
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <input
            value={tiktokProfileUrl}
            onChange={(event) => setTiktokProfileUrl(event.target.value)}
            placeholder="https://www.tiktok.com/@moncompte"
            style={inputStyle}
          />

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className={`${styles.actionBtn} ${styles.connectBtn}`} onClick={() => void saveTiktokProfileUrl?.()} disabled={tiktokLoading}>
              {tiktokLoading ? "Enregistrement..." : "Enregistrer"}
            </button>
            <a
              href={tiktokProfileUrl || "#"}
              target="_blank"
              rel="noreferrer"
              className={`${styles.actionBtn} ${styles.viewBtn}`}
              style={{ pointerEvents: tiktokProfileUrl ? "auto" : "none", opacity: tiktokProfileUrl ? 1 : 0.5 }}
            >
              Voir le compte
            </a>
          </div>
        </div>

        {tiktokProfileUrlNotice ? <StatusMessage variant="success">{tiktokProfileUrlNotice}</StatusMessage> : null}
        {tiktokProfileUrlError ? <StatusMessage variant="error">{tiktokProfileUrlError}</StatusMessage> : null}
      </div>

      <div style={cardStyle}>
        <div className={styles.blockHeaderRow}>
          <div className={styles.blockTitle}>Réglages TikTok par défaut</div>
          <ConnectionPill connected={tiktokConnected} />
        </div>
        <div className={styles.blockSub}>
          Ces préférences serviront plus tard dans Booster pour accélérer la publication TikTok photo et vidéo.
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span className={styles.blockSub} style={{ opacity: 0.92 }}>Format prioritaire si photos + vidéo</span>
            <select value={tiktokPreferredMedia} onChange={(event) => setTiktokPreferredMedia(event.target.value)} style={selectStyle}>
              <option value="video">Vidéo</option>
              <option value="photos">Photos</option>
            </select>
          </label>

          <div style={switchRowStyle}>
            <PreferenceToggle label="Commentaires autorisés" checked={tiktokAllowComments} onChange={setTiktokAllowComments} />
            <PreferenceToggle label="Duo autorisé" checked={tiktokAllowDuo} onChange={setTiktokAllowDuo} />
            <PreferenceToggle label="Stitch autorisé" checked={tiktokAllowStitch} onChange={setTiktokAllowStitch} />
            <PreferenceToggle label="Musique auto sur les photos" checked={tiktokPhotoAutoMusic} onChange={setTiktokPhotoAutoMusic} />
            <PreferenceToggle label="Contenu généré par IA" checked={tiktokAiContent} onChange={setTiktokAiContent} />
          </div>

          <label style={{ display: "grid", gap: 6 }}>
            <span className={styles.blockSub} style={{ opacity: 0.92 }}>Contenu commercial</span>
            <select value={tiktokCommercialContent} onChange={(event) => setTiktokCommercialContent(event.target.value)} style={selectStyle}>
              <option value="none">Aucun</option>
              <option value="self">Ma propre activité / ma marque</option>
              <option value="branded">Partenariat rémunéré</option>
            </select>
          </label>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className={`${styles.actionBtn} ${styles.connectBtn}`} onClick={() => void saveTiktokDefaults?.()} disabled={tiktokLoading}>
              {tiktokLoading ? "Enregistrement..." : "Enregistrer mes réglages"}
            </button>
          </div>
        </div>

        {tiktokSettingsNotice ? <StatusMessage variant="success">{tiktokSettingsNotice}</StatusMessage> : null}
        {tiktokSettingsError ? <StatusMessage variant="error">{tiktokSettingsError}</StatusMessage> : null}
      </div>
    </div>
  );
}
