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

export default function TiktokPanel(props: any) {
  const {
    tiktokConnected,
    tiktokUsername,
    tiktokProfileUrl,
    setTiktokProfileUrl,
    tiktokProfileUrlNotice,
    tiktokProfileUrlError,
    tiktokLoading,
    connectTiktokMock,
    disconnectTiktokMock,
    saveTiktokProfileUrl,
  } = props;

  const statusLabel = tiktokConnected ? "Connecté" : "À connecter";
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
          Connexion officielle TikTok : le pro autorise son compte via Login Kit, puis iNrCy conserve les jetons chiffrés côté serveur.
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
                {tiktokLoading ? "Chargement..." : "Reconnecter TikTok"}
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
          <div className={styles.blockTitle}>Publication TikTok</div>
        </div>
        <div className={styles.blockSub}>
          Les paramètres sensibles TikTok ne sont pas enregistrés ici. À chaque publication depuis Booster, iNrCy demandera la visibilité, les interactions et les déclarations nécessaires avant l’envoi.
        </div>
      </div>
    </div>
  );
}
