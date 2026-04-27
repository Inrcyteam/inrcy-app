"use client";

import styles from "../dashboard.module.css";
import ConnectionPill from "./ConnectionPill";
import StatusMessage from "./StatusMessage";

export default function LinkedinPanel(props: any) {
  const {
    linkedinConnected,
    linkedinAccountConnected,
    linkedinDisplayName,
    connectLinkedinAccount,
    disconnectLinkedinAccount,
    linkedinUrl,
    setLinkedinUrl,
    saveLinkedinProfileUrl,
    linkedinUrlNotice,
    linkedinUrlError,
    setLinkedinUrlNotice,
    linkedinAccountBusy,
    linkedinUrlBusy,
  } = props;

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
              colorScheme: "dark",
              padding: "8px 10px",
              borderRadius: 999,
              color: "rgba(255,255,255,0.92)",
              fontSize: 13,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: linkedinConnected
                  ? "rgba(34,197,94,0.95)"
                  : linkedinAccountConnected
                    ? "rgba(59,130,246,0.95)"
                    : "rgba(148,163,184,0.9)",
              }}
            />
            Statut : <strong>{linkedinConnected ? "Connecté" : linkedinAccountConnected ? "Compte connecté" : "À connecter"}</strong>
          </span>
        </div>

        {/* Compte LinkedIn */}
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.03)",
            borderRadius: 14,
            padding: 12,
            display: "grid",
            gap: 10,
          }}
        >
          <div className={styles.blockHeaderRow}>
            <div className={styles.blockTitle}>Compte connecté</div>
            <ConnectionPill connected={linkedinAccountConnected} />
          </div>
          <div className={styles.blockSub}>Connexion OAuth LinkedIn.</div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={linkedinDisplayName}
              readOnly
              placeholder={linkedinAccountConnected ? "Compte connecté" : "Aucun compte connecté"}
              style={{
                flex: "1 1 280px",
                minWidth: 220,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(15,23,42,0.65)",
                colorScheme: "dark",
                padding: "10px 12px",
                color: "white",
                outline: "none",
                opacity: linkedinAccountConnected ? 1 : 0.8,
              }}
            />

            {!linkedinAccountConnected ? (
              <button type="button" className={`${styles.actionBtn} ${styles.connectBtn}`} onClick={connectLinkedinAccount}>
                Connecter LinkedIn
              </button>
            ) : (
              <button type="button" className={`${styles.actionBtn} ${styles.disconnectBtn}`} onClick={() => void disconnectLinkedinAccount()} disabled={linkedinAccountBusy}>
                {linkedinAccountBusy ? "Déconnexion..." : "Déconnecter LinkedIn"}
              </button>
            )}
          </div>
        </div>


        {/* Lien */}
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.03)",
            borderRadius: 14,
            padding: 12,
            display: "grid",
            gap: 10,
          }}
        >
          <div className={styles.blockHeaderRow}>
            <div className={styles.blockTitle}>Lien du profil</div>
            <ConnectionPill connected={!!linkedinUrl?.trim()} />
          </div>
          <div className={styles.blockSub}>Se remplit si LinkedIn fournit un lien public. Sinon laisse vide.</div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={linkedinUrl}
              onChange={(e) => {
                setLinkedinUrlNotice(null);
                setLinkedinUrl(e.target.value);
              }}
              placeholder="Lien LinkedIn (optionnel)"
              style={{
                flex: "1 1 280px",
                minWidth: 220,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(15,23,42,0.65)",
                colorScheme: "dark",
                padding: "10px 12px",
                color: "white",
                outline: "none",
                opacity: linkedinUrl ? 1 : 0.8,
              }}
            />



    <button
      type="button"
      className={`${styles.actionBtn} ${styles.connectBtn}`}
      onClick={() => void saveLinkedinProfileUrl()}
      disabled={linkedinUrlBusy}
    >
      {linkedinUrlBusy ? "Enregistrement..." : "Enregistrer"}
    </button>

            <a
              href={linkedinUrl || "#"}
              target="_blank"
              rel="noreferrer"
              className={`${styles.actionBtn} ${styles.viewBtn}`}
              style={{ pointerEvents: linkedinUrl ? "auto" : "none", opacity: linkedinUrl ? 1 : 0.5 }}
            >
              Voir
            </a>
          </div>

          {linkedinUrlNotice && <StatusMessage variant="success">{linkedinUrlNotice}</StatusMessage>}
          {linkedinUrlError && <StatusMessage variant="error">{linkedinUrlError}</StatusMessage>}
        </div>
      </div>
  );
}
